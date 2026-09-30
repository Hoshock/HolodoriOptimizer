import { describe, expect, it } from "vite-plus/test";

import { songs } from "./index";
import { SONG_READINGS } from "./songReadings";

/** 曲名の読み（並び順の補助）。全曲に読みがあり、ひらがなと長音だけで書かれていること */
describe("SONG_READINGS", () => {
  it("全曲に読みがあり、余分な ID はない", () => {
    const ids = new Set(songs.map((s) => s.id));
    expect(songs.filter((s) => !SONG_READINGS[s.id]).map((s) => s.id)).toEqual([]);
    expect(Object.keys(SONG_READINGS).filter((id) => !ids.has(id))).toEqual([]);
  });

  it("読みはひらがなと長音だけ（記号・空白・カタカナを含まない）", () => {
    const bad = Object.entries(SONG_READINGS).filter(([, r]) => !/^[ぁ-ゖー]+$/.test(r));
    expect(bad).toEqual([]);
  });
});
