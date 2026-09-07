import { describe, expect, it } from "vite-plus/test";

import { songs } from "./index";
import { singsIn, songSingers } from "./songSingers";

describe("楽曲の区分(2026-09-08 ユーザー定義)", () => {
  it("ホロメン 1 人ならソロ、複数ならユニット、hololive IDOL PROJECT なら全体", () => {
    expect(songSingers({ artists: ["猫又おかゆ"] })).toEqual({
      scope: "solo",
      holomenIds: ["nekomata-okayu"],
    });
    expect(songSingers({ artists: ["猫又おかゆ", "戌神ころね"] })).toEqual({
      scope: "unit",
      holomenIds: ["nekomata-okayu", "inugami-korone"],
    });
    expect(songSingers({ artists: ["hololive IDOL PROJECT"] })).toEqual({
      scope: "all",
      holomenIds: [],
    });
  });

  it("所属名のアーティストはその所属の全員が歌唱者のユニット曲(フブキは 1期生にもゲーマーズにも入る)", () => {
    const gen1 = songSingers({ artists: ["ホロライブ1期生"] });
    expect(gen1.scope).toBe("unit");
    expect(gen1.holomenIds).toContain("shirakami-fubuki");
    expect(songSingers({ artists: ["ホロライブゲーマーズ"] }).holomenIds).toContain(
      "shirakami-fubuki",
    );
    const advent = songSingers({ artists: ["hololive English -Advent-"] });
    expect(advent.holomenIds).toContain("fuwawa-abyssgard");
    expect(advent.holomenIds).toContain("mococo-abyssgard");
  });

  it("所属に対応しないユニット名は曲ごとの歌唱者(ユーザー共有)。なければ未確認(null)で推測しない", () => {
    expect(songSingers({ artists: ["Blue Journey"] })).toEqual({ scope: "unit", holomenIds: null });
    expect(singsIn(songSingers({ artists: ["Blue Journey"] }), "hoshimachi-suisei")).toBe(false);
    const blueJourney = songSingers({ id: "song-131", artists: ["Blue Journey"] });
    expect(blueJourney.holomenIds).toEqual(["shiranui-flare", "tokoyami-towa", "omaru-polka"]);
    expect(songSingers({ id: "song-108", artists: ["不知火建設"] }).holomenIds).toHaveLength(5);
  });

  it("収録曲は全曲が区分でき、歌唱者未確認の曲はない", () => {
    const unknown = songs.filter((s) => songSingers(s).holomenIds === null);
    expect(unknown).toEqual([]);
    const counts = { solo: 0, unit: 0, all: 0 };
    for (const s of songs) counts[songSingers(s).scope] += 1;
    expect(counts.all).toBe(15);
    expect(counts.solo + counts.unit + counts.all).toBe(songs.length);
  });
});
