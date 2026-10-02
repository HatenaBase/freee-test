// =====================================================================
// MAIA 共有用「福山市PJ_受講進捗共有」スプレッドシートへの同期
//
// 試験システムのスプレッドシート（SS_ID）から福山市コホートの行だけを抜き出し、
// MAIA 共有スプレッドシートの各タブへ全件置換で書き込む。
// - 元スプレッドシートは読み取りのみ（書き込みは一切しない）
// - token / email / URL / admin_URL 列は書き出さない（列はホワイトリストで指定）
// - Owlcast進捗タブは手入力用。同期処理では触らない
//
// 初回: initMaiaSync() を GAS エディタから1回実行（書式設定＋1時間トリガー設置＋初回同期）
// 定期: syncFukuyamaToMaiaSheet() が1時間ごとに時間主導トリガーで動く
// =====================================================================

const MAIA_SOURCE_SS_ID = '13sA5RMm-m4TtYBH8BmE1RxI4UNmcW2O9vbiQGOVP4A4'; // 試験システム（読み取りのみ）
const MAIA_TARGET_SS_ID = '18hoLkHsEF0OldRHw_am9-RbwlcGjcSHIX7j_7ZTugaQ'; // 福山市PJ_受講進捗共有

// 福山市コホートの判定: org（所属）にこの文字列を含む行を対象にする。
// トークン発行時に運営が org を手入力する運用（README「トークン発行」手順）で、
// 値の表記（福山市／福山市役所／福山市○○課 など）が決まっていないため部分一致にしている。
const MAIA_ORG_KEYWORD = '福山';

const MAIA_SRC_SKILL_RESULT = 'スキルチェック_結果';
const MAIA_SRC_TEST_RESULT = 'テスト結果';
const MAIA_SRC_TEST_TOKEN = 'トークン管理';
const MAIA_SRC_SKILL_TOKEN = 'スキルチェック_トークン管理';

const MAIA_TAB_README = 'README';
const MAIA_TAB_ROSTER = '受講生一覧';
const MAIA_TAB_SKILL = 'スキルチェック';
const MAIA_TAB_TEST = '認定試験';
const MAIA_TAB_OWLCAST = 'Owlcast進捗';

const MAIA_LAST_SYNC_CELL = 'B9';   // README の最終同期日時
const MAIA_SYNC_RESULT_CELL = 'B10'; // README の同期件数
const MAIA_SYNC_HANDLER = 'syncFukuyamaToMaiaSheet';

// 書式（spreadsheet-format スキル準拠）
const MAIA_HEADER_BG = '#1a3a5c';
const MAIA_ZEBRA_BG = '#f2f6fa';
const MAIA_SUBTOTAL_BG = '#e8eef4';
const MAIA_BORDER = '#c0c0c0';

// スキルチェック単元（Code.gs の SKILL_CHECK_CATEGORIES と同じ）
const MAIA_SKILL_CATEGORIES = [
  '商品売買・仕訳の基礎',
  '現金・預金',
  '債権債務・手形・電子記録債権',
  '固定資産',
  '給与・税金・純資産',
  '決算整理',
  '帳簿・証ひょう・試算表'
];

// [元シートの列名, 表示名, 種別(date/num/text)]
function maiaSkillColumns_() {
  const cols = [
    ['timestamp', '受験日時', 'date'],
    ['name', '氏名', 'text'],
    ['org', '所属', 'text'],
    ['score', '正答数', 'num'],
    ['total', '出題数', 'num'],
    ['pct', '正答率(%)', 'num'],
    ['level', 'レベル', 'center'],
    ['level_label', '理解度', 'text'],
    ['elapsed', '所要時間', 'right']
  ];
  MAIA_SKILL_CATEGORIES.forEach(function (c) {
    cols.push([c + '_正答', c + ' 正答', 'num']);
    cols.push([c + '_出題', c + ' 出題', 'num']);
  });
  return cols;
}

function maiaTestColumns_() {
  return [
    ['timestamp', '受験日時', 'date'],
    ['name', '氏名', 'text'],
    ['org', '所属', 'text'],
    ['score', '正答数', 'num'],
    ['total', '出題数', 'num'],
    ['pct', '正答率(%)', 'num'],
    ['passed', '合否', 'center'],
    ['elapsed', '所要時間', 'right']
  ];
}

const MAIA_ROSTER_HEADERS = ['No', '氏名', '所属', 'スキルチェック 最新レベル', '認定試験 受験回数', '認定試験 最新結果', '認定試験 最終受験日', 'Owlcast 状況'];

const MAIA_OWLCAST_HEADERS = ['No', '氏名', '所属', '状況', '完了章数', '1章 概要', '2章 経理体制', '3章 セットアップ', '4章 機能', '5章 人事労務・経費精算', '6章 応用機能', '受講時間合計(分)', '受講開始日', '完了日', '最終受講日', '備考', '取得日'];
const MAIA_OWLCAST_ROWS = 200; // 手入力枠の行数

// ===== 初回セットアップ（GASエディタから1回実行） =====
function initMaiaSync() {
  setupMaiaSheet();
  installMaiaSyncTrigger();
  syncFukuyamaToMaiaSheet();
}

// 1時間ごとの時間主導トリガーを設置（重複は作らない）
function installMaiaSyncTrigger() {
  const exists = ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === MAIA_SYNC_HANDLER;
  });
  if (exists) {
    Logger.log('トリガーは設置済み: ' + MAIA_SYNC_HANDLER);
    return;
  }
  ScriptApp.newTrigger(MAIA_SYNC_HANDLER).timeBased().everyHours(1).create();
  Logger.log('トリガーを設置しました: ' + MAIA_SYNC_HANDLER + '（1時間ごと）');
}

// README・Owlcast進捗タブの見出しと書式（同期では触らないタブ）
function setupMaiaSheet() {
  const ss = SpreadsheetApp.openById(MAIA_TARGET_SS_ID);
  ss.getSheets().forEach(function (s) {
    s.getDataRange().setFontFamily('Arial').setFontSize(10);
  });
  setupMaiaReadme_(ss);
  setupMaiaOwlcast_(ss);
  // 同期対象タブは空の状態で見出しを作っておく（同期のたびに作り直す）
  writeMaiaTable_(ss.getSheetByName(MAIA_TAB_SKILL), maiaTitle_('スキルチェック（簿記3級）受験結果'), maiaSkillColumns_(), [], null);
  writeMaiaTable_(ss.getSheetByName(MAIA_TAB_TEST), maiaTitle_('freee会計 修了認定テスト 受験結果'), maiaTestColumns_(), [], null);
  writeMaiaRoster_(ss, []);
}

function setupMaiaReadme_(ss) {
  const sh = ss.getSheetByName(MAIA_TAB_README);
  sh.clear();
  sh.getBandings().forEach(function (b) { b.remove(); });
  const created = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd');
  sh.getRange('A1').setValue('福山市 freee会計コース 受講進捗共有  作成日: ' + created + '  データソース: はてなベース試験システム（受験時に自動記録）／Owlcast管理画面（手入力）')
    .setFontFamily('Arial').setFontSize(12).setFontWeight('bold');
  const rows = [
    ['タブ', '内容', '更新方法', '更新頻度'],
    [MAIA_TAB_ROSTER, '受講者ごとの集約ビュー。スキルチェック・認定試験・Owlcast進捗の各タブから数式で参照', '自動（同期時に再作成）', '1時間ごと'],
    [MAIA_TAB_SKILL, '簿記3級スキルチェックの受験結果（受験ごとに1行、単元別の正答数つき）', '自動（試験システムから同期）', '1時間ごと'],
    [MAIA_TAB_TEST, 'freee会計 修了認定テストの受験結果（受験ごとに1行、合格ライン75%）', '自動（試験システムから同期）', '1時間ごと'],
    [MAIA_TAB_OWLCAST, 'Owlcast（LMS）の章別の学習進捗。取得日の列に管理画面から転記した日付を入れる', '手動入力', '週次']
  ];
  sh.getRange(2, 1, rows.length, 4).setValues(rows);
  formatMaiaTable_(sh, 2, 4, rows.length - 1);
  sh.getRange(3, 1, rows.length - 1, 4).setVerticalAlignment('middle').setWrap(true);

  const info = [
    ['最終同期日時', '（未同期）'],
    ['同期結果', ''],
    ['対象の判定', '所属（org）に「' + MAIA_ORG_KEYWORD + '」を含む受講者'],
    ['注意', 'スキルチェック・認定試験・受講生一覧の3タブは同期のたびに全件置き換えます。手で書き込んだ内容は消えるため、メモは Owlcast進捗 の備考列に書いてください']
  ];
  const r = sh.getRange(9, 1, info.length, 2);
  r.setValues(info).setFontFamily('Arial').setFontSize(10).setWrap(true).setVerticalAlignment('middle')
    .setBorder(true, true, true, true, true, true, MAIA_BORDER, SpreadsheetApp.BorderStyle.SOLID);
  sh.getRange(9, 1, info.length, 1).setFontWeight('bold').setBackground(MAIA_SUBTOTAL_BG);
  sh.getRange(MAIA_LAST_SYNC_CELL).setHorizontalAlignment('left');
  sh.setColumnWidth(1, 130);
  sh.setColumnWidth(2, 520);
  sh.setColumnWidth(3, 190);
  sh.setColumnWidth(4, 100);
  sh.setFrozenRows(2);
}

function setupMaiaOwlcast_(ss) {
  const sh = ss.getSheetByName(MAIA_TAB_OWLCAST);
  const n = MAIA_OWLCAST_HEADERS.length;
  sh.getRange('A1').setValue('Owlcast 学習進捗（章別）  データソース: Owlcast管理画面 受講履歴（週次で手入力。取得日列に転記日を記入）')
    .setFontFamily('Arial').setFontSize(12).setFontWeight('bold');
  sh.getRange(2, 1, 1, n).setValues([MAIA_OWLCAST_HEADERS]);
  sh.getBandings().forEach(function (b) { b.remove(); });
  formatMaiaTable_(sh, 2, n, MAIA_OWLCAST_ROWS);
  const body = sh.getRange(3, 1, MAIA_OWLCAST_ROWS, n);
  body.setVerticalAlignment('middle');
  // 列ごとの揃え・書式
  sh.getRange(3, 1, MAIA_OWLCAST_ROWS, 1).setHorizontalAlignment('right');            // No
  sh.getRange(3, 4, MAIA_OWLCAST_ROWS, 8).setHorizontalAlignment('center');           // 状況〜6章
  sh.getRange(3, 5, MAIA_OWLCAST_ROWS, 1).setNumberFormat('0').setHorizontalAlignment('right');
  sh.getRange(3, 12, MAIA_OWLCAST_ROWS, 1).setNumberFormat('#,##0').setHorizontalAlignment('right');
  sh.getRange(3, 13, MAIA_OWLCAST_ROWS, 3).setNumberFormat('yyyy/mm/dd').setHorizontalAlignment('right');
  sh.getRange(3, 17, MAIA_OWLCAST_ROWS, 1).setNumberFormat('yyyy/mm/dd').setHorizontalAlignment('right');
  // 入力規則（安曇野市シートの表記に合わせる）
  const statusRule = SpreadsheetApp.newDataValidation().requireValueInList(['受講済', '受講中', '未着手'], true).setAllowInvalid(false).build();
  const chapterRule = SpreadsheetApp.newDataValidation().requireValueInList(['済', '中', '－'], true).setAllowInvalid(false).build();
  sh.getRange(3, 4, MAIA_OWLCAST_ROWS, 1).setDataValidation(statusRule);
  sh.getRange(3, 6, MAIA_OWLCAST_ROWS, 6).setDataValidation(chapterRule);
  const widths = [50, 120, 140, 80, 80, 80, 100, 120, 80, 170, 100, 130, 110, 110, 110, 260, 110];
  widths.forEach(function (w, i) { sh.setColumnWidth(i + 1, Math.max(w, maiaTextWidth_(MAIA_OWLCAST_HEADERS[i]))); });
  sh.setFrozenRows(2);
  sh.setFrozenColumns(2);
}

// ===== 同期本体（1時間ごと） =====
function syncFukuyamaToMaiaSheet() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    Logger.log('別の同期が実行中のためスキップ');
    return;
  }
  try {
    const src = SpreadsheetApp.openById(MAIA_SOURCE_SS_ID); // 読み取りのみ
    const ss = SpreadsheetApp.openById(MAIA_TARGET_SS_ID);
    if (ss.getSpreadsheetTimeZone() !== 'Asia/Tokyo') ss.setSpreadsheetTimeZone('Asia/Tokyo'); // 日時表示を日本時間に揃える

    const skillCols = maiaSkillColumns_();
    const testCols = maiaTestColumns_();
    const skillRows = readMaiaFukuyamaRows_(src.getSheetByName(MAIA_SRC_SKILL_RESULT), skillCols);
    const testRows = readMaiaFukuyamaRows_(src.getSheetByName(MAIA_SRC_TEST_RESULT), testCols);

    // 受講生一覧の名簿: 両トークン管理シート → 結果シートの順で 氏名|所属 を重複なく集める
    const roster = [];
    const seen = {};
    function addPerson(name, org) {
      const key = name + '|' + org;
      if (!name || seen[key]) return;
      seen[key] = true;
      roster.push([name, org]);
    }
    const nameOrgCols = [['name', '氏名', 'text'], ['org', '所属', 'text']];
    [MAIA_SRC_TEST_TOKEN, MAIA_SRC_SKILL_TOKEN].forEach(function (sheetName) {
      readMaiaFukuyamaRows_(src.getSheetByName(sheetName), nameOrgCols).forEach(function (r) { addPerson(r[0], r[1]); });
    });
    skillRows.concat(testRows).forEach(function (r) { addPerson(r[1], r[2]); });

    writeMaiaTable_(ss.getSheetByName(MAIA_TAB_SKILL), maiaTitle_('スキルチェック（簿記3級）受験結果'), skillCols, skillRows, null);
    writeMaiaTable_(ss.getSheetByName(MAIA_TAB_TEST), maiaTitle_('freee会計 修了認定テスト 受験結果'), testCols, testRows, null);
    writeMaiaRoster_(ss, roster);

    const now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm');
    const summary = '受講生 ' + roster.length + '名／スキルチェック ' + skillRows.length + '件／認定試験 ' + testRows.length + '件';
    const readme = ss.getSheetByName(MAIA_TAB_README);
    readme.getRange(MAIA_LAST_SYNC_CELL).setValue(new Date()).setNumberFormat('yyyy/mm/dd hh:mm');
    readme.getRange(MAIA_SYNC_RESULT_CELL).setValue(summary);
    Logger.log('同期完了 ' + now + ' ' + summary + '（判定: org に「' + MAIA_ORG_KEYWORD + '」を含む）');
  } finally {
    lock.releaseLock();
  }
}

// 元シートを見出し名で読み、org が福山市コホートの行だけを cols の順で返す（受験日時の昇順）
function readMaiaFukuyamaRows_(sheet, cols) {
  if (!sheet) return [];
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const header = values[0].map(function (h) { return String(h).trim(); });
  const orgIdx = header.indexOf('org');
  if (orgIdx < 0) throw new Error('シート「' + sheet.getName() + '」に org 列がありません');
  const idx = cols.map(function (c) { return header.indexOf(c[0]); });
  const out = [];
  for (let i = 1; i < values.length; i++) {
    const org = String(values[i][orgIdx] || '');
    if (org.indexOf(MAIA_ORG_KEYWORD) < 0) continue;
    out.push(idx.map(function (j, k) {
      const v = j < 0 ? '' : values[i][j];
      return cols[k][2] === 'date' ? maiaToDate_(v) : v;
    }));
  }
  if (cols[0][2] === 'date') {
    out.sort(function (a, b) { return maiaTime_(a[0]) - maiaTime_(b[0]); });
  }
  return out;
}

function maiaToDate_(v) {
  if (v instanceof Date) return v;
  if (v === '' || v === null) return '';
  const d = new Date(v);
  return isNaN(d.getTime()) ? v : d;
}

function maiaTime_(v) {
  return v instanceof Date ? v.getTime() : 0;
}

function maiaTitle_(label) {
  return label + '  データソース: はてなベース試験システム（所属に「' + MAIA_ORG_KEYWORD + '」を含む受験者のみ）  最終同期: ' +
    Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm');
}

// タイトル（1行目）＋見出し（2行目）＋データ（3行目〜）を全件置換で書き込み、書式を当てる
function writeMaiaTable_(sh, title, cols, rows, formulas) {
  sh.clear();
  sh.clearConditionalFormatRules();
  sh.getBandings().forEach(function (b) { b.remove(); });
  const n = cols.length;
  sh.getRange('A1').setValue(title).setFontFamily('Arial').setFontSize(12).setFontWeight('bold');
  sh.getRange(2, 1, 1, n).setValues([cols.map(function (c) { return c[1]; })]);
  if (rows.length > 0) sh.getRange(3, 1, rows.length, n).setValues(rows);
  if (formulas) formulas(sh, rows.length);
  const dataRows = Math.max(rows.length, 1);
  formatMaiaTable_(sh, 2, n, dataRows);
  cols.forEach(function (c, k) {
    const r = sh.getRange(3, k + 1, dataRows, 1);
    if (c[2] === 'date') r.setNumberFormat('yyyy/mm/dd hh:mm').setHorizontalAlignment('right');
    else if (c[2] === 'day') r.setNumberFormat('yyyy/mm/dd').setHorizontalAlignment('right');
    else if (c[2] === 'num') r.setNumberFormat('#,##0').setHorizontalAlignment('right');
    else if (c[2] === 'right') r.setHorizontalAlignment('right');
    else if (c[2] === 'center') r.setHorizontalAlignment('center');
    else r.setHorizontalAlignment('left');
  });
  // 列幅: 見出しが折り返さない幅（autoResize後に余白）。タイトル行の長文は幅計算から除外するため一時的に退避
  const titleCell = sh.getRange('A1');
  const t = titleCell.getValue();
  titleCell.setValue('');
  sh.autoResizeColumns(1, n);
  for (let k = 1; k <= n; k++) {
    sh.setColumnWidth(k, Math.max(sh.getColumnWidth(k) + 20, maiaTextWidth_(cols[k - 1][1]), 70));
  }
  titleCell.setValue(t);
  sh.setFrozenRows(2);
}

function writeMaiaRoster_(ss, roster) {
  const sh = ss.getSheetByName(MAIA_TAB_ROSTER);
  const cols = [
    ['', 'No', 'num'], ['', '氏名', 'text'], ['', '所属', 'text'],
    ['', 'スキルチェック 最新レベル', 'center'], ['', '認定試験 受験回数', 'num'],
    ['', '認定試験 最新結果', 'center'], ['', '認定試験 最終受験日', 'day'], ['', 'Owlcast 状況', 'center']
  ];
  const rows = roster.map(function (p, i) { return [i + 1, p[0], p[1], '', '', '', '', '']; });
  const title = '受講生一覧（集約ビュー）  データソース: 本スプレッドシートの各タブ（数式で参照）  最終同期: ' +
    Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm');
  writeMaiaTable_(sh, title, cols, rows, function (s, count) {
    if (count === 0) return;
    const sk = "'" + MAIA_TAB_SKILL + "'!";
    const te = "'" + MAIA_TAB_TEST + "'!";
    const ow = "'" + MAIA_TAB_OWLCAST + "'!";
    // 各タブは受験日時の昇順なので、XLOOKUP の後方検索（-1）で最新の受験を引く
    const f = [];
    for (let i = 0; i < count; i++) {
      const r = i + 3;
      f.push([
        '=IFERROR(XLOOKUP($B' + r + ',' + sk + '$B$3:$B,' + sk + '$G$3:$G,"未受験",0,-1),"未受験")',
        '=COUNTIF(' + te + '$B$3:$B,$B' + r + ')',
        '=IFERROR(XLOOKUP($B' + r + ',' + te + '$B$3:$B,' + te + '$G$3:$G,"未受験",0,-1),"未受験")',
        '=IFERROR(XLOOKUP($B' + r + ',' + te + '$B$3:$B,' + te + '$A$3:$A,"",0,-1),"")',
        '=IFERROR(XLOOKUP($B' + r + ',' + ow + '$B$3:$B,' + ow + '$D$3:$D,"未取得",0,-1),"未取得")'
      ]);
    }
    s.getRange(3, 4, count, 5).setFormulas(f);
  });
}

// 見出し（Arial 10pt 太字）が折り返さない列幅の目安: 全角14px・半角8px＋左右余白
function maiaTextWidth_(text) {
  let w = 24;
  String(text).split('').forEach(function (ch) { w += ch.charCodeAt(0) > 255 ? 14 : 8; });
  return w;
}

// 見出し行の書式＋データ行のゼブラ・罫線
function formatMaiaTable_(sh, headerRow, numCols, dataRows) {
  const all = sh.getRange(headerRow, 1, dataRows + 1, numCols);
  all.setFontFamily('Arial').setFontSize(10).setFontColor('#000000')
    .setBorder(true, true, true, true, true, true, MAIA_BORDER, SpreadsheetApp.BorderStyle.SOLID);
  sh.getRange(headerRow, 1, 1, numCols)
    .setBackground(MAIA_HEADER_BG).setFontColor('#ffffff').setFontWeight('bold')
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  const band = all.applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, true, false);
  band.setHeaderRowColor(MAIA_HEADER_BG).setFirstRowColor('#ffffff').setSecondRowColor(MAIA_ZEBRA_BG);
}
