const SS_ID = '13sA5RMm-m4TtYBH8BmE1RxI4UNmcW2O9vbiQGOVP4A4';
const DEFAULT_MAX_ATTEMPTS = 2; // 受験可能回数のデフォルト（延長受講者は max_attempts 列で個別指定）

function getSheet(name) {
  return SpreadsheetApp.openById(SS_ID).getSheetByName(name);
}

// ===== GET: トークン検証 =====
function doGet(e) {
  const action = e.parameter.action;
  if (action === 'validate') {
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
  resultSheet.appendRow([
    body.timestamp || new Date().toISOString(),
    body.token || '',
    body.name || '',
    body.org || '',
    body.score,
    body.total,
    body.pct,
    body.passed ? '合格' : '不合格',
    formatElapsed(body.elapsed)
  ]);

  // トークン管理シートを更新（受験回数・最新点数・合否）
  if (body.token) {
    updateTokenStats(body.token, body.pct, body.passed);
  }

  return jsonResponse({ success: true });
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
  SpreadsheetApp.getUi()
    .createMenu('テスト管理')
    .addItem('トークンを発行する', 'generateTokens')
    .addItem('テストURLを生成する', 'generateUrls')
    .addItem('管理者プレビューURLを生成する', 'generateAdminUrls')
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
