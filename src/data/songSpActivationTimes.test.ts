import { describe, expect, it } from "vite-plus/test";

import songsJson from "./songs.json";
import {
  songSpActivationCoverage,
  validateSongSpActivationDataset,
  validateSongSpActivationTimes,
} from "./songSpActivationTimes";
import type { Song } from "./types";

const songs = songsJson as Song[];

function songWithSpTimes(times: unknown, durationSeconds = 100): Song {
  return {
    id: "song-test",
    title: "test",
    artists: ["test"],
    kind: "original",
    durationSeconds,
    spActivationTimesSeconds: times,
    charts: { expert: { level: 1, combo: null } },
  } as unknown as Song;
}

describe("song SP activation times", () => {
  it("現在のデータセットで収集済みSP時刻がすべて妥当", () => {
    expect(validateSongSpActivationDataset(songs)).toEqual([]);
  });

  it("未収集曲をエラーにせずcoverageで機械可読に列挙する", () => {
    const coverage = songSpActivationCoverage(songs);
    console.info("SP activation coverage:", coverage);
    expect(coverage.totalSongs).toBe(songs.length);
    expect(coverage.songsWithSpActivationTimes + coverage.missingSongIds.length).toBe(songs.length);
    expect(new Set(coverage.missingSongIds).size).toBe(coverage.missingSongIds.length);
  });

  it("小数秒を保持した5地点の厳密昇順を受け付ける", () => {
    expect(
      validateSongSpActivationTimes(songWithSpTimes([1.25, 20.5, 40.75, 60.125, 99.9])),
    ).toEqual([]);
  });

  it("5地点でない値を拒否する", () => {
    const errors = validateSongSpActivationTimes(songWithSpTimes([10, 20, 30, 40]));
    expect(errors.some((error) => error.includes("5要素でない"))).toBe(true);
  });

  it("NaN・Infinity・負値を拒否する", () => {
    const errors = validateSongSpActivationTimes(
      songWithSpTimes([Number.NaN, Number.POSITIVE_INFINITY, -1, 40, 50]),
    );
    expect(errors.some((error) => error.includes("有限の数値でない"))).toBe(true);
    expect(errors.some((error) => error.includes("0未満"))).toBe(true);
  });

  it("重複・逆順を拒否する", () => {
    const errors = validateSongSpActivationTimes(songWithSpTimes([10, 20, 20, 15, 50]));
    expect(errors.filter((error) => error.includes("厳密昇順でない")).length).toBeGreaterThan(0);
  });

  it("既知の曲長を超える時刻を拒否する", () => {
    const errors = validateSongSpActivationTimes(songWithSpTimes([10, 20, 30, 40, 100.1], 100));
    expect(errors.some((error) => error.includes("曲長を超える"))).toBe(true);
  });
});
