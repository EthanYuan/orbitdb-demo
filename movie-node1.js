import { createOrbitDB } from "@orbitdb/core";
import readline from "readline";
import { CID } from "multiformats/cid";
import { initIPFSInstance } from "./ipfs/init.js";
import { MovieMetadataStore } from "./movie-metadata-store.js";

const sampleMovie1 = {
  _id: "zdpuAkstgbTVGHQmMi5TC84auhJ8rL5qoaNEtXo2d5PHXs2T1", // cid
  title: { en: "Inception", zh: "盗梦空间" },
  year: 2010,
  genre: { en: ["Sci-Fi", "Action", "Thriller"], zh: ["科幻", "动作", "惊悚"] },
  director: { en: ["Christopher Nolan"], zh: ["克里斯托弗·诺兰"] },
  actors: {
    en: ["Leonardo DiCaprio", "Joseph Gordon-Levitt"],
    zh: ["莱昂纳多·迪卡普里奥", "约瑟夫·高登-莱维特"],
  },
  plot_summary: {
    en: "A thief who steals corporate secrets through the use of dream-sharing technology...",
    zh: "一个利用梦境共享技术盗取公司机密的盗贼...",
  },
  keywords: {
    en: ["dream", "heist", "subconscious"],
    zh: ["盗梦", "空间", "潜意识"],
  },
  language: ["English", "Japanese", "French"],
  country: { en: ["USA", "UK"], zh: ["美国", "英国"] },
  rating: 8.4,
  source_info: { name: "TMDb", id: "27205" },
  imdb_id: "tt1375666",
  imdb_rating: 8.8,
  added_timestamp_ms: Date.now(),
};

const sampleMovie2 = {
  _id: "zdpuAkstgbTVGHQmMi5TC84auhJ8rL5qoaNEtXo2d5PHXs2T2", // cid
  title: { en: "The Dark Knight", zh: "蝙蝠侠：黑暗骑士" },
  year: 2008,
  genre: { en: ["Action", "Crime", "Drama"], zh: ["动作", "犯罪", "剧情"] },
  director: { en: ["Christopher Nolan"], zh: ["克里斯托弗·诺兰"] },
  actors: {
    en: ["Christian Bale", "Heath Ledger", "Aaron Eckhart"],
    zh: ["克里斯蒂安·贝尔", "希斯·莱杰", "艾伦·艾克哈特"],
  },
  plot_summary: {
    en: "When the menace known as the Joker wreaks havoc...",
    zh: "当被称为小丑的威胁在哥谭市制造混乱...",
  },
  keywords: {
    en: ["joker", "gotham", "batman", "vigilante"],
    zh: ["小丑", "哥谭", "蝙蝠侠"],
  },
  language: ["English"],
  country: { en: ["USA", "UK"], zh: ["美国", "英国"] },
  rating: 9.0,
  source_info: { name: "IMDb", id: "tt0468569" },
  imdb_id: "tt0468569",
  imdb_rating: 9.0,
  added_timestamp_ms: Date.now(),
};

// 全局变量用于信号处理时访问 store
let globalStoreInstance = null;

(async function () {
  // 1. get Helia 实例
  const ipfs = await initIPFSInstance("./ipfs-movie", 5002, 5003);
  const id = await ipfs.libp2p.peerId;
  const addresses = ipfs.libp2p.getMultiaddrs();

  console.log(`🆔 [Node1] Peer ID: ${id.toString()}`);
  console.log("🌐 可连接地址:");
  addresses.forEach((addr) => {
    console.log(`  - ${addr.toString()}`);
  });

  // 2. create OrbitDB instance
  const orbitdb = await createOrbitDB({
    ipfs,
    directory: "./orbitdb-movie-node1",
    id: "movie-node1",
  });

  // 3. new and initialize MovieMetadataStore
  console.log("步骤 3: 创建和初始化 MovieMetadataStore...");
  globalStoreInstance = new MovieMetadataStore(ipfs, orbitdb);
  await globalStoreInstance.initialize("movies"); // 使用配置文件中的数据库名
  console.log(" -> MovieMetadataStore 初始化完成。");

  const address = globalStoreInstance.db.address;
  console.log("📡 [Node1] OrbitDB 地址:", address.toString());
  const cidStr = CID.parse(address.toString().split("/")[2]);
  console.log("🧾 [Node1] Manifest CID:", cidStr || "❌ 无法解析");
  // "/orbitdb/zdpuAkstgbTVGHQmMi5TC84auhJ8rL5qoaNEtXo2d5PHXs2To"
  // The above address can be used on another peer to open the same database

  console.log("\n====================");
  console.log("开始数据库操作示例");
  console.log("====================\n");

  // 4. 添加或更新示例电影
  console.log("[操作 4.1] 添加/更新电影: Inception");
  const addedId1 = await globalStoreInstance.addOrUpdateMovie(sampleMovie1);
  console.log(` -> 完成，文档 _id: ${addedId1}`);

  console.log("[操作 4.2] 添加/更新电影: The Dark Knight");
  const addedId2 = await globalStoreInstance.addOrUpdateMovie(sampleMovie2);
  console.log(` -> 完成，文档 _id: ${addedId2}`);

  // 5. 按 IM Db ID 获取电影
  console.log("\n[操作 5.1] 按 IMDb ID 获取 'Inception' (tt1375666)...");
  // fetchedMovie1 将包含 getMovieByImdbId 返回的电影对象，或者 null
  const fetchedMovie1 = await globalStoreInstance.getMovieByImdbId(
    sampleMovie1.imdb_id,
  );

  // 首先检查 getMovieByImdbId 是否返回了有效对象
  if (fetchedMovie1) {
    // **修正重点：** 使用可选链安全地访问嵌套属性
    const titleEn = fetchedMovie1.title?.en; // 如果 fetchedMovie1.title 不存在，titleEn 会是 undefined

    if (titleEn) {
      // 只有当 titleEn 确实获取到时才打印
      console.log(` -> 找到电影，英文标题: ${titleEn}`);
    } else {
      // 如果没有英文标题，尝试获取中文标题
      const titleZh = fetchedMovie1.title?.zh;
      if (titleZh) {
        console.log(` -> 找到电影，中文标题: ${titleZh}`);
      } else {
        // 如果连中文标题也没有，或者 title 字段本身就缺失
        console.log(
          ` -> 找到电影 (_id: ${fetchedMovie1._id})，但未能获取到预期的标题信息。`,
        );
        // 打印获取到的完整对象，有助于调试数据问题
        console.log(
          "   -> 获取到的数据详情:",
          JSON.stringify(fetchedMovie1, null, 2),
        );
      }
    }
  } else {
    // getMovieByImdbId 返回了 null，表示在数据库中未找到
    console.log(" -> 未找到该电影。");
  }

  console.log("[操作 5.2] 按无效 IMDb ID 获取...");
  const nonExistentMovie =
    await globalStoreInstance.getMovieByImdbId("tt0000000");
  // 这个调用应该会在 getMovieByImdbId 内部打印 "未找到..." 并返回 null，所以 index.js 中不需要额外处理 null 情况

  // 6. 搜索电影
  console.log("\n[操作 6.1] 按中文标题搜索 '空间':");
  const searchResult1 = await globalStoreInstance.searchMoviesByTitle(
    "空间",
    "zh",
  );
  console.log(
    ` -> 找到 ${searchResult1.length} 条结果:`,
    searchResult1.map((movie) => movie.title.zh),
  );

  console.log("\n[操作 6.2] 按英文标题搜索 'Dark Knight':");
  const searchResult2 = await globalStoreInstance.searchMoviesByTitle(
    "Dark Knight",
    "en",
  );
  console.log(
    ` -> 找到 ${searchResult2.length} 条结果:`,
    searchResult2.map((movie) => movie.title.en),
  );

  console.log("\n[操作 6.3] 按中文关键词搜索 '小丑':");
  const searchResult3 = await globalStoreInstance.searchMoviesByKeyword(
    "小丑",
    "zh",
  );
  console.log(
    ` -> 找到 ${searchResult3.length} 条结果:`,
    searchResult3.map((movie) => movie.title.zh),
  );

  console.log("\n[操作 6.4] 按英文关键词搜索 'Dream':");
  const searchResult4 = await globalStoreInstance.searchMoviesByKeyword(
    "Dream",
    "en",
  );
  console.log(
    ` -> 找到 ${searchResult4.length} 条结果:`,
    searchResult4.map((movie) => movie.title.en),
  );

  // 7. 获取所有电影
  console.log("\n[操作 7] 获取当前所有电影:");
  const allMovies = await globalStoreInstance.getAllMovies();
  console.log(` -> 当前数据库共有 ${allMovies.length} 部电影:`);
  allMovies.forEach((movie) => {
    // 确保访问存在的标题
    const titleDisplay = movie.title?.en || movie.title?.zh || "[无标题]";
    console.log(`   - ${titleDisplay} (_id: ${movie._id})`);
  });

  // 8. 删除电影
  console.log("\n[操作 8.1] 尝试删除 'The Dark Knight' (tt0468569):");
  const deleteHash = await globalStoreInstance.deleteMovieByImdbId(
    sampleMovie2.imdb_id,
  );
  if (deleteHash) {
    console.log(` -> 删除操作完成，哈希: ${deleteHash}`);
  }

  console.log("[操作 8.2] 再次获取所有电影以确认删除:");
  const moviesAfterDelete = await globalStoreInstance.getAllMovies();
  console.log(` -> 删除后数据库共有 ${moviesAfterDelete.length} 部电影:`);
  moviesAfterDelete.forEach((movie) => {
    const titleDisplay = movie.title?.en || movie.title?.zh || "[无标题]";
    console.log(`   - ${titleDisplay} (_id: ${movie._id})`);
  });

  console.log("[操作 8.3] 尝试删除一个不存在的电影 (tt0000000):");
  await globalStoreInstance.deleteMovieByImdbId("tt0000000");

  console.log("\n====================");
  console.log("数据库操作示例结束");
  console.log("====================\n");

  // Query
  console.log("📦 [Node1] 当前数据记录:");
  for await (const record of globalStoreInstance.db.iterator()) {
    console.log(record);
  }

  // Listen for updates from peers
  globalStoreInstance.db.events.on("update", async (entry) => {
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

  // Ctrl+C
  process.on("SIGINT", async () => {
    // Comments changed to English
    console.log("\nReceived SIGINT (Ctrl+C), attempting graceful shutdown...");
    // Attempt to close the store and stop Helia
    if (globalStoreInstance) {
      console.log(" -> (SIGINT) Closing database...");
      try {
        await globalStoreInstance.close();
      } catch (e) {
        // Log error during DB close
        console.error(
          " -> (SIGINT) Error closing database:",
          e instanceof Error ? e.message : e,
        );
      }
    } else {
      console.log(
        " -> (SIGINT) Store instance not available, skipping database close.",
      );
    }

    console.log(" -> (SIGINT) Cleanup attempt finished. Exiting process.");
    // Use a non-zero exit code to indicate the shutdown was due to interruption
    process.exit(1);
  });
})();
