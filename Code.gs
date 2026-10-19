/**
 * POLIDOXUS · Ship's log
 * Paste this whole file into Extensions → Apps Script of the "Polidoxus Log" Google Sheet.
 * Deploy → New deployment → Web app · Execute as: Me · Who has access: Anyone.
 *
 * What it does
 * - Stores every tap from the Deck in the "ledger" tab, one row per entry.
 * - Stores ship settings (Firewall nodes, transmissions, Black Market) in the "config" tab.
 * - Applies patch files the Operator (Claude) drops into the same Drive folder:
 *   files named polidoxus-patch-*.json are applied in name order, then renamed applied-….
 */

const PATCH_PREFIX = 'polidoxus-patch-';
const LEDGER_HEADERS = ['id', 'kind', 'ref', 'day', 'amount', 'at', 'data'];
const CONFIG_HEADERS = ['key', 'value', 'updated'];

/* ---------- Web endpoints ---------- */

function doPost(e) {
  let req;
  try { req = JSON.parse(e.postData.contents); }
  catch (err) { return json_({ ok: false, error: 'bad_request' }); }

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (req.a === 'batch') {
      (req.ops || []).forEach(function (op) {
        if (op.op === 'put' && op.id) put_(String(op.id), op.data || {});
        else if (op.op === 'del' && op.id) del_(String(op.id));
        else if (op.op === 'cfg' && op.key) setCfg_(String(op.key), op.value);
      });
    }
    if (req.a === 'state' || req.a === 'batch') {
      applyPatches_();
      return json_({ ok: true, ledger: readLedger_(), config: readConfig_(), at: new Date().toISOString() });
    }
    return json_({ ok: false, error: 'unknown_action' });
  } catch (err) {
    return json_({ ok: false, error: 'server', detail: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/* Opening the web app link in a browser shows a status page with the link to paste into the Deck. */
function doGet() {
  const url = ScriptApp.getService().getUrl();
  const html =
    '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<style>body{margin:0;padding:32px 20px;background:#151514;color:#ede5d3;font:16px/1.5 -apple-system,Helvetica,Arial,sans-serif}' +
    'h1{font-size:28px;color:#c4d9c7;margin:0 0 8px}p{max-width:46ch}code{display:block;word-break:break-all;background:#262623;border:1.5px solid #ff6a3d;padding:14px;margin:14px 0;font:14px/1.4 Menlo,monospace;user-select:all;-webkit-user-select:all}</style></head><body>' +
    '<h1>Polidoxus ship’s log is online</h1>' +
    '<p>Copy this link and paste it into the Deck’s “Link the ship” screen. Press and hold to select it.</p>' +
    '<code>' + url + '</code>' +
    '<p>Ledger rows: ' + Math.max(0, ledger_().getLastRow() - 1) + '</p></body></html>';
  return HtmlService.createHtmlOutput(html).setTitle('Polidoxus log').addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/* Run once from the editor (select "setup" → Run) to create the tabs and grant permissions. */
function setup() {
  ledger_(); config_();
  applyPatches_();
  Logger.log('Polidoxus log ready. Ledger rows: ' + (ledger_().getLastRow() - 1));
}

/* ---------- Sheet helpers ---------- */

function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }

function sheet_(name, headers) {
  const s = ss_();
  let sh = s.getSheetByName(name);
  if (!sh) {
    sh = s.insertSheet(name);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}
function ledger_() { return sheet_('ledger', LEDGER_HEADERS); }
function config_() { return sheet_('config', CONFIG_HEADERS); }

function rowIndex_(sh, id) {
  const n = sh.getLastRow();
  if (n < 2) return -1;
  const ids = sh.getRange(2, 1, n - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === id) return i + 2;
  return -1;
}

function put_(id, data) {
  const sh = ledger_();
  const row = [id, data.kind || '', data.ref || '', data.day || '', Number(data.amount) || 0, data.at || '', JSON.stringify(data)];
  const i = rowIndex_(sh, id);
  if (i > 0) sh.getRange(i, 1, 1, row.length).setValues([row]);
  else sh.appendRow(row);
}

function del_(id) {
  const sh = ledger_();
  const i = rowIndex_(sh, id);
  if (i > 0) sh.deleteRow(i);
}

function setCfg_(key, value) {
  const sh = config_();
  const row = [key, JSON.stringify(value), new Date()];
  const i = rowIndex_(sh, key);
  if (i > 0) sh.getRange(i, 1, 1, row.length).setValues([row]);
  else sh.appendRow(row);
}

function readLedger_() {
  const sh = ledger_();
  const n = sh.getLastRow();
  const out = {};
  if (n < 2) return out;
  sh.getRange(2, 1, n - 1, LEDGER_HEADERS.length).getValues().forEach(function (r) {
    if (!r[0]) return;
    try { out[String(r[0])] = JSON.parse(r[6]); } catch (e) {}
  });
  return out;
}

function readConfig_() {
  const sh = config_();
  const n = sh.getLastRow();
  const out = {};
  if (n < 2) return out;
  sh.getRange(2, 1, n - 1, 2).getValues().forEach(function (r) {
    if (!r[0]) return;
    try { out[String(r[0])] = JSON.parse(r[1]); } catch (e) {}
  });
  return out;
}

/* ---------- Operator patches ----------
   A patch is a JSON file in the same Drive folder as this Sheet, named polidoxus-patch-<anything>.json:
   { "config": { "firewall": {...}, "comms": {...}, "market": {...}, "ship": {...} },
     "ledgerPut": { "<id>": {...} },
     "ledgerDelete": ["<id>", ...] }                                                      */
function applyPatches_() {
  const parents = DriveApp.getFileById(ss_().getId()).getParents();
  if (!parents.hasNext()) return;
  const folder = parents.next();
  const it = folder.getFiles();
  const list = [];
  while (it.hasNext()) {
    const f = it.next();
    if (f.getName().indexOf(PATCH_PREFIX) === 0) list.push(f);
  }
  list.sort(function (a, b) { return a.getName() < b.getName() ? -1 : 1; });
  list.forEach(function (f) {
    let p;
    try { p = JSON.parse(f.getBlob().getDataAsString()); }
    catch (e) { f.setName('error-' + f.getName()); return; }
    if (p.config) Object.keys(p.config).forEach(function (k) { setCfg_(k, p.config[k]); });
    if (p.ledgerPut) Object.keys(p.ledgerPut).forEach(function (id) { put_(id, p.ledgerPut[id]); });
    if (p.ledgerDelete) p.ledgerDelete.forEach(function (id) { del_(String(id)); });
    f.setName('applied-' + f.getName());
  });
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
