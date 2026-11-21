import { safeImage } from "./model.js";

const bossIconBase =
  "https://dae-y.github.io/maple_tools/assets/boss-income-calculator/boss-icons/";
const bossFiles = {
  lotus: "swoo.webp",
  damien: "damien.webp",
  slime: "guardianslime.png",
  lucid: "lucid.webp",
  will: "will.webp",
  dusk: "dusk.webp",
  darknell: "dunkel.png",
  hilla: "versushilla.webp",
  seren: "seren.png",
  kalos: "kalos.png",
  adversary: "firstadversary.webp",
  kaling: "kaling.webp",
  star: "radiantmaleficstar.png",
  bellona: "bellona.png",
  limbo: "limbo.png",
  baldrix: "baldrix.png",
  jupiter: "jupiter.png",
  blackmage: "blackmage.webp",
};

export function bossIcon(boss) {
  const image = document.createElement("img");
  image.alt = "";
  image.className = "emblem";
  image.decoding = "async";
  const fallback = "/badges/" + boss.id + ".png";
  if (bossFiles[boss.id]) {
    image.onerror = () => {
      image.onerror = null;
      image.src = fallback;
    };
  }
  image.src = bossFiles[boss.id] ? bossIconBase + bossFiles[boss.id] : fallback;
  return image;
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
