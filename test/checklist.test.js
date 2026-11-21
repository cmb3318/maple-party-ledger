import test from "node:test";
import assert from "node:assert/strict";
import {
  period,
  newParty,
  bosses,
  bossViewOrder,
  reorderCard,
  undoCardOrder,
  isCleared,
  readState,
  safeImage,
  plannedRaids,
  totals,
  saveBossPlan,
} from "../public/model.js";
import { minimumPrice, maxPlayers, share } from "../public/crystals.js";
import { onRequest } from "../functions/api/character.js";
const at = (value) => Date.parse(value);
test("weekly rollover is Thursday midnight in Seoul, across a year boundary", () => {
  const before = at("2025-12-31T14:59:59.999Z");
  assert.equal(period("weekly", before).key, "2025-12-25");
  assert.equal(period("weekly", before).end, before + 1);
  assert.equal(period("weekly", before + 1).key, "2026-01-01");
});
test("monthly rollover is independent of weekly clears and preserves recurring plans", () => {
  const a = newParty("단풍이"),
    b = newParty("파티원");
  const weekly = bosses[0],
    monthly = bosses.find((x) => x.id === "blackmage");
  a.targets = bosses.map((boss) => boss.id);
  const now = at("2026-11-18T23:59:59.999+09:00");
  for (const boss of bosses) a.clears[boss.id] = period(boss.cycle, now).key;
  assert.equal(isCleared(b, weekly, now), false);
  for (const boss of bosses) {
    assert.equal(isCleared(a, boss, now), true);
    assert.equal(isCleared(a, boss, now + 1), boss.cycle === "monthly");
  }
  const monthEnd = at("2026-11-30T23:59:59.999+09:00");
  a.clears[weekly.id] = period("weekly", monthEnd).key;
  assert.equal(period("monthly", monthEnd).end, monthEnd + 1);
  assert.equal(isCleared(a, monthly, monthEnd), true);
  assert.equal(isCleared(a, monthly, monthEnd + 1), false);
  assert.equal(isCleared(a, weekly, monthEnd + 1), true);
  assert.ok(a.targets.includes("blackmage"));
});
test("saved profiles expire independently of local party notes", () => {
  const p = newParty("단풍이");
  p.profile = { fetchedAt: 0 };
  p.settings.lotus = { note: "금 21시" };
  const loaded = readState(
    JSON.stringify({ version: 1, active: p.name, parties: [p] }),
  );
  assert.equal(loaded.parties[0].profile, null);
  assert.equal(loaded.parties[0].settings.lotus.note, "금 21시");
  assert.throws(() => readState("{"));
});
test("saved legacy records stay readable and only qualifying bosses enter the plan", () => {
  const character = newParty("단풍이");
  character.targets = ["lotus", "papulatus", "blackmage"];
  character.settings.papulatus = { note: "기존 기록" };
  const state = readState(
    JSON.stringify({
      version: 1,
      active: character.name,
      parties: [character],
    }),
  );
  assert.deepEqual(state.squads, []);
  assert.equal(state.parties[0].settings.papulatus.note, "기존 기록");
  assert.deepEqual(
    plannedRaids(state).map((raid) => raid.boss.id),
    ["lotus", "blackmage"],
  );
  assert.ok(
    bosses.every((boss) =>
      boss.levels.every((level) => share(boss, level, 1) >= minimumPrice),
    ),
  );
});
test("card ordering survives storage and keeps boss view order separate from character plans", () => {
  const first = newParty("첫캐릭터");
  const second = newParty("둘캐릭터");
  first.targets.push("lotus", "will");
  const state = {
    version: 1,
    active: first.name,
    parties: [first, second],
    squads: [{ id: "one" }, { id: "two" }],
    bossOrder: ["retired-boss", "will", "will"],
  };
  const bossChange = reorderCard(state, "bosses", "lotus", "will");
  const characterChange = reorderCard(
    state,
    "characters",
    second.name,
    first.name,
  );
  const partyChange = reorderCard(state, "squads", "one", "two");
  const restored = readState(JSON.stringify(state));
  assert.deepEqual(
    bossViewOrder(restored)
      .slice(0, 2)
      .map((boss) => boss.id),
    ["lotus", "will"],
  );
  assert.equal(bossViewOrder(restored).length, bosses.length);
  assert.deepEqual(
    restored.parties.map((character) => character.name),
    [second.name, first.name],
  );
  assert.deepEqual(
    restored.squads.map((squad) => squad.id),
    ["two", "one"],
  );
  assert.equal(restored.active, first.name);
  assert.deepEqual(
    plannedRaids(restored).map((raid) => raid.boss.id),
    ["lotus", "will"],
  );
  assert.ok(undoCardOrder(restored, "bosses", bossChange));
  assert.ok(undoCardOrder(restored, "characters", characterChange));
  assert.ok(undoCardOrder(restored, "squads", partyChange));
  assert.equal(bossViewOrder(restored)[0].id, "will");
  assert.equal(restored.parties[0].name, first.name);
  assert.equal(restored.squads[0].id, "one");
});
test("planned shares respect the difficulty's entry cap and separate monthly and completed income", () => {
  const now = at("2026-11-20T00:00:00Z");
  const character = newParty("단풍이");
  character.targets = ["lotus", "damien", "blackmage"];
  character.settings = {
    lotus: { level: "익스트림", squadId: "team", size: 6 },
    damien: { level: "노멀", size: 3 },
    blackmage: { level: "하드", size: 3 },
  };
  character.clears.lotus = period("weekly", now).key;
  const squad = { id: "team", name: "금요일 파티", size: 6 };
  const raids = plannedRaids({ parties: [character], squads: [squad] }, now);
  assert.equal(maxPlayers(bosses[0], "익스트림"), 2);
  assert.equal(raids[0].squad, squad);
  assert.equal(raids[0].size, 2);
  assert.deepEqual(totals(raids), {
    weekly: { planned: 275_416_666, done: 272_500_000, count: 2, cleared: 1 },
    monthly: { planned: 155_000_000, done: 0, count: 1, cleared: 0 },
  });
});
const name = "단풍이";
test("one boss plan merges across nine characters without copying their clears or notes", () => {
  const names = [
    "첫캐",
    "둘째",
    "셋째",
    "넷째",
    "다섯",
    "여섯",
    "일곱",
    "여덟",
    "아홉",
  ];
  const parties = names.map((name) => ({
    ...newParty(name),
    targets: ["will", "papulatus"],
    settings: { lotus: { note: name + " 메모" } },
    clears: { lotus: "2026-11-19" },
  }));
  const state = { parties, squads: [{ id: "team", size: 3 }] };
  const rows = [
    {
      id: "lotus",
      included: true,
      level: "익스트림",
      squadId: "team",
      size: 3,
    },
  ];
  assert.equal(
    saveBossPlan(state, names[0], rows, new Set(names.slice(1)), rows, false),
    9,
  );
  for (const character of parties) {
    assert.deepEqual(character.targets, ["will", "papulatus", "lotus"]);
    assert.equal(character.settings.lotus.size, 2);
    assert.equal(character.settings.lotus.squadId, "team");
    assert.equal(character.settings.lotus.note, character.name + " 메모");
    assert.equal(character.clears.lotus, "2026-11-19");
  }
  saveBossPlan(state, names[0], [], new Set([names[1]]), rows, true);
  assert.deepEqual(parties[1].targets, ["papulatus", "lotus"]);
  assert.ok(parties[2].targets.includes("will"));
});
function req(key = "", customName = name, method = "GET") {
  return onRequest({
    request: new Request(
      "https://example.test/api/character?" +
        new URLSearchParams({ name: customName }),
      { method },
    ),
    env: { NEXON_API_KEY: key },
  });
}
test("invalid nickname, method and missing key make no upstream calls", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", () =>
    assert.fail("unexpected network call"),
  );
  assert.equal((await req()).status, 503);
  assert.equal((await req("stub", "<img>")).status, 400);
  assert.equal((await req("stub", name, "POST")).status, 405);
  assert.equal(fetch.mock.callCount(), 0);
});
test("KMS lookup returns only display fields and sends the key exclusively in server headers", async (t) => {
  const image =
    "https://open.api.nexon.com/static/maplestory/character/look/example";
  const fetch = t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url.origin, "https://open.api.nexon.com");
    assert.equal(options.headers["x-nxopen-api-key"], "server-only");
    if (url.pathname.endsWith("/id")) {
      assert.equal(url.searchParams.get("character_name"), name);
      return Response.json({ ocid: "private-id" });
    }
    assert.equal(url.pathname, "/maplestory/v1/character/basic");
    assert.equal(url.searchParams.get("ocid"), "private-id");
    assert.equal(url.searchParams.has("date"), false);
    return Response.json({
      character_name: name,
      world_name: "루나",
      character_image: image,
      character_class: "비숍",
      character_level: 281,
    });
  });
  const res = await req("server-only");
  const body = await res.text();
  assert.equal(res.status, 200);
  assert.equal(JSON.parse(body).image, image);
  assert.doesNotMatch(body, /server-only|private-id|ocid/);
  assert.equal(fetch.mock.callCount(), 2);
  assert.equal(safeImage("https://example.com/portrait"), "");
});
test("lookup distinguishes missing data, auth, quota and server interruptions", async (t) => {
  const responses = [
    [400, "OPENAPI00004", 404],
    [400, "OPENAPI00005", 503],
    [429, "OPENAPI00007", 429],
    [400, "OPENAPI00010", 503],
  ];
  for (const [status, code, expected] of responses) {
    const fetch = t.mock.method(globalThis, "fetch", async () =>
      Response.json({ error: { name: code, message: "internal" } }, { status }),
    );
    const result = await req("stub");
    assert.equal(result.status, expected);
    assert.doesNotMatch(await result.text(), /internal/);
    fetch.mock.restore();
  }
});
test("a redirect ends the lookup without sending credentials to another host", async (t) => {
  const upstream = t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url.origin, "https://open.api.nexon.com");
    assert.equal(options.redirect, "manual");
    return Response.redirect("https://example.test/moved", 302);
  });
  assert.equal((await req("stub")).status, 502);
  assert.equal(upstream.mock.callCount(), 1);
});
