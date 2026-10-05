// =====================================================================
// MAIA 共有用「MAIA_freee会計コース_受講進捗共有」スプレッドシートへの同期（複数の自治体を1冊で管理）
//
// 受講生の照合は「はてな側ID」（試験システムの「受講生ID」列）で行う。氏名・所属では判定しない。
// 自治体は受講生マスタの「自治体名」列で区別する（自治体ごとにブックやタブは作らない）。
//   ① 渡辺さん（MAIA）が共有側の「受講生マスタ」タブに 氏名・自治体名・メールアドレス（必須）と任意の項目を入力
//   ② はてなベースが registerFromMaster() を手動実行
//      → はてな側ID（HB-001〜。自治体をまたぐ通し番号）を採番し、試験システムの「トークン管理」「スキルチェック_トークン管理」に
//        行を追加（org＝マスタの自治体名）
//   ③ 受験URLを送付（試験システムの案内メール機能）
//   ④ 以降は syncFukuyamaToMaiaSheet() が1時間ごとに結果を同期
//      （関数名は既存の時間主導トリガーに紐づいているため、複数自治体対応後も旧名のまま。処理は自治体を問わない）
//   ⑤ Owlcast進捗は半手動: はてなベースが管理画面のレッスン受講履歴CSVを「Owlcast取込」タブに全件貼り付け、
//      importOwlcastHistory()（手動実行専用・トリガーに載せない）で「Owlcast進捗」を作り直す。
//      受講生と Owlcast 会員の対応は受講生マスタの「Owlcast会員ID」列（会員一覧CSVを「Owlcast会員取込」に貼って fillOwlcastMemberIds() で記入）
//      取込が正常に終わると貼り付けタブの3行目以降を自動で消す（他コホートの氏名・メールアドレスを共有側に残さない。エラー時は残す）
//
// - 同期処理は元スプレッドシートを読み取るだけ。書き込むのは registerFromMaster() だけ
// - 同期処理は「受講生マスタ」「Owlcast進捗」「Owlcast取込」「Owlcast会員取込」タブを書き換えない
//   （マスタの はてな側ID 列は registerFromMaster() だけ、Owlcast会員ID 列は fillOwlcastMemberIds() だけが書く）
// - token / email / URL / admin_URL 列は共有側に書き出さない（列はホワイトリストで指定）
//
// 初回: initMaiaSync() を GAS エディタから1回実行（書式設定＋1時間トリガー設置＋初回同期）
// 定期: syncFukuyamaToMaiaSheet() が1時間ごとに時間主導トリガーで動く
// 検証: maiaTestUseSourceCopy() で元スプレッドシートのコピーを作り参照先を切り替え、
//       終わったら maiaTestUseProductionSource() で本番に戻す（コピーは Drive でゴミ箱へ）
//       共有シート側は maiaTestUseTargetCopy() でコピーを作って書き込み先を切り替え、maiaTestUseProductionTarget() で戻す
// =====================================================================

const MAIA_SOURCE_SS_ID = '13sA5RMm-m4TtYBH8BmE1RxI4UNmcW2O9vbiQGOVP4A4'; // 試験システム（本番。既定の参照先）
const MAIA_TARGET_SS_ID = '18hoLkHsEF0OldRHw_am9-RbwlcGjcSHIX7j_7ZTugaQ'; // MAIA_freee会計コース_受講進捗共有
const MAIA_TARGET_SS_NAME = 'MAIA_freee会計コース_受講進捗共有';               // setupMaiaSheet でこの名前に揃える（URLは変わらない）

// Script Properties のキー
const MAIA_PROP_SOURCE_OVERRIDE = 'MAIA_SOURCE_SS_ID_OVERRIDE'; // 検証用コピーのID（空なら本番）
const MAIA_PROP_LAST_REGISTER = 'MAIA_LAST_REGISTER';           // 直近の registerFromMaster の結果（README の同期結果欄に出す）
const MAIA_PROP_TARGET_OVERRIDE = 'MAIA_TARGET_SS_ID_OVERRIDE'; // 共有シートの検証用コピーのID（空なら本番の共有シート）

// 受講生ID
const MAIA_ID_HEADER = '受講生ID';     // 試験システム側（トークン管理・スキルチェック_トークン管理）の見出し
const MAIA_ID_PREFIX = 'HB-';          // はてな側IDの形式: HB-001 からの通し番号（自治体をまたぐ。3桁ゼロ埋め、999超は桁が増える）
const MAIA_ID_DIGITS = 3;
// registerFromMaster で登録する org は受講生マスタの「自治体名」をそのまま使う（固定値なし）

// 受講生マスタ「自治体名」列のプルダウン候補（初期値）。シート上で候補を足した場合は setupMaiaSheet 実行時に残す
const MAIA_MUNICIPALITY_DEFAULTS = ['福山市', '静岡市'];
// 「自治体名」列を後から追加したときだけ、既存の入力行に入れる値（2026-10-02 時点の在籍は福山市コホートのみだったため）
const MAIA_MUNICIPALITY_MIGRATION_VALUE = '福山市';

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
const MAIA_TAB_OWL_IMPORT = 'Owlcast取込';     // レッスン受講履歴CSVの貼り付け欄（はてなベース用。同期では触らない）
const MAIA_TAB_OWL_MEMBER = 'Owlcast会員取込'; // 会員一覧CSVの貼り付け欄（はてなベース用。同期では触らない）

const MAIA_LAST_SYNC_CELL = 'B9';   // README の最終同期日時
const MAIA_SYNC_RESULT_CELL = 'B10'; // README の同期結果
const MAIA_SYNC_HANDLER = 'syncFukuyamaToMaiaSheet';

// 書式（spreadsheet-format スキル準拠）
const MAIA_HEADER_BG = '#1a3a5c';
const MAIA_ZEBRA_BG = '#f2f6fa';
const MAIA_SUBTOTAL_BG = '#e8eef4';
const MAIA_BORDER = '#c0c0c0';

// 受講生マスタ（渡辺さんが入力。同期では書き換えない）
// コードが参照するのは見出し「氏名」「自治体名」「メールアドレス」「はてな側ID」（と検証用に「備考」）だけ（2行目の見出し名で列を探す）。
// それ以外の列（MAIA受講番号・MAIA管理ID など）は任意で、名前の変更・削除・追加をしてよい。
// MAIA_MASTER_INITIAL_HEADERS はタブを新規作成するときの初期見出しにだけ使う。
// 「自治体名」列が無い既存のマスタには、setupMaiaSheet が「氏名」の直後に列を挿入する（既存の値は列ごと右へずれるだけで変わらない）。
const MAIA_MASTER_INITIAL_HEADERS = ['No', '氏名', '自治体名', 'MAIA受講番号', 'MAIA管理ID', 'メールアドレス', 'はてな側ID', '備考'];
const MAIA_MH_NO = 'No';
const MAIA_MH_NAME = '氏名';
const MAIA_MH_MUNI = '自治体名';
const MAIA_MH_EMAIL = 'メールアドレス';
const MAIA_MH_ID = 'はてな側ID';
const MAIA_MH_NOTE = '備考';
const MAIA_MH_OWL = 'Owlcast会員ID'; // はてなベースが記入する任意列。無ければ setupMaiaSheet が「備考」の直前に挿入する
const MAIA_TEST_NOTE = '検証用'; // 備考がこの値の行だけを maiaTestRegisterVerificationRows() が登録する
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

// [元シートの列名, 表示名, 種別(date/num/text...), 最小列幅(省略可)]。'__id__' は token から引いた受講生ID、'__muni__' はその ID の受講生マスタの自治体名
function maiaSkillColumns_() {
  const cols = [
    ['timestamp', '受験日時', 'date'],
    ['__id__', '受講生ID', 'center'],
    ['name', '氏名', 'text', 140],
    ['__muni__', '自治体名', 'text', 100],
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
    ['name', '氏名', 'text', 140],
    ['__muni__', '自治体名', 'text', 100],
    ['org', '所属', 'text'],
    ['score', '正答数', 'num'],
    ['total', '出題数', 'num'],
    ['pct', '正答率(%)', 'num'],
    ['passed', '合否', 'center'],
    ['elapsed', '所要時間', 'right']
  ];
}

// Owlcast進捗（importOwlcastHistory が毎回作り直す）: A=No B=はてな側ID C=氏名(数式) D=自治体名(数式) E=状況 F=完了章数
// G〜L=1〜6章 完了日（完了なら日付・受講中なら「中」・未着手は空）M=受講時間合計(分) N=受講開始日 O=完了日 P=最終受講日 Q=備考（はてな側IDで引き継ぎ）R=取得日
// 受講生一覧の「Owlcast 状況」は見出し「はてな側ID」「状況」で列を探して引く（名前を変えないこと）
const MAIA_OWLCAST_CHAPTERS = 6;
const MAIA_OWLCAST_HEADERS = (function () {
  const h = ['No', 'はてな側ID', '氏名', '自治体名', '状況', '完了章数'];
  for (let c = 1; c <= MAIA_OWLCAST_CHAPTERS; c++) h.push(c + '章 完了日');
  return h.concat(['受講時間合計(分)', '受講開始日', '完了日', '最終受講日', '備考', '取得日']);
})();
// Owlcast進捗の列定義（writeMaiaTable_ 用）
function maiaOwlcastColumns_() {
  return MAIA_OWLCAST_HEADERS.map(function (h) {
    if (h === 'No' || h === '完了章数' || h === '受講時間合計(分)') return ['', h, 'num'];
    if (h === 'はてな側ID' || h === '状況') return ['', h, 'center'];
    if (h === '氏名') return ['', h, 'text', 140];
    if (h === '自治体名') return ['', h, 'text', 100];
    if (h === '備考') return ['', h, 'text', 260];
    if (h === '取得日') return ['', h, 'date', 130];
    return ['', h, 'day', 100]; // 各章の完了日・受講開始日・完了日・最終受講日
  });
}

// CSV の見出し候補（見出し名で列を探す。列位置は固定しない。大文字小文字・前後の空白・BOM は無視）
// レッスン受講履歴（学習状況＞受講履歴＞レッスン受講履歴）
const MAIA_OWL_HISTORY_COLS = {
  updated: { label: '最終更新日時', names: ['最終更新日時', '最終更新日', '更新日時'], required: true },
  lessonId: { label: 'レッスンID', names: ['レッスンID', 'レッスンＩＤ'], required: false },
  lesson: { label: 'レッスン名', names: ['レッスン名', 'レッスンタイトル', 'コンテンツ名'], required: true },
  login: { label: 'ログイン名', names: ['ログイン名', '会員名', 'ユーザー名'], required: false },
  memberId: { label: '会員ID', names: ['会員ID', '会員ＩＤ', 'ユーザーID'], required: false },
  start: { label: '受講開始日時', names: ['受講開始日時', '受講開始日', '開始日時'], required: true },
  done: { label: '受講完了日時', names: ['受講完了日時', '受講完了日', '完了日時'], required: true },
  seconds: { label: '受講時間', names: ['受講時間', '学習時間'], required: true },
  status: { label: 'ステータス', names: ['ステータス', '受講ステータス', '状態'], required: true }
};
// 会員一覧（会員管理＞会員一覧）
const MAIA_OWL_MEMBER_COLS = {
  memberId: { label: '会員ID', names: ['会員ID', '会員ＩＤ', 'ID', 'ユーザーID'], required: false },
  login: { label: 'ログイン名', names: ['ログイン名', '会員名'], required: false },
  email: { label: 'メールアドレス', names: ['メールアドレス', 'メール', 'Eメール', 'E-mail', 'email', 'mail'], required: true }
};

// 参照する試験システムのスプレッドシートID（検証用コピーへの切替は Script Properties で行う。既定は本番）
function maiaSourceId_() {
  const override = PropertiesService.getScriptProperties().getProperty(MAIA_PROP_SOURCE_OVERRIDE);
  return override || MAIA_SOURCE_SS_ID;
}

// 書き込み先の共有シートのID（検証用コピーへの切替は Script Properties で行う。既定は本番の共有シート）
function maiaTargetId_() {
  const override = PropertiesService.getScriptProperties().getProperty(MAIA_PROP_TARGET_OVERRIDE);
  return override || MAIA_TARGET_SS_ID;
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
  const targetId = maiaTargetId_();
  const ss = SpreadsheetApp.openById(targetId);
  if (targetId === MAIA_TARGET_SS_ID && ss.getName() !== MAIA_TARGET_SS_NAME) {
    Logger.log('スプレッドシート名を変更: ' + ss.getName() + ' → ' + MAIA_TARGET_SS_NAME);
    ss.rename(MAIA_TARGET_SS_NAME);
  }
  ss.getSheets().forEach(function (s) {
    s.getDataRange().setFontFamily('Arial').setFontSize(10);
  });
  setupMaiaReadme_(ss);
  setupMaiaMaster_(ss);
  setupMaiaOwlcast_(ss);
  setupMaiaPasteTabs_(ss);
  syncFukuyamaToMaiaSheet();
}

// README は A1:D15 だけを書き直す。「取扱区分」（社外秘表示）の行は残し、説明と重なるときは行を挿入して16行目以降へずらす
// 表（2行目〜）は B9（最終同期日時）より上に収める（タブの行は7行まで）
function setupMaiaReadme_(ss) {
  const sh = ss.getSheetByName(MAIA_TAB_README);
  const infoStart = 9;
  const info = [
    ['最終同期日時', '（未同期）'],
    ['同期結果', ''],
    ['対象の判定', '受講生マスタの「はてな側ID」に登録された受講生（自治体は問わない）。試験システムの「受講生ID」で照合する（氏名・所属では判定しない）。各タブの自治体名は受講生マスタの自治体名を はてな側ID で引いて表示する'],
    ['注意', 'スキルチェック・認定試験・受講生一覧の3タブは同期のたびに全件置き換えます。手で書き込んだ内容は消えるため、メモは 受講生マスタ または Owlcast進捗 の備考列に書いてください。受講生マスタは同期では書き換えません。Owlcast進捗は取込のたびに作り直しますが、備考列は はてな側ID ごとに引き継ぎます'],
    ['運用の順番', '① 渡辺さん（MAIA）が受講生マスタに 氏名・自治体名・MAIA受講番号・MAIA管理ID・メールアドレスを入力（氏名・自治体名・メールアドレスは必須）\n② はてなベースが registerFromMaster を実行（はてな側ID を HB-001 からの通し番号で採番してマスタに記入し、受験URLを発行。試験システムの所属は自治体名になる）\n③ はてなベースが受験URLを送付\n④ 以降、スキルチェック・認定試験・受講生一覧は1時間ごとに自動同期。Owlcast進捗は週2回（月・木）、はてなベースが管理画面のCSVを貼り付けて集計（手順は下の「Owlcast取込の手順」）'],
    ['自治体の追加', '新しい自治体の受講生は、受講生マスタの空いている行に入力し、自治体名の列に自治体名を入れるだけです（ブックやタブの追加は不要）。プルダウンの候補にない名前もそのまま入力できます。\n候補に足すとき: 受講生マスタの自治体名の列（C列）を選び、メニューの「データ」→「データの入力規則」で既存のルール（プルダウン）を開き、「別のアイテムを追加」で自治体名を足して「完了」。足した候補は、はてなベースが書式を再設定しても残ります。\nはてな側IDは自治体をまたいだ通し番号のため、自治体ごとに番号は振り直しません。受講生一覧は見出し行のフィルタで自治体名を絞り込めます'],
    ['Owlcast取込の手順', '（はてなベースが週2回・月曜と木曜に実施）\n① Owlcast管理画面の「学習状況」→「受講履歴」→「レッスン受講履歴」で全件をCSV出力する\n② このスプレッドシートの「Owlcast取込」タブで3行目以降をすべて削除し、A3セルにCSVを見出し行ごと貼り付ける（毎回全件を貼り替える。CSVをテキストのまま貼っても読み取れる）。貼り付けたデータは集計後に自動で消えます（他の受講生の個人情報を残さないため）\n③ 試験システムのメニュー「MAIA共有進捗」→「Owlcast取込を集計する」を実行する（GASエディタからは importOwlcastHistory）。Owlcast進捗タブが作り直され、取得日に実行日時が入る。正常に終わると貼り付けたデータは自動で消え、Owlcast取込タブの2行目に「最終取込: 日時（n行→m名）」が出る（エラーで止まったときは原因確認のため残る）\n受講生が増えたとき: 会員管理→会員一覧のCSVを「Owlcast会員取込」タブのA3に貼り、メニュー「Owlcast会員IDを受講生マスタに記入する」（fillOwlcastMemberIds）を実行する。メールアドレスで突合し、受講生マスタの Owlcast会員ID の空欄だけを埋める（突合できなかった人は実行結果に出るので手で入れる）。記入が終わると貼り付けたデータは自動で消える']
  ];
  const infoEnd = infoStart + info.length - 1; // 15
  const lastRow = Math.max(sh.getLastRow(), 1);
  const colA = sh.getRange(1, 1, lastRow, 1).getDisplayValues();
  let confRow = -1;
  for (let i = 0; i < colA.length; i++) {
    if (String(colA[i][0]).trim() === '取扱区分') { confRow = i + 1; break; }
  }
  if (confRow > 0 && confRow <= infoEnd) sh.insertRowsBefore(confRow, infoEnd + 1 - confRow);
  sh.getBandings().forEach(function (b) { b.remove(); });
  sh.getRange('A1:D' + infoEnd).clear();
  const created = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd');
  sh.getRange('A1').setValue('MAIA freee会計コース 受講進捗共有（自治体ごとの受講生を1冊で管理）  作成日: ' + created + '  データソース: はてなベース試験システム（受験時に自動記録）／受講生マスタ（MAIA入力）／Owlcast管理画面（CSV貼り付け）')
    .setFontFamily('Arial').setFontSize(12).setFontWeight('bold');
  const rows = [
    ['タブ', '内容', '更新方法', '更新頻度'],
    [MAIA_TAB_MASTER, '受講生の名簿（正本）。自治体をまたいで1行1名で入力する。氏名・自治体名・メールアドレスは必須、MAIA受講番号・MAIA管理ID・備考は任意（空でよい）。はてな側ID・Owlcast会員ID以外は渡辺さん（MAIA）が入力し、はてな側IDははてなベースが試験システム登録時に、Owlcast会員ID（任意）ははてなベースが会員一覧CSVから記入する。同期では消えない', '手動入力（MAIA）／はてな側ID・Owlcast会員IDははてなベース', '随時'],
    [MAIA_TAB_ROSTER, '受講生マスタの行を同じ順で並べた集約ビュー。自治体名は受講生マスタから はてな側ID で引く。見出し行のフィルタで自治体を絞り込める。スキルチェック・認定試験・Owlcast進捗の各タブを はてな側ID で数式参照', '自動（同期時に再作成）', '1時間ごと'],
    [MAIA_TAB_SKILL, '簿記3級スキルチェックの受験結果（受験ごとに1行、受講生ID・自治体名つき、単元別の正答数つき）', '自動（試験システムから同期）', '1時間ごと'],
    [MAIA_TAB_TEST, 'freee会計 修了認定テストの受験結果（受験ごとに1行、受講生ID・自治体名つき、合格ライン75%）', '自動（試験システムから同期）', '1時間ごと'],
    [MAIA_TAB_OWLCAST, 'Owlcast（LMS）の章別の学習進捗。1行1受講生（受講生マスタで Owlcast会員ID がある人をマスタの順に並べる）。各章は完了日、受講中は「中」、未着手は空欄。氏名・自治体名は受講生マスタから はてな側ID で引く。取込のたびに作り直すが、備考は引き継ぐ。取得日は取込の実行日時', '半手動（CSV貼り付け→自動集計）', '週2回（月・木）。LMS運営会社のAIアシスト（MCP連携）受理後に日次自動化'],
    [MAIA_TAB_OWL_IMPORT + '\n' + MAIA_TAB_OWL_MEMBER, 'はてなベース用の貼り付け欄。Owlcast取込＝管理画面のレッスン受講履歴CSV（毎回全件を貼り替え）、Owlcast会員取込＝会員一覧CSV（受講生マスタの Owlcast会員ID を埋めるときだけ使う）。貼り付けたデータは集計後に自動で消えます（他の受講生の個人情報を残さないため）。エラーで止まったときは原因確認のため残る。各タブ2行目に最終取込の日時と件数が出る', '手動貼り付け（はてなベース）', 'Owlcast取込は週2回（月・木）／会員取込は受講生の追加時']
  ];
  if (rows.length + 1 >= infoStart) throw new Error('README の表が B' + infoStart + '（最終同期日時）に重なります');
  sh.getRange(2, 1, rows.length, 4).setValues(rows);
  formatMaiaTable_(sh, 2, 4, rows.length - 1);
  sh.getRange(3, 1, rows.length - 1, 4).setVerticalAlignment('middle').setWrap(true);

  const r = sh.getRange(infoStart, 1, info.length, 2);
  r.setValues(info).setFontFamily('Arial').setFontSize(10).setWrap(true).setVerticalAlignment('middle')
    .setBorder(true, true, true, true, true, true, MAIA_BORDER, SpreadsheetApp.BorderStyle.SOLID);
  sh.getRange(infoStart, 1, info.length, 1).setFontWeight('bold').setBackground(MAIA_SUBTOTAL_BG);
  sh.getRange(MAIA_LAST_SYNC_CELL).setHorizontalAlignment('left');
  // 社外秘表示が見つからなければ説明の下に書く（顧客と共有する資料のため）
  if (confRow < 0) {
    sh.getRange(infoEnd + 1, 1, 1, 2).setValues([['取扱区分', '社外秘 / Confidential（受講生の個人情報を含むため、MAIA・はてなベースの関係者以外に共有しない）']])
      .setFontFamily('Arial').setFontSize(10).setFontWeight('bold');
  }
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
  maiaMigrateMasterMunicipality_(sh);
  maiaMigrateMasterOwlcastId_(sh);
  const mc = maiaMasterColumns_(sh);
  const n = mc.width;
  const rows = MAIA_MASTER_ROWS;
  if (sh.getMaxRows() < rows + 2) sh.insertRowsAfter(sh.getMaxRows(), rows + 2 - sh.getMaxRows());
  const created = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd');
  sh.getRange('A1').setValue('受講生マスタ（全自治体共通）  ※このタブは渡辺さん（MAIA）が入力します（氏名・自治体名・MAIA受講番号・MAIA管理ID・メールアドレスなど、はてな側ID・Owlcast会員ID以外の列）。同期では消えません。はてな側IDははてなベースが試験システム登録時に、Owlcast会員IDははてなベースが会員一覧CSVから記入します  作成日: ' + created)
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
  // 入力規則: 自治体名のプルダウン（候補外の入力も可）。シート上で足された候補は残す
  const muniRange = sh.getRange(3, mc.muni + 1, rows, 1);
  const muniList = MAIA_MUNICIPALITY_DEFAULTS.slice();
  const curRule = sh.getRange(3, mc.muni + 1).getDataValidation();
  if (curRule && curRule.getCriteriaType() === SpreadsheetApp.DataValidationCriteria.VALUE_IN_LIST) {
    (curRule.getCriteriaValues()[0] || []).forEach(function (v) {
      v = String(v).trim();
      if (v && muniList.indexOf(v) < 0) muniList.push(v);
    });
  }
  muniRange.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(muniList, true).setAllowInvalid(true)
    .setHelpText('一覧から選ぶか、自治体名を直接入力してください').build());
  sh.getRange(2, mc.muni + 1).setNote('受講者の自治体名（渡辺さん入力・必須）。プルダウンに無い自治体名も直接入力できます。候補の足し方は README「自治体の追加」');
  sh.getRange(2, mc.id + 1).setNote('はてなベースが試験システム登録時に記入します（registerFromMaster）。手で書き換えないでください');
  if (mc.owl >= 0) {
    sh.getRange(2, mc.owl + 1).setNote('Owlcast（LMS）の会員ID（任意）。はてなベースが会員一覧CSVから記入します（fillOwlcastMemberIds）。Owlcast進捗はこのIDで受講履歴を突合します');
    sh.getRange(3, mc.owl + 1, rows, 1).setHorizontalAlignment('center');
  }
  // はてな側ID 列は警告つき保護（編集はできるが確認が出る）。既存の同名保護は作り直す
  const desc = '受講生マスタ はてな側ID（はてなベース記入）';
  sh.getProtections(SpreadsheetApp.ProtectionType.RANGE).forEach(function (p) {
    if (p.getDescription() === desc) p.remove();
  });
  sh.getRange(3, mc.id + 1, rows, 1).protect().setDescription(desc).setWarningOnly(true);
  for (let k = 0; k < n; k++) {
    let w = 130;
    if (k === mc.no) w = 50;
    else if (k === mc.muni) w = 110;
    else if (k === mc.email) w = 240;
    else if (k === mc.id) w = 110;
    else if (k === mc.owl) w = 120;
    else if (k === n - 1) w = 240;
    sh.setColumnWidth(k + 1, Math.max(w, maiaTextWidth_(mc.headers[k])));
  }
  sh.setFrozenRows(2);
}

// 受講生マスタに「自治体名」列が無ければ「氏名」の直後に挿入し、既存の入力行に MAIA_MUNICIPALITY_MIGRATION_VALUE を入れる（1回だけ）。
// 列の挿入なので既存の値（氏名・受講番号・管理ID・メール・はてな側ID・備考）は右へずれるだけで変わらない
function maiaMigrateMasterMunicipality_(sh) {
  const lastCol = Math.max(sh.getLastColumn(), 1);
  const headers = sh.getRange(2, 1, 1, lastCol).getDisplayValues()[0].map(function (h) { return String(h).trim(); });
  if (headers.indexOf(MAIA_MH_MUNI) >= 0) return;
  const nameIdx = headers.indexOf(MAIA_MH_NAME);
  if (nameIdx < 0) throw new Error('受講生マスタの2行目に見出し「' + MAIA_MH_NAME + '」がありません');
  const noIdx = headers.indexOf(MAIA_MH_NO);
  sh.insertColumnAfter(nameIdx + 1);
  const col = nameIdx + 2; // 1始まり
  sh.getRange(2, col).setValue(MAIA_MH_MUNI);
  const last = sh.getLastRow();
  let filled = 0;
  if (last >= 3) {
    const width = sh.getLastColumn();
    const values = sh.getRange(3, 1, last - 2, width).getDisplayValues();
    const out = values.map(function (v) {
      const has = v.some(function (x, k) { return k !== noIdx && k !== col - 1 && String(x).trim() !== ''; });
      if (has) filled++;
      return [has ? MAIA_MUNICIPALITY_MIGRATION_VALUE : ''];
    });
    sh.getRange(3, col, out.length, 1).setNumberFormat('@').setValues(out);
  }
  Logger.log('受講生マスタに「' + MAIA_MH_MUNI + '」列を追加（' + maiaColLetter_(col) + '列）。既存の入力行 ' + filled + '行に「' + MAIA_MUNICIPALITY_MIGRATION_VALUE + '」を入力');
}

// 受講生マスタに「Owlcast会員ID」列が無ければ「備考」の直前に挿入する（備考が無ければ末尾に追加）。1回だけ。
// 列の挿入なので既存の値は右へずれるだけで変わらない。新しい列は空のまま（値は fillOwlcastMemberIds か手入力で入れる）
function maiaMigrateMasterOwlcastId_(sh) {
  const lastCol = Math.max(sh.getLastColumn(), 1);
  const headers = sh.getRange(2, 1, 1, lastCol).getDisplayValues()[0].map(function (h) { return String(h).trim(); });
  if (headers.indexOf(MAIA_MH_OWL) >= 0) return;
  while (headers.length > 0 && headers[headers.length - 1] === '') headers.pop();
  const noteIdx = headers.indexOf(MAIA_MH_NOTE);
  let col;
  if (noteIdx >= 0) {
    sh.insertColumnBefore(noteIdx + 1);
    col = noteIdx + 1;
  } else {
    col = headers.length + 1;
    if (col > sh.getMaxColumns()) sh.insertColumnAfter(sh.getMaxColumns());
  }
  sh.getRange(2, col).setValue(MAIA_MH_OWL);
  Logger.log('受講生マスタに「' + MAIA_MH_OWL + '」列を追加（' + maiaColLetter_(col) + '列）');
}

// 受講生マスタの列位置（0始まり）を2行目の見出し名で探す。氏名・メールアドレス・はてな側ID が無ければエラー
// 自治体名（muni）・備考（note）・Owlcast会員ID（owl）は無ければ -1（自治体名が無いと registerFromMaster はエラーにする）
function maiaMasterColumns_(sh) {
  const lastCol = Math.max(sh.getLastColumn(), 1);
  const headers = sh.getRange(2, 1, 1, lastCol).getDisplayValues()[0].map(function (h) { return String(h).trim(); });
  while (headers.length > 0 && headers[headers.length - 1] === '') headers.pop();
  const c = {
    headers: headers,
    width: headers.length,
    no: headers.indexOf(MAIA_MH_NO),
    name: headers.indexOf(MAIA_MH_NAME),
    muni: headers.indexOf(MAIA_MH_MUNI),
    email: headers.indexOf(MAIA_MH_EMAIL),
    id: headers.indexOf(MAIA_MH_ID),
    note: headers.indexOf(MAIA_MH_NOTE),
    owl: headers.indexOf(MAIA_MH_OWL)
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

// Owlcast進捗: importOwlcastHistory が毎回作り直すタブ。setupMaiaSheet では、すでに取込方式のレイアウトなら何もしない。
// 手入力方式（旧レイアウト）のときは、手入力の値（数式以外のセル）が1つでもあれば消さないよう中止し、無ければ空の取込方式レイアウトに作り直す
function setupMaiaOwlcast_(ss) {
  let sh = ss.getSheetByName(MAIA_TAB_OWLCAST);
  if (!sh) sh = ss.insertSheet(MAIA_TAB_OWLCAST);
  const lastCol = Math.max(sh.getLastColumn(), 1);
  const cur = sh.getRange(2, 1, 1, lastCol).getDisplayValues()[0].map(function (h) { return String(h).trim(); });
  while (cur.length > 0 && cur[cur.length - 1] === '') cur.pop();
  if (cur.join('\t') === MAIA_OWLCAST_HEADERS.join('\t')) {
    Logger.log('Owlcast進捗は取込方式のレイアウト（作り直さない）');
    return;
  }
  const last = sh.getLastRow();
  if (last >= 3) {
    const range = sh.getRange(3, 1, last - 2, lastCol);
    const values = range.getValues();
    const formulas = range.getFormulas();
    const inputRows = [];
    values.forEach(function (r, i) {
      const has = r.some(function (v, k) { return v !== '' && v !== null && !formulas[i][k]; });
      if (has) inputRows.push(i + 3);
    });
    if (inputRows.length > 0) {
      throw new Error('Owlcast進捗 に手入力の行があるため作り直しを中止しました（' + inputRows.length + '行: ' + inputRows.slice(0, 10).join('・') + '行目' +
        (inputRows.length > 10 ? ' ほか' : '') + '）。値を退避してから再実行してください');
    }
  }
  maiaWriteOwlcast_(ss, sh, [], 'Owlcast 学習進捗（章別・全自治体）  データソース: Owlcast管理画面 レッスン受講履歴CSV（Owlcast取込タブ）  取込: （未取込）');
  Logger.log('Owlcast進捗を取込方式のレイアウトに作り直しました（手入力の行なし）');
}

// Owlcast進捗を全件置換で書く。rows は MAIA_OWLCAST_HEADERS の順の値。はてな側ID がある行の 氏名・自治体名 は受講生マスタを引く数式にする
function maiaWriteOwlcast_(ss, sh, rows, title) {
  sh.setFrozenColumns(0);
  sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).clearDataValidations();
  const cols = maiaOwlcastColumns_();
  const mc = maiaMasterColumns_(ss.getSheetByName(MAIA_TAB_MASTER));
  const m = "'" + MAIA_TAB_MASTER + "'!";
  const idL = maiaColLetter_(mc.id + 1), nameL = maiaColLetter_(mc.name + 1);
  const muniL = mc.muni >= 0 ? maiaColLetter_(mc.muni + 1) : null;
  writeMaiaTable_(sh, title, cols, rows, function (s, count) {
    if (count === 0) return;
    s.getRange(3, 2, count, 1).setNumberFormat('@').setValues(rows.map(function (r) { return [r[1]]; }));
    const f = rows.map(function (r, i) {
      const row = i + 3;
      if (!r[1]) return ['="' + String(r[2]).replace(/"/g, '""') + '"', '="' + String(r[3]).replace(/"/g, '""') + '"'];
      return [
        '=IFERROR(XLOOKUP($B' + row + ',' + m + '$' + idL + '$3:$' + idL + ',' + m + '$' + nameL + '$3:$' + nameL + '),"（マスタに無いID）")',
        muniL ? '=IFERROR(XLOOKUP($B' + row + ',' + m + '$' + idL + '$3:$' + idL + ',' + m + '$' + muniL + '$3:$' + muniL + ')&"","")' : ''
      ];
    });
    s.getRange(3, 3, count, 2).setFormulas(f);
  }, false);
  sh.setFrozenColumns(4);
}

// 貼り付けタブの 1行目タイトル・2行目説明（2行目の末尾に「最終取込: …」を付ける）
const MAIA_PASTE_LAST_MARK = '  最終取込: ';
const MAIA_PASTE_TEXTS = {};
MAIA_PASTE_TEXTS[MAIA_TAB_OWL_IMPORT] = [
  'Owlcast取込（レッスン受講履歴CSVの貼り付け欄・はてなベース用）  貼り付けたデータは集計後に自動で消えます（他の受講生の個人情報を残さないため）。集計結果は Owlcast進捗 タブに出ます',
  '【貼り付け方】Owlcast管理画面「学習状況」→「受講履歴」→「レッスン受講履歴」で全件をCSV出力し、このタブの3行目以降をすべて削除してから A3 セルに CSV を見出し行ごと貼り付け（毎回全件を貼り替え）。そのあと試験システムのメニュー「MAIA共有進捗」→「Owlcast取込を集計する」を実行。正常に終わると3行目以降は自動で消えます（エラーのときは残ります）'
];
MAIA_PASTE_TEXTS[MAIA_TAB_OWL_MEMBER] = [
  'Owlcast会員取込（会員一覧CSVの貼り付け欄・はてなベース用）  貼り付けたデータは集計後に自動で消えます（他の受講生の個人情報を残さないため）。受講生マスタの Owlcast会員ID を埋めるときだけ使います',
  '【貼り付け方】Owlcast管理画面「会員管理」→「会員一覧」でCSV出力し、このタブの3行目以降をすべて削除してから A3 セルに CSV を見出し行ごと貼り付け。そのあと試験システムのメニュー「MAIA共有進捗」→「Owlcast会員IDを受講生マスタに記入する」を実行（メールアドレスで突合し、空欄だけを埋める）。正常に終わると3行目以降は自動で消えます（エラーのときは残ります）'
];

// 貼り付けタブの 1・2行目を書く。lastText を渡せば2行目の末尾を「最終取込: lastText」にし、省略時は今の表示を引き継ぐ
function maiaWritePasteHeader_(sh, name, lastText) {
  const t = MAIA_PASTE_TEXTS[name];
  let last = lastText;
  if (last === undefined) {
    const a2 = String(sh.getRange('A2').getDisplayValue());
    const i = a2.indexOf(MAIA_PASTE_LAST_MARK);
    last = i >= 0 ? a2.slice(i + MAIA_PASTE_LAST_MARK.length) : '';
  }
  sh.getRange('A1').setValue(t[0]).setFontFamily('Arial').setFontSize(12).setFontWeight('bold').setFontColor('#000000').setBackground(null).setWrap(false);
  sh.getRange('A2').setValue(t[1] + (last ? MAIA_PASTE_LAST_MARK + last : '')).setFontFamily('Arial').setFontSize(10).setFontWeight('normal')
    .setFontColor('#555555').setBackground(null).setWrap(false);
}

// 「Owlcast取込」「Owlcast会員取込」タブ（貼り付け欄）を用意する。無ければ作る。
// 1行目タイトル・2行目説明だけを書き、3行目以降（貼り付けた CSV）には触れない。
// A1・A2 に CSV が貼られていた場合（タイトルが消えている）は、上書きしないよう何もしない
function setupMaiaPasteTabs_(ss) {
  [MAIA_TAB_OWL_IMPORT, MAIA_TAB_OWL_MEMBER].forEach(function (name) {
    let sh = ss.getSheetByName(name);
    if (!sh) {
      sh = ss.insertSheet(name);
      Logger.log('タブを作成: ' + name);
    }
    const a1 = String(sh.getRange('A1').getDisplayValue());
    const a2 = String(sh.getRange('A2').getDisplayValue());
    if ((a1 === '' || a1.indexOf(name + '（') === 0) && (a2 === '' || a2.indexOf('【貼り付け方】') === 0)) {
      maiaWritePasteHeader_(sh, name);
    } else {
      Logger.log(name + ' の1・2行目に貼り付けの値があるため、タイトルと説明は書きませんでした');
    }
  });
}

// 取込が正常に終わった貼り付けタブから、貼り付けたデータ（3行目以降。見出しが1・2行目に貼られていたらそこも）を消し、
// 2行目に「最終取込: 日時（n行→m名）」を書く。他コホートの氏名・メールアドレスを共有シートに残さないため
function maiaClearPasteTab_(sh, name, headerRow, lastText) {
  const maxRows = sh.getMaxRows(), maxCols = sh.getMaxColumns();
  const from = Math.min(3, Math.max(headerRow, 1));
  if (maxRows >= from) {
    const rg = sh.getRange(from, 1, maxRows - from + 1, maxCols);
    rg.clear();
    rg.clearDataValidations();
  }
  maiaWritePasteHeader_(sh, name, lastText);
  SpreadsheetApp.flush();
  return name + ' の貼り付けデータを消しました（' + from + '行目以降）';
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
  const targetId = maiaTargetId_();
  const ss = SpreadsheetApp.openById(targetId);
  if (ss.getSpreadsheetTimeZone() !== 'Asia/Tokyo') ss.setSpreadsheetTimeZone('Asia/Tokyo'); // 日時表示を日本時間に揃える

  const master = readMaiaMaster_(ss);
  const members = {}; // はてな側ID → 受講生マスタの行（自治体名を引く）
  master.forEach(function (p) { if (p.id && !members[p.id]) members[p.id] = p; });

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
  const byMuni = {};
  const muniOrder = [];
  master.forEach(function (p) {
    const k = p.muni || '自治体名なし';
    if (!byMuni[k]) { byMuni[k] = 0; muniOrder.push(k); }
    byMuni[k]++;
  });
  const muniText = muniOrder.map(function (k) { return k + ' ' + byMuni[k] + '名'; }).join('・');
  let summary = '受講生 ' + master.length + '名' + (muniText ? '（' + muniText + '）' : '') + '（うち はてな側ID未登録 ' + unregistered + '名）／スキルチェック ' + skillRows.length + '件／認定試験 ' + testRows.length + '件';
  if (sourceId !== MAIA_SOURCE_SS_ID) summary += '\n※検証用コピーを参照中（' + sourceId + '）';
  if (targetId !== MAIA_TARGET_SS_ID) summary += '\n※共有シートの検証用コピーに書き込み中';
  const lastRegister = PropertiesService.getScriptProperties().getProperty(MAIA_PROP_LAST_REGISTER);
  if (lastRegister) summary += '\n最終登録: ' + lastRegister;
  const readme = ss.getSheetByName(MAIA_TAB_README);
  readme.getRange(MAIA_LAST_SYNC_CELL).setValue(new Date()).setNumberFormat('yyyy/mm/dd hh:mm');
  readme.getRange(MAIA_SYNC_RESULT_CELL).setValue(summary);
  Logger.log('同期完了 ' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm') + ' ' + summary.replace(/\n/g, ' ／ '));
}

// 受講生マスタの入力行（No 以外のどれかの列が入っている行）を上から順に返す。参照するのは 氏名・自治体名・メールアドレス・はてな側ID・備考 だけ
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
      muni: mc.muni >= 0 ? String(v[mc.muni]).trim() : '',
      email: String(v[mc.email]).trim(),
      id: String(v[mc.id]).trim(),
      note: mc.note >= 0 ? String(v[mc.note]).trim() : '',
      owl: mc.owl >= 0 ? String(v[mc.owl]).trim() : '',
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
      if (cols[k][0] === '__muni__') return members[id].muni || '';
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
// withFilter=true なら見出し行に基本フィルタを付ける（手で付けたフィルタも付け直す）。絞り込み条件は列ごとに引き継ぐ（同期で絞り込みが外れないように）
function writeMaiaTable_(sh, title, cols, rows, formulas, withFilter) {
  const oldFilter = sh.getFilter();
  const criteria = {};
  if (oldFilter) {
    const fr = oldFilter.getRange();
    for (let c = fr.getColumn(); c <= fr.getLastColumn(); c++) {
      const cr = oldFilter.getColumnFilterCriteria(c);
      if (cr) criteria[c] = cr.copy().build();
    }
    oldFilter.remove();
  }
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
  // フィルタを付ける表は見出しのフィルタボタン分（24px）を足す。氏名など全角の値は autoResize が狭く出るため列ごとの最小幅も使う
  const filterPad = (withFilter || oldFilter) ? 24 : 0;
  for (let k = 1; k <= n; k++) {
    sh.setColumnWidth(k, Math.max(sh.getColumnWidth(k) + 20, maiaTextWidth_(cols[k - 1][1]) + filterPad, cols[k - 1][3] || 70));
  }
  titleCell.setValue(t);
  sh.setFrozenRows(2);
  if (withFilter || oldFilter) {
    const f = sh.getRange(2, 1, dataRows + 1, n).createFilter();
    Object.keys(criteria).forEach(function (c) {
      if (Number(c) <= n) f.setColumnFilterCriteria(Number(c), criteria[c]);
    });
  }
}

// 受講生一覧: 受講生マスタの行をそのまま並べ、各列は はてな側ID で他タブを引く（ID が空の人は「未登録」）
// 自治体名は登録済みなら受講生マスタから はてな側ID で引く数式、未登録の行は同期時点のマスタの値を書く。見出し行に基本フィルタ
function writeMaiaRoster_(ss, master) {
  const sh = ss.getSheetByName(MAIA_TAB_ROSTER);
  const cols = [
    ['', 'No', 'num'], ['', 'はてな側ID', 'center'], ['', '氏名', 'text', 140], ['', '自治体名', 'text', 100],
    ['', 'スキルチェック 最新レベル', 'center'], ['', '認定試験 受験回数', 'num'],
    ['', '認定試験 最新結果', 'center'], ['', '認定試験 最終受験日', 'day'], ['', 'Owlcast 状況', 'center']
  ];
  const rows = master.map(function (p, i) { return [i + 1, p.id || '未登録', p.name, p.muni, '', '', '', '', '']; });
  const title = '受講生一覧（集約ビュー・全自治体）  データソース: 受講生マスタ＋本スプレッドシートの各タブ（はてな側IDで数式参照。見出しのフィルタで自治体を絞り込めます）  最終同期: ' +
    Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm');
  const mc = maiaMasterColumns_(ss.getSheetByName(MAIA_TAB_MASTER));
  writeMaiaTable_(sh, title, cols, rows, function (s, count) {
    if (count === 0) return;
    s.getRange(3, 2, count, 3).setNumberFormat('@').setValues(rows.map(function (r) { return [r[1], r[2], r[3]]; }));
    // 列記号は各タブの列定義から求める（列の追加で位置がずれても追従する）
    const letter = function (defs, label) {
      const i = defs.map(function (d) { return d[1]; }).indexOf(label);
      if (i < 0) throw new Error('列が見つかりません: ' + label);
      return maiaColLetter_(i + 1);
    };
    const skillDefs = maiaSkillColumns_(), testDefs = maiaTestColumns_();
    const owDefs = MAIA_OWLCAST_HEADERS.map(function (h) { return ['', h]; });
    const skId = letter(skillDefs, '受講生ID'), skLv = letter(skillDefs, 'レベル');
    const teId = letter(testDefs, '受講生ID'), tePass = letter(testDefs, '合否'), teDate = letter(testDefs, '受験日時');
    const owId = letter(owDefs, 'はてな側ID'), owSt = letter(owDefs, '状況');
    const sk = "'" + MAIA_TAB_SKILL + "'!";
    const te = "'" + MAIA_TAB_TEST + "'!";
    const ow = "'" + MAIA_TAB_OWLCAST + "'!";
    const m = "'" + MAIA_TAB_MASTER + "'!";
    const mId = maiaColLetter_(mc.id + 1);
    const mMuni = mc.muni >= 0 ? maiaColLetter_(mc.muni + 1) : null;
    const rng = function (tab, col) { return tab + '$' + col + '$3:$' + col; };
    // 各タブは受験日時の昇順なので、XLOOKUP の後方検索（-1）で最新の受験を引く
    const muni = [], f = [];
    for (let i = 0; i < count; i++) {
      const r = i + 3;
      if (rows[i][1] !== '未登録' && mMuni) {
        muni.push(['=IFERROR(XLOOKUP($B' + r + ',' + rng(m, mId) + ',' + rng(m, mMuni) + ')&"","")']);
      } else {
        muni.push(['="' + String(rows[i][3]).replace(/"/g, '""') + '"']);
      }
      f.push([
        '=IFERROR(XLOOKUP($B' + r + ',' + rng(sk, skId) + ',' + rng(sk, skLv) + ',"未受験",0,-1),"未受験")',
        '=COUNTIF(' + rng(te, teId) + ',$B' + r + ')',
        '=IFERROR(XLOOKUP($B' + r + ',' + rng(te, teId) + ',' + rng(te, tePass) + ',"未受験",0,-1),"未受験")',
        '=IFERROR(XLOOKUP($B' + r + ',' + rng(te, teId) + ',' + rng(te, teDate) + ',"",0,-1),"")',
        '=IFERROR(XLOOKUP($B' + r + ',' + rng(ow, owId) + ',' + rng(ow, owSt) + ',"未取得",0,-1),"未取得")'
      ]);
    }
    s.getRange(3, 4, count, 1).setFormulas(muni);
    s.getRange(3, 5, count, 5).setFormulas(f);
  }, true);
}

// ===== 試験システムへの登録（手動実行専用。トリガーに載せない） =====
// 受講生マスタで「氏名・自治体名・メールアドレスが入っていて はてな側ID が空」の行を対象に、
// HB-連番（自治体をまたぐ通し番号）を採番し、試験システムの「トークン管理」「スキルチェック_トークン管理」の両方へ行を追加する。
// org にはその行の自治体名を入れる。自治体名が空の行はスキップしてログに出す。
// token は Code.gs の generateToken()、URL は generateUrls()／writeSkillCheckUrls() と同じ形式で書く。
// （Code.gs の generateTokens()／generateUrls() は本番ID固定の getSheet() と SpreadsheetApp.getUi() を使うため、
//   エディタ実行・検証用コピーでは呼べない。発行処理の中身＝token 生成・status=active・created・URL を同じ形で行う）
// sourceId を省略すると Script Properties の切替先（無ければ本番）を使う。
// opts.onlyNote を指定すると、備考がその値の行だけを対象にする（検証用。maiaTestRegisterVerificationRows から使う）
function registerFromMaster(sourceId, opts) {
  opts = opts || {};
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('別の処理が実行中です。少し待って再実行してください');
  try {
    const srcId = (typeof sourceId === 'string' && sourceId) ? sourceId : maiaSourceId_();
    // 共有シートの検証用コピーに書き込み中は、本番の試験システムへの登録を止める（検証データで本番に行を足さない）
    if (maiaTargetId_() !== MAIA_TARGET_SS_ID && srcId === MAIA_SOURCE_SS_ID) {
      throw new Error('共有シートの検証用コピーに切り替え中は、本番の試験システムへ登録できません（maiaTestUseProductionTarget で戻すか、試験システムも検証用コピーに切り替えてください）');
    }
    const src = SpreadsheetApp.openById(srcId);
    const ss = SpreadsheetApp.openById(maiaTargetId_());
    const masterSh = ss.getSheetByName(MAIA_TAB_MASTER);
    if (!masterSh) throw new Error('受講生マスタ タブがありません（setupMaiaSheet を実行してください）');
    if (maiaMasterColumns_(masterSh).muni < 0) throw new Error('受講生マスタに見出し「' + MAIA_MH_MUNI + '」がありません（setupMaiaSheet を実行してください）');
    const log = [];
    log.push('参照先: ' + (srcId === MAIA_SOURCE_SS_ID ? '本番' : '検証用コピー') + '（' + srcId + '）');
    if (opts.onlyNote) log.push('対象を限定: 備考が「' + opts.onlyNote + '」の行だけ');

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

    // 採番: マスタと両トークン管理シートにある HB-連番の最大値 +1（自治体をまたぐ通し番号。番号は再利用しない）
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
      if (opts.onlyNote && p.note !== opts.onlyNote) return;
      if (!p.name || !p.email) {
        log.push('対象外（氏名またはメールアドレスが空）: マスタ ' + p.row + '行目');
        return;
      }
      if (!p.muni) {
        log.push('スキップ（自治体名が空）: マスタ ' + p.row + '行目');
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
        row[2] = p.muni;           // org（C列固定）＝受講生マスタの自治体名
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
      log.push('登録: ' + id + '（' + p.muni + '）マスタ ' + p.row + '行目');
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

// ===== Owlcast 取込（手動実行専用。トリガーに載せない） =====
// 「Owlcast取込」タブに貼り付けたレッスン受講履歴CSVを読み、「Owlcast進捗」を作り直す。
// - 対象は受講生マスタで Owlcast会員ID がある受講生全員（マスタの行順）。CSV の会員はログイン名「氏名(ID:483)」の括弧内（または会員ID列）で突合
// - 章番号はレッスン名の【n章】から取る。1〜6章以外のレッスン（章番号なし等）は集計に使わない（件数をログに出す）
// - 章の完了: CSV 全体でその章に出てくるレッスン（レッスンID、無ければレッスン名）を、その受講生がすべて受講済にしたとき。完了日はその最後の完了日時
// - 状況: 1〜6章の行が無い＝未着手／6章すべて完了＝受講済／それ以外＝受講中
// - 受講時間合計(分) は1〜6章の行の受講時間の合計（秒を合算して分に四捨五入）。受講開始日＝受講開始日時の最小、最終受講日＝最終更新日時の最大
// - 備考は前回の Owlcast進捗 から はてな側ID で引き継ぐ。取得日は実行日時
// 戻り値は結果の要約（メニュー実行時にダイアログに出す）
function importOwlcastHistory() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('別の処理が実行中です。少し待って再実行してください');
  try {
    return maiaImportOwlcastCore_();
  } finally {
    lock.releaseLock();
  }
}

function maiaImportOwlcastCore_() {
  const targetId = maiaTargetId_();
  const ss = SpreadsheetApp.openById(targetId);
  if (ss.getSpreadsheetTimeZone() !== 'Asia/Tokyo') ss.setSpreadsheetTimeZone('Asia/Tokyo');
  const imp = ss.getSheetByName(MAIA_TAB_OWL_IMPORT);
  const out = ss.getSheetByName(MAIA_TAB_OWLCAST);
  if (!imp || !out) throw new Error('「' + MAIA_TAB_OWL_IMPORT + '」または「' + MAIA_TAB_OWLCAST + '」タブがありません（setupMaiaSheet を実行してください）');
  const masterSh = ss.getSheetByName(MAIA_TAB_MASTER);
  if (maiaMasterColumns_(masterSh).owl < 0) throw new Error('受講生マスタに見出し「' + MAIA_MH_OWL + '」がありません（setupMaiaSheet を実行してください）');
  // 旧レイアウト（手入力方式）に手入力の行が残っていれば、消さないよう中止する（レイアウトが取込方式なら何もしない）
  setupMaiaOwlcast_(ss);

  const t = maiaReadPasteTable_(imp, MAIA_OWL_HISTORY_COLS, MAIA_TAB_OWL_IMPORT);
  if (t.idx.memberId < 0 && t.idx.login < 0) {
    throw new Error(MAIA_TAB_OWL_IMPORT + ' に会員を示す列がありません（候補: ' + MAIA_OWL_HISTORY_COLS.login.names.concat(MAIA_OWL_HISTORY_COLS.memberId.names).join('／') +
      '）。見つかった見出し: ' + t.header.join('／'));
  }
  const log = [];
  const stats = { rows: t.rows.length, used: 0, noMember: 0, noChapter: 0, badDuration: 0 };
  const lessonsByChapter = {}; // 章 → { レッスンキー: true }（CSV 全体）
  const members = {};          // 会員ID → 集計
  t.rows.forEach(function (r) {
    const login = t.idx.login >= 0 ? String(r[t.idx.login]).trim() : '';
    const mid = t.idx.memberId >= 0 && String(r[t.idx.memberId]).trim() ? maiaNormId_(r[t.idx.memberId]) : maiaMemberIdFromLogin_(login);
    if (!mid) { stats.noMember++; return; }
    const lessonName = String(r[t.idx.lesson]).trim();
    const ch = maiaChapterNo_(lessonName);
    if (!ch || ch > MAIA_OWLCAST_CHAPTERS) { stats.noChapter++; return; }
    stats.used++;
    const lessonId = t.idx.lessonId >= 0 ? String(r[t.idx.lessonId]).trim() : '';
    const key = lessonId ? 'id:' + lessonId : 'name:' + lessonName;
    if (!lessonsByChapter[ch]) lessonsByChapter[ch] = {};
    lessonsByChapter[ch][key] = true;
    const start = maiaParseDateTime_(r[t.idx.start]);
    const done = maiaParseDateTime_(r[t.idx.done]);
    const updated = maiaParseDateTime_(r[t.idx.updated]);
    const sec = maiaParseDuration_(r[t.idx.seconds]);
    if (sec === null) { if (String(r[t.idx.seconds]).trim() !== '') stats.badDuration++; }
    const status = String(r[t.idx.status]).trim();
    if (!members[mid]) members[mid] = { lessons: {}, seconds: 0, start: null, last: null };
    const m = members[mid];
    m.seconds += sec || 0;
    if (start && (!m.start || start < m.start)) m.start = start;
    const lastAt = updated || done || start;
    if (lastAt && (!m.last || lastAt > m.last)) m.last = lastAt;
    if (!m.lessons[key]) m.lessons[key] = { ch: ch, completed: false, doneAt: null };
    const l = m.lessons[key];
    if (status === '受講済' || done) {
      l.completed = true;
      const at = done || updated;
      if (at && (!l.doneAt || at < l.doneAt)) l.doneAt = at; // 複数回受講済なら最初の完了
    }
  });

  // 前回の備考（はてな側ID → 備考）
  const notes = {};
  const oLast = out.getLastRow();
  if (oLast >= 3) {
    const oHead = out.getRange(2, 1, 1, Math.max(out.getLastColumn(), 1)).getDisplayValues()[0].map(function (h) { return String(h).trim(); });
    const oId = oHead.indexOf('はてな側ID'), oNote = oHead.indexOf('備考');
    if (oId >= 0 && oNote >= 0) {
      out.getRange(3, 1, oLast - 2, oHead.length).getValues().forEach(function (v) {
        const id = String(v[oId]).trim();
        if (id && String(v[oNote]).trim() !== '' && !(id in notes)) notes[id] = v[oNote];
      });
    }
  }

  const now = new Date();
  const master = readMaiaMaster_(ss);
  const seenOwl = {};
  const rows = [];
  const notInCsv = [];   // Owlcast会員ID はあるが CSV に記録がない受講生（はてな側ID）
  let noOwl = 0;         // Owlcast会員ID が未記入の受講生
  let started = 0, finished = 0;
  master.forEach(function (p) {
    if (!p.owl) { noOwl++; return; }
    const owl = maiaNormId_(p.owl);
    if (seenOwl[owl]) {
      log.push('スキップ（受講生マスタで Owlcast会員ID が重複。' + seenOwl[owl] + '行目と同じ）: マスタ ' + p.row + '行目');
      return;
    }
    seenOwl[owl] = p.row;
    const m = members[owl];
    const chapters = [];
    let doneCount = 0, lastDone = null;
    for (let c = 1; c <= MAIA_OWLCAST_CHAPTERS; c++) {
      const mine = m ? Object.keys(m.lessons).filter(function (k) { return m.lessons[k].ch === c; }) : [];
      if (mine.length === 0) { chapters.push(''); continue; }
      const expected = Object.keys(lessonsByChapter[c] || {});
      const complete = expected.every(function (k) { return m.lessons[k] && m.lessons[k].completed; });
      if (!complete) { chapters.push('中'); continue; }
      let at = null;
      expected.forEach(function (k) { const d = m.lessons[k].doneAt; if (d && (!at || d > at)) at = d; });
      doneCount++;
      if (at && (!lastDone || at > lastDone)) lastDone = at;
      chapters.push(at || '済');
    }
    const status = !m ? '未着手' : (doneCount === MAIA_OWLCAST_CHAPTERS ? '受講済' : '受講中');
    if (m) started++;
    else notInCsv.push(p.id || ('マスタ' + p.row + '行目'));
    if (status === '受講済') finished++;
    rows.push([rows.length + 1, p.id, p.name, p.muni, status, doneCount].concat(chapters).concat([
      m ? Math.round(m.seconds / 60) : 0,
      m && m.start ? m.start : '',
      status === '受講済' && lastDone ? lastDone : '',
      m && m.last ? m.last : '',
      p.id && (p.id in notes) ? notes[p.id] : '',
      now
    ]));
    if (!p.id) log.push('はてな側ID が空の受講生を含めました（氏名・自治体名は値で表示）: マスタ ' + p.row + '行目');
  });
  const unknown = Object.keys(members).filter(function (k) { return !seenOwl[k]; });
  if (unknown.length > 0) {
    log.push('受講生マスタに Owlcast会員ID が無い会員（集計対象外）' + unknown.length + '名: 会員ID ' +
      unknown.slice(0, 20).join('、') + (unknown.length > 20 ? ' ほか' + (unknown.length - 20) + '名' : '') + '（氏名は出しません）');
  }
  const stamp = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy/MM/dd HH:mm');
  const title = 'Owlcast 学習進捗（章別・全自治体）  データソース: Owlcast管理画面 レッスン受講履歴CSV（Owlcast取込タブ。はてなベースが週2回貼り付けて集計）  取込: ' + stamp +
    '（CSV ' + stats.rows + '行）  ※取込のたびに作り直します。備考は はてな側ID ごとに引き継ぎます';
  maiaWriteOwlcast_(ss, out, rows, title);
  SpreadsheetApp.flush();
  // ここまで正常に終わったら貼り付けたデータを消す（エラーで止まったときは原因確認のため残す）
  log.push('取込件数: 読み込んだ行 ' + stats.rows + '行／マスタに一致した受講生 ' + started + '名／一致しなかった受講生 ' + notInCsv.length + '名' +
    (notInCsv.length ? '（' + notInCsv.join('、') + '）' : '') + (noOwl ? '／Owlcast会員ID 未記入 ' + noOwl + '名（集計対象外）' : ''));
  log.push(maiaClearPasteTab_(imp, MAIA_TAB_OWL_IMPORT, t.headerRow, stamp + '（' + stats.rows + '行→' + started + '名）'));
  const summary = stamp + ' 取込: CSV ' + stats.rows + '行（集計に使用 ' + stats.used + '行・章番号なし/7章以降 ' + stats.noChapter + '行・会員IDなし ' + stats.noMember + '行' +
    (stats.badDuration ? '・受講時間を読めない ' + stats.badDuration + '行' : '') + '）／Owlcast進捗 ' + rows.length + '名（受講済 ' + finished + '名・受講中 ' + (started - finished) +
    '名・未着手 ' + (rows.length - started) + '名）／マスタ外の会員 ' + unknown.length + '名' + (targetId !== MAIA_TARGET_SS_ID ? ' ※共有シートの検証用コピー' : '');
  Logger.log(summary + (log.length ? '\n' + log.join('\n') : ''));
  return summary + (log.length ? '\n' + log.join('\n') : '');
}

// 「Owlcast会員取込」タブに貼り付けた会員一覧CSVを読み、受講生マスタの Owlcast会員ID の空欄をメールアドレスで突合して埋める（手動実行専用）。
// 既に値がある行は上書きしない（CSV と違えばログに出す）。突合できなかった受講生をログに列挙する。書くのは Owlcast会員ID のセルだけ
function fillOwlcastMemberIds() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('別の処理が実行中です。少し待って再実行してください');
  try {
    const targetId = maiaTargetId_();
    const ss = SpreadsheetApp.openById(targetId);
    const sh = ss.getSheetByName(MAIA_TAB_OWL_MEMBER);
    if (!sh) throw new Error('「' + MAIA_TAB_OWL_MEMBER + '」タブがありません（setupMaiaSheet を実行してください）');
    const masterSh = ss.getSheetByName(MAIA_TAB_MASTER);
    const mc = maiaMasterColumns_(masterSh);
    if (mc.owl < 0) throw new Error('受講生マスタに見出し「' + MAIA_MH_OWL + '」がありません（setupMaiaSheet を実行してください）');
    const t = maiaReadPasteTable_(sh, MAIA_OWL_MEMBER_COLS, MAIA_TAB_OWL_MEMBER);
    if (t.idx.memberId < 0 && t.idx.login < 0) {
      throw new Error(MAIA_TAB_OWL_MEMBER + ' に会員IDの列がありません（候補: ' + MAIA_OWL_MEMBER_COLS.memberId.names.concat(MAIA_OWL_MEMBER_COLS.login.names).join('／') +
        '）。見つかった見出し: ' + t.header.join('／'));
    }
    const byEmail = {};
    const conflict = {};
    t.rows.forEach(function (r) {
      const email = String(r[t.idx.email]).trim().toLowerCase();
      const id = t.idx.memberId >= 0 && String(r[t.idx.memberId]).trim() ? maiaNormId_(r[t.idx.memberId]) : maiaMemberIdFromLogin_(t.idx.login >= 0 ? r[t.idx.login] : '');
      if (!email || !id) return;
      if (byEmail[email] && byEmail[email] !== id) conflict[email] = true;
      byEmail[email] = id;
    });
    const master = readMaiaMaster_(ss);
    const used = {};
    master.forEach(function (p) { if (p.owl) used[maiaNormId_(p.owl)] = p.row; });
    const log = [];
    const unmatched = [];
    let written = 0, kept = 0, matched = 0;
    master.forEach(function (p) {
      const label = 'マスタ ' + p.row + '行目' + (p.id ? '（' + p.id + ' ' + p.name + '）' : '（' + p.name + '）');
      const key = p.email.toLowerCase();
      const csvId = key ? byEmail[key] : '';
      if (csvId && !conflict[key]) matched++;
      if (p.owl) {
        kept++;
        if (csvId && csvId !== maiaNormId_(p.owl)) log.push('既存の値を残しました（CSV では ' + csvId + '）: ' + label);
        return;
      }
      if (!key) { unmatched.push(label + ' メールアドレスが空'); return; }
      if (conflict[key]) { unmatched.push(label + ' CSV に同じメールアドレスの会員が複数'); return; }
      if (!csvId) { unmatched.push(label + ' CSV に同じメールアドレスの会員がいない'); return; }
      if (used[csvId]) { unmatched.push(label + ' 会員ID ' + csvId + ' はマスタ ' + used[csvId] + '行目で使用済み'); return; }
      // 書く直前にその行を読み直し、メールアドレスが変わっていない・Owlcast会員ID が空のときだけ書く（同時編集への備え）
      const now = masterSh.getRange(p.row, 1, 1, mc.width).getDisplayValues()[0];
      if (String(now[mc.email]).trim().toLowerCase() !== key || String(now[mc.owl]).trim() !== '') {
        unmatched.push(label + ' 実行中に行が変わったため書き込まず（再実行してください）');
        return;
      }
      masterSh.getRange(p.row, mc.owl + 1).setNumberFormat('@').setValue(csvId);
      used[csvId] = p.row;
      written++;
    });
    SpreadsheetApp.flush();
    const stamp = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm');
    const summary = stamp + ' 会員取込: CSV ' + t.rows.length + '行／受講生マスタ ' + master.length + '名のうち 記入 ' + written +
      '名・記入済みで変更なし ' + kept + '名・突合できず ' + unmatched.length + '名' + (targetId !== MAIA_TARGET_SS_ID ? ' ※共有シートの検証用コピー' : '');
    const detail = log.concat(unmatched.map(function (u) { return '突合できず: ' + u; }));
    // ここまで正常に終わったら貼り付けたデータを消す（エラーで止まったときは原因確認のため残す）
    const nonMatchIds = master.filter(function (p) { const k = p.email.toLowerCase(); return !(k && byEmail[k] && !conflict[k]); })
      .map(function (p) { return p.id || ('マスタ' + p.row + '行目'); });
    detail.push('取込件数: 読み込んだ行 ' + t.rows.length + '行／マスタに一致した受講生 ' + matched + '名／一致しなかった受講生 ' + nonMatchIds.length + '名' +
      (nonMatchIds.length ? '（' + nonMatchIds.join('、') + '）' : ''));
    detail.push(maiaClearPasteTab_(sh, MAIA_TAB_OWL_MEMBER, t.headerRow, stamp + '（' + t.rows.length + '行→' + matched + '名）'));
    Logger.log(summary + (detail.length ? '\n' + detail.join('\n') : ''));
    return summary + (detail.length ? '\n' + detail.join('\n') : '');
  } finally {
    lock.releaseLock();
  }
}

// 貼り付け欄を読み、見出し行（specs の見出し候補が2つ以上ある最初の行。1〜15行目から探す）とデータ行を返す。
// CSV をテキストのまま貼った場合（A列だけに「,」区切りの文字列が入った行）は、その行を CSV として分解して読む。
// 必須の見出しが無ければ、候補名と見つかった見出しを列挙したエラーで止める
function maiaReadPasteTable_(sh, specs, label) {
  const last = sh.getLastRow();
  if (last < 1) throw new Error(label + ' に CSV が貼り付けられていません');
  const width = Math.max(sh.getLastColumn(), 1);
  let raw = false;
  const grid = sh.getRange(1, 1, last, width).getDisplayValues().map(function (r) {
    const onlyA = r.every(function (v, k) { return k === 0 || String(v) === ''; });
    if (onlyA && String(r[0]).indexOf(',') >= 0) {
      raw = true;
      try { return Utilities.parseCsv(String(r[0]))[0] || []; } catch (e) { return r; }
    }
    return r;
  });
  const norm = function (h) { return String(h).replace(/^﻿/, '').replace(/^"|"$/g, '').trim().toLowerCase(); };
  const keys = Object.keys(specs);
  const findIdx = function (header) {
    const idx = {};
    keys.forEach(function (k) {
      idx[k] = -1;
      specs[k].names.some(function (n) {
        const i = header.indexOf(norm(n));
        if (i >= 0) { idx[k] = i; return true; }
        return false;
      });
    });
    return idx;
  };
  let headerRow = -1, idx = null;
  for (let i = 0; i < Math.min(grid.length, 15); i++) {
    const h = grid[i].map(norm);
    const found = findIdx(h);
    if (keys.filter(function (k) { return found[k] >= 0; }).length >= 2) { headerRow = i; idx = found; break; }
  }
  const allNames = keys.map(function (k) { return specs[k].label + '（' + specs[k].names.join('／') + '）'; }).join('、');
  if (headerRow < 0) {
    throw new Error(label + ' に CSV の見出し行が見つかりません。CSV の1行目（見出し）ごと A3 セルに貼り付けてください。探した見出し: ' + allNames);
  }
  const header = grid[headerRow].map(function (h) { return String(h).replace(/^﻿/, '').trim(); });
  while (header.length > 0 && header[header.length - 1] === '') header.pop();
  const missing = keys.filter(function (k) { return specs[k].required && idx[k] < 0; });
  if (missing.length > 0) {
    throw new Error(label + ' に見出しが見つかりません: ' + missing.map(function (k) { return '「' + specs[k].label + '」（候補: ' + specs[k].names.join('／') + '）'; }).join('、') +
      '。見つかった見出し（' + (headerRow + 1) + '行目）: ' + header.join('／'));
  }
  const rows = grid.slice(headerRow + 1).filter(function (r) { return r.some(function (v) { return String(v).trim() !== ''; }); })
    .map(function (r) { while (r.length < header.length) r.push(''); return r; });
  return { headerRow: headerRow + 1, header: header, idx: idx, rows: rows, raw: raw };
}

// 会員IDの表記を揃える（全角数字→半角、前後の空白を除く。数値として貼られた「483.0」等も 483 に）
function maiaNormId_(v) {
  let s = String(v === null || v === undefined ? '' : v).replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); }).trim();
  if (/^\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, '');
  return s;
}

// ログイン名「山本梨沙(ID:483)」から会員ID（483）を取り出す。括弧・コロンは全角も可。見つからなければ ''
function maiaMemberIdFromLogin_(login) {
  const s = maiaNormId_(login);
  const m = /[(（]\s*ID\s*[:：]\s*(\d+)\s*[)）]/i.exec(s);
  return m ? m[1] : '';
}

// レッスン名「【4章】freee会計の機能を学ぼう」から章番号を取り出す。見つからなければ 0
function maiaChapterNo_(name) {
  const s = maiaNormId_(name);
  const m = /【\s*第?\s*(\d+)\s*章/.exec(s) || /第\s*(\d+)\s*章/.exec(s) || /^\s*(\d+)\s*章/.exec(s);
  return m ? Number(m[1]) : 0;
}

// 「2026-10-03 15:14:43」「2026/10/03 15:14」などを日本時間の Date にする（空・読めない値は null）
function maiaParseDateTime_(v) {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  const s = String(v === null || v === undefined ? '' : v).trim();
  const m = /^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] || 0), Number(m[5] || 0), Number(m[6] || 0)); // スクリプトのタイムゾーン（Asia/Tokyo）
}

// 受講時間「04:48:40」（時:分:秒。貼り付けで時刻に変換された「4:48:40」も可）や「4時間48分40秒」を秒にする。空は 0、読めない値は null
function maiaParseDuration_(v) {
  const s = String(v === null || v === undefined ? '' : v).trim();
  if (s === '') return 0;
  let m = /^(\d+):(\d{1,2})(?::(\d{1,2}))?$/.exec(s);
  if (m) return m[3] !== undefined ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : Number(m[1]) * 3600 + Number(m[2]) * 60;
  m = /^(?:(\d+)\s*時間)?\s*(?:(\d+)\s*分)?\s*(?:(\d+)\s*秒)?$/.exec(s);
  if (m && (m[1] || m[2] || m[3])) return Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0);
  return null;
}

// ===== メニュー（試験システムのスプレッドシート。Code.gs の onOpen から呼ぶ。既存メニューの後ろに追加） =====
function maiaAddMenu_(ui) {
  ui.createMenu('MAIA共有進捗')
    .addItem('Owlcast取込を集計する（Owlcast進捗を作り直す）', 'maiaMenuImportOwlcastHistory')
    .addItem('Owlcast会員IDを受講生マスタに記入する', 'maiaMenuFillOwlcastMemberIds')
    .addToUi();
}

function maiaMenuImportOwlcastHistory() { maiaMenuRun_('Owlcast取込の集計', importOwlcastHistory); }
function maiaMenuFillOwlcastMemberIds() { maiaMenuRun_('Owlcast会員IDの記入', fillOwlcastMemberIds); }

function maiaMenuRun_(label, fn) {
  const ui = SpreadsheetApp.getUi();
  let msg;
  try {
    msg = label + 'が完了しました\n\n' + fn();
  } catch (e) {
    msg = label + 'を中止しました\n\n' + (e && e.message ? e.message : e);
  }
  ui.alert(msg.length > 1500 ? msg.slice(0, 1500) + '…（続きは実行ログ）' : msg);
}

// ===== 検証用（GAS エディタから手動実行） =====
// 元スプレッドシートのコピーを作り、同期・登録の参照先をコピーに切り替える
function maiaTestUseSourceCopy() {
  const name = '【検証用コピー・削除予定】試験システム ' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd_HHmm');
  const copy = SpreadsheetApp.openById(MAIA_SOURCE_SS_ID).copy(name);
  PropertiesService.getScriptProperties().setProperty(MAIA_PROP_SOURCE_OVERRIDE, copy.getId());
  Logger.log('検証用コピーを作成し参照先を切り替えました: ' + copy.getId() + ' ' + name);
}

// 検証用コピーを参照しているときだけ、受講生マスタで備考が「検証用」の行を登録する（実在の受講生の行は登録しない）
function maiaTestRegisterVerificationRows() {
  const override = PropertiesService.getScriptProperties().getProperty(MAIA_PROP_SOURCE_OVERRIDE);
  if (!override || override === MAIA_SOURCE_SS_ID) throw new Error('検証用コピーを参照していません。先に maiaTestUseSourceCopy を実行してください');
  registerFromMaster(override, { onlyNote: MAIA_TEST_NOTE });
}

// 参照先を本番に戻し、検証用コピーへの登録結果の記録を消す（コピー自体は Drive でゴミ箱へ）
function maiaTestUseProductionSource() {
  const props = PropertiesService.getScriptProperties();
  const copyId = props.getProperty(MAIA_PROP_SOURCE_OVERRIDE);
  props.deleteProperty(MAIA_PROP_SOURCE_OVERRIDE);
  // 検証用コピーへの登録記録だけを消す（本番の登録記録は README の同期結果欄に残す）
  const lastRegister = props.getProperty(MAIA_PROP_LAST_REGISTER) || '';
  if (lastRegister.indexOf('※検証用コピーへの登録') >= 0) props.deleteProperty(MAIA_PROP_LAST_REGISTER);
  Logger.log('参照先を本番に戻しました。検証用コピー（ゴミ箱へ移す）: ' + (copyId || 'なし'));
}

// 共有シートのコピーを作り、setupMaiaSheet・同期・Owlcast取込の書き込み先をコピーに切り替える（本番の共有シートに触れずに試す）
function maiaTestUseTargetCopy() {
  const name = '【検証用コピー・削除予定】MAIA共有進捗 ' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd_HHmm');
  const copy = SpreadsheetApp.openById(MAIA_TARGET_SS_ID).copy(name);
  PropertiesService.getScriptProperties().setProperty(MAIA_PROP_TARGET_OVERRIDE, copy.getId());
  Logger.log('共有シートの検証用コピーを作成し書き込み先を切り替えました: ' + copy.getId() + ' ' + name);
}

// 書き込み先を本番の共有シートに戻す（コピー自体は Drive でゴミ箱へ）
function maiaTestUseProductionTarget() {
  const props = PropertiesService.getScriptProperties();
  const copyId = props.getProperty(MAIA_PROP_TARGET_OVERRIDE);
  props.deleteProperty(MAIA_PROP_TARGET_OVERRIDE);
  Logger.log('書き込み先を本番の共有シートに戻しました。検証用コピー（ゴミ箱へ移す）: ' + (copyId || 'なし'));
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
