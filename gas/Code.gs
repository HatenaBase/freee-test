/**
 * freee会計 修了認定テスト — GAS バックエンド
 *
 * スプレッドシートに2つのシートを用意:
 *   1. 「トークン管理」: token | name | org | status | created | used_at
 *   2. 「テスト結果」:   timestamp | token | name | org | score | total | pct | passed | elapsed
 *
 * Webアプリとしてデプロイし、URLをindex.htmlのGAS_URLに設定する。
 */

const SS_ID = '%%SPREADSHEET_ID%%'; // スプレッドシートIDを設定

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

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === token) {
      const status = data[i][3];
      if (status === 'used') {
        return jsonResponse({ valid: false, reason: 'already_used' });
      }
      return jsonResponse({
        valid: true,
        name: data[i][1],
        org: data[i][2]
      });
    }
  }

  return jsonResponse({ valid: false, reason: 'not_found' });
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
  // 結果をシートに記録
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

  // トークンを使用済みに更新
  if (body.token) {
    markTokenUsed(body.token);
  }

  return jsonResponse({ success: true });
}

function markTokenUsed(token) {
  const sheet = getSheet('トークン管理');
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === token) {
      sheet.getRange(i + 1, 4).setValue('used');      // status
      sheet.getRange(i + 1, 6).setValue(new Date());   // used_at
      break;
    }
  }
}

// ===== トークン発行ユーティリティ =====
/**
 * スプレッドシートのメニューから「トークン発行」を実行すると、
 * 「トークン管理」シートの名前・所属が入力済みの行にトークンを生成する。
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('テスト管理')
    .addItem('トークンを発行する', 'generateTokens')
    .addItem('テストURLを生成する', 'generateUrls')
    .addToUi();
}

function generateTokens() {
  const sheet = getSheet('トークン管理');
  const data = sheet.getDataRange().getValues();

  let count = 0;
  for (let i = 1; i < data.length; i++) {
    if (data[i][1] && !data[i][0]) {
      // 名前があるがトークンが未設定
      const token = generateToken();
      sheet.getRange(i + 1, 1).setValue(token);          // token
      sheet.getRange(i + 1, 4).setValue('active');        // status
      sheet.getRange(i + 1, 5).setValue(new Date());     // created
      count++;
    }
  }

  SpreadsheetApp.getUi().alert(`${count}件のトークンを発行しました。`);
}

function generateUrls() {
  const sheet = getSheet('トークン管理');
  const data = sheet.getDataRange().getValues();
  const baseUrl = '%%BASE_URL%%'; // GitHub PagesのURLを設定

  // URLカラムがなければ追加
  const headers = data[0];
  let urlCol = headers.indexOf('URL');
  if (urlCol === -1) {
    urlCol = headers.length;
    sheet.getRange(1, urlCol + 1).setValue('URL');
  }

  for (let i = 1; i < data.length; i++) {
    const token = data[i][0];
    if (token) {
      sheet.getRange(i + 1, urlCol + 1).setValue(`${baseUrl}?token=${token}`);
    }
  }

  SpreadsheetApp.getUi().alert('URLを生成しました。');
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
  return `${m}分${s}秒`;
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
