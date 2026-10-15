# -*- coding: utf-8 -*-
"""生成测试用真实 PNG 图片（避免使用 data URI，以贴近真实电商页面）"""
from PIL import Image, ImageDraw, ImageFont
import os

OUT = r'C:\Users\34566\Documents\deepseek-harness\default-workspace\imagegrab\tests\assets'
os.makedirs(OUT, exist_ok=True)

FONT_PATH = r'C:\Windows\Fonts\msyh.ttc'


def make(name, w, h, label):
    img = Image.new('RGB', (w, h))
    d = ImageDraw.Draw(img)

    # 垂直渐变背景
    for y in range(h):
        t = y / max(1, h - 1)
        r = int(96 + 100 * t)
        g = int(140 + 50 * t)
        b = int(235 - 30 * t)
        d.line([(0, y), (w, y)], fill=(r, g, b))

    # 装饰圆
    rr = max(4, int(min(w, h) * 0.13))
    cx, cy = int(w * 0.20), int(h * 0.22)
    d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=(255, 255, 255))

    # 山形
    d.polygon([
        (0, h),
        (int(w * 0.36), int(h * 0.50)),
        (int(w * 0.54), int(h * 0.72)),
        (int(w * 0.76), int(h * 0.40)),
        (w, h),
    ], fill=(255, 255, 255))

    # 文字标签
    if label:
        try:
            size = max(12, int(min(w, h) / 12))
            font = ImageFont.truetype(FONT_PATH, size)
        except Exception:
            font = ImageFont.load_default()
        bbox = d.textbbox((0, 0), label, font=font)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        pad = max(6, int(min(w, h) * 0.03))
        d.rectangle(
            [w // 2 - tw // 2 - pad, h // 2 - th // 2 - pad,
             w // 2 + tw // 2 + pad, h // 2 + th // 2 + pad],
            fill=(45, 45, 75)
        )
        d.text((w // 2 - tw // 2, h // 2 - th // 2), label, fill=(255, 255, 255), font=font)

    path = os.path.join(OUT, name)
    img.save(path, 'PNG')
    return path


FILES = [
    # 正常商品图
    ('main-01.png', 600, 600, '主图 600x600'),
    ('main-02.png', 600, 600, '主图 600x600'),
    ('main-03.png', 800, 800, '主图 800x800'),
    ('main-04.png', 500, 700, '主图 500x700'),
    # 懒加载图
    ('lazy-01.png', 640, 640, '懒加载 640x640'),
    ('lazy-02.png', 640, 480, '懒加载 640x480'),
    # srcset 候选
    ('responsive-300.png', 300, 300, '300w'),
    ('responsive-600.png', 600, 600, '600w'),
    ('responsive-900.png', 900, 900, '900w'),
    # 背景图
    ('bg-01.png', 720, 520, '背景图 720x520'),
    # 噪点图（应被过滤）
    ('icon-80.png', 80, 80, 'icon'),
    ('pixel-1x1.png', 1, 1, ''),
    ('site-logo.png', 120, 40, 'logo'),
    ('icon-big.png', 500, 500, 'icon-big'),
]

if __name__ == '__main__':
    for f in FILES:
        p = make(*f)
        print('%-24s %8d bytes' % (f[0], os.path.getsize(p)))
    print('\n共生成 %d 个文件到 %s' % (len(FILES), OUT))
