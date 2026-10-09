// ティア表の事前計算(2026-10-09 — ADR-024)。`pnpm tier` で実行する。
// 仕事(全体の最良 + ★5 1 枚ごとの 3 観点の探索。src/engine/tier.ts の tierJobs)を CPU の数だけの子プロセスで分担し、
// 結果を src/data/tierList.json に書く。TS の読み込みは vite の ssrLoadModule(JSON import と TS をそのまま扱える)。
// 1 枚の探索は 9〜53 秒(単一スレッド)で、全部で 4 コア約 25 分
import { fork } from "node:child_process";
import { availableParallelism } from "node:os";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("../..", import.meta.url));
const out = `${root}src/data/tierList.json`;
const partDir = `${root}node_modules/.tmp/tier`;

async function loadEngine() {
  const server = await createServer({
    root,
    configFile: false,
    logLevel: "error",
    server: { middlewareMode: true, hmr: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  const tier = await server.ssrLoadModule("/src/engine/tier.ts");
  const request = await server.ssrLoadModule("/src/engine/request.ts");
  return { server, tier, request };
}

/** 子プロセス: 分担(index / count)の仕事を順に探索し、結果を part ファイルへ書く */
async function worker(index, count) {
  const { server, tier, request } = await loadEngine();
  const jobs = tier.tierJobs().filter((_, i) => i % count === index);
  const results = [];
  for (const job of jobs) {
    const t = performance.now();
    const r = request.runOptimize(tier.tierJobRequest(job));
    const top = r.candidates[0];
    const team = {
      unitScore: top.display.unitScore,
      leaderId: top.leader.id,
      memberIds: top.members.map((m) => m.id),
    };
    results.push({ job, team });
    writeFileSync(`${partDir}/part-${index}.json`, JSON.stringify(results));
    console.log(
      `[${index}] ${job.kind} ${job.cardId ?? ""} ${team.unitScore} (${Math.round((performance.now() - t) / 1000)}s) ${results.length}/${jobs.length}`,
    );
  }
  await server.close();
}

async function main() {
  const count = Math.max(1, availableParallelism());
  mkdirSync(partDir, { recursive: true });
  await Promise.all(
    Array.from(
      { length: count },
      (_, index) =>
        new Promise((resolve, reject) => {
          const child = fork(
            fileURLToPath(import.meta.url),
            ["--worker", String(index), String(count)],
            {
              stdio: "inherit",
            },
          );
          child.on("exit", (code) =>
            code === 0 ? resolve() : reject(new Error(`worker ${index} exit ${code}`)),
          );
        }),
    ),
  );
  const results = [];
  for (let i = 0; i < count; i++)
    results.push(...JSON.parse(readFileSync(`${partDir}/part-${i}.json`, "utf8")));
  const { server, tier } = await loadEngine();
  const dataset = tier.assembleTierDataset(results);
  writeFileSync(out, `${JSON.stringify(dataset, null, 2)}\n`);
  await server.close();
  console.log(
    `wrote ${out}: ${Object.keys(dataset.cards).length} cards, best ${dataset.best.unitScore}`,
  );
}

const argv = process.argv.slice(2);
if (argv[0] === "--worker") await worker(Number(argv[1]), Number(argv[2]));
else await main();
