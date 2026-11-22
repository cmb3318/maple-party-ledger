import test from "node:test";
import assert from "node:assert/strict";
import { newParty } from "../public/model.js";
import { exportSettings, mergeSettings, parseSettings } from "../public/settings-transfer.js";

function source() {
  const character = newParty("검증캐릭");
  character.targets = ["lotus"];
  character.settings = {
    lotus: { level: "익스트림", squadId: "first", size: 2, note: "목요일"},
    damien: { level: "하드", squadId: "", size: 1, note: "예전 메모" },
  };
  character.profile = { image: "https://open.api.nexon.com/example", apiKey: "secret" };
  character.clears = { lotus: "2026-11-19" };
  return {
    parties: [character],
    squads: [{ id: "first", name: "노을", size: 2, color: "#aabbcc", note: "21시" }],
    bossOrder: ["damien", "lotus"],
    history: { version: 1 },
  };
}
const exported = () => exportSettings(source());
const roundTrip = (data) => parseSettings(JSON.stringify(data));

test("settings round trip keeps plans and excludes profile caches and defeat history", () => {
  const data = exported();
  assert.deepEqual(Object.keys(data.characters[0]), ["name", "targets", "settings"]);
  assert.ok(!JSON.stringify(data).includes("secret"));
  assert.ok(!Object.hasOwn(data, "history"));
  const state = { parties: [], squads: [] };
  mergeSettings(state, roundTrip(data));
  assert.deepEqual(exportSettings(state), data);
  assert.equal(state.active, "검증캐릭");
  assert.deepEqual(state.parties[0].clears, {});
});

test("matching names update, relink party ids, and retain existing clears and extra plans", () => {
  const initial = source();
  const char = initial.parties[0];
  char.targets.push("damien");
  char.settings.damien.note = "유지할 메모";
  initial.squads[0].id = "local";
  const log = initial.history;
  const clears = char.clears;
  mergeSettings(initial, roundTrip(exported()));
  assert.deepEqual(char.targets, ["lotus", "damien"]);
  assert.equal(char.settings.lotus.squadId, "local");
  assert.equal(char.settings.damien.note, "유지할 메모");
  assert.equal(initial.squads.length, 1);
  assert.equal(char.clears, clears);
  assert.equal(initial.history, log);
});

test("party id collision does not relink unrelated parties and selected plan can be matched exactly", () => {
  const initial = source();
  initial.squads[0].name = "다른 이름";
  initial.parties[0].targets.push("damien");
  mergeSettings(initial, roundTrip(exported()), false);
  assert.deepEqual(initial.parties[0].targets, ["lotus"]);
  assert.equal(initial.squads.length, 2);
  assert.notEqual(initial.squads[1].id, "first");
  assert.equal(initial.parties[0].settings.lotus.squadId, initial.squads[1].id);
  assert.equal(initial.squads[0].name, "다른 이름");
  assert.equal(initial.parties[0].clears.lotus, "2026-11-19");
});

test("invalid, incompatible, duplicated, and dangling settings are rejected before applying", () => {
  assert.throws(() => parseSettings("not JSON"), /읽을 수 없어요/);
  assert.throws(() => roundTrip({ ...exported(), version: 2 }), /형식/);
  const duplicate = exported();
  duplicate.characters.push(duplicate.characters[0]);
  assert.throws(() => roundTrip(duplicate), /같은 캐릭터/);
  const dangling = exported();
  dangling.squads = [];
  assert.throws(() => roundTrip(dangling), /연결할 수 없는/);
  const outOfBounds = exported();
  outOfBounds.characters[0].settings.lotus.size = 6;
  assert.throws(() => roundTrip(outOfBounds), /보스 설정/);
});
