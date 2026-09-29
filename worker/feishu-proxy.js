/**
 * 飞书 → 一格 的同步代理（部署到 Cloudflare Workers）
 *
 * 部署步骤：
 * 1. Cloudflare 控制台 → Workers & Pages → Create Worker，把本文件全部粘贴进编辑器。
 * 2. Worker → Settings → Variables and Secrets，添加四个变量：
 *    - FEISHU_APP_ID      飞书开放平台自建应用的 App ID
 *    - FEISHU_APP_SECRET  该应用的 App Secret（建议用 Secret 类型）
 *    - TABLE_APP_TOKEN    多维表格的 app_token（表格网址里 /base/ 后面那段）
 *    - TABLE_ID           数据表的 table_id（表格网址里 table= 后面那段）
 *    - ALLOWED_ORIGIN     （可选）填 https://nick-job.github.io ，限制只允许你的站点调用
 * 3. 发布后，把 Worker 网址（https://xxx.workers.dev）填进一格 → 设置 → 飞书同步地址。
 *
 * 接口：GET /topics  返回 { topics: [{title, platform, source, status, priority, eta, url}] }
 * 密钥只存在 Cloudflare 环境变量里，绝不进入网页代码和仓库。
 */

const FEISHU_HOST = "https://open.feishu.cn";

function corsHeaders(env) {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "*",
    "Content-Type": "application/json; charset=utf-8",
  };
}

async function getTenantToken(env) {
  const res = await fetch(FEISHU_HOST + "/open-apis/auth/v3/tenant_access_token/internal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: env.FEISHU_APP_ID, app_secret: env.FEISHU_APP_SECRET }),
  });
  const j = await res.json();
  if (!j.tenant_access_token) throw new Error("获取 tenant_access_token 失败: " + (j.msg || JSON.stringify(j)));
  return j.tenant_access_token;
}

async function listAllRecords(env, token) {
  let items = [], pageToken = "";
  do {
    const api = `${FEISHU_HOST}/open-apis/bitable/v1/apps/${env.TABLE_APP_TOKEN}/tables/${env.TABLE_ID}/records?page_size=500${pageToken ? "&page_token=" + pageToken : ""}`;
    const res = await fetch(api, { headers: { Authorization: "Bearer " + token } });
    const j = await res.json();
    if (j.code !== 0) throw new Error("读多维表格失败: " + j.code + " " + (j.msg || ""));
    items = items.concat(j.data && j.data.items ? j.data.items : []);
    pageToken = j.data && j.data.has_more ? j.data.page_token : "";
  } while (pageToken);
  return items;
}

// 富文本/选项/多选字段统一转成纯文本
function flat(v) {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (Array.isArray(v)) return v.map((x) => (typeof x === "string" ? x : x && x.text ? x.text : "")).join("").trim();
  if (typeof v === "object" && v.text) return String(v.text).trim();
  return String(v);
}

// 把一条飞书记录映射成一格的选题；按常见列名做别名匹配
function mapRecord(rec) {
  const f = rec.fields || {};
  const get = (...names) => {
    for (const n of names) {
      const v = flat(f[n]);
      if (v) return v;
    }
    return "";
  };
  const title = get("选题标题", "标题", "题目", "选题");
  if (!title) return null;
  let eta = null;
  const etaRaw = f["预估发布日"] || f["发布日"] || f["预估时间"] || f["榜单日期"];
  if (typeof etaRaw === "number") {
    eta = new Date(etaRaw).toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" });
  } else {
    const s = flat(etaRaw);
    if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(s)) eta = s.slice(0, 10).replace(/\//g, "-");
  }
  return {
    title,
    platform: get("平台") || "小红书",
    source: get("来源", "发现方式", "发现渠道") || "灵感",
    status: get("状态", "处理状态") || "待评估",
    priority: get("优先级") || "中",
    eta,
    url: get("发布链接", "作品链接", "链接", "URL"),
  };
}

export default {
  async fetch(request, env) {
    const headers = corsHeaders(env);
    if (request.method === "OPTIONS") return new Response(null, { headers });
    const url = new URL(request.url);
    try {
      if (url.pathname !== "/topics") {
        return new Response(JSON.stringify({ error: "只有 GET /topics" }), { status: 404, headers });
      }
      if (!env.FEISHU_APP_ID || !env.FEISHU_APP_SECRET || !env.TABLE_APP_TOKEN || !env.TABLE_ID) {
        return new Response(JSON.stringify({ error: "缺少环境变量（FEISHU_APP_ID / FEISHU_APP_SECRET / TABLE_APP_TOKEN / TABLE_ID）" }), { status: 500, headers });
      }
      const token = await getTenantToken(env);
      const records = await listAllRecords(env, token);
      const topics = records.map(mapRecord).filter(Boolean);
      return new Response(JSON.stringify({ topics, count: topics.length }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ error: String(e.message || e) }), { status: 502, headers });
    }
  },
};
