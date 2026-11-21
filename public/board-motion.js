const easing = "cubic-bezier(.22, .7, .3, 1)";
const origin = { x: 0, y: 0 };

function nearViewport({ top, bottom, left, right }) {
  return (
    bottom >= -16 &&
    top <= window.innerHeight + 16 &&
    right >= 0 &&
    left <= window.innerWidth
  );
}

function snapshot(board, morphControls = false) {
  const items = new Map();
  for (const element of board.querySelectorAll("[data-motion-key]")) {
    if (element.closest("[inert], [hidden]")) continue;
    const parent = element.parentElement.closest("[data-motion-key]");
    items.set(element.dataset.motionKey, {
      element,
      parent: parent?.dataset.motionKey,
      rect: element.getBoundingClientRect(),
    });
  }
  const fields = new Map();
  if (morphControls) {
    for (const element of board.querySelectorAll("[data-motion-field]")) {
      if (element.closest("[inert], [hidden]")) continue;
      const rect = element.getBoundingClientRect();
      if (!nearViewport(rect)) continue;
      const row = element.closest("[data-motion-key]");
      const css = getComputedStyle(element);
      fields.set(row.dataset.motionKey + "-" + element.dataset.motionField, {
        element,
        rect,
        text: element.selectedOptions?.[0]?.textContent ?? element.textContent,
        style: {
          color: css.color,
          fontFamily: css.fontFamily,
          fontSize: css.fontSize,
          fontWeight: css.fontWeight,
          lineHeight: css.lineHeight,
          paddingLeft: css.paddingLeft,
          backgroundColor: css.backgroundColor,
        },
      });
    }
  }
  return {
    items,
    fields,
    morphControls,
    height: board.getBoundingClientRect().height,
  };
}

function place(tile, rect) {
  tile.style.left = rect.left + "px";
  tile.style.top = rect.top + "px";
  tile.style.width = rect.width + "px";
  tile.style.height = rect.height + "px";
}

function exitGhost(element, justCleared) {
  const ghost = element.cloneNode(true);
  const identities = "[id], [data-focus], [data-motion-key], [data-raid]";
  for (const node of [ghost, ...ghost.querySelectorAll(identities)]) {
    node.removeAttribute("id");
    node.removeAttribute("data-focus");
    node.removeAttribute("data-motion-key");
    node.removeAttribute("data-raid");
  }
  if (justCleared) {
    const rows = ghost.matches(".check-row")
      ? [ghost]
      : ghost.querySelectorAll(".check-row");
    for (const row of rows) {
      row.classList.add("cleared", "clear-exit");
      row.querySelector(".check-mark").textContent = "✓";
    }
  }
  return ghost;
}

export function setupBoardMotion(board) {
  let overlay;
  let heightMotion;

  function capture(animate, morphControls) {
    const previous = animate ? snapshot(board, morphControls) : undefined;
    overlay?.remove();
    overlay = undefined;
    heightMotion?.cancel();
    return previous;
  }

  function play(previous, justCleared) {
    if (!previous) return;
    const next = snapshot(board, previous.morphControls);
    const duration = previous.morphControls ? 285 : 225;
    const timing = { duration, easing };
    const shifts = new Map();

    for (const [key, { element, parent, rect }] of next.items) {
      const past = previous.items.get(key)?.rect;
      const inherited = shifts.get(parent) ?? origin;
      shifts.set(key, inherited);
      if (!nearViewport(rect) && !(past && nearViewport(past))) continue;
      if (!past && parent && !previous.items.has(parent)) continue;

      // The parent is already moving, so animate only the child's relative offset.
      const x = past ? past.left - rect.left - inherited.x : 0;
      const y = past ? past.top - rect.top - inherited.y : -5;
      if (past && Math.abs(x) < 0.75 && Math.abs(y) < 0.75) continue;
      shifts.set(key, { x: inherited.x + x, y: inherited.y + y });
      const start = { transform: `translate(${x}px, ${y}px)` };
      if (!past) start.opacity = 0;
      element.animate([start, { transform: "none" }], timing);
    }

    if (Math.abs(next.height - previous.height) > 1) {
      heightMotion = board.animate(
        [{ height: previous.height + "px" }, { height: next.height + "px" }],
        timing,
      );
    }

    const layer = document.createElement("div");
    layer.className = "board-exits";
    layer.inert = true;
    layer.setAttribute("aria-hidden", "true");
    for (const [key, { element, parent, rect }] of previous.items) {
      if (next.items.has(key) || !nearViewport(rect)) continue;
      if (parent && !next.items.has(parent)) continue;
      const tile = document.createElement("div");
      tile.className = "board-exit";
      place(tile, rect);
      tile.append(exitGhost(element, justCleared));
      layer.append(tile);
      tile.animate(
        [
          { opacity: 1, transform: "none" },
          { opacity: 0, transform: "translateY(4px)" },
        ],
        {
          duration: justCleared ? 255 : 190,
          easing: justCleared ? "cubic-bezier(.55, 0, .8, .65)" : "ease-out",
          fill: "forwards",
        },
      );
    }
    for (const [key, current] of next.fields) {
      const past = previous.fields.get(key);
      if (!past) continue;
      const tile = document.createElement("span");
      tile.className = "board-field-flight";
      tile.textContent = past.text;
      Object.assign(tile.style, past.style);
      place(tile, past.rect);
      layer.append(tile);
      const x = current.rect.left - past.rect.left;
      const y = current.rect.top - past.rect.top;
      tile.animate(
        [
          { transform: "none", opacity: 1 },
          { opacity: 1, offset: 0.4 },
          {
            transform: `translate(${x}px, ${y}px)`,
            opacity: 0,
            width: current.rect.width + "px",
            height: current.rect.height + "px",
            paddingLeft: current.style.paddingLeft,
          },
        ],
        { ...timing, fill: "forwards" },
      );
      current.element.animate(
        [{ opacity: 0 }, { opacity: 0, offset: 0.42 }, { opacity: 1 }],
        timing,
      );
    }
    if (!layer.childElementCount) return;
    document.body.append(layer);
    overlay = layer;
    layer.animate([{ opacity: 1 }, { opacity: 1 }], {
      duration: Math.max(duration, justCleared ? 255 : 190),
    }).onfinish = () => {
      layer.remove();
      if (overlay === layer) overlay = undefined;
    };
  }
  return { capture, play };
}
