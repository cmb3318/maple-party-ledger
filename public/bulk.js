import { bosses, raidFor, saveBossPlan } from "./model.js";
import { maxPlayers, share } from "./crystals.js";

const byId = (id) => document.getElementById(id);

function options(select, entries, value) {
  select.replaceChildren(...entries.map(([text, id]) => new Option(text, id)));
  select.value = value;
}
function playerOptions(limit) {
  return Array.from({ length: limit }, (_, index) => [
    index + 1 + "인",
    index + 1,
  ]);
}
function checkbox(label, checked, change) {
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = checked;
  input.setAttribute("aria-label", label);
  input.onchange = () => change(input.checked);
  return input;
}

export function setupBulk({ getState, update, openSquad, meso, notify }) {
  const dialog = byId("bulkDialog");
  let sourceName = "";
  let draft = [];
  let recipients = new Set();
  const marked = new Set();
  const edited = new Set();
  const squadChoices = () => [
    ["파티 미지정", ""],
    ...getState().squads.map((squad) => [squad.name, squad.id]),
  ];
  const eligible = () =>
    draft.filter((row) => byId("bulkFilter").value === "all" || row.included);
  const otherNames = () =>
    getState()
      .parties.map((character) => character.name)
      .filter((name) => name !== sourceName);
  const selectedRows = () => draft.filter((row) => marked.has(row.id));
  const nextCharacter = () =>
    getState().parties[
      getState().parties.findIndex(
        (character) => character.name === sourceName,
      ) + 1
    ]?.name;

  function updateStatus(message = "") {
    const shown = eligible();
    const markedVisible = shown.filter((row) => marked.has(row.id)).length;
    byId("markAll").checked =
      shown.length > 0 && markedVisible === shown.length;
    byId("markAll").indeterminate =
      markedVisible > 0 && markedVisible < shown.length;
    byId("markAll").disabled = !shown.length;
    byId("bulkMarked").textContent = marked.size + "개 체크";
    for (const id of ["applyMass", "excludeMass", "clearMarks"])
      byId(id).disabled = !marked.size;
    byId("applyMass").textContent =
      byId("massLevel").value ||
      byId("massSquad").value !== "keep" ||
      byId("massSize").value
        ? "체크한 보스에 적용"
        : "체크한 보스 추가";
    byId("bulkMessage").textContent = message;
    const included = draft.filter(
      (row) => row.included && row.boss.cycle === "weekly",
    );
    const total = included.reduce(
      (sum, row) => sum + share(row.boss, row.level, row.size),
      0,
    );
    byId("bulkTotals").textContent =
      "주간 " + included.length + "종 · " + meso(total);
    byId("copySummary").textContent =
      "다른 캐릭터에도 복사" +
      (recipients.size ? " · " + recipients.size + "명" : "");
    byId("copyAll").textContent =
      recipients.size === otherNames().length
        ? "복사 대상 체크 해제"
        : "다른 캐릭터 전부 선택";
    const unsaved = edited.size || recipients.size;
    byId("saveBulk").disabled = !unsaved;
    byId("saveNext").hidden = !nextCharacter();
    byId("saveNext").disabled = !unsaved;
    byId("saveBulk").textContent = recipients.size
      ? "저장 · " + (recipients.size + 1) + "명에 반영"
      : "저장";
  }

  function makeRow(row) {
    const tr = document.createElement("tr");
    const bossName = row.boss.name;
    tr.dataset.included = row.included;
    const mark = checkbox(bossName + " 일괄 체크", marked.has(row.id), (on) => {
      if (on) marked.add(row.id);
      else marked.delete(row.id);
      tr.classList.toggle("marked", on);
      updateStatus();
    });
    tr.classList.toggle("marked", mark.checked);
    tr.insertCell().append(mark);
    const name = document.createElement("th");
    name.scope = "row";
    name.textContent = bossName;
    if (row.boss.cycle === "monthly") {
      const label = document.createElement("small");
      label.textContent = "월간";
      name.append(label);
    }
    tr.append(name);
    const going = checkbox(bossName + " 가기", row.included, (on) => {
      row.included = on;
      edited.add(row.id);
      tr.dataset.included = on;
      if (!on && byId("bulkFilter").value === "included") renderRows();
      updateStatus();
    });
    tr.insertCell().append(going);
    const level = document.createElement("select");
    const party = document.createElement("select");
    const size = document.createElement("select");
    for (const [select, label] of [
      [level, "난이도"],
      [party, "파티"],
      [size, "인원"],
    ]) {
      select.setAttribute("aria-label", bossName + " " + label);
      tr.insertCell().append(select);
    }
    const value = tr.insertCell();
    value.className = "bulk-value";
    options(
      level,
      row.boss.levels.map((name) => [name, name]),
      row.level,
    );
    options(party, squadChoices(), row.squadId);
    function showSize() {
      const limit = maxPlayers(row.boss, row.level);
      row.size = Math.min(row.size, limit);
      options(size, playerOptions(limit), row.size);
      value.textContent = meso(share(row.boss, row.level, row.size));
    }
    function editedRow() {
      row.included = true;
      going.checked = true;
      tr.dataset.included = true;
      edited.add(row.id);
      updateStatus();
    }
    level.onchange = () => {
      row.level = level.value;
      showSize();
      editedRow();
    };
    party.onchange = () => {
      row.squadId = party.value;
      row.size =
        getState().squads.find((squad) => squad.id === row.squadId)?.size ?? 1;
      showSize();
      editedRow();
    };
    size.onchange = () => {
      row.size = Number(size.value);
      value.textContent = meso(share(row.boss, row.level, row.size));
      editedRow();
    };
    showSize();
    return tr;
  }
  function renderRows() {
    const body = byId("bulkRows");
    const rows = eligible();
    body.replaceChildren(...rows.map(makeRow));
    if (!rows.length) {
      const cell = body.insertRow().insertCell();
      cell.colSpan = 7;
      cell.textContent = "아직 가는 보스가 없어요. ‘전체 보스’에서 추가하세요.";
    }
  }
  function showRecipients() {
    byId("bulkCopy").hidden = !otherNames().length;
    byId("copyTargets").replaceChildren(
      ...otherNames().map((name) => {
        const label = document.createElement("label");
        const check = checkbox(
          name + "에게 복사",
          recipients.has(name),
          (on) => {
            if (on) recipients.add(name);
            else recipients.delete(name);
            updateStatus();
          },
        );
        label.append(check, document.createTextNode(name));
        return label;
      }),
    );
  }
  function setSource(name) {
    const state = getState();
    const character = state.parties.find((item) => item.name === name);
    if (!character) return;
    sourceName = character.name;
    draft = bosses.map((boss) => {
      const raid = raidFor(character, boss, state.squads);
      return {
        boss,
        id: boss.id,
        included: character.targets.includes(boss.id),
        level: raid.level,
        squadId: raid.squad?.id || "",
        size: raid.size,
      };
    });
    edited.clear();
    marked.clear();
    recipients.clear();
    byId("bulkFilter").value = "all";
    byId("copyMode").value = "merge";
    showRecipients();
    renderRows();
    updateStatus();
  }
  function refreshSquads(preferred = byId("massSquad").value) {
    if (!dialog.open) return;
    options(
      byId("massSquad"),
      [["유지", "keep"], ...squadChoices()],
      preferred,
    );
    if (byId("massSquad").selectedIndex < 0) byId("massSquad").value = "keep";
    renderRows();
    updateStatus();
  }
  function open(name) {
    const state = getState();
    if (!state.parties.length) return;
    options(
      byId("bulkSource"),
      state.parties.map((item) => [item.name, item.name]),
      name || state.active,
    );
    if (byId("bulkSource").selectedIndex < 0)
      byId("bulkSource").selectedIndex = 0;
    byId("copyMode").value = "merge";
    byId("bulkCopy").open = false;
    byId("massLevel").value = "";
    options(byId("massSize"), [["유지", ""], ...playerOptions(6)], "");
    dialog.showModal();
    options(byId("massSquad"), [["유지", "keep"], ...squadChoices()], "keep");
    setSource(byId("bulkSource").value);
    byId("bulkSource").focus();
  }
  function allowDiscard() {
    return (
      (!edited.size && !recipients.size) ||
      confirm("저장하지 않은 편집을 버릴까요?")
    );
  }
  byId("closeBulk").onclick = () => {
    if (allowDiscard()) dialog.close();
  };
  dialog.oncancel = (event) => {
    if (!allowDiscard()) event.preventDefault();
  };
  byId("bulkSource").onchange = () => {
    if (!allowDiscard()) {
      byId("bulkSource").value = sourceName;
      return;
    }
    setSource(byId("bulkSource").value);
  };
  byId("bulkFilter").onchange = () => {
    renderRows();
    updateStatus();
  };
  byId("bulkNewSquad").onclick = () => openSquad();
  for (const id of ["massLevel", "massSquad", "massSize"])
    byId(id).onchange = () => updateStatus();
  byId("markAll").onchange = () => {
    for (const row of eligible()) {
      if (byId("markAll").checked) marked.add(row.id);
      else marked.delete(row.id);
    }
    renderRows();
    updateStatus();
  };
  byId("markIncluded").onclick = () => {
    for (const row of draft) if (row.included) marked.add(row.id);
    renderRows();
    updateStatus();
  };
  byId("clearMarks").onclick = () => {
    marked.clear();
    renderRows();
    updateStatus();
  };
  byId("copyAll").onclick = () => {
    const names = otherNames();
    recipients = new Set(recipients.size === names.length ? [] : names);
    showRecipients();
    updateStatus();
  };
  byId("applyMass").onclick = () => {
    const level = byId("massLevel").value;
    const squadId = byId("massSquad").value;
    const inputSize = Number(byId("massSize").value);
    const partyDefault =
      getState().squads.find((item) => item.id === squadId)?.size ?? 1;
    let unavailable = 0;
    let adjusted = 0;
    const rows = selectedRows();
    for (const row of rows) {
      if (level) {
        if (row.boss.levels.includes(level)) row.level = level;
        else unavailable += 1;
      }
      if (squadId !== "keep") row.squadId = squadId;
      const desired =
        inputSize || (squadId === "keep" ? row.size : partyDefault);
      row.size = Math.min(desired, maxPlayers(row.boss, row.level));
      if (desired !== row.size) adjusted += 1;
      row.included = true;
      edited.add(row.id);
    }
    renderRows();
    const notices = [rows.length + "개에 적용함."];
    if (unavailable)
      notices.push(
        "선택한 난이도가 없는 " + unavailable + "개는 난이도를 유지했어요.",
      );
    if (adjusted) notices.push(adjusted + "개의 인원을 입장 한도에 맞췄어요.");
    updateStatus(notices.join(" "));
  };
  byId("excludeMass").onclick = () => {
    const rows = selectedRows();
    for (const row of rows) {
      row.included = false;
      edited.add(row.id);
    }
    renderRows();
    updateStatus(rows.length + "개를 가는 보스에서 뺐어요.");
  };
  async function save(next = "") {
    const copyMode = byId("copyMode").value;
    if (recipients.size && copyMode === "marked" && !marked.size) {
      updateStatus("복사할 보스 행을 체크해 주세요.");
      return;
    }
    const copies =
      copyMode === "marked"
        ? selectedRows()
        : draft.filter((row) => row.included);
    const changes = draft.filter((row) => edited.has(row.id));
    const replace = copyMode === "replace";
    if (
      recipients.size &&
      replace &&
      !confirm(
        recipients.size +
          "명의 보스 목록을 " +
          sourceName +
          "의 목록으로 맞출까요?",
      )
    )
      return;
    if (recipients.size && copyMode === "merge" && !copies.length) {
      updateStatus("복사할 ‘가는 보스’를 한 개 이상 추가해 주세요.");
      return;
    }
    byId("saveBulk").disabled = true;
    byId("saveNext").disabled = true;
    let applied = 0;
    await update((state) => {
      applied = saveBossPlan(
        state,
        sourceName,
        changes,
        recipients,
        copies,
        replace,
      );
      if (applied) state.active = sourceName;
    });
    if (!applied) {
      updateStatus(
        "선택한 캐릭터가 다른 창에서 삭제됐어요. 창을 닫고 다시 열어 주세요.",
      );
      return;
    }
    if (
      next &&
      getState().parties.some((character) => character.name === next)
    ) {
      byId("bulkSource").value = next;
      setSource(next);
      byId("bulkCopy").open = false;
      updateStatus(applied + "명의 보스 계획을 저장했어요.");
      byId("bulkSource").focus();
      return;
    }
    dialog.close();
    notify(applied + "명의 보스 계획을 저장했어요.");
  }
  byId("saveBulk").onclick = () => save();
  byId("saveNext").onclick = () => save(nextCharacter());
  return { open, refreshSquads };
}
