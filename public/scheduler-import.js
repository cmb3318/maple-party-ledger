import { bosses, newParty, period, raidFor, recordClear } from "./model.js";
import { maxPlayers } from "./crystals.js";

const catalog = new Map(bosses.map((boss) => [boss.id, boss]));
const key = (name) => name.normalize("NFC").toLowerCase();
const findCharacter = (state, name) =>
  state.parties.find((row) => key(row.name) === key(name));
const sameWorld = (character, world) =>
  !character?.profile?.world || key(character.profile.world) === key(world);

export function previewSchedulerImport(state, entries) {
  return entries.map((entry) => {
    const character = findCharacter(state, entry.profile.name);
    const blocked = !sameWorld(character, entry.profile.world);
    const plans = entry.plans.flatMap((plan) => {
      const boss = catalog.get(plan.bossId);
      if (!boss) return [];
      const local = character?.targets.includes(boss.id)
        ? raidFor(character, boss, state.squads)
        : null;
      if (!plan.registeredLevels.length && (!local || local.level !== plan.clearLevel))
        return [];
      const levels = [...new Set([local?.level, ...plan.registeredLevels, plan.clearLevel].filter(Boolean))];
      const level = local?.level ?? (plan.registeredLevels.length === 1 ? plan.registeredLevels[0] : "");
      return [{ ...plan, levels, level, previous: local?.level ?? "" }];
    });
    return { ...entry, plans, blocked, existing: Boolean(character) };
  });
}

export function applySchedulerImport(state, selected, now = Date.now()) {
  const result = { characters: 0, added: 0, changed: 0, cleared: 0, skipped: 0 };
  for (const entry of selected) {
    const { profile } = entry;
    let character = findCharacter(state, profile.name);
    if (!sameWorld(character, profile.world)) {
      result.skipped += 1;
      continue;
    }
    if (!character) {
      character = newParty(profile.name);
      state.parties.push(character);
    }
    const cached = character.profile;
    const picture = !profile.image && cached?.image
      ? { image: cached.image, fetchedAt: cached.fetchedAt }
      : {};
    character.profile = { ...profile, ...picture, name: character.name };
    result.characters += 1;
    state.active ||= character.name;
    for (const plan of entry.plans) {
      const boss = catalog.get(plan.bossId);
      if (!boss?.levels.includes(plan.level) || !plan.levels.includes(plan.level) ||
          period(boss.cycle, now).key !== plan.periodKey) {
        result.skipped += 1;
        continue;
      }
      const local = character.targets.includes(boss.id)
        ? raidFor(character, boss, state.squads, now)
        : null;
      if ((local?.level ?? "") !== plan.previous && local?.level !== plan.level) {
        result.skipped += 1;
        continue;
      }
      if (!local && !plan.registeredLevels.length) {
        result.skipped += 1;
        continue;
      }
      if (!local) {
        character.targets.push(boss.id);
        result.added += 1;
      }
      if (local?.level !== plan.level) {
        const old = character.settings[boss.id] ?? {};
        const squad = state.squads.find((row) => row.id === old.squadId);
        character.settings[boss.id] = {
          ...old, level: plan.level,
          size: Math.min(maxPlayers(boss, plan.level), old.size ?? squad?.size ?? 1),
        };
        if (local) result.changed += 1;
      }
      if (plan.clearLevel === plan.level && recordClear(state, {
        name: character.name, bossId: boss.id, periodKey: plan.periodKey,
        level: plan.level, done: true, source: "nexon",
      }, now)) result.cleared += 1;
    }
  }
  return result;
}
