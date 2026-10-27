// DENETÇİ
// Her sabah çalışır: veriler eskidi mi, robotlar hata verdi mi, site açılıyor mu, kaynak bağlantıları
// kırıldı mı? Sorun bulursa GitHub'da tek bir "Denetçi" kaydı (issue) açar ya da günceller; GitHub bunu
// sana e-postayla bildirir. Her şey düzelince kaydı kendisi kapatır. Yapay zekâ kullanmaz, ücretsizdir.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const DAY = 86400000;
export const LIMITS = { kurIsGunu: 4, ucusGun: 9, biletGun: 10 };

const ageDays = (iso, now) => { const t = Date.parse(iso); return Number.isFinite(t) ? Math.floor((now - t) / DAY) : null; };
async function readJson(f) { try { return JSON.parse(await readFile(f, "utf8")); } catch (e) { return { __error: e.code === "ENOENT" ? "yok" : "bozuk: " + e.message }; } }

// İş günü farkı (hafta sonu sayılmaz): ECB hafta sonu kur yayınlamaz
export function businessDaysSince(iso, now) {
  const t = Date.parse(iso + "T00:00:00Z"); if (!Number.isFinite(t)) return null;
  let n = 0; for (let d = t + DAY; d <= now; d += DAY) { const w = new Date(d).getUTCDay(); if (w !== 0 && w !== 6) n++; }
  return n;
}

export async function checkFiles({ now = Date.now(), files = {}, hasAnthropic = false, hasTravelpayouts = false }) {
  const issues = [], ok = [], info = [];
  const data = files["data.json"], flights = files["flights.json"], prices = files["prices.json"], status = files["price-status.json"], idx = files["sehirler/index.json"];

  if (data.__error) issues.push(`data.json ${data.__error}`);
  else { const b = businessDaysSince(data.updated, now); if (b == null) issues.push("data.json tarih alanı okunamadı"); else if (b > LIMITS.kurIsGunu) issues.push(`Kur ${b} iş günüdür güncellenmedi (son: ${data.updated}). Kur Bekçisi çalışmıyor olabilir.`); else ok.push(`Kur güncel (${data.updated})`); }

  if (!hasTravelpayouts) issues.push("TRAVELPAYOUTS_TOKEN gizli anahtarı tanımlı değil: Uçuş Robotu çalışamaz.");
  if (flights.__error === "yok") info.push("flights.json henüz yok: Uçuş Robotu ilk kez çalışınca oluşacak.");
  else if (flights.__error) issues.push(`flights.json ${flights.__error}`);
  else { const a = ageDays(flights.generated, now); const n = Object.values(flights.cities || {}).filter((c) => c.minEur != null).length;
    if (a > LIMITS.ucusGun) issues.push(`Uçuş verisi ${a} gündür güncellenmedi.`); else ok.push(`Uçuş verisi güncel (${a} gün, ${n} şehirde fiyat var)`);
    if (n < 10) issues.push(`Uçuş verisinde yalnızca ${n} şehirde fiyat var, jeton ya da API sorunlu olabilir.`); }

  if (prices.__error) issues.push(`prices.json ${prices.__error}`);
  if (!hasAnthropic) info.push("ANTHROPIC_API_KEY tanımlı değil: Bilet Robotu, Şehir Araştırmacısı ve İçerik Robotu bekliyor.");
  else if (status.__error || !status.lastRun) info.push("Bilet Robotu henüz hiç çalışmadı.");
  else { const a = ageDays(status.lastRun, now); if (a > LIMITS.biletGun) issues.push(`Bilet Robotu ${a} gündür çalışmadı.`); else ok.push(`Bilet Robotu son çalışma: ${status.lastRun}`);
    const bad = Object.entries(status.items || {}).filter(([, s]) => ["okunamadi", "dogrulanamadi", "bulunamadi", "hata"].includes(s.status));
    if (bad.length) info.push(`Bilet Robotu ${bad.length} kalemi doğrulayamadı: ${bad.map(([k, s]) => `${k} (${s.status})`).join(", ")}`); }

  if (idx.__error && idx.__error !== "yok") issues.push(`sehirler/index.json ${idx.__error}`);
  else if (!idx.__error) for (const e of idx.sehirler || []) { const f = files[e.file]; if (!f || f.__error) issues.push(`${e.file} okunamadı`); }
  return { issues, ok, info };
}

export async function checkWeb({ siteUrl, prices, fetchImpl = fetch }) {
  const issues = [], ok = [];
  const get = async (u) => { const c = new AbortController(); const t = setTimeout(() => c.abort(), 20000); try { return await fetchImpl(u, { signal: c.signal, redirect: "follow", headers: { "user-agent": "Mozilla/5.0 (compatible; 72hGetawayDenetci/1.0)" } }); } finally { clearTimeout(t); } };
  try { const r = await get(siteUrl); const txt = await r.text(); if (!r.ok) issues.push(`Site açılmıyor: HTTP ${r.status} (${siteUrl})`); else if (!/72h/i.test(txt)) issues.push("Site açılıyor ama içerik beklenen gibi değil"); else ok.push("Site açık"); }
  catch (e) { issues.push(`Siteye ulaşılamadı: ${e.message}`); }
  const urls = [...new Set(Object.values((prices && prices.items) || {}).map((i) => i.source).filter(Boolean))];
  const broken = [];
  for (const u of urls) { try { const r = await get(u); if (r.status === 404 || r.status === 410) broken.push(`${u} (HTTP ${r.status})`); } catch {} }
  if (broken.length) issues.push(`Kırık kaynak bağlantısı: ${broken.join(", ")}`); else if (urls.length) ok.push(`${urls.length} kaynak bağlantısı açılıyor ya da geçici olarak ulaşılamadı`);
  return { issues, ok };
}

// GitHub Actions'ta her robotun son çalışmasının sonucuna bakar
export async function checkRuns({ repo, token, fetchImpl = fetch }) {
  const issues = [], ok = [];
  if (!repo || !token) return { issues, ok };
  const res = await fetchImpl(`https://api.github.com/repos/${repo}/actions/runs?per_page=50&exclude_pull_requests=true`, { headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json" } });
  if (!res.ok) return { issues: [`GitHub çalışma listesi okunamadı (HTTP ${res.status})`], ok };
  const runs = (await res.json()).workflow_runs || [], last = new Map();
  for (const r of runs) if (!last.has(r.name) && r.status === "completed") last.set(r.name, r);
  for (const [name, r] of last) { if (name.startsWith("Denetçi")) continue; if (r.conclusion === "failure") issues.push(`"${name}" son çalışmada hata verdi: ${r.html_url}`); else ok.push(`${name}: ${r.conclusion}`); }
  return { issues, ok };
}

export function toMarkdown(r, nowIso) {
  const L = [`Denetçi raporu (${nowIso.slice(0, 16).replace("T", " ")} UTC)`, ""];
  if (r.issues.length) { L.push("## ❌ Sorunlar", ""); r.issues.forEach((x) => L.push("- " + x)); L.push(""); }
  if (r.info.length) { L.push("## ℹ️ Bilgi", ""); r.info.forEach((x) => L.push("- " + x)); L.push(""); }
  if (r.ok.length) { L.push("## ✅ Yolunda", ""); r.ok.forEach((x) => L.push("- " + x)); }
  return L.join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  (async () => {
    const files = {};
    for (const f of ["data.json", "flights.json", "prices.json", "price-status.json", "sehirler/index.json"]) files[f] = await readJson(f);
    if (!files["sehirler/index.json"].__error) for (const e of files["sehirler/index.json"].sehirler || []) files[e.file] = await readJson(e.file);
    const repo = process.env.GITHUB_REPOSITORY || "atayk-creator/72h-getaway-2";
    const [owner, name] = repo.split("/");
    const a = await checkFiles({ files, hasAnthropic: Boolean(process.env.HAS_ANTHROPIC), hasTravelpayouts: Boolean(process.env.HAS_TRAVELPAYOUTS) });
    const b = await checkWeb({ siteUrl: process.env.SITE_URL || `https://${owner}.github.io/${name}/`, prices: files["prices.json"] });
    const c = await checkRuns({ repo, token: process.env.GITHUB_TOKEN });
    const r = { issues: [...a.issues, ...b.issues, ...c.issues], info: a.info, ok: [...a.ok, ...b.ok, ...c.ok] };
    const md = toMarkdown(r, new Date().toISOString());
    await writeFile("denetci-raporu.md", md + "\n"); console.log(md);
    if (process.env.GITHUB_OUTPUT) await writeFile(process.env.GITHUB_OUTPUT, `sorun=${r.issues.length}\n`, { flag: "a" });
    if (process.env.GITHUB_STEP_SUMMARY) await writeFile(process.env.GITHUB_STEP_SUMMARY, md + "\n", { flag: "a" });
  })().catch((e) => { console.error("HATA:", e.message); process.exit(1); });
}
