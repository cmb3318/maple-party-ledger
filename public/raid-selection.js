export function setupRaidSelection(board, dock, complete) {
  const desktop = matchMedia(
    "(min-width: 651px) and (any-pointer: fine) and (any-hover: hover)",
  );
  const action = dock.querySelector("[data-complete-selection]");
  const cancel = dock.querySelector("[data-cancel-selection]");
  const bounds = dock.querySelector("[data-selected-count]");
  let gesture;
  let selected = new Set();
  let suppressClick = false;

  function select(rows) {
    for (const row of selected) {
      if (!rows.has(row)) row.classList.remove("drag-selected");
    }
    for (const row of rows) {
      if (!selected.has(row)) row.classList.add("drag-selected");
    }
    selected = rows;
  }
  function release() {
    const active = gesture;
    if (!active) return;
    gesture = undefined;
    cancelAnimationFrame(active.frame);
    if (board.hasPointerCapture(active.id))
      board.releasePointerCapture(active.id);
    board.classList.remove("drag-selecting");
  }
  function reset() {
    release();
    select(new Set());
    dock.hidden = true;
  }
  function cancelSelection() {
    const first = selected.values().next().value;
    reset();
    first?.focus({ preventScroll: true });
  }
  function updateRange() {
    const { startX, startY, x, y, rows } = gesture;
    const { scrollX, scrollY } = window;
    const endX = x + scrollX;
    const endY = y + scrollY;
    if (gesture.endX === endX && gesture.endY === endY) return;
    gesture.endX = endX;
    gesture.endY = endY;
    const left = Math.min(startX, endX);
    const right = Math.max(startX, endX);
    const top = Math.min(startY, endY);
    const bottom = Math.max(startY, endY);
    select(
      new Set(
        rows.filter((row) => {
          const rect = row.getBoundingClientRect();
          return (
            rect.width &&
            rect.height &&
            rect.right + scrollX >= left &&
            rect.left + scrollX <= right &&
            rect.bottom + scrollY >= top &&
            rect.top + scrollY <= bottom
          );
        }),
      ),
    );
  }
  function track() {
    if (!gesture?.dragging) return;
    const edge = 52;
    const y = gesture.y;
    const overflow =
      Math.max(0, y - (window.innerHeight - edge)) - Math.max(0, edge - y);
    if (overflow)
      window.scrollBy({
        top: Math.max(-22, Math.min(22, overflow * 0.35)),
        behavior: "instant",
      });
    updateRange();
    gesture.frame = requestAnimationFrame(track);
  }

  board.addEventListener("pointerdown", (event) => {
    suppressClick = false;
    if (!desktop.matches || event.pointerType !== "mouse" || event.button !== 0)
      return;
    const row = event.target.closest(".check-row");
    if (!row || row.closest("[hidden], [inert], .fold-motion")) return;
    reset();
    gesture = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX + window.scrollX,
      startY: event.clientY + window.scrollY,
      rows: [...board.querySelectorAll(".check-row")].filter(
        (item) => !item.closest("[hidden], [inert], .fold-motion"),
      ),
    };
  });
  board.addEventListener("dragstart", (event) => {
    if (gesture) event.preventDefault();
  });
  board.addEventListener(
    "click",
    (event) => {
      if (!suppressClick || !event.detail) return;
      suppressClick = false;
      event.preventDefault();
      event.stopImmediatePropagation();
    },
    true,
  );
  window.addEventListener("pointermove", (event) => {
    if (gesture?.id !== event.pointerId) return;
    if (!(event.buttons & 1)) {
      reset();
      return;
    }
    gesture.x = event.clientX;
    gesture.y = event.clientY;
    if (gesture.dragging) return;
    if (
      Math.hypot(
        gesture.x + window.scrollX - gesture.startX,
        gesture.y + window.scrollY - gesture.startY,
      ) < 7
    )
      return;
    gesture.dragging = true;
    suppressClick = true;
    board.setPointerCapture(event.pointerId);
    board.classList.add("drag-selecting");
    track();
  });
  window.addEventListener("pointerup", (event) => {
    if (gesture?.id !== event.pointerId) return;
    if (gesture.dragging) {
      gesture.x = event.clientX;
      gesture.y = event.clientY;
      updateRange();
      const remaining = [...selected].filter(
        (row) => row.getAttribute("aria-pressed") === "false",
      ).length;
      bounds.textContent = selected.size + "개 선택";
      action.textContent = remaining ? remaining + "개 격파" : "모두 격파됨";
      action.disabled = !remaining;
      dock.hidden = selected.size === 0;
      if (!dock.hidden) (remaining ? action : cancel).focus({ preventScroll: true });
    }
    release();
  });
  window.addEventListener("pointercancel", (event) => {
    if (gesture?.id === event.pointerId) reset();
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && (gesture || selected.size)) cancelSelection();
  });
  window.addEventListener("blur", reset);
  desktop.addEventListener("change", reset);
  action.onclick = () => complete([...selected]);
  cancel.onclick = cancelSelection;
  return { reset };
}
