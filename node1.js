import {
  createOrbitDB,
  Identities,
  OrbitDBAccessController,
} from "@orbitdb/core";
import readline from "readline";
import { CID } from "multiformats/cid";
import { initIPFSInstance } from "./ipfs/init.js";

(async function () {
  const ipfs = await initIPFSInstance("./ipfs1", 5002, 5003);
  const peer_id = await ipfs.libp2p.peerId;
  const addresses = ipfs.libp2p.getMultiaddrs();

  console.log(`🆔 [Node1] Peer ID: ${peer_id.toString()}`);
  console.log("🌐 可连接地址:");
  addresses.forEach((addr) => {
    console.log(`  - ${addr.toString()}`);
  });

  const id = "node1";
  const identities = await Identities();
  const identity = identities.createIdentity({ id });
  const orbitdb = await createOrbitDB({
    ipfs,
    directory: "./orbitdb-node1",
    id,
  });

  // Create / Open a database. Defaults to db type "events".
  const db = await orbitdb.open("hello", {
    AccessController: OrbitDBAccessController({ write: [orbitdb.identity.id] }),
  });

  // Log db.access to see what it is
  console.log("[Node1] Inspecting db.access:", db.access);
  // Also log the type of db.access and if grant exists
  console.log("[Node1] Type of db.access:", typeof db.access);
  console.log(`[Node1] Type of db.access.write:`, db.access.write);
  if (db.access) {
    console.log("[Node1] Type of db.access.grant:", typeof db.access.grant);
  }

  // Grant write access to another peer
  const node2PublicKey =
    "02493df0898870cd1ef9093403be112e5d72fed5f8a210bdc211e44adf75e901d6"; // 来自 Node2 打印的 identity id
  await db.access.grant("write", node2PublicKey);
  console.log(`[Node1] 已授予 ${node2PublicKey} 写入权限`);

  await printFullAccessController(db);

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

async function printFullAccessController(db) {
  if (!db || !db.access || typeof db.access.capabilities !== "function") {
    console.error(
      "   - Invalid database instance provided for permission check.",
    );
    return;
  }

  try {
    const fullAddress = db.address.toString();
    const dbName = fullAddress.split("/").pop();
    console.log(`\n   --- Access Control List for: ${dbName} ---`);

    // Call the capabilities() function to get the full permission object.
    const capabilitiesObject = await db.access.capabilities();
    const capabilitiesKeys = Object.keys(capabilitiesObject);

    if (capabilitiesKeys.length === 0) {
      console.log("     - No specific capabilities found.");
    } else {
      for (const capability of capabilitiesKeys) {
        const idSet = capabilitiesObject[capability];
        const idArray = [...idSet];

        if (idArray.length > 0) {
          console.log(`     - Capability: '${capability}'`);
          console.log(`       Members: [
         ${idArray.join(",\n         ")}
       ]`);
        }
      }
    }
    console.log("   --------------------------------------------------");
  } catch (e) {
    console.error(
      `   - Error reading permissions for database ${db.address.path}:`,
      e.message,
    );
  }
}
