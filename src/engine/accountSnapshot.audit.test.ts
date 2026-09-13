import { describe, expect, it } from "vite-plus/test";
import type { AccountSnapshotDate, AccountSnapshotExport } from "../data/accountSnapshot.fixture";
import {
  ACCOUNT_SNAPSHOT_DOCS,
  derivedBlue,
  effectiveBlueTable,
  readAccountSnapshot,
  snapshotConnectPlacements,
} from "../data/accountSnapshot.fixture";
import { BLUE_BOARD_NODES } from "../data/blueBoard";
import { holomenById } from "../data";
import { CONNECT_EXTENTS, connectFactorMapOf } from "../data/connect";
import {
  BLUE_SNAPSHOT_2026_09_12,
  BLUE_SNAPSHOT_2026_09_13,
} from "./displayScoreCategoryCorpus.fixture";

/**
 * **アカウントスナップショット（repro の 2 ファイル）の監査。** ドキュメントの表とその中の raw export がずれないこと、
 * 解析コーパスの `BLUE_SNAPSHOT_*` が production のコネクト経路から導出した**実効値**と一致することを固定する。
 *
 * 2026-09-13 に、白上フブキ の青を マスの表記値 6%（正しくは コネクト増幅込みの 15%）で手入力して W_blue の解析を
 * 誤らせた。その再発防止がこのテストの目的で、`BLUE_SNAPSHOT_*` はもうどこにも手入力の根拠を持たない。
 *
 * **時点は混ぜない**: 09-12 の表は 09-12 の出力から、09-13 の表は 09-13 の出力から導出する。
 */

const DATES: readonly AccountSnapshotDate[] = ["2026-09-12", "2026-09-13"];
const docOf = (date: AccountSnapshotDate): string => ACCOUNT_SNAPSHOT_DOCS[date];

describe("raw export の形式", () => {
  it("2 つの snapshot はどちらも holodori-optimizer/account v1", () => {
    for (const date of DATES) {
      const acc: AccountSnapshotExport = readAccountSnapshot(date);
      expect(acc.format, date).toBe("holodori-optimizer/account");
      expect(acc.version, date).toBe(1);
      expect(acc.holomen.length, date).toBe(54);
      expect(acc.members.length, date).toBe(22);
    }
  });

  it("2026-09-13 のアカウント補正は memory 6 / enhancement 3.02", () => {
    const acc = readAccountSnapshot("2026-09-13");
    expect(acc.memoryPercent).toBe(6);
    expect(acc.enhancementPercent).toBe(3.02);
  });

  it("ドキュメントの概要表の解放マス数は raw export と一致する（手で転記していない）", () => {
    for (const date of DATES) {
      const acc = readAccountSnapshot(date);
      const doc = docOf(date);
      const lines = doc.split("\n");
      for (const r of acc.holomen) {
        const counts = [
          r.red?.length ?? 0,
          r.blue?.length ?? 0,
          r.yellow?.length ?? 0,
          r.green?.length ?? 0,
        ];
        // 2026-09-12 の出力には表示名が入っていないので、名前はデータ側の正典から引く
        const name = holomenById.get(r.holomenId)?.name ?? r.holomenId;
        const row = lines.find((line) => line.startsWith(`| ${name} `));
        if (!row) throw new Error(`${date}: ${name} の行がない`);
        const cells = row
          .split("|")
          .slice(2, 6)
          .map((c) => Number(c.trim()));
        expect(cells, `${date} ${name}`).toEqual(counts);
      }
    }
  });
});

describe("derived: production 経路の実効値", () => {
  it("白上フブキ 15 / 0 は「青が右 + 絶対方向の content-3 + 1500‰」から出る（bare は 6 / 0）", () => {
    const acc = readAccountSnapshot("2026-09-13");
    const placements = snapshotConnectPlacements(acc)["shirakami-fubuki"];
    if (!placements) throw new Error("白上フブキのコネクトがない");
    expect(holomenById.get("shirakami-fubuki")?.board.blueSide).toBe("right");
    expect(placements.card).toEqual({ extent: "content-3", permil: 1500 });
    expect(CONNECT_EXTENTS["content-3"]).toEqual([
      [-1, 0],
      [-2, 0],
      [-3, 0],
    ]);
    expect(
      connectFactorMapOf({ "shirakami-fubuki": placements })["shirakami-fubuki"]?.blue,
    ).toEqual({ "B-006": 2.5, "B-007": 2.5, "B-008": 2.5 });
    expect(BLUE_BOARD_NODES.find((n) => n.id === "B-007")?.effect).toEqual({
      kind: "activeRate",
      percent: 6,
    });
    expect(derivedBlue(acc)["shirakami-fubuki"]).toEqual({ bare: [6, 0], effective: [15, 0] });
  });

  it("2026-09-13 の青 9 件の bare と実効", () => {
    const derived = derivedBlue(readAccountSnapshot("2026-09-13"));
    expect(
      Object.fromEntries(
        Object.entries(derived).map(([id, d]) => [id, [...d.bare, ...d.effective]]),
      ),
    ).toEqual({
      "shirakami-fubuki": [6, 0, 15, 0],
      "ookami-mio": [30, 12, 39.6, 12],
      "sakura-miko": [30, 0, 42, 0],
      "nekomata-okayu": [30, 12, 35.1, 12],
      "inugami-korone": [30, 4, 39.6, 4],
      "usada-pekora": [30, 8, 30, 8],
      "shirogane-noel": [30, 8, 42, 8],
      // 2026-09-13 の export ではじめて現れた青。いつ開いたかは未確認なので過去の観測へ遡及適用しない
      // （`frequencyTransferBlue()` が F0〜F3 では OFF に戻す）
      "fuwawa-abyssgard": [12, 0, 24, 0],
      "mococo-abyssgard": [30, 0, 42.6, 0],
    });
  });

  it("解析コーパスの BLUE_SNAPSHOT_* は、それぞれの時点の snapshot から導出した実効値と一致する", () => {
    // historical（K1〜K4 / 赤コーパス）は 2026-09-12 の出力から
    expect(
      effectiveBlueTable(readAccountSnapshot("2026-09-12"), Object.keys(BLUE_SNAPSHOT_2026_09_12)),
    ).toEqual({ ...BLUE_SNAPSHOT_2026_09_12 });
    // current（K7）は 2026-09-13 の出力から
    expect(
      effectiveBlueTable(readAccountSnapshot("2026-09-13"), Object.keys(BLUE_SNAPSHOT_2026_09_13)),
    ).toEqual({ ...BLUE_SNAPSHOT_2026_09_13 });
  });

  it("2 つの時点を混ぜない: 3 人は 09-12 と 09-13 で実効値が違う", () => {
    const d12 = derivedBlue(readAccountSnapshot("2026-09-12"));
    const d13 = derivedBlue(readAccountSnapshot("2026-09-13"));
    const changed = Object.keys(d13).filter(
      (id) => JSON.stringify(d12[id]?.effective) !== JSON.stringify(d13[id]?.effective),
    );
    // さくらみこ / 猫又おかゆ の発動頻度は、snapshot が ownership 実験の**終了時点（F3）**なので 09-12 と同じ
    // 0 / 12 に戻っている（実験中の F0〜F2 は transient で snapshot にしない —
    // docs/human/repro/display-score-20260913-frequency.md）
    // フワワ・アビスガード は 09-12 に青がなく、09-13 の export ではじめて 14 マス（実効 24 / 0）が現れた
    expect(changed.sort()).toEqual(["fuwawa-abyssgard", "inugami-korone", "ookami-mio"]);
    // 白上フブキ だけは両日とも 15 / 0（K7 と K3 / K4 で同じ値になるのは偶然ではなく、ボードが動いていないため）
    expect(d12["shirakami-fubuki"]?.effective).toEqual([15, 0]);
    expect(d13["shirakami-fubuki"]?.effective).toEqual([15, 0]);
  });
});
