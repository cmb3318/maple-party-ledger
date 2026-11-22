import {
  groupFor, historyAnalysis, historyPeriods, historyStatus, historyTotals,
} from "./history-data.js";
import { historyChart } from "./history-chart.js";

const $ = (id) => document.getElementById(id);
const date = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric" });
const timestamp = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
});
const format = new Intl.NumberFormat("ko-KR");
const meso = (value) => format.format(value) + " 메소";
const empty = (status) => status === "missing" || status === "partial";
const month = (item) => Number(item.key.slice(5, 7)) + "월";
const short = (item, cycle) => cycle === "weekly" ? date.format(item.start) : month(item);
const length = (item, cycle) => cycle === "weekly"
  ? item.key.slice(0, 4) + "년 " + date.format(item.start) + " – " + date.format(item.end - 1)
  : item.key.slice(0, 4) + "년 " + month(item);

export function setupHistory({ getState, canSave, openQuick, el, button, bossIcon, difficultyTag }) {
  const dialog = $("historyDialog");
  const viewport = $("historyViewport");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const selected = {};
  const following = {};
  let cycle = "weekly";
  let grouping = "character";
  let display = "cell";
  let model;
  let scrollLatest = true;

  function fly(panel, distance = 5) {
    if (reduced.matches || !panel.animate) return;
    panel.getAnimations().forEach((animation) => animation.cancel());
    panel.animate([
      { transform: "translateY(" + distance + "px)", opacity: 0.58 },
      { transform: "none", opacity: 1 },
    ], { duration: 205, easing: "cubic-bezier(.22,.7,.3,1)" });
  }
  function selectPeriod(item) {
    selected[cycle] = item.key;
    following[cycle] = item.key === model?.byPeriod.at(-1).key;
    render(Date.now(), true);
  }
  function periodButton(item, place, label = short(item, cycle)) {
    const control = button(label, () => selectPeriod(item), "history-period-button");
    control.dataset.historyFocus = place + "/" + item.key;
    control.dataset.status = item.status;
    control.title = length(item, cycle) + " · " + historyStatus[item.status];
    control.setAttribute("aria-pressed", selected[cycle] === item.key);
    return control;
  }
  function groupColor(node, color) {
    if (/^#[\da-f]{6}$/i.test(color || "")) node.style.setProperty("--history-tone", color);
  }

  function matrix({ byPeriod, groups, missed, emphasize }) {
    const table = el("table", "", "history-matrix");
    const header = table.createTHead().insertRow();
    function heading(row, title, scope) {
      const cell = el("th", title);
      cell.scope = scope;
      row.append(cell);
      return cell;
    }
    heading(header, { character: "캐릭터", party: "파티", boss: "보스" }[grouping], "col");
    for (const item of byPeriod) {
      const control = periodButton(item, "head");
      if (item.status === "current") control.append(el("small", "이번 기간"));
      if (item.status === "partial") control.append(el("small", "부분 기록"));
      heading(header, "", "col").append(control);
    }
    const body = table.createTBody();
    if (!groups.length) {
      const cell = body.insertRow().insertCell();
      cell.colSpan = byPeriod.length + 1;
      cell.textContent = "조회 조건에 맞는 기록이 없어요.";
      return table;
    }
    for (const group of groups) {
      const row = body.insertRow();
      const label = heading(row, group.name, "row");
      groupColor(label, group.color);
      if (grouping === "boss") label.prepend(bossIcon({ id: group.id }));
      for (const item of byPeriod) {
        const result = item.cells.get(group.id);
        const rows = result?.rows ?? [];
        const changeCount = result?.changes.length ?? 0;
        const totals = historyTotals(rows);
        let caption = "–";
        if (item.status === "partial" && totals.done && !missed) caption = "확인 " + totals.done;
        if (!empty(item.status) && totals.count)
          caption = (missed ? totals.count - totals.done : totals.done) + "/" + totals.count;
        const cell = row.insertCell();
        cell.dataset.active = selected[cycle] === item.key;
        cell.dataset.status = item.status;
        const control = button(caption, () => {
          $("historyGroup").value = group.id;
          selectPeriod(item);
        }, "history-cell");
        control.dataset.historyFocus = "cell/" + group.id + "/" + item.key;
        control.dataset.complete = !missed && !!totals.count && totals.done === totals.count;
        control.dataset.changed = emphasize && !!changeCount;
        control.title = [group.name, length(item, cycle), historyStatus[item.status],
          totals.count && (missed ? "미격파 " : "격파 ") + caption,
          changeCount && "변동 " + changeCount + "건"].filter(Boolean).join(" · ");
        control.setAttribute("aria-label", control.title);
        if (emphasize && changeCount) control.append(el("small", " ◆"));
        cell.append(control);
      }
    }
    return table;
  }

  function stat(name, value, note = "") {
    const tile = el("div", "", "history-stat");
    tile.append(el("span", name), el("strong", value));
    if (note) tile.append(el("small", note));
    return tile;
  }
  function overview(item, previous) {
    const known = !empty(item.status);
    const { count, done, planned, earned } = item.totals;
    const different = previous && !empty(previous.status) ? done - previous.totals.done : 0;
    const delta = different
      ? "이전 기간 대비 " + (different > 0 ? "+" : "") + different + "개" : "";
    $("historyPeriodTitle").textContent = length(item, cycle);
    const time = Number.isFinite(item.at) ? " · " + timestamp.format(item.at) + " 저장" : "";
    $("historyPeriodStatus").textContent = historyStatus[item.status] + time;
    $("historyPeriodStatus").dataset.status = item.status;
    $("historyStats").replaceChildren(
      stat("격파 진행", known ? done + "/" + count : item.status === "partial" ? "확인 " + done + "개" : "–", known ? delta : ""),
      stat("예상 결정석", known ? meso(planned) : "–"),
      stat("격파분 결정석", known ? meso(earned) : "–"),
      stat("미격파", known ? count - done + "개" : "–", known ? meso(planned - earned) : ""),
    );
  }

  function groupRanking(rows, basis) {
    const counts = new Map();
    for (const row of rows) {
      if (row.done) continue;
      const group = groupFor(row, basis);
      const entry = counts.get(group.id) ?? { ...group, count: 0 };
      entry.count += 1;
      counts.set(group.id, entry);
    }
    const leaders = [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 3);
    if (!leaders.length) return;
    const list = el("div", "", "history-ranking");
    list.append(el("strong", basis === "party" ? "파티별 미격파" : "캐릭터별 미격파"));
    for (const item of leaders) {
      const stage = el("div", "", "history-rank");
      groupColor(stage, item.color);
      const progress = el("progress");
      progress.value = item.count;
      progress.max = leaders[0].count;
      progress.setAttribute("aria-label", item.name + " 미격파 " + item.count + "개");
      stage.append(el("span", item.name), progress, el("b", item.count + "개"));
      list.append(stage);
    }
    return list;
  }
  function rankGroups(panel, rows) {
    panel.replaceChildren();
    for (const basis of ["party", "character"]) {
      const ranking = groupRanking(rows, basis);
      if (ranking) panel.append(ranking);
    }
  }
  function detailRow(row, changed) {
    const line = el("li", "", "history-raid");
    line.dataset.done = row.done;
    line.dataset.changed = changed;
    groupColor(line, row.color);
    const identity = el("div", "", "history-raid-name");
    const title = el("strong", row.boss);
    if (row.level) title.append(" ", difficultyTag(row.level));
    identity.append(bossIcon({ id: row.bossId }), title);
    line.append(identity,
      el("span", [row.character, row.party || "파티 확인 불가", row.size && row.size + "인"].filter(Boolean).join(" · "), "history-raid-party"),
      el("span", row.value == null ? "–" : meso(row.value)),
      el("b", row.done ? "격파" : "미격파", "history-raid-status"));
    return line;
  }
  function changeRow({ kind, from, to }) {
    const row = to ?? from;
    const title = el("strong", row.character + " · " + row.boss);
    const describe = (side) => side
      ? [side.level, side.party, side.size + "인", meso(side.value)].join(" · ") : "–";
    const entry = el("li", "", "history-change");
    entry.append(el("b", kind), title,
      el("span", describe(from) + " → " + describe(to), "muted"));
    return entry;
  }
  function details(item, emphasize, missed) {
    const panel = $("historyDetail");
    panel.replaceChildren();
    if (item.status === "missing") {
      panel.append(el("p", "이 기간에 브라우저에 남은 보스 기록이 없어요.", "history-empty"));
      return;
    }
    if (item.status === "partial")
      panel.append(el("p", "이전 버전에서 격파 여부가 확인된 보스만 표시해요.", "history-empty"));
    const rank = el("div", "", "history-rankings");
    rankGroups(rank, item.all);
    if (rank.childElementCount) panel.append(rank);
    const changedKeys = new Set(item.changes.map(({ from, to }) =>
      (to ?? from).character + "/" + (to ?? from).bossId));
    if (item.displayed.length) {
      const list = el("ul", "", "history-raids");
      for (const row of [...item.displayed].sort((a, b) => Number(a.done) - Number(b.done)))
        list.append(detailRow(row, emphasize && changedKeys.has(row.character + "/" + row.bossId)));
      panel.append(list);
    } else {
      panel.append(el("p", missed
        ? item.status === "partial" ? "미격파 여부를 확인할 수 없어요." : "조회 조건에 맞는 미격파 보스가 없어요."
        : "조회 조건에 맞는 보스가 없어요.", "history-empty"));
    }
    if (item.changes.length) {
      const change = el("details", "", "history-change-panel");
      change.open = emphasize;
      const list = el("ul");
      item.changes.forEach((entry) => list.append(changeRow(entry)));
      change.append(el("summary", "이전 기간과 달라진 보스 " + item.changes.length + "건"), list);
      panel.append(change);
    } else if (emphasize && !item.comparable) {
      panel.append(el("p", "연속된 두 기간의 전체 기록이 있으면 변동을 비교할 수 있어요.", "muted history-legend"));
    }
  }

  function render(now = Date.now(), animate = false) {
    if (!dialog.open) return;
    const state = getState();
    const range = Number($("historyRange").value);
    const missed = $("historyMissed").checked;
    const emphasize = $("historyChanges").checked;
    const metric = $("historyMetric").value;
    const group = $("historyGroup");
    const terms = $("historySearch").value.trim().toLocaleLowerCase("ko-KR").split(/\s+/).filter(Boolean);
    const periods = historyPeriods(state, cycle, range, now);
    const options = { grouping, terms, groupId: group.value, missed };
    let analysis = historyAnalysis(periods, options);
    const groupId = group.value;
    const labels = analysis.availableGroups.sort((a, b) => a.name.localeCompare(b.name, "ko-KR"));
    group.replaceChildren(new Option("전체", ""), ...labels.map(({ name, id }) => new Option(name, id)));
    group.value = labels.some(({ id }) => groupId === id) ? groupId : "";
    if (group.value !== groupId) analysis = historyAnalysis(periods, { ...options, groupId: group.value });

    const focus = document.activeElement?.dataset.historyFocus;
    const left = viewport.scrollLeft;
    const { byPeriod, groups } = analysis;
    const periodIndex = following[cycle] === false
      ? byPeriod.findIndex((item) => item.key === selected[cycle]) : -1;
    const index = periodIndex < 0 ? byPeriod.length - 1 : periodIndex;
    const current = byPeriod[index];
    if (periodIndex < 0) following[cycle] = true;
    selected[cycle] = current.key;
    const selector = $("historyPeriod");
    selector.replaceChildren(...[...byPeriod].reverse().map((item) =>
      new Option(length(item, cycle) + " · " + historyStatus[item.status], item.key)));
    selector.value = current.key;
    overview(current, byPeriod[index - 1]);
    const itemCount = Object.keys(state.history?.[cycle] ?? {}).length;
    $("historyStorage").textContent = (cycle === "weekly" ? "주간 " : "월간 ") +
      itemCount + "개 기간 · " + (canSave() ? "이 브라우저에 저장" : "이번 창의 기록 포함");
    const values = { historyCycle: cycle, historyGrouping: grouping, historyDisplay: display };
    for (const [id, value] of Object.entries(values))
      for (const control of $(id).children) control.setAttribute("aria-pressed", control.dataset.value === value);
    $("historyMetricLabel").hidden = display === "cell";
    const scope = group.selectedOptions[0]?.textContent ?? "전체";
    model = { byPeriod, cycle, scope, missed };
    $("historyExport").disabled = !byPeriod.some((item) => item.status !== "missing");
    const rangeMisses = byPeriod.flatMap((item) => item.all.filter((row) => !row.done));
    $("historyRangeMisses").hidden = !rangeMisses.length;
    $("historyRangeMissesTitle").textContent =
      "조회 범위 미격파 누적 " + rangeMisses.length + "건";
    rankGroups($("historyRangeRanks"), rangeMisses);

    const shown = missed ? "미격파" : "격파";
    $("historyLegend").textContent = display === "cell"
      ? shown + " / 계획 · ◆ 변동 · – 기록 또는 배정 없음"
      : "옅은 색 " + (metric === "rate" ? "100% 기준" : "계획") +
        " · 밝은 색 " + (metric === "meso" ? (missed ? "미격파분" : "격파분") + " 결정석" : shown) +
        " · 빈 구간은 비교 가능한 수치 없음";
    viewport.replaceChildren(display === "cell"
      ? matrix({ byPeriod, groups, missed, emphasize })
      : historyChart(byPeriod, {
        metric, missed, display, selected: current.key, periodButton, el,
      }));
    viewport.scrollLeft = scrollLatest ? viewport.scrollWidth : left;
    scrollLatest = false;
    details(current, emphasize, missed);
    if (focus) viewport.querySelector('[data-history-focus="' + CSS.escape(focus) + '"]')
      ?.focus({ preventScroll: true });
    if (animate) {
      fly(viewport.firstElementChild, 4);
      fly($("historyStats"), 3);
      fly($("historyDetail"), 5);
    }
  }

  function message(text) {
    $("historyMessage").textContent = text;
    $("historyMessage").hidden = !text;
  }
  for (const [id, change] of [
    ["historyCycle", (value) => { cycle = value; $("historyGroup").value = ""; scrollLatest = true; }],
    ["historyGrouping", (value) => { grouping = value; $("historyGroup").value = ""; }],
    ["historyDisplay", (value) => { if (display !== value) scrollLatest = true; display = value; }],
  ]) {
    $(id).onclick = (event) => {
      const control = event.target.closest("button[data-value]");
      if (!control || control.getAttribute("aria-pressed") === "true") return;
      change(control.dataset.value);
      render(Date.now(), true);
    };
  }
  for (const id of ["historyGroup", "historyMetric", "historyMissed", "historyChanges"])
    $(id).onchange = () => render(Date.now(), true);
  $("historySearch").oninput = () => render(Date.now(), true);
  $("historyRange").onchange = () => { scrollLatest = true; render(Date.now(), true); };
  $("historyPeriod").onchange = (event) => selectPeriod({ key: event.target.value });
  $("historyRangeMisses").ontoggle = () => {
    if ($("historyRangeMisses").open) fly($("historyRangeRanks"), 3);
  };
  $("openHistory").onclick = () => {
    message("");
    scrollLatest = true;
    dialog.showModal();
    render();
  };
  $("historyQuick").onclick = () => {
    dialog.close();
    openQuick();
  };
  $("historyExport").onclick = async () => {
    const selection = model;
    $("historyExport").disabled = true;
    message("");
    try {
      const { historyWorkbook } = await import("./history-xlsx.js");
      const blob = historyWorkbook(selection.byPeriod, selection);
      const url = URL.createObjectURL(blob);
      const link = el("a");
      link.href = url;
      link.download = "메이플가계부-" + (selection.cycle === "weekly" ? "주간" : "월간") +
        "-" + selection.byPeriod.at(-1).key + ".xlsx";
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      message("Excel 파일 다운로드를 시작했어요.");
    } catch {
      message("Excel 파일을 만들 수 없어요. 조회 범위를 줄여 다시 시도해 주세요.");
    } finally {
      $("historyExport").disabled = !model.byPeriod.some((item) => item.status !== "missing");
    }
  };
  return { render };
}
