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

  it("2026-09-08 追加曲: シミュラクルはぼたんのソロ。未登録 3 曲は予約 ID で歌唱者が解決し、FUWAMOCO は 2 人", () => {
    const simulacre = songs.find((s) => s.id === "song-194");
    expect(simulacre?.title).toBe("シミュラクル");
    if (!simulacre) return;
    expect(songSingers(simulacre)).toEqual({ scope: "solo", holomenIds: ["shishiro-botan"] });
    // 三位一体♡ラブシステム(鷹嶺ルイ / FUWAMOCO)— 公式表記のまま渡しても 3 人に解決する
    const trinity = songSingers({ id: "song-195", artists: ["鷹嶺ルイ", "FUWAMOCO"] });
    expect(trinity.scope).toBe("unit");
    expect(trinity.holomenIds).toEqual(["takane-lui", "fuwawa-abyssgard", "mococo-abyssgard"]);
    // ホロホーク(鷹嶺ルイ)
    expect(songSingers({ id: "song-196", artists: ["鷹嶺ルイ"] })).toEqual({
      scope: "solo",
      holomenIds: ["takane-lui"],
    });
    // めくるめくランデヴー(FUWAMOCO)— 1 アーティスト扱いにならず 2 人
    const rendezvous = songSingers({ id: "song-197", artists: ["FUWAMOCO"] });
    expect(rendezvous.scope).toBe("unit");
    expect(rendezvous.holomenIds).toEqual(["fuwawa-abyssgard", "mococo-abyssgard"]);
    expect(singsIn(rendezvous, "fuwawa-abyssgard")).toBe(true);
    expect(singsIn(rendezvous, "mococo-abyssgard")).toBe(true);
    expect(singsIn(rendezvous, "takane-lui")).toBe(false);
    // 予約 ID は収録曲と重複しない
    for (const id of ["song-195", "song-196", "song-197"])
      expect(
        songs.some((s) => s.id === id),
        `${id} は未登録のはず`,
      ).toBe(false);
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
