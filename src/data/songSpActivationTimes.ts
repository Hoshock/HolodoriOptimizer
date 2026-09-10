import type { Song } from "./types";

/**
 * SP時刻データのカバレッジ。
 * missingSongIds は推測で補完せず、未収集曲をそのまま機械可読に列挙する。
 */
export interface SongSpActivationCoverage {
  totalSongs: number;
  songsWithSpActivationTimes: number;
  missingSongIds: string[];
}

/**
 * 1曲のSP1〜SP5発動時刻を検査する。
 * 未収集(undefined)は正常。値がある場合だけ exactly 5 / finite / 0以上 / 厳密昇順 /
 * 既知の曲長以内を要求する。
 */
export function validateSongSpActivationTimes(song: Song): string[] {
  const errors: string[] = [];
  const raw: unknown = song.spActivationTimesSeconds;
  if (raw === undefined) return errors;

  const at = `song ${song.id}: spActivationTimesSeconds`;
  if (!Array.isArray(raw)) {
    return [`${at} が5要素の配列でない`];
  }
  if (raw.length !== 5) {
    errors.push(`${at} が5要素でない (${String(raw.length)})`);
  }

  let previous: number | undefined;
  for (let i = 0; i < raw.length; i += 1) {
    const value: unknown = raw[i];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      errors.push(`${at}[${String(i)}] が有限の数値でない (${String(value)})`);
      previous = undefined;
      continue;
    }
    if (value < 0) {
      errors.push(`${at}[${String(i)}] が0未満 (${String(value)})`);
    }
    if (previous !== undefined && value <= previous) {
      errors.push(`${at} が厳密昇順でない (${String(previous)} >= ${String(value)})`);
    }
    if (song.durationSeconds !== null && value > song.durationSeconds) {
      errors.push(
        `${at}[${String(i)}] が曲長を超える (${String(value)} > ${String(song.durationSeconds)})`,
      );
    }
    previous = value;
  }

  return errors;
}

/** 収録曲すべてのSP時刻を検査する。未収集曲はエラーにしない。 */
export function validateSongSpActivationDataset(songs: readonly Song[]): string[] {
  return songs.flatMap((song) => validateSongSpActivationTimes(song));
}

/** 現在の収集済み / 未収集を数え、未収集曲IDを返す。 */
export function songSpActivationCoverage(songs: readonly Song[]): SongSpActivationCoverage {
  const missingSongIds = songs
    .filter((song) => song.spActivationTimesSeconds === undefined)
    .map((song) => song.id);
  return {
    totalSongs: songs.length,
    songsWithSpActivationTimes: songs.length - missingSongIds.length,
    missingSongIds,
  };
}
