import test from "node:test";
import assert from "node:assert/strict";
import {
  period,
  newParty,
  bosses,
  isCleared,
  readState,
  safeImage,
} from "../public/model.js";
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
  const now = at("2026-11-18T14:59:59.999Z");
  for (const boss of [weekly, monthly])
    a.clears[boss.id] = period(boss.cycle, now).key;
  assert.equal(isCleared(b, weekly, now), false);
  assert.equal(isCleared(a, weekly, now), true);
  assert.equal(isCleared(a, weekly, now + 1), false);
  assert.equal(isCleared(a, monthly, now + 1), true);
  assert.equal(isCleared(a, monthly, at("2026-11-30T15:00:00Z")), false);
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
const name = "단풍이";
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
