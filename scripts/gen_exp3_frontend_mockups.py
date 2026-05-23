from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "artifacts" / "exp3" / "frontend"

WIDTH = 1600
HEIGHT = 1000

FONT_REG = "/System/Library/Fonts/Supplemental/Arial Unicode.ttf"
FONT_SERIF = "/System/Library/Fonts/Supplemental/Songti.ttc"


def font(size: int, serif: bool = False):
    return ImageFont.truetype(FONT_SERIF if serif else FONT_REG, size=size)


def card(draw: ImageDraw.ImageDraw, xy, fill, radius=24, outline=None, shadow=True):
    x1, y1, x2, y2 = xy
    if shadow:
        s = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
        sd = ImageDraw.Draw(s)
        sd.rounded_rectangle((x1 + 8, y1 + 10, x2 + 8, y2 + 10), radius=radius, fill=(0, 0, 0, 60))
        return s, (x1, y1, x2, y2, fill, radius, outline)
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline)
    return None, None


def draw_bg(base: Image.Image, title: str, subtitle: str):
    draw = ImageDraw.Draw(base)
    for y in range(HEIGHT):
        t = y / HEIGHT
        r = int(19 + (27 - 19) * t)
        g = int(23 + (31 - 23) * t)
        b = int(34 + (48 - 34) * t)
        draw.line((0, y, WIDTH, y), fill=(r, g, b))

    draw.rounded_rectangle((40, 30, WIDTH - 40, 120), radius=28, fill=(255, 255, 255, 14))
    draw.text((72, 58), title, fill=(255, 255, 255), font=font(34))
    draw.text((72, 92), subtitle, fill=(198, 211, 231), font=font(18))


def sidebar(draw: ImageDraw.ImageDraw, items: list[str], active: int = 0):
    draw.rounded_rectangle((54, 160, 360, 930), radius=28, fill=(255, 255, 255, 246))
    draw.text((80, 190), "AI Agent", fill=(35, 40, 60), font=font(30))
    draw.text((80, 228), "实验三前端页面", fill=(94, 102, 123), font=font(17))
    y = 290
    for idx, item in enumerate(items):
        is_active = idx == active
        fill = (36, 98, 164) if is_active else (241, 244, 249)
        txt = (255, 255, 255) if is_active else (42, 48, 67)
        draw.rounded_rectangle((76, y, 338, y + 58), radius=18, fill=fill)
        draw.text((100, y + 16), item, fill=txt, font=font(22))
        y += 74


def top_toolbar(draw: ImageDraw.ImageDraw, labels: list[str], active: int = 0):
    x = 390
    for idx, label in enumerate(labels):
        w = 150 if len(label) < 6 else 180
        fill = (255, 255, 255) if idx == active else (255, 255, 255, 160)
        draw.rounded_rectangle((x, 180, x + w, 236), radius=16, fill=fill)
        draw.text((x + 20, 195), label, fill=(27, 34, 53), font=font(20))
        x += w + 18


def main_panel(draw: ImageDraw.ImageDraw, title: str, subtitle: str):
    draw.rounded_rectangle((390, 260, 1550, 930), radius=30, fill=(255, 255, 255, 246))
    draw.text((430, 292), title, fill=(28, 34, 52), font=font(30))
    draw.text((430, 336), subtitle, fill=(96, 104, 126), font=font(18))


def footer_badge(draw: ImageDraw.ImageDraw, text: str):
    draw.rounded_rectangle((1240, 934, 1558, 972), radius=17, fill=(35, 106, 190))
    draw.text((1260, 942), text, fill=(255, 255, 255), font=font(14))


def img_login() -> Image.Image:
    base = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    draw_bg(base, "实验三功能图 1", "用户认证与授权页面")
    draw = ImageDraw.Draw(base)
    draw.rounded_rectangle((490, 190, 1110, 840), radius=32, fill=(255, 255, 255, 244))
    draw.text((565, 230), "登录 / 注册", fill=(29, 35, 53), font=font(34))
    draw.text((565, 284), "JWT 认证、密码校验、刷新令牌轮转", fill=(99, 108, 129), font=font(20))
    labels = ["邮箱", "密码", "验证码"]
    y = 360
    for lab in labels:
        draw.text((565, y), lab, fill=(53, 59, 77), font=font(22))
        draw.rounded_rectangle((565, y + 36, 1038, y + 98), radius=18, fill=(247, 249, 252), outline=(224, 229, 236))
        y += 114
    draw.rounded_rectangle((565, 730, 770, 788), radius=18, fill=(35, 106, 190))
    draw.text((635, 745), "登录", fill=(255, 255, 255), font=font(22))
    draw.rounded_rectangle((795, 730, 1038, 788), radius=18, fill=(236, 242, 250))
    draw.text((860, 745), "注册", fill=(29, 35, 53), font=font(22))
    footer_badge(draw, "对应：AuthController / AuthService")
    return base.convert("RGB")


def img_session() -> Image.Image:
    base = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    draw_bg(base, "实验三功能图 2", "会话管理页面")
    draw = ImageDraw.Draw(base)
    sidebar(draw, ["会话列表", "新建会话", "历史消息", "导出记录"], active=0)
    top_toolbar(draw, ["OpenAI", "模型选择", "创建会话"], active=1)
    main_panel(draw, "会话管理", "创建、切换、导出会话消息")
    draw.rounded_rectangle((430, 390, 780, 860), radius=22, fill=(247, 249, 252), outline=(224, 229, 236))
    draw.rounded_rectangle((820, 390, 1480, 860), radius=22, fill=(247, 249, 252), outline=(224, 229, 236))
    draw.text((470, 420), "会话列表", fill=(32, 39, 57), font=font(24))
    for i, name in enumerate(["仓库结构分析", "工具调用排障", "报告撰写", "答辩准备"]):
        y = 470 + i * 76
        draw.rounded_rectangle((455, y, 750, y + 56), radius=16, fill=(255, 255, 255))
        draw.text((478, y + 16), name, fill=(45, 51, 69), font=font(20))
    draw.text((860, 420), "新会话表单", fill=(32, 39, 57), font=font(24))
    for y, label in [(480, "标题"), (600, "Provider"), (720, "Model")]:
        draw.text((860, y), label, fill=(53, 59, 77), font=font(20))
        draw.rounded_rectangle((860, y + 36, 1430, y + 92), radius=16, fill=(255, 255, 255))
    footer_badge(draw, "对应：SessionController / SessionService")
    return base.convert("RGB")


def img_chat() -> Image.Image:
    base = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    draw_bg(base, "实验三功能图 3", "流式对话页面")
    draw = ImageDraw.Draw(base)
    sidebar(draw, ["会话列表", "新建会话", "消息历史", "导出"], active=0)
    main_panel(draw, "流式对话", "SSE chunk / heartbeat / done")
    draw.rounded_rectangle((430, 390, 1480, 760), radius=24, fill=(246, 248, 252), outline=(224, 229, 236))
    messages = [
        ("user", "请总结当前项目的分层架构。"),
        ("assistant", "系统采用 Controller / Service / Repository 分层，并支持 SSE 流式输出。"),
        ("tool", "searchCode -> SUCCESS\nmodel: OPENAI / qwen3.5-9b"),
    ]
    y = 426
    for role, text in messages:
        x1, x2, fill = (470, 1390, (255, 255, 255)) if role != "user" else (720, 1390, (225, 239, 255))
        draw.rounded_rectangle((x1, y, x2, y + 96), radius=18, fill=fill)
        draw.text((x1 + 22, y + 16), role.upper(), fill=(36, 67, 104), font=font(17))
        draw.text((x1 + 22, y + 42), text, fill=(34, 40, 56), font=font(21))
        y += 112
    draw.rounded_rectangle((430, 790, 1480, 900), radius=22, fill=(255, 255, 255))
    draw.text((460, 825), "输入问题，Ctrl + Enter 发送", fill=(96, 104, 126), font=font(20))
    draw.rounded_rectangle((1180, 815, 1450, 875), radius=18, fill=(35, 106, 190))
    draw.text((1262, 831), "发送", fill=(255, 255, 255), font=font(22))
    footer_badge(draw, "对应：AgentController / AgentService")
    return base.convert("RGB")


def img_stats() -> Image.Image:
    base = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    draw_bg(base, "实验三功能图 4", "工具统计与发布报告页面")
    draw = ImageDraw.Draw(base)
    sidebar(draw, ["工具统计", "发布报告", "健康检查", "模型列表"], active=0)
    main_panel(draw, "工具统计", "统计工具调用次数、成功率、延迟分布")
    kpis = [("总调用", "128"), ("成功率", "97.6%"), ("P95", "412ms")]
    x = 430
    for label, value in kpis:
        draw.rounded_rectangle((x, 390, x + 330, 510), radius=22, fill=(247, 249, 252), outline=(224, 229, 236))
        draw.text((460 + (x - 430), 420), label, fill=(97, 106, 127), font=font(20))
        draw.text((460 + (x - 430), 456), value, fill=(30, 36, 52), font=font(34))
        x += 360
    draw.rounded_rectangle((430, 550, 1000, 860), radius=22, fill=(247, 249, 252), outline=(224, 229, 236))
    draw.text((460, 580), "执行时长分布", fill=(32, 39, 57), font=font(24))
    for i, width in enumerate([120, 200, 280, 360]):
        y = 650 + i * 48
        draw.rounded_rectangle((470, y, 470 + width, y + 24), radius=10, fill=(58, 128, 207))
    draw.rounded_rectangle((1040, 550, 1480, 860), radius=22, fill=(247, 249, 252), outline=(224, 229, 236))
    draw.text((1070, 580), "导出选项", fill=(32, 39, 57), font=font(24))
    for i, btn in enumerate(["JSON", "Markdown", "巡检报告"]):
        y = 660 + i * 70
        draw.rounded_rectangle((1070, y, 1380, y + 52), radius=16, fill=(255, 255, 255))
        draw.text((1130, y + 14), btn, fill=(42, 48, 67), font=font(20))
    footer_badge(draw, "对应：ToolStatsController / SystemDiagnostics")
    return base.convert("RGB")


def img_report() -> Image.Image:
    base = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    draw_bg(base, "实验三功能图 5", "系统诊断与发布报告页面")
    draw = ImageDraw.Draw(base)
    sidebar(draw, ["就绪检查", "模型列表", "发布报告", "导出报告"], active=2)
    main_panel(draw, "系统诊断", "数据库、缓存和模型服务健康检查")
    checks = [("database", "OK"), ("redis", "OK"), ("model", "OK")]
    y = 390
    for name, status in checks:
        draw.rounded_rectangle((430, y, 1470, y + 96), radius=20, fill=(247, 249, 252), outline=(224, 229, 236))
        draw.text((465, y + 28), name.upper(), fill=(30, 36, 52), font=font(24))
        draw.rounded_rectangle((1220, y + 20, 1420, y + 70), radius=16, fill=(225, 239, 255))
        draw.text((1280, y + 31), status, fill=(35, 106, 190), font=font(20))
        y += 120
    draw.rounded_rectangle((430, 770, 1470, 900), radius=22, fill=(255, 255, 255))
    draw.text((465, 804), "发布报告：README 风格输出，包含模型信息、统计信息、运行证据", fill=(96, 104, 126), font=font(21))
    draw.rounded_rectangle((1175, 790, 1450, 850), radius=18, fill=(35, 106, 190))
    draw.text((1240, 806), "导出报告", fill=(255, 255, 255), font=font(22))
    footer_badge(draw, "对应：ReleaseReportService / Export")
    return base.convert("RGB")


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    images = {
        "exp3_frontend_auth.png": img_login(),
        "exp3_frontend_session.png": img_session(),
        "exp3_frontend_chat.png": img_chat(),
        "exp3_frontend_stats.png": img_stats(),
        "exp3_frontend_report.png": img_report(),
    }
    for name, img in images.items():
        img.save(OUT_DIR / name, quality=95)
        print(OUT_DIR / name)


if __name__ == "__main__":
    main()
