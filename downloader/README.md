# NickWork Downloader

基于 `yt-dlp` 的多平台媒体解析与下载服务。

## 本地启动

```bash
docker compose up --build -d
```

打开健康检查：

```text
http://localhost:8788/api/health
```

在 NickWork → 媒体下载 → 服务设置中填写：

```text
服务地址：http://localhost:8787 或 http://localhost:8788
```

## 环境变量

| 变量 | 说明 |
|---|---|
| `ALLOWED_ORIGINS` | 允许调用的前端来源，逗号分隔 |
| `DOWNLOAD_API_TOKEN` | 可选服务令牌；设置后前端也必须填写同一令牌 |
| `MAX_FILESIZE_MB` | 单文件大小上限，默认 512 MB |
| `ALLOW_PRIVATE_URLS` | 默认 `0`，禁止访问本机和内网地址 |
| `YTDLP_COOKIES_FILE` | 可选，容器内的 cookies.txt 路径，用于需要登录态的平台 |
| `YTDLP_PROXY` | 可选，yt-dlp 使用的 HTTP/SOCKS 代理 |

## 公网部署

GitHub Pages 使用 HTTPS，因此下载服务也必须通过 HTTPS 访问。可将容器部署到任意支持 Docker 的服务器，再用 Cloudflare Tunnel、Caddy 或 Nginx 提供 HTTPS。

不要把 `DOWNLOAD_API_TOKEN` 写入 `config.js` 或提交到仓库。只在运行时通过环境变量注入，并在前端登录后临时填写。
