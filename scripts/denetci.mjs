// Denetçi: robotların ve sitenin sağlığını her gün kontrol eder. Ücretli API kullanmaz (sadece GitHub API ve sitenin kendisi).
// Kontroller:
//  - kur (data.json) son 4 iş gününde güncellenmiş mi
//  - otel robotu (data/otel-fiyatlari.json > sonCalisma.tarih) son 5 günde çalışmış mı
//  - uçak robotu (data/ucuslar.json > guncellendi) son 9 günde, restoran robotu (data/restoranlar.json) son 40 günde
//  - her şehirde önümüzdeki 2 hafta sonu için kullanılabilir otel fiyatı oranı en az %60 mı
//  - gelecek hafta sonlarının hiçbirinde kullanılabilir fiyatı olmayan oteller
//  - her iş akışının son tamamlanan çalışması "failure" mı (GitHub REST API, GITHUB_TOKEN, actions: read)
//  - https://72hgetaway.com/ açılıyor mu (HTTPS sorunları ayrıca yazılır)
//  - tablo aktarımının raporunda (data/tablo-rapor.json) hata var mı
// Sonuç: denetci-rapor.md (Türkçe markdown) ve GITHUB_OUTPUT'a sorun=1/0. Issue'yu iş akışı gh ile açar/kapatır.
import { readFile, writeFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { istanbulToday, upcomingWeekends, usable, citySlug, categoryWarnings } from "./otel-fiyatlari.mjs";

export const SITE = "https://72hgetaway.com/";
export const LIMITS = { kurIsGunu: 4, otelGun: 5, ucusGun: 9, restoranGun: 40, kapsama: 0.6, haftaSonu: 2 };
const DAY = 86400000;
const toDate = (s) => new Date(String(s).slice(0, 10) + "T00:00:00Z");
const iso = (d) => d.toISOString().slice(0, 10);

// ECB (TARGET) tatilleri: 1 Ocak, Kutsal Cuma, Paskalya Pazartesisi, 1 Mayıs, 25-26 Aralık
function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return Date.UTC(y, month - 1, day);
}
export function isEcbHoliday(isoDate) {
  const d = toDate(isoDate), y = d.getUTCFullYear(), md = isoDate.slice(5, 10);
  if (["01-01", "05-01", "12-25", "12-26"].includes(md)) return true;
  const e = easter(y);
  return d.getTime() === e - 2 * DAY || d.getTime() === e + DAY;
}
// fromIso'dan sonra, toIso dahil kaç iş günü geçti (hafta sonu ve ECB tatilleri sayılmaz)
export function businessDaysBetween(fromIso, toIso) {
  let n = 0;
  for (let t = toDate(fromIso).getTime() + DAY; t <= toDate(toIso).getTime(); t += DAY) {
    const d = new Date(t), wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6 && !isEcbHoliday(iso(d))) n++;
  }
  return n;
}
const daysSince = (stamp, now) => (stamp ? (now.getTime() - new Date(stamp).getTime()) / DAY : Infinity);
const fmtDays = (x) => (x === Infinity ? "hiç" : `${Math.floor(x)} gün önce`);

// ---------- veri kontrolleri ----------
export function checkData({ now, rates, hotelMeta, hotelsDoc, cityFiles, flights, restaurants, tabloRapor }) {
  const today = istanbulToday(now), sorunlar = [], uyarilar = [], bilgi = [];
  // kur
  if (!rates || !rates.updated) sorunlar.push("Kur dosyası (data.json) okunamadı ya da tarihi yok.");
  else {
    const bd = businessDaysBetween(rates.updated, today);
    if (bd > LIMITS.kurIsGunu) sorunlar.push(`Kur ${bd} iş günüdür güncellenmedi (son: ${rates.updated}). "Kur güncelle" iş akışına bak.`);
    else bilgi.push(`Kur güncel (${rates.updated}).`);
  }
  // robotların son çalışması
  const stale = [
    ["Otel fiyat robotu", hotelMeta && hotelMeta.sonCalisma && hotelMeta.sonCalisma.tarih, LIMITS.otelGun, "data/otel-fiyatlari.json > sonCalisma"],
    ["Uçak fiyat robotu", flights && flights.guncellendi, LIMITS.ucusGun, "data/ucuslar.json > guncellendi"],
    ["Restoran robotu", restaurants && restaurants.guncellendi, LIMITS.restoranGun, "data/restoranlar.json > guncellendi"],
  ];
  for (const [ad, t, lim, yer] of stale) {
    const d = daysSince(t, now);
    if (d > lim) sorunlar.push(`${ad} ${lim} günden uzun süredir veri yazmadı (son: ${t ? String(t).slice(0, 16).replace("T", " ") : "yok"}, ${fmtDays(d)}; ${yer}).`);
    else bilgi.push(`${ad}: son veri ${fmtDays(d)}.`);
  }
  // otel fiyat kapsaması: önümüzdeki 2 hafta sonu
  if (hotelsDoc && cityFiles) {
    const next = upcomingWeekends(today, LIMITS.haftaSonu).map((w) => w.giris);
    const low = [], dead = [], waiting = [];
    for (const c of hotelsDoc.sehirler) {
      const f = cityFiles[citySlug(c.sehir)] || { haftaSonlari: {} }, hs = f.haftaSonlari || {};
      const per = next.map((g) => c.oteller.filter((h) => usable(hs[g] && hs[g].oteller && hs[g].oteller[h.id] && hs[g].oteller[h.id].son)).length);
      const ok = per.reduce((a, b) => a + b, 0), all = c.oteller.length * next.length;
      if (all && ok / all < LIMITS.kapsama) low.push(`${c.sehir}: %${Math.round((100 * ok) / all)} (${next.map((g, i) => `${g.slice(5)}: ${per[i]}/${c.oteller.length}`).join(", ")})`);
      const future = Object.entries(hs).filter(([g, w]) => (w.cikis || g) >= today);
      for (const h of c.oteller) {
        const recs = future.map(([, w]) => w.oteller && w.oteller[h.id] && w.oteller[h.id].son).filter(Boolean);
        if (!recs.length) { waiting.push(`${c.sehir} / ${h.ad}`); continue; }
        if (!recs.some(usable)) {
          const k = recs.reduce((a, s) => ((a[s.supheli ? "şüpheli" : s.durum] = (a[s.supheli ? "şüpheli" : s.durum] || 0) + 1), a), {});
          dead.push(`${c.sehir} / ${h.ad} (${h.kategori}): ${Object.entries(k).map(([d, n]) => `${n} ${d}`).join(", ")}`);
        }
      }
    }
    if (low.length) sorunlar.push(`Önümüzdeki ${next.length} hafta sonu (${next.join(", ")}) için kullanılabilir otel fiyatı %${LIMITS.kapsama * 100}'ın altında olan şehirler:\n${low.map((x) => "  - " + x).join("\n")}`);
    else bilgi.push(`Otel fiyat kapsaması: her şehirde önümüzdeki ${next.length} hafta sonu için en az %${LIMITS.kapsama * 100}.`);
    if (dead.length) sorunlar.push(`Gelecek hafta sonlarının hiçbirinde kullanılabilir fiyatı olmayan oteller (değiştirmeyi düşün):\n${dead.map((x) => "  - " + x).join("\n")}`);
    if (waiting.length) bilgi.push(`Henüz hiç kontrol edilmemiş oteller (yeni eklenmiş olabilir): ${waiting.join(", ")}.`);
    const kat = hotelsDoc.sehirler.flatMap((c) => categoryWarnings({ sehirler: [c] }, (cityFiles[citySlug(c.sehir)] || {}).haftaSonlari || {}));
    if (kat.length) uyarilar.push(...kat);
  }
  // tablo aktarımı
  if (tabloRapor && Array.isArray(tabloRapor.hatalar) && tabloRapor.hatalar.length) sorunlar.push(`Tablo aktarımı hata verdi (${String(tabloRapor.tarih || "").slice(0, 10)}):\n${tabloRapor.hatalar.map((x) => "  - " + x).join("\n")}`);
  return { sorunlar, uyarilar, bilgi };
}

// ---------- iş akışları (GitHub REST API) ----------
export async function checkWorkflows({ repo, token, fetchImpl = fetch, self = "denetci.yml" }) {
  const sorunlar = [], bilgi = [];
  if (!repo || !token) return { sorunlar, bilgi: ["İş akışları kontrol edilmedi (GITHUB_REPOSITORY / GITHUB_TOKEN yok)."] };
  const api = (path) => fetchImpl(`https://api.github.com/repos/${repo}${path}`, { headers: { accept: "application/vnd.github+json", authorization: `Bearer ${token}`, "x-github-api-version": "2022-11-28", "user-agent": "72h-denetci" } });
  try {
    const r = await api("/actions/workflows?per_page=100");
    if (!r.ok) return { sorunlar: [`GitHub iş akışı listesi okunamadı (HTTP ${r.status}).`], bilgi };
    const { workflows = [] } = await r.json();
    for (const w of workflows) {
      if (w.state !== "active" || String(w.path || "").endsWith("/" + self)) continue;
      const rr = await api(`/actions/workflows/${w.id}/runs?status=completed&per_page=1`);
      if (!rr.ok) { sorunlar.push(`"${w.name}" çalışmaları okunamadı (HTTP ${rr.status}).`); continue; }
      const run = ((await rr.json()).workflow_runs || [])[0];
      if (!run) continue;
      if (run.conclusion === "failure") sorunlar.push(`"${w.name}" iş akışının son çalışması başarısız (${String(run.updated_at || run.created_at || "").slice(0, 16).replace("T", " ")}): ${run.html_url}`);
    }
    bilgi.push(`${workflows.length} iş akışı kontrol edildi.`);
  } catch (e) {
    sorunlar.push(`GitHub API'ye ulaşılamadı: ${e.message}`);
  }
  return { sorunlar, bilgi };
}

// ---------- site ----------
const TLS = /CERT|SSL|TLS|self[- ]signed|altname|certificate|ERR_TLS/i;
export async function checkSite({ url = SITE, fetchImpl = fetch, timeoutMs = 20000 }) {
  const get = async (u) => {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), timeoutMs);
    try { return await fetchImpl(u, { redirect: "follow", signal: ctl.signal, headers: { "user-agent": "72h-denetci" } }); } finally { clearTimeout(t); }
  };
  try {
    const r = await get(url);
    if (r.ok) return { sorunlar: [], bilgi: [`Site açılıyor (${url}, HTTP ${r.status}).`] };
    return { sorunlar: [`Site hata veriyor: ${url} HTTP ${r.status}.`], bilgi: [] };
  } catch (e) {
    const why = [e && e.message, e && e.cause && (e.cause.code || e.cause.message)].filter(Boolean).join(" / ");
    if (TLS.test(why)) {
      let http = "";
      try { const h = await get(url.replace(/^https:/, "http:")); http = ` HTTP ile açılıyor mu: ${h.ok ? "evet" : "hayır"} (HTTP ${h.status}).`; } catch { http = " HTTP ile de açılmıyor."; }
      return { sorunlar: [`HTTPS sorunu: ${url} güvenli bağlantı kuramıyor (${why}).${http} GitHub > Settings > Pages > "Enforce HTTPS" ve sertifika durumuna bak.`], bilgi: [] };
    }
    return { sorunlar: [`Site açılmıyor: ${url} (${why || "bilinmeyen hata"}).`], bilgi: [] };
  }
}

// ---------- rapor ----------
export function toMarkdown({ now, sorunlar, uyarilar, bilgi }) {
  const p = [`# Denetçi raporu`, "", `Kontrol: ${now.toISOString().slice(0, 16).replace("T", " ")} UTC.`, ""];
  if (sorunlar.length) p.push(`## Sorunlar (${sorunlar.length})`, "", ...sorunlar.map((x) => "- " + x), "");
  else p.push("Her şey yolunda, sorun bulunmadı.", "");
  if (uyarilar.length) p.push("## Uyarılar", "", ...uyarilar.map((x) => "- " + x), "");
  if (bilgi.length) p.push("## Bilgi", "", ...bilgi.map((x) => "- " + x), "");
  p.push("_Bu rapor `scripts/denetci.mjs` tarafından her gün yazılır. Sorunlar giderilince Denetçi bu kaydı kendisi kapatır._");
  return p.join("\n");
}

export async function run({ now = new Date(), files, fetchImpl = fetch, repo, token, site = SITE }) {
  const d = checkData({ now, ...files });
  const w = await checkWorkflows({ repo, token, fetchImpl });
  const s = await checkSite({ url: site, fetchImpl });
  const out = { now, sorunlar: [...d.sorunlar, ...w.sorunlar, ...s.sorunlar], uyarilar: d.uyarilar, bilgi: [...d.bilgi, ...w.bilgi, ...s.bilgi] };
  return { ...out, markdown: toMarkdown(out) };
}

async function readJson(path, fallback = null) { try { return JSON.parse(await readFile(path, "utf8")); } catch (e) { if (e.code === "ENOENT") return fallback; throw e; } }

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL("..", import.meta.url));
  (async () => {
    const hotelsDoc = await readJson(root + "data/hotels.json");
    const cityFiles = {};
    for (const f of await readdir(root + "data/fiyatlar").catch(() => [])) if (f.endsWith(".json")) cityFiles[f.replace(/\.json$/, "")] = await readJson(root + "data/fiyatlar/" + f);
    const files = {
      rates: await readJson(root + "data.json"), hotelMeta: await readJson(root + "data/otel-fiyatlari.json"), hotelsDoc, cityFiles,
      flights: await readJson(root + "data/ucuslar.json"), restaurants: await readJson(root + "data/restoranlar.json"), tabloRapor: await readJson(root + "data/tablo-rapor.json"),
    };
    const out = await run({ files, repo: process.env.GITHUB_REPOSITORY, token: process.env.GITHUB_TOKEN });
    console.log(out.markdown);
    await writeFile(process.env.DENETCI_RAPOR || "denetci-rapor.md", out.markdown + "\n");
    if (process.env.GITHUB_STEP_SUMMARY) await writeFile(process.env.GITHUB_STEP_SUMMARY, out.markdown + "\n", { flag: "a" });
    if (process.env.GITHUB_OUTPUT) await writeFile(process.env.GITHUB_OUTPUT, `sorun=${out.sorunlar.length ? 1 : 0}\n`, { flag: "a" });
  })().catch((e) => { console.error("HATA:", e.message); process.exit(1); });
}
