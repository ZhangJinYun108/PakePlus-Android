"""
必须记 · 应用图标生成脚本
依赖：Pillow (pip install Pillow)
执行：在项目根目录运行 python make_icons.py
产出：
  assets/icon.png          1024×1024 主图标（PakePlus 会自动派生出 .ico / .icns）
  assets/icon.ico          多分辨率 .ico（Windows 快捷方式图标）
  assets/tray.png           64×64 系统托盘图标
  assets/apple-touch.png   180×180 iOS / PWA 启动图
  assets/favicon-32.png    32×32 浏览器标签栏图标
"""

from PIL import Image, ImageDraw

# ──────────────────────────────────────────────
# 设计常量（与 CSS 主题色保持一致）
# ──────────────────────────────────────────────
TOP    = (91, 166, 120)   # #5BA678 浅鼠尾草绿
BOTTOM = (47, 110, 69)    # #2F6E45 深鼠尾草绿
WHITE  = (255, 255, 255, 255)
DOT    = (168, 217, 188)  # #A8D9BC 顶部高亮同步点

# SVG 视口内的几何参数（1024 单位制）
CHECK_POINTS  = [(280, 530), (450, 700), (750, 360)]
CHECK_WIDTH   = 90
DOT_CX, DOT_CY = 820, 220
DOT_R          = 48
CORNER_RATIO   = 0.225       # 圆角半径 / 边长


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def make_icon(size: int) -> Image.Image:
    """绘制一张 size×size 的应用图标。"""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    px  = img.load()

    # 1) 画矩形渐变背景（每行从上到下颜色插值）
    for y in range(size):
        color = lerp(TOP, BOTTOM, y / max(size - 1, 1))
        for x in range(size):
            px[x, y] = (*color, 255)

    # 2) 顶部高光（平滑渐变，从上往下淡出，避免硬边）
    overlay = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    opx = overlay.load()
    fade_h = int(size * 0.62)                 # 高光作用高度
    for y in range(fade_h):
        a = int(28 * (1 - y / fade_h) ** 2)   # 二次缓动，边缘平滑归零
        row = (255, 255, 255, a)
        for x in range(size):
            opx[x, y] = row
    img = Image.alpha_composite(img, overlay)

    # 3) 圆角蒙版
    radius = int(size * CORNER_RATIO)
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, size - 1, size - 1), radius=radius, fill=255
    )
    img.putalpha(mask)

    # 4) 中央勾选标记（粗描边、圆角接头）
    s = size / 1024
    draw = ImageDraw.Draw(img)
    pts  = [(p[0] * s, p[1] * s) for p in CHECK_POINTS]
    draw.line(pts, fill=WHITE, width=max(int(CHECK_WIDTH * s), 2), joint="curve")

    # 5) 右上角「同步状态」小光点
    r  = max(int(DOT_R * s), 1)
    cx, cy = DOT_CX * s, DOT_CY * s
    draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=DOT)

    return img


def main():
    import os
    os.makedirs("assets", exist_ok=True)

    # 主图标：1024×1024（PakePlus 自动派生其它格式）
    master = make_icon(1024)
    master.save("assets/icon.png", "PNG", optimize=True)
    print("[ok] assets/icon.png        1024×1024")

    # 多分辨率 .ico（Windows 桌面快捷方式图标）
    ico_sizes = [(16, 16), (24, 24), (32, 32), (48, 48),
                 (64, 64), (128, 128), (256, 256)]
    master.save(
        "assets/icon.ico",
        format="ICO",
        sizes=ico_sizes,        # Pillow 会从源图自动重采样到各尺寸
    )
    print(f"[ok] assets/icon.ico        multi-res {ico_sizes}")

    # 系统托盘图标
    make_icon(64).save("assets/tray.png", "PNG", optimize=True)
    print("[ok] assets/tray.png         64×64")

    # iOS / PWA
    make_icon(180).save("assets/apple-touch.png", "PNG", optimize=True)
    print("[ok] assets/apple-touch.png  180×180")

    # 浏览器 favicon
    make_icon(32).save("assets/favicon-32.png", "PNG", optimize=True)
    print("[ok] assets/favicon-32.png   32×32")

    print("\n全部生成完毕。打包后即可在桌面 / Dock / 任务栏看到「必须记」图标。")


if __name__ == "__main__":
    main()