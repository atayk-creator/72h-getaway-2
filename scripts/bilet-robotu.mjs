// BİLET ROBOTU
// prices.json'daki resmî kalemlerin kaynak sayfasını okur, yapay zekâya (ucuz model) güncel fiyatı sorar.
// Kural: yapay zekâ cevabı, sayfada BİREBİR geçen bir alıntıyla kanıtlamak zorunda. Alıntı sayfada yoksa
// ya da rakam alıntıda geçmiyorsa sonuç "doğrulanamadı" olur ve hiçbir fiyat değişmez.
// Fiyat değiştiyse prices.json güncellenir; GitHub bunu senin onayına (Pull request) sunar.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { ask, Meter, MODELS, parseJson, digits, hasKey, NoKeyError } from "./lib/claude.mjs";

export const MAX_USD = Number(process.env.BILET_MAX_USD || 0.5);
export const MAX_CHARS = 60000;

export function htmlToText(html) {
  return String(html)
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d|td|th)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/[ \t\r\f\v]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}

const norm = (s) => String(s).toLowerCase().replace(/[\s\u00a0\u202f]+/g, " ").replace(/[“”„]/g, '"').replace(/[‘’]/g, "'").trim();

// Kanıt kontrolü: alıntı sayfada geçiyor mu, rakam alıntıda geçiyor mu?
export function verify(pageText, quote, value) {
  if (!quote || typeof value !== "number" || !Number.isFinite(value) || value <= 0) return "eksik";
  if (!norm(pageText).includes(norm(quote))) return "alinti-sayfada-yok";
  if (!digits(quote).includes(String(Math.round(value)))) return "rakam-alintida-yok";
  return "ok";
}

export async function fetchPage(url, fetchImpl = fetch) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetchImpl(url, { signal: ctrl.signal, headers: { "user-agent": "Mozilla/5.0 (compatible; 72hGetawayFiyatRobotu/1.0; +https://github.com/atayk-creator/72h-getaway-2)", "accept-language": "en,hu;q=0.8" } });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return htmlToText(await res.text());
  } finally { clearTimeout(t); }
}

const SYSTEM = "Sen resmî bilet fiyatlarını kontrol eden titiz bir asistansın. Yalnızca sana verilen sayfa metnine dayanırsın, tahmin yürütmezsin. Cevabın yalnızca istenen JSON olur.";

export function buildPrompt(url, items, text) {
  const list = items.map(([k, i]) => `- anahtar: ${k} | kalem: ${i.label} | kayıtlı fiyat: ${i.value} ${i.currency || ""}`).join("\n");
  return `Kaynak sayfa: ${url}\n\nAşağıdaki kalemlerin GÜNCEL fiyatını sayfa metninde bul.\n${list}\n\nKurallar:\n- "quote" alanına fiyatın geçtiği cümleyi ya da tablo satırını sayfadan HARFİ HARFİNE kopyala (en fazla 200 karakter). Değiştirme, çevirme, kısaltma.\n- Kalem sayfada açıkça yoksa found=false yap, value ve quote null olsun.\n- value sadece sayı (binlik ayırıcı yok).\n\nSadece şu JSON'u döndür:\n{"items":[{"key":"...","found":true,"value":13200,"currency":"Ft","quote":"..."}]}\n\n--- SAYFA METNİ ---\n${text.slice(0, MAX_CHARS)}`;
}

export async function run({ prices, fetchImpl = fetch, apiFetch = fetch, today = new Date().toISOString().slice(0, 10) }) {
  const meter = new Meter(MAX_USD);
  const items = Object.entries(prices.items || {}).filter(([, i]) => i.tier === "resmi" && i.source);
  const byUrl = new Map();
  for (const e of items) { const u = e[1].source; if (!byUrl.has(u)) byUrl.set(u, []); byUrl.get(u).push(e); }
  const status = { lastRun: today, items: {} }, changes = [];
  const next = JSON.parse(JSON.stringify(prices));
  for (const [url, group] of byUrl) {
    let text;
    try { text = await fetchPage(url, fetchImpl); }
    catch (e) { for (const [k] of group) status.items[k] = { status: "okunamadi", note: "Sayfa açılamadı: " + e.message }; continue; }
    if (text.length < 200) { for (const [k] of group) status.items[k] = { status: "okunamadi", note: "Sayfa metni çok kısa, içerik sonradan yükleniyor olabilir" }; continue; }
    let answer;
    try {
      const r = await ask({ model: MODELS.ucuz, system: SYSTEM, prompt: buildPrompt(url, group, text), maxTokens: 1500, meter, fetchImpl: apiFetch });
      answer = parseJson(r.text);
    } catch (e) {
      if (e instanceof NoKeyError) throw e;
      for (const [k] of group) status.items[k] = { status: "hata", note: e.message.slice(0, 200) };
      if (/Bütçe/.test(e.message)) break; else continue;
    }
    const got = new Map((answer.items || []).map((x) => [x.key, x]));
    for (const [k, old] of group) {
      const a = got.get(k);
      if (!a || !a.found) { status.items[k] = { status: "bulunamadi", note: "Kalem sayfada bulunamadı, kaynak değişmiş olabilir" }; continue; }
      const v = verify(text, a.quote, a.value);
      if (v !== "ok") { status.items[k] = { status: "dogrulanamadi", note: v, seen: a.value ?? null }; continue; }
      const jump = Math.abs(a.value / old.value - 1);
      if (a.value === old.value) { status.items[k] = { status: "ayni", quote: a.quote, checked: today }; continue; }
      status.items[k] = { status: "degisti", from: old.value, to: a.value, quote: a.quote, checked: today, buyukDegisim: jump > 0.5 };
      next.items[k] = { ...old, value: a.value, checked: today, previous: old.value };
      changes.push({ key: k, label: old.label, from: old.value, to: a.value, currency: old.currency, quote: a.quote, url, bigJump: jump > 0.5 });
    }
  }
  if (changes.length) next.updated = today;
  status.cost = meter.summary();
  return { next, status, changes, meter };
}

export function report({ status, changes, meter }) {
  const L = ["# Bilet robotu raporu", ""];
  if (changes.length) {
    L.push(`**${changes.length} fiyat değişmiş görünüyor.** Her satırdaki bağlantıyı açıp alıntıyı kontrol et, doğruysa \"Merge pull request\" düğmesine bas.`, "", "| Kalem | Eski | Yeni | Sayfadaki alıntı | Kaynak |", "| --- | --- | --- | --- | --- |");
    for (const c of changes) L.push(`| ${c.label}${c.bigJump ? " ⚠️ %50'den büyük değişim" : ""} | ${c.from} ${c.currency} | **${c.to} ${c.currency}** | "${c.quote.replace(/\|/g, "/")}" | [sayfa](${c.url}) |`);
  } else L.push("Değişen fiyat yok.");
  const bad = Object.entries(status.items).filter(([, s]) => !["ayni", "degisti"].includes(s.status));
  if (bad.length) { L.push("", "Kontrol edilemeyenler (fiyatları değiştirilmedi):", ""); for (const [k, s] of bad) L.push(`- ${k}: ${s.status}${s.note ? " — " + s.note : ""}`); }
  L.push("", `Maliyet: ${meter.summary()}`);
  return L.join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  (async () => {
    if (!hasKey()) { console.log("ANTHROPIC_API_KEY yok: bilet robotu atlandı (kurulum tamamlanınca çalışacak)."); return; }
    const prices = JSON.parse(await readFile("prices.json", "utf8"));
    const r = await run({ prices });
    await writeFile("price-status.json", JSON.stringify(r.status, null, 2) + "\n");
    if (r.changes.length) await writeFile("prices.json", JSON.stringify(r.next, null, 2) + "\n");
    const md = report(r); await writeFile("bilet-raporu.md", md + "\n"); console.log(md);
    if (process.env.GITHUB_STEP_SUMMARY) await writeFile(process.env.GITHUB_STEP_SUMMARY, md + "\n", { flag: "a" });
  })().catch((e) => { console.error("HATA:", e.message); process.exit(1); });
}
