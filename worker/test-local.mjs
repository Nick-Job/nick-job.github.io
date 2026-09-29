/**
 * 本地验证脚本：直连飞书 API 读多维表格，模拟 Worker 的完整行为。
 * 用途：拿到 FEISHU_APP_ID / FEISHU_APP_SECRET 后，先在本地验证表格可读、
 *       看到真实列名，确认 Worker 的字段映射没问题，再部署到 Cloudflare。
 *
 * 用法：
 *   FEISHU_APP_ID=cli_xxx FEISHU_APP_SECRET=xxx TABLE_APP_TOKEN=xxx TABLE_ID=xxx node worker/test-local.mjs
 */
const HOST = "https://open.feishu.cn";

const env = {
  FEISHU_APP_ID: process.env.FEISHU_APP_ID,
  FEISHU_APP_SECRET: process.env.FEISHU_APP_SECRET,
  TABLE_APP_TOKEN: process.env.TABLE_APP_TOKEN,
  TABLE_ID: process.env.TABLE_ID,
};

function flat(v) {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (Array.isArray(v)) return v.map((x) => (typeof x === "string" ? x : x && x.text ? x.text : "")).join("").trim();
  if (typeof v === "object" && v.text) return String(v.text).trim();
  return String(v);
}

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

async function main() {
  if (!env.FEISHU_APP_ID || !env.FEISHU_APP_SECRET || !env.TABLE_APP_TOKEN || !env.TABLE_ID) {
    console.error("缺少环境变量：FEISHU_APP_ID / FEISHU_APP_SECRET / TABLE_APP_TOKEN / TABLE_ID");
    process.exit(1);
  }
  console.log("1) 获取 tenant_access_token …");
  const tokenRes = await fetch(HOST + "/open-apis/auth/v3/tenant_access_token/internal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: env.FEISHU_APP_ID, app_secret: env.FEISHU_APP_SECRET }),
  });
  const tokenJson = await tokenRes.json();
  if (!tokenJson.tenant_access_token) {
    console.error("   失败：", JSON.stringify(tokenJson));
    process.exit(1);
  }
  console.log("   成功");

  console.log("2) 读取多维表格记录 …");
  let items = [], pageToken = "";
  do {
    const api = `${HOST}/open-apis/bitable/v1/apps/${env.TABLE_APP_TOKEN}/tables/${env.TABLE_ID}/records?page_size=500${pageToken ? "&page_token=" + pageToken : ""}`;
    const res = await fetch(api, { headers: { Authorization: "Bearer " + tokenJson.tenant_access_token } });
    const j = await res.json();
    if (j.code !== 0) {
      console.error("   失败：code", j.code, j.msg);
      console.error("   常见原因：应用没有被授权访问该表格（去表格里把应用加为协作者），或没开多维表格权限。");
      process.exit(1);
    }
    items = items.concat(j.data && j.data.items ? j.data.items : []);
    pageToken = j.data && j.data.has_more ? j.data.page_token : "";
  } while (pageToken);
  console.log(`   读到 ${items.length} 条记录`);

  if (items.length) {
    console.log("\n3) 第一条记录的原始字段（用于核对列名）：");
    console.log(JSON.stringify(items[0].fields, null, 2));
  }

  const topics = items.map(mapRecord).filter(Boolean);
  console.log(`\n4) 映射结果（前 5 条）：`);
  topics.slice(0, 5).forEach((t) => console.log("  ", JSON.stringify(t)));
  console.log(`\nOK：Worker 会返回 ${topics.length} 条选题。`);
}

main();
