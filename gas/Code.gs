const SS_ID = '13sA5RMm-m4TtYBH8BmE1RxI4UNmcW2O9vbiQGOVP4A4';
const DEFAULT_MAX_ATTEMPTS = 2; // 受験可能回数のデフォルト（延長受講者は max_attempts 列で個別指定）

function getSheet(name) {
  return SpreadsheetApp.openById(SS_ID).getSheetByName(name);
}

// ===== GET: トークン検証 =====
function doGet(e) {
  const action = e.parameter.action;
  const testType = e.parameter.test_type || '';
  if (action === 'validate') {
    // test_type=skillcheck（簿記3級スキルチェック）のみ別シートへ振り分ける。
    // パラメータなし = 従来どおり修了認定テストの「トークン管理」シートを参照する
    if (testType === SKILL_CHECK_TYPE) {
      return validateSkillCheckToken(e.parameter.token);
    }
    return validateToken(e.parameter.token);
  }
  return jsonResponse({ error: 'Unknown action' });
}

function validateToken(token) {
  if (!token) return jsonResponse({ valid: false, reason: 'no_token' });
  const sheet = getSheet('トークン管理');
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const attemptsCol = headers.indexOf('attempts');
  const latestPctCol = headers.indexOf('latest_pct');
  const latestResultCol = headers.indexOf('latest_result');
  const maxAttemptsCol = headers.indexOf('max_attempts');

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === token) {
      const status = data[i][3];
      if (status === 'disabled') {
        return jsonResponse({ valid: false, reason: 'disabled' });
      }
      const attempts = attemptsCol >= 0 ? (data[i][attemptsCol] || 0) : 0;
      const latestPct = latestPctCol >= 0 ? (data[i][latestPctCol] || '') : '';
      const latestResult = latestResultCol >= 0 ? (data[i][latestResultCol] || '') : '';
      // max_attempts 列が無い / 空欄 / 非数値ならデフォルト（2回）
      const maxAttempts = resolveMaxAttempts(maxAttemptsCol >= 0 ? data[i][maxAttemptsCol] : '');
      return jsonResponse({
        valid: true,
        name: data[i][1],
        org: data[i][2],
        attempts: attempts,
        latestPct: latestPct,
        latestResult: latestResult,
        maxAttempts: maxAttempts
      });
    }
  }
  return jsonResponse({ valid: false, reason: 'not_found' });
}

function resolveMaxAttempts(raw) {
  if (raw === '' || raw === null || raw === undefined) return DEFAULT_MAX_ATTEMPTS;
  const n = Number(raw);
  if (!isFinite(n) || n <= 0) return DEFAULT_MAX_ATTEMPTS;
  return Math.floor(n);
}

// ===== POST: 結果記録 =====
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.action === 'result') {
      if ((body.test_type || '') === SKILL_CHECK_TYPE) {
        return recordSkillCheckResult(body);
      }
      return recordResult(body);
    }
    return jsonResponse({ error: 'Unknown action' });
  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

function recordResult(body) {
  // 結果をテスト結果シートに記録
  const resultSheet = getSheet('テスト結果');
  const timestamp = body.timestamp || new Date().toISOString();
  const token = body.token || '';

  // 再送による二重記録を防ぐ: 同一トークン・同一タイムスタンプの行が既にあれば何もしない
  if (token && isAlreadyRecorded(resultSheet, token, timestamp)) {
    return jsonResponse({ success: true, duplicate: true });
  }

  resultSheet.appendRow([
    timestamp,
    token,
    body.name || '',
    body.org || '',
    body.score,
    body.total,
    body.pct,
    body.passed ? '合格' : '不合格',
    formatElapsed(body.elapsed)
  ]);

  // トークン管理シートを更新（受験回数・最新点数・合否）
  if (token) {
    updateTokenStats(token, body.pct, body.passed);
  }

  return jsonResponse({ success: true });
}

// テスト結果シートのA列(timestamp)・B列(token)を突き合わせて既記録かを判定する
function isAlreadyRecorded(sheet, token, timestamp) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;
  const rows = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  const target = timestampKey(timestamp);
  const targetRaw = String(timestamp).trim();
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][1]).trim() !== String(token).trim()) continue;
    const cell = rows[i][0];
    if (timestampKey(cell) === target || String(cell).trim() === targetRaw) return true;
  }
  return false;
}

// シート側でISO文字列が日付値に変換されているケースにも当たるよう、エポックms文字列に正規化する
function timestampKey(value) {
  if (value instanceof Date) return String(value.getTime());
  const s = String(value).trim();
  if (!s) return '';
  const t = new Date(s).getTime();
  return isNaN(t) ? s : String(t);
}

function updateTokenStats(token, pct, passed) {
  const sheet = getSheet('トークン管理');
  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  // カラムがなければ追加
  let attemptsCol = headers.indexOf('attempts');
  let latestScoreCol = headers.indexOf('latest_score');
  let latestPctCol = headers.indexOf('latest_pct');
  let latestResultCol = headers.indexOf('latest_result');
  let lastTestedCol = headers.indexOf('last_tested');

  const nextCol = headers.length;
  if (attemptsCol === -1) { attemptsCol = nextCol; sheet.getRange(1, nextCol + 1).setValue('attempts'); }
  if (latestScoreCol === -1) { latestScoreCol = attemptsCol + 1; sheet.getRange(1, latestScoreCol + 1).setValue('latest_score'); }
  if (latestPctCol === -1) { latestPctCol = latestScoreCol + 1; sheet.getRange(1, latestPctCol + 1).setValue('latest_pct'); }
  if (latestResultCol === -1) { latestResultCol = latestPctCol + 1; sheet.getRange(1, latestResultCol + 1).setValue('latest_result'); }
  if (lastTestedCol === -1) { lastTestedCol = latestResultCol + 1; sheet.getRange(1, lastTestedCol + 1).setValue('last_tested'); }

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === token) {
      const row = i + 1;
      const currentAttempts = sheet.getRange(row, attemptsCol + 1).getValue() || 0;
      sheet.getRange(row, attemptsCol + 1).setValue(currentAttempts + 1);
      sheet.getRange(row, latestPctCol + 1).setValue(pct + '%');
      sheet.getRange(row, latestResultCol + 1).setValue(passed ? '合格' : '不合格');
      sheet.getRange(row, lastTestedCol + 1).setValue(new Date());
      // statusを更新（合格済み or 受験済み）
      sheet.getRange(row, 4).setValue(passed ? '合格済' : '受験済');
      break;
    }
  }
}

// ===== メニュー =====
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('テスト管理')
    .addItem('トークンを発行する', 'generateTokens')
    .addItem('テストURLを生成する', 'generateUrls')
    .addItem('管理者プレビューURLを生成する', 'generateAdminUrls')
    .addToUi();
  ui.createMenu('スキルチェック管理')
    .addItem('トークンを発行する', 'generateSkillCheckTokens')
    .addItem('スキルチェックURLを生成する', 'generateSkillCheckUrls')
    .addItem('管理者プレビューURLを生成する', 'generateSkillCheckAdminUrls')
    .addItem('結果シートの見出しを作成する', 'setupSkillCheckResultSheet')
    .addToUi();
}

function generateTokens() {
  const sheet = getSheet('トークン管理');
  const data = sheet.getDataRange().getValues();
  let count = 0;
  for (let i = 1; i < data.length; i++) {
    if (data[i][1] && !data[i][0]) {
      const token = generateToken();
      sheet.getRange(i + 1, 1).setValue(token);
      sheet.getRange(i + 1, 4).setValue('active');
      sheet.getRange(i + 1, 5).setValue(new Date());
      count++;
    }
  }
  SpreadsheetApp.getUi().alert(count + '件のトークンを発行しました。');
}

function generateUrls() {
  const sheet = getSheet('トークン管理');
  const data = sheet.getDataRange().getValues();
  const baseUrl = 'https://hatenabase.github.io/freee-test/';
  const headers = data[0];
  let urlCol = headers.indexOf('URL');
  if (urlCol === -1) {
    urlCol = headers.length;
    sheet.getRange(1, urlCol + 1).setValue('URL');
  }
  for (let i = 1; i < data.length; i++) {
    const token = data[i][0];
    if (token) {
      sheet.getRange(i + 1, urlCol + 1).setValue(baseUrl + '?token=' + token);
    }
  }
  SpreadsheetApp.getUi().alert('URLを生成しました。');
}

function generateAdminUrls() {
  const sheet = getSheet('トークン管理');
  const data = sheet.getDataRange().getValues();
  const baseUrl = 'https://hatenabase.github.io/freee-test/';
  const headers = data[0];
  let adminUrlCol = headers.indexOf('admin_URL');
  if (adminUrlCol === -1) {
    adminUrlCol = headers.length;
    sheet.getRange(1, adminUrlCol + 1).setValue('admin_URL');
  }
  for (let i = 1; i < data.length; i++) {
    const token = data[i][0];
    if (token) {
      sheet.getRange(i + 1, adminUrlCol + 1).setValue(baseUrl + '?token=' + token + '&admin=1');
    }
  }
  SpreadsheetApp.getUi().alert('管理者プレビューURLを生成しました。');
}

function generateToken() {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
  let token = '';
  for (let i = 0; i < 12; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

function formatElapsed(seconds) {
  if (!seconds) return '';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m + '分' + s + '秒';
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// =====================================================================
// 簿記3級スキルチェック（boki/）
// 修了認定テストとはシート・トークンを完全に分離する。
// 既存関数は変更せず、doGet / doPost が test_type=skillcheck のときだけ
// 以下の関数へ振り分ける。合否判定はなく、受験回数の制限もしない（記録のみ）。
// =====================================================================
const SKILL_CHECK_TYPE = 'skillcheck';
const SKILL_CHECK_TOKEN_SHEET = 'スキルチェック_トークン管理';
const SKILL_CHECK_RESULT_SHEET = 'スキルチェック_結果';
const SKILL_CHECK_BASE_URL = 'https://hatenabase.github.io/freee-test/boki/';
// boki/index.html の CATEGORY_QUOTAS と同じ順序・同じ表記にすること（結果シートの列順になる）
const SKILL_CHECK_CATEGORIES = [
  '商品売買・仕訳の基礎',
  '現金・預金',
  '債権債務・手形・電子記録債権',
  '固定資産',
  '給与・税金・純資産',
  '決算整理',
  '帳簿・証ひょう・試算表'
];

// ===== GET: トークン検証（スキルチェック） =====
function validateSkillCheckToken(token) {
  if (!token) return jsonResponse({ valid: false, reason: 'no_token' });
  const sheet = getSheet(SKILL_CHECK_TOKEN_SHEET);
  if (!sheet) return jsonResponse({ valid: false, reason: 'no_sheet' });
  const range = sheet.getDataRange();
  const data = range.getValues();
  // latest_pct は「75%」のような表示値で返す（setValueした'75%'はシート内部では0.75になるため、生値だと0.75%と誤表示される）
  const display = range.getDisplayValues();
  const headers = data[0];
  const attemptsCol = headers.indexOf('attempts');
  const latestPctCol = headers.indexOf('latest_pct');
  const latestLevelCol = headers.indexOf('latest_level');

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === token) {
      const status = data[i][3];
      if (status === 'disabled') {
        return jsonResponse({ valid: false, reason: 'disabled' });
      }
      return jsonResponse({
        valid: true,
        name: data[i][1],
        org: data[i][2],
        // 受験回数は記録・表示のみに使う。上限判定はしない
        attempts: attemptsCol >= 0 ? (data[i][attemptsCol] || 0) : 0,
        latestPct: latestPctCol >= 0 ? (display[i][latestPctCol] || '') : '',
        latestLevel: latestLevelCol >= 0 ? (data[i][latestLevelCol] || '') : ''
      });
    }
  }
  return jsonResponse({ valid: false, reason: 'not_found' });
}

// ===== POST: 結果記録（スキルチェック） =====
function recordSkillCheckResult(body) {
  const resultSheet = getSheet(SKILL_CHECK_RESULT_SHEET);
  if (!resultSheet) return jsonResponse({ error: 'sheet_not_found: ' + SKILL_CHECK_RESULT_SHEET });
  ensureSkillCheckResultHeaders(resultSheet);

  const timestamp = body.timestamp || new Date().toISOString();
  const token = body.token || '';

  // 再送による二重記録を防ぐ（修了テストと同じ判定ロジックを共用）
  if (token && isAlreadyRecorded(resultSheet, token, timestamp)) {
    return jsonResponse({ success: true, duplicate: true });
  }

  resultSheet.appendRow(
    [
      timestamp,
      token,
      body.name || '',
      body.org || '',
      body.score,
      body.total,
      body.pct,
      body.level || '',
      body.levelLabel || '',
      formatElapsed(body.elapsed)
    ].concat(skillCheckCategoryValues(body.categories))
  );

  if (token) {
    updateSkillCheckTokenStats(token, body.pct, body.levelLabel || body.level || '');
  }

  return jsonResponse({ success: true });
}

// 単元別の集計を「正答数・出題数」の並びに展開する（出題されなかった単元は空欄）
function skillCheckCategoryValues(categories) {
  const map = {};
  (categories || []).forEach(function (c) {
    if (c && c.name) map[c.name] = c;
  });
  const values = [];
  SKILL_CHECK_CATEGORIES.forEach(function (name) {
    const c = map[name];
    values.push(c ? c.correct : '');
    values.push(c ? c.total : '');
  });
  return values;
}

function skillCheckResultHeaders() {
  const headers = ['timestamp', 'token', 'name', 'org', 'score', 'total', 'pct', 'level', 'level_label', 'elapsed'];
  SKILL_CHECK_CATEGORIES.forEach(function (name) {
    headers.push(name + '_正答');
    headers.push(name + '_出題');
  });
  return headers;
}

// 空のシートにだけ見出しを書き込む。既存の行があるシートには触れない
function ensureSkillCheckResultHeaders(sheet) {
  if (sheet.getLastRow() > 0) return;
  const headers = skillCheckResultHeaders();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
}

function setupSkillCheckResultSheet() {
  const sheet = getSheet(SKILL_CHECK_RESULT_SHEET);
  if (!sheet) {
    SpreadsheetApp.getUi().alert('シート「' + SKILL_CHECK_RESULT_SHEET + '」がありません。先に作成してください。');
    return;
  }
  if (sheet.getLastRow() > 0) {
    SpreadsheetApp.getUi().alert('シート「' + SKILL_CHECK_RESULT_SHEET + '」には既にデータがあります。見出しは変更していません。');
    return;
  }
  ensureSkillCheckResultHeaders(sheet);
  SpreadsheetApp.getUi().alert('シート「' + SKILL_CHECK_RESULT_SHEET + '」に見出しを作成しました。');
}

function updateSkillCheckTokenStats(token, pct, levelLabel) {
  const sheet = getSheet(SKILL_CHECK_TOKEN_SHEET);
  if (!sheet) return;
  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  // カラムがなければ末尾に追加
  let attemptsCol = headers.indexOf('attempts');
  let latestPctCol = headers.indexOf('latest_pct');
  let latestLevelCol = headers.indexOf('latest_level');
  let lastTestedCol = headers.indexOf('last_tested');

  const nextCol = headers.length;
  if (attemptsCol === -1) { attemptsCol = nextCol; sheet.getRange(1, attemptsCol + 1).setValue('attempts'); }
  if (latestPctCol === -1) { latestPctCol = attemptsCol + 1; sheet.getRange(1, latestPctCol + 1).setValue('latest_pct'); }
  if (latestLevelCol === -1) { latestLevelCol = latestPctCol + 1; sheet.getRange(1, latestLevelCol + 1).setValue('latest_level'); }
  if (lastTestedCol === -1) { lastTestedCol = latestLevelCol + 1; sheet.getRange(1, lastTestedCol + 1).setValue('last_tested'); }

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === token) {
      const row = i + 1;
      const currentAttempts = sheet.getRange(row, attemptsCol + 1).getValue() || 0;
      sheet.getRange(row, attemptsCol + 1).setValue(currentAttempts + 1);
      sheet.getRange(row, latestPctCol + 1).setValue(pct + '%');
      sheet.getRange(row, latestLevelCol + 1).setValue(levelLabel);
      sheet.getRange(row, lastTestedCol + 1).setValue(new Date());
      // 合否がないため status は「受験済」のみ（disabled は手動運用）
      sheet.getRange(row, 4).setValue('受験済');
      break;
    }
  }
}

// ===== メニュー（スキルチェック） =====
function generateSkillCheckTokens() {
  const sheet = getSheet(SKILL_CHECK_TOKEN_SHEET);
  if (!sheet) {
    SpreadsheetApp.getUi().alert('シート「' + SKILL_CHECK_TOKEN_SHEET + '」がありません。先に作成してください。');
    return;
  }
  const data = sheet.getDataRange().getValues();
  let count = 0;
  for (let i = 1; i < data.length; i++) {
    if (data[i][1] && !data[i][0]) {
      sheet.getRange(i + 1, 1).setValue(generateToken());
      sheet.getRange(i + 1, 4).setValue('active');
      sheet.getRange(i + 1, 5).setValue(new Date());
      count++;
    }
  }
  SpreadsheetApp.getUi().alert(count + '件のトークンを発行しました。');
}

function generateSkillCheckUrls() {
  writeSkillCheckUrls('URL', false);
}

function generateSkillCheckAdminUrls() {
  writeSkillCheckUrls('admin_URL', true);
}

function writeSkillCheckUrls(headerName, admin) {
  const sheet = getSheet(SKILL_CHECK_TOKEN_SHEET);
  if (!sheet) {
    SpreadsheetApp.getUi().alert('シート「' + SKILL_CHECK_TOKEN_SHEET + '」がありません。先に作成してください。');
    return;
  }
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  let col = headers.indexOf(headerName);
  if (col === -1) {
    col = headers.length;
    sheet.getRange(1, col + 1).setValue(headerName);
  }
  for (let i = 1; i < data.length; i++) {
    const token = data[i][0];
    if (token) {
      sheet.getRange(i + 1, col + 1)
        .setValue(SKILL_CHECK_BASE_URL + '?token=' + token + (admin ? '&admin=1' : ''));
    }
  }
  SpreadsheetApp.getUi().alert(headerName + ' を生成しました。');
}
