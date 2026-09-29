"""NickWork media downloader service.

Run this service with Docker or:
    pip install -r requirements.txt
    uvicorn app:app --host 0.0.0.0 --port 8788
"""

from __future__ import annotations

import ipaddress
import os
import re
import shutil
import socket
import tempfile
from pathlib import Path
from typing import Optional
from urllib.parse import quote, urlparse

import httpx
import yt_dlp
from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.background import BackgroundTask
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse

APP_NAME = "NickWork Downloader"
ALLOWED_ORIGINS = [x.strip() for x in os.getenv("ALLOWED_ORIGINS", "http://localhost:8123").split(",") if x.strip()]
DOWNLOAD_API_TOKEN = os.getenv("DOWNLOAD_API_TOKEN", "").strip()
ALLOW_PRIVATE_URLS = os.getenv("ALLOW_PRIVATE_URLS", "0") == "1"
MAX_FILESIZE_MB = int(os.getenv("MAX_FILESIZE_MB", "512"))
YTDLP_COOKIES_FILE = os.getenv("YTDLP_COOKIES_FILE", "").strip()
YTDLP_PROXY = os.getenv("YTDLP_PROXY", "").strip()
DIRECT_EXTENSIONS = {".mp4", ".webm", ".mov", ".m4v", ".mkv", ".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif"}

app = FastAPI(title=APP_NAME, version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS or ["http://localhost:8123"],
    allow_credentials=False,
    allow_methods=["GET", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


class QuietLogger:
    def debug(self, msg):
        pass

    def warning(self, msg):
        pass

    def error(self, msg):
        print(msg)


def require_auth(authorization: Optional[str]) -> None:
    if not DOWNLOAD_API_TOKEN:
        return
    if authorization != f"Bearer {DOWNLOAD_API_TOKEN}":
        raise HTTPException(status_code=401, detail="未授权：请检查下载服务令牌")


def validate_url(raw_url: str) -> str:
    url = raw_url.strip()
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise HTTPException(status_code=400, detail="只支持 http/https 链接")
    if ALLOW_PRIVATE_URLS:
        return url
    try:
        addresses = {item[4][0] for item in socket.getaddrinfo(parsed.hostname, None)}
    except socket.gaierror as exc:
        raise HTTPException(status_code=400, detail="链接域名无法解析") from exc
    for value in addresses:
        try:
            ip = ipaddress.ip_address(value)
        except ValueError:
            continue
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
            raise HTTPException(status_code=400, detail="出于安全原因，默认禁止访问本机或内网地址")
    return url


def is_direct_media(url: str) -> bool:
    return Path(urlparse(url).path).suffix.lower() in DIRECT_EXTENSIONS


def clean_info(info: dict, source_url: str) -> dict:
    formats = []
    for item in info.get("formats") or []:
        if not item.get("format_id"):
            continue
        formats.append(
            {
                "format_id": item.get("format_id"),
                "ext": item.get("ext") or "",
                "resolution": item.get("resolution") or item.get("format_note") or "",
                "format_note": item.get("format_note") or "",
                "filesize": item.get("filesize") or item.get("filesize_approx"),
                "vcodec": item.get("vcodec") or "",
                "acodec": item.get("acodec") or "",
            }
        )
    formats.sort(key=lambda row: (row.get("vcodec") == "none", -(row.get("filesize") or 0)))
    thumbnails = info.get("thumbnails") or []
    thumbnail = info.get("thumbnail") or (thumbnails[-1].get("url") if thumbnails else "")
    return {
        "title": info.get("title") or "未命名媒体",
        "uploader": info.get("uploader") or info.get("channel") or "",
        "platform": info.get("extractor_key") or info.get("extractor") or "",
        "thumbnail": thumbnail,
        "duration": int(info["duration"]) if info.get("duration") else None,
        "webpage_url": info.get("webpage_url") or source_url,
        "ext": info.get("ext") or "",
        "formats": formats[:40],
    }


def ytdlp_extra_options() -> dict:
    options = {}
    if YTDLP_COOKIES_FILE and Path(YTDLP_COOKIES_FILE).is_file():
        options["cookiefile"] = YTDLP_COOKIES_FILE
    if YTDLP_PROXY:
        options["proxy"] = YTDLP_PROXY
    return options


def inspect_with_ytdlp(url: str) -> dict:
    options = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "noplaylist": True,
        "logger": QuietLogger(),
        "socket_timeout": 20,
        **ytdlp_extra_options(),
    }
    with yt_dlp.YoutubeDL(options) as ydl:
        info = ydl.extract_info(url, download=False)
        info = ydl.sanitize_info(info)
    if info.get("_type") == "playlist" and info.get("entries"):
        info = info["entries"][0]
    return clean_info(info, url)


def remove_dir(path: str) -> None:
    shutil.rmtree(path, ignore_errors=True)


def download_with_ytdlp(url: str, format_id: str) -> tuple[str, str, str]:
    if format_id != "best" and not re.fullmatch(r"[A-Za-z0-9_.+\-]{1,120}", format_id):
        raise HTTPException(status_code=400, detail="格式编号不合法")
    temp_dir = tempfile.mkdtemp(prefix="nickwork-download-")
    options = {
        "outtmpl": os.path.join(temp_dir, "%(title).180B.%(ext)s"),
        "format": "best" if format_id == "best" else format_id,
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "logger": QuietLogger(),
        "max_filesize": MAX_FILESIZE_MB * 1024 * 1024,
        "merge_output_format": "mp4",
        "socket_timeout": 30,
        **ytdlp_extra_options(),
    }
    try:
        with yt_dlp.YoutubeDL(options) as ydl:
            ydl.download([url])
        files = [path for path in Path(temp_dir).rglob("*") if path.is_file()]
        if not files:
            raise HTTPException(status_code=502, detail="下载服务没有生成文件")
        target = max(files, key=lambda path: path.stat().st_size)
        return str(target), target.name, temp_dir
    except Exception:
        remove_dir(temp_dir)
        raise


@app.get("/api/health")
def health():
    return {"ok": True, "service": APP_NAME, "yt_dlp": yt_dlp.version.__version__}


@app.get("/api/inspect")
def inspect(url: str = Query(..., min_length=8), authorization: Optional[str] = Header(default=None)):
    require_auth(authorization)
    target = validate_url(url)
    if is_direct_media(target):
        name = Path(urlparse(target).path).name or "media"
        return {"title": name, "platform": "媒体直链", "webpage_url": target, "formats": [{"format_id": "best", "ext": Path(name).suffix.lstrip("."), "resolution": "原始文件"}]}
    try:
        return inspect_with_ytdlp(target)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"解析失败：{exc}") from exc


@app.get("/api/download")
async def download(
    url: str = Query(..., min_length=8),
    format_id: str = Query("best"),
    authorization: Optional[str] = Header(default=None),
):
    require_auth(authorization)
    target = validate_url(url)
    if is_direct_media(target):
        async def stream():
            async with httpx.AsyncClient(follow_redirects=True, timeout=httpx.Timeout(60.0, read=None)) as client:
                async with client.stream("GET", target) as response:
                    response.raise_for_status()
                    async for chunk in response.aiter_bytes():
                        yield chunk
        name = Path(urlparse(target).path).name or "media"
        encoded_name = quote(name)
        return StreamingResponse(stream(), media_type="application/octet-stream", headers={"Content-Disposition": f"attachment; filename*=UTF-8''{encoded_name}"})
    try:
        path, name, temp_dir = download_with_ytdlp(target, format_id)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"下载失败：{exc}") from exc
    return FileResponse(path, filename=name, background=BackgroundTask(remove_dir, temp_dir))
