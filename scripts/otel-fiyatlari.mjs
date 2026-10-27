// Otel fiyat robotu: data/hotels.json'daki otellerin Cuma-Pazar (2 gece, 2 kişi) fiyatlarını
// Google Hotels'ten çeker. Google Hotels'i Apify'daki hazır robot okur (eiv/google-hotels-scraper).
// Kaynak: https://apify.com/eiv/google-hotels-scraper
// Kademeli takvim: yakın hafta sonları sık, uzak hafta sonları seyrek kontrol edilir (ayrıntı hotels.json'da).
// Yapay zekâ kullanmaz. Fiyat bulunamazsa tahmin yürütmez: "dolu", "bulunamadı" ya da "hata" yazar.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

export const API = "https://api.apify.com/v2";
export const ACTOR = "eiv~google-hotels-scraper";
// Apify ücretsiz plan fiyatı (1.000 otel başına): otel 1,25 $ + rezervasyon sitesi fiyatları 2,50 $.
// Otel adıyla arandığında rezervasyon sitesi fiyatları her zaman gelir, o yüzden ikisi birlikte sayılır.
export const COST_PER_LOOKUP_USD = 0.00125 + 0.0025;

const DAY_NO = { Paz: 0, Pzt: 1, Sal: 2, Car: 3, "Çar": 3, Per: 4, Cum: 5, Cmt: 6 };
const DAY_NAME = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
const DAY_MS = 86400000;
const TERMINAL = new Set(["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"]);
const num = (x) => typeof x === "number" && Number.isFinite(x);
const r2 = (x) => Math.round(x * 100) / 100;
const iso = (d) => d.toISOString().slice(0, 10);
const toDate = (s) => new Date(s + "T00:00:00Z");
const addDays = (s, n) => iso(new Date(toDate(s).getTime() + n * DAY_MS));

// ---------- tarih ve takvim ----------

// Robot İstanbul saatine göre çalışır (GitHub'ın saati UTC).
export function istanbulToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
export const weekday = (s) => toDate(s).getUTCDay();

// Bugünden itibaren gelen Cuma'lar. Cuma günü çalışırsa o hafta sonu da dahil (son dakika fiyatı).
export function upcomingWeekends(todayIso, count) {
  let f = todayIso;
  while (weekday(f) !== 5) f = addDays(f, 1);
  return Array.from({ length: count }, (_, i) => { const giris = addDays(f, i * 7); return { no: i + 1, giris, cikis: addDays(giris, 2) }; });
}

// İki haftada bir kontrol için hafta numarası (haftalar Pazartesi başlar)
export function weekIndex(todayIso) { return Math.floor((toDate(todayIso).getTime() / DAY_MS - 4) / 7); }

export function tierOf(no, giris, settings) {
  if ((settings.ozel_tarihler || []).includes(giris)) return { ...settings.kontrol_takvimi[0], ozel: true };
  return settings.kontrol_takvimi.find((t) => no >= t.ilk && no <= t.son) || null;
}

// mod: "takvim" (bugünün planı), "test" (sadece en yakın hafta sonu), "hepsi" (tüm hafta sonları)
export function planFor(todayIso, settings, mode = "takvim") {
  const all = upcomingWeekends(todayIso, settings.kac_hafta_sonu || 26).map((w) => ({ ...w, kademe: (tierOf(w.no, w.giris, settings) || {}).kademe || null }));
  if (mode === "test") return all.slice(0, 1);
  if (mode === "hepsi") return all;
  if (mode !== "takvim") throw new Error(`Bilinmeyen mod: ${mode} (takvim, test ya da hepsi olmalı)`);
  const wd = weekday(todayIso), even = weekIndex(todayIso) % 2 === 0;
  return all.filter((w) => {
    const t = tierOf(w.no, w.giris, settings);
    if (!t) return false;
    const days = (t.gunler || []).map((g) => DAY_NO[g]);
    return days.includes(wd) && (!t.iki_haftada_bir || even);
  });
}

// 28 günlük takvimi çalıştırıp aylık sorgu ve maliyeti hesaplar (bütçe kontrolü için)
export function estimateMonthly(settings, hotelCount, startIso = "2026-11-02") {
  let checks = 0;
  for (let i = 0; i < 28; i++) checks += planFor(addDays(startIso, i), settings, "takvim").length;
  const sorgu = Math.round((checks * hotelCount * 30) / 28);
  return { sorgu, usd: r2(sorgu * COST_PER_LOOKUP_USD) };
}

// ---------- Apify ----------

const redact = (s, token) => (token ? String(s).split(token).join("***") : String(s));

async function call(fetchImpl, url, token, init = {}) {
  const res = await fetchImpl(url, { ...init, headers: { accept: "application/json", "content-type": "application/json", authorization: "Bearer " + token, ...(init.headers || {}) } });
  const text = await res.text();
  if (res.status === 401 || res.status === 403) { const e = new Error("Apify anahtarı (APIFY_TOKEN) geçersiz ya da yetkisiz"); e.fatal = true; throw e; }
  if (res.status === 402 || /not-enough-usage|usage limit|insufficient/i.test(text)) { const e = new Error("Apify kredisi yetmiyor (aylık ücretsiz 5 $ bitmiş olabilir)"); e.fatal = true; throw e; }
  if (res.status === 429) throw new Error("Apify istek sınırı aşıldı (HTTP 429)");
  if (!res.ok) throw new Error(redact(`Apify HTTP ${res.status}: ${text.slice(0, 200)}`, token));
  try { return JSON.parse(text); } catch { throw new Error(redact(`Apify yanıtı okunamadı: ${text.slice(0, 200)}`, token)); }
}

// Robotu başlatır, bitmesini bekler, sonuç satırlarını döndürür. Anahtar adrese yazılmaz, başlıkla gider.
export async function runActor(input, { token, fetchImpl = fetch, sleep, maxPolls = 20 }) {
  let j = await call(fetchImpl, `${API}/acts/${ACTOR}/runs?waitForFinish=60`, token, { method: "POST", body: JSON.stringify(input) });
  let run = j && j.data;
  if (!run || !run.id) throw new Error("Apify çalışması başlatılamadı");
  for (let i = 0; !TERMINAL.has(run.status); i++) {
    if (i >= maxPolls) throw new Error("Apify çalışması zamanında bitmedi");
    if (sleep) await sleep(1000);
    j = await call(fetchImpl, `${API}/actor-runs/${run.id}?waitForFinish=60`, token);
    run = j && j.data;
    if (!run) throw new Error("Apify çalışma durumu okunamadı");
  }
  if (run.status !== "SUCCEEDED") throw new Error(`Apify çalışması başarısız: ${run.status}`);
  const items = await call(fetchImpl, `${API}/datasets/${run.defaultDatasetId}/items?clean=true&format=json`, token);
  return Array.isArray(items) ? items : [];
}

export function actorInput(hotels, weekend, settings, ids = {}) {
  return {
    hotels: hotels.map((h) => ids[h.id] || h.arama),
    checkInDate: weekend.giris,
    checkOutDate: weekend.cikis,
    adults: settings.kisi || 2,
    currency: settings.para_birimi || "EUR",
    country: settings.pazar || "tr",
    language: "en",
    maxConcurrency: 4,
  };
}

// ---------- sonuçları otellerle eşleştirme ----------

const STOP = new Set(["hotel", "hotels", "budapest", "budapeste", "the", "and", "by", "a", "of", "boutique", "suites", "spa"]);
export const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const tokens = (s) => new Set(norm(s).split(" ").filter((t) => t && !STOP.has(t)));
export function nameScore(ours, theirs) {
  const a = tokens(ours), b = tokens(theirs);
  if (!a.size || !b.size) return 0;
  let n = 0; for (const t of a) if (b.has(t)) n++;
  return n / a.size;
}

export function matchRows(hotels, rows, ids = {}) {
  const pool = (rows || []).filter((r) => r && typeof r === "object" && r.recordType !== "summary");
  const used = new Set(), out = {};
  const take = (h, pred) => { const i = pool.findIndex((r, k) => !used.has(k) && pred(r)); if (i < 0) return false; used.add(i); out[h.id] = pool[i]; return true; };
  const asked = (r) => [r.input, r.query, r.searchQuery, r.hotelQuery, r.hotel].filter((x) => typeof x === "string").map(norm);
  for (const h of hotels) {
    const id = ids[h.id];
    if (id && take(h, (r) => r.hotelId === id)) continue;
    const want = [norm(h.arama), id ? norm(id) : null].filter(Boolean);
    take(h, (r) => asked(r).some((q) => want.includes(q)));
  }
  for (const h of hotels) {
    if (out[h.id]) continue;
    let best = -1, bestScore = 0;
    pool.forEach((r, k) => { if (used.has(k) || r.recordType === "error") return; const s = Math.max(nameScore(h.ad, r.name), nameScore(h.arama, r.name)); if (s > bestScore) { bestScore = s; best = k; } });
    if (best >= 0 && bestScore >= 0.6) { used.add(best); out[h.id] = pool[best]; }
  }
  for (const h of hotels) if (!out[h.id]) out[h.id] = null;
  return out;
}

// Tek satırı kayda çevirir. Fiyat = en ucuz toplam (2 gece, vergiler dahil gösterildiyse dahil).
export function toRecord(row, nights = 2, currency = "EUR") {
  if (!row) return { durum: "sonuc_yok", not: "Robot bu otel için satır döndürmedi" };
  if (row.recordType === "error") return { durum: row.errorCode === "NOT_FOUND" ? "bulunamadi" : "hata", not: row.errorCode || "bilinmeyen hata" };
  if (row.currency && row.currency !== currency) return { durum: "hata", not: `Para birimi ${row.currency}, beklenen ${currency}` };
  const options = (Array.isArray(row.bookingOptions) ? row.bookingOptions : []).map((o) => {
    const toplam = num(o.totalStayPrice) ? o.totalStayPrice : num(o.nightlyPrice) ? o.nightlyPrice * nights : null;
    return toplam == null ? null : { site: o.provider || "?", toplam, resmi: !!o.isOfficialSite, link: o.bookingUrl || null };
  }).filter(Boolean);
  const google = num(row.totalPrice) ? row.totalPrice : num(row.pricePerNight) ? row.pricePerNight * nights : null;
  const all = google == null ? options : [...options, { site: "Google Hotels", toplam: google, resmi: false, link: row.url || null }];
  const base = { googleKimlik: row.hotelId || null, puan: num(row.rating) ? row.rating : null, yildiz: row.hotelClass ?? null };
  if (!all.length) return { durum: "dolu", not: "Otel bulundu ama bu tarihler için fiyat yok (dolu ya da satışta değil)", ...base };
  const best = all.reduce((a, b) => (b.toplam < a.toplam ? b : a));
  const official = options.filter((o) => o.resmi).reduce((a, b) => (!a || b.toplam < a.toplam ? b : a), null);
  return {
    durum: "fiyat", fiyat: r2(best.toplam), gecelik: r2(best.toplam / nights), site: best.site, link: best.link || row.url || null,
    googleFiyat: google == null ? null : r2(google), resmiSiteFiyat: official ? r2(official.toplam) : null,
    firsat: row.deal || null, tipikGecelik: num(row.typicalPriceLow) && num(row.typicalPriceHigh) ? [row.typicalPriceLow, row.typicalPriceHigh] : null,
    ...base,
  };
}

// ---------- kayıt ----------

export function emptyState() {
  return { guncellendi: null, kaynak: "Google Hotels (Apify: eiv/google-hotels-scraper)", paraBirimi: "EUR", konaklama: "Cuma giriş, Pazar çıkış, 2 gece, 2 yetişkin", googleKimlik: {}, sonCalisma: null, haftaSonlari: {} };
}

const HISTORY_MAX = 60;
export function mergeWeekend(state, w, hotels, records, checkedAt, usedIds = {}) {
  const slot = (state.haftaSonlari[w.giris] ||= { cikis: w.cikis, oteller: {} });
  for (const h of hotels) {
    const rec = records[h.id];
    const o = (slot.oteller[h.id] ||= { son: null, gecmis: [] });
    o.son = { ...rec, kontrol: checkedAt };
    o.gecmis.push({ t: checkedAt, durum: rec.durum, fiyat: rec.fiyat ?? null });
    if (o.gecmis.length > HISTORY_MAX) o.gecmis.splice(0, o.gecmis.length - HISTORY_MAX);
    if (rec.googleKimlik) state.googleKimlik[h.id] = rec.googleKimlik;
    else if (rec.durum === "bulunamadi" && usedIds[h.id]) delete state.googleKimlik[h.id]; // kimlik bozulduysa bir dahakine adla ara
  }
}

// Bitmiş hafta sonlarını arşive taşır, ana dosya küçük kalır.
export function archivePast(state, archive, todayIso) {
  let moved = 0;
  for (const [giris, w] of Object.entries(state.haftaSonlari)) {
    if (w.cikis < todayIso) { archive.haftaSonlari[giris] = w; delete state.haftaSonlari[giris]; moved++; }
  }
  return moved;
}

// ---------- ana akış ----------

export async function run({ token, hotelsDoc, state = emptyState(), archive = { haftaSonlari: {} }, now = new Date(), mode = "takvim", fetchImpl = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  if (!token) throw new Error("APIFY_TOKEN tanımlı değil (GitHub > Settings > Secrets and variables > Actions bölümüne eklenmeli)");
  const settings = hotelsDoc.ayarlar, nights = 2, today = istanbulToday(now);
  state = { ...emptyState(), ...state, googleKimlik: { ...(state.googleKimlik || {}) }, haftaSonlari: { ...(state.haftaSonlari || {}) } };
  const plan = planFor(today, settings, mode);
  const report = { tarih: today, gun: DAY_NAME[weekday(today)], mod: mode, haftaSonlari: plan.map((w) => w.giris), sehirler: [], fiyat: 0, dolu: 0, bulunamadi: 0, hata: 0, sonuc_yok: 0, ucretliSatir: 0, tahminiMaliyetUsd: 0, hatalar: [] };
  const checkedAt = now.toISOString();
  let okRuns = 0, totalRuns = 0;
  outer: for (const city of hotelsDoc.sehirler) {
    report.sehirler.push(city.sehir);
    for (const w of plan) {
      totalRuns++;
      const ids = state.googleKimlik, usedIds = {};
      for (const h of city.oteller) if (ids[h.id]) usedIds[h.id] = ids[h.id];
      let records;
      try {
        const rows = await runActor(actorInput(city.oteller, w, settings, ids), { token, fetchImpl, sleep });
        const matched = matchRows(city.oteller, rows, ids);
        records = Object.fromEntries(city.oteller.map((h) => [h.id, toRecord(matched[h.id], nights, settings.para_birimi || "EUR")]));
        okRuns++;
      } catch (e) {
        const msg = redact(e.message, token);
        report.hatalar.push(`${city.sehir} ${w.giris}: ${msg}`);
        if (e.fatal) break outer; // anahtar ya da kredi sorunu: boşuna denemeye devam etme
        records = Object.fromEntries(city.oteller.map((h) => [h.id, { durum: "hata", not: msg }]));
      }
      mergeWeekend(state, w, city.oteller, records, checkedAt, usedIds);
      for (const rec of Object.values(records)) {
        report[rec.durum] = (report[rec.durum] || 0) + 1;
        if (rec.durum === "fiyat" || rec.durum === "dolu") report.ucretliSatir++;
      }
    }
  }
  if (totalRuns > 0 && okRuns === 0) throw new Error("Hiçbir kontrol başarılı olmadı: " + (report.hatalar[0] || "bilinmeyen hata"));
  report.tahminiMaliyetUsd = r2(report.ucretliSatir * COST_PER_LOOKUP_USD);
  report.arsivlenen = archivePast(state, archive, today);
  if (totalRuns > 0) { state.guncellendi = checkedAt; state.sonCalisma = { tarih: checkedAt, mod: mode, kontrol: report.ucretliSatir + report.bulunamadi + report.hata + report.sonuc_yok, fiyatli: report.fiyat, tahminiMaliyetUsd: report.tahminiMaliyetUsd }; }
  return { state, archive, report, plan };
}

export function toMarkdown({ report, plan, state, hotelsDoc }) {
  const eur = (n) => (n == null ? "" : `${Math.round(n)} €`);
  const p = [`# Otel fiyat robotu`, "", `Tarih: ${report.tarih} (${report.gun}), mod: ${report.mod}.`, ""];
  if (!plan.length) { p.push("Bugün takvime göre kontrol günü değil, hiçbir şey çekilmedi."); return p.join("\n"); }
  p.push(`Kontrol edilen hafta sonları: ${plan.map((w) => `${w.giris} (${w.kademe || "?"})`).join(", ")}`, "");
  p.push(`Sonuç: ${report.fiyat} fiyat, ${report.dolu} dolu, ${report.bulunamadi} bulunamadı, ${report.hata} hata. Tahmini maliyet: ${report.tahminiMaliyetUsd} $.`, "");
  const label = { fiyat: "", dolu: "dolu", bulunamadi: "bulunamadı", hata: "HATA", sonuc_yok: "sonuç yok" };
  for (const city of hotelsDoc.sehirler) {
    p.push(`## ${city.sehir}`, "", "| Otel | Kategori | " + plan.map((w) => w.giris.slice(5)).join(" | ") + " |", "| --- | --- | " + plan.map(() => "---").join(" | ") + " |");
    for (const h of city.oteller) {
      const cells = plan.map((w) => { const s = state.haftaSonlari[w.giris]?.oteller[h.id]?.son; return !s ? "" : s.durum === "fiyat" ? `${eur(s.fiyat)} (${s.site})` : label[s.durum] || s.durum; });
      p.push(`| ${h.ad} | ${h.kategori} | ${cells.join(" | ")} |`);
    }
    p.push("");
  }
  if (report.hatalar.length) p.push("Hatalar:", ...report.hatalar.map((x) => "- " + x), "");
  p.push("Not: Fiyatlar 2 yetişkin, Cuma-Pazar 2 gece içindir ve kontrol anındaki en ucuz tekliftir. Rezervasyondan önce güncel fiyata bak.");
  return p.join("\n");
}

async function readJson(path, fallback) { try { return JSON.parse(await readFile(path, "utf8")); } catch (e) { if (e.code === "ENOENT") return fallback; throw e; } }

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const P = { hotels: root + "data/hotels.json", state: root + "data/otel-fiyatlari.json", archive: root + "data/otel-fiyat-arsivi.json" };
  (async () => {
    const hotelsDoc = await readJson(P.hotels);
    const mode = (process.env.MOD || "takvim").trim();
    const out = await run({ token: process.env.APIFY_TOKEN, hotelsDoc, state: await readJson(P.state, emptyState()), archive: await readJson(P.archive, { haftaSonlari: {} }), mode });
    const md = toMarkdown({ ...out, hotelsDoc }); console.log(md);
    if (process.env.GITHUB_STEP_SUMMARY) await writeFile(process.env.GITHUB_STEP_SUMMARY, md + "\n", { flag: "a" });
    if (!out.plan.length) return;
    await mkdir(dirname(P.state), { recursive: true });
    await writeFile(P.state, JSON.stringify(out.state, null, 1) + "\n");
    if (out.report.arsivlenen) await writeFile(P.archive, JSON.stringify(out.archive, null, 1) + "\n");
  })().catch((e) => { console.error("HATA:", redact(e.message, process.env.APIFY_TOKEN)); process.exit(1); });
}
