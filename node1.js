import { createOrbitDB } from "@orbitdb/core";
import readline from "readline";
import { CID } from "multiformats/cid";
import { initIPFSInstance } from './ipfs/init.js';

(async function () {
  const ipfs = await initIPFSInstance("./ipfs1", 4002, 4003);
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
    id: 'node1'
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
