// =====================================================================
// 運営担当者向けの説明書タブを作る
//  ・「使い方」      … スライド画像版。createSlideManualSheet() を実行する
//  ・「使い方_詳細」 … 文章版。createManualSheet() を実行する
// どちらも、同名のシートが既にあれば中身を消して作り直す（他のシートには触れない）。
// 説明文は gas/Code.gs・index.html・boki/index.html・README.md の実装に合わせてある。
// コード側の仕様（列・メニュー名・定数）を変えたら、ここの文言とスライド（docs/manual/）も合わせて直すこと。
// =====================================================================
const MANUAL_SHEET = '使い方_詳細';          // 文章版
const SLIDE_MANUAL_SHEET = '使い方';         // スライド画像版
const MANUAL_UPDATED = '2026/10/01'; // 説明書の内容を最後に見直した日

// スライドPNG（docs/manual/png/slide_NN.png）を置いた Drive フォルダ（m.miwa@hatenabase.com の非公開フォルダ「freee-test_使い方スライド」）
const SLIDE_FOLDER_ID = '13UXOvqVkks73O8QntBzOXObC_FKyb73i';
const SLIDE_IMAGE_WIDTH = 960;   // シート上の表示幅（px）。高さは 16:9 で 540
const SLIDE_ROW_HEIGHT = 20;     // スライドを並べる行の高さ（px）
const SLIDE_GAP_ROWS = 2;        // スライド同士の間を空ける行数
const SLIDE_FIRST_ROW = 3;       // 1枚目を置く行（1行目は見出し）

// 「使い方」（スライド画像版）を作る。
// Drive フォルダ内の PNG をファイル名順に読み込み、縦に重ならないよう並べる。
// 初回だけ、旧版の文章タブ「使い方」が残っていて「使い方_詳細」が無ければ、それを「使い方_詳細」に改名して残す。
function createSlideManualSheet() {
  const ss = SpreadsheetApp.openById(SS_ID);

  const files = [];
  const it = DriveApp.getFolderById(SLIDE_FOLDER_ID).getFiles();
  while (it.hasNext()) {
    const f = it.next();
    if (f.getMimeType() === MimeType.PNG) files.push(f);
  }
  files.sort(function (a, b) { return a.getName() < b.getName() ? -1 : (a.getName() > b.getName() ? 1 : 0); });
  if (files.length === 0) throw new Error('Drive フォルダにPNGがありません（' + SLIDE_FOLDER_ID + '）。');

  let sheet = ss.getSheetByName(SLIDE_MANUAL_SHEET);
  if (sheet && sheet.getImages().length === 0 && !ss.getSheetByName(MANUAL_SHEET)) {
    // 旧版（文章版）の「使い方」 → 「使い方_詳細」に改名して残す
    sheet.setName(MANUAL_SHEET);
    sheet = null;
  }
  if (sheet) {
    sheet.getImages().forEach(function (img) { img.remove(); });
    sheet.clear();
    sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getMaxColumns()).breakApart();
  } else {
    sheet = ss.insertSheet(SLIDE_MANUAL_SHEET, 0);
  }

  const imageHeight = Math.round(SLIDE_IMAGE_WIDTH * 9 / 16);
  const rowsPerSlide = Math.ceil(imageHeight / SLIDE_ROW_HEIGHT) + SLIDE_GAP_ROWS;
  const lastRow = SLIDE_FIRST_ROW + rowsPerSlide * files.length;
  if (sheet.getMaxRows() < lastRow) sheet.insertRowsAfter(sheet.getMaxRows(), lastRow - sheet.getMaxRows());
  if (sheet.getMaxColumns() < 3) sheet.insertColumnsAfter(sheet.getMaxColumns(), 3 - sheet.getMaxColumns());

  sheet.setHiddenGridlines(true);
  sheet.setColumnWidth(1, 24);
  sheet.setColumnWidth(2, SLIDE_IMAGE_WIDTH);
  sheet.setRowHeight(1, 32);
  sheet.setRowHeightsForced(2, sheet.getMaxRows() - 1, SLIDE_ROW_HEIGHT);
  sheet.getRange(1, 2, 1, 2).setValues([[
    '使い方（スライド版・運営担当者向け）　更新日: ' + MANUAL_UPDATED + '　／　文章版・詳しい説明は「' + MANUAL_SHEET + '」タブ',
    '社外秘 / Confidential'
  ]]).setFontFamily('Arial').setVerticalAlignment('middle');
  sheet.getRange(1, 2).setFontSize(12).setFontWeight('bold').setFontColor('#0A2846');
  sheet.getRange(1, 3).setFontSize(9).setFontColor('#808080');

  files.forEach(function (f, i) {
    const img = sheet.insertImage(f.getBlob(), 2, SLIDE_FIRST_ROW + rowsPerSlide * i, 0, 0);
    img.setWidth(SLIDE_IMAGE_WIDTH).setHeight(imageHeight);
    img.setAltTextTitle(f.getName());
  });

  // 「使い方」を左端、「使い方_詳細」をその右隣にする
  ss.setActiveSheet(sheet);
  ss.moveActiveSheet(1);
  const detail = ss.getSheetByName(MANUAL_SHEET);
  if (detail) {
    ss.setActiveSheet(detail);
    ss.moveActiveSheet(2);
  }
  ss.setActiveSheet(sheet);

  const msg = 'シート「' + SLIDE_MANUAL_SHEET + '」にスライド' + files.length + '枚を貼りました。';
  Logger.log(msg);
  try {
    SpreadsheetApp.getUi().alert(msg);
  } catch (err) {
    // GASエディタから直接実行したときは getUi() が使えないため、ログ出力のみ
  }
}

function createManualSheet() {
  const ss = SpreadsheetApp.openById(SS_ID);
  let sheet = ss.getSheetByName(MANUAL_SHEET);
  if (sheet) {
    sheet.clear();
    sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getMaxColumns()).breakApart();
    sheet.getBandings().forEach(function (b) { b.remove(); });
    sheet.clearConditionalFormatRules();
  } else {
    sheet = ss.insertSheet(MANUAL_SHEET);
  }
  // 「使い方」（スライド版）があればその右隣、無ければ左端に置く
  const slideSheet = ss.getSheetByName(SLIDE_MANUAL_SHEET);
  ss.setActiveSheet(sheet);
  ss.moveActiveSheet(slideSheet ? slideSheet.getIndex() + 1 : 1);

  const entries = manualEntries();
  const values = [
    ['使い方_詳細（文章版）', '社外秘 / Confidential'],
    ['更新日: ' + MANUAL_UPDATED + ' ／ 対象: 運営担当者（はてなベース・MAIA事務局） ／ 内容はシステムの実装に基づく ／ 画面つきの概要は「' + SLIDE_MANUAL_SHEET + '」タブ', ''],
    ['項目', '説明']
  ];
  const kinds = ['title', 'meta', 'header'];
  entries.forEach(function (e) {
    if (e.length === 1) {
      values.push([e[0], '']);
      kinds.push('section');
    } else {
      values.push([e[0], e[1]]);
      kinds.push('body');
    }
  });

  const numRows = values.length;
  const all = sheet.getRange(1, 1, numRows, 2);
  all.setNumberFormat('@').setValues(values);
  all.setFontFamily('Arial').setFontSize(10).setFontColor('#000000');

  // 背景・文字色・太字を行の種類ごとにまとめて設定する（本文はセクションごとに白始まりのゼブラ）
  const backgrounds = [];
  const fontColors = [];
  const fontWeights = [];
  let zebra = 0;
  kinds.forEach(function (kind) {
    if (kind === 'header' || kind === 'section') {
      backgrounds.push(['#1a3a5c', '#1a3a5c']);
      fontColors.push(['#ffffff', '#ffffff']);
      fontWeights.push(['bold', 'bold']);
      zebra = 0;
    } else if (kind === 'body') {
      const bg = (zebra % 2 === 0) ? '#ffffff' : '#f2f6fa';
      backgrounds.push([bg, bg]);
      fontColors.push(['#000000', '#000000']);
      fontWeights.push(['bold', 'normal']);
      zebra++;
    } else {
      backgrounds.push(['#ffffff', '#ffffff']);
      fontColors.push(['#000000', '#000000']);
      fontWeights.push([kind === 'title' ? 'bold' : 'normal', 'normal']);
    }
  });
  all.setBackgrounds(backgrounds).setFontColors(fontColors).setFontWeights(fontWeights);

  // タイトル行・更新日行
  sheet.getRange(1, 1).setFontSize(12);
  sheet.getRange(1, 2).setFontSize(9).setFontColor('#808080').setHorizontalAlignment('right');

  // 表本体（見出し行〜最終行）
  const table = sheet.getRange(3, 1, numRows - 2, 2);
  table.setBorder(true, true, true, true, true, true, '#c0c0c0', SpreadsheetApp.BorderStyle.SOLID);
  table.setWrap(true).setVerticalAlignment('top').setHorizontalAlignment('left');
  sheet.getRange(3, 1, 1, 2).setHorizontalAlignment('center').setVerticalAlignment('middle');

  sheet.setColumnWidth(1, 220);
  sheet.setColumnWidth(2, 760);
  sheet.setFrozenRows(1);

  const msg = 'シート「' + MANUAL_SHEET + '」を作成しました（' + (numRows - 3) + '行）。';
  Logger.log(msg);
  try {
    SpreadsheetApp.getUi().alert(msg);
  } catch (err) {
    // GASエディタから直接実行したときは getUi() が使えないため、ログ出力のみ
  }
}

// 1要素 = セクション見出し、2要素 = [項目, 説明]
function manualEntries() {
  const tokenSheet = 'トークン管理';
  const resultSheet = 'テスト結果';
  const scTokenSheet = SKILL_CHECK_TOKEN_SHEET;
  const scResultSheet = SKILL_CHECK_RESULT_SHEET;
  const mailSheet = MAIL_TEMPLATE_SHEET;
  const maxA = DEFAULT_MAX_ATTEMPTS;

  return [
    // ---------------------------------------------------------------
    ['1. このシートでできること'],
    ['概要',
      'freee会計 修了認定テストと簿記3級スキルチェックの受験者管理台帳です。\n'
      + '受験者ごとの個別URL（トークン）の発行、受験結果の自動記録、受験用URLの案内メール一斉送信ができます。\n'
      + '・修了認定テスト: https://hatenabase.github.io/freee-test/?token=…\n'
      + '・簿記3級スキルチェック: https://hatenabase.github.io/freee-test/boki/?token=…'],
    ['操作の入口',
      '画面上部のメニュー「テスト管理」（修了認定テスト用）と「スキルチェック管理」（スキルチェック用）から操作します。\n'
      + 'メニューはスプレッドシートを開いたときに追加されます。'],
    ['全体の流れ',
      '1. トークン管理シートに受験者の name・org・email を入力する\n'
      + '2. メニューからトークンを発行する\n'
      + '3. メニューから受験用URLを生成する\n'
      + '4. 案内メールを一斉送信する（URLを個別に送ってもよい）\n'
      + '5. 受験者が受験すると、結果シートに1行追加され、トークン管理シートの受験回数・最新点数が自動で更新される\n'
      + '6. 結果を確認し、必要に応じて受験回数の上限を個別に増やす'],
    ['2つのテストの違い',
      '修了認定テスト: 50問出題・正答率75%以上で合格・受験回数の上限あり（既定' + maxA + '回）\n'
      + 'スキルチェック: 20問出題・合否なし（3段階の理解度判定）・受験回数の制限なし\n'
      + 'シート・トークン・URLは別々です。修了認定テストのトークンはスキルチェックでは使えません（逆も同じ）。'],

    // ---------------------------------------------------------------
    ['2. タブの役割'],
    [SLIDE_MANUAL_SHEET, '画面のスクリーンショットつきの説明書（スライド版）。作り直すと内容がリセットされるため、ここには追記しないでください。'],
    [MANUAL_SHEET, 'この説明書（文章版）。細かい仕様やトラブルの対処はこちらに書いています。作り直すと内容がリセットされるため、ここには追記しないでください。'],
    [tokenSheet, '修了認定テストの受験者台帳（1人1行）。受験者の追加・トークン発行・URL生成・案内メール送信をここで行います。'],
    [resultSheet, '修了認定テストの受験履歴。受験1回ごとに1行が自動で追加されます。手入力は不要です。'],
    [scTokenSheet, '簿記3級スキルチェックの受験者台帳（1人1行）。使い方は「' + tokenSheet + '」と同じです。'],
    [scResultSheet, 'スキルチェックの受験履歴。受験1回ごとに1行が自動で追加されます。'],
    [mailSheet, '案内メールの件名・本文・送信者名・送信元アドレス。2つのテストで共用します。'],
    ['上記以外', 'システムが読み書きするタブは上記だけです。'],

    // ---------------------------------------------------------------
    ['3. 「' + tokenSheet + '」の列'],
    ['列の位置について',
      'A〜E列（token / name / org / status / created）は位置で読み書きするため、この並びで固定です。\n'
      + 'F列以降は1行目の見出し名で探すため順番は問いません。必要な列が無ければメニュー実行時や受験時に末尾へ自動で追加されます。\n'
      + '【手入力】= 運営担当者が入力 ／ 【自動】= システムが記録（手で書き換えない）'],
    ['token【自動】', '受験者ごとのトークン（英数字12桁）。「トークンを発行する」で入ります。受験用URLの末尾になります。'],
    ['name【手入力】', '受験者名。案内メールの {{name}} に入ります。'],
    ['org【手入力】', '所属組織。案内メールの {{org}} に入ります。'],
    ['status【自動／一部手入力】',
      'active = トークン発行済み・未受験\n'
      + '受験済 = 受験した（最新の結果が不合格）\n'
      + '合格済 = 受験した（最新の結果が合格）\n'
      + 'disabled = URLを無効にする（手入力）。受験者がURLを開くと「無効」の画面になります。\n'
      + 'active・受験済・合格済は受験のたびに自動で上書きされます。'],
    ['created【自動】', 'トークンの発行日時。'],
    ['used_at', '使っていません。'],
    ['URL【自動】', '受験者用のテストURL。「テストURLを生成する」で入ります。'],
    ['attempts【自動】', '受験回数。受験結果が届くたびに1増えます。'],
    ['latest_score', '見出しだけ自動で作られ、値は記録されません（使っていません）。'],
    ['latest_pct【自動】', '最新の正答率（例: 76%）。'],
    ['latest_result【自動】', '最新の合否（合格 / 不合格）。'],
    ['last_tested【自動】', '最後に受験した日時。'],
    ['admin_URL【自動】', '管理者プレビュー用URL。「管理者プレビューURLを生成する」で入ります。受験者には渡しません。'],
    ['max_attempts【手入力・任意】', '受験回数の上限を受験者ごとに変える列（6章参照）。空欄なら既定の' + maxA + '回です。'],
    ['email【手入力】', '受験者のメールアドレス（1セルに1アドレス）。案内メールの宛先になります。'],
    ['mail_sent【自動】', '案内メールを送った日時（日本時間）。送信に成功した行だけに入ります。'],
    ['「' + scTokenSheet + '」の違い',
      '列の並びと意味は同じです。違いは次のとおりです。\n'
      + '・status は active / 受験済 / disabled のみ（合否がないため合格済はない）\n'
      + '・latest_result の代わりに latest_level（最新の理解度。例: 理解度: あと一歩）\n'
      + '・max_attempts・latest_score は使わない（受験回数の制限なし）'],
    ['結果シートの列',
      '「' + resultSheet + '」: timestamp（受験日時）/ token / name / org / score（正解数）/ total（出題数）/ pct（正答率）/ passed（合格・不合格）/ elapsed（所要時間）\n'
      + '「' + scResultSheet + '」: 上記の passed の代わりに level（A/B/C）と level_label（理解度の表示）、その後ろに7単元それぞれの「単元名_正答」「単元名_出題」の列が続きます。'],

    // ---------------------------------------------------------------
    ['4. 受験者の追加〜URL発行'],
    ['修了認定テストの手順',
      '1. 「' + tokenSheet + '」の最終行の下に name と org を入力する（メールで送るなら email も）\n'
      + '2. メニュー「テスト管理 > トークンを発行する」を実行する\n'
      + '   → name が入っていて token が空の行にだけトークンが入り、status が active、created に発行日時が入ります\n'
      + '3. メニュー「テスト管理 > テストURLを生成する」を実行する\n'
      + '   → token がある行の URL 列にURLが入ります\n'
      + '4. 5章の手順で案内メールを送る（URL列のURLを個別に送ってもかまいません）'],
    ['スキルチェックの手順',
      '1. 「' + scTokenSheet + '」に name と org（必要なら email）を入力する\n'
      + '2. メニュー「スキルチェック管理 > トークンを発行する」\n'
      + '3. メニュー「スキルチェック管理 > スキルチェックURLを生成する」\n'
      + '4. 案内メールを送る\n'
      + '初回のみ、「' + scResultSheet + '」が空の状態でメニュー「スキルチェック管理 > 結果シートの見出しを作成する」を実行して見出しを作ります。'],
    ['管理者プレビュー',
      'メニュー「テスト管理 > 管理者プレビューURLを生成する」（スキルチェックは「スキルチェック管理 > 管理者プレビューURLを生成する」）で admin_URL 列にURLが入ります。\n'
      + '受験者と同じ画面を確認できます。結果は記録されず、受験回数の制限もかかりません。'],
    ['受験を止めたいとき',
      '対象行の status を disabled に書き換えます。再開するときは active に戻します。'],

    // ---------------------------------------------------------------
    ['5. 案内メールの一斉送信'],
    ['準備（初回のみ）',
      'メニュー「テスト管理 > メール文面シートを作成する」で「' + mailSheet + '」シートを作ります。初期の件名・本文が入った状態で作られます。\n'
      + '既にある場合は上書きせずに中止します。スキルチェックもこのシートを共用します。'],
    ['「' + mailSheet + '」の書き方',
      'A列 = キー、B列 = 値。使うキーは次の6つです。\n'
      + '・' + MAIL_KEY_FROM + ': 差出人アドレス。空欄ならメニューを実行した人のアドレスで送ります\n'
      + '・' + MAIL_KEY_SENDER_NAME + ': 差出人の表示名。空欄なら「' + DEFAULT_MAIL_SENDER_NAME + '」\n'
      + '・修了認定_件名 / 修了認定_本文\n'
      + '・スキルチェック_件名 / スキルチェック_本文\n'
      + '本文はプレーンテキストです（HTMLは使えません）。件名・本文が空欄だと送信できません。'],
    ['差し込み',
      '件名・本文に次の文字を書くと、受験者ごとに置き換わります。\n'
      + '{{name}} → name 列 ／ {{org}} → org 列 ／ {{url}} → URL 列\n'
      + 'これ以外の {{…}} は置き換わらず、そのまま送られます。'],
    ['送信の手順',
      '1. 送る相手の email 列にアドレスを入力する\n'
      + '2. URL が空の行があれば、先にURLを生成する（4章）\n'
      + '3. 「' + tokenSheet + '」（スキルチェックは「' + scTokenSheet + '」）を開き、送りたい受験者の行を選択する。行内のどのセルを選んでもかまいません。複数行の範囲選択や Cmd（Windows は Ctrl）＋クリックの飛び飛びの選択もできます。1行目（見出し）は対象外です\n'
      + '4. メニュー「テスト管理 > 選択行に案内メールを送信する」（スキルチェックは「スキルチェック管理 > 選択行に案内メールを送信する」）を実行する\n'
      + '5. 確認画面で、送信件数・送信元・再送信の件数・宛先（先頭' + MAIL_LIST_PREVIEW_LIMIT + '件まで表示）・スキップされる行を確認し、「OK」で送信する。「いいえ」なら何も送りません\n'
      + '6. 「成功N件 / 失敗M件 / スキップK件」の結果が表示され、送信に成功した行の mail_sent に送信日時が入ります'],
    ['スキップされる行',
      '次の行は送信されず、確認画面と結果に理由つきで表示されます。mail_sent も変わりません。\n'
      + '・email が空欄\n'
      + '・メールアドレスの形式が不正（1セルに複数のアドレスを入れた場合も含む）\n'
      + '・URL が空欄（URL未生成）\n'
      + 'name・email・URL がすべて空の行は、何も表示せずに無視します。'],
    ['再送信',
      'mail_sent に日時が入っている行も送信の対象になります（スキップされません）。確認画面では宛先に「（再送信）」と付き、再送信の件数が表示されます。\n'
      + '送ると mail_sent は今回の日時で上書きされ、前回の日時は残りません。二重送信を避けたいときは、選択前に mail_sent を確認してください。'],
    ['送信上限',
      '送信前に、メニューを実行した人のGoogleアカウントの1日の残り送信可能数を確認します（アカウントの種類により1日100通または1,500通）。\n'
      + '送信対象の件数に足りないときは1通も送らずに中止します。翌日に実行するか、行を分けて送ってください。\n'
      + '送信中に一部の宛先で失敗しても、残りの宛先への送信は続けます。'],
    ['送信元アドレス（エイリアス）',
      'メールは、メニューを実行した人のGmailから送信されます。\n'
      + '「' + MAIL_KEY_FROM + '」に別のアドレス（例: MAIA事務局のアドレス）を入れる場合は、実行する人のGmailでそのアドレスを登録しておく必要があります。\n'
      + '登録方法: Gmailの 設定 > アカウント > 他のメールアドレスを追加 → 届いた確認メールで認証する\n'
      + '未登録のまま実行すると、確認画面の前で中止し、使えるアドレスの一覧を表示します（1通も送りません）。'],
    ['初めて送信する人',
      '初回の実行時にGoogleの承認画面が表示されます。Gmailでの送信を許可しないと送信できません。'],

    // ---------------------------------------------------------------
    ['6. 結果の見方'],
    ['修了認定テストの出題と合格ライン',
      '100問の問題から50問を出題します（重要問題15問は毎回出題、残り35問はランダム）。出題内容は受験のたびに変わります。\n'
      + '正答率75%以上（50問中38問以上の正解）で合格です。'],
    ['受験結果の確認',
      '最新の状況は「' + tokenSheet + '」の attempts（受験回数）・latest_pct・latest_result・last_tested で確認します。\n'
      + '1回ごとの履歴は「' + resultSheet + '」で確認します。status と latest_result は最新の受験結果で上書きされるため、合格した人が再受験して不合格になると「受験済」に戻ります。過去の合否は「' + resultSheet + '」を見てください。'],
    ['受験回数の上限',
      '既定は1人' + maxA + '回までです。attempts が上限に達すると、受験者がURLを開いたときに「受験可能回数に達しています」と表示され、テストを開始できません。\n'
      + '受験者の画面には「合否にカウントされるのは' + maxA + '回目の結果までです」と案内しています。'],
    ['上限を個別に増やす',
      '1. 「' + tokenSheet + '」に max_attempts 列が無ければ、1行目の空いている列に見出し max_attempts を入力する\n'
      + '2. 対象受験者の行に上限回数（例: 3）を入力する\n'
      + '3. 受験者がURLを開き直すと反映されます\n'
      + '空欄・0以下・数字以外の値は既定の' + maxA + '回として扱われます。'],
    ['再受験',
      '不合格でも合格済でも、上限回数の範囲内なら同じURLで再受験できます。'],
    ['受験中の中断・送信失敗',
      '受験者が途中でブラウザを閉じても、24時間以内なら同じURLから続きを再開できます。\n'
      + '結果の送信に失敗した場合は、受験者の画面の「再送信」ボタンで送り直せます。同じ結果が二重に記録されることはありません。'],
    ['スキルチェックの結果',
      '40問の問題から20問を、7つの単元ごとに決まった数ずつ出題します。合否はなく、正答率で3段階の理解度を表示します。\n'
      + '・80%以上: 理解度: 十分（level A）\n'
      + '・60〜79%: 理解度: あと一歩（level B）\n'
      + '・60%未満: 理解度: 復習をおすすめします（level C）\n'
      + '「' + scResultSheet + '」には単元ごとの正答数・出題数も記録されます。受験回数の制限はありません（attempts は記録のみ）。'],

    // ---------------------------------------------------------------
    ['7. よくあるトラブルと対処'],
    ['「送信元アドレス「…」はこのアカウントで使えません。」',
      '「' + mailSheet + '」の ' + MAIL_KEY_FROM + ' が、実行した人のGmailに登録されていません。5章「送信元アドレス」の方法で登録するか、' + MAIL_KEY_FROM + ' を空欄にして実行者のアドレスで送ります。1通も送信されていません。'],
    ['「シート「' + tokenSheet + '」を開き、送信したい受講者の行を選択してから実行してください。」',
      '別のシートを開いたままメニューを実行しています。対象のシートを開き、行を選択してから実行し直してください。修了認定テストは「テスト管理」、スキルチェックは「スキルチェック管理」のメニューを使います。'],
    ['「送信対象の行が選択されていません。」', '1行目（見出し）だけ、またはデータの無い行だけを選んでいます。2行目以降の受験者の行を選んでください。'],
    ['「送信できる行がありません。」', '選んだ行がすべてスキップ対象です。表示された理由（email が空欄 など）を直してから実行し直してください。'],
    ['スキップ理由「email が空欄」', 'その行の email 列にアドレスを入力してから送ります。'],
    ['スキップ理由「メールアドレスの形式が不正」', 'アドレスの誤字、全角文字、空白、1セルに複数のアドレスが入っていないかを確認します。'],
    ['スキップ理由「URL が空欄（URL未生成）」', 'メニューの「テストURLを生成する」（スキルチェックは「スキルチェックURLを生成する」）を実行してから送ります。トークンが無い行は、先に「トークンを発行する」を実行します。'],
    ['「… に URL 列がありません。先にURLを生成してください。」', 'まだ一度もURLを生成していないか、URL 列の見出し名が変わっています。URLを生成してから実行します。'],
    ['「シート「' + mailSheet + '」がありません。」', 'メニュー「テスト管理 > メール文面シートを作成する」を実行します。'],
    ['「… の 修了認定_件名 または 修了認定_本文 が空欄です。」', '「' + mailSheet + '」の該当キーのB列に件名・本文を入れます（スキルチェックは スキルチェック_件名 / スキルチェック_本文）。キー名がずれていても同じ表示になります。'],
    ['「本日の残り送信可能数が不足しています」', '1日の送信上限に達しています。1通も送信されていません。翌日に実行するか、選ぶ行を減らします。'],
    ['結果の【失敗】に「送信は成功しましたが mail_sent の記録に失敗しました」', 'メールは届いています。再送せず、必要なら mail_sent に送信日時を手で入力してください。'],
    ['「0件のトークンを発行しました。」', 'name が空の行、または token が既に入っている行にはトークンを発行しません。name を入力したか確認します。'],
    ['受験者から「このテストURLは無効か、既に使用済みです」（スキルチェックは「このスキルチェックURLは無効です」）',
      '次を確認します。\n'
      + '・status が disabled になっていないか\n'
      + '・送ったURLの token がシートの token と一致しているか（URLが途中で切れていないか、token を書き換えていないか）\n'
      + '・修了認定テストとスキルチェックのURLを取り違えていないか'],
    ['受験者から「受験可能回数に達しています」', '受験回数が上限に達しています。追加で受験させる場合は、6章「上限を個別に増やす」の手順で max_attempts を設定します。'],
    ['「シート「' + scTokenSheet + '」がありません。先に作成してください。」', 'スキルチェック用のシートが無いか、シート名が違います。シート名を「' + scTokenSheet + '」（または「' + scResultSheet + '」）と完全に一致させます。'],
    ['「シート「' + scResultSheet + '」には既にデータがあります。見出しは変更していません。」', '見出しは作成済みです。対処は不要です。'],
    ['「シート「' + mailSheet + '」は既にあります。上書きしていません。」', '既存の「' + mailSheet + '」を編集して使います。'],
    ['日時が9時間ずれて表示される',
      'このスプレッドシートのタイムゾーン設定がGMT（グリニッジ標準時）のため、created・last_tested・受験日時は日本時間より9時間前の時刻で表示されます。mail_sent は日本時間で記録しています。'],

    // ---------------------------------------------------------------
    ['8. やってはいけないこと'],
    ['A〜E列の並べ替え・列の挿入・削除',
      '「' + tokenSheet + '」「' + scTokenSheet + '」の token / name / org / status / created は列の位置で読み書きしています。A〜E列の左や間に列を入れたり並べ替えたりすると、トークンの確認や受験結果の記録が別の列に書き込まれて壊れます。'],
    ['1行目の見出し名の変更・列の削除',
      'URL・attempts・latest_pct・latest_result・latest_level・last_tested・admin_URL・max_attempts・email・mail_sent は見出し名で列を探しています。名前を変えたり列を消したりすると、同じ名前の空の列が末尾に新しく作られて記録が分かれたり、max_attempts が無視されて既定の' + maxA + '回に戻ったり、メールが送れなくなったりします。'],
    ['token の書き換え・削除',
      '配布済みのURLが使えなくなり、受験者には「無効」の画面が出ます。token を消して発行し直すと新しいURLになり、古いURLは使えません。'],
    ['シート名の変更',
      '「' + tokenSheet + '」「' + resultSheet + '」「' + scTokenSheet + '」「' + scResultSheet + '」「' + mailSheet + '」はシート名で探しています。名前を変えると、トークンの確認・結果の記録・メール送信が動かなくなります。'],
    ['結果シートの列の挿入・並べ替え',
      '「' + resultSheet + '」「' + scResultSheet + '」には決まった列順で1行ずつ追記しています。列を入れたり並べ替えたりすると、値が違う列に記録されます。'],
    ['「' + mailSheet + '」のキー名の変更・空行の挿入',
      'A列のキー名を変えると、その件名・本文が読まれません。キーの間に空行を入れると、空行より下のキーは読まれません。キーと下の注記の間の空行は詰めないでください（注記がキーとして読まれます）。']
  ];
}
