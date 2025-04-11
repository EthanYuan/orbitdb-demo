import { createHelia } from "helia";
import { createOrbitDB } from "@orbitdb/core";
import { gossipsub } from "@chainsafe/libp2p-gossipsub";
import { identify } from "@libp2p/identify";
import { createLibp2p } from "libp2p";
import readline from "readline";
import { webSockets } from "@libp2p/websockets";
import { tcp } from "@libp2p/tcp";
import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@chainsafe/libp2p-yamux";
import { CID } from "multiformats/cid";
import { LevelBlockstore } from "blockstore-level";
import { mdns } from "@libp2p/mdns";
import { bootstrap } from "@libp2p/bootstrap";

const Libp2pOptions = {
  peerDiscovery: [
    mdns(),
    bootstrap({
      list: [
        // PUBLIC_BOOTSTRAP
        "/ip4/35.220.212.56/tcp/4001/p2p/12D3KooWJ6MTkNM8Bu8DzNiRm1GY3Wqh8U8Pp1zRWap6xY3MvsNw",

        // IPFS_OFFICIAL_BOOTSTRAPS
        "/dnsaddr/va1.bootstrap.libp2p.io/p2p/12D3KooWKnDdG3iXw9eTFijk3EWSunZcFi54Zka4wmtqtt6rPxc8",
        "/ip4/104.131.131.82/tcp/4001/p2p/QmaCpDMGvV2BGHeYERUEnRQAwe3N8SzbUtfsmvsqQLuvuJ",
        "/ip4/104.131.131.82/udp/4001/quic-v1/p2p/QmaCpDMGvV2BGHeYERUEnRQAwe3N8SzbUtfsmvsqQLuvuJ",
        "/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN",
        "/dnsaddr/bootstrap.libp2p.io/p2p/QmQCU2EcMqAqQPR2i9bChDtGNJchTbq5TbXJJ16u19uLTa",
        "/dnsaddr/bootstrap.libp2p.io/p2p/QmbLHAnMoJPWSCR5Zhtx6BHJX9KiKNN6tpvbUcqanj75Nb",
        "/dnsaddr/bootstrap.libp2p.io/p2p/QmcZf59bWwK5XFi76CZX8cbJ4BhTzzA3gU1ZjYZcYW3dwt",

        // LIBP2P_BOOTSTRAP
        "/dnsaddr/bootstrap.libp2p.io/p2p/12D3KooWQiJMV63WiHBbmdZr3jPrr7ZrH1WAM5VTiZ7bSk2fwzvm",
        "/dnsaddr/bootstrap.libp2p.io/p2p/12D3KooWEzx6rCWrb1R3dAk6urW6X1XH3NwQZz9fktZu4rhQa3j3",
        "/dnsaddr/bootstrap.libp2p.io/p2p/12D3KooWD71WtxGTVKa2EgaX21kh2RXHHyNwX6u1k7bTWbtSA3UQ",
        "/dnsaddr/bootstrap.libp2p.io/p2p/12D3KooWEtp8K2npfkiZBVG1ELvLyBrHrA4rdToZ5znniS6T7Gbn",
      ],
      interval: 10000, // 默认10s查一次
    }),
  ],
  transports: [tcp(), webSockets()],
  connectionEncrypters: [noise()],
  streamMuxers: [yamux()],
  addresses: {
    listen: ["/ip4/0.0.0.0/tcp/4002", "/ip4/0.0.0.0/tcp/0/ws"],
  },
  services: {
    pubsub: gossipsub({
      // neccessary to run a single peer
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

(async function () {
  const ipfs = await initIPFSInstance("./ipfs1");
  const id = await ipfs.libp2p.peerId;
  const addresses = ipfs.libp2p.getMultiaddrs();

  console.log(`🆔 [Node1] Peer ID: ${id.toString()}`);
  console.log("🌐 可连接地址:");
  addresses.forEach((addr) => {
    console.log(`  - ${addr.toString()}`);
  });

  const orbitdb = await createOrbitDB({
    ipfs,
    directory: "./orbitdb-node1",
  });

  // Create / Open a database. Defaults to db type "events".
  const db = await orbitdb.open("hello");

  const address = db.address;
  console.log("📡 [Node1] OrbitDB 地址:", address.toString());
  const cidStr = CID.parse(address.toString().split("/")[2]);
  console.log("🧾 [Node1] Manifest CID:", cidStr || "❌ 无法解析");
  // "/orbitdb/zdpuAkstgbTVGHQmMi5TC84auhJ8rL5qoaNEtXo2d5PHXs2To"
  // The above address can be used on another peer to open the same database

  // Add an entry
  console.log("📌 准备写入数据 world");
  const hash = await db.add("world");
  console.log("📌 写入数据 hash:", hash);

  // Query
  console.log("📦 [Node1] 当前数据记录:");
  for await (const record of db.iterator()) {
    console.log(record);
  }

  // Listen for updates from peers
  db.events.on("update", async (entry) => {
    console.log("\n📥 [Node1] 收到新条目:", entry);
    const all = await db.all();
    console.log("📦 [Node1] 当前数据:", all);
  });

  setInterval(async () => {
    const peers = ipfs.libp2p.getConnections();
    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);
    process.stdout.write(`🔌 [Node1] 当前连接 Peer 数: ${peers.length}`);
  }, 3000);
})();
