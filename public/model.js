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
const catalog = [
  ["lotus", "스우", "노멀 하드 익스트림"],
  ["damien", "데미안", "노멀 하드"],
  ["slime", "가디언 엔젤 슬라임", "노멀 카오스"],
  ["lucid", "루시드", "이지 노멀 하드"],
  ["will", "윌", "이지 노멀 하드"],
  ["dusk", "더스크", "노멀 카오스"],
  ["hilla", "진 힐라", "노멀 하드"],
  ["darknell", "듄켈", "노멀 하드"],
  ["blackmage", "검은 마법사", "하드 익스트림"],
  ["seren", "선택받은 세렌", "노멀 하드 익스트림"],
  ["kalos", "감시자 칼로스", "이지 노멀 카오스 익스트림"],
  ["adversary", "최초의 대적자", "이지 노멀 하드 익스트림"],
  ["kaling", "카링", "이지 노멀 하드 익스트림"],
  ["star", "찬란한 흉성", "노멀 하드"],
  ["bellona", "벨로나", "이지 노멀 하드"],
  ["limbo", "림보", "노멀 하드 익스트림"],
  ["baldrix", "발드릭스", "노멀 하드 익스트림"],
  ["jupiter", "유피테르", "노멀 하드"],
  ["zakum", "자쿰", "카오스"],
  ["magnus", "매그너스", "하드"],
  ["pinkbean", "핑크빈", "카오스"],
  ["cygnus", "시그너스", "이지 노멀"],
  ["papulatus", "파풀라투스", "카오스"],
  ["queen", "블러디 퀸", "카오스"],
  ["pierre", "피에르", "카오스"],
  ["vonbon", "반반", "카오스"],
  ["vellum", "벨룸", "카오스"],
  ["hillahard", "힐라", "하드"],
];
export const bosses = catalog.map(([id, name, levels]) => ({
  id,
  name,
  levels: levels.split(" "),
  cycle: id === "blackmage" ? "monthly" : "weekly",
}));
export const initialIds = [
  "lotus",
  "damien",
  "slime",
  "lucid",
  "will",
  "dusk",
  "blackmage",
];
export function newParty(name) {
  return {
    name,
    profile: null,
    targets: [...initialIds],
    settings: {},
    clears: {},
  };
}
export function isCleared(party, boss, now) {
  return party.clears[boss.id] === period(boss.cycle, now).key;
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
  if (!raw) return { version: 1, active: "", parties: [] };
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
  if (!state.parties.some((p) => p.name === state.active))
    state.active = state.parties[0]?.name || "";
  return state;
}
