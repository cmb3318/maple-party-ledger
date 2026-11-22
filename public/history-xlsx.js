import { historyStatus } from "./history-data.js";

const encoder = new TextEncoder();
const spreadsheet = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const documentRel = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const packageRel = "http://schemas.openxmlformats.org/package/2006/relationships";
const mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const xml = (body) => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' + body;
function escape(value) {
  return String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const crcTable = Uint32Array.from({length: 256}, (_, index) => {
  for (let bit = 0; bit < 8; bit += 1)
    index = (index >>> 1) ^ (index & 1 ? 0xedb88320 : 0);
  return index;
});
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255];
  return (crc ^ 0xffffffff) >>> 0;
}
function block(length, fields) {
  const buffer = new ArrayBuffer(length);
  const view = new DataView(buffer);
  for (const [offset, value, bits = 16] of fields) {
    if (bits === 32) view.setUint32(offset, value, true);
    else view.setUint16(offset, value, true);
  }
  return buffer;
}
function zip(files) {
  const data = [];
  const directory = [];
  let offset = 0;
  let directorySize = 0;
  for (const [path, text] of files) {
    const name = encoder.encode(path);
    const body = encoder.encode(text);
    const hash = crc32(body);
    const local = block(30, [
      [0, 0x04034b50, 32], [4, 20], [12, 33], [14, hash, 32],
      [18, body.length, 32], [22, body.length, 32], [26, name.length],
    ]);
    const central = block(46, [
      [0, 0x02014b50, 32], [4, 20], [6, 20], [14, 33], [16, hash, 32],
      [20, body.length, 32], [24, body.length, 32], [28, name.length], [42, offset, 32],
    ]);
    data.push(local, name, body);
    directory.push(central, name);
    offset += local.byteLength + name.length + body.length;
    directorySize += central.byteLength + name.length;
  }
  const end = block(22, [
    [0, 0x06054b50, 32], [8, files.length], [10, files.length],
    [12, directorySize, 32], [16, offset, 32],
  ]);
  return new Blob([...data, ...directory, end], {type: mime});
}

// These sheets use at most fifteen columns.
const letter = (index) => String.fromCharCode(65 + index);
function sheet(headers, body, widths, percentColumn) {
  const last = letter(headers.length - 1) + (body.length + 1);
  const rows = [headers, ...body].map((values, index) => {
    const row = index + 1;
    const cells = values.map((value, col) => {
      if (value == null) return "";
      const ref = letter(col) + row;
      if (typeof value === "number" && Number.isFinite(value)) {
        const style = percentColumn === col ? 3 : 2;
        return '<c r="' + ref + '" s="' + style + '"><v>' + value + "</v></c>";
      }
      return '<c r="' + ref + '" s="' + (row === 1 ? 1 : 0) +
        '" t="inlineStr"><is><t xml:space="preserve">' + escape(value) + "</t></is></c>";
    }).join("");
    return '<row r="' + row + '">' + cells + "</row>";
  }).join("");
  return xml('<worksheet xmlns="' + spreadsheet + '"><dimension ref="A1:' + last +
    '"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    '<sheetFormatPr defaultRowHeight="16"/><cols>' +
    widths.map((width, i) => '<col min="' + (i + 1) + '" max="' + (i + 1) +
      '" width="' + width + '" customWidth="1"/>').join("") +
    '</cols><sheetData>' + rows + '</sheetData><autoFilter ref="A1:' + last + '"/></worksheet>');
}

const styles = xml('<styleSheet xmlns="' + spreadsheet + '">' +
  '<fonts count="2"><font><sz val="11"/><name val="맑은 고딕"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="맑은 고딕"/></font></fonts>' +
  '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF342C49"/><bgColor indexed="64"/></patternFill></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
  '<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="10" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>');
const relation = (id, kind, target) => '<Relationship Id="rId' + id + '" Type="' +
  documentRel + '/' + kind + '" Target="' + target + '"/>';
const relationships = (content) => xml('<Relationships xmlns="' + packageRel + '">' + content + '</Relationships>');
const override = (path, type) => '<Override PartName="/' + path + '" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.' + type + '+xml"/>';

function workbook(sheets) {
  const parts = sheets.map(([name, content], index) => ({
    name, content, path: "worksheets/sheet" + (index + 1) + ".xml", id: index + 1,
  }));
  return zip([
    ["[Content_Types].xml", xml('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      override("xl/workbook.xml", "sheet.main") + override("xl/styles.xml", "styles") +
      parts.map(({path}) => override("xl/" + path, "worksheet")).join("") + "</Types>")],
    ["_rels/.rels", relationships(relation(1, "officeDocument", "xl/workbook.xml"))],
    ["xl/workbook.xml", xml('<workbook xmlns="' + spreadsheet + '" xmlns:r="' + documentRel + '"><sheets>' +
      parts.map(({name, id}) => '<sheet name="' + escape(name) + '" sheetId="' + id + '" r:id="rId' + id + '"/>').join("") +
      '</sheets></workbook>')],
    ["xl/_rels/workbook.xml.rels", relationships(parts.map(({id, path}) => relation(id, "worksheet", path)).join("") +
      relation(parts.length + 1, "styles", "styles.xml"))],
    ["xl/styles.xml", styles],
    ...parts.map(({path, content}) => ["xl/" + path, content]),
  ]);
}

const dateKST = (value) => new Date(value + 32400000).toISOString().slice(0, 10);
export function historyWorkbook(periods, { cycle, scope, missed }) {
  const cycleName = cycle === "weekly" ? "주간" : "월간";
  const summary = [];
  const details = [];
  const changes = [];
  for (const item of periods) {
    const { count, done, planned, earned } = item.totals;
    const observed = item.status === "current" || item.status === "saved";
    const known = item.status !== "missing";
    summary.push([
      cycleName, item.key, dateKST(item.end - 1), historyStatus[item.status], scope,
      observed ? count : null, known ? done : null, observed ? count - done : null,
      observed && count ? done / count : null, observed ? planned : null,
      observed ? earned : null, observed ? planned - earned : null, missed ? "미격파만" : "전체",
    ]);
    for (const row of item.displayed) {
      details.push([item.key, historyStatus[item.status], row.character, row.boss,
        row.level || null, row.party || null, row.size, row.done ? "격파" : "미격파",
        row.value, row.done ? row.value : 0]);
    }
    for (const { kind, from, to } of item.changes) {
      const row = to ?? from;
      changes.push([item.key, kind, row.character, row.boss, from?.level, to?.level,
        from?.party, to?.party, from?.size, to?.size, from?.value, to?.value]);
    }
  }
  return workbook([
    ["기간 요약", sheet(["주기", "시작일", "마지막 날짜", "기록 상태", "대상", "계획", "격파",
      "미격파", "진행률", "예상 메소", "격파분 메소", "미격파 메소", "상세 조건"],
    summary, [10, 14, 14, 20, 22, 10, 10, 10, 12, 18, 18, 18, 15], 8)],
    ["보스 상세", sheet(["시작일", "기록 상태", "캐릭터", "보스", "난이도", "파티", "인원", "격파 상태",
      "결정석 몫", "격파분 메소"], details, [14, 16, 16, 22, 14, 20, 10, 14, 18, 18])],
    ["보스 변동", sheet(["시작일", "변경 내용", "캐릭터", "보스", "이전 난이도", "이후 난이도",
      "이전 파티", "이후 파티", "이전 인원", "이후 인원", "이전 결정석", "이후 결정석"],
    changes, [14, 29, 16, 22, 15, 15, 20, 20, 12, 12, 18, 18])],
  ]);
}
