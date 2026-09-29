# NickWork · 个人工作台

个人的内容创作工作台：今日待办、多平台选题中枢、提示词库、网站收藏夹、灵感速记、媒体下载与素材图库。

前端是纯静态网页，部署在 GitHub Pages；方案 B 的正式数据存于 Cloudflare Worker + D1。网页只在浏览器本地保存登录令牌、离线缓存和待同步队列，不再需要把 GitHub Token 放在每台设备上。

线上地址：https://nick-job.github.io

默认数据服务地址：https://nickwork-api.nickjob1204.workers.dev

## 方案 B 架构

```text
浏览器（GitHub Pages）
        │  密码登录 / 读写数据
        ▼
Cloudflare Worker（nickwork-api）
        │
        ▼
Cloudflare D1（数据库 nickwork）
```

- 密码校验和 D1 读写都在 Worker 中完成。
- 登录成功后，Worker 返回会话令牌；前端只在当前浏览器标签页内保留，关闭标签页后需重新输入密码。
- 页面修改会先写入本机缓存，随后自动保存到 D1；短暂离线时刷新也不会丢掉尚未上传的改动。
- 第一次连接空的 D1 时，页面会自动把仓库现有的 `data/*.json` 导入 D1。
- 图库仍使用仓库 `gallery/` 文件夹和 GitHub Action 自动生成索引；飞书同步仍是独立的 Worker。

## 媒体下载

侧边栏「媒体下载」默认使用 Cobalt 在线解析。浏览器只请求你的 Cloudflare Worker，由 Worker 携带密钥转发到 Cobalt，因此不需要额外服务器，也不会把 Cobalt API Key 暴露到前端。

在 Worker 中添加变量：

```text
COBALT_API_URL = https://你的-cobalt-api/
COBALT_API_KEY = 如果实例需要，添加到 Secret
```

更新 `worker/nickwork-api.js` 后重新部署 Worker。公共 Cobalt 实例的可用性和认证要求可能变化，生产使用建议选择可信实例或自行部署 Cobalt。

如果不想使用 Cobalt，也可以切到「本地服务」模式，按需运行仓库里的 yt-dlp 服务：

```bash
./scripts/run-downloader.sh
```

或者使用 Docker：

```bash
docker compose up --build -d
```

启动后在网页设置中填写下载服务地址，本地默认是：

```text
http://localhost:8788
```

公网访问的 GitHub Pages 是 HTTPS，因此远端下载服务也必须使用 HTTPS。部署和可选令牌说明见 `downloader/README.md`。

## 部署 Worker + D1

### 1. 创建 D1 数据库

Cloudflare 控制台 → `Storage & Databases`（部分界面叫 `D1`）→ `Create database`：

- 名称：`nickwork`

创建后先留在控制台，后面需要把这个数据库绑定到 Worker。

### 2. 创建并部署 Worker

进入 `Workers & Pages` → `Create` → `Worker`：

- 名称：`nickwork-api`
- 创建后进入代码编辑器
- 删除示例代码，把仓库文件 `worker/nickwork-api.js` 的全部内容粘贴进去
- 点击 `Deploy`

部署后会得到一个地址，格式类似：

```text
https://nickwork-api.你的子域.workers.dev
```

### 3. 绑定 D1

进入这个 Worker → `Settings` → `Bindings` → `Add binding` → `D1 database`：

- Variable name：`DB`
- D1 database：`nickwork`

变量名必须是 `DB`，代码里使用的是这个名称。

### 4. 添加变量和密钥

进入 Worker → `Settings` → `Variables and Secrets`，添加：

| 名称 | 类型 | 内容 |
|---|---|---|
| `ACCESS_HASH` | Text | 访问密码的 SHA-256 |
| `SESSION_SECRET` | Secret | 一串随机字符 |
| `ALLOWED_ORIGIN` | Text | `https://nick-job.github.io,http://localhost:8123` |

默认密码 `nickwork2026` 对应的哈希是：

```text
658243f3ccf5bb9f27c0258dabd8deb3490f3c0cb6671a192b4969114cdc6d4f
```

建议换掉默认密码。macOS 上生成新密码哈希：

```bash
printf '你的新密码' | shasum -a 256
```

生成 `SESSION_SECRET`：

```bash
openssl rand -hex 32
```

变量保存后，如果 Worker 没有自动重新部署，再点一次 `Deploy`。

### 5. 网页连接

打开 https://nick-job.github.io ：

1. 数据服务地址通常已经自动填为 `https://nickwork-api.nickjob1204.workers.dev`
2. 访问密码填你在 `ACCESS_HASH` 里设置的密码
3. 点「进入」

如果 D1 是空的，页面会自动把当前 `data/*.json` 导入云端，并显示「已把现有数据导入云端」。之后新增、编辑或删除内容都会自动保存，不需要手动同步。

## 日常使用

- 左侧「同步」：手动重试保存，并从 D1 拉取最新数据；日常使用不需要点。
- 左上角同步状态：查看已保存、正在保存或保存失败状态。
- 设置 → 数据服务地址：更换 Worker 地址后会要求重新登录。
- 设置 → 退出登录：立即清除本机会话令牌，D1 中的数据不受影响。

## 数据文件

方案 B 启用后，正式数据在 D1 中。仓库里的 `data/*.json` 仅用于首次初始化，以及没有云端连接时的旧数据兜底。

| 数据集 | 内容 |
|---|---|
| `tasks` | 今日待办 |
| `topics` | 选题与热榜信号 |
| `prompts` | 提示词库 |
| `sites` | 网站收藏 |
| `ideas` | 灵感速记 |

确认 D1 中的数据完整后，如果你希望仓库里不再保留一份公开的数据副本，可以再删除仓库中的 `data/*.json`。不要在首次导入验证完成前删除。

## 素材图库

图库读取和上传都使用独立的 GitHub 图床仓库，不进入 D1。当前默认仓库为：

```text
Nick-Job/boomb
```

在设置中填写：

```text
图库仓库：Nick-Job/boomb
分支：main
图库根目录：images
上传子目录：uploads
图库 GitHub Token：fine-grained Token
```

Token 只授予 `Nick-Job/boomb` 的 `Contents: Read and write` 权限，仅保存在当前浏览器标签页，关闭标签页后清除。

素材图库的上传流程：

```text
浏览器 → GitHub API → boomb 仓库
```

多张图片会合并成一个 Git commit，默认写入：

```text
images/uploads/
```

图库仍不进入 D1：

1. 打开「素材图库」。
2. 点击「上传图片」。
3. 选择或拖入图片。
4. 上传完成后页面自动刷新图库列表。

## 飞书同步（可选）

部署方法见 `worker/feishu-proxy.js` 文件头部说明。需要另外创建一个 Cloudflare Worker，并配置飞书应用变量；它读取飞书多维表格，再由 NickWork 的选题中枢导入。

## 本地运行

```bash
python3 -m http.server 8123
# 打开 http://localhost:8123
```

本地页面同样可以连接线上 Worker。若使用本地 Worker，请把开发地址加入 `ALLOWED_ORIGIN`。

## 安全说明

- 不要提交 Cloudflare 密钥、飞书密钥或任何登录令牌。
- 默认密码只适合第一次验证，部署后尽快改为自己的密码。
- Worker 中的 `SESSION_SECRET` 不要让其他人知道；更换它会让现有登录会话全部失效。
- D1 数据受 Worker 密码门保护；但仓库中的 `data/*.json` 在删除前仍是公开文件，不要在里面放敏感内容。
