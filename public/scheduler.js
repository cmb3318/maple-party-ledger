import { bosses, period, safeImage, validName } from "./model.js";

const base = "https://open.api.nexon.com/maplestory/v1/";
const normalize = (value) =>
  typeof value === "string"
    ? value.normalize("NFC").replace(/\s+/gu, "").toLowerCase()
    : "";
const difficulty = new Map([
  ["easy", "이지"],
  ["normal", "노멀"],
  ["hard", "하드"],
  ["chaos", "카오스"],
  ["extreme", "익스트림"],
  ["이지", "이지"],
  ["노멀", "노멀"],
  ["노말", "노멀"],
  ["하드", "하드"],
  ["카오스", "카오스"],
  ["익스트림", "익스트림"],
]);
const aliases = {
  dusk: ["거대괴수더스크"],
  darknell: ["친위대장듄켈"],
  seren: ["세렌"],
  kalos: ["칼로스"],
};

function schedulerDate(value) {
  if (typeof value !== "string") return NaN;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  if (
    !dateOnly &&
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:\+09:00|Z)$/.test(
      value,
    )
  )
    return NaN;
  return Date.parse(dateOnly ? value + "T00:00:00+09:00" : value);
}

const isTrue = (flag) => flag === true || flag === "true";

export function schedulerPlan(snapshot, now = Date.now()) {
  const lookedUp = schedulerDate(snapshot?.date);
  if (
    !Number.isFinite(lookedUp) ||
    lookedUp > now ||
    !Array.isArray(snapshot.boss_contents)
  )
    return [];
  return bosses.flatMap((boss) => {
    const periodKey = period(boss.cycle, now).key;
    if (period(boss.cycle, lookedUp).key !== periodKey) return [];
    const names = [normalize(boss.name), ...(aliases[boss.id] ?? [])];
    const cycle = boss.cycle === "weekly" ? "bossweekly" : "bossmonthly";
    const matches = snapshot.boss_contents.filter(
      (row) =>
        row &&
        normalize(row.cycle) === cycle &&
        names.includes(normalize(row.content_name)),
    );
    const levels = (flag) => new Set(
      matches.filter((row) => isTrue(row[flag]))
        .map((row) => difficulty.get(normalize(row.difficulty))),
    );
    const registeredLevels = [...levels("registration_flag")].filter(
      (level) => boss.levels.includes(level),
    );
    const completed = levels("complete_flag");
    const clearLevel = completed.size === 1
      ? boss.levels.find((level) => completed.has(level)) ?? null
      : null;
    if (!registeredLevels.length && !clearLevel) return [];
    return [{
      bossId: boss.id, bossName: boss.name, cycle: boss.cycle,
      periodKey, registeredLevels, clearLevel,
    }];
  });
}

export function schedulerCandidates(snapshot, raids, now = Date.now()) {
  const plans = new Map(schedulerPlan(snapshot, now).map((plan) => [plan.bossId, plan]));
  if (!plans.size) return [];
  return raids.flatMap((raid) => {
    const { boss, level, character } = raid;
    if (
      raid.done ||
      normalize(character.name) !== normalize(snapshot.character_name) ||
      (character.profile?.world &&
        normalize(character.profile.world) !== normalize(snapshot.world_name))
    )
      return [];
    const plan = plans.get(boss.id);
    if (plan?.clearLevel !== level) return [];
    return [
      {
        name: character.name,
        bossId: boss.id,
        bossName: boss.name,
        periodKey: plan.periodKey,
        level,
        done: true,
        source: "nexon",
      },
    ];
  });
}

class NexonError extends Error {}
function reason(status, code) {
  if (code === "OPENAPI00005" || status === 401)
    return "API 키가 유효하지 않아요.";
  if (status === 403 || code === "OPENAPI00002")
    return "이 키로 조회할 수 없는 계정이에요.";
  if (status === 429 || code === "OPENAPI00007")
    return "조회 한도에 도달했어요. 잠시 후 다시 시도해 주세요.";
  if (code === "OPENAPI00003" || code === "OPENAPI00004")
    return "조회 가능한 스케줄러 기록이 없어요.";
  return "넥슨에서 정보를 가져오지 못했어요.";
}

export function schedulerRequest(key, signal, fetcher = fetch) {
  return async (path, params) => {
    const url = new URL(path, base);
    if (params) url.search = new URLSearchParams(params);
    const res = await fetcher(url, {
      headers: { "x-nxopen-api-key": key },
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body?.error)
      throw new NexonError(reason(res.status, body?.error?.name));
    return body;
  };
}

export async function schedulerRoster(request) {
  const roster = await request("character/list");
  if (!Array.isArray(roster?.account_list))
    throw new NexonError("넥슨 계정의 캐릭터 목록을 읽지 못했어요.");
  const owned = roster.account_list.flatMap((account) =>
    Array.isArray(account?.character_list) ? account.character_list : [],
  );
  const unique = new Map();
  for (const row of owned) {
    if (!validName(row?.character_name) || typeof row.ocid !== "string" ||
        !row.ocid || typeof row.world_name !== "string" || !row.world_name)
      continue;
    unique.set(row.ocid, row);
  }
  return [...unique.values()];
}

async function readScheduler(request, owner) {
  const snapshot = await request("scheduler/character-state", { ocid: owner.ocid });
  if (
    !Array.isArray(snapshot?.boss_contents) ||
    normalize(snapshot.character_name) !== normalize(owner.character_name) ||
    !Number.isFinite(schedulerDate(snapshot.date)) ||
    normalize(snapshot.world_name) !== normalize(owner.world_name)
  )
    throw new NexonError("스케줄러 응답을 확인할 수 없어요");
  return snapshot;
}

export async function scanSchedulerCharacters({
  request, characters, signal, onProgress = () => {}, now = Date.now(),
}) {
  const results = [];
  for (const [index, owner] of characters.entries()) {
    signal.throwIfAborted();
    onProgress(index + 1, characters.length);
    const name = owner.character_name;
    const world = owner.world_name;
    const profile = {
      name, world, job: String(owner.character_class ?? ""),
      level: Number(owner.character_level) || null,
      image: "", fetchedAt: now,
    };
    const entry = { profile, plans: [], schedulerError: "", imageError: false };
    try {
      const snapshot = await readScheduler(request, owner);
      entry.plans = schedulerPlan(snapshot, now);
    } catch (error) {
      signal.throwIfAborted();
      entry.schedulerError = schedulerError(error);
    }
    await schedulerPause();
    signal.throwIfAborted();
    try {
      const basic = await request("character/basic", { ocid: owner.ocid });
      const sameCharacter = normalize(basic?.character_name) === normalize(name) &&
        normalize(basic?.world_name) === normalize(world);
      profile.image = sameCharacter ? safeImage(basic.character_image) : "";
      entry.imageError = !profile.image;
    } catch {
      signal.throwIfAborted();
      entry.imageError = true;
    }
    results.push(entry);
    if (index + 1 < characters.length) await schedulerPause();
  }
  return results;
}

const schedulerPause = () => new Promise((resolve) => setTimeout(resolve, 270));

export async function fetchSchedulerChanges({
  key,
  raids,
  signal,
  onProgress,
  fetcher = fetch,
}) {
  const request = schedulerRequest(key, signal, fetcher);
  const owned = await schedulerRoster(request);
  const groups = new Map();
  for (const raid of raids) {
    if (!groups.has(raid.character.name)) groups.set(raid.character.name, []);
    groups.get(raid.character.name).push(raid);
  }
  const result = { candidates: [], unavailable: [], checked: 0 };
  let current = 0;
  for (const [name, plans] of groups) {
    signal.throwIfAborted();
    onProgress(++current, groups.size);
    const world = plans[0].character.profile?.world;
    const matches = owned.filter(
      (character) =>
        character &&
        typeof character.ocid === "string" &&
        normalize(character.character_name) === normalize(name) &&
        (!world || normalize(character.world_name) === normalize(world)),
    );
    if (matches.length !== 1) {
      result.unavailable.push(
        name +
          " · " +
          (matches.length
            ? "월드를 먼저 확인해 주세요"
            : "키의 계정에서 찾을 수 없어요"),
      );
      continue;
    }
    const [owner] = matches;
    try {
      const snapshot = await readScheduler(request, owner);
      result.checked += 1;
      result.candidates.push(...schedulerCandidates(snapshot, plans));
    } catch (error) {
      if (signal.aborted) throw error;
      result.unavailable.push(name + " · " + schedulerError(error));
    } finally {
      // Keep consecutive calls inside the development-key common rate limit.
      if (current < groups.size && !signal.aborted)
        await schedulerPause();
    }
  }
  return result;
}
export function schedulerError(error) {
  return error instanceof NexonError
    ? error.message
    : "넥슨에 연결할 수 없어요. 잠시 후 다시 시도해 주세요.";
}
