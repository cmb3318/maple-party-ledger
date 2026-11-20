import { bosses, maxPlayers, share } from "./crystals.js";
export { bosses };
export const storageKey = "maple-party-ledger.v1";
const day = 86400000;
const offset = 9 * 3600000;
export function period(cycle, time = Date.now()) {
  const date = new Date(Number(time) + offset);
  const midnight = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  );
  const monthly = cycle === "monthly";
  const start = monthly
    ? Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)
    : midnight - ((date.getUTCDay() + 3) % 7) * day;
  const end = monthly
    ? Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)
    : start + 7 * day;
  return {
    key: new Date(start).toISOString().slice(0, 10),
    start: start - offset,
    end: end - offset,
  };
}
export function newParty(name) {
  return {
    name,
    profile: null,
    targets: [],
    settings: {},
    clears: {},
  };
}
export function isCleared(party, boss, now) {
  return party.clears[boss.id] === period(boss.cycle, now).key;
}
export function raidFor(character, boss, squads, now) {
  const config = character.settings[boss.id] ?? {};
  const level = boss.levels.includes(config.level)
    ? config.level
    : boss.levels.includes("하드")
      ? "하드"
      : boss.levels.at(-1);
  const squad = squads.find((item) => item.id === config.squadId);
  const size = Math.min(
    maxPlayers(boss, level),
    config.size ?? squad?.size ?? 1,
  );
  return {
    boss,
    character,
    level,
    squad,
    size,
    note: config.note ?? "",
    value: share(boss, level, size),
    done: isCleared(character, boss, now),
  };
}
export function plannedRaids(state, now) {
  return state.parties.flatMap((character) =>
    bosses
      .filter((boss) => character.targets.includes(boss.id))
      .map((boss) => raidFor(character, boss, state.squads, now)),
  );
}
export function totals(raids) {
  return raids.reduce(
    (total, raid) => {
      const cycle = total[raid.boss.cycle];
      cycle.planned += raid.value;
      cycle.done += raid.done ? raid.value : 0;
      cycle.count += 1;
      cycle.cleared += Number(raid.done);
      return total;
    },
    {
      weekly: { planned: 0, done: 0, count: 0, cleared: 0 },
      monthly: { planned: 0, done: 0, count: 0, cleared: 0 },
    },
  );
}
export function validName(value) {
  return typeof value === "string" && /^[가-힣a-zA-Z0-9]{2,12}$/u.test(value);
}
export function safeImage(value) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      !u.port &&
      ["open.api.nexon.com", "avatar.maplestory.nexon.com"].includes(u.hostname)
      ? u.href
      : "";
  } catch {
    return "";
  }
}
export function readState(raw) {
  if (!raw) return { version: 1, active: "", parties: [], squads: [] };
  const state = JSON.parse(raw);
  if (state?.version !== 1 || !Array.isArray(state.parties))
    throw new Error("invalid storage");
  for (const p of state.parties) {
    if (
      !validName(p?.name) ||
      !Array.isArray(p.targets) ||
      !p.settings ||
      !p.clears ||
      typeof p.settings !== "object" ||
      typeof p.clears !== "object"
    )
      throw new Error("invalid character");
    if (p.profile && !(Date.now() - p.profile.fetchedAt < 30 * 86400000))
      p.profile = null;
  }
  if (!Array.isArray(state.squads)) state.squads = [];
  if (!state.parties.some((p) => p.name === state.active))
    state.active = state.parties[0]?.name || "";
  return state;
}
