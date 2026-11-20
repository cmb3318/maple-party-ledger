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
let busy = false;

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
function editParty(name, change) {
  return update((s) => {
    const p = s.parties.find((item) => item.name === name);
    if (p) change(p);
  });
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
function raidRow(raid, grouping) {
  const { boss, character, level, size, value, done, note } = raid;
  const line = el("div", "", "raid-row" + (done ? " cleared" : ""));
  const check = el("input");
  check.type = "checkbox";
  check.checked = done;
  check.setAttribute("aria-label", character.name + " " + boss.name + " 격파");
  check.dataset.focus = "check-" + character.name + "-" + boss.id;
  const displayed = period(boss.cycle).key;
  check.onchange = () =>
    editParty(character.name, (fresh) => {
      if (
        !fresh.targets.includes(boss.id) ||
        displayed !== period(boss.cycle).key
      )
        return;
      if (check.checked) fresh.clears[boss.id] = displayed;
      else delete fresh.clears[boss.id];
    });
  const identity = el("div", "", "raid-identity");
  const title = grouping === "characters" ? boss.name : character.name;
  identity.append(
    el("b", title),
    el("span", level + " · " + size + "인", "muted"),
  );
  if (note) identity.append(el("small", note, "raid-note"));
  const tag = el(
    "span",
    partyName(raid),
    "party-tag" + (raid.squad ? " assigned" : ""),
  );
  const edit = button("설정", () => openRaid(raid));
  edit.setAttribute("aria-label", character.name + " " + boss.name + " 설정");
  edit.dataset.focus = "raid-" + character.name + "-" + boss.id;
  line.append(check, identity, tag, el("span", meso(value), "value"), edit);
  return line;
}
function miniTotal(raids) {
  const { weekly, monthly } = totals(raids);
  const node = el("div", "", "mini-total");
  if (weekly.count) node.append(el("span", "주간 " + meso(weekly.planned)));
  if (monthly.count) node.append(el("span", "월간 " + meso(monthly.planned)));
  return node;
}
function characterCard(character, raids) {
  const card = el("article", "", "card character");
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
  const edit = button("보스 선택", () => openTargets(character));
  edit.setAttribute("aria-label", character.name + " 보스 선택");
  controls.append(edit);
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
  controls.append(more);
  banner.append(portrait(character), name, controls);
  card.append(banner, miniTotal(raids));
  if (!raids.length)
    card.append(el("p", "보스 선택에서 갈 보스를 골라 주세요.", "empty"));
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
    list.forEach((raid) => card.append(raidRow(raid, "characters")));
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
function bossGroup(boss, raids) {
  const group = el("article", "", "card group");
  const header = groupHeader(boss.name, cycleName(boss.cycle));
  header.prepend(bossIcon(boss));
  header.append(miniTotal(raids));
  group.append(header);
  raids.forEach((raid) => group.append(raidRow(raid, "bosses")));
  return group;
}
function squadGroup(squad, label, raids) {
  const group = el("article", "", "card group");
  const bossesInSquad = bosses.filter((boss) =>
    raids.some((raid) => raid.boss === boss),
  );
  const summary = bossesInSquad.length
    ? bossesInSquad.map((boss) => boss.name).join(" · ")
    : "배정된 보스 없음";
  const header = groupHeader(label, summary);
  if (squad) {
    const controls = el("div", "", "group-actions");
    const edit = button("파티 편집", () => openSquad(squad));
    edit.setAttribute("aria-label", squad.name + " 편집");
    controls.append(edit);
    header.append(controls);
  }
  group.append(header, miniTotal(raids));
  if (squad?.note) group.append(el("p", squad.note, "group-note"));
  if (squad && !raids.length)
    group.append(
      el(
        "p",
        "캐릭터별 보기에서 보스를 선택한 다음, 보스 설정에서 이 파티를 지정하세요.",
        "empty",
      ),
    );
  for (const boss of bossesInSquad) {
    const heading = el("div", "", "section-title with-icon");
    heading.append(
      bossIcon(boss),
      el("h3", boss.name),
      el("span", cycleName(boss.cycle), "muted"),
    );
    group.append(heading);
    raids
      .filter((raid) => raid.boss === boss)
      .forEach((raid) => group.append(raidRow(raid, "squads")));
  }
  return group;
}
function render() {
  const focus = document.activeElement?.dataset.focus;
  const raids = plannedRaids(state);
  const { weekly, monthly } = totals(raids);
  const range = period("weekly");
  $("week").textContent =
    dateFormat.format(range.start) +
    " 목 – " +
    dateFormat.format(range.end - 1) +
    " 수";
  $("weeklyTotal").textContent = meso(weekly.planned);
  $("weeklyCount").textContent = "계획 " + weekly.count + "회";
  $("weeklyDone").textContent = meso(weekly.done);
  $("weeklyCleared").textContent =
    "격파 " + weekly.cleared + " / " + weekly.count;
  $("monthlyTotal").textContent = meso(monthly.planned);
  $("monthlyCleared").textContent = "격파 " + meso(monthly.done);
  const over = state.parties.filter(
    (character) =>
      raids.filter(
        (raid) => raid.character === character && raid.boss.cycle === "weekly",
      ).length > 12,
  );
  const notices = [];
  if (over.length)
    notices.push(
      over.map((c) => c.name).join(", ") +
        " · 한 캐릭터는 주간 12종까지 격파할 수 있어요.",
    );
  if (weekly.count + monthly.count > 90)
    notices.push("일반 월드는 메이플ID당 주간 90개까지 판매할 수 있어요.");
  $("cap").hidden = !notices.length;
  $("cap").textContent = notices.length
    ? "예상 금액은 선택 목록 합계예요. " + notices.join(" ")
    : "";
  for (const control of $("modes").children)
    control.setAttribute("aria-pressed", control.dataset.mode === mode);
  const board = $("board");
  board.className = mode === "characters" ? "character-grid" : "group-grid";
  board.replaceChildren();
  if (mode === "characters") {
    state.parties.forEach((c) =>
      board.append(
        characterCard(
          c,
          raids.filter((raid) => raid.character === c),
        ),
      ),
    );
  } else if (mode === "squads") {
    state.squads.forEach((squad) =>
      board.append(
        squadGroup(
          squad,
          squad.name,
          raids.filter((raid) => raid.squad === squad),
        ),
      ),
    );
    for (const label of ["솔로", "파티 미지정"]) {
      const list = raids.filter(
        (raid) => !raid.squad && partyName(raid) === label,
      );
      if (list.length) board.append(squadGroup(null, label, list));
    }
  } else {
    bosses.forEach((boss) => {
      const list = raids.filter((raid) => raid.boss === boss);
      if (list.length) board.append(bossGroup(boss, list));
    });
  }
  if (!board.children.length) {
    const box = el("div", "", "empty-state");
    if (mode === "squads") {
      box.append(
        el("h2", "등록된 파티가 없어요"),
        button("+ 파티 추가", () => openSquad(), "primary"),
      );
    } else if (!state.parties.length) {
      box.append(
        el("h2", "첫 캐릭터를 등록하세요"),
        el(
          "p",
          "닉네임으로 캐릭터 이미지를 가져오고 함께 갈 보스를 고를 수 있어요.",
          "muted",
        ),
        button("캐릭터 추가", () => openCharacter(), "primary"),
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
  lastPeriod = period("weekly").key + period("monthly").key;
  if (focus)
    document
      .querySelector('[data-focus="' + CSS.escape(focus) + '"]')
      ?.focus({ preventScroll: true });
}
let targetName = "";
function openTargets(character) {
  targetName = character.name;
  $("targetsTitle").textContent = character.name + " · 보스 선택";
  const choices = $("choices");
  choices.replaceChildren();
  for (const cycle of ["weekly", "monthly"]) {
    choices.append(el("h3", cycleName(cycle)));
    for (const boss of bosses.filter((item) => item.cycle === cycle)) {
      const label = el("label");
      const check = el("input");
      check.type = "checkbox";
      check.value = boss.id;
      check.checked = character.targets.includes(boss.id);
      label.append(check, bossIcon(boss), el("span", boss.name));
      choices.append(label);
    }
  }
  $("targetsDialog").showModal();
}
$("targetsForm").onsubmit = async (event) => {
  event.preventDefault();
  const selected = Array.from(
    $("choices").querySelectorAll(":checked"),
    (node) => node.value,
  );
  const name = targetName;
  $("targetsDialog").close();
  await editParty(name, (fresh) => {
    // Keep hidden low-price entries and notes from the old checklist if a future catalog reintroduces them.
    fresh.targets = [
      ...fresh.targets.filter((id) => !bosses.some((boss) => boss.id === id)),
      ...selected,
    ];
  });
};
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
  $("squadDialog").showModal();
}
for (const id of ["squadName", "newSquadName"])
  $(id).oninput = () => $(id).setCustomValidity("");
$("squadForm").onsubmit = async (event) => {
  event.preventDefault();
  const nameInput = $("squadName");
  const name = squadInput(nameInput);
  if (!name) return;
  const size = Number($("squadSize").value);
  const note = $("squadNote").value.trim();
  const id = squadId;
  let saved = false;
  await update((s) => {
    const duplicate = matchSquad(s, name);
    if (duplicate && duplicate.id !== id) return;
    const existing = s.squads.find((squad) => squad.id === id);
    if (existing) Object.assign(existing, { name, size, note });
    else if (!id) s.squads.push({ id: crypto.randomUUID(), name, size, note });
    mode = "squads";
    saved = true;
  });
  if (saved) $("squadDialog").close();
  else {
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
$("modes").onclick = (event) => {
  if (!event.target.dataset.mode) return;
  mode = event.target.dataset.mode;
  render();
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
renderPrices();
render();
