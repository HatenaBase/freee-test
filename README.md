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
