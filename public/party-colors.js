export const palette = [
  ["라일락", "#b6a0ff"],
  ["민트", "#5cddb5"],
  ["앰버", "#f5be66"],
  ["스카이", "#75c4ff"],
  ["로즈", "#f08caa"],
  ["라임", "#bfdc72"],
  ["산호", "#ff9a78"],
  ["인디고", "#989eff"],
];

export function validPartyColor(color) {
  return typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color);
}

export function partyColor(squad) {
  if (validPartyColor(squad?.color)) return squad.color.toLowerCase();
  const key = squad?.id || squad?.name || "";
  let index = 0;
  for (const character of key) {
    index = (index * 31 + character.codePointAt(0)) % palette.length;
  }
  return palette[index][1];
}

export function nextPartyColor(squads) {
  const used = new Set(squads.map(partyColor));
  return (
    palette.find(([, color]) => !used.has(color))?.[1] ??
    palette[squads.length % palette.length][1]
  );
}

export function paintParty(node, squad) {
  node.classList.toggle("party-colored", Boolean(squad));
  if (squad) node.style.setProperty("--party", partyColor(squad));
  else node.style.removeProperty("--party");
}
