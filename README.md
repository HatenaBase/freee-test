# freee会計 修了認定テスト

MAIA協業のfreee研修修了者向けウェブテストシステム。

## 概要

- 100問の問題プールから50問を出題（4択・選択肢シャッフル）
- 必須問題（重要度✓）15問は毎回必ず出題、残り35問はランダム抽出
- 合格ライン: 75%（38問以上正解）
- 制限時間なし（所要時間は記録される）
- 回答選択で自動的に次の問題へ進む / 「戻る」ボタンで前の問題に戻れる
- 未回答の問題がある場合、提出前に該当問題へジャンプ可能
- 不合格でも再受験可能（出題内容は毎回変わる）。合否カウントは2回目まで
- 受験可能回数は2回まで（デフォルト）。上限到達後は開始画面に警告を出しテストを開始できない
  - 延長受講者は「トークン管理」シートの `max_attempts` 列に 3 を入れると3回目を受験できる
- 過去の受験結果を開始画面から見返せる（受験者ブラウザのlocalStorageに保存。結果画面をクリックで再表示）
- 試験中にリロード・ブラウザを閉じても途中から再開できる（回答・出題・経過時間を自動保存。24時間有効）。離脱時には確認ダイアログを表示
- 結果送信が通信エラーで失敗した場合、結果はブラウザに保留保存され、開始画面・結果画面の「再送信」ボタンから送り直せる（サーバー側で二重記録は防止）
- 個別URL（トークン）で受験者を管理
- 結果はGoogle Sheetsに自動記録
- 管理者プレビュー機能（`?admin=1`で結果記録なしに受験画面を確認可能。回数制限・ローカル保存も無効）

## URL

| リソース | URL |
|---|---|
| テストページ | https://hatenabase.github.io/freee-test/?token=xxx |
| 管理者プレビュー | https://hatenabase.github.io/freee-test/?token=xxx&admin=1 |
| スプレッドシート | https://docs.google.com/spreadsheets/d/13sA5RMm-m4TtYBH8BmE1RxI4UNmcW2O9vbiQGOVP4A4/edit |
| GAS | https://script.google.com/d/1YaPj1aoJ0CD-n5nOISj2vN5XXe8cjchAnz8rFv7kvEVFZh9wN3mFUXBv/edit |

## ファイル構成

```
freee-test/
  index.html       ... テスト画面（HTML/CSS/JS一体型）
  questions.json    ... 問題データ（100問プール、required: trueが必須問題）
  gas/
    Code.gs         ... GASスクリプト（トークン管理・結果記録）
  README.md         ... 本ファイル
```

## スプレッドシート構成

### シート「トークン管理」

| カラム | 内容 |
|---|---|
| token | 受験者固有トークン（自動生成） |
| name | 受験者名 |
| org | 所属組織 |
| status | active / 受験済 / 合格済 / disabled |
| created | トークン発行日 |
| used_at | （未使用） |
| URL | 受験者用テストURL |
| attempts | 受験回数（自動カウント） |
| latest_pct | 最新スコア（例: 75%） |
| latest_result | 最新結果（合格 / 不合格） |
| last_tested | 最終受験日時 |
| admin_URL | 管理者プレビューURL |
| max_attempts | 受験可能回数（任意。空欄・列なし・非数値なら2回。延長受講者は3を入力） |

### シート「テスト結果」

受験ごとに1行追加される履歴ログ。

| カラム | 内容 |
|---|---|
| timestamp | 受験日時 |
| token | トークン |
| name | 受験者名 |
| org | 所属組織 |
| score | 正解数 |
| total | 出題数 |
| pct | 正解率(%) |
| passed | 合格 / 不合格 |
| elapsed | 所要時間 |

## 運用手順

### トークン発行（受験者登録）

1. スプレッドシートの「トークン管理」シートに name と org を入力
2. メニュー「テスト管理 > トークンを発行する」を実行
3. メニュー「テスト管理 > テストURLを生成する」を実行
4. URL列に生成されたURLを受験者に送付

### 延長受講者に3回目の受験を許可する

1. 「トークン管理」シートに `max_attempts` 列がなければ、末尾に手動で追加する（ヘッダー名は `max_attempts`）
2. 対象受験者の行に `3` を入力する
3. 受験者がテストURLを開き直すと開始ボタンが再度表示される（列の追加・値の変更だけならGASの再デプロイは不要）

前提として `gas/Code.gs` の最新版（max_attempts対応版）がデプロイ済みである必要がある。未反映の場合はGASエディタにCode.gsを貼り付けて再デプロイする。

空欄・非数値・列そのものが無い場合は既定の2回として扱われる。attempts列の回数が上限に達した受験者には、開始画面に「試験の受験可能回数は2回までです。延長受講をされる方のみ3回目受験が可能です。」と表示され、テストを開始できない。

### 受験者が過去の結果を見返す

- 提出時に受験結果（点数・合否・全問の振り返り）が受験者のブラウザのlocalStorageへ保存される（キー: `freeeTestResults_<token>`）
- このほか、試験の途中経過が `freeeTestProgress_<token>`（24時間で失効）、送信失敗した結果が `freeeTestPending_<token>` に保存される
- 次回テストURLを開くと開始画面に「過去の受験結果」一覧が出て、クリックでその回の結果画面を再表示できる
- ブラウザ・端末を変えたり閲覧データを消すと履歴は消える。スプレッドシート側の記録（テスト結果シート）が正となる

### 管理者プレビュー

1. メニュー「テスト管理 > 管理者プレビューURLを生成する」を実行
2. admin_URL列のリンクから受験者と同じ画面を確認可能（結果は記録されない）

### トークンの状態

| status | 意味 |
|---|---|
| active | 未受験（受験可能） |
| 受験済 | 受験済み・不合格（再受験可能） |
| 合格済 | 合格（再受験可能） |
| disabled | アクセス不可（管理者が手動で設定） |

### 問題の追加・変更

`questions.json` を編集してpush。Excelからの変換は以下で実行:

```bash
python3 -c "
import openpyxl, json
wb = openpyxl.load_workbook('freeeテスト問題.xlsx')
ws = wb[wb.sheetnames[0]]
questions = []
for row in ws.iter_rows(min_row=2, max_row=ws.max_row, values_only=True):
    no, importance, q, a, b, c, d, answer, explanation, url = row
    if no is None: continue
    questions.append({
        'id': int(no),
        'required': importance is not None and str(importance).strip() != '',
        'question': str(q),
        'choices': {'A': str(a), 'B': str(b), 'C': str(c), 'D': str(d)},
        'answer': str(answer), 'explanation': str(explanation),
        'sourceUrl': str(url) if url else ''
    })
with open('questions.json', 'w', encoding='utf-8') as f:
    json.dump(questions, f, ensure_ascii=False, indent=2)
req = sum(1 for q in questions if q['required'])
print(f'{len(questions)}問を出力（必須: {req}問）')
"
```

### 出題数・合格ラインの変更

`index.html` の以下の定数を変更:

```js
const PASS_RATE = 0.75;          // 合格ライン（75%）
const NUM_QUESTIONS = 50;         // 出題数（必須問題 + ランダムで合計この数）
const DEFAULT_MAX_ATTEMPTS = 2;   // 受験可能回数の既定値（max_attempts列で個別に上書き）
```

既定の受験可能回数を全体で変える場合は、`index.html` の `DEFAULT_MAX_ATTEMPTS` と `gas/Code.gs` の `DEFAULT_MAX_ATTEMPTS` を両方合わせて変更し、GASを再デプロイする。

---

# 簿記3級 スキルチェック（boki/）

CPAラーニング（簿記3級）学習期間の終盤に受講生が受ける自己判定用テスト。設計書は `docs/specs/2026-08-13_簿記3級スキルチェック_設計.md`。

修了認定テストとは別ページ・別シート・別トークンで運用する。GASとスプレッドシートは同じものを共用し、`test_type=skillcheck` でシートを振り分ける。

## 修了認定テストとの違い

| | 修了認定テスト（`/`） | スキルチェック（`/boki/`） |
|---|---|---|
| 出題数 | 100問プールから50問 | 40問プールから20問（単元バランス固定枠） |
| 判定 | 合格 / 不合格（75%） | 合否なし。3段階のレベル判定＋単元別正答率 |
| 受験回数 | 2回まで（`max_attempts`で個別変更） | 制限なし（回数は記録のみ） |
| シート | トークン管理 / テスト結果 | スキルチェック_トークン管理 / スキルチェック_結果 |
| localStorage | `freeeTest*_<token>` | `boki_SkillCheck*_<token>` |

中断復帰（24時間）、離脱警告、送信失敗時の再送、未回答ジャンプ、管理者プレビュー、過去結果の閲覧は修了認定テストと同じ仕様。

## 出題仕様

単元7区分の固定枠で抽出する（合計20問）。各単元とも必須問題（`required: true`）を優先し、残りをランダム抽出する。

| 単元（`category` の値） | 出題数 |
|---|---|
| 商品売買・仕訳の基礎 | 3 |
| 現金・預金 | 3 |
| 債権債務・手形・電子記録債権 | 3 |
| 固定資産 | 3 |
| 給与・税金・純資産 | 2 |
| 決算整理 | 4 |
| 帳簿・証ひょう・試算表 | 2 |

`questions.json` の `category` は上表の表記と完全一致させること（不一致の単元は枠から漏れ、余り枠の補充としてのみ使われる）。プールが枠に足りない単元がある場合は、残りのプールから補充して出題数を維持する。

## レベル判定（合否ではない）

| 正答率 | 表示 | メッセージ |
|---|---|---|
| 80%以上 | 理解度: 十分 | 基礎は十分です。このまま速習freee会計コースに進みましょう。 |
| 60〜79% | 理解度: あと一歩 | 弱点単元を復習してからコースに入るとスムーズです。 |
| 60%未満 | 理解度: 復習をおすすめします | CPAラーニングの該当単元をもう一度復習することをおすすめします。 |

結果画面には単元別正答率（正答数/出題数つき）と全問の解説を表示する。1単元2〜4問のため精度が粗い旨の注記も画面に出している。

## URL

| リソース | URL |
|---|---|
| スキルチェック | https://hatenabase.github.io/freee-test/boki/?token=xxx |
| 管理者プレビュー | https://hatenabase.github.io/freee-test/boki/?token=xxx&admin=1 |

スプレッドシート・GASは修了認定テストと同じもの（上の「URL」表を参照）。

## ファイル構成

```
freee-test/
  boki/
    index.html      ... スキルチェック画面（HTML/CSS/JS一体型）
    questions.json  ... 問題データ
```

現在の `boki/questions.json` は開発用のダミー問題（単元7区分×2問＝14問）である。本番の40問（作問パイプライン検証済み）ができ次第、差し替える前提。ダミーのままでは1単元2問しか無いため、出題は20問ではなく14問（各単元2問）になる。

## スプレッドシート構成

### シート「スキルチェック_トークン管理」

修了認定テストの「トークン管理」と同じ並び。`max_attempts` は使わない（回数制限なし）。

| カラム | 内容 |
|---|---|
| token | 受講生固有トークン（自動生成） |
| name | 受講生名 |
| org | 所属組織 |
| status | active / 受験済 / disabled |
| created | トークン発行日 |
| URL | 受講生用URL |
| attempts | 受験回数（自動カウント。制限には使わない） |
| latest_pct | 最新スコア（例: 70%） |
| latest_level | 最新レベル（例: 理解度: あと一歩） |
| last_tested | 最終受験日時 |
| admin_URL | 管理者プレビューURL |

token / name / org / status / created の5列は左から順に並んでいる必要がある（A〜E列を固定で参照するため）。attempts 以降の列は見出し名で探し、無ければ自動追加される。

### シート「スキルチェック_結果」

受験ごとに1行追加される履歴ログ。見出しはメニュー「スキルチェック管理 > 結果シートの見出しを作成する」で作成できる（空のシートのときのみ）。

| カラム | 内容 |
|---|---|
| timestamp | 受験日時 |
| token | トークン |
| name | 受講生名 |
| org | 所属組織 |
| score | 正解数 |
| total | 出題数 |
| pct | 正解率(%) |
| level | レベル（A / B / C） |
| level_label | レベル表示（理解度: 十分 等） |
| elapsed | 所要時間 |
| `<単元名>_正答` / `<単元名>_出題` | 単元別の正答数・出題数（7単元×2列＝14列） |

## 運用手順

### 初期セットアップ（初回のみ）

1. スプレッドシートに「スキルチェック_トークン管理」「スキルチェック_結果」シートを作成する
2. 「スキルチェック_トークン管理」の1行目に `token / name / org / status / created` を入力する
3. `gas/Code.gs` の最新版をGASエディタに貼り付け、**新しいバージョンとしてデプロイし直す**（既存のデプロイURLを維持するため「デプロイを管理 > 編集 > バージョン: 新バージョン」で更新する。URLが変わると修了認定テスト側も止まる）
4. メニュー「スキルチェック管理 > 結果シートの見出しを作成する」を実行する

### 受講生の登録・URL配布

1. 「スキルチェック_トークン管理」に name と org を入力
2. メニュー「スキルチェック管理 > トークンを発行する」
3. メニュー「スキルチェック管理 > スキルチェックURLを生成する」
4. URL列のリンクを受講生に配布する

### 出題枠・レベル判定の変更

`boki/index.html` の以下を変更する（GASの再デプロイは不要）。

```js
const NUM_QUESTIONS = 20;      // 出題数（CATEGORY_QUOTAS の合計と一致させる）
const CATEGORY_QUOTAS = [...]; // 単元ごとの出題数
const LEVELS = [...];          // 3段階レベルの境界とメッセージ
```

単元名を変える場合は `gas/Code.gs` の `SKILL_CHECK_CATEGORIES` も同じ順序・表記に合わせ、GASを再デプロイする（結果シートの列順になる）。
