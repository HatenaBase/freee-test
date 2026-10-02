// =====================================================================
// MAIA 共有用「福山市PJ_受講進捗共有」スプレッドシートへの同期
//
// 受講生の照合は「はてな側ID」（試験システムの「受講生ID」列）で行う。氏名・所属では判定しない。
//   ① 渡辺さん（MAIA）が共有側の「受講生マスタ」タブに 氏名・メールアドレス（必須）と任意の項目を入力
//   ② はてなベースが registerFromMaster() を手動実行
//      → はてな側ID（FKY-001〜）を採番し、試験システムの「トークン管理」「スキルチェック_トークン管理」に行を追加
//   ③ 受験URLを送付（試験システムの案内メール機能）
//   ④ 以降は syncFukuyamaToMaiaSheet() が1時間ごとに結果を同期
//
// - 同期処理は元スプレッドシートを読み取るだけ。書き込むのは registerFromMaster() だけ
// - 同期処理は「受講生マスタ」「Owlcast進捗」タブを書き換えない（マスタの はてな側ID 列は registerFromMaster() だけが書く）
// - token / email / URL / admin_URL 列は共有側に書き出さない（列はホワイトリストで指定）
//
// 初回: initMaiaSync() を GAS エディタから1回実行（書式設定＋1時間トリガー設置＋初回同期）
// 定期: syncFukuyamaToMaiaSheet() が1時間ごとに時間主導トリガーで動く
// 検証: maiaTestUseSourceCopy() で元スプレッドシートのコピーを作り参照先を切り替え、
//       終わったら maiaTestUseProductionSource() で本番に戻す（コピーは Drive でゴミ箱へ）
// =====================================================================

const MAIA_SOURCE_SS_ID = '13sA5RMm-m4TtYBH8BmE1RxI4UNmcW2O9vbiQGOVP4A4'; // 試験システム（本番。既定の参照先）
const MAIA_TARGET_SS_ID = '18hoLkHsEF0OldRHw_am9-RbwlcGjcSHIX7j_7ZTugaQ'; // 福山市PJ_受講進捗共有

// Script Properties のキー
const MAIA_PROP_SOURCE_OVERRIDE = 'MAIA_SOURCE_SS_ID_OVERRIDE'; // 検証用コピーのID（空なら本番）
const MAIA_PROP_LAST_REGISTER = 'MAIA_LAST_REGISTER';           // 直近の registerFromMaster の結果（README の同期結果欄に出す）

// 受講生ID
const MAIA_ID_HEADER = '受講生ID';     // 試験システム側（トークン管理・スキルチェック_トークン管理）の見出し
const MAIA_ID_PREFIX = 'FKY-';         // はてな側IDの形式: FKY-001 からの連番（3桁ゼロ埋め）
const MAIA_ID_DIGITS = 3;
const MAIA_REGISTER_ORG = '福山市';    // registerFromMaster で登録する org

// 受験URL（Code.gs の generateUrls() と SKILL_CHECK_BASE_URL と同じ）
const MAIA_TEST_BASE_URL = 'https://hatenabase.github.io/freee-test/';

const MAIA_SRC_SKILL_RESULT = 'スキルチェック_結果';
const MAIA_SRC_TEST_RESULT = 'テスト結果';
const MAIA_SRC_TEST_TOKEN = 'トークン管理';
const MAIA_SRC_SKILL_TOKEN = 'スキルチェック_トークン管理';

const MAIA_TAB_README = 'README';
const MAIA_TAB_MASTER = '受講生マスタ';
const MAIA_TAB_ROSTER = '受講生一覧';
const MAIA_TAB_SKILL = 'スキルチェック';
const MAIA_TAB_TEST = '認定試験';
const MAIA_TAB_OWLCAST = 'Owlcast進捗';

const MAIA_LAST_SYNC_CELL = 'B9';   // README の最終同期日時
const MAIA_SYNC_RESULT_CELL = 'B10'; // README の同期結果
const MAIA_SYNC_HANDLER = 'syncFukuyamaToMaiaSheet';

// 書式（spreadsheet-format スキル準拠）
const MAIA_HEADER_BG = '#1a3a5c';
const MAIA_ZEBRA_BG = '#f2f6fa';
const MAIA_SUBTOTAL_BG = '#e8eef4';
const MAIA_BORDER = '#c0c0c0';

// 受講生マスタ（渡辺さんが入力。同期では書き換えない）
// コードが参照するのは見出し「氏名」「メールアドレス」「はてな側ID」の3列だけ（2行目の見出し名で列を探す）。
// それ以外の列（MAIA受講番号・MAIA管理ID・備考など）は任意で、名前の変更・削除・追加をしてよい。
// MAIA_MASTER_INITIAL_HEADERS はタブを新規作成するときの初期見出しにだけ使う。
const MAIA_MASTER_INITIAL_HEADERS = ['No', '氏名', 'MAIA受講番号', 'MAIA管理ID', 'メールアドレス', 'はてな側ID', '備考'];
const MAIA_MH_NO = 'No';
const MAIA_MH_NAME = '氏名';
const MAIA_MH_EMAIL = 'メールアドレス';
const MAIA_MH_ID = 'はてな側ID';
const MAIA_MASTER_ROWS = 100; // 入力枠の行数

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

// [元シートの列名, 表示名, 種別(date/num/text...)]。'__id__' は token から引いた受講生ID
function maiaSkillColumns_() {
  const cols = [
    ['timestamp', '受験日時', 'date'],
    ['__id__', '受講生ID', 'center'],
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
    ['__id__', '受講生ID', 'center'],
    ['name', '氏名', 'text'],
    ['org', '所属', 'text'],
    ['score', '正答数', 'num'],
    ['total', '出題数', 'num'],
    ['pct', '正答率(%)', 'num'],
    ['passed', '合否', 'center'],
    ['elapsed', '所要時間', 'right']
  ];
}

// Owlcast進捗: A=No(数式) B=はてな側ID(入力) C=氏名(数式) D=状況 … Q=取得日
const MAIA_OWLCAST_HEADERS = ['No', 'はてな側ID', '氏名', '状況', '完了章数', '1章 概要', '2章 経理体制', '3章 セットアップ', '4章 機能', '5章 人事労務・経費精算', '6章 応用機能', '受講時間合計(分)', '受講開始日', '完了日', '最終受講日', '備考', '取得日'];
const MAIA_OWLCAST_ROWS = 200; // 手入力枠の行数

// 参照する試験システムのスプレッドシートID（検証用コピーへの切替は Script Properties で行う。既定は本番）
function maiaSourceId_() {
  const override = PropertiesService.getScriptProperties().getProperty(MAIA_PROP_SOURCE_OVERRIDE);
  return override || MAIA_SOURCE_SS_ID;
}

// ===== 初回セットアップ（GASエディタから1回実行） =====
function initMaiaSync() {
  setupMaiaSheet();
  installMaiaSyncTrigger();
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

// README・受講生マスタ・Owlcast進捗タブの見出しと書式を整え、同期する（何度実行してもマスタ・Owlcast の入力値は消さない）
function setupMaiaSheet() {
  const ss = SpreadsheetApp.openById(MAIA_TARGET_SS_ID);
  ss.getSheets().forEach(function (s) {
    s.getDataRange().setFontFamily('Arial').setFontSize(10);
  });
  setupMaiaReadme_(ss);
  setupMaiaMaster_(ss);
  setupMaiaOwlcast_(ss);
  syncFukuyamaToMaiaSheet();
}

// README は A1:D13 だけを書き直す（14行目以降の社外秘表示などは触らない）
function setupMaiaReadme_(ss) {
  const sh = ss.getSheetByName(MAIA_TAB_README);
  sh.getBandings().forEach(function (b) { b.remove(); });
  sh.getRange('A1:D13').clear();
  const created = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd');
  sh.getRange('A1').setValue('福山市 freee会計コース 受講進捗共有  作成日: ' + created + '  データソース: はてなベース試験システム（受験時に自動記録）／受講生マスタ（MAIA入力）／Owlcast管理画面（手入力）')
    .setFontFamily('Arial').setFontSize(12).setFontWeight('bold');
  const rows = [
    ['タブ', '内容', '更新方法', '更新頻度'],
    [MAIA_TAB_MASTER, '受講生の名簿（正本）。氏名・メールアドレスは必須、MAIA受講番号・MAIA管理ID・備考は任意（空でよい）。はてな側ID以外は渡辺さん（MAIA）が入力し、はてな側IDははてなベースが試験システム登録時に記入する。同期では消えない', '手動入力（MAIA）／はてな側IDははてなベース', '随時'],
    [MAIA_TAB_ROSTER, '受講生マスタの行を元にした集約ビュー。スキルチェック・認定試験・Owlcast進捗の各タブを はてな側ID で数式参照', '自動（同期時に再作成）', '1時間ごと'],
    [MAIA_TAB_SKILL, '簿記3級スキルチェックの受験結果（受験ごとに1行、受講生IDつき、単元別の正答数つき）', '自動（試験システムから同期）', '1時間ごと'],
    [MAIA_TAB_TEST, 'freee会計 修了認定テストの受験結果（受験ごとに1行、受講生IDつき、合格ライン75%）', '自動（試験システムから同期）', '1時間ごと'],
    [MAIA_TAB_OWLCAST, 'Owlcast（LMS）の章別の学習進捗。はてな側IDを入れると氏名は受講生マスタから自動表示。取得日の列に管理画面から転記した日付を入れる', '手動入力', '週次']
  ];
  sh.getRange(2, 1, rows.length, 4).setValues(rows);
  formatMaiaTable_(sh, 2, 4, rows.length - 1);
  sh.getRange(3, 1, rows.length - 1, 4).setVerticalAlignment('middle').setWrap(true);

  const info = [
    ['最終同期日時', '（未同期）'],
    ['同期結果', ''],
    ['対象の判定', '受講生マスタの「はてな側ID」に登録された受講生。試験システムの「受講生ID」で照合する（氏名・所属では判定しない）'],
    ['注意', 'スキルチェック・認定試験・受講生一覧の3タブは同期のたびに全件置き換えます。手で書き込んだ内容は消えるため、メモは 受講生マスタ または Owlcast進捗 の備考列に書いてください。受講生マスタは同期では書き換えません'],
    ['運用の順番', '① 渡辺さん（MAIA）が受講生マスタに 氏名・メールアドレス（必須）と任意の項目を入力\n② はてなベースが試験システムに登録（registerFromMaster を実行。はてな側ID を FKY-001 からの連番で採番し、マスタに記入）\n③ はてなベースが受験URLを送付\n④ 以降は1時間ごとに自動同期']
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

// 受講生マスタ: 無ければ初期見出しで作る。あれば今の見出し（2行目）を保ったまま書式だけ当て直し、3行目以降の入力値は消さない
function setupMaiaMaster_(ss) {
  let sh = ss.getSheetByName(MAIA_TAB_MASTER);
  if (!sh) {
    sh = ss.insertSheet(MAIA_TAB_MASTER, 1); // README の次
    sh.getRange(2, 1, 1, MAIA_MASTER_INITIAL_HEADERS.length).setValues([MAIA_MASTER_INITIAL_HEADERS]);
  }
  const mc = maiaMasterColumns_(sh);
  const n = mc.width;
  const rows = MAIA_MASTER_ROWS;
  if (sh.getMaxRows() < rows + 2) sh.insertRowsAfter(sh.getMaxRows(), rows + 2 - sh.getMaxRows());
  const created = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd');
  sh.getRange('A1').setValue('受講生マスタ  ※このタブは渡辺さん（MAIA）が入力します（はてな側ID以外の列）。同期では消えません。はてな側IDははてなベースが試験システム登録時に記入します  作成日: ' + created)
    .setFontFamily('Arial').setFontSize(12).setFontWeight('bold');
  sh.getBandings().forEach(function (b) { b.remove(); });
  formatMaiaTable_(sh, 2, n, rows);
  sh.getRange(3, 1, rows, n).setVerticalAlignment('middle').setHorizontalAlignment('left').setNumberFormat('@'); // 文字列（番号の先頭0を保つ）
  sh.getRange(3, mc.id + 1, rows, 1).setHorizontalAlignment('center');
  // No は入力行に連番を表示する数式（No 列があるときだけ）
  if (mc.no >= 0) {
    const first = maiaColLetter_(mc.no === 0 ? 2 : 1);
    const last = maiaColLetter_(n);
    const noFormulas = [];
    for (let i = 0; i < rows; i++) {
      const r = i + 3;
      noFormulas.push(['=IF(COUNTA($' + first + r + ':$' + last + r + ')=0,"",ROW()-2)']);
    }
    sh.getRange(3, mc.no + 1, rows, 1).setNumberFormat('0').setHorizontalAlignment('right').setFormulas(noFormulas);
  }
  // 入力規則: メールアドレスの形式
  const emailRule = SpreadsheetApp.newDataValidation().requireTextIsEmail().setAllowInvalid(false)
    .setHelpText('メールアドレスの形式で入力してください').build();
  sh.getRange(3, mc.email + 1, rows, 1).setDataValidation(emailRule);
  sh.getRange(2, mc.id + 1).setNote('はてなベースが試験システム登録時に記入します（registerFromMaster）。手で書き換えないでください');
  // はてな側ID 列は警告つき保護（編集はできるが確認が出る）。既存の同名保護は作り直す
  const desc = '受講生マスタ はてな側ID（はてなベース記入）';
  sh.getProtections(SpreadsheetApp.ProtectionType.RANGE).forEach(function (p) {
    if (p.getDescription() === desc) p.remove();
  });
  sh.getRange(3, mc.id + 1, rows, 1).protect().setDescription(desc).setWarningOnly(true);
  for (let k = 0; k < n; k++) {
    let w = 130;
    if (k === mc.no) w = 50;
    else if (k === mc.email) w = 240;
    else if (k === mc.id) w = 110;
    else if (k === n - 1) w = 240;
    sh.setColumnWidth(k + 1, Math.max(w, maiaTextWidth_(mc.headers[k])));
  }
  sh.setFrozenRows(2);
}

// 受講生マスタの列位置（0始まり）を2行目の見出し名で探す。必須の3列が無ければエラー
function maiaMasterColumns_(sh) {
  const lastCol = Math.max(sh.getLastColumn(), 1);
  const headers = sh.getRange(2, 1, 1, lastCol).getDisplayValues()[0].map(function (h) { return String(h).trim(); });
  while (headers.length > 0 && headers[headers.length - 1] === '') headers.pop();
  const c = {
    headers: headers,
    width: headers.length,
    no: headers.indexOf(MAIA_MH_NO),
    name: headers.indexOf(MAIA_MH_NAME),
    email: headers.indexOf(MAIA_MH_EMAIL),
    id: headers.indexOf(MAIA_MH_ID)
  };
  const missing = [];
  if (c.name < 0) missing.push(MAIA_MH_NAME);
  if (c.email < 0) missing.push(MAIA_MH_EMAIL);
  if (c.id < 0) missing.push(MAIA_MH_ID);
  if (missing.length > 0) throw new Error('受講生マスタの2行目に見出し「' + missing.join('」「') + '」がありません');
  return c;
}

// 1始まりの列番号 → 列記号（A, B, …, AA）
function maiaColLetter_(col) {
  let s = '';
  while (col > 0) {
    const m = (col - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    col = Math.floor((col - 1) / 26);
  }
  return s;
}

// Owlcast進捗: はてな側ID で受講生を指定し、氏名は受講生マスタから数式で引く
// 旧レイアウト（B列=氏名・C列=所属）で入力値が残っている場合は、消さないよう中止する
function setupMaiaOwlcast_(ss) {
  const sh = ss.getSheetByName(MAIA_TAB_OWLCAST);
  const n = MAIA_OWLCAST_HEADERS.length;
  const rows = MAIA_OWLCAST_ROWS;
  if (String(sh.getRange('B2').getValue()) !== 'はてな側ID') {
    const old = sh.getRange(3, 1, rows, n).getValues();
    const hasInput = old.some(function (r) { return r.some(function (v) { return v !== '' && v !== null; }); });
    if (hasInput) throw new Error('Owlcast進捗 に旧レイアウトの入力値があるため作り直しを中止しました。値を退避してから再実行してください');
    sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).clearDataValidations();
    sh.getBandings().forEach(function (b) { b.remove(); });
    sh.clear();
    sh.setFrozenColumns(0);
  }
  sh.getRange('A1').setValue('Owlcast 学習進捗（章別）  データソース: Owlcast管理画面 受講履歴（週次で手入力。はてな側IDを入れると氏名は受講生マスタから自動表示。取得日列に転記日を記入）')
    .setFontFamily('Arial').setFontSize(12).setFontWeight('bold');
  sh.getRange(2, 1, 1, n).setValues([MAIA_OWLCAST_HEADERS]);
  sh.getBandings().forEach(function (b) { b.remove(); });
  formatMaiaTable_(sh, 2, n, rows);
  sh.getRange(3, 1, rows, n).setVerticalAlignment('middle');
  // 列ごとの揃え・書式
  sh.getRange(3, 1, rows, 1).setHorizontalAlignment('right');            // No
  sh.getRange(3, 2, rows, 1).setHorizontalAlignment('center');           // はてな側ID
  sh.getRange(3, 3, rows, 1).setHorizontalAlignment('left');             // 氏名
  sh.getRange(3, 4, rows, 8).setHorizontalAlignment('center');           // 状況〜6章
  sh.getRange(3, 5, rows, 1).setNumberFormat('0').setHorizontalAlignment('right');
  sh.getRange(3, 12, rows, 1).setNumberFormat('#,##0').setHorizontalAlignment('right');
  sh.getRange(3, 13, rows, 3).setNumberFormat('yyyy/mm/dd').setHorizontalAlignment('right');
  sh.getRange(3, 16, rows, 1).setHorizontalAlignment('left');
  sh.getRange(3, 17, rows, 1).setNumberFormat('yyyy/mm/dd').setHorizontalAlignment('right');
  // No・氏名は数式（はてな側IDから受講生マスタを引く）
  const master = ss.getSheetByName(MAIA_TAB_MASTER);
  const mc = maiaMasterColumns_(master);
  const m = "'" + MAIA_TAB_MASTER + "'!";
  const idL = maiaColLetter_(mc.id + 1), nameL = maiaColLetter_(mc.name + 1);
  const noF = [], nameF = [];
  for (let i = 0; i < rows; i++) {
    const r = i + 3;
    noF.push(['=IF($B' + r + '="","",ROW()-2)']);
    nameF.push(['=IF($B' + r + '="","",IFERROR(XLOOKUP($B' + r + ',' + m + '$' + idL + '$3:$' + idL + ',' + m + '$' + nameL + '$3:$' + nameL + '),"（マスタに無いID）"))']);
  }
  sh.getRange(3, 1, rows, 1).setFormulas(noF);
  sh.getRange(3, 3, rows, 1).setFormulas(nameF);
  // 入力規則: はてな側ID は受講生マスタの値から選ぶ。状況・章は安曇野市シートの表記に合わせる
  const idRule = SpreadsheetApp.newDataValidation()
    .requireValueInRange(master.getRange(3, mc.id + 1, MAIA_MASTER_ROWS, 1), true).setAllowInvalid(false).build();
  const statusRule = SpreadsheetApp.newDataValidation().requireValueInList(['受講済', '受講中', '未着手'], true).setAllowInvalid(false).build();
  const chapterRule = SpreadsheetApp.newDataValidation().requireValueInList(['済', '中', '－'], true).setAllowInvalid(false).build();
  sh.getRange(3, 2, rows, 1).setDataValidation(idRule);
  sh.getRange(3, 4, rows, 1).setDataValidation(statusRule);
  sh.getRange(3, 6, rows, 6).setDataValidation(chapterRule);
  const widths = [50, 110, 140, 80, 80, 80, 100, 120, 80, 170, 100, 130, 110, 110, 110, 260, 110];
  widths.forEach(function (w, i) { sh.setColumnWidth(i + 1, Math.max(w, maiaTextWidth_(MAIA_OWLCAST_HEADERS[i]))); });
  sh.setFrozenRows(2);
  sh.setFrozenColumns(3);
}

// ===== 同期本体（1時間ごと） =====
function syncFukuyamaToMaiaSheet() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    Logger.log('別の処理が実行中のためスキップ');
    return;
  }
  try {
    maiaSyncCore_();
  } finally {
    lock.releaseLock();
  }
}

// 同期の中身（ロックは呼び出し側で取る）。受講生マスタ・Owlcast進捗は読むだけ
function maiaSyncCore_() {
  const sourceId = maiaSourceId_();
  const src = SpreadsheetApp.openById(sourceId); // 読み取りのみ
  const ss = SpreadsheetApp.openById(MAIA_TARGET_SS_ID);
  if (ss.getSpreadsheetTimeZone() !== 'Asia/Tokyo') ss.setSpreadsheetTimeZone('Asia/Tokyo'); // 日時表示を日本時間に揃える

  const master = readMaiaMaster_(ss);
  const members = {};
  master.forEach(function (p) { if (p.id) members[p.id] = true; });

  // token → 受講生ID（両トークン管理シートの「受講生ID」列から）
  const tokenToId = {};
  [MAIA_SRC_TEST_TOKEN, MAIA_SRC_SKILL_TOKEN].forEach(function (name) {
    const map = readMaiaTokenIdMap_(src.getSheetByName(name));
    Object.keys(map).forEach(function (t) { tokenToId[t] = map[t]; });
  });

  const skillCols = maiaSkillColumns_();
  const testCols = maiaTestColumns_();
  const skillRows = readMaiaResultRows_(src.getSheetByName(MAIA_SRC_SKILL_RESULT), skillCols, tokenToId, members);
  const testRows = readMaiaResultRows_(src.getSheetByName(MAIA_SRC_TEST_RESULT), testCols, tokenToId, members);

  writeMaiaTable_(ss.getSheetByName(MAIA_TAB_SKILL), maiaTitle_('スキルチェック（簿記3級）受験結果'), skillCols, skillRows, null);
  writeMaiaTable_(ss.getSheetByName(MAIA_TAB_TEST), maiaTitle_('freee会計 修了認定テスト 受験結果'), testCols, testRows, null);
  writeMaiaRoster_(ss, master);

  const unregistered = master.filter(function (p) { return !p.id; }).length;
  let summary = '受講生 ' + master.length + '名（うち はてな側ID未登録 ' + unregistered + '名）／スキルチェック ' + skillRows.length + '件／認定試験 ' + testRows.length + '件';
  if (sourceId !== MAIA_SOURCE_SS_ID) summary += '\n※検証用コピーを参照中（' + sourceId + '）';
  const lastRegister = PropertiesService.getScriptProperties().getProperty(MAIA_PROP_LAST_REGISTER);
  if (lastRegister) summary += '\n最終登録: ' + lastRegister;
  const readme = ss.getSheetByName(MAIA_TAB_README);
  readme.getRange(MAIA_LAST_SYNC_CELL).setValue(new Date()).setNumberFormat('yyyy/mm/dd hh:mm');
  readme.getRange(MAIA_SYNC_RESULT_CELL).setValue(summary);
  Logger.log('同期完了 ' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm') + ' ' + summary.replace(/\n/g, ' ／ '));
}

// 受講生マスタの入力行（No 以外のどれかの列が入っている行）を上から順に返す。参照するのは 氏名・メールアドレス・はてな側ID だけ
function readMaiaMaster_(ss) {
  const sh = ss.getSheetByName(MAIA_TAB_MASTER);
  if (!sh) {
    Logger.log('受講生マスタ タブがありません（setupMaiaSheet を実行してください）');
    return [];
  }
  const mc = maiaMasterColumns_(sh);
  const last = sh.getLastRow();
  if (last < 3) return [];
  const values = sh.getRange(3, 1, last - 2, mc.width).getDisplayValues();
  const out = [];
  values.forEach(function (v, i) {
    const filled = v.some(function (x, k) { return k !== mc.no && String(x).trim() !== ''; });
    if (!filled) return;
    out.push({
      row: i + 3,
      name: String(v[mc.name]).trim(),
      email: String(v[mc.email]).trim(),
      id: String(v[mc.id]).trim(),
      idCol: mc.id + 1
    });
  });
  return out;
}

// トークン管理シートの token → 受講生ID。受講生ID 列がなければ空（同期では列を足さない）
function readMaiaTokenIdMap_(sheet) {
  const map = {};
  if (!sheet) return map;
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return map;
  const header = values[0].map(function (h) { return String(h).trim(); });
  const tokenIdx = header.indexOf('token');
  const idIdx = header.indexOf(MAIA_ID_HEADER);
  if (tokenIdx < 0 || idIdx < 0) return map;
  for (let i = 1; i < values.length; i++) {
    const t = String(values[i][tokenIdx] || '').trim();
    const id = String(values[i][idIdx] || '').trim();
    if (t && id) map[t] = id;
  }
  return map;
}

// 結果シートを見出し名で読み、token から引いた受講生IDが受講生マスタにある行だけを cols の順で返す（受験日時の昇順）
function readMaiaResultRows_(sheet, cols, tokenToId, members) {
  if (!sheet) return [];
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const header = values[0].map(function (h) { return String(h).trim(); });
  const tokenIdx = header.indexOf('token');
  if (tokenIdx < 0) throw new Error('シート「' + sheet.getName() + '」に token 列がありません');
  const idx = cols.map(function (c) { return header.indexOf(c[0]); });
  const out = [];
  for (let i = 1; i < values.length; i++) {
    const id = tokenToId[String(values[i][tokenIdx] || '').trim()];
    if (!id || !members[id]) continue;
    out.push(idx.map(function (j, k) {
      if (cols[k][0] === '__id__') return id;
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
  return label + '  データソース: はてなベース試験システム（受講生マスタに はてな側ID がある受講生のみ。受講生IDで照合）  最終同期: ' +
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

// 受講生一覧: 受講生マスタの行をそのまま並べ、各列は はてな側ID で他タブを引く（ID が空の人は「未登録」）
function writeMaiaRoster_(ss, master) {
  const sh = ss.getSheetByName(MAIA_TAB_ROSTER);
  const cols = [
    ['', 'No', 'num'], ['', 'はてな側ID', 'center'], ['', '氏名', 'text'],
    ['', 'スキルチェック 最新レベル', 'center'], ['', '認定試験 受験回数', 'num'],
    ['', '認定試験 最新結果', 'center'], ['', '認定試験 最終受験日', 'day'], ['', 'Owlcast 状況', 'center']
  ];
  const rows = master.map(function (p, i) { return [i + 1, p.id || '未登録', p.name, '', '', '', '', '']; });
  const title = '受講生一覧（集約ビュー）  データソース: 受講生マスタ＋本スプレッドシートの各タブ（はてな側IDで数式参照）  最終同期: ' +
    Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm');
  writeMaiaTable_(sh, title, cols, rows, function (s, count) {
    if (count === 0) return;
    s.getRange(3, 2, count, 2).setNumberFormat('@').setValues(rows.map(function (r) { return [r[1], r[2]]; }));
    const sk = "'" + MAIA_TAB_SKILL + "'!";   // B=受講生ID, H=レベル
    const te = "'" + MAIA_TAB_TEST + "'!";    // A=受験日時, B=受講生ID, H=合否
    const ow = "'" + MAIA_TAB_OWLCAST + "'!"; // B=はてな側ID, D=状況
    // 各タブは受験日時の昇順なので、XLOOKUP の後方検索（-1）で最新の受験を引く
    const f = [];
    for (let i = 0; i < count; i++) {
      const r = i + 3;
      f.push([
        '=IFERROR(XLOOKUP($B' + r + ',' + sk + '$B$3:$B,' + sk + '$H$3:$H,"未受験",0,-1),"未受験")',
        '=COUNTIF(' + te + '$B$3:$B,$B' + r + ')',
        '=IFERROR(XLOOKUP($B' + r + ',' + te + '$B$3:$B,' + te + '$H$3:$H,"未受験",0,-1),"未受験")',
        '=IFERROR(XLOOKUP($B' + r + ',' + te + '$B$3:$B,' + te + '$A$3:$A,"",0,-1),"")',
        '=IFERROR(XLOOKUP($B' + r + ',' + ow + '$B$3:$B,' + ow + '$D$3:$D,"未取得",0,-1),"未取得")'
      ]);
    }
    s.getRange(3, 4, count, 5).setFormulas(f);
  });
}

// ===== 試験システムへの登録（手動実行専用。トリガーに載せない） =====
// 受講生マスタで「氏名とメールアドレスが入っていて はてな側ID が空」の行を対象に、
// FKY-連番を採番し、試験システムの「トークン管理」「スキルチェック_トークン管理」の両方へ行を追加する。
// token は Code.gs の generateToken()、URL は generateUrls()／writeSkillCheckUrls() と同じ形式で書く。
// （Code.gs の generateTokens()／generateUrls() は本番ID固定の getSheet() と SpreadsheetApp.getUi() を使うため、
//   エディタ実行・検証用コピーでは呼べない。発行処理の中身＝token 生成・status=active・created・URL を同じ形で行う）
// sourceId を省略すると Script Properties の切替先（無ければ本番）を使う。
function registerFromMaster(sourceId) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('別の処理が実行中です。少し待って再実行してください');
  try {
    const srcId = (typeof sourceId === 'string' && sourceId) ? sourceId : maiaSourceId_();
    const src = SpreadsheetApp.openById(srcId);
    const ss = SpreadsheetApp.openById(MAIA_TARGET_SS_ID);
    const masterSh = ss.getSheetByName(MAIA_TAB_MASTER);
    if (!masterSh) throw new Error('受講生マスタ タブがありません（setupMaiaSheet を実行してください）');
    const log = [];
    log.push('参照先: ' + (srcId === MAIA_SOURCE_SS_ID ? '本番' : '検証用コピー') + '（' + srcId + '）');

    const targets = [
      { sheet: src.getSheetByName(MAIA_SRC_TEST_TOKEN), baseUrl: MAIA_TEST_BASE_URL },
      { sheet: src.getSheetByName(MAIA_SRC_SKILL_TOKEN), baseUrl: SKILL_CHECK_BASE_URL }
    ];
    targets.forEach(function (t) {
      if (!t.sheet) throw new Error('試験システムにシートがありません: ' + (t === targets[0] ? MAIA_SRC_TEST_TOKEN : MAIA_SRC_SKILL_TOKEN));
      // 見出し名で探索し、無ければ末尾に追加（Code.gs の ensureMailColumns／writeSkillCheckUrls と同じ方式。既存列は動かさない）
      t.cols = {
        url: maiaEnsureColumn_(t.sheet, 'URL', log),
        email: maiaEnsureColumn_(t.sheet, 'email', log),
        id: maiaEnsureColumn_(t.sheet, MAIA_ID_HEADER, log)
      };
      const header = t.sheet.getRange(1, 1, 1, t.sheet.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); });
      t.cols.adminUrl = header.indexOf('admin_URL'); // あるときだけ書く
      t.width = header.length;
      const values = t.sheet.getDataRange().getValues();
      t.tokens = {};
      t.emails = {};
      t.ids = [];
      for (let i = 1; i < values.length; i++) {
        if (values[i][0]) t.tokens[String(values[i][0])] = true;
        const e = String(values[i][t.cols.email] || '').trim().toLowerCase();
        if (e) t.emails[e] = i + 1;
        t.ids.push(String(values[i][t.cols.id] || '').trim());
      }
    });

    // 採番: マスタと両トークン管理シートにある FKY-連番の最大値 +1
    const master = readMaiaMaster_(ss);
    let maxNo = 0;
    master.map(function (p) { return p.id; }).concat(targets[0].ids, targets[1].ids).forEach(function (id) {
      const m = new RegExp('^' + MAIA_ID_PREFIX + '(\\d+)$').exec(id);
      if (m) maxNo = Math.max(maxNo, Number(m[1]));
    });

    const registered = [];
    const seenEmails = {};
    master.forEach(function (p) {
      if (p.id) return; // 登録済み
      if (!p.name || !p.email) {
        log.push('対象外（氏名またはメールアドレスが空）: マスタ ' + p.row + '行目');
        return;
      }
      const emailKey = p.email.toLowerCase();
      if (!isValidEmail(p.email)) {
        log.push('スキップ（メールアドレスの形式が不正）: マスタ ' + p.row + '行目');
        return;
      }
      if (seenEmails[emailKey]) {
        log.push('スキップ（マスタ内でメールアドレスが重複。' + seenEmails[emailKey] + '行目と同じ）: マスタ ' + p.row + '行目');
        return;
      }
      seenEmails[emailKey] = p.row;
      const dup = targets.filter(function (t) { return t.emails[emailKey]; })
        .map(function (t) { return t.sheet.getName() + ' ' + t.emails[emailKey] + '行目'; });
      if (dup.length > 0) {
        log.push('スキップ（同じメールアドレスが試験システムに登録済み: ' + dup.join('、') + '）: マスタ ' + p.row + '行目');
        return;
      }
      maxNo++;
      const id = MAIA_ID_PREFIX + ('000000' + maxNo).slice(-Math.max(MAIA_ID_DIGITS, String(maxNo).length));
      targets.forEach(function (t) {
        let token = generateToken(); // Code.gs
        while (t.tokens[token]) token = generateToken();
        t.tokens[token] = true;
        const row = new Array(t.width).fill('');
        row[0] = token;            // token（A列固定）
        row[1] = p.name;           // name（B列固定）
        row[2] = MAIA_REGISTER_ORG; // org（C列固定）
        row[3] = 'active';         // status（D列固定）
        row[4] = new Date();       // created（E列固定）
        row[t.cols.url] = t.baseUrl + '?token=' + token;
        if (t.cols.adminUrl >= 0) row[t.cols.adminUrl] = t.baseUrl + '?token=' + token + '&admin=1';
        row[t.cols.email] = p.email;
        row[t.cols.id] = id;
        const r = t.sheet.getLastRow() + 1;
        t.sheet.getRange(r, 1, 1, t.width).setValues([row]);
        t.emails[emailKey] = r;
      });
      masterSh.getRange(p.row, p.idCol).setValue(id); // はてな側ID を書き戻す（この列を書くのはこの関数だけ）
      registered.push(id);
    });
    SpreadsheetApp.flush();

    const now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm');
    const result = now + ' ' + registered.length + '名' +
      (registered.length > 0 ? '（' + registered[0] + (registered.length > 1 ? '〜' + registered[registered.length - 1] : '') + '）' : '') +
      (srcId === MAIA_SOURCE_SS_ID ? '' : ' ※検証用コピーへの登録');
    PropertiesService.getScriptProperties().setProperty(MAIA_PROP_LAST_REGISTER, result);
    log.push('登録結果: ' + result);
    Logger.log(log.join('\n'));

    maiaSyncCore_(); // 受講生一覧などに反映（README の同期結果欄に登録結果も出る）
  } finally {
    lock.releaseLock();
  }
}

// 見出し名で列を探し、無ければ末尾に追加して 0始まりの列位置を返す
function maiaEnsureColumn_(sheet, headerName, log) {
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const header = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
  let idx = header.indexOf(headerName);
  if (idx < 0) {
    idx = header.length;
    sheet.getRange(1, idx + 1).setValue(headerName);
    if (log) log.push('見出しを追加: ' + sheet.getName() + ' の ' + headerName + '（' + (idx + 1) + '列目）');
  }
  return idx;
}

// ===== 検証用（GAS エディタから手動実行） =====
// 元スプレッドシートのコピーを作り、同期・登録の参照先をコピーに切り替える
function maiaTestUseSourceCopy() {
  const name = '【検証用コピー・削除予定】試験システム ' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd_HHmm');
  const copy = SpreadsheetApp.openById(MAIA_SOURCE_SS_ID).copy(name);
  PropertiesService.getScriptProperties().setProperty(MAIA_PROP_SOURCE_OVERRIDE, copy.getId());
  Logger.log('検証用コピーを作成し参照先を切り替えました: ' + copy.getId() + ' ' + name);
}

// 参照先を本番に戻し、検証時の登録結果の記録を消す（コピー自体は Drive でゴミ箱へ）
function maiaTestUseProductionSource() {
  const props = PropertiesService.getScriptProperties();
  const copyId = props.getProperty(MAIA_PROP_SOURCE_OVERRIDE);
  props.deleteProperty(MAIA_PROP_SOURCE_OVERRIDE);
  props.deleteProperty(MAIA_PROP_LAST_REGISTER);
  Logger.log('参照先を本番に戻しました。検証用コピー（ゴミ箱へ移す）: ' + (copyId || 'なし'));
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
