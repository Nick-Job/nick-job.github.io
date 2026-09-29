# 个人工作台

个人的内容创作工作台：今日待办、多平台选题中枢、提示词库、网站收藏夹、灵感速记。
纯静态网页，部署在 GitHub Pages，数据以 JSON 文件存在本仓库，任何设备打开同一个网址就是同一份数据。

线上地址：https://nick-job.github.io

## 怎么用

### 看数据 / 日常使用
打开网址即可。左侧切换五个模块，每个模块的概览、视图切换、增删改都在页面里。

### 改数据的三种方式
1. **页面上直接改（推荐）**：点左下角「设置」，粘贴一个 GitHub Token（建议 fine-grained，只授予本仓库的 Contents 读写权限），保存后页面上的所有增删改会自动 commit 到本仓库，一两分钟后全设备生效。
2. **GitHub 网页端改**：直接编辑 `data/` 下的 JSON 文件并提交。
3. **本机改**：clone 本仓库，改完 push。

Token 只存在你自己浏览器的 localStorage 里，不进代码、不进仓库。

## 数据文件

| 文件 | 内容 | 关键字段 |
|---|---|---|
| `data/tasks.json` | 今日待办 | text / priority(高中低) / due / done / link |
| `data/topics.json` | 选题（含热榜信号） | title / platform(公众号·小红书·抖音) / source / status(待评估→已复盘) / priority / eta / url / views / ctr / saves / review |
| `data/prompts.json` | 提示词 | type(文生图·Seedance) / title / body / tags / favorite / model / vars / lens / duration / ref / log |
| `data/sites.json` | 网站收藏 | name / url / group / note |
| `data/ideas.json` | 灵感速记 | text / processed / created |

## 本地运行

```bash
python3 -m http.server 8123
# 打开 http://localhost:8123
```

本地打开时写入目标是「设置」里配置的仓库（默认 Nick-Job/nick-job.github.io）。

## 安全提醒

- 不要把 Token 写进任何文件提交到仓库。
- 聊天里出现过的 Token 用完建议去 GitHub → Settings → Developer settings 里撤销重发。
- 仓库是公开的（Pages 免费版要求），敏感内容不要写进 data 文件。
