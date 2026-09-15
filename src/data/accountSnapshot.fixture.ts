import snapshot20260912 from "../../docs/human/repro/20260912-account-snapshot.md?raw";
import snapshot20260913 from "../../docs/human/repro/20260913-account-snapshot.md?raw";
import snapshot20260915 from "../../docs/human/repro/20260915-account-snapshot.md?raw";
import { blueBoardEffects } from "./blueBoard";
import { connectFactorMapOf } from "./connect";
import type { ConnectPlacements } from "./connect";
import { parseConnectPlacements } from "../storage/connect";

/**
 * **アカウントスナップショット（`docs/human/repro/*-account-snapshot.md`）の唯一の読み口。** vitest の対象外（*.fixture.ts）。
 *
 * repro のドキュメントに貼ってある `holodori-optimizer/account` の出力（raw export）をそのまま読み、
 * production の `connectFactorMapOf` → `blueBoardEffects` を通して**実効値**を出す。解析側が
 * 「マスの表記値」と「コネクト増幅込みの実効値」を取り違えないための単一経路で、手入力の表を持たない
 * （2026-09-13 の K7 は 白上フブキ の 発動率を表記値 6% で手入力して解析を誤らせた）。
 *
 * **時点を混ぜない。** 日付ごとに別ファイルを読み、historical observation（K1〜K4 など）は
 * その観測時点の snapshot だけを使う。現在の snapshot で過去の観測を上書きしない。
 */
/** repro ドキュメントの本文（`?raw` で取り込むので、ドキュメントが唯一の原本） */
export const ACCOUNT_SNAPSHOT_DOCS = {
  "2026-09-12": snapshot20260912,
  "2026-09-13": snapshot20260913,
  "2026-09-15": snapshot20260915,
} as const;
export const ACCOUNT_SNAPSHOT_PATHS = {
  "2026-09-12": "docs/human/repro/20260912-account-snapshot.md",
  "2026-09-13": "docs/human/repro/20260913-account-snapshot.md",
  "2026-09-15": "docs/human/repro/20260915-account-snapshot.md",
} as const;
export type AccountSnapshotDate = keyof typeof ACCOUNT_SNAPSHOT_DOCS;

export interface AccountSnapshotRow {
  /** 表示名。2026-09-12 の出力には入っていないので、正典は `holomenId` 側 */
  holomen?: string;
  holomenId: string;
  red?: string[];
  blue?: string[];
  yellow?: string[];
  green?: string[];
  connect?: unknown;
}
export interface AccountSnapshotExport {
  format: string;
  version: number;
  holomen: AccountSnapshotRow[];
  members: { holomen: string; card: string; cardId: string; bloom: number }[];
  memoryPercent: number;
  enhancementPercent: number;
}

/** repro ドキュメントの中の唯一の ```json ブロック（= 出力そのもの）を読む */
export function readAccountSnapshot(date: AccountSnapshotDate): AccountSnapshotExport {
  const text = ACCOUNT_SNAPSHOT_DOCS[date];
  const start = text.indexOf("```json");
  const end = text.indexOf("```", start + 7);
  if (start < 0 || end < 0) throw new Error(`${date} の JSON ブロックがない`);
  return JSON.parse(text.slice(start + 7, end)) as AccountSnapshotExport;
}

export function snapshotConnectPlacements(
  acc: AccountSnapshotExport,
): Record<string, ConnectPlacements> {
  const out: Record<string, ConnectPlacements> = {};
  for (const r of acc.holomen) {
    const p = parseConnectPlacements(r.connect);
    if (Object.keys(p).length > 0) out[r.holomenId] = p;
  }
  return out;
}

export interface BlueDerived {
  /** マスの表記値の単純合計 [発動率, 発動頻度] */
  bare: [number, number];
  /** コネクト増幅込み [発動率, 発動頻度]（解析へ入れてよいのはこちら） */
  effective: [number, number];
}

const tenth = (x: number): number => Math.round(x * 10) / 10;

/** 青を持つホロメンの bare / 実効の発動率・発動頻度（production 経路で導出） */
export function derivedBlue(acc: AccountSnapshotExport): Record<string, BlueDerived> {
  const factorMap = connectFactorMapOf(snapshotConnectPlacements(acc));
  const out: Record<string, BlueDerived> = {};
  for (const r of acc.holomen) {
    if (!r.blue || r.blue.length === 0) continue;
    const bare = blueBoardEffects(r.blue);
    const eff = blueBoardEffects(r.blue, factorMap[r.holomenId]?.blue);
    out[r.holomenId] = {
      bare: [tenth(bare.activeRatePercent), tenth(bare.activeFrequencyPercent)],
      effective: [tenth(eff.activeRatePercent), tenth(eff.activeFrequencyPercent)],
    };
  }
  return out;
}

/** 青のマスを ON / OFF したスナップショット（transient な実験状態を raw ノードから組み立てる） */
export interface BlueNodeOverride {
  holomenId: string;
  /** 追加で ON にするマス ID */
  on?: readonly string[];
  /** OFF にするマス ID */
  off?: readonly string[];
}

/**
 * スナップショットの青マスだけを差し替えた**派生スナップショット**を作る。
 *
 * 発動頻度 ownership 実験（2026-09-13 の F0〜F3）のように、実験中の状態を account snapshot として残さず、
 * 現在の snapshot + マスの ON / OFF で再構成するために使う。実効値は必ず production の
 * `connectFactorMapOf` → `blueBoardEffects` から導き、手入力の表を作らない。
 */
export function withBlueNodes(
  acc: AccountSnapshotExport,
  overrides: readonly BlueNodeOverride[],
): AccountSnapshotExport {
  const byId = new Map(overrides.map((o) => [o.holomenId, o]));
  return {
    ...acc,
    holomen: acc.holomen.map((r) => {
      const o = byId.get(r.holomenId);
      if (!o) return r;
      const off = new Set(o.off ?? []);
      const blue = (r.blue ?? []).filter((id) => !off.has(id));
      for (const id of o.on ?? []) {
        if (!blue.includes(id)) blue.push(id);
      }
      return { ...r, blue };
    }),
  };
}

/** 解析コーパスの BlueTable と同じ形（ホロメン ID → [発動率, 発動頻度]）に落とす。青なしは [0, 0] */
export function effectiveBlueTable(
  acc: AccountSnapshotExport,
  holomenIds: readonly string[],
): Record<string, [number, number]> {
  const derived = derivedBlue(acc);
  return Object.fromEntries(holomenIds.map((id) => [id, derived[id]?.effective ?? [0, 0]]));
}
