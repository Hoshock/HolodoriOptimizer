/**
 * ライブ中のアクティブスキルの発動タイムライン（**ライブ最適化用の仮説モデル**）。
 *
 * 目的は「発動頻度の青マスを何個開けるべきか」を比べることだけで、ここで出す値は
 * **実際のライブスコアではない**（譜面のノーツ位置・コンボ・判定・SP の発動位置・
 * スコアサポートの重なりは一切入っていない）。UI でも「アクティブスキル期待値」と
 * 表記し、「ライブスコア」とは呼ばない（ADR-007）。
 *
 * ユニット編成画面の表示スコアボーナス（src/engine/displayScore.ts）とは**別のモデル**で、
 * 依存も持たない（.claude/rules/engine-structure.md「レイヤーを混ぜない」）。表示側の
 * 未解明な近似（スキルツリー欄・パッシブ欄の帰属）をこの目的関数に持ち込まないための分離で、
 * 発動率の反映式も表示側（確率への加算）とは違う乗算型を採る（下の
 * effectiveActivationProbability）。同じ値になる保証がないので基礎発動確率も共有せず、
 * このモデル専用に持つ（LIVE_ACTIVE_PROBABILITY）。
 *
 * 時刻は実数（秒）で扱い、1 秒刻みなどの離散化・整数秒への切り上げは行わない。
 */

/**
 * アクティブスキルの基礎発動確率（このライブモデル専用の値）。
 *
 * 低 37% / 中 46% / 高 55% は、ゲーム内に数値表示がなく実機では確認できない項目で、
 * コミュニティが公開しているマスターデータの値【外部情報】。表示スコアボーナスのモデル
 * （displayScore.ts の ACTIVE_PROBABILITY）と現時点の値は同じだが、評価式が違うので
 * 定数は共有せずこちらに独立して持つ（.claude/rules/engine-structure.md）。
 * unknown はデータ未整備のカード用のフォールバック（medium と同値。外部情報にある値ではない）。
 */
export const LIVE_ACTIVE_PROBABILITY: Record<"low" | "medium" | "high" | "unknown", number> = {
  low: 0.37,
  medium: 0.46,
  high: 0.55,
  unknown: 0.46,
};

/** タイムラインに載せる 1 人ぶんのアクティブスキル（青ボードの効果を含まない基礎値） */
export interface LiveActiveSkill {
  /** 基礎の発動周期（秒） */
  intervalSeconds: number;
  /** 効果時間（秒） */
  durationSeconds: number;
  /** 基礎の発動確率（0〜1） */
  baseProbability: number;
  /** 発動したときのスコア UP（%） */
  scoreUpPercent: number;
}

/** そのホロメンの青ホロメンボードで得ている実効値（マスの表記値の合計。コネクト増幅は未確認のため含まない） */
export interface LiveBoardEffect {
  /** 発動頻度 UP（%） */
  frequencyUpPercent: number;
  /** 発動率 UP（%） */
  rateUpPercent: number;
}

/** 発動候補の区間（1 回ぶん） */
export interface ActiveWindow {
  /** 開始時刻（秒） */
  start: number;
  /** 終了時刻（秒。評価区間でクリップ済み） */
  end: number;
  scoreUpPercent: number;
  /** その回に発動する確率（0〜1） */
  probability: number;
}

/** 発動候補の集合が一定の区間 */
export interface TimelineSegment {
  start: number;
  end: number;
  /** この区間で発動候補になっているスキル（順不同） */
  actives: readonly { scoreUpPercent: number; probability: number }[];
}

/**
 * 発動頻度 UP を周期に反映する【ライブ最適化用の仮説】。周期 ÷ (1 + f/100)。
 * マスの効果種別が「クールタイム短縮」であることは外部情報で分かっており、ゲーム内の表示文も
 * 「アクティブスキル発動頻度が X%UP」なので方向は確か。実機のタイムスタンプで検証したわけではない。
 * 整数秒への丸めは入れない（入れるべきかは未確認なので、推測の量子化を足さない）。
 */
export function effectiveInterval(baseIntervalSeconds: number, frequencyUpPercent: number): number {
  return baseIntervalSeconds / (1 + frequencyUpPercent / 100);
}

/**
 * 発動率 UP を発動確率に反映する【ライブ最適化用の仮説】。min(1, p × (1 + r/100)) の乗算型。
 * 表示スコアボーナスのモデル（displayScore.ts の blueActivationProbability）は加算型
 * （p + r/100）で、あちらはゴールデン 20 ケース全体に当てた結果そちらを採っている。
 * どちらが実際のライブ中の挙動かは未解明で、ここでは別モデルとして乗算型を採る（ADR-007）。
 */
export function effectiveActivationProbability(
  baseProbability: number,
  rateUpPercent: number,
): number {
  return Math.min(1, baseProbability * (1 + rateUpPercent / 100));
}

/** 浮動小数の比較に使う許容値（時刻・確率とも桁が小さいので固定値でよい） */
const EPS = 1e-9;

/**
 * 発動候補の区間を作る。k = 1, 2, ... で start = k × 実効周期、end = start + 効果時間。
 * 評価区間（0〜horizonSeconds）を超える部分はクリップし、区間外から始まる回は作らない。
 */
export function buildActiveWindows(
  skill: LiveActiveSkill,
  board: LiveBoardEffect,
  horizonSeconds: number,
): ActiveWindow[] {
  const windows: ActiveWindow[] = [];
  const interval = effectiveInterval(skill.intervalSeconds, board.frequencyUpPercent);
  const probability = effectiveActivationProbability(skill.baseProbability, board.rateUpPercent);
  if (
    interval <= 0 ||
    skill.durationSeconds <= 0 ||
    horizonSeconds <= 0 ||
    probability <= 0 ||
    !Number.isFinite(interval)
  ) {
    return windows;
  }
  for (let k = 1; k * interval < horizonSeconds - EPS; k++) {
    const start = k * interval;
    const end = Math.min(start + skill.durationSeconds, horizonSeconds);
    if (end - start > EPS) {
      windows.push({ start, end, scoreUpPercent: skill.scoreUpPercent, probability });
    }
  }
  return windows;
}

/**
 * 発動候補の集合が変わる時刻で区切る。各区間の中では候補集合が一定なので、
 * 期待値をその区間の長さぶん厳密に積分できる（1 秒刻みの離散化をしない理由）。
 * 候補が 0 の区間も返す（空白の集計に使う）。
 */
export function segmentTimeline(
  windows: readonly ActiveWindow[],
  horizonSeconds: number,
): TimelineSegment[] {
  if (horizonSeconds <= 0) return [];
  if (windows.length === 0) {
    return [{ start: 0, end: horizonSeconds, actives: [] }];
  }
  const bounds: number[] = [0, horizonSeconds];
  for (const w of windows) {
    if (w.start > EPS && w.start < horizonSeconds - EPS) bounds.push(w.start);
    if (w.end > EPS && w.end < horizonSeconds - EPS) bounds.push(w.end);
  }
  bounds.sort((a, b) => a - b);
  // 同じ時刻（開始と終了が重なる境界）は 1 つにまとめる
  const times: number[] = [];
  for (const b of bounds) {
    const last = times[times.length - 1];
    if (last === undefined || b - last > EPS) times.push(b);
  }

  // 開始時刻順のイベントを掃きながら、区間ごとの候補集合を作る
  const starts = [...windows].sort((a, b) => a.start - b.start);
  const open = new Set<ActiveWindow>();
  const segments: TimelineSegment[] = [];
  let next = 0;
  for (let i = 0; i + 1 < times.length; i++) {
    const from = times[i];
    const to = times[i + 1];
    if (from === undefined || to === undefined) break;
    for (const w of open) if (w.end <= from + EPS) open.delete(w);
    for (let w = starts[next]; w !== undefined && w.start <= from + EPS; w = starts[next]) {
      if (w.end > from + EPS) open.add(w);
      next += 1;
    }
    segments.push({
      start: from,
      end: to,
      actives: [...open].map((w) => ({
        scoreUpPercent: w.scoreUpPercent,
        probability: w.probability,
      })),
    });
  }
  return segments;
}
