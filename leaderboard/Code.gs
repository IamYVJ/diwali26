/**
 * Diwali Night leaderboard: Google Apps Script web app.
 * Paste into Extensions > Apps Script of a Google Sheet, then
 * Deploy > New deployment > Web app (Execute as: Me, Access: Anyone).
 * Contains no secrets, so it is safe to keep in the repo.
 *
 * GET ?action=top                          -> top scores for every game
 * GET ?action=add&name=..&game=..&score=.. -> record best score, then return top scores
 *
 * @OnlyCurrentDoc  limits the permission to THIS spreadsheet only, not all your sheets.
 */

const SHEET_NAME = 'Scores';
const TOP_N = 10;
// better: 'low' = smaller is better (time), 'high' = bigger is better (count).
// min/max reject impossible scores (e.g. a 0.1s diya race).
const GAMES = {
  diya:    { better: 'low',  min: 1,  max: 3600,    decimals: 1 },
  cracker: { better: 'high', min: 1,  max: 1000000, decimals: 0 },
};

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(['Name', 'Game', 'Score', 'Updated']);
    sh.setFrozenRows(1);
  }
  return sh;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function cleanName_(s) {
  let n = String(s || '').replace(/[\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 30);
  if (/^[=+\-@]/.test(n)) n = "'" + n; // stop spreadsheet formula injection
  return n;
}

function add_(p) {
  // own-property check so values like "constructor" can't slip through
  const game = Object.prototype.hasOwnProperty.call(GAMES, p.game) ? GAMES[p.game] : null;
  const name = cleanName_(p.name);
  let score = Number(p.score);
  if (!game || !name || !isFinite(score)) return;
  const f = Math.pow(10, game.decimals);
  score = Math.round(score * f) / f;
  if (score < game.min || score > game.max) return;

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = sheet_();
    const rows = sh.getDataRange().getValues();
    const key = name.toLowerCase();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]).toLowerCase() === key && rows[i][1] === p.game) {
        const old = Number(rows[i][2]);
        const better = game.better === 'low' ? score < old : score > old;
        if (better) sh.getRange(i + 1, 3, 1, 2).setValues([[score, new Date()]]);
        return;
      }
    }
    sh.appendRow([name, p.game, score, new Date()]);
  } finally {
    lock.releaseLock();
  }
}

function top_() {
  const rows = sheet_().getDataRange().getValues().slice(1);
  const out = {};
  Object.keys(GAMES).forEach(function (g) {
    const asc = GAMES[g].better === 'low';
    out[g] = rows
      .filter(function (r) { return r[1] === g; })
      .map(function (r) { return { name: String(r[0]), score: Number(r[2]) }; })
      .sort(function (a, b) { return asc ? a.score - b.score : b.score - a.score; })
      .slice(0, TOP_N);
  });
  return out;
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  try {
    if (p.action === 'add') add_(p);
    return json_({ ok: true, top: top_() });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}
