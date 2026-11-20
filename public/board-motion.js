function snapshot(board) {
  const items = new Map();
  for (const element of board.querySelectorAll("[data-motion-key]")) {
    if (element.closest("[inert], [hidden]")) continue;
    items.set(element.dataset.motionKey, {
      element,
      rect: element.getBoundingClientRect(),
    });
  }
  return items;
}

function nearViewport({ top, bottom, left, right }) {
  return (
    bottom >= -16 &&
    top <= window.innerHeight + 16 &&
    right >= 0 &&
    left <= window.innerWidth
  );
}

export function setupBoardMotion(board) {
  let exits;

  function capture(animate) {
    exits?.remove();
    exits = undefined;
    if (animate) return snapshot(board);
  }

  function play(previous, justCleared) {
    if (!previous) return;
    const next = snapshot(board);
    if (
      previous.size === next.size &&
      [...previous.keys()].every((key) => next.has(key))
    )
      return;
    for (const [key, { element, rect }] of next) {
      const past = previous.get(key)?.rect;
      if (!nearViewport(rect) && !(past && nearViewport(past))) continue;
      const dx = past ? past.left - rect.left : 0;
      const dy = past ? past.top - rect.top : -5;
      if (past && Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      element.animate(
        [
          { transform: `translate(${dx}px, ${dy}px)`, opacity: past ? 1 : 0 },
          { transform: "none", opacity: 1 },
        ],
        { duration: 210, easing: "cubic-bezier(.22, .7, .3, 1)" },
      );
    }
    const leaving = [...previous].filter(
      ([key, { rect }]) => !next.has(key) && nearViewport(rect),
    );
    if (!leaving.length) return;
    const layer = document.createElement("div");
    layer.className = "board-exits";
    layer.inert = true;
    layer.setAttribute("aria-hidden", "true");
    for (const [, { element, rect }] of leaving) {
      const tile = document.createElement("div");
      tile.className = "board-exit";
      tile.style.left = rect.left + "px";
      tile.style.top = rect.top + "px";
      tile.style.width = rect.width + "px";
      tile.style.height = rect.height + "px";
      const ghost = element.cloneNode(true);
      ghost.removeAttribute("data-motion-key");
      ghost.removeAttribute("data-raid");
      ghost.removeAttribute("data-focus");
      if (justCleared && ghost.classList.contains("check-row")) {
        ghost.classList.add("cleared", "clear-exit");
        ghost.querySelector(".check-mark").textContent = "✓";
      }
      tile.append(ghost);
      layer.append(tile);
    }
    document.body.append(layer);
    exits = layer;
    const motion = layer.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: justCleared ? 250 : 175,
      // Keep the check visible briefly before letting the next row cover it.
      easing: justCleared ? "cubic-bezier(.55, 0, .8, .65)" : "ease-out",
    });
    motion.onfinish = () => {
      layer.remove();
      if (exits === layer) exits = undefined;
    };
  }
  return { capture, play };
}
