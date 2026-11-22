import { downloadFile } from "./download.js";
import { exportSettings, mergeSettings, parseSettings, settingsSummary } from "./settings-transfer.js";

export function setupSettingsTransfer({ getState, update, canSave }) {
  const $ = (id) => document.getElementById(id);
  const dialog = $("settingsTransferDialog");
  const fileInput = $("settingsFile");
  const preview = $("settingsPreview");
  const apply = $("applySettings");
  const output = $("exportSettings");
  const keep = $("keepSettingsTargets");
  let validated;
  let read = 0;
  let applying = false;

  function status(message = "", error = false) {
    const note = $("settingsStatus");
    note.textContent = message;
    note.hidden = !message;
    note.dataset.error = error;
  }
  function ready() {
    const { parties, squads } = getState();
    output.disabled = !parties.length && !squads.length;
  }
  function resetFile() {
    read += 1;
    validated = undefined;
    fileInput.value = "";
    preview.hidden = true;
  }
  $("openSiteInfo").onclick = () => $("siteInfoDialog").showModal();
  $("openSettingsTransfer").onclick = () => {
    resetFile();
    keep.checked = true;
    status();
    ready();
    dialog.showModal();
  };
  dialog.addEventListener("close", resetFile);
  output.onclick = () => {
    const data = JSON.stringify(exportSettings(getState()), null, 2);
    const day = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
    downloadFile(new Blob([data], { type: "application/json" }), "메이플가계부-설정-" + day + ".json");
    status("설정 파일 다운로드를 시작했어요.");
  };
  fileInput.onchange = async () => {
    const file = fileInput.files[0];
    const ticket = ++read;
    validated = undefined;
    preview.hidden = true;
    status();
    if (!file) return;
    try {
      const data = parseSettings(await file.text());
      if (ticket !== read) return;
      validated = data;
      const { matchedCharacters, matchedSquads, targets } = settingsSummary(getState(), data);
      $("settingsSummary").textContent = [
        "캐릭터 " + data.characters.length + "명 (갱신 " + matchedCharacters + ")",
        "파티 " + data.squads.length + "개 (갱신 " + matchedSquads + ")",
        "보스 배정 " + targets + "개",
      ].join(" · ");
      preview.hidden = false;
    } catch (error) {
      if (ticket === read) status(error.message || "설정 파일을 읽을 수 없어요.", true);
    }
  };
  apply.onclick = async () => {
    if (!validated || applying) return;
    const file = validated;
    const keepTargets = keep.checked;
    applying = true;
    apply.disabled = fileInput.disabled = keep.disabled = true;
    try {
      await update((state) => mergeSettings(state, file, keepTargets));
      resetFile();
      ready();
      status(canSave()
        ? "설정을 반영했어요. 캐릭터 " + file.characters.length + "명 · 파티 " + file.squads.length + "개"
        : "이번 창에 반영했어요. 브라우저에 저장하지 못했으니 닫기 전에 내보내기해 주세요.");
      output.focus();
    } catch {
      status("설정을 반영할 수 없어요. 파일을 다시 확인해 주세요.", true);
    } finally {
      applying = false;
      apply.disabled = fileInput.disabled = keep.disabled = false;
    }
  };
}
