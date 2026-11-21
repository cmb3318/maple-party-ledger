export function setupPartyOrder(board, move) {
  const cards = () => [...board.querySelectorAll("[data-squad-id]")];
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const motions = new WeakMap();
  let drag;

  function measure(group) {
    return new Map(
      group.map((card) => [card.dataset.squadId, card.getBoundingClientRect()]),
    );
  }

  function glide(before, group) {
    group.forEach((card) => motions.get(card)?.cancel());
    if (reducedMotion.matches) return;
    for (const card of group) {
      const past = before.get(card.dataset.squadId);
      if (!past) continue;
      const rect = card.getBoundingClientRect();
      const x = past.left - rect.left;
      const y = past.top - rect.top;
      if (Math.abs(x) < 1 && Math.abs(y) < 1) continue;
      const motion = card.animate(
        [{ transform: `translate(${x}px, ${y}px)` }, { transform: "none" }],
        { duration: 220, easing: "cubic-bezier(.22, .75, .28, 1)" },
      );
      motions.set(card, motion);
    }
  }

  function slotAt(active) {
    const { x, y, grid, slot, others } = active;
    const bounds = grid.getBoundingClientRect();
    const left = x - bounds.left;
    const top = y - bounds.top;
    if (left < 0 || left > bounds.width || top < 0 || top > bounds.height)
      return -1;
    // The layout boxes stay fixed while the cards glide over them.
    const slots = [...grid.children].filter(
      (card) => card === slot || others.includes(card),
    );
    let nearest = -1;
    let distance = 13;
    for (const [index, card] of slots.entries()) {
      const dx = Math.max(
        card.offsetLeft - left,
        left - card.offsetLeft - card.offsetWidth,
        0,
      );
      const dy = Math.max(
        card.offsetTop - top,
        top - card.offsetTop - card.offsetHeight,
        0,
      );
      const gap = Math.hypot(dx, dy);
      if (gap < distance) {
        nearest = index;
        distance = gap;
      }
    }
    return nearest;
  }

  function preview(active) {
    const { x, y, slot, slotLabel, ghost, ghostLabel, others, origin } = active;
    if (
      active.lastX === x &&
      active.lastY === y &&
      active.lastScroll === window.scrollY
    )
      return;
    active.lastX = x;
    active.lastY = y;
    active.lastScroll = window.scrollY;
    const hit = slotAt(active);
    const index = hit < 0 ? origin : hit;
    if (index !== active.index) {
      const before = measure(others);
      if (others[index]) others[index].before(slot);
      else others.at(-1).after(slot);
      glide(before, others);
      active.index = index;
    }
    active.canDrop = hit >= 0;
    slot.classList.toggle("party-order-outside", !active.canDrop);
    slotLabel.textContent = index + 1 + "번째 자리";
    ghostLabel.textContent = active.canDrop
      ? slotLabel.textContent
      : "놓으면 취소";
    const left = Math.max(
      6,
      Math.min(
        x + 12,
        document.documentElement.clientWidth - ghost.offsetWidth - 6,
      ),
    );
    const top = Math.max(
      6,
      Math.min(y + 12, window.innerHeight - ghost.offsetHeight - 6),
    );
    ghost.style.transform = `translate3d(${left}px, ${top}px, 0)`;
  }

  function track() {
    if (!drag?.slot) return;
    const edge = 56;
    const overshoot =
      Math.max(0, drag.y - (window.innerHeight - edge)) -
      Math.max(0, edge - drag.y);
    if (overshoot) {
      window.scrollBy({
        top: Math.max(-20, Math.min(20, overshoot * 0.32)),
        behavior: "instant",
      });
    }
    preview(drag);
    drag.frame = requestAnimationFrame(track);
  }

  function begin(active) {
    const { card, grid } = active;
    const name = card.querySelector(".card-name").textContent;
    const slot = document.createElement("div");
    const slotLabel = document.createElement("strong");
    slot.className = "party-order-slot";
    slot.setAttribute("aria-hidden", "true");
    slot.style.height = card.getBoundingClientRect().height + "px";
    slot.append(slotLabel);
    card.before(slot);
    card.hidden = true;
    grid.classList.add("party-order-active");
    const ghost = document.createElement("div");
    const ghostLabel = document.createElement("small");
    ghost.className = "party-order-ghost";
    ghost.setAttribute("aria-hidden", "true");
    ghost.style.setProperty(
      "--grab-color",
      card.style.getPropertyValue("--party"),
    );
    ghost.append(name, ghostLabel);
    document.body.append(ghost);
    Object.assign(active, { slot, slotLabel, ghost, ghostLabel });
    track();
  }

  function save(card, target, before) {
    move(card.dataset.squadId, target.dataset.squadId).then(() => {
      if (!drag) glide(before, cards());
    });
  }

  function finish(commit = false, animate = true) {
    if (!drag) return;
    const active = drag;
    drag = undefined;
    cancelAnimationFrame(active.frame);
    if (board.hasPointerCapture(active.id))
      board.releasePointerCapture(active.id);
    if (!active.slot) return;
    const { card, handle, slot, ghost, group, index, origin, grid } = active;
    const shouldMove = commit && active.canDrop && index !== origin;
    const before = animate ? measure(active.others) : null;
    if (shouldMove) slot.replaceWith(card);
    else slot.remove();
    card.hidden = false;
    ghost.remove();
    grid.classList.remove("party-order-active");
    if (animate) {
      handle.focus({ preventScroll: true });
      glide(before, group);
    }
    if (shouldMove) save(card, group[index], before);
  }

  board.addEventListener("pointerdown", (event) => {
    const handle = event.target.closest(".party-grip");
    if (!handle || event.button !== 0 || !event.isPrimary) return;
    finish();
    const card = handle.closest("[data-squad-id]");
    const group = cards();
    const origin = group.indexOf(card);
    event.preventDefault();
    handle.focus({ preventScroll: true });
    board.setPointerCapture(event.pointerId);
    drag = {
      id: event.pointerId,
      handle,
      card,
      group,
      origin,
      index: origin,
      grid: card.parentElement,
      others: group.filter((item) => item !== card),
      startX: event.clientX,
      startY: event.clientY,
    };
  });
  board.addEventListener("pointermove", (event) => {
    if (drag?.id !== event.pointerId) return;
    drag.x = event.clientX;
    drag.y = event.clientY;
    if (
      !drag.slot &&
      Math.hypot(drag.x - drag.startX, drag.y - drag.startY) >= 6
    )
      begin(drag);
  });
  board.addEventListener("pointerup", (event) => {
    if (drag?.id !== event.pointerId) return;
    if (drag.slot) {
      drag.x = event.clientX;
      drag.y = event.clientY;
      preview(drag);
    }
    finish(true);
  });
  board.addEventListener("lostpointercapture", (event) => {
    if (drag?.id === event.pointerId) finish();
  });
  board.addEventListener("keydown", (event) => {
    const handle = event.target.closest(".party-grip");
    if (!handle) return;
    const direction = {
      ArrowUp: -1,
      ArrowLeft: -1,
      ArrowDown: 1,
      ArrowRight: 1,
    }[event.key];
    if (!direction) return;
    event.preventDefault();
    const card = handle.closest("[data-squad-id]");
    const group = cards();
    const target = group[group.indexOf(card) + direction];
    if (target) save(card, target, measure(group));
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && drag) {
      event.preventDefault();
      finish();
    }
  });
  window.addEventListener("blur", () => finish(false, false));
  window.addEventListener("resize", () => finish());
  return { reset: () => finish(false, false) };
}
