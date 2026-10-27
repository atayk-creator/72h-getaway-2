// Claude API'ye konuşan ortak parça. Bütün yapay zekâlı robotlar bunu kullanır.
// - Anahtar yalnızca ortam değişkeninden (GitHub gizli kasası) okunur, hiçbir yere yazılmaz.
// - Her çağrının maliyeti hesaplanır; robot başına üst sınır aşılırsa robot durur.
// - Model adları ve sürümler tek yerde: değişirse yalnızca burayı ya da GitHub "Variables" ayarını değiştir.

export const MODELS = {
  ucuz: process.env.CLAUDE_MODEL_UCUZ || "claude-haiku-5-5",
  orta: process.env.CLAUDE_MODEL_ORTA || "claude-sonnet-5-5",
};

// Milyon parça (token) başına dolar. Kaynak: platform.claude.com fiyat sayfası (27 Ekim 2026 kontrolü).
// Haiku'nun 100 bin parça üstü istemlerde fiyatı yükselir; robotlar o sınırın altında kalacak şekilde yazıldı,
// hesap yine de temkinli olsun diye yüksek fiyatı kullanır.
export const PRICE = {
  "claude-haiku-5-5": { in: 0.5, out: 2.5 },
  "claude-sonnet-5-5": { in: 2, out: 10 },
};
const FALLBACK_PRICE = { in: 5, out: 25 }; // bilinmeyen model: temkinli tahmin
export const SEARCH_USD = 0.01; // 1.000 aramada 10 dolar

export const API_URL = process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com/v1/messages";
export const API_VERSION = process.env.ANTHROPIC_VERSION || "2023-06-01";
// Web arama aracının sürümleri, yeniden eskiye. API birini tanımazsa bir sonrakini dener.
export const WEB_SEARCH_TYPES = (process.env.WEB_SEARCH_TYPE ? [process.env.WEB_SEARCH_TYPE] : [])
  .concat(["web_search_20260318", "web_search_20260209", "web_search_20250305"]);

export class BudgetError extends Error {}
export class NoKeyError extends Error {}

export function hasKey() { return Boolean(process.env.ANTHROPIC_API_KEY); }

export class Meter {
  constructor(maxUsd) { this.maxUsd = maxUsd; this.usd = 0; this.calls = 0; this.searches = 0; this.inTok = 0; this.outTok = 0; }
  add(model, usage = {}) {
    const p = PRICE[model] || FALLBACK_PRICE;
    const inTok = (usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0) + (usage.cache_read_input_tokens || 0);
    const outTok = usage.output_tokens || 0;
    const searches = (usage.server_tool_use && usage.server_tool_use.web_search_requests) || 0;
    this.inTok += inTok; this.outTok += outTok; this.searches += searches; this.calls++;
    this.usd += (inTok * p.in + outTok * p.out) / 1e6 + searches * SEARCH_USD;
  }
  check() { if (this.usd > this.maxUsd) throw new BudgetError(`Bütçe sınırı aşıldı: ${this.usd.toFixed(3)} $ > ${this.maxUsd} $. Robot durduruldu.`); }
  summary() { return `${this.calls} çağrı, ${this.inTok} giriş + ${this.outTok} çıkış parçası, ${this.searches} web araması, yaklaşık ${this.usd.toFixed(3)} $`; }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function post(body, { fetchImpl, key }) {
  const res = await fetchImpl(API_URL, {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": API_VERSION, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}

// Tek mesaj gönderir; sunucu tarafı araçlar "pause_turn" ile dönerse kaldığı yerden devam ettirir.
export async function ask({ model, system, prompt, messages, tools, maxTokens = 2000, meter, fetchImpl = fetch, retries = 3, maxTurns = 6 }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new NoKeyError("ANTHROPIC_API_KEY tanımlı değil");
  const msgs = messages ? [...messages] : [{ role: "user", content: prompt }];
  const content = [];
  let toolList = tools, typeIdx = 0;
  for (let turn = 0; turn < maxTurns; turn++) {
    const body = { model, max_tokens: maxTokens, system, messages: msgs };
    if (toolList) body.tools = toolList;
    let r;
    for (let attempt = 0; ; attempt++) {
      r = await post(body, { fetchImpl, key });
      if (r.status === 200) break;
      const msg = (r.json && r.json.error && r.json.error.message) || r.text.slice(0, 300);
      // Web arama sürümü tanınmadıysa bir eskisini dene
      if (r.status === 400 && toolList && /web_search|tool/i.test(msg) && typeIdx + 1 < WEB_SEARCH_TYPES.length && toolList.some((t) => String(t.type).startsWith("web_search"))) {
        typeIdx++; toolList = toolList.map((t) => (String(t.type).startsWith("web_search") ? { ...t, type: WEB_SEARCH_TYPES[typeIdx] } : t));
        body.tools = toolList; attempt = -1; continue;
      }
      const retryable = r.status === 429 || r.status === 529 || r.status >= 500;
      if (!retryable || attempt >= retries) throw new Error(`Claude API hatası (HTTP ${r.status}): ${msg}`);
      await sleep(2000 * 2 ** attempt);
    }
    const j = r.json;
    if (meter) { meter.add(model, j.usage); meter.check(); }
    content.push(...(j.content || []));
    if (j.stop_reason !== "pause_turn") return { content, stop: j.stop_reason, text: textOf(content) };
    msgs.push({ role: "assistant", content: j.content });
  }
  return { content, stop: "max_turns", text: textOf(content) };
}

export function webSearchTool({ maxUses = 8, allowedDomains, blockedDomains } = {}) {
  const t = { type: WEB_SEARCH_TYPES[0], name: "web_search", max_uses: maxUses };
  if (allowedDomains) t.allowed_domains = allowedDomains;
  if (blockedDomains) t.blocked_domains = blockedDomains;
  return t;
}

export function textOf(content) {
  return (content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
}

// Arama sonuçlarında gerçekten görünen adresler. Robot, yalnızca bunları kaynak olarak kabul eder.
export function searchedUrls(content) {
  const set = new Set();
  for (const b of content || []) {
    if (b.type === "web_search_tool_result" && Array.isArray(b.content)) for (const r of b.content) if (r.url) set.add(normUrl(r.url));
    if (b.type === "text" && Array.isArray(b.citations)) for (const c of b.citations) if (c.url) set.add(normUrl(c.url));
  }
  return set;
}

export function normUrl(u) {
  try { const x = new URL(u); x.hash = ""; let s = x.toString(); if (s.endsWith("/")) s = s.slice(0, -1); return s.replace(/^http:/, "https:").replace("://www.", "://"); }
  catch { return String(u); }
}

// Cevaptaki JSON'u bulur: ```json ... ``` bloğu ya da ilk { ile son } arası.
export function parseJson(text) {
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const cand = fence ? fence[1] : text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  try { return JSON.parse(cand); } catch (e) { throw new Error("Yapay zekâ cevabındaki JSON okunamadı: " + e.message + " | " + String(text).slice(0, 200)); }
}

// Sayıyı biçimden bağımsız karşılaştırmak için: "13 200", "13.200", "13,200" → 13200
export function digits(s) { return String(s).replace(/[^\d]/g, ""); }
