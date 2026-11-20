import {
  bosses,
  newParty,
  period,
  isCleared,
  safeImage,
  storageKey,
  readState,
  validName,
} from "./model.js";
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
let cycle = "weekly";
let busy = false;
let editorName = "";
let lastPeriod = "";
const current = () => state.parties.find((p) => p.name === state.active);
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
  $("lookupMsg").textContent = name + " 수첩을 열었어요.";
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
    $("lookupMsg").textContent = data.name + " 프로필을 불러왔어요.";
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
function renderRoster() {
  const list = $("roster");
  list.replaceChildren();
  $("charCount").textContent = state.parties.length;
  if (!state.parties.length) {
    const box = el("div", "", "empty-profile");
    const art = el("img");
    art.src = "/camp.png";
    art.alt = "";
    box.append(
      art,
      el("b", "첫 캐릭터를 등록하세요"),
      el("small", "닉네임으로 캐릭터 이미지를 불러와요."),
    );
    list.append(box);
  }
  for (const p of state.parties) {
    const selected = p.name === state.active;
    const button = el("button", "", "profile" + (selected ? " selected" : ""));
    button.type = "button";
    button.setAttribute("aria-pressed", selected);
    const avatar = el("img");
    const src = safeImage(p.profile?.image);
    avatar.src = src || "/leaf.png";
    avatar.alt = "";
    avatar.className = src ? "avatar" : "avatar fallback";
    avatar.onerror = () => {
      avatar.onerror = null;
      avatar.src = "/leaf.png";
      avatar.className = "avatar fallback";
    };
    const copy = el("span");
    copy.append(
      el("b", p.name),
      el(
        "small",
        p.profile
          ? [
              p.profile.world,
              p.profile.job,
              p.profile.level ? "Lv. " + p.profile.level : "",
            ]
              .filter(Boolean)
              .join(" · ")
          : "직접 등록",
      ),
    );
    button.append(avatar, copy);
    button.onclick = () =>
      update((s) => {
        if (s.parties.some((x) => x.name === p.name)) s.active = p.name;
      });
    list.append(button);
  }
  if (current()) {
    const remove = el("button", "선택 캐릭터 삭제", "link-button");
    remove.onclick = () => {
      const name = current()?.name;
      if (
        name &&
        confirm(
          name +
            " 캐릭터의 체크리스트와 파티 메모를 이 브라우저에서 삭제할까요?",
        )
      )
        update((s) => {
          s.parties = s.parties.filter((p) => p.name !== name);
          if (s.active === name) s.active = s.parties[0]?.name || "";
        });
    };
    list.append(remove);
  }
}
function row(p, b, preview) {
  const done = isCleared(p, b);
  const line = el("div", "", "boss" + (done ? " done" : ""));
  const box = el("input");
  box.type = "checkbox";
  box.checked = done;
  box.disabled = preview;
  box.setAttribute("aria-label", b.name + " 격파");
  box.dataset.focus = "box-" + b.id;
  const shownPeriod = period(b.cycle).key;
  box.onchange = () =>
    editParty(p.name, (party) => {
      if (shownPeriod !== period(b.cycle).key) return;
      if (box.checked) party.clears[b.id] = shownPeriod;
      else delete party.clears[b.id];
    });
  const emblem = el("img", "", "emblem");
  emblem.src = "/badges/" + b.id + ".png";
  emblem.alt = "";
  const name = el("div", "", "boss-info");
  name.append(el("b", b.name));
  const detail = el(
    "button",
    p.settings[b.id]?.note || "파티 메모 추가",
    "note",
  );
  detail.type = "button";
  detail.disabled = preview;
  detail.setAttribute("aria-label", b.name + " 파티 메모 수정");
  detail.dataset.focus = "note-" + b.id;
  detail.onclick = () => {
    const old = p.settings[b.id]?.note || "";
    const value = prompt(
      b.name + " 파티 메모 (요일, 시간, 파티원 등 · 최대 100자)",
      old,
    );
    if (value !== null)
      editParty(p.name, (party) => {
        (party.settings[b.id] ||= {}).note = value.trim().slice(0, 100);
      });
  };
  name.append(detail);
  const levels = el("select");
  levels.setAttribute("aria-label", b.name + " 난이도");
  levels.disabled = preview;
  levels.dataset.focus = "level-" + b.id;
  for (const level of b.levels) levels.add(new Option(level, level));
  levels.value =
    p.settings[b.id]?.level ||
    (b.levels.includes("하드") ? "하드" : b.levels.at(-1));
  levels.onchange = () =>
    editParty(p.name, (party) => {
      (party.settings[b.id] ||= {}).level = levels.value;
    });
  line.append(
    box,
    emblem,
    name,
    levels,
    el("span", done ? "격파 완료" : "미격파", "status"),
  );
  return line;
}
function render() {
  const focus = document.activeElement?.dataset.focus;
  renderRoster();
  const range = period("weekly");
  $("week").textContent =
    dateFormat.format(range.start) +
    " 목 – " +
    dateFormat.format(range.end - 1) +
    " 수";
  const active = current();
  const p = active || newParty("");
  const targets = bosses.filter(
    (b) => p.targets.includes(b.id) && b.cycle === cycle,
  );
  const count = targets.filter((b) => isCleared(p, b)).length;
  $("edit").disabled = !active;
  $("hint").hidden = !!active;
  $("hint").textContent =
    "목록 미리보기 · 캐릭터를 등록하면 격파 기록을 시작해요.";
  $("progressText").textContent = "격파 " + count + " / " + targets.length;
  $("progress").max = targets.length || 1;
  $("progress").value = count;
  $("reset").textContent =
    cycle === "weekly"
      ? "매주 목요일 00:00 초기화 (KST)"
      : "매월 1일 00:00 초기화 (KST)";
  for (const btn of $("cycles").children)
    btn.setAttribute("aria-pressed", btn.dataset.cycle === cycle);
  $("bosses").replaceChildren(...targets.map((b) => row(p, b, !active)));
  if (!targets.length)
    $("bosses").append(
      el("p", "목록 편집에서 이번 원정에 갈 보스를 선택하세요.", "empty"),
    );
  lastPeriod = period("weekly").key + period("monthly").key;
  if (focus)
    document
      .querySelector('[data-focus="' + CSS.escape(focus) + '"]')
      ?.focus({ preventScroll: true });
}
$("cycles").onclick = (event) => {
  if (event.target.dataset.cycle) {
    cycle = event.target.dataset.cycle;
    render();
  }
};
$("edit").onclick = () => {
  const p = current();
  if (!p) return;
  editorName = p.name;
  $("choices").replaceChildren();
  for (const kind of ["weekly", "monthly"]) {
    $("choices").append(
      el("h3", kind === "weekly" ? "주간 보스" : "월간 보스"),
    );
    for (const b of bosses.filter((x) => x.cycle === kind)) {
      const label = el("label");
      const check = el("input");
      check.type = "checkbox";
      check.value = b.id;
      check.checked = p.targets.includes(b.id);
      label.append(check, document.createTextNode(b.name));
      $("choices").append(label);
    }
  }
  $("editor").returnValue = "cancel";
  $("editor").showModal();
};
$("editor").onclose = () => {
  if ($("editor").returnValue === "save") {
    const targets = Array.from(
      $("choices").querySelectorAll(":checked"),
      (n) => n.value,
    );
    editParty(editorName, (p) => (p.targets = targets));
  }
};
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
render();
