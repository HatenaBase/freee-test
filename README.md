# freee会計 修了認定テスト

MAIA協業のfreee研修修了者向けウェブテストシステム。

## 概要

- 73問の4択テスト（選択肢シャッフル）
- 合格ライン: 75%（55問以上正解）
- 個別URL（トークン）で受験者を管理
- 結果はGoogle Sheetsに自動記録

## セットアップ手順

### 1. Google Sheetsを作成

スプレッドシートを新規作成し、以下の2シートを用意:

**シート「トークン管理」のヘッダー（1行目）:**
| token | name | org | status | created | used_at | URL |
|-------|------|-----|--------|---------|---------|-----|

**シート「テスト結果」のヘッダー（1行目）:**
| timestamp | token | name | org | score | total | pct | passed | elapsed |
|-----------|-------|------|-----|-------|-------|-----|--------|---------|

### 2. GASをデプロイ

1. スプレッドシートの「拡張機能 > Apps Script」を開く
2. `gas/Code.gs` の内容を貼り付け
3. `SS_ID` をスプレッドシートのIDに置き換え
4. `BASE_URL` をGitHub PagesのURL（例: `https://hatenabase.github.io/freee-test/`）に置き換え
5. 「デプロイ > 新しいデプロイ」→ タイプ: ウェブアプリ
   - 実行ユーザー: 自分
   - アクセス: 全員
6. デプロイURLをコピー

### 3. index.htmlにGAS URLを設定

`index.html` 内の `%%GAS_URL%%` をデプロイURLに置き換え:
```js
const GAS_URL = 'https://script.google.com/macros/s/xxxxx/exec';
```

### 4. GitHub Pagesで公開

```bash
cd /Users/mamo/freee-test
git init
git add .
git commit -m "freee会計 修了認定テスト 初版"
gh repo create HatenaBase/freee-test --public --source=. --push
# GitHub Pages を有効化（Settings > Pages > main branch）
```

### 5. トークン発行（受験者登録）

1. スプレッドシートの「トークン管理」シートに name と org を入力
2. メニュー「テスト管理 > トークンを発行する」を実行
3. メニュー「テスト管理 > テストURLを生成する」を実行
4. URL列に生成されたURLを受験者に送付

## ファイル構成

```
freee-test/
  index.html       ... テスト画面（HTML/CSS/JS一体型）
  questions.json    ... 問題データ（73問）
  gas/
    Code.gs         ... GASスクリプト（トークン管理・結果記録）
  README.md         ... 本ファイル
```

## 運用

- トークンは1回限り有効（受験完了後に `used` に変更）
- 再試験は新しいトークンを発行する
- テスト結果は「テスト結果」シートに自動記録
- 問題の追加・変更は `questions.json` を編集してpush
