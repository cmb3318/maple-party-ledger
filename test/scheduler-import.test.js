import assert from "node:assert/strict";
import test from "node:test";
import { newParty, period } from "../public/model.js";
import { schedulerPlan, schedulerRoster, scanSchedulerCharacters } from "../public/scheduler.js";
import { applySchedulerImport, previewSchedulerImport } from "../public/scheduler-import.js";

const now = Date.parse("2026-11-27T10:00:00+09:00");
const profile = { name: "예시법사", world: "루나", image: "", fetchedAt: now };
const weekly = period("weekly", now).key;
const monthly = period("monthly", now).key;
const observed = {
  date: "2026-11-27", character_name: profile.name, world_name: profile.world,
  boss_contents: [
    { content_name: "스우", difficulty: "normal", cycle: "bossWeekly", registration_flag: true, complete_flag: false },
    { content_name: "스우", difficulty: "hard", cycle: "bossWeekly", registration_flag: false, complete_flag: true },
    { content_name: "검은마법사", difficulty: "hard", cycle: "bossMonthly", registration_flag: true, complete_flag: true },
    { content_name: "데미안", difficulty: "hard", cycle: "bossWeekly", registration_flag: false, complete_flag: true },
  ],
};
const entry = () => ({ profile, plans: schedulerPlan(observed, now) });

test("a fresh import keeps one default per registered boss and adds only difficulty-matched clears", () => {
  const state = { parties: [], squads: [] };
  const preview = previewSchedulerImport(state, [entry()]);
  assert.deepEqual(preview[0].plans.map((plan) => plan.bossId), ["lotus", "blackmage"]);
  assert.deepEqual(preview[0].plans[0].levels, ["노멀", "하드"]);
  assert.deepEqual(applySchedulerImport(state, preview, now), {
    characters: 1, added: 2, changed: 0, cleared: 1, skipped: 0,
  });
  assert.deepEqual(state.parties[0].clears, { blackmage: monthly });
  assert.equal(state.parties[0].settings.lotus.level, "노멀");
  const next = previewSchedulerImport(state, [entry()]);
  next[0].plans[0].level = "하드";
  assert.equal(applySchedulerImport(state, next, now).cleared, 1);
  assert.equal(state.parties[0].clears.lotus, weekly);
});

test("party settings, manually recorded clears, and conflicting worlds remain intact", () => {
  const character = newParty(profile.name);
  character.profile = {
    ...profile, image: "https://open.api.nexon.com/static/cached.png",
    level: 275, fetchedAt: now - 1000,
  };
  character.targets = ["lotus"];
  character.settings.lotus = { level: "노멀", size: 3, note: "저녁", squadId: "a" };
  character.clears.lotus = weekly;
  const state = { parties: [character], squads: [{ id: "a", size: 3 }] };
  const [item] = previewSchedulerImport(state, [
    { ...entry(), profile: { ...profile, level: 276 } },
  ]);
  item.plans[0].level = "하드";
  applySchedulerImport(state, [item], now);
  assert.deepEqual(character.settings.lotus, { level: "하드", size: 3, note: "저녁", squadId: "a" });
  assert.equal(character.clears.lotus, weekly);
  assert.equal(character.profile.level, 276);
  assert.match(character.profile.image, /cached\.png$/);
  assert.equal(character.profile.fetchedAt, now - 1000);
  const [blocked] = previewSchedulerImport(state, [{ ...entry(), profile: { ...profile, world: "크로아" } }]);
  assert.equal(blocked.blocked, true);
  assert.equal(applySchedulerImport(state, [blocked], now).characters, 0);
});

test("a reset or another edit after preview prevents stale boss updates", () => {
  const character = newParty(profile.name);
  character.targets = ["lotus"];
  character.settings.lotus = { level: "노멀" };
  const state = { parties: [character], squads: [] };
  const [item] = previewSchedulerImport(state, [entry()]);
  item.plans[0].level = "하드";
  character.settings.lotus.level = "익스트림";
  const nextWeek = now + 7 * 86_400_000;
  const result = applySchedulerImport(state, [item], nextWeek);
  assert.equal(result.skipped, 2);
  assert.equal(character.settings.lotus.level, "익스트림");
  assert.deepEqual(character.clears, {});
});

test("selected scan reports scheduler failures without exposing account identifiers", async () => {
  const owner = { ocid: "private-ocid", character_name: profile.name, world_name: profile.world };
  const request = async (route) => {
    if (route === "character/list")
      return { account_list: [{ character_list: [null, owner, owner] }] };
    if (route === "character/basic")
      return { character_name: profile.name, world_name: profile.world,
        character_image: "https://open.api.nexon.com/static/example.png" };
    return { ...observed, world_name: "다른 월드" };
  };
  const characters = await schedulerRoster(request);
  assert.deepEqual(characters, [owner]);
  const [output] = await scanSchedulerCharacters({
    request, characters, signal: new AbortController().signal, now,
  });
  assert.match(output.schedulerError, /확인할 수 없어요/);
  assert.deepEqual(output.plans, []);
  assert.ok(output.profile.image);
  assert.ok(!JSON.stringify(output).includes(owner.ocid));
});
