import { createHelia } from "helia";
import { createOrbitDB } from "@orbitdb/core";
import { gossipsub } from "@chainsafe/libp2p-gossipsub";
import { identify } from "@libp2p/identify";
import { createLibp2p } from "libp2p";
import { webSockets } from "@libp2p/websockets";
import { tcp } from "@libp2p/tcp";
import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@chainsafe/libp2p-yamux";
import readline from "readline";
import { multiaddr } from "@multiformats/multiaddr";
import { LevelBlockstore } from "blockstore-level";
import { mdns } from "@libp2p/mdns";

const NODE1_ADDR = multiaddr(
  "/ip4/127.0.0.1/tcp/4002/p2p/12D3KooWBqqpwRVqX3cNxeLMeM69ozZpK5YjFFpWNTPMhKVvooox",
);
const ORBITDB_ADDRESS =
  "/orbitdb/zdpuArNWtbrRaNF82nr9KoLGqmM2bnqkeLL8yFzM84EGq9wZS";

const Libp2pOptions = {
  peerDiscovery: [mdns()],
  transports: [tcp(), webSockets()],
  connectionEncrypters: [noise()],
  streamMuxers: [yamux()],
  addresses: {
    listen: ["/ip4/0.0.0.0/tcp/0", "/ip4/0.0.0.0/tcp/0/ws"],
  },
  services: {
    pubsub: gossipsub({
      allowPublishToZeroTopicPeers: true,
    }),
    identify: identify(),
  },
};

const initIPFSInstance = async (dir) => {
  const blockstore = new LevelBlockstore(dir);
  const libp2p = await createLibp2p(Libp2pOptions);
  return createHelia({ libp2p, blockstore });
};

async function waitForPeers(ipfs, minPeers = 1) {
  return new Promise((resolve) => {
    const interval = setInterval(async () => {
      const peers = ipfs.libp2p.getConnections();
      if (peers.length >= minPeers) {
        console.log(`✅ 已连接到 ${peers.length} 个 peer，继续加载数据库`);
        clearInterval(interval);
        resolve();
      } else {
        console.log(`⌛ 当前连接 Peer 数: ${peers.length}，等待中...`);
      }
    }, 1000);
  });
}

(async function () {
  const ipfs = await initIPFSInstance("./ipfs2");

  try {
    console.log(`🌐 [Node2] 尝试连接到 Node1:`, NODE1_ADDR);
    await ipfs.libp2p.dial(NODE1_ADDR);
    console.log("✅ [Node2] 成功连接到 Node1");
  } catch (err) {
    console.warn("⚠️ [Node2] 无法连接到 Node1:", err.message);
  }

  const id = await ipfs.libp2p.peerId;
  const addresses = ipfs.libp2p.getMultiaddrs();

  console.log(`🆔 [Node2] Peer ID: ${id.toString()}`);
  console.log("🌐 可连接地址:");
  addresses.forEach((addr) => {
    console.log(`  - ${addr.toString()}`);
  });

  // ✅ 等待至少一个 peer 再打开数据库
  await waitForPeers(ipfs, 1);

  const orbitdb = await createOrbitDB({
    ipfs,
    directory: "./orbitdb-node2",
  });

  console.log(`📡 [Node2] 正在根据地址打开远程数据库: ${ORBITDB_ADDRESS}`);
  const db = await orbitdb.open(ORBITDB_ADDRESS);

  db.events.on("update", async (entry) => {
    console.log("\n📥 [Node2] 收到远程新条目:", entry);
    const all = await db.all();
    console.log("📦 [Node2] 当前数据:", all);
  });

  console.log("📦 [Node2] 初始同步数据记录:");
  for await (const record of db.iterator()) {
    console.log(record);
  }

  setInterval(async () => {
    const peers = ipfs.libp2p.getConnections();
    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);
    process.stdout.write(`🔌 [Node2] 当前连接 Peer 数: ${peers.length}`);
  }, 3000);
})();
