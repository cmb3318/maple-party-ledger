import { period, plannedRaids, recordClear, undoClear } from "./model.js";
import { paintParty } from "./party-colors.js";
import { fetchSchedulerChanges, schedulerError } from "./scheduler.js";

const $ = (id) => document.getElementById(id);
const raidKey = (raid) => raid.character.name + "-" + raid.boss.id;
export function labelComplete(control, raids, scope, prefix = "") {
  const count = raids.length;
  const cleared = raids.filter((raid) => raid.done).length;
  const remaining = count - cleared;
  control.textContent = prefix + cleared + "/" + count;
  control.disabled = remaining === 0;
  const status = scope + " " + count + "개 중 " + cleared + "개 격파";
  control.setAttribute(
    "aria-label",
    remaining ? status + " · 남은 " + remaining + "개 모두 완료" : status,
  );
  control.title = remaining ? "남은 보스 모두 완료" : status;
}
const time = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function setupRecords({
  getState,
  canRecord,
  update,
  button,
  el,
  bossIcon,
  difficultyTag,
  partyName,
  signalRaid,
}) {
  let mode = "open";
  let characterName = "";
  const recentlyChecked = new Set();
  let receipts = [];
  let controller;
  let previews = [];
  let writing = false;

  async function commit(entries, message, remember = "") {
    if (writing || !canRecord()) return;
    writing = true;
    const changed = [];
    try {
      await update((state) => {
        const now = Date.now();
        for (const entry of entries) {
          const receipt = recordClear(state, entry, now);
          if (receipt) changed.push(receipt);
        }
        if (remember && changed.length) state.active = remember;
      });
    } finally {
      writing = false;
    }
    if (!changed.length) {
      announce("이미 반영됐거나 기록 주기가 바뀌었어요.", false);
      return;
    }
    receipts = changed;
    announce(message(changed.length), true);
    return changed;
  }
  function announce(message, undo) {
    if (!canRecord()) return;
    const inQuick = $("quickDialog").open;
    $("quickNotice").textContent = inQuick ? message : "";
    $("quickUndo").hidden = !inQuick || !undo;
    $("recordToast").hidden = inQuick;
    $("recordMessage").textContent = message;
    $("undoRecord").hidden = !undo;
    if (!inQuick && undo && document.activeElement === document.body)
      $("undoRecord").focus({ preventScroll: true });
  }
  async function undo() {
    if (writing || !canRecord() || !receipts.length) return;
    writing = true;
    const pending = receipts;
    receipts = [];
    let count = 0;
    try {
      await update((state) => {
        for (const receipt of pending) {
          if (undoClear(state, receipt)) {
            recentlyChecked.delete(receipt.name + "-" + receipt.bossId);
            count += 1;
          }
        }
      });
    } finally {
      writing = false;
    }
    announce(
      count ? "격파 기록을 되돌렸어요." : "이미 변경되어 되돌릴 기록이 없어요.",
      false,
    );
  }
  function toggle(raid, done, periodKey = period(raid.boss.cycle).key) {
    if (writing || !canRecord()) return;
    const key = raidKey(raid);
    if (done && $("quickDialog").open && mode === "open")
      recentlyChecked.add(key);
    if (!done) recentlyChecked.delete(key);
    return commit(
      [
        {
          name: raid.character.name,
          bossId: raid.boss.id,
          periodKey,
          done,
        },
      ],
      () =>
        raid.character.name +
        " · " +
        raid.boss.name +
        (done ? " 격파 기록" : " 체크 해제"),
      raid.character.name,
    ).then((changed) => {
      if (changed) signalRaid(key);
    });
  }
  function complete(raids, now) {
    if (writing || !canRecord()) return;
    const pending = raids.filter((raid) => !raid.done);
    if (!pending.length) return;
    if ($("quickDialog").open && mode === "open") {
      for (const raid of pending) recentlyChecked.add(raidKey(raid));
    }
    return commit(
      pending.map((raid) => ({
        name: raid.character.name,
        bossId: raid.boss.id,
        periodKey: period(raid.boss.cycle, now).key,
        done: true,
      })),
      (count) => "보스 " + count + "개 격파 완료",
    );
  }

  function makeQuickRow(raid, now) {
    const label = raid.character.name + " " + raid.boss.name;
    const row = button(
      "",
      () => toggle(raid, !raid.done, displayPeriod),
      "record-row",
    );
    const displayPeriod = period(raid.boss.cycle, now).key;
    row.dataset.quickKey = raidKey(raid);
    row.setAttribute(
      "aria-label",
      label + (raid.done ? " 격파 완료 · 누르면 해제" : " 격파 기록"),
    );
    row.setAttribute("aria-pressed", raid.done);
    paintParty(row, raid.squad);
    const details = el("span", "", "record-copy");
    const title = el("span", "", "record-title");
    title.append(el("strong", raid.boss.name), " ", difficultyTag(raid.level));
    const showName = !characterName ? raid.character.name + " · " : "";
    const monthly = raid.boss.cycle === "monthly" ? " · 월간" : "";
    details.append(
      title,
      el("small", showName + raid.size + "인 · " + partyName(raid) + monthly),
    );
    const recorded = raid.recorded;
    if (mode === "done" && Number.isFinite(recorded?.at)) {
      details.append(
        el(
          "small",
          (recorded.source === "nexon" ? "넥슨 확인 " : "체크 ") +
            time.format(recorded.at),
        ),
      );
    }
    row.append(
      bossIcon(raid.boss),
      details,
      el("span", raid.done ? "✓ 완료" : "○ 격파", "record-mark"),
    );
    return row;
  }
  function render(raids, now = Date.now()) {
    const remaining = raids.filter((raid) => !raid.done).length;
    $("mobileRemaining").textContent = raids.length
      ? "남은 보스 " + remaining + "개"
      : "격파 기록 수첩";
    if (!$("quickDialog").open) return;
    const active = document.activeElement;
    const focus = active?.dataset.quickKey;
    const selector = $("quickCharacter");
    const roster = getState().parties;
    if (!roster.some((item) => item.name === characterName)) characterName = "";
    const entries = roster.map((character) => {
      const todo = raids.filter(
        (raid) => raid.character.name === character.name && !raid.done,
      ).length;
      return new Option(character.name + " · 남은 " + todo, character.name);
    });
    selector.replaceChildren(new Option("전체 캐릭터", ""), ...entries);
    selector.value = characterName;
    const scoped = characterName
      ? raids.filter((raid) => raid.character.name === characterName)
      : raids;
    const done = scoped.filter((raid) => raid.done).length;
    $("quickProgress").textContent =
      mode === "done" ? done + "/" + scoped.length : "";
    $("quickOpen").setAttribute("aria-pressed", mode === "open");
    $("quickDone").setAttribute("aria-pressed", mode === "done");
    const list = $("quickList");
    const rows =
      mode === "done"
        ? scoped
            .filter((raid) => raid.done)
            .sort((a, b) => (b.recorded?.at ?? 0) - (a.recorded?.at ?? 0))
        : scoped.filter(
            (raid) => !raid.done || recentlyChecked.has(raidKey(raid)),
          );
    list.replaceChildren();
    if (!rows.length) {
      const detail = !scoped.length
        ? "캐릭터 카드의 보스 편집에서 갈 보스를 추가하세요."
        : mode === "open"
          ? "남은 보스가 없어요."
          : "아직 격파한 보스가 없어요.";
      list.append(el("p", detail, "quick-empty"));
    }
    const completeShown = $("quickComplete");
    completeShown.hidden = mode === "done";
    labelComplete(completeShown, scoped, "선택한 캐릭터 보스");
    completeShown.onclick = () => complete(rows, now);
    for (const raid of rows) list.append(makeQuickRow(raid, now));
    if (focus) {
      const focused = list.querySelector(
        '[data-quick-key="' + CSS.escape(focus) + '"]',
      );
      (focused || (mode === "done" ? $("quickDone") : $("quickOpen"))).focus({
        preventScroll: true,
      });
    }
  }

  function snapshot() {
    return plannedRaids(getState());
  }
  function open() {
    if (!canRecord() || $("quickDialog").open) return;
    mode = "open";
    const raids = snapshot();
    const active = getState().active;
    characterName = raids.some((raid) => raid.character.name === active)
      ? active
      : raids.find((raid) => !raid.done)?.character.name || "";
    recentlyChecked.clear();
    $("recordToast").hidden = true;
    $("quickNotice").textContent = "";
    $("quickUndo").hidden = true;
    $("quickDialog").showModal();
    render(raids);
    $("quickList").scrollTop = 0;
  }
  function changeView(next) {
    mode = next;
    recentlyChecked.clear();
    render(snapshot());
    $("quickList").scrollTop = 0;
  }
  $("openQuick").onclick = open;
  $("mobileQuick").onclick = open;
  $("quickDialog").addEventListener("close", () => {
    if (location.hash === "#record")
      history.replaceState(
        history.state,
        "",
        location.pathname + location.search,
      );
  });
  $("quickCharacter").onchange = () => {
    characterName = $("quickCharacter").value;
    changeView(mode);
  };
  $("quickOpen").onclick = () => changeView("open");
  $("quickDone").onclick = () => changeView("done");
  $("quickUndo").onclick = undo;
  $("undoRecord").onclick = undo;
  $("dismissRecord").onclick = () => {
    $("recordToast").hidden = true;
  };

  function resetSync() {
    controller?.abort();
    controller = undefined;
    previews = [];
    $("syncKey").value = "";
    $("syncStatus").textContent = "";
    $("syncResults").replaceChildren();
    $("previewSync").disabled = false;
    $("syncActions").hidden = true;
  }
  $("quickSync").onclick = () => {
    resetSync();
    $("syncDialog").showModal();
  };
  $("syncDialog").addEventListener("close", resetSync);
  window.addEventListener("pagehide", resetSync);
  function showResults(result) {
    const list = $("syncResults");
    list.replaceChildren();
    previews = result.candidates;
    for (const [index, entry] of previews.entries()) {
      const label = el("label", "", "sync-entry");
      const check = el("input");
      check.type = "checkbox";
      check.value = String(index);
      check.checked = true;
      label.append(
        check,
        el("span", entry.name + " · " + entry.bossName + " " + entry.level),
      );
      list.append(label);
    }
    if (result.unavailable.length) {
      const details = el("details", "", "sync-unavailable");
      details.append(
        el(
          "summary",
          "확인하지 못한 캐릭터 " + result.unavailable.length + "명",
        ),
      );
      for (const message of result.unavailable)
        details.append(el("p", message, "muted"));
      list.append(details);
    }
    $("syncActions").hidden = !previews.length;
    $("syncStatus").textContent =
      result.checked +
      "명 조회 · " +
      (previews.length
        ? previews.length + "건을 반영할 수 있어요."
        : "새로 반영할 격파가 없어요.");
  }
  $("syncForm").onsubmit = async (event) => {
    event.preventDefault();
    const key = $("syncKey").value.trim();
    if (!key || controller) return;
    $("syncKey").value = "";
    $("syncResults").replaceChildren();
    $("syncActions").hidden = true;
    previews = [];
    const raids = snapshot().filter((raid) => !raid.done);
    if (!raids.length) {
      $("syncStatus").textContent = "등록된 미격파 보스가 없어요.";
      return;
    }
    const request = new AbortController();
    controller = request;
    $("previewSync").disabled = true;
    $("syncStatus").textContent = "넥슨 계정의 캐릭터를 확인하고 있어요…";
    try {
      const result = await fetchSchedulerChanges({
        key,
        raids,
        signal: request.signal,
        onProgress: (index, count) => {
          if (!request.signal.aborted)
            $("syncStatus").textContent =
              "스케줄러 확인 중 · " + index + " / " + count;
        },
      });
      if (!request.signal.aborted) showResults(result);
    } catch (error) {
      if (!request.signal.aborted)
        $("syncStatus").textContent = schedulerError(error);
    } finally {
      if (controller === request) {
        controller = undefined;
        $("previewSync").disabled = false;
      }
    }
  };
  $("applySync").onclick = () => {
    const selected = [
      ...$("syncResults").querySelectorAll("input:checked"),
    ].map((node) => previews[Number(node.value)]);
    if (!selected.length) {
      $("syncStatus").textContent = "반영할 격파를 선택해 주세요.";
      return;
    }
    if (mode === "open")
      selected.forEach((entry) =>
        recentlyChecked.add(entry.name + "-" + entry.bossId),
      );
    $("syncDialog").close();
    commit(
      selected,
      (count) => "넥슨 스케줄러 격파 " + count + "건을 반영했어요.",
    );
  };
  return { complete, open, render, toggle };
}
