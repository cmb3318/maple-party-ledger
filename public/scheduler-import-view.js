import {
  scanSchedulerCharacters, schedulerError, schedulerRequest, schedulerRoster,
} from "./scheduler.js";
import { applySchedulerImport, previewSchedulerImport } from "./scheduler-import.js";

export function setupSchedulerImport({ getState, update, canSave, showCharacters, el }) {
  const $ = (id) => document.getElementById(id);
  const dialog = $("schedulerImportDialog");
  const auth = $("schedulerImportAuth");
  const rosterSection = $("schedulerImportRoster");
  const previewSection = $("schedulerImportPreview");
  const result = $("schedulerImportStatus");
  const keyInput = $("schedulerImportKey");
  let controller;
  let request;
  let roster = [];
  let previews = [];
  let applying = false;

  function show(section) {
    for (const panel of [auth, rosterSection, previewSection]) panel.hidden = panel !== section;
  }
  function reset() {
    controller?.abort();
    controller = request = undefined;
    roster = previews = [];
    keyInput.value = "";
    $("schedulerImportPicker").replaceChildren();
    $("schedulerImportRows").replaceChildren();
    $("schedulerImportConnect").disabled = $("schedulerImportScan").disabled = false;
    result.textContent = "";
    show(auth);
  }
  function open() {
    if (dialog.open || applying) return;
    reset();
    dialog.showModal();
  }
  function checkbox(on, label) {
    const input = el("input");
    input.type = "checkbox";
    input.checked = on;
    if (label) input.setAttribute("aria-label", label);
    return input;
  }
  function renderRoster() {
    const local = getState().parties;
    $("schedulerImportPicker").replaceChildren(...roster.map((row, index) => {
      const label = el("label", "", "scheduler-pick");
      const checked = local.some((p) => p.name.toLowerCase() === row.character_name.toLowerCase() &&
        (!p.profile?.world || p.profile.world === row.world_name));
      const input = checkbox(checked);
      input.value = index;
      const name = el("span", row.character_name + " · " + row.world_name +
        (row.character_level ? " · Lv. " + row.character_level : ""));
      label.append(input, name);
      return label;
    }));
    $("schedulerImportScan").disabled = !roster.length;
    result.textContent = roster.length
      ? "캐릭터 " + roster.length + "명. 가져올 캐릭터를 선택하세요."
      : "조회 가능한 메이플스토리 캐릭터가 없어요.";
    show(rosterSection);
  }
  function renderPreview(entries) {
    previews = previewSchedulerImport(getState(), entries);
    const rows = $("schedulerImportRows");
    rows.replaceChildren(...previews.map((entry, index) => {
      const panel = el("fieldset", "", "scheduler-preview-character");
      const legend = el("legend");
      const label = el("label", "", "scheduler-pick");
      const selected = checkbox(!entry.blocked);
      selected.value = index;
      selected.className = "scheduler-character-choice";
      selected.disabled = entry.blocked;
      label.append(selected, el("b", entry.profile.name + " · " + entry.profile.world),
        el("small", entry.existing ? "기존" : "추가"));
      legend.append(label);
      panel.append(legend);
      if (entry.blocked) {
        panel.append(el("p", "같은 이름의 캐릭터가 다른 월드에 등록되어 있어요.", "muted"));
        return panel;
      }
      if (entry.schedulerError)
        panel.append(el("p", "스케줄러 확인 불가 · " + entry.schedulerError, "muted"));
      else if (!entry.plans.length)
        panel.append(el("p", "가져올 보스 배정이나 격파 기록이 없어요.", "muted"));
      if (entry.imageError)
        panel.append(el("p", "외형을 불러오지 못했어요.", "muted"));
      for (const [index, plan] of entry.plans.entries()) {
        const row = el("div", "", "scheduler-preview-boss");
        row.dataset.plan = index;
        const check = checkbox(true, plan.bossName + " 반영");
        const choice = el("select");
        choice.setAttribute("aria-label", plan.bossName + " 난이도");
        if (!plan.level) choice.append(new Option("난이도 선택", ""));
        for (const level of plan.levels) choice.append(new Option(level, level));
        choice.value = plan.level;
        const note = plan.clearLevel ? "격파 확인 " + plan.clearLevel : "등록 보스";
        row.append(check, el("span", plan.bossName + " · " + note), choice);
        panel.append(row);
      }
      return panel;
    }));
    $("schedulerImportApply").disabled = previews.every((entry) => entry.blocked);
    result.textContent = "체크한 캐릭터와 보스만 반영해요.";
    show(previewSection);
  }

  $("schedulerImportAuth").onsubmit = async (event) => {
    event.preventDefault();
    const supplied = keyInput.value.trim();
    if (!supplied || controller) return;
    keyInput.value = "";
    const run = new AbortController();
    controller = run;
    request = schedulerRequest(supplied, run.signal);
    $("schedulerImportConnect").disabled = true;
    result.textContent = "넥슨에서 캐릭터 목록을 불러오는 중이에요…";
    try {
      const owned = await schedulerRoster(request);
      if (!run.signal.aborted) {
        roster = owned;
        renderRoster();
        if (!roster.length) controller = request = undefined;
      }
    } catch (error) {
      if (!run.signal.aborted) {
        controller = request = undefined;
        $("schedulerImportConnect").disabled = false;
        result.textContent = schedulerError(error);
      }
    }
  };
  $("schedulerImportScan").onclick = async () => {
    const selected = [...$("schedulerImportPicker").querySelectorAll("input:checked")]
      .map(({ value }) => roster[Number(value)]);
    if (!selected.length) {
      result.textContent = "가져올 캐릭터를 하나 이상 선택하세요.";
      return;
    }
    if (!request || !controller) return;
    const run = controller;
    $("schedulerImportScan").disabled = true;
    try {
      const entries = await scanSchedulerCharacters({
        request, characters: selected, signal: run.signal,
        onProgress: (index, total) => {
          result.textContent = "스케줄러 조회 중 · " + index + "/" + total;
        },
      });
      if (!run.signal.aborted) renderPreview(entries);
    } catch (error) {
      if (!run.signal.aborted) {
        show(auth);
        result.textContent = schedulerError(error);
      }
    } finally {
      if (controller === run) {
        request = controller = undefined;
        roster = [];
        $("schedulerImportConnect").disabled = false;
        $("schedulerImportScan").disabled = false;
      }
    }
  };
  $("schedulerImportApply").onclick = async () => {
    if (applying) return;
    const selected = [...$("schedulerImportRows").querySelectorAll(".scheduler-character-choice:checked")]
      .map((checkbox) => {
        const entry = previews[Number(checkbox.value)];
        const panel = checkbox.closest("fieldset");
        const plans = [...panel.querySelectorAll("[data-plan]")].flatMap((row) => {
          if (!row.querySelector("input").checked) return [];
          const plan = entry.plans[Number(row.dataset.plan)];
          return [{ ...plan, level: row.querySelector("select").value }];
        });
        return { ...entry, plans };
      });
    if (!selected.length) {
      result.textContent = "반영할 캐릭터를 선택하세요.";
      return;
    }
    applying = true;
    const button = $("schedulerImportApply");
    button.disabled = true;
    try {
      let summary;
      await update((state, now) => {
        summary = applySchedulerImport(state, selected, now);
        if (summary.characters) showCharacters();
      });
      show(null);
      result.textContent = [
        "캐릭터 " + summary.characters + "명",
        "보스 추가 " + summary.added + "개",
        "난이도 변경 " + summary.changed + "개",
        "격파 반영 " + summary.cleared + "개",
        summary.skipped ? "건너뜀 " + summary.skipped + "건" : "",
        canSave() ? "" : "이 창에만 반영됨",
      ].filter(Boolean).join(" · ");
    } catch {
      result.textContent = "설정을 저장하지 못했어요.";
    } finally {
      applying = false;
      button.disabled = false;
    }
  };
  dialog.addEventListener("close", reset);
  window.addEventListener("pagehide", reset);
  return { open };
}
