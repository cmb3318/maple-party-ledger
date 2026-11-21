import { safeImage } from "./model.js";

const bossIconBase =
  "https://raw.githubusercontent.com/MapleYoil/MapleDay/efe8ecfb6c8ec51d0187d29adeb2a14df4ed0836/src/MapleDay/Assets/Scheduler/Bosses/";
const schedulerIconIds = {
  lotus: 13,
  damien: 15,
  slime: 29,
  lucid: 19,
  will: 23,
  dusk: 26,
  darknell: 27,
  hilla: 24,
  seren: 28,
  kalos: 30,
  adversary: 35,
  kaling: 31,
  star: 37,
  bellona: 41,
  limbo: 33,
  baldrix: 34,
  jupiter: 38,
  blackmage: 25,
};

export function bossIcon(boss) {
  const frame = document.createElement("span");
  frame.className = "emblem";
  const image = document.createElement("img");
  image.alt = "";
  image.decoding = "async";
  const fallback = `/badges/${boss.id === "hilla" ? "hillahard" : boss.id}.png`;
  const iconId = schedulerIconIds[boss.id];
  if (iconId === undefined) {
    image.src = fallback;
  } else {
    image.onerror = () => {
      image.onerror = null;
      image.src = fallback;
    };
    image.src = `${bossIconBase}icon_${iconId}.png`;
  }
  frame.append(image);
  return frame;
}

export function standFrame(source) {
  const safe = safeImage(source);
  if (!safe) return "";
  const url = new URL(safe);
  if (
    url.hostname !== "open.api.nexon.com" ||
    !url.pathname.startsWith("/static/maplestory/character/look/")
  )
    return "";
  url.search = new URLSearchParams({
    action: "A00.0",
    emotion: "E00.0",
    wmotion: "W04",
  });
  url.hash = "";
  return url.href;
}

export function portrait(character) {
  const crop = document.createElement("span");
  crop.className = "portrait";
  const image = document.createElement("img");
  image.alt = "";
  image.decoding = "async";
  const original = safeImage(character.profile?.image);
  const stand = standFrame(original);
  function fallback() {
    crop.className = "portrait fallback";
    image.onerror = null;
    image.src = "/leaf.png";
  }
  crop.append(image);
  if (!original) {
    fallback();
    return crop;
  }
  if (stand) crop.classList.add("stand-portrait");
  image.onerror = () => {
    if (!stand || image.src === original) fallback();
    else image.src = original;
  };
  image.src = stand || original;
  return crop;
}
