import { bosses, bossViewOrder, newParty, raidFor, validName } from "./model.js";
import { maxPlayers } from "./crystals.js";
import { partyColor, validPartyColor } from "./party-colors.js";

const format = "maple-party-ledger-settings";
const catalog = new Map(bosses.map((boss) => [boss.id, boss]));
const keyFor = (name) => name.normalize("NFC").toLowerCase();
const isObject = (value) => Boolean(value && typeof value === "object" && !Array.isArray(value));
const text = (value, limit) => typeof value === "string" && value.length <= limit;
const partyId = (value) => typeof value === "string" && /^[a-z0-9_-]{1,80}$/i.test(value);
const unique = (items) => new Set(items).size === items.length;
const inRange = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;

export function exportSettings(state) {
  return {
    format,
    version: 1,
    squads: state.squads.map((squad) => ({
      id: squad.id,
      name: squad.name,
      size: squad.size,
      color: partyColor(squad),
      note: squad.note ?? "",
    })),
    characters: state.parties.map((character) => {
      const targets = [...new Set(character.targets.filter((id) => catalog.has(id)))];
      const configured = new Set([...targets, ...Object.keys(character.settings)]);
      const settings = Object.fromEntries([...configured].flatMap((id) => {
        const boss = catalog.get(id);
        if (!boss) return [];
        const { level, size, squad, note } = raidFor(character, boss, state.squads);
        return [[id, { level, size, squadId: squad?.id ?? "", note }]];
      }));
      return { name: character.name, targets, settings };
    }),
    bossOrder: bossViewOrder(state).map((boss) => boss.id),
  };
}

function requireValid(condition, message) {
  if (!condition) throw new Error(message);
}
export function parseSettings(source) {
  let data;
  try {
    data = JSON.parse(source.replace(/^\uFEFF/, ""));
  } catch {
    throw new Error("설정 파일을 읽을 수 없어요. 메이플가계부에서 내보낸 JSON을 선택해 주세요.");
  }
  requireValid(data?.format === format && data.version === 1,
    "지원하는 메이플가계부 설정 파일 형식이 아니에요.");
  requireValid(
    Array.isArray(data.squads) && Array.isArray(data.characters) &&
    data.squads.length + data.characters.length > 0,
    "가져올 파티 또는 캐릭터 목록을 확인해 주세요.",
  );
  const squads = data.squads.map((entry) => {
    requireValid(
      isObject(entry) && partyId(entry.id) && text(entry.name, 32) && entry.name.trim() &&
      inRange(entry.size, 2, 6) && validPartyColor(entry.color) && text(entry.note, 100),
      "파일에 잘못된 파티 이름, 인원, 색 또는 메모가 있어요.",
    );
    return { id: entry.id, name: entry.name.trim().normalize("NFC"), size: entry.size,
      color: entry.color.toLowerCase(), note: entry.note };
  });
  const ids = new Set(squads.map(({ id }) => id));
  requireValid(ids.size === squads.length && unique(squads.map(({ name }) => keyFor(name))),
    "파일에 같은 파티 또는 같은 파티 식별자가 두 번 들어 있어요.");
  const characters = data.characters.map((entry) => {
    requireValid(isObject(entry) && validName(entry.name) && Array.isArray(entry.targets) &&
      unique(entry.targets) && entry.targets.every((id) => catalog.has(id)) && isObject(entry.settings),
      "파일의 캐릭터 이름 또는 등록 보스 목록을 확인해 주세요.");
    const settings = Object.fromEntries(Object.entries(entry.settings).map(([id, config]) => {
      const boss = catalog.get(id);
      requireValid(boss && isObject(config) && boss.levels.includes(config.level) &&
        inRange(config.size, 1, maxPlayers(boss, config.level)) &&
        (config.squadId === "" || ids.has(config.squadId)) && text(config.note, 100),
        "파일에 지원하지 않는 보스 설정이나 연결할 수 없는 파티가 있어요.");
      return [id, { level: config.level, size: config.size, squadId: config.squadId, note: config.note }];
    }));
    requireValid(entry.targets.every((id) => Object.hasOwn(settings, id)),
      "파일에 등록 보스의 난이도 또는 배정 정보가 빠져 있어요.");
    return { name: entry.name, targets: entry.targets, settings };
  });
  requireValid(unique(characters.map(({ name }) => keyFor(name))),
    "파일에 같은 캐릭터가 두 번 들어 있어요.");
  requireValid(Array.isArray(data.bossOrder) && unique(data.bossOrder) &&
    data.bossOrder.every((id) => catalog.has(id)), "파일의 보스 보기 순서를 확인해 주세요.");
  return { squads, characters, bossOrder: data.bossOrder };
}

export function settingsSummary(state, file) {
  const names = new Set(state.parties.map(({ name }) => keyFor(name)));
  const squads = new Set(state.squads.map(({ name }) => keyFor(name)));
  return {
    matchedCharacters: file.characters.filter(({ name }) => names.has(keyFor(name))).length,
    matchedSquads: file.squads.filter(({ name }) => squads.has(keyFor(name))).length,
    targets: file.characters.reduce((sum, { targets }) => sum + targets.length, 0),
  };
}

export function mergeSettings(state, file, keepTargets = true) {
  const summary = settingsSummary(state, file);
  const squads = new Map(state.squads.map((squad) => [keyFor(squad.name), squad]));
  const usedIds = new Set(state.squads.map(({ id }) => id));
  const remap = new Map();
  for (const incoming of file.squads) {
    const existing = squads.get(keyFor(incoming.name));
    if (existing) {
      remap.set(incoming.id, existing.id);
      Object.assign(existing, { size: incoming.size, color: incoming.color, note: incoming.note });
      continue;
    }
    let id = incoming.id;
    while (usedIds.has(id)) id = crypto.randomUUID();
    usedIds.add(id);
    remap.set(incoming.id, id);
    state.squads.push({ ...incoming, id });
  }
  const characters = new Map(state.parties.map((character) => [keyFor(character.name), character]));
  for (const incoming of file.characters) {
    const existing = characters.get(keyFor(incoming.name));
    const character = existing ?? newParty(incoming.name);
    if (!existing) state.parties.push(character);
    const oldTargets = new Set(character.targets);
    const newTargets = new Set(incoming.targets);
    const settings = Object.fromEntries(Object.entries(incoming.settings).map(([id, config]) =>
      [id, { ...config, squadId: remap.get(config.squadId) ?? "" }]));
    if (keepTargets)
      for (const id of oldTargets)
        if (!newTargets.has(id)) delete settings[id];
    character.settings = keepTargets ? { ...character.settings, ...settings } : settings;
    character.targets = keepTargets ? [...new Set([...oldTargets, ...newTargets])] : [...newTargets];
  }
  if (!state.active) state.active = state.parties[0]?.name ?? "";
  state.bossOrder = [...new Set([...file.bossOrder, ...bossViewOrder(state).map((boss) => boss.id)])];
  return summary;
}
