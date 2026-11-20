import { setupBulk } from "./bulk.js";
import { setupRecords } from "./records.js";
import {
  bosses,
  newParty,
  period,
  plannedRaids,
  raidFor,
  totals,
  safeImage,
  storageKey,
  readState,
  validName,
} from "./model.js";
import { maxPlayers, share, priceDate, minimumPrice } from "./crystals.js";
import {
  palette,
  paintParty,
  partyColor,
  nextPartyColor,
} from "./party-colors.js";
const $ = (id) => document.getElementById(id);
function el(tag, text = "", cls = "") {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (cls) node.className = cls;
  return node;
}
let temporary = false;
function warn(text) {
  $("warning").hidden = false;
  $("warning").textContent = text;
}
function load() {
  try {
    return readState(localStorage.getItem(storageKey));
  } catch {
    temporary = true;
    warn(
      "저장 기록을 읽을 수 없어 이번 창에서만 기록해요. 기존 저장 내용은 보존돼요.",
    );
    return readState(null);
  }
}
let state = load();
let mode = "characters";
let interaction = "check";
let displayedChecks = [];
let busy = false;
const folded = new Set();
let partyFilter = "";

let lastPeriod = "";
const dateFormat = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "numeric",
  day: "numeric",
});
function update(change) {
  const apply = () => {
    if (!temporary) {
      const fresh = load();
      if (!temporary) state = fresh;
    }
    change(state);
    if (!temporary) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(state));
      } catch {
        temporary = true;
        warn(
          "브라우저에 저장할 수 없어요. 이번 창을 닫으면 변경 사항이 사라져요.",
        );
      }
    }
    render();
  };
  return navigator.locks
    ? navigator.locks.request(storageKey, apply)
    : Promise.resolve(apply());
}
function addProfile(name, profile) {
  return update((s) => {
    let p = s.parties.find(
      (item) => item.name.toLowerCase() === name.toLowerCase(),
    );
    if (!p) {
      p = newParty(name);
      s.parties.push(p);
    }
    if (profile) p.profile = profile;
    s.active = p.name;
    mode = "characters";
  });
}
function inputName() {
  const input = $("nickname");
  const name = input.value.trim().normalize("NFC");
  input.setCustomValidity(
    validName(name) ? "" : "한글, 영문, 숫자 2~12자로 입력해 주세요.",
  );
  if (!input.reportValidity()) return "";
  return name;
}
$("nickname").oninput = () => {
  $("nickname").setCustomValidity("");
  $("lookupMsg").textContent = "";
};
$("manual").onclick = async () => {
  const name = inputName();
  if (!name) return;
  await addProfile(name, null);
  $("characterDialog").close();
  $("nickname").value = "";
};
$("add").onsubmit = async (event) => {
  event.preventDefault();
  const name = inputName();
  if (!name || busy) return;
  busy = true;
  for (const id of ["lookup", "manual", "nickname"]) $(id).disabled = true;
  $("lookupMsg").textContent = "넥슨에서 캐릭터를 찾고 있어요…";
  try {
    const response = await fetch(
      "/api/character?" + new URLSearchParams({ name }),
      { signal: AbortSignal.timeout(12000) },
    );
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "조회에 실패했어요.");
    if (!validName(data.name))
      throw new Error("캐릭터 정보를 확인할 수 없어요.");
    await addProfile(data.name, data);
    $("nickname").value = "";
    $("characterDialog").close();
  } catch (err) {
    $("lookupMsg").textContent =
      err instanceof SyntaxError ||
      err instanceof TypeError ||
      err.name === "TimeoutError"
        ? "서버에 연결할 수 없어요. 이름으로 직접 추가할 수 있어요."
        : err.message;
  } finally {
    busy = false;
    for (const id of ["lookup", "manual", "nickname"]) $(id).disabled = false;
  }
};

const number = new Intl.NumberFormat("ko-KR");
const meso = (n) => number.format(n) + " 메소";
const cycleName = (cycle) => (cycle === "monthly" ? "월간" : "주간");
const partyName = (raid) =>
  raid.squad?.name || (raid.size === 1 ? "솔로" : "파티 미지정");
function button(text, handler, cls = "") {
  const node = el("button", text, cls);
  node.type = "button";
  node.onclick = handler;
  return node;
}
function openCharacter(name = "") {
  $("nickname").value = name;
  $("nickname").setCustomValidity("");
  $("lookupMsg").textContent = "";
  $("characterDialog").showModal();
}
function portrait(character) {
  const image = el("img", "", "portrait");
  const source = safeImage(character.profile?.image);
  image.alt = "";
  image.src = source || "/leaf.png";
  image.classList.toggle("fallback", !source);
  image.onerror = () => {
    image.onerror = null;
    image.src = "/leaf.png";
    image.classList.add("fallback");
  };
  return image;
}
function bossIcon(boss) {
  const image = el("img", "", "emblem");
  image.alt = "";
  image.src = "/badges/" + boss.id + ".png";
  return image;
}
function raidRow(raid, grouping, now) {
  const { boss, character, level, size, value, done, note, squad } = raid;
  const key = character.name + "-" + boss.id;
  const title = grouping === "bosses" ? character.name : boss.name;
  const name = el("b", title);
  name.title = title;
  if (interaction === "check") {
    displayedChecks.push(raid);
    const displayed = period(boss.cycle, now).key;
    const line = button(
      "",
      () => records.toggle(raid, !done, displayed),
      "raid-row check-row" + (done ? " cleared" : ""),
    );
    paintParty(line, squad);
    line.dataset.raid = key;
    line.dataset.focus = "check-" + key;
    line.setAttribute("aria-pressed", done);
    line.setAttribute(
      "aria-label",
      [
        character.name,
        level,
        boss.name,
        partyName(raid),
        size + "인",
        note,
        meso(value),
      ]
        .filter(Boolean)
        .join(" · "),
    );
    const mark = el("span", done ? "✓" : "", "check-mark");
    mark.setAttribute("aria-hidden", "true");
    const identity = el("span", "", "check-identity");
    identity.append(
      grouping === "bosses" ? portrait(character) : bossIcon(boss),
      name,
    );
    const details = el("span", "", "check-details");
    details.append(
      el("span", level),
      el("span", partyName(raid), "raid-party"),
      el("span", size + "인"),
    );
    line.append(mark, identity, details, el("span", meso(value), "value"));
    if (note) line.append(el("span", note, "raid-note"));
    return line;
  }
  const line = el("div", "", "raid-row setup-row");
  paintParty(line, squad);
  line.dataset.raid = key;
  const identity = el("span", "", "raid-identity");
  if (grouping !== "bosses") identity.append(bossIcon(boss));
  identity.append(name);
  const controls = el("div", "", "raid-controls");
  function select(field, label, choices, selected, change) {
    const control = el("select", "", "quick-" + field);
    control.setAttribute(
      "aria-label",
      character.name + " " + boss.name + " " + label,
    );
    control.dataset.focus = field + "-" + key;
    addOptions(control, choices);
    control.value = selected;
    control.onchange = async () => {
      const value = control.value;
      await update((freshState) => {
        const fresh = freshState.parties.find(
          (item) => item.name === character.name,
        );
        if (!fresh?.targets.includes(boss.id)) return;
        const current = raidFor(fresh, boss, freshState.squads);
        const patch = change(value, current, freshState.squads);
        fresh.settings[boss.id] = { ...fresh.settings[boss.id], ...patch };
      });
      signalRaid(key);
    };
    return control;
  }
  controls.append(
    select(
      "level",
      "난이도",
      boss.levels.map((item) => [item, item]),
      level,
      (level, current) => ({
        level,
        size: Math.min(current.size, maxPlayers(boss, level)),
      }),
    ),
    select(
      "party",
      "파티",
      [
        [size === 1 && !squad ? "솔로" : "파티 미지정", ""],
        ...state.squads.map((item) => [item.name, item.id]),
      ],
      squad?.id || "",
      (id, current, squads) => {
        const picked = squads.find((item) => item.id === id);
        return {
          squadId: picked?.id || "",
          size: Math.min(picked?.size ?? 1, maxPlayers(boss, current.level)),
        };
      },
    ),
    select(
      "size",
      "인원",
      sizeOptions(maxPlayers(boss, level)),
      String(size),
      (size) => ({ size: Number(size) }),
    ),
  );
  const edit = button(
    note ? "메모 ●" : "메모",
    () => openRaid(raid),
    "quick-note",
  );
  edit.setAttribute(
    "aria-label",
    character.name + " " + boss.name + " 메모 및 상세 설정",
  );
  if (note) edit.title = note;
  edit.dataset.focus = "raid-" + key;
  line.append(identity, controls, el("span", meso(value), "value"), edit);
  if (note) line.append(el("small", note, "raid-note"));
  return line;
}
function signalRaid(key) {
  document
    .querySelector('[data-raid="' + CSS.escape(key) + '"]')
    ?.classList.add("signal");
}
function collapseControl(card, key, name) {
  card.dataset.cardKey = key;
  const isFolded = folded.has(key);
  const toggle = button(
    isFolded ? "+" : "−",
    () => {
      if (!folded.delete(key)) folded.add(key);
      render();
    },
    "fold",
  );
  toggle.setAttribute("aria-label", name + (isFolded ? " 펼치기" : " 접기"));
  toggle.setAttribute("aria-expanded", !isFolded);
  toggle.dataset.focus = "fold-" + key;
  return toggle;
}
function miniTotal(raids) {
  const { weekly, monthly } = totals(raids);
  const node = el("div", "", "mini-total");
  if (weekly.count) node.append(el("span", "주간 " + meso(weekly.planned)));
  if (monthly.count) node.append(el("span", "월간 " + meso(monthly.planned)));
  return node;
}
function completeButton(raids, now, focusKey, scope) {
  const remaining = raids.filter((raid) => !raid.done).length;
  if (interaction !== "check" || !remaining) return null;
  const action = button(
    remaining + "개 완료",
    () => records.complete(raids, now),
    "scope-complete",
  );
  action.dataset.focus = "complete-" + focusKey;
  action.setAttribute("aria-label", scope + " 보스 " + remaining + "개 완료");
  return action;
}
function characterCard(character, raids, now) {
  const card = el("article", "", "card character");
  const key = "character-" + character.name;
  const banner = el("div", "", "character-head");
  const name = el("div");
  const meta = character.profile;
  name.append(
    el("h2", character.name),
    el(
      "span",
      meta
        ? [meta.world, meta.job, meta.level && "Lv. " + meta.level]
            .filter(Boolean)
            .join(" · ")
        : "직접 등록",
      "muted",
    ),
  );
  const controls = el("div", "", "card-controls");
  const edit = button("보스 편집", () => bulk.open(character.name));
  edit.setAttribute("aria-label", character.name + " 보스 편집");
  const more = el("details", "", "more");
  const menu = el("summary", "관리");
  const menuBody = el("div", "", "menu");
  menuBody.append(
    button("프로필 다시 조회", () => openCharacter(character.name)),
    button(
      "캐릭터 삭제",
      () => {
        if (confirm(character.name + " 캐릭터의 보스 기록을 삭제할까요?"))
          update((s) => {
            s.parties = s.parties.filter(
              (item) => item.name !== character.name,
            );
          });
      },
      "danger",
    ),
  );
  more.append(menu, menuBody);
  if (interaction === "settings") controls.append(edit, more);
  if (!folded.has(key)) {
    const action = completeButton(raids, now, key, character.name);
    if (action) controls.append(action);
  }
  controls.append(collapseControl(card, key, character.name));
  banner.append(portrait(character), name, controls);
  card.append(banner, miniTotal(raids));
  if (folded.has(key)) return card;
  if (!raids.length)
    card.append(el("p", "설정 모드에서 갈 보스를 골라 주세요.", "empty"));
  for (const cycle of ["weekly", "monthly"]) {
    const list = raids.filter((raid) => raid.boss.cycle === cycle);
    if (!list.length) continue;
    const cleared = list.filter((raid) => raid.done).length;
    card.append(
      el(
        "h3",
        cycleName(cycle) + " · " + cleared + "/" + list.length,
        "section-title",
      ),
    );
    list.forEach((raid) => card.append(raidRow(raid, "characters", now)));
  }
  return card;
}
function groupHeader(title, subtitle = "") {
  const heading = el("div", "", "group-head");
  const copy = el("div");
  copy.append(el("h2", title));
  if (subtitle) copy.append(el("p", subtitle, "muted"));
  heading.append(copy);
  return heading;
}
function bossGroup(boss, raids, now) {
  const group = el("article", "", "card group boss-card");
  const key = "boss-" + boss.id;
  const header = groupHeader(boss.name, cycleName(boss.cycle));
  header.prepend(bossIcon(boss));
  header.append(miniTotal(raids));
  if (!folded.has(key)) {
    const action = completeButton(raids, now, key, boss.name);
    if (action) header.append(action);
  }
  header.append(collapseControl(group, key, boss.name));
  group.append(header);
  if (folded.has(key)) return group;
  raids.forEach((raid) => group.append(raidRow(raid, "bosses", now)));
  return group;
}
function squadGroup(squad, label, raids, now) {
  const group = el("article", "", "card group");
  const key = "squad-" + (squad?.id || label);
  paintParty(group, squad);
  const bossesInSquad = bosses.filter((boss) =>
    raids.some((raid) => raid.boss === boss),
  );
  const summary = bossesInSquad.length
    ? bossesInSquad.map((boss) => boss.name).join(" · ")
    : "배정된 보스 없음";
  const header = groupHeader(label, summary);
  const controls = el("div", "", "group-actions");
  if (squad && interaction === "settings") {
    const edit = button("파티 편집", () => openSquad(squad));
    edit.setAttribute("aria-label", squad.name + " 편집");
    controls.append(edit);
  }
  if (!folded.has(key)) {
    const action = completeButton(raids, now, key, label);
    if (action) controls.append(action);
  }
  controls.append(collapseControl(group, key, label));
  header.append(controls);
  group.append(header, miniTotal(raids));
  if (squad?.note) group.append(el("p", squad.note, "group-note"));
  if (folded.has(key)) return group;
  if (squad && !raids.length)
    group.append(
      el("p", "설정 모드의 보스 일괄 편집에서 이 파티를 배정하세요.", "empty"),
    );
  for (const character of state.parties) {
    const list = raids.filter((raid) => raid.character === character);
    if (!list.length) continue;
    const section = el("section", "", "squad-character");
    const heading = el("div", "", "squad-character-head");
    heading.append(
      portrait(character),
      el("h3", character.name),
      el(
        "span",
        list.filter((raid) => raid.done).length + " / " + list.length,
        "squad-progress",
      ),
    );
    section.append(heading);
    list.forEach((raid) => section.append(raidRow(raid, "squads", now)));
    group.append(section);
  }
  return group;
}
function render() {
  const now = Date.now();
  displayedChecks = [];
  document.body.dataset.interaction = interaction;
  document.querySelectorAll("[data-settings-only]").forEach((node) => {
    node.hidden = interaction !== "settings";
  });
  document.querySelectorAll("[data-check-only]").forEach((node) => {
    node.hidden = interaction !== "check";
  });
  for (const control of $("interactionModes").children)
    control.setAttribute(
      "aria-pressed",
      control.dataset.interaction === interaction,
    );
  $("openBulk").disabled = !state.parties.length;
  const focus = document.activeElement?.dataset.focus;
  const raids = plannedRaids(state, now);
  const { weekly, monthly } = totals(raids);
  const range = period("weekly", now);
  $("week").textContent =
    dateFormat.format(range.start) +
    " 목 – " +
    dateFormat.format(range.end - 1) +
    " 수";
  showMoney("weeklyTotal", weekly.planned);
  $("weeklyCount").textContent = "계획 " + weekly.count + "회";
  showMoney("weeklyDone", weekly.done);
  $("weeklyCleared").textContent =
    "격파 " + weekly.cleared + " / " + weekly.count;
  $("weekProgress").max = weekly.count || 1;
  $("weekProgress").value = weekly.cleared;
  showMoney("monthlyTotal", monthly.planned);
  $("monthlyCleared").textContent = "격파 " + meso(monthly.done);
  const over = state.parties.filter(
    (character) =>
      raids.filter(
        (raid) => raid.character === character && raid.boss.cycle === "weekly",
      ).length > 12,
  );
  const notices = [];
  if (over.length)
    notices.push("주간 격파 한도(12종)를 넘긴 캐릭터 " + over.length + "명.");
  if (weekly.count + monthly.count > 90)
    notices.push("일반 월드는 메이플ID당 주간 90개까지 판매할 수 있어요.");
  $("cap").hidden = !notices.length;
  $("cap").textContent = notices.length
    ? notices.join(" ") + " 예상 수입은 선택한 보스 합계예요."
    : "";
  for (const control of $("modes").children)
    control.setAttribute("aria-pressed", control.dataset.mode === mode);
  document.querySelector("main").dataset.mode = mode;
  if (partyFilter && !state.squads.some((squad) => squad.id === partyFilter))
    partyFilter = "";
  paintFilters(raids);
  const terms = $("boardSearch")
    .value.trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const hideDone = interaction === "check" && $("hideDone").checked;
  const filtering = Boolean(terms.length || partyFilter || hideDone);
  const visible = raids.filter((raid) => {
    if (hideDone && raid.done) return false;
    if (partyFilter && raid.squad?.id !== partyFilter) return false;
    const text = [
      raid.character.name,
      raid.character.profile?.world,
      raid.boss.name,
      partyName(raid),
      raid.note,
      raid.level,
    ]
      .join(" ")
      .toLowerCase();
    return terms.every((term) => text.includes(term));
  });
  $("boardCount").textContent =
    (filtering ? visible.length + " / " : "") + raids.length + "개 배정";
  const board = $("board");
  board.className = mode === "characters" ? "character-grid" : "group-grid";
  board.replaceChildren();
  if (mode === "characters") {
    for (const character of state.parties) {
      const list = visible.filter((raid) => raid.character === character);
      const matchingName =
        !partyFilter &&
        !hideDone &&
        terms.length &&
        terms.every((term) => character.name.toLowerCase().includes(term));
      if (list.length || !filtering || matchingName)
        board.append(characterCard(character, list, now));
    }
  } else if (mode === "squads") {
    for (const squad of state.squads) {
      const list = visible.filter((raid) => raid.squad === squad);
      if (
        list.length ||
        !filtering ||
        (!hideDone && !terms.length && partyFilter === squad.id)
      )
        board.append(squadGroup(squad, squad.name, list, now));
    }
    for (const label of ["솔로", "파티 미지정"]) {
      const list = visible.filter(
        (raid) => !raid.squad && partyName(raid) === label,
      );
      if (list.length) board.append(squadGroup(null, label, list, now));
    }
  } else {
    bosses.forEach((boss) => {
      const list = visible.filter((raid) => raid.boss === boss);
      if (list.length) board.append(bossGroup(boss, list, now));
    });
  }
  if (!board.children.length) {
    const box = el("div", "", "empty-state");
    if (filtering) {
      box.append(
        el("h2", "필터에 맞는 배정이 없어요."),
        button("필터 초기화", () => {
          partyFilter = "";
          $("boardSearch").value = "";
          $("hideDone").checked = false;
          render();
        }),
      );
    } else if (mode === "squads") {
      box.append(
        el("h2", "등록된 파티가 없어요"),
        button(
          "+ 파티 추가",
          () => {
            setInteraction("settings");
            openSquad();
          },
          "primary",
        ),
      );
    } else if (!state.parties.length) {
      box.append(
        el("h2", "첫 캐릭터를 등록하세요"),
        el(
          "p",
          "닉네임으로 캐릭터 이미지를 가져오고 함께 갈 보스를 고를 수 있어요.",
          "muted",
        ),
        button(
          "캐릭터 추가",
          () => {
            setInteraction("settings");
            openCharacter();
          },
          "primary",
        ),
      );
    } else {
      box.append(
        el("h2", "선택한 보스가 없어요"),
        button("캐릭터별 보기", () => {
          mode = "characters";
          render();
        }),
      );
    }
    board.append(box);
  }
  const pending = displayedChecks.filter((raid) => !raid.done);
  $("completeShown").disabled = !pending.length;
  $("completeShown").textContent = pending.length
    ? "표시된 " + pending.length + "개 완료"
    : "표시된 보스 완료";
  $("completeShown").onclick = () => records.complete(pending, now);
  const keys = visibleCardKeys();
  const allFolded = keys.length && keys.every((key) => folded.has(key));
  $("foldCards").disabled = !keys.length;
  $("foldCards").setAttribute("aria-pressed", Boolean(allFolded));
  $("foldCards").textContent = allFolded ? "모두 펼치기" : "모두 접기";
  lastPeriod = period("weekly", now).key + period("monthly", now).key;
  records.render(raids, now);
  if (focus)
    document
      .querySelector('[data-focus="' + CSS.escape(focus) + '"]')
      ?.focus({ preventScroll: true });
}
function showMoney(id, value) {
  const unit = el("small", " 메소", "money-unit");
  $(id).replaceChildren(el("span", number.format(value), "money-number"), unit);
}
function visibleCardKeys() {
  return Array.from(
    $("board").querySelectorAll("[data-card-key]"),
    (card) => card.dataset.cardKey,
  );
}
function paintFilters(raids) {
  const filters = $("partyFilters");
  filters.hidden = !state.squads.length;
  filters.replaceChildren();
  if (filters.hidden) return;
  for (const [id, label, squad] of [
    ["", "모든 파티", null],
    ...state.squads.map((squad) => [squad.id, squad.name, squad]),
  ]) {
    const count = squad
      ? raids.filter((raid) => raid.squad === squad).length
      : null;
    const chip = button(
      label,
      () => {
        partyFilter = partyFilter === id ? "" : id;
        render();
      },
      "party-filter",
    );
    if (count !== null) chip.append(el("small", String(count)));
    paintParty(chip, squad);
    chip.dataset.focus = "party-filter-" + id;
    chip.setAttribute("aria-pressed", partyFilter === id);
    filters.append(chip);
  }
}
const newSquadOption = "@new";
let raidTarget;
function addOptions(select, options) {
  select.replaceChildren(
    ...options.map(([label, value]) => new Option(label, value)),
  );
}
function sizeOptions(limit) {
  return Array.from({ length: limit }, (_, index) => [
    index + 1 + "인",
    String(index + 1),
  ]);
}
function syncRaid(override) {
  const boss = raidTarget.boss;
  const level = $("level").value;
  const sizeSelect = $("players");
  const sizeLimit = maxPlayers(boss, level);
  const size = Math.min(sizeLimit, override ?? (Number(sizeSelect.value) || 1));
  addOptions(sizeSelect, sizeOptions(sizeLimit));
  sizeSelect.value = String(size);
  const creating = $("squadSelect").value === newSquadOption;
  $("newSquadField").hidden = !creating;
  $("newSquadName").required = creating;
  $("raidPreview").textContent =
    "내 결정석 몫 · " + meso(share(boss, level, size));
  paintParty(
    $("raidDialog"),
    state.squads.find((item) => item.id === $("squadSelect").value),
  );
}
function openRaid(raid) {
  raidTarget = raid;
  $("raidTitle").textContent = raid.boss.name + " · " + raid.character.name;
  addOptions(
    $("level"),
    raid.boss.levels.map((level) => [level, level]),
  );
  $("level").value = raid.level;
  addOptions($("squadSelect"), [
    ["지정 안 함", ""],
    ...state.squads.map((squad) => [squad.name, squad.id]),
    ["+ 새 파티", newSquadOption],
  ]);
  $("squadSelect").value = raid.squad?.id || "";
  $("raidNote").value = raid.note;
  $("newSquadName").value = "";
  $("newSquadName").setCustomValidity("");
  syncRaid(raid.size);
  $("raidDialog").showModal();
}
$("level").onchange = () => syncRaid();
$("players").onchange = () => syncRaid();
$("squadSelect").onchange = () => {
  const id = $("squadSelect").value;
  syncRaid(state.squads.find((item) => item.id === id)?.size);
  if (id === newSquadOption) $("newSquadName").focus();
};
function squadInput(input) {
  const name = input.value.trim();
  input.setCustomValidity(name ? "" : "파티 이름을 입력하세요.");
  return input.reportValidity() ? name : "";
}
function matchSquad(s, name) {
  return s.squads.find(
    (squad) => squad.name.toLowerCase() === name.toLowerCase(),
  );
}
$("raidForm").onsubmit = async (event) => {
  event.preventDefault();
  const { character, boss } = raidTarget;
  const selection = $("squadSelect").value;
  const newName =
    selection === newSquadOption ? squadInput($("newSquadName")) : "";
  if (selection === newSquadOption && !newName) return;
  const level = $("level").value;
  const size = Number($("players").value);
  const note = $("raidNote").value.trim();
  $("raidDialog").close();
  await update((s) => {
    const fresh = s.parties.find((item) => item.name === character.name);
    if (!fresh?.targets.includes(boss.id)) return;
    let squad = s.squads.find((item) => item.id === selection);
    if (newName) {
      squad = matchSquad(s, newName);
      if (!squad) {
        squad = {
          id: crypto.randomUUID(),
          name: newName,
          size: Math.max(2, size),
          note: "",
          color: nextPartyColor(s.squads),
        };
        s.squads.push(squad);
      }
    }
    fresh.settings[boss.id] = { level, size, note, squadId: squad?.id || "" };
  });
};
let squadId = "";
function openSquad(squad) {
  squadId = squad?.id || "";
  $("squadTitle").textContent = squad ? "파티 편집" : "파티 추가";
  $("squadName").value = squad?.name || "";
  $("squadName").setCustomValidity("");
  $("squadNote").value = squad?.note || "";
  addOptions($("squadSize"), sizeOptions(6).slice(1));
  $("squadSize").value = String(squad?.size || 2);
  $("removeSquad").hidden = !squad;
  $("squadColor").value = squad
    ? partyColor(squad)
    : nextPartyColor(state.squads);
  updateColorPreview();
  $("squadDialog").showModal();
}
function updateColorPreview() {
  const color = $("squadColor").value;
  paintParty($("colorPreview"), { color });
  paintParty($("squadDialog"), { color });
  for (const chip of $("partyPalette").children)
    chip.setAttribute("aria-pressed", chip.dataset.color === color);
}
for (const [label, color] of palette) {
  const swatch = button(
    "",
    () => {
      $("squadColor").value = color;
      updateColorPreview();
    },
    "swatch",
  );
  swatch.dataset.color = color;
  swatch.title = label;
  swatch.setAttribute("aria-label", label);
  paintParty(swatch, { color });
  $("partyPalette").append(swatch);
}
$("squadColor").oninput = updateColorPreview;
for (const id of ["squadName", "newSquadName"])
  $(id).oninput = () => $(id).setCustomValidity("");
$("squadForm").onsubmit = async (event) => {
  event.preventDefault();
  const nameInput = $("squadName");
  const name = squadInput(nameInput);
  if (!name) return;
  const size = Number($("squadSize").value);
  const note = $("squadNote").value.trim();
  const color = $("squadColor").value;
  const id = squadId;
  let saved = false;
  await update((s) => {
    const duplicate = matchSquad(s, name);
    if (duplicate && duplicate.id !== id) return;
    const existing = s.squads.find((squad) => squad.id === id);
    if (existing) Object.assign(existing, { name, size, note, color });
    else if (!id)
      s.squads.push({ id: crypto.randomUUID(), name, size, note, color });
    if (!id && !$("bulkDialog").open) mode = "squads";
    saved = true;
  });
  if (saved) {
    $("squadDialog").close();
    bulk.refreshSquads(matchSquad(state, name)?.id);
  } else {
    nameInput.setCustomValidity("이미 같은 이름의 파티가 있어요.");
    nameInput.reportValidity();
  }
};
$("removeSquad").onclick = () => {
  const id = squadId;
  if (
    !confirm(
      "파티를 삭제하고 배정된 보스를 파티 미지정으로 바꿀까요? 격파 기록은 남아요.",
    )
  )
    return;
  $("squadDialog").close();
  update((s) => {
    s.squads = s.squads.filter((squad) => squad.id !== id);
    for (const character of s.parties) {
      for (const config of Object.values(character.settings)) {
        if (config.squadId === id) config.squadId = "";
      }
    }
  });
};
function renderPrices() {
  $("priceExplanation").textContent =
    priceDate +
    " 확인 · 1인 " +
    meso(minimumPrice) +
    " 이상 · 인원별 1명 몫 (메소)";
  const table = $("priceTable");
  const head = table.createTHead().insertRow();
  for (const label of [
    "보스",
    "난이도",
    ...sizeOptions(6).map(([label]) => label),
  ]) {
    const cell = el("th", label);
    cell.scope = "col";
    head.append(cell);
  }
  const body = table.createTBody();
  for (const boss of bosses) {
    for (const level of boss.levels) {
      const row = body.insertRow();
      row.insertCell().textContent =
        boss.name + (boss.cycle === "monthly" ? " (월간)" : "");
      row.insertCell().textContent = level;
      for (let size = 1; size <= 6; size++) {
        row.insertCell().textContent =
          size <= maxPlayers(boss, level)
            ? number.format(share(boss, level, size))
            : "—";
      }
    }
  }
}
$("addCharacter").onclick = () => openCharacter();
$("addSquad").onclick = () => openSquad();
$("showPrices").onclick = () => $("pricesDialog").showModal();
$("boardSearch").oninput = render;
$("hideDone").onchange = render;
$("foldCards").onclick = () => {
  const keys = visibleCardKeys();
  if (keys.every((key) => folded.has(key)))
    keys.forEach((key) => folded.delete(key));
  else keys.forEach((key) => folded.add(key));
  render();
};
$("modes").onclick = (event) => {
  if (!event.target.dataset.mode) return;
  mode = event.target.dataset.mode;
  render();
  $("board").animate(
    [
      { opacity: 0.62, transform: "translateY(3px)" },
      { opacity: 1, transform: "none" },
    ],
    {
      duration: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? 0
        : 180,
      easing: "ease-out",
    },
  );
};
function setInteraction(next) {
  if (interaction === next) return;
  interaction = next;
  $("recordToast").hidden = true;
  $("boardStatus").textContent = "";
  render();
}
$("interactionModes").onclick = (event) => {
  if (event.target.dataset.interaction)
    setInteraction(event.target.dataset.interaction);
};
document.querySelectorAll("[data-close]").forEach((control) => {
  control.onclick = () => control.closest("dialog").close();
});
function tick() {
  if (lastPeriod !== period("weekly").key + period("monthly").key) render();
}
window.addEventListener("storage", (event) => {
  if (!temporary && (event.key === storageKey || event.key === null)) {
    state = load();
    render();
  }
});
window.addEventListener("focus", tick);
document.addEventListener("visibilitychange", tick);
setInterval(tick, 1000);
const bulk = setupBulk({
  getState: () => state,
  update,
  openSquad,
  meso,
  notify: (message) => {
    $("boardStatus").textContent = message;
  },
});
const records = setupRecords({
  getState: () => state,
  canRecord: () => interaction === "check",
  update,
  button,
  el,
  bossIcon,
  partyName,
  signalRaid,
});
$("openBulk").onclick = () => {
  $("boardStatus").textContent = "";
  bulk.open();
};
renderPrices();
render();
function openRecordLink() {
  if (location.hash !== "#record") return;
  setInteraction("check");
  records.open();
}
window.addEventListener("hashchange", openRecordLink);
openRecordLink();
