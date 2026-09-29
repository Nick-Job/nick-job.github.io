#!/usr/bin/env python3
"""扫描 gallery/ 下的文件夹和图片，生成 gallery/index.json 供网页读取。"""
import json, os

BASE = os.path.join(os.path.dirname(__file__), "..", "gallery")
EXTS = (".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".avif")

folders = []
if os.path.isdir(BASE):
    for name in sorted(os.listdir(BASE)):
        p = os.path.join(BASE, name)
        if not os.path.isdir(p):
            continue
        imgs = sorted(
            f"gallery/{name}/{f}"
            for f in os.listdir(p)
            if f.lower().endswith(EXTS)
        )
        if imgs:
            folders.append({"name": name, "images": imgs})

out = os.path.join(BASE, "index.json")
json.dump({"folders": folders}, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print(f"gallery/index.json: {len(folders)} 个文件夹，{sum(len(f['images']) for f in folders)} 张图")
