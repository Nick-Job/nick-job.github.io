/**
 * NickWork API · Cloudflare Worker + D1 数据库
 *
 * 部署步骤（详见 README「方案 B」）：
 * 1. Cloudflare 控制台 → Storage & Databases → D1 → Create database，名字 nickwork
 * 2. Compute (Workers) → Create Worker，名字 nickwork-api，把本文件全部粘贴进编辑器 → Deploy
 * 3. Worker → Settings → Bindings → Add binding → D1 database：
 *      Variable name 填 DB，Database 选 nickwork
 * 4. Worker → Settings → Variables and Secrets，添加三个变量：
 *      ACCESS_HASH      访问密码的 sha256（默认密码 nickwork2026 时为
 *                       658243f3ccf5bb9f27c0258dabd8deb3490f3c0cb6671a192b4969114cdc6d4f）
 *      SESSION_SECRET   一串随机字符（README 里给了生成命令）
 *      ALLOWED_ORIGIN   https://nick-job.github.io,http://localhost:8123
 *      COBALT_API_URL   Cobalt API 的完整地址，例如 https://api.cobalt.tools/
 *      COBALT_API_KEY   可选；如果 Cobalt 实例要求 API Key，就填在 Worker Secret 中
 * 5. 部署后把 Worker 网址（https://nickwork-api.你的子域.workers.dev）填进
 *    NickWork 设置里的「数据服务地址」，或交给助手写进代码默认值。
 *
 * 接口：
 *   POST /auth        {password} → {token}          登录换会话令牌（30 天有效）
 *   GET  /data        → {data:{tasks,topics,...}}   读全部数据（需登录）
 *   PUT  /data/:key   写一个数据集（需登录）
 *   POST /import      {data:{...}}                  旧数据一次性导入（需登录）
 */

const KEYS = ["tasks", "topics", "prompts", "sites", "ideas"];
const SESSION_TTL = 30 * 24 * 3600 * 1000;

const enc = new TextEncoder();
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s) => atob(s.replace(/-/g, "+").replace(/_/g, "/"));

async function sha256Hex(s) {
  const d = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function hmacSign(input, secret) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", key, input);
}
async function makeToken(secret) {
  const payload = b64url(enc.encode(JSON.stringify({ exp: Date.now() + SESSION_TTL })));
  return payload + "." + b64url(await hmacSign(enc.encode(payload), secret));
}
async function checkToken(token, secret) {
  if (!token || !token.includes(".")) return false;
  const [payload, sig] = token.split(".");
  try {
    if (sig !== b64url(await hmacSign(enc.encode(payload), secret))) return false;
    const { exp } = JSON.parse(fromB64url(payload));
    return Date.now() < exp;
  } catch (e) { return false; }
}

function corsHeaders(allowedRaw, requestOrigin) {
  const list = String(allowedRaw || "*").split(",").map((s) => s.trim()).filter(Boolean);
  const origin = list.includes("*") ? "*" : (list.includes(requestOrigin) ? requestOrigin : list[0] || "*");
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Type": "application/json; charset=utf-8",
  };
}

let tableReady = false;
async function ensureTable(env) {
  if (tableReady) return;
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS data (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated INTEGER)").run();
  tableReady = true;
}
async function putKey(env, key, value) {
  await ensureTable(env);
  await env.DB.prepare(
    "INSERT INTO data (key, value, updated) VALUES (?, ?, ?) " +
    "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated = excluded.updated"
  ).bind(key, value, Date.now()).run();
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const headers = corsHeaders(env.ALLOWED_ORIGIN, request.headers.get("Origin") || "");
    if (request.method === "OPTIONS") return new Response(null, { headers });

    try {
      if (!env.ACCESS_HASH || !env.SESSION_SECRET || !env.DB) {
        return new Response(JSON.stringify({ error: "未配置：需要 D1 绑定（变量名 DB）和变量 ACCESS_HASH / SESSION_SECRET" }), { status: 500, headers });
      }

      // 登录
      if (url.pathname === "/auth" && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        if ((await sha256Hex(String(body.password || ""))) !== env.ACCESS_HASH) {
          return new Response(JSON.stringify({ error: "密码不对" }), { status: 401, headers });
        }
        return new Response(JSON.stringify({ token: await makeToken(env.SESSION_SECRET) }), { headers });
      }

      // 以下接口都要登录
      const auth = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
      if (!(await checkToken(auth, env.SESSION_SECRET))) {
        return new Response(JSON.stringify({ error: "未登录或会话过期" }), { status: 401, headers });
      }

      if (url.pathname === "/data" && request.method === "GET") {
        await ensureTable(env);
        const rows = await env.DB.prepare("SELECT key, value FROM data").all();
        const data = {};
        for (const r of rows.results || []) { try { data[r.key] = JSON.parse(r.value); } catch (e) {} }
        return new Response(JSON.stringify({ data }), { headers });
      }

      // Cobalt 在线解析：API Key 只保存在 Worker 环境变量中，不进入前端
      if (url.pathname === "/media/resolve" && request.method === "POST") {
        if (!env.COBALT_API_URL) {
          return new Response(JSON.stringify({ error: "未配置 COBALT_API_URL" }), { status: 500, headers });
        }
        const body = await request.json().catch(() => ({}));
        let target;
        try {
          target = new URL(String(body.url || ""));
          if (!["http:", "https:"].includes(target.protocol)) throw new Error();
        } catch (e) {
          return new Response(JSON.stringify({ error: "无效的媒体链接" }), { status: 400, headers });
        }
        const cobaltHeaders = { "Accept": "application/json", "Content-Type": "application/json" };
        if (env.COBALT_API_KEY) cobaltHeaders.Authorization = "Api-Key " + env.COBALT_API_KEY;
        const upstream = await fetch(env.COBALT_API_URL, {
          method: "POST",
          headers: cobaltHeaders,
          body: JSON.stringify({
            url: target.toString(),
            videoQuality: String(body.videoQuality || "1080"),
            audioFormat: String(body.audioFormat || "mp3"),
            downloadMode: String(body.downloadMode || "auto"),
            filenameStyle: "basic",
          }),
        });
        const text = await upstream.text();
        return new Response(text, { status: upstream.status, headers });
      }

      const m = url.pathname.match(/^\/data\/([a-z]+)$/);
      if (m && request.method === "PUT") {
        if (!KEYS.includes(m[1])) return new Response(JSON.stringify({ error: "未知数据集" }), { status: 400, headers });
        const body = await request.text();
        JSON.parse(body); // 非法 JSON 直接 500，避免脏数据入库
        await putKey(env, m[1], body);
        return new Response(JSON.stringify({ ok: true }), { headers });
      }

      if (url.pathname === "/import" && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        const keys = [];
        for (const k of KEYS) {
          if (body && body.data && body.data[k] !== undefined) {
            await putKey(env, k, JSON.stringify(body.data[k]));
            keys.push(k);
          }
        }
        return new Response(JSON.stringify({ ok: true, keys }), { headers });
      }

      return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers });
    } catch (e) {
      return new Response(JSON.stringify({ error: String((e && e.message) || e) }), { status: 500, headers });
    }
  },
};
