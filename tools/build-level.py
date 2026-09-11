#!/usr/bin/env python3
"""교육부 영어과 교육과정 【별표 3】 기본 어휘 목록 → data/level.json

원문: 교육부 고시 제2015-74호 [별책 14] 영어과 교육과정
      http://textbook-miraen.cdn.x-cdn.com/textbook/newbook/curriculum/별책14_영어과 교육과정.pdf

목록 3,000개의 표시 규칙(원문 지침 7항):
  *  …  800개, 초등 과정 권장
  ** …  400개, 고등 진로선택·전문교과Ⅰ 권장
  무표시 … 1,800개, 중·고 공통

앱에서는 * 를 '초등 필수', 무표시를 '중등 이상'으로 쓴다. ** 는 초등학생에게는
너무 멀어서 넣지 않는다.

낱말 차례는 빈도순(tools/freq_en.txt)이다. 공부는 흔한 말부터 하는 편이 낫고,
앱에서 '가나다순' 으로 바꿔 보는 것은 화면에서 다시 정렬하면 된다.

  실행:  python3 tools/build-level.py [PDF경로]
  필요:  pip install pypdf
"""
import json
import os
import re
import sys

try:
    import pypdf
except ImportError:
    sys.exit('pypdf 가 필요하다:  pip install pypdf')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PDF = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'tools', 'moe-english-curriculum.pdf')
SRC = '교육부 고시 제2015-74호 [별책 14] 영어과 교육과정 【별표 3】 기본 어휘 목록'
URL = 'https://www.moe.go.kr/'

# 목록에 섞여 있는 머리글·쪽번호
NOISE = re.compile(r'별표|영어과|기본 어휘|^\d+$|^[A-Z]$')
# 낱말 한 줄:  about *   /   advertize / advertise   /   hello / hey / hi *
ENTRY = re.compile(r"^([A-Za-z][A-Za-z'.\-]*(?:\s*/\s*[A-Za-z][A-Za-z'.\-]*)*)\s*(\*{1,2})?$")


def read_list(path):
    reader = pypdf.PdfReader(path)
    pages = [(p.extract_text() or '') for p in reader.pages]
    # '기본 어휘 목록' 이 시작되는 쪽부터, 다음 【별표】가 나오는 쪽 전까지만 본다.
    # 목록 뒤에는 문법 예문표가 이어지는데, 거기에도 영어 낱말이 많아 섞이면 안 된다.
    start = next(i for i, t in enumerate(pages) if '기본 어휘 목록' in t)
    end = next((i for i in range(start + 1, len(pages)) if '【별표 4】' in pages[i]), len(pages))
    lines = []
    for t in pages[start:end]:
        lines += [x.strip() for x in t.split('\n')]

    elem, mid, adv, skipped = [], [], [], []
    for ln in lines:
        if not ln or NOISE.search(ln):
            continue
        m = ENTRY.match(ln)
        if not m:
            skipped.append(ln)
            continue
        # 'hello / hey / hi' 처럼 같은 뜻의 다른 철자는 모두 담는다. 예문 난이도를
        # 잴 때 어느 철자가 나와도 '아는 말' 로 쳐야 하기 때문이다.
        words = [w.strip().lower() for w in m.group(1).split('/')]
        words = [w for w in words if len(w) > 1 or w in ('a', 'i')]
        bucket = {'*': elem, '**': adv}.get(m.group(2) or '', mid)
        bucket.extend(words)
    return elem, mid, adv, skipped


def freq_rank():
    """흔한 말일수록 앞에 오도록 순위표를 만든다."""
    rank, path = {}, os.path.join(ROOT, 'tools', 'freq_en.txt')
    if os.path.exists(path):
        with open(path, encoding='utf-8') as f:
            for i, ln in enumerate(f):
                w = ln.split(' ')[0].strip()
                if w and w not in rank:
                    rank[w] = i
    return rank


def main():
    if not os.path.exists(PDF):
        sys.exit(f'원문 PDF 가 없다: {PDF}\n  (파일이 커서 저장소에 넣지 않는다. 위 주석의 주소에서 내려받아 이 경로에 둔다)')
    elem, mid, adv, skipped = read_list(PDF)
    rank = freq_rank()
    order = lambda ws: sorted(dict.fromkeys(ws), key=lambda w: (rank.get(w, 10**9), w))

    elem, mid = order(elem), order(mid)
    # 초등에 있는 말이 중등 쪽에도 들어가면 같은 낱말을 두 번 외우게 된다
    mid = [w for w in mid if w not in set(elem)]

    out = {
        '_note': '난이도 낱말집. 예문을 고를 때, 그리고 필수영단어 탭에서 쓴다. '
                 'tools/build-level.py 가 만든다 — 손으로 고치지 말 것.',
        'src': SRC,
        'url': URL,
        'mark': '원문에서 * 표시 800개가 초등 권장, 표시 없는 1,800개가 중·고 공통이다.',
        'order': '흔히 쓰는 낱말 순',
        'lv1': ' '.join(elem),
        'lv2': ' '.join(mid),
    }
    dst = os.path.join(ROOT, 'data', 'level.json')
    with open(dst, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False)
    print(f'✓ data/level.json — 초등 {len(elem)} · 중등이상 {len(mid)} '
          f'(고급 ** {len(set(adv))}개는 넣지 않음) · {os.path.getsize(dst)/1024:.1f}KB')
    if skipped:
        print(f'  ※ 낱말로 못 읽은 줄 {len(skipped)}개: {skipped[:5]}')


if __name__ == '__main__':
    main()
