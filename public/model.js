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
export function recordClear(state, entry, now = Date.now()) {
  const { name, bossId, periodKey, done, source = "manual", level } = entry;
  const boss = bosses.find((item) => item.id === bossId);
  const character = state.parties.find((item) => item.name === name);
  if (
    !boss ||
    !character?.targets.includes(bossId) ||
    period(boss.cycle, now).key !== periodKey
  )
    return null;
  if (level && raidFor(character, boss, state.squads, now).level !== level)
    return null;
  const previous = isCleared(character, boss, now);
  if (previous === done) return null;
  const details = (character.clearDetails ??= {});
  const before = previous ? details[bossId] : undefined;
  const after = done ? { period: periodKey, at: now, source } : undefined;
  if (after) {
    character.clears[bossId] = periodKey;
    details[bossId] = after;
  } else {
    delete character.clears[bossId];
    delete details[bossId];
  }
  return { name, bossId, periodKey, previous, before, after };
}
export function undoClear(state, receipt, now = Date.now()) {
  const { name, bossId, periodKey, previous, before, after } = receipt;
  const boss = bosses.find((item) => item.id === bossId);
  const character = state.parties.find((item) => item.name === name);
  if (
    !boss ||
    !character ||
    period(boss.cycle, now).key !== periodKey ||
    isCleared(character, boss, now) !== Boolean(after)
  )
    return false;
  const details = (character.clearDetails ??= {});
  if (
    after &&
    (details[bossId]?.at !== after.at ||
      details[bossId]?.source !== after.source)
  )
    return false;
  if (previous) character.clears[bossId] = periodKey;
  else delete character.clears[bossId];
  if (before) details[bossId] = before;
  else delete details[bossId];
  return true;
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
  const done = isCleared(character, boss, now);
  return {
    boss,
    character,
    level,
    squad,
    size,
    note: config.note ?? "",
    value: share(boss, level, size),
    done,
    recorded: done ? character.clearDetails?.[boss.id] : undefined,
  };
}
export function plannedRaids(state, now) {
  return state.parties.flatMap((character) =>
    bosses
      .filter((boss) => character.targets.includes(boss.id))
      .map((boss) => raidFor(character, boss, state.squads, now)),
  );
}
export function saveBossPlan(
  state,
  sourceName,
  edits,
  recipients,
  copies,
  replace,
) {
  const source = state.parties.find(
    (character) => character.name === sourceName,
  );
  if (!source) return 0;
  const allowed = new Map(bosses.map((boss) => [boss.id, boss]));
  const squads = new Set(state.squads.map((squad) => squad.id));

  function apply(character, rows, replaceList) {
    const targets = new Set(character.targets);
    if (replaceList) {
      for (const id of allowed.keys()) targets.delete(id);
    }
    for (const { id, included, level, squadId, size } of rows) {
      const boss = allowed.get(id);
      if (!boss) continue;
      if (!included) {
        targets.delete(id);
        continue;
      }
      targets.add(id);
      character.settings[id] = {
        ...character.settings[id],
        level,
        squadId: squads.has(squadId) ? squadId : "",
        size: Math.min(size, maxPlayers(boss, level)),
      };
    }
    character.targets = [...targets];
  }

  apply(source, edits, false);
  let count = 1;
  for (const character of state.parties) {
    if (character === source || !recipients.has(character.name)) continue;
    apply(character, copies, replace);
    count += 1;
  }
  return count;
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
