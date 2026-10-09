// ティア表の事前計算(2026-10-09 — ADR-024)。`pnpm tier` で実行する。
// 仕事(全体の最良 + ★5 1 枚ごとの 3 観点の探索 + 仮想アカウント約 2,650 件のおまかせ探索。src/engine/tier.ts の tierJobs)を
// CPU の数だけの子プロセスで分担し、結果を src/data/tierList.json に書く。TS の読み込みは vite の ssrLoadModule(JSON import と TS をそのまま扱える)。
// カードごとの探索は 9〜53 秒、仮想アカウントは 1〜8 秒(単一スレッド)で、全部で 4 コア約 1 時間。
// `pnpm tier -- --accounts` は仮想アカウントの仕事だけを回し、カードごとの結果はいまの tierList.json から引き継ぐ
// (カードのデータが変わっていないときに、設計(ラウンド数など)だけ変えて作り直す用)。
// `pnpm tier -- --accounts --assemble` は探索せず、残っている中間ファイル(node_modules/.tmp/tier/part-*.json)から組み立て直すだけ
// (集計の規則だけ変えたとき用。中間ファイルは次の実行まで消さない)
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
async function worker(index, count, accountsOnly) {
  const { server, tier, request } = await loadEngine();
  const all = accountsOnly ? tier.tierAccountJobs() : tier.tierJobs();
  const jobs = all.filter((_, i) => i % count === index);
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
    const label =
      job.kind === "account"
        ? `${job.round}-${job.index} (${job.cardIds.length}枚)`
        : (job.cardId ?? "");
    console.log(
      `[${index}] ${job.kind} ${label} ${team.unitScore} (${Math.round((performance.now() - t) / 1000)}s) ${results.length}/${jobs.length}`,
    );
  }
  await server.close();
}

async function main(accountsOnly, assembleOnly) {
  const count = Math.max(1, availableParallelism());
  mkdirSync(partDir, { recursive: true });
  if (!assembleOnly)
    await Promise.all(
      Array.from(
        { length: count },
        (_, index) =>
          new Promise((resolve, reject) => {
            const args = ["--worker", String(index), String(count)];
            if (accountsOnly) args.push("--accounts");
            const child = fork(fileURLToPath(import.meta.url), args, { stdio: "inherit" });
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
  if (accountsOnly) {
    // カードごとの結果はいまのデータから引き継ぐ(全体の最良 + 3 観点)
    const previous = JSON.parse(readFileSync(out, "utf8"));
    results.push({ job: { kind: "best" }, team: previous.best });
    for (const [cardId, rec] of Object.entries(previous.cards)) {
      for (const kind of ["member", "memberBloom0", "leader"])
        results.push({ job: { kind, cardId }, team: rec[kind] });
    }
  }
  const dataset = tier.assembleTierDataset(results);
  writeFileSync(out, `${JSON.stringify(dataset, null, 2)}\n`);
  await server.close();
  console.log(
    `wrote ${out}: ${Object.keys(dataset.cards).length} cards, best ${dataset.best.unitScore}`,
  );
}

const argv = process.argv.slice(2);
const accountsOnly = argv.includes("--accounts");
const assembleOnly = argv.includes("--assemble");
if (argv[0] === "--worker") await worker(Number(argv[1]), Number(argv[2]), accountsOnly);
else await main(accountsOnly, assembleOnly);
