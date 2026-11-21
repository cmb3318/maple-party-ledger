export function setupPartyOrder(board, move) {
  const cards = () => [...board.querySelectorAll("[data-squad-id]")];
  let drag;

  function clearTarget() {
    if (drag?.target) delete drag.target.dataset.orderDrop;
  }

  function track() {
    if (!drag?.moving) return;
    const { x, y, card, group } = drag;
    const edge = 56;
    const overshoot =
      Math.max(0, y - (window.innerHeight - edge)) - Math.max(0, edge - y);
    if (overshoot)
      window.scrollBy(0, Math.max(-20, Math.min(20, overshoot * 0.32)));
    const hit = document.elementFromPoint(x, y)?.closest("[data-squad-id]");
    const target = hit !== card && group.includes(hit) ? hit : undefined;
    if (target !== drag.target) {
      clearTarget();
      drag.target = target;
      if (target)
        target.dataset.orderDrop =
          group.indexOf(target) > group.indexOf(card) ? "after" : "before";
    }
    drag.frame = requestAnimationFrame(track);
  }

  function finish(commit = false) {
    if (!drag) return;
    const { card, handle, target, id, frame } = drag;
    clearTarget();
    drag = undefined;
    cancelAnimationFrame(frame);
    card.classList.remove("party-order-source");
    if (handle.hasPointerCapture(id)) handle.releasePointerCapture(id);
    if (commit && target) move(card.dataset.squadId, target.dataset.squadId);
  }

  board.addEventListener("pointerdown", (event) => {
    const handle = event.target.closest(".party-grip");
    if (!handle || event.button !== 0 || !event.isPrimary) return;
    finish();
    event.preventDefault();
    handle.focus({ preventScroll: true });
    handle.setPointerCapture(event.pointerId);
    drag = {
      id: event.pointerId,
      handle,
      card: handle.closest("[data-squad-id]"),
      group: cards(),
      startX: event.clientX,
      startY: event.clientY,
    };
  });
  board.addEventListener("pointermove", (event) => {
    if (drag?.id !== event.pointerId) return;
    drag.x = event.clientX;
    drag.y = event.clientY;
    if (
      drag.moving ||
      Math.hypot(drag.x - drag.startX, drag.y - drag.startY) < 6
    )
      return;
    drag.moving = true;
    drag.card.classList.add("party-order-source");
    track();
  });
  board.addEventListener("pointerup", (event) => {
    if (drag?.id !== event.pointerId) return;
    if (drag.moving) {
      // Hit-test the release directly in case it landed before the next frame.
      const hit = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest("[data-squad-id]");
      clearTarget();
      drag.target =
        hit !== drag.card && drag.group.includes(hit) ? hit : undefined;
    }
    finish(true);
  });
  board.addEventListener("lostpointercapture", (event) => {
    if (drag?.id === event.pointerId) finish();
  });
  board.addEventListener("keydown", (event) => {
    const handle = event.target.closest(".party-grip");
    if (!handle) return;
    if (event.key === "Escape") {
      finish();
      return;
    }
    const direction = {
      ArrowUp: -1,
      ArrowLeft: -1,
      ArrowDown: 1,
      ArrowRight: 1,
    }[event.key];
    if (!direction) return;
    event.preventDefault();
    finish();
    const card = handle.closest("[data-squad-id]");
    const group = cards();
    const target = group[group.indexOf(card) + direction];
    if (target) move(card.dataset.squadId, target.dataset.squadId);
  });
  window.addEventListener("blur", () => finish());
  return { reset: () => finish() };
}
