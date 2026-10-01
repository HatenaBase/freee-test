# -*- coding: utf-8 -*-
"""「使い方」タブ用スライド（16:9・1280x720）の HTML を生成し、PNG に書き出す。

  python3 docs/manual/build_slides.py          # slides.html を生成して png/ に書き出す
  python3 docs/manual/build_slides.py --html   # slides.html だけ生成

スクショは img/s_*.png（実画面から見出し行とテスト行だけを切り出したもの）。
内容は gas/Code.gs と gas/Manual.gs（「使い方_詳細」タブ）を正とする。
"""
import os
import subprocess
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
IMG = os.path.join(HERE, 'img')
UPDATED = '2026/10/01'

NAVY = '#0A2846'
CYAN = '#39BDD7'
ORANGE = '#E8892D'
TEXT = '#2A5772'
SLATE = '#8BA3B2'
LIGHT = '#EDF1F6'
PALE = '#E2F5F9'
CONF = '#5E7893'
RED = '#E0322B'  # スクショ注釈（赤枠・番号）専用


def shot(name, view=None, scale=1.0, marks=(), extra_style=''):
    """スクショを view=(x, y, w, h)（元画像のpx）で切り出して scale 倍で表示し、赤枠と番号を重ねる。
    marks: (x, y, w, h, 番号 or '', 番号の位置 'tl'|'tr'|'l'|'r')"""
    path = os.path.join(IMG, name)
    iw, ih = Image.open(path).size
    vx, vy, vw, vh = view or (0, 0, iw, ih)
    s = scale
    out = ['<div class="shot" style="width:%dpx;height:%dpx;%s"><div class="clip">' % (round(vw * s), round(vh * s), extra_style)]
    out.append('<img src="img/%s" style="left:%dpx;top:%dpx;width:%dpx;height:%dpx"></div>'
               % (name, round(-vx * s), round(-vy * s), round(iw * s), round(ih * s)))
    for m in marks:
        x, y, w, h, num = m[:5]
        pos = m[5] if len(m) > 5 else 'tl'
        out.append('<div class="mk" style="left:%dpx;top:%dpx;width:%dpx;height:%dpx">'
                   % (round((x - vx) * s), round((y - vy) * s), round(w * s), round(h * s)))
        if num != '':
            out.append('<span class="badge b%s">%s</span>' % (pos, num))
        out.append('</div>')
    out.append('</div>')
    return ''.join(out)


def num(n):
    return '<span class="n">%s</span>' % n


def page(i, label, title, body, total):
    return '''
<section class="slide" id="s%d">
  <div class="hd"><div class="label">%s</div><div class="rule"><i></i></div><h1>%s</h1></div>
  <img class="logo" src="img/logo.png" alt="">
  <div class="body">%s</div>
  <div class="ft"><span>©2026 Hatenabase,inc.</span><span class="conf">社外秘 / Confidential</span><span class="pg">%d / %d</span></div>
</section>''' % (i, label, title, body, i, total)


def build():
    S = []

    # 1. 表紙 ------------------------------------------------------------
    cover = '''
<section class="slide cover" id="s1">
  <img class="bg" src="img/cover_bg.png" alt="">
  <div class="to">運営担当者向け（はてなベース・MAIA事務局）</div>
  <div class="ttl">freee会計 修了認定テスト管理シート<br>使い方ガイド</div>
  <div class="co">はてなベース株式会社</div>
  <div class="stamp">社外秘 / Confidential</div>
  <div class="copy">©2026 Hatenabase,inc.</div>
</section>'''

    # 2. 全体の流れ -------------------------------------------------------
    steps = [
        ('受験者を入力', '「トークン管理」に<br>name・org・email', '手入力'),
        ('トークンを発行', 'メニュー<br>「トークンを発行する」', 'メニュー'),
        ('受験用URLを生成', 'メニュー<br>「テストURLを生成する」', 'メニュー'),
        ('案内メールを送信', '行を選んで<br>「選択行に案内メールを送信する」', 'メニュー'),
        ('受験者が受験', '結果シートに1行追加<br>受験回数・点数も更新', '自動'),
        ('結果を確認', '必要なら受験回数の<br>上限を個別に増やす', '確認'),
    ]
    flow = '<div class="flow">'
    for k, (t, d, tag) in enumerate(steps, 1):
        cls = 'card last' if k == len(steps) else ('card auto' if tag == '自動' else 'card')
        flow += '<div class="%s"><div class="no">%02d</div><div class="tag">%s</div><div class="t">%s</div><div class="d">%s</div></div>' % (cls, k, tag, t, d)
        if k < len(steps):
            flow += '<div class="arr">▶</div>'
    flow += '</div>'
    compare = '''
<table class="cmp">
  <tr><th></th><th>修了認定テスト</th><th>簿記3級スキルチェック</th></tr>
  <tr><td>メニュー</td><td>「テスト管理」</td><td>「スキルチェック管理」</td></tr>
  <tr><td>出題・判定</td><td>50問・正答率75%以上で合格</td><td>20問・合否なし（理解度を3段階で表示）</td></tr>
  <tr><td>受験回数</td><td>上限あり（既定2回・個別に変更可）</td><td>制限なし</td></tr>
  <tr><td>使うタブ</td><td>トークン管理 ／ テスト結果</td><td>スキルチェック_トークン管理 ／ スキルチェック_結果</td></tr>
</table>
<p class="note">2つのテストはシート・トークン・URLが別々です。修了認定テストのURLはスキルチェックでは使えません（逆も同じ）。</p>'''
    S.append(('OVERVIEW', '全体の流れ', flow + compare))

    # 3. タブの役割 -------------------------------------------------------
    tabs = [
        ('使い方', 'このスライド版の説明書', 'guide'),
        ('使い方_詳細', '文章版の説明書。困ったとき・細かい仕様はここ', 'guide'),
        ('トークン管理', '修了認定テストの受験者台帳（1人1行）。追加・発行・URL・メール送信をここで', 'main'),
        ('テスト結果', '修了認定テストの受験履歴。受験1回ごとに1行、自動で追加', 'auto'),
        ('スキルチェック_トークン管理', 'スキルチェックの受験者台帳。使い方は「トークン管理」と同じ', 'main'),
        ('スキルチェック_結果', 'スキルチェックの受験履歴。自動で追加', 'auto'),
        ('メール文面', '案内メールの件名・本文・送信者名。2つのテストで共用', 'main'),
    ]
    rows = ''.join('<div class="trow"><div class="tab %s">%s</div><div class="tdesc">%s</div></div>' % (c, n, d) for n, d, c in tabs)
    legend = '''<div class="legend"><span><i class="sw main"></i>運営担当者が入力・操作する</span><span><i class="sw auto"></i>システムが自動で書く（手入力しない）</span><span><i class="sw guide"></i>説明書（作り直すと内容がリセットされるので追記しない）</span></div>'''
    S.append(('TABS', 'タブの役割', '<div class="tabs">' + rows + '</div>' + legend
              + '<p class="note">システムが読み書きするのは上の表のタブだけです。シート名は変えないでください。</p>'))

    # 4. メニュー ---------------------------------------------------------
    m_test = shot('s_menu_test.png', (740, 30, 500, 251), 1.1, [
        (862, 42, 96, 25, '', 'tl'),
        (866, 79, 352, 24, '1', 'l'), (866, 115, 352, 24, '2', 'l'), (866, 151, 352, 24, '3', 'l'),
        (866, 206, 352, 24, '4', 'l'), (866, 242, 352, 24, '5', 'l')])
    m_skill = shot('s_menu_skill.png', (740, 30, 500, 251), 1.1, [
        (861, 79, 352, 24, '1', 'l'), (861, 115, 352, 24, '2', 'l'), (861, 151, 352, 24, '3', 'l'),
        (861, 187, 352, 24, '4', 'l'), (861, 242, 352, 24, '5', 'l')])
    body = '''
<div class="two">
  <div class="col"><h2>メニュー「テスト管理」<small>修了認定テスト用</small></h2>%s
    <ol class="nl">
      <li>%sトークンを発行する</li><li>%sテストURLを生成する</li><li>%s管理者プレビューURLを生成する</li>
      <li>%s選択行に案内メールを送信する</li><li>%sメール文面シートを作成する<em>初回のみ</em></li>
    </ol></div>
  <div class="col"><h2>メニュー「スキルチェック管理」<small>スキルチェック用</small></h2>%s
    <ol class="nl">
      <li>%sトークンを発行する</li><li>%sスキルチェックURLを生成する</li><li>%s管理者プレビューURLを生成する</li>
      <li>%s結果シートの見出しを作成する<em>初回のみ</em></li><li>%s選択行に案内メールを送信する</li>
    </ol></div>
</div>
<p class="note">メニューはスプレッドシートを開くと画面上部に追加されます。画面が狭いと「…」の中に隠れることがあります。</p>''' % (
        m_test, num(1), num(2), num(3), num(4), num(5), m_skill, num(1), num(2), num(3), num(4), num(5))
    S.append(('MENU', '操作はメニュー2つから', body))

    # 5. トークン管理の列 -------------------------------------------------
    left = shot('s_token_select.png', (0, 30, 1440, 121), 0.82, [
        (165, 56, 228, 95, 'name・org', 'top')], 'margin:30px 0 44px')
    right = shot('s_token_right.png', (0, 0, 1100, 121), 0.82, [
        (711, 26, 226, 95, 'max_attempts・email', 'top')])
    cols = '''
<div class="coltbl">
  <div><b class="in">手入力</b> name（受験者名）／ org（所属）／ email（宛先・1セル1アドレス）／ max_attempts（受験回数の上限・任意）／ status を disabled にする（URLを止める）</div>
  <div><b class="au">自動</b> token ／ status ／ created ／ URL ／ attempts（受験回数）／ latest_pct ／ latest_result ／ last_tested ／ admin_URL ／ mail_sent</div>
</div>
<p class="note warn">A〜E列（token / name / org / status / created）は位置で読み書きしています。列の挿入・並べ替えはしないでください。F列以降は見出し名で探すので、足りない列は自動で追加されます。</p>'''
    S.append(('TOKEN SHEET', '「トークン管理」の列　赤枠が手入力する列', left + right + cols))

    # 6. 受験者の追加〜URL発行 -------------------------------------------
    sh_rows = shot('s_token_select.png', (0, 30, 700, 121), 0.86, [
        (165, 56, 228, 95, '1', 'l')])
    sh_menu = shot('s_menu_test.png', (840, 60, 400, 120), 0.86, [
        (866, 79, 352, 24, '2', 'r'), (866, 115, 352, 24, '3', 'r')])
    body = '''
<div class="split">
  <div class="steps">
    <div class="st">%s<div><b>受験者を入力</b><p>「トークン管理」の最終行の下に name と org を入力。メールで送るなら email も。</p></div></div>
    <div class="st">%s<div><b>テスト管理 &gt; トークンを発行する</b><p>name があり token が空の行にだけ、token・status（active）・created が入ります。</p></div></div>
    <div class="st">%s<div><b>テスト管理 &gt; テストURLを生成する</b><p>token がある行の URL 列に受験用URLが入ります。</p></div></div>
    <div class="st">%s<div><b>案内メールを送る</b><p>次のページの手順で送ります。URL列のURLを個別に送ってもかまいません。</p></div></div>
  </div>
  <div class="shots">%s%s</div>
</div>
<div class="tips">
  <div><b>スキルチェック</b>「スキルチェック_トークン管理」で同じ手順。メニューは「スキルチェック管理」。初回だけ「結果シートの見出しを作成する」を実行</div>
  <div><b>受験を止めたい</b>その行の status を disabled に書き換える（再開は active に戻す）</div>
  <div><b>画面を確認したい</b>「管理者プレビューURLを生成する」→ admin_URL。結果は記録されず回数制限もかからない</div>
</div>''' % (num(1), num(2), num(3), num(4), sh_rows, sh_menu)
    S.append(('STEP 1', '受験者の追加〜受験用URLの発行', body))

    # 7. 案内メール：準備 ------------------------------------------------
    sh_mail = shot('s_mail_sheet.png', (0, 40, 960, 520), 0.78, [
        (52, 80, 181, 477, '1', 'l'), (233, 104, 300, 28, '2', 'r'),
        (233, 160, 110, 36, '3', 'r'), (233, 286, 80, 20, '3', 'r')])
    body = '''
<div class="split r">
  <div class="shots">%s</div>
  <div class="steps">
    <div class="pre"><b>初回のみ</b> メニュー「テスト管理 &gt; メール文面シートを作成する」で作ります。既にあるときは上書きせずに止まります。</div>
    <div class="st">%s<div><b>A列 = キー、B列 = 値</b><p>送信元アドレス ／ 送信者名 ／ 修了認定_件名 ／ 修了認定_本文 ／ スキルチェック_件名 ／ スキルチェック_本文</p></div></div>
    <div class="st">%s<div><b>送信者名・送信元アドレス</b><p>送信者名が空欄なら「MAIA 事務局」。送信元アドレスが空欄なら、メニューを実行した人のアドレスで送ります。</p></div></div>
    <div class="st">%s<div><b>差し込み</b><p>{{name}}・{{org}}・{{url}} が受験者ごとに置き換わります。これ以外の {{…}} はそのまま送られます。</p></div></div>
    <p class="note s">本文はプレーンテキスト。件名・本文が空欄だと送れません。別アドレスから送るときは、実行する人のGmailに登録が必要です（設定 &gt; アカウント &gt; 他のメールアドレスを追加）。</p>
  </div>
</div>''' % (sh_mail, num(1), num(2), num(3))
    S.append(('STEP 2', '案内メールの準備　「メール文面」タブ', body))

    # 8. 案内メール：送信手順 --------------------------------------------
    sh_sel = shot('s_token_select.png', (0, 30, 700, 121), 0.95, [
        (0, 80, 51, 71, '2', 'l')])
    sh_send = shot('s_menu_test.png', (840, 30, 400, 251), 1.1, [
        (866, 206, 352, 24, '3', 'r')])
    body = '''
<div class="split">
  <div class="steps">
    <div class="st">%s<div><b>宛先とURLを確認</b><p>送る相手の email を入力。URL が空の行は先にURLを生成しておきます。</p></div></div>
    <div class="st">%s<div><b>送りたい受験者の行を選ぶ</b><p>行のどのセルを選んでもOK。範囲選択や Cmd（Windows は Ctrl）＋クリックで複数行を選べます。1行目（見出し）は対象外です。</p></div></div>
    <div class="st">%s<div><b>テスト管理 &gt; 選択行に案内メールを送信する</b><p>スキルチェックは「スキルチェック_トークン管理」で「スキルチェック管理」の同じ項目を使います。</p></div></div>
    <div class="st">%s<div><b>確認画面で内容を見て「OK」</b><p>次のページで説明します。</p></div></div>
  </div>
  <div class="shots">%s%s</div>
</div>''' % (num(1), num(2), num(3), num(4), sh_sel, sh_send)
    S.append(('STEP 3', '案内メールを送る', body))

    # 9. 確認画面 ---------------------------------------------------------
    sh_dlg = shot('s_confirm_dialog.png', None, 1.0, [
        (25, 80, 380, 50, '1', 'l'), (25, 130, 300, 22, '2', 'l'), (25, 175, 480, 45, '3', 'l'),
        (25, 242, 330, 70, '4', 'l'), (350, 380, 168, 60, '5', 'r')])
    body = '''
<div class="split r">
  <div class="shots dlg">%s</div>
  <div class="steps">
    <div class="st">%s<div><b>送信件数と送信元</b><p>何件送るか、どの名前・アドレスから送るか。</p></div></div>
    <div class="st">%s<div><b>再送信の件数</b><p>mail_sent に日時がある行（前に送った行）の数。</p></div></div>
    <div class="st">%s<div><b>宛先</b><p>行番号・名前・アドレス（先頭20件まで）。再送信の行には「（再送信）」。</p></div></div>
    <div class="st">%s<div><b>スキップされる行</b><p>送らない行と理由（この例は email が空欄の2行）。</p></div></div>
    <div class="st">%s<div><b>「OK」で送信／「いいえ」で中止</b><p>送信後に「成功N件 / 失敗M件 / スキップK件」が出て、成功した行の mail_sent に送信日時が入ります。「いいえ」なら1通も送りません。</p></div></div>
  </div>
</div>''' % (sh_dlg, num(1), num(2), num(3), num(4), num(5))
    S.append(('STEP 3', '確認画面の見方', body))

    # 10. スキップ・再送信・上限 ----------------------------------------
    body = '''
<div class="cards3">
  <div class="c3"><h3>スキップされる行</h3>
    <ul><li>email が空欄</li><li>メールアドレスの形式が不正（1セルに複数のアドレスを入れた場合も）</li><li>URL が空欄（URL未生成）</li></ul>
    <p>確認画面と結果に理由つきで表示され、mail_sent は変わりません。name・email・URL がすべて空の行は表示せずに無視します。</p></div>
  <div class="c3 em"><h3>再送信に注意</h3>
    <ul><li>mail_sent に日時が入っている行も送信対象になる（スキップされない）</li><li>確認画面の宛先に「（再送信）」と付く</li><li>送ると mail_sent は今回の日時で上書き</li></ul>
    <p>二重送信を避けたいときは、行を選ぶ前に mail_sent 列を確認します。</p></div>
  <div class="c3"><h3>1日の送信上限</h3>
    <ul><li>実行した人のGoogleアカウントで1日100通または1,500通（アカウントの種類による）</li><li>残りが足りないときは1通も送らずに中止</li><li>一部の宛先で失敗しても、残りへの送信は続ける</li></ul>
    <p>翌日に実行するか、選ぶ行を分けて送ります。</p></div>
</div>
<p class="note">初めて送信する人は、最初の実行時にGoogleの承認画面が出ます。Gmailでの送信を許可してください。</p>'''
    S.append(('STEP 3', 'スキップ・再送信・送信上限', body))

    # 11. 結果の見方 ------------------------------------------------------
    sh_tr = shot('s_token_right.png', (0, 0, 820, 121), 0.86, [
        (142, 26, 113, 95, '1', 'tl'), (369, 26, 341, 95, '2', 'tl')], 'margin-bottom:14px')
    sh_res = shot('s_result_sheet.png', None, 0.86, [(0, 26, 1075, 24, '3', 'l')])
    body = '''
<div class="split w">
  <div class="shots">%s%s</div>
  <div class="steps">
    <div class="st">%s<div><b>attempts = 受験回数</b><p>受験結果が届くたびに1増えます。</p></div></div>
    <div class="st">%s<div><b>最新の結果</b><p>latest_pct（正答率）・latest_result（合格／不合格）・last_tested（受験日時）。</p></div></div>
    <div class="st">%s<div><b>「テスト結果」タブ＝全履歴</b><p>受験1回ごとに1行。正解数・出題数・正答率・合否・所要時間。</p></div></div>
  </div>
</div>
<div class="tips">
  <div><b>合格ライン</b>100問から50問を出題（重要15問は毎回）。正答率75%%以上（50問中38問以上）で合格</div>
  <div><b>上書きに注意</b>status と latest_result は最新の受験で上書き。合格後に再受験して不合格だと「受験済」に戻る。過去の合否は「テスト結果」で見る</div>
</div>''' % (sh_tr, sh_res, num(1), num(2), num(3))
    S.append(('RESULT', '結果の見方（修了認定テスト）', body))

    # 12. 受験回数の上限 --------------------------------------------------
    sh_max = shot('s_token_right.png', (596, 0, 456, 121), 1.15, [(711, 26, 112, 95, '', 'tl')])
    body = '''
<div class="split">
  <div class="steps">
    <div class="pre"><b>既定は1人2回まで</b> 上限に達すると、受験者がURLを開いたときに「受験可能回数に達しています」と表示され、開始できません。</div>
    <div class="st">%s<div><b>max_attempts 列を用意</b><p>無ければ1行目の空いている列に見出し「max_attempts」を入力します。</p></div></div>
    <div class="st">%s<div><b>対象の行に上限回数を入力</b><p>例: 3 と入れると3回まで受験できます。</p></div></div>
    <div class="st">%s<div><b>受験者がURLを開き直すと反映</b><p>空欄・0以下・数字以外は既定の2回として扱われます。</p></div></div>
  </div>
  <div class="shots">%s
    <div class="tips v">
      <div><b>再受験</b>上限の範囲内なら同じURLで受けられる（不合格でも合格済でも）</div>
      <div><b>途中で閉じた</b>24時間以内なら同じURLから続きを再開できる</div>
      <div><b>送信に失敗</b>受験者の画面の「再送信」ボタンで送り直せる（二重には記録されない）</div>
    </div>
  </div>
</div>''' % (num(1), num(2), num(3), sh_max)
    S.append(('RESULT', '受験回数の上限を個別に増やす', body))

    # 13. スキルチェックの結果 -------------------------------------------
    sh_sk = shot('s_skill_result.png', (0, 0, 1440, 74), 0.82, [(847, 26, 227, 24, '', 'tl'), (1188, 26, 252, 24, '', 'tl')])
    body = '''%s
<div class="lv">
  <div class="lvc a"><span>A</span><b>理解度: 十分</b><p>正答率80%%以上</p></div>
  <div class="lvc b"><span>B</span><b>理解度: あと一歩</b><p>60〜79%%</p></div>
  <div class="lvc c"><span>C</span><b>理解度: 復習をおすすめします</b><p>60%%未満</p></div>
</div>
<div class="tips">
  <div><b>出題</b>40問の問題から20問を、7つの単元ごとに決まった数ずつ出題。合否はなし</div>
  <div><b>記録</b>「スキルチェック_結果」に level（A/B/C）・level_label と単元ごとの「単元名_正答」「単元名_出題」列。台帳には latest_level</div>
  <div><b>回数</b>制限なし（attempts は記録だけ）。status は active / 受験済 / disabled のみ</div>
</div>''' % sh_sk
    S.append(('RESULT', '結果の見方（簿記3級スキルチェック）　赤枠が理解度と単元別の列', body))

    # 14. 困ったとき -----------------------------------------------------
    tr = [
        ('「送信元アドレス「…」はこのアカウントで使えません。」', '実行者のGmailにそのアドレスが未登録。登録するか、送信元アドレスを空欄にする（1通も送っていない）'),
        ('「シート「トークン管理」を開き、…選択してから実行してください。」', '別のタブで実行している。対象タブを開き、行を選んでから実行し直す'),
        ('「送信できる行がありません。」', '選んだ行が全部スキップ対象。表示された理由（email が空欄 など）を直す'),
        ('「本日の残り送信可能数が不足しています」', '1日の上限に達した。翌日に実行するか、選ぶ行を減らす（1通も送っていない）'),
        ('「0件のトークンを発行しました。」', 'name が空、または token が既に入っている行には発行しない'),
        ('受験者から「このテストURLは無効か、既に使用済みです」', 'status が disabled でないか、URLの token がシートと一致するか、2つのテストのURLを取り違えていないか'),
        ('受験者から「受験可能回数に達しています」', '上限に到達。追加で受けさせるなら max_attempts を設定'),
        ('日時が9時間ずれている', 'シートのタイムゾーンがGMTのため。created・last_tested・受験日時は日本時間の9時間前で表示（mail_sent は日本時間）'),
    ]
    rows = ''.join('<tr><td>%s</td><td>%s</td></tr>' % r for r in tr)
    body = '<table class="tr"><tr><th>表示・症状</th><th>対処</th></tr>%s</table>' \
           '<div class="goto">ここにない表示や細かい仕様は、<b>「使い方_詳細」タブの「7. よくあるトラブルと対処」</b>を見てください。</div>' % rows
    S.append(('TROUBLE', '困ったとき', body))

    # 15. やってはいけないこと -------------------------------------------
    ng = [
        ('A〜E列の並べ替え・列の挿入', 'token / name / org / status / created は位置で読み書き。ずれると受験結果が別の列に書かれて壊れる'),
        ('1行目の見出し名の変更・列の削除', 'URL・attempts・email・mail_sent・max_attempts などは見出し名で探す。空の列が増えて記録が分かれたり、メールが送れなくなる'),
        ('token の書き換え・削除', '配布済みのURLが使えなくなる。消して発行し直すと新しいURLになり、古いURLは無効'),
        ('シート名の変更', 'トークン管理・テスト結果・スキルチェック_トークン管理・スキルチェック_結果・メール文面は名前で探す'),
        ('結果シートの列の挿入・並べ替え', '決まった列順で1行ずつ追記している。値が違う列に記録される'),
        ('メール文面のキー名変更・空行の挿入', 'キー名を変えると読まれない。キーの間の空行より下は読まれない（注記との間の空行は詰めない）'),
    ]
    items = ''.join('<div class="ng"><span class="x">✕</span><div><b>%s</b><p>%s</p></div></div>' % r for r in ng)
    S.append(('DON\'T', 'やってはいけないこと', '<div class="ngs">' + items + '</div>'))

    total = len(S) + 1
    pages = [cover] + [page(i + 2, lab, ttl, body, total) for i, (lab, ttl, body) in enumerate(S)]
    html = TEMPLATE.replace('{{SLIDES}}', '\n'.join(pages))
    for k, v in dict(NAVY=NAVY, CYAN=CYAN, ORANGE=ORANGE, TEXT=TEXT, SLATE=SLATE, LIGHT=LIGHT, PALE=PALE, CONF=CONF, RED=RED).items():
        html = html.replace('{{%s}}' % k, v)
    with open(os.path.join(HERE, 'slides.html'), 'w', encoding='utf-8') as f:
        f.write(html)
    return total


TEMPLATE = r'''<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><title>使い方ガイド</title>
<style>
@font-face{font-family:ZK;src:local('Zen Kaku Gothic New'),local('ZenKakuGothicNew-Regular');font-weight:400}
@font-face{font-family:ZK;src:local('Zen Kaku Gothic New Bold'),local('ZenKakuGothicNew-Bold');font-weight:700}
*{box-sizing:border-box;margin:0;padding:0}
body{background:#888;font-family:ZK,'Zen Kaku Gothic New','Hiragino Sans',sans-serif;color:{{TEXT}}}
.slide{width:1280px;height:720px;background:#fff;position:relative;overflow:hidden;margin:0 auto 24px}
body.one .slide{display:none;margin:0}
body.one .slide.on{display:block}
body.one{background:#fff}
.hd{position:absolute;left:57px;top:30px;right:200px}
.label{font-size:12.5px;letter-spacing:.18em;color:{{SLATE}};font-weight:700}
.rule{height:2px;background:{{SLATE}};margin:6px 0 10px;width:1000px}
.rule i{display:block;height:2px;width:40%;background:{{CYAN}}}
h1{font-size:30px;color:{{NAVY}};font-weight:700;letter-spacing:.06em}
.logo{position:absolute;right:48px;top:26px;height:34px}
.body{position:absolute;left:57px;right:57px;top:118px;bottom:46px;display:flex;flex-direction:column;justify-content:center}
.ft{position:absolute;left:57px;right:57px;bottom:16px;font-size:11.5px;color:{{CONF}};display:flex;gap:18px}
.ft span:first-child{flex:1}
.note{font-size:16px;margin-top:12px;line-height:1.5}
.note.s{font-size:14.5px;margin-top:0}
.note.warn{border-left:4px solid {{ORANGE}};padding-left:10px}
.n{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;background:{{RED}};color:#fff;font-weight:700;font-size:15px;flex:none}
/* screenshot */
.shot{position:relative;flex:none}
.clip{position:absolute;inset:0;overflow:hidden;border:1px solid #C7D0DA;border-radius:4px;background:#fff}
.shot img{position:absolute;max-width:none}
.mk{position:absolute;border:3px solid {{RED}};border-radius:3px}
.badge{position:absolute;background:{{RED}};color:#fff;font-weight:700;font-size:15px;min-width:26px;height:26px;border-radius:13px;display:flex;align-items:center;justify-content:center;padding:0 7px;white-space:nowrap}
.badge.btop{left:-3px;top:-31px;border-radius:4px}
.badge.btl{left:-14px;top:-15px}.badge.btr{right:-10px;top:-16px}
.badge.bl{left:-16px;top:50%;margin-top:-13px}.badge.br{right:-16px;top:50%;margin-top:-13px}
/* cover */
.cover .bg{position:absolute;inset:0;width:1280px;height:720px}
.cover .to{position:absolute;left:45px;top:300px;font-size:21px;font-weight:700;color:{{NAVY}};letter-spacing:.12em}
.cover .ttl{position:absolute;left:45px;top:345px;font-size:37px;font-weight:700;color:{{NAVY}};line-height:1.45;letter-spacing:.06em}
.cover .co{position:absolute;left:76px;top:470px;font-size:15px;font-weight:700;color:{{NAVY}};letter-spacing:.1em}
.cover .stamp{position:absolute;right:19px;bottom:58px;border:1.5px solid #fff;color:#fff;font-weight:700;font-size:17px;padding:5px 12px}
.cover .copy{position:absolute;right:19px;bottom:26px;color:#fff;font-size:12px}
/* flow */
.flow{display:flex;align-items:stretch;gap:6px;margin-top:6px}
.card{flex:1;background:{{LIGHT}};border-radius:6px;padding:12px 12px 14px;position:relative}
.card.auto{background:{{PALE}}}
.card.last{background:{{NAVY}};color:#fff}
.card .no{font-size:22px;font-weight:700;color:{{CYAN}}}
.card .tag{position:absolute;right:10px;top:14px;font-size:12px;border:1px solid {{SLATE}};border-radius:10px;padding:1px 8px}
.card.last .tag{border-color:#fff}
.card .t{font-size:18px;font-weight:700;color:{{NAVY}};margin:6px 0 6px}
.card.last .t{color:#fff}
.card .d{font-size:14.5px;line-height:1.5}
.arr{color:{{CYAN}};align-self:center;font-size:16px}
table.cmp{width:100%;border-collapse:collapse;margin-top:22px;font-size:16px}
.cmp th{background:{{TEXT}};color:#fff;padding:7px 12px;text-align:left;font-weight:700}
.cmp th:first-child{background:#fff}
.cmp td{padding:7px 12px;border-bottom:1px solid #C7D0DA}
.cmp td:first-child{font-weight:700;color:{{NAVY}};width:150px;background:{{LIGHT}}}
/* tabs */
.tabs{display:flex;flex-direction:column;gap:7px}
.trow{display:flex;align-items:center;gap:18px}
.tab{width:300px;padding:9px 16px;border-radius:8px 8px 0 0;font-weight:700;font-size:17px;border-bottom:3px solid}
.tab.main{background:#fff;border:1.5px solid {{NAVY}};border-bottom-width:3px;color:{{NAVY}}}
.tab.auto{background:{{PALE}};border-color:{{CYAN}};color:{{NAVY}}}
.tab.guide{background:{{LIGHT}};border-color:{{SLATE}};color:{{TEXT}}}
.tdesc{font-size:17px}
.legend{display:flex;gap:26px;font-size:14.5px;margin-top:16px}
.sw{display:inline-block;width:16px;height:16px;vertical-align:-2px;margin-right:6px;border:1.5px solid}
.sw.main{border-color:{{NAVY}}}.sw.auto{background:{{PALE}};border-color:{{CYAN}}}.sw.guide{background:{{LIGHT}};border-color:{{SLATE}}}
/* two columns menus */
.two{display:flex;gap:40px}
.col{flex:1}
h2{font-size:19px;color:{{NAVY}};margin-bottom:10px}
h2 small{font-size:14px;color:{{SLATE}};margin-left:10px;font-weight:400}
ol.nl{list-style:none;margin-top:14px;display:grid;gap:6px}
ol.nl li{display:flex;align-items:center;gap:10px;font-size:16px}
ol.nl em{font-style:normal;font-size:12.5px;color:#fff;background:{{SLATE}};border-radius:9px;padding:1px 8px}
/* split layout */
.split{display:flex;gap:34px;align-items:flex-start}
.split.r{flex-direction:row}
.steps{flex:1;display:flex;flex-direction:column;gap:13px}
.shots{display:flex;flex-direction:column;gap:16px;flex:none}
.st{display:flex;gap:12px;align-items:flex-start}
.st b{font-size:17px;color:{{NAVY}}}
.st p{font-size:15px;line-height:1.5;margin-top:2px}
.pre{background:{{PALE}};padding:10px 14px;border-radius:6px;font-size:15px;line-height:1.5}
.pre b{color:{{NAVY}};margin-right:6px}
.tips{display:flex;gap:12px;margin-top:18px}
.tips>div{flex:1;background:{{LIGHT}};border-radius:6px;padding:12px 16px;font-size:15px;line-height:1.55}
.tips b{display:block;color:{{NAVY}};font-size:15.5px;margin-bottom:2px}
.tips.v{flex-direction:column;margin-top:16px}
.coltbl{display:flex;flex-direction:column;gap:10px;margin-top:20px;font-size:16px;line-height:1.55}
.coltbl b{display:inline-block;width:64px;text-align:center;border-radius:4px;color:#fff;margin-right:10px;font-size:14px;padding:1px 0}
.coltbl b.in{background:{{RED}}}.coltbl b.au{background:{{SLATE}}}
/* cards3 */
.cards3{display:flex;gap:18px}
.c3{flex:1;background:{{LIGHT}};border-radius:8px;padding:18px 20px;border-top:5px solid {{CYAN}}}
.c3.em{border-top-color:{{ORANGE}}}
.c3 h3{font-size:20px;color:{{NAVY}};margin-bottom:10px}
.c3 ul{padding-left:20px;font-size:16px;line-height:1.55;margin-bottom:10px}
.c3 p{font-size:15px;line-height:1.55;border-top:1px solid #C7D0DA;padding-top:10px}
/* level */
.lv{display:flex;gap:16px;margin-top:26px}
.lvc{flex:1;background:{{LIGHT}};border-radius:8px;padding:22px 20px;display:grid;grid-template-columns:58px 1fr;grid-template-rows:auto auto;column-gap:10px}
.lvc span{grid-row:1/3;width:48px;height:48px;border-radius:50%;background:{{NAVY}};color:#fff;font-size:24px;font-weight:700;display:flex;align-items:center;justify-content:center}
.lvc.b span{background:{{TEXT}}}.lvc.c span{background:{{SLATE}}}
.lvc b{font-size:20px;color:{{NAVY}}}.lvc p{font-size:16.5px}
/* trouble */
table.tr{width:100%;border-collapse:collapse;font-size:14.5px}
.tr th{background:{{TEXT}};color:#fff;text-align:left;padding:6px 12px}
.tr td{padding:6px 12px;border-bottom:1px solid #C7D0DA;line-height:1.45;vertical-align:top}
.tr td:first-child{width:46%;font-weight:700;color:{{NAVY}}}
.tr tr:nth-child(odd) td{background:#F7F9FB}
.goto{margin-top:14px;background:{{NAVY}};color:#fff;border-radius:6px;padding:10px 16px;font-size:16px}
/* ng */
.ngs{display:grid;grid-template-columns:1fr 1fr;gap:18px 28px}
.ng{display:flex;gap:16px;background:{{LIGHT}};border-radius:8px;padding:22px 20px}
.x{width:34px;height:34px;border-radius:50%;background:{{RED}};color:#fff;font-weight:700;font-size:18px;display:flex;align-items:center;justify-content:center;flex:none}
.ng b{font-size:20px;color:{{NAVY}}}.ng p{font-size:16.5px;line-height:1.55;margin-top:6px}
</style></head>
<body>
{{SLIDES}}
<script>
var m=location.hash.match(/^#s(\d+)$/);
if(m){document.body.classList.add('one');var e=document.getElementById('s'+m[1]);if(e)e.classList.add('on');}
</script>
</body></html>
'''

CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'


def render(total):
    out = os.path.join(HERE, 'png')
    os.makedirs(out, exist_ok=True)
    url = 'file://' + os.path.join(HERE, 'slides.html')
    for i in range(1, total + 1):
        dst = os.path.join(out, 'slide_%02d.png' % i)
        subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars',
                        '--force-device-scale-factor=1', '--window-size=1280,720',
                        '--virtual-time-budget=3000', '--screenshot=' + dst, '%s#s%d' % (url, i)],
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        print(dst)


if __name__ == '__main__':
    n = build()
    if '--html' not in sys.argv:
        render(n)
