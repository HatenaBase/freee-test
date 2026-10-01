# -*- coding: utf-8 -*-
"""「使い方」タブ用の操作手順スライド（横1280px・高さは内容に合わせる）の HTML を生成し、PNG に書き出す。

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


def page(i, title, body):
    return '''
<section class="slide" id="s%d">
  <h1>%s</h1>
  <div class="body">%s</div>
  <div class="conf">社外秘 / Confidential</div>
</section>''' % (i, title, body)


def st(n, text):
    return '<div class="st">%s<div>%s</div></div>' % (num(n), text)


def build():
    S = []

    # 1. メニュー ---------------------------------------------------------
    m_test = shot('s_menu_test.png', (740, 30, 500, 251), 1.1, [
        (862, 42, 96, 25, '', 'tl'),
        (866, 79, 352, 24, '1', 'l'), (866, 115, 352, 24, '2', 'l'), (866, 151, 352, 24, '3', 'l'),
        (866, 206, 352, 24, '4', 'l'), (866, 242, 352, 24, '5', 'l')])
    m_skill = shot('s_menu_skill.png', (740, 30, 500, 251), 1.1, [
        (861, 79, 352, 24, '1', 'l'), (861, 115, 352, 24, '2', 'l'), (861, 151, 352, 24, '3', 'l'),
        (861, 187, 352, 24, '4', 'l'), (861, 242, 352, 24, '5', 'l')])
    body = '''
<div class="two">
  <div class="col"><h2>テスト管理<small>修了認定テスト</small></h2>%s</div>
  <div class="col"><h2>スキルチェック管理<small>簿記3級スキルチェック</small></h2>%s</div>
</div>
<p class="note">画面上部に表示されます（画面が狭いと「…」の中）。「メール文面シートを作成する」「結果シートの見出しを作成する」は初回だけ使います。</p>''' % (m_test, m_skill)
    S.append(('1. メニューを開く', body))

    # 2. 受験者の追加〜URL発行 -------------------------------------------
    sh_rows = shot('s_token_select.png', (0, 30, 700, 121), 0.86, [
        (165, 56, 228, 95, '1', 'l')])
    sh_menu = shot('s_menu_test.png', (840, 60, 400, 120), 0.86, [
        (866, 79, 352, 24, '2', 'r'), (866, 115, 352, 24, '3', 'r')])
    body = '''
<div class="split">
  <div class="steps">%s%s%s%s</div>
  <div class="shots">%s%s</div>
</div>
<p class="note">スキルチェックは「スキルチェック_トークン管理」タブで同じ手順（メニューは「スキルチェック管理」）。受験を止めるときは status を disabled にします。</p>''' % (
        st(1, '「トークン管理」の最終行の下に name・org・email を入力'),
        st(2, 'テスト管理 &gt; <b>トークンを発行する</b>'),
        st(3, 'テスト管理 &gt; <b>テストURLを生成する</b>（URL列に入る）'),
        st(4, '案内メールを送る（4. へ）'),
        sh_rows, sh_menu)
    S.append(('2. 受験者を追加してURLを発行する', body))

    # 3. メール文面 -------------------------------------------------------
    sh_mail = shot('s_mail_sheet.png', (0, 40, 960, 520), 0.78, [
        (52, 80, 181, 477, '1', 'l'), (233, 104, 300, 28, '2', 'r'),
        (233, 160, 110, 36, '3', 'r'), (233, 286, 80, 20, '3', 'r')])
    body = '''
<div class="split">
  <div class="shots">%s</div>
  <div class="steps">
    <div class="pre">初回のみ: テスト管理 &gt; <b>メール文面シートを作成する</b></div>
    %s%s%s
    <p class="note s">別のアドレスから送るときは、実行する人のGmailにそのアドレスを登録しておきます。</p>
  </div>
</div>''' % (sh_mail,
             st(1, 'A列のキー名は変えず、B列の値だけ書き換える'),
             st(2, '送信者名・送信元アドレス（空欄なら「MAIA 事務局」・実行した人のアドレス）'),
             st(3, '件名・本文に {{name}}・{{org}}・{{url}} を書くと受験者ごとに差し込まれる'))
    S.append(('3. 案内メールの文面を用意する', body))

    # 4. 案内メールを送る -------------------------------------------------
    sh_sel = shot('s_token_select.png', (0, 30, 700, 121), 0.95, [
        (0, 80, 51, 71, '2', 'l')])
    sh_send = shot('s_menu_test.png', (840, 30, 400, 251), 1.0, [
        (866, 206, 352, 24, '3', 'r')])
    body = '''
<div class="split">
  <div class="steps">%s%s%s%s</div>
  <div class="shots">%s%s</div>
</div>
<p class="note">スキルチェックは「スキルチェック_トークン管理」タブで、スキルチェック管理の同じ項目を使います。</p>''' % (
        st(1, '送る行に email と URL が入っているか確認'),
        st(2, '送る行を選ぶ（Cmd／Ctrl＋クリックで複数行）'),
        st(3, 'テスト管理 &gt; <b>選択行に案内メールを送信する</b>'),
        st(4, '確認画面で「OK」（5. へ）'),
        sh_sel, sh_send)
    S.append(('4. 案内メールを送る', body))

    # 5. 確認画面 ---------------------------------------------------------
    sh_dlg = shot('s_confirm_dialog.png', None, 1.0, [
        (25, 80, 380, 50, '1', 'l'), (25, 130, 300, 22, '2', 'l'), (25, 175, 480, 45, '3', 'l'),
        (25, 242, 330, 70, '4', 'l'), (350, 380, 168, 60, '5', 'r')])
    body = '''
<div class="split">
  <div class="shots">%s</div>
  <div class="steps">%s%s%s%s%s
    <p class="note s">送信すると、成功した行の mail_sent に送信日時が入ります。</p>
  </div>
</div>''' % (sh_dlg,
             st(1, '送信件数と送信元'),
             st(2, '再送信になる件数（mail_sent に日時がある行）'),
             st(3, '宛先（先頭20件まで）'),
             st(4, '送られない行とその理由'),
             st(5, '<b>「OK」で送信</b>／「いいえ」で中止（1通も送らない）'))
    S.append(('5. 確認画面を見て送信する', body))

    # 6. スキップ・再送信・送信上限 --------------------------------------
    body = '''
<div class="cards3">
  <div class="c3"><h3>送られない行</h3><ul><li>email が空欄・形式が不正</li><li>URL が空欄（先にURLを生成）</li></ul></div>
  <div class="c3 em"><h3>再送信に注意</h3><ul><li>mail_sent に日時がある行も送られる</li><li>二重送信に注意し、送る前に確認</li></ul></div>
  <div class="c3"><h3>1日の送信上限</h3><ul><li>1日100通／1,500通（アカウントによる）</li><li>足りないときは1通も送らずに中止</li></ul></div>
</div>
<p class="note">初めて送る人は、最初にGoogleの承認画面が出るので許可します。</p>'''
    S.append(('6. 送る前に確認すること', body))

    # 7. 受験回数の上限 --------------------------------------------------
    sh_max = shot('s_token_right.png', (596, 0, 456, 121), 1.15, [(711, 26, 112, 95, '', 'tl')])
    body = '''
<div class="split">
  <div class="steps">
    <div class="pre">既定は1人2回まで（修了認定テストのみ）</div>
    %s%s%s
  </div>
  <div class="shots">%s</div>
</div>''' % (st(1, 'max_attempts 列が無ければ、1行目の空き列に見出しを入力'),
             st(2, '対象の行に上限回数を入力（例: 3）'),
             st(3, '受験者がURLを開き直すと反映'),
             sh_max)
    S.append(('7. 受験回数の上限を増やす', body))

    # 8. 困ったとき -------------------------------------------------------
    tr = [
        ('「送信元アドレス「…」はこのアカウントで使えません。」', '実行者のGmailに登録するか、送信元アドレスを空欄にする'),
        ('「シート「トークン管理」を開き、…選択してから実行してください。」', '対象のタブを開き、行を選んでから実行し直す'),
        ('「送信できる行がありません。」', '表示された理由（email が空欄 など）を直す'),
        ('「本日の残り送信可能数が不足しています」', '翌日に実行するか、選ぶ行を減らす'),
        ('「0件のトークンを発行しました。」', 'name が空、または token が入っている行には発行しない'),
        ('受験者から「このテストURLは無効か、既に使用済みです」', 'status が disabled でないか、別のテストのURLでないか確認'),
        ('受験者から「受験可能回数に達しています」', 'max_attempts で上限を増やす（7. へ）'),
    ]
    rows = ''.join('<tr><td>%s</td><td>%s</td></tr>' % r for r in tr)
    body = '<table class="tr"><tr><th>表示・症状</th><th>対処</th></tr>%s</table>' \
           '<p class="note">ここにないときは「使い方_詳細」タブの「7. よくあるトラブルと対処」を見てください。</p>' % rows
    S.append(('8. 困ったとき', body))

    pages = [page(i + 1, ttl, body) for i, (ttl, body) in enumerate(S)]
    html = TEMPLATE.replace('{{SLIDES}}', '\n'.join(pages))
    for k, v in dict(NAVY=NAVY, CYAN=CYAN, ORANGE=ORANGE, TEXT=TEXT, SLATE=SLATE, LIGHT=LIGHT, PALE=PALE, CONF=CONF, RED=RED).items():
        html = html.replace('{{%s}}' % k, v)
    with open(os.path.join(HERE, 'slides.html'), 'w', encoding='utf-8') as f:
        f.write(html)
    return len(S)


TEMPLATE = r'''<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><title>使い方（操作手順）</title>
<style>
@font-face{font-family:ZK;src:local('Zen Kaku Gothic New'),local('ZenKakuGothicNew-Regular');font-weight:400}
@font-face{font-family:ZK;src:local('Zen Kaku Gothic New Bold'),local('ZenKakuGothicNew-Bold');font-weight:700}
*{box-sizing:border-box;margin:0;padding:0}
body{background:#888;font-family:ZK,'Zen Kaku Gothic New','Hiragino Sans',sans-serif;color:{{TEXT}}}
.slide{width:1280px;background:#fff;position:relative;margin:0 auto 24px;padding:34px 57px 46px}
body.one .slide{display:none;margin:0}
body.one .slide.on{display:block}
body.one{background:#fff}
h1{font-size:28px;color:{{NAVY}};font-weight:700;letter-spacing:.04em;padding-bottom:10px;border-bottom:2px solid {{CYAN}};margin-bottom:26px}
.conf{position:absolute;right:24px;bottom:14px;font-size:11px;color:{{CONF}}}
.note{font-size:16px;margin-top:18px;line-height:1.5}
.note.s{font-size:15px;margin-top:4px}
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
/* menus */
.two{display:flex;gap:40px}
.col{flex:1}
h2{font-size:19px;color:{{NAVY}};margin-bottom:10px}
h2 small{font-size:14px;color:{{SLATE}};margin-left:10px;font-weight:400}
ol.nl{list-style:none;margin-top:14px;display:grid;gap:6px}
ol.nl li{display:flex;align-items:center;gap:10px;font-size:16px}
ol.nl em{font-style:normal;font-size:12.5px;color:#fff;background:{{SLATE}};border-radius:9px;padding:1px 8px}
/* split */
.split{display:flex;gap:40px;align-items:flex-start}
.steps{flex:1;display:flex;flex-direction:column;gap:16px;padding-top:4px}
.shots{display:flex;flex-direction:column;gap:16px;flex:none}
.st{display:flex;gap:12px;align-items:flex-start;font-size:17px;line-height:1.5}
.st b{color:{{NAVY}}}
.pre{background:{{PALE}};padding:9px 14px;border-radius:6px;font-size:16px}
.pre b{color:{{NAVY}}}
/* cards */
.cards3{display:flex;gap:18px}
.c3{flex:1;background:{{LIGHT}};border-radius:8px;padding:16px 20px;border-top:5px solid {{CYAN}}}
.c3.em{border-top-color:{{ORANGE}}}
.c3 h3{font-size:19px;color:{{NAVY}};margin-bottom:8px}
.c3 ul{padding-left:20px;font-size:16px;line-height:1.6}
/* trouble */
table.tr{width:100%;border-collapse:collapse;font-size:15px}
.tr th{background:{{TEXT}};color:#fff;text-align:left;padding:6px 12px}
.tr td{padding:7px 12px;border-bottom:1px solid #C7D0DA;line-height:1.45;vertical-align:top}
.tr td:first-child{width:52%;font-weight:700;color:{{NAVY}}}
.tr tr:nth-child(odd) td{background:#F7F9FB}
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
    """1枚ずつ縦長ウィンドウで撮り、下の余白を切って内容の高さに合わせる（横幅は1280で統一）。"""
    out = os.path.join(HERE, 'png')
    os.makedirs(out, exist_ok=True)
    for f in os.listdir(out):
        if f.startswith('slide_') and f.endswith('.png'):
            os.remove(os.path.join(out, f))
    url = 'file://' + os.path.join(HERE, 'slides.html')
    for i in range(1, total + 1):
        dst = os.path.join(out, 'slide_%02d.png' % i)
        subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars',
                        '--force-device-scale-factor=1', '--window-size=1280,1400',
                        '--virtual-time-budget=3000', '--screenshot=' + dst, '%s#s%d' % (url, i)],
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        im = Image.open(dst).convert('RGB')
        bottom = im.point(lambda v: 255 if v < 245 else 0).convert('L').getbbox()[3]
        im.crop((0, 0, 1280, min(im.height, bottom + 14))).save(dst)
        print(dst, im.crop((0, 0, 1280, min(im.height, bottom + 14))).size)


if __name__ == '__main__':
    n = build()
    if '--html' not in sys.argv:
        render(n)
