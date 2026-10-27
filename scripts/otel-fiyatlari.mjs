// Otel fiyat robotu: data/hotels.json'daki otellerin Cuma-Pazar (2 gece, 2 kişi) fiyatlarını
// Google Hotels'ten çeker. Google Hotels'i Apify'daki hazır robot okur (eiv/google-hotels-scraper).
// Kaynak: https://apify.com/eiv/google-hotels-scraper
// - Kademeli takvim: yakın hafta sonları sık, uzak hafta sonları seyrek kontrol edilir (hotels.json).
// - Bir hafta sonu için tüm şehirlerin otelleri tek Apify çalışmasında sorgulanır.
// - Aylık bütçe sınırı: fatura döneminde harcanan tahmini tutar sınırı geçecekse robot durur.
// - Ana fiyat tanınmış sitelerden (Booking, Expedia ...) gelir; daha ucuz bilinmeyen site ayrıca kaydedilir.
// Yapay zekâ kullanmaz. Fiyat bulunamazsa tahmin yürütmez: "dolu", "bulunamadı" ya da "hata" yazar.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

export const API = "https://api.apify.com/v2";
export const ACTOR = "eiv~google-hotels-scraper";
// Apify'da otel başına maliyet (otel + rezervasyon sitesi fiyatları), 1.000 otel için: free 1,25+2,50 $,
// starter 1+2 $, scale 0,85+1,70 $. Otel adıyla arandığında rezervasyon sitesi fiyatları her zaman gelir.
export const PLAN_RATES = { free: 0.00375, starter: 0.003, scale: 0.00255, business: 0.0021 };
export const rateOf = (settings) => PLAN_RATES[settings.apify_plan || "free"] ?? PLAN_RATES.free;
export const DEFAULT_TRUSTED = ["Booking.com", "Expedia", "Hotels.com", "Agoda", "Trip.com", "Priceline", "Otelin kendi sitesi"];

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

// Hafta numarası (haftalar Pazartesi başlar); "her_n_haftada" kontrolü için
export function weekIndex(todayIso) { return Math.floor((toDate(todayIso).getTime() / DAY_MS - 4) / 7); }

export function tierOf(no, giris, settings) {
  if ((settings.ozel_tarihler || []).includes(giris)) return { ...settings.kontrol_takvimi[0], ozel: true };
  return settings.kontrol_takvimi.find((t) => no >= t.ilk && no <= t.son) || null;
}
const everyN = (t) => t.her_n_haftada || (t.iki_haftada_bir ? 2 : 1);

// mod: "takvim" (bugünün planı), "test" (sadece en yakın hafta sonu), "hepsi" (tüm hafta sonları)
export function planFor(todayIso, settings, mode = "takvim") {
  const all = upcomingWeekends(todayIso, settings.kac_hafta_sonu || 13).map((w) => ({ ...w, kademe: (tierOf(w.no, w.giris, settings) || {}).kademe || null }));
  if (mode === "test") return all.slice(0, 1);
  if (mode === "hepsi") return all;
  if (mode !== "takvim") throw new Error(`Bilinmeyen mod: ${mode} (takvim, test ya da hepsi olmalı)`);
  const wd = weekday(todayIso), wk = weekIndex(todayIso);
  return all.filter((w) => {
    const t = tierOf(w.no, w.giris, settings);
    if (!t) return false;
    return (t.gunler || []).map((g) => DAY_NO[g]).includes(wd) && (((wk - (t.kaydir || 0)) % everyN(t)) + everyN(t)) % everyN(t) === 0;
  });
}

// 28 günlük takvimi çalıştırıp aylık sorgu ve maliyeti hesaplar (bütçe kontrolü için)
export function estimateMonthly(settings, hotelCount, startIso = "2026-11-02", plan = settings.apify_plan) {
  let checks = 0;
  for (let i = 0; i < 28; i++) checks += planFor(addDays(startIso, i), settings, "takvim").length;
  const sorgu = Math.round((checks * hotelCount * 30) / 28);
  return { sorgu, usd: r2(sorgu * (PLAN_RATES[plan] ?? PLAN_RATES.free)) };
}

// Apify fatura dönemi: her ay "fatura_gunu"nde başlar
export function billingPeriod(todayIso, day = 1) {
  const [y, m, d] = todayIso.split("-").map(Number);
  const clamp = (yy, mm) => Math.min(day, new Date(Date.UTC(yy, mm, 0)).getUTCDate());
  let yy = y, mm = m;
  if (d < clamp(y, m)) { mm -= 1; if (mm === 0) { mm = 12; yy -= 1; } }
  return `${yy}-${String(mm).padStart(2, "0")}-${String(clamp(yy, mm)).padStart(2, "0")}`;
}

// ---------- Apify ----------

const redact = (s, token) => (token ? String(s).split(token).join("***") : String(s));

async function call(fetchImpl, url, token, init = {}) {
  const res = await fetchImpl(url, { ...init, headers: { accept: "application/json", "content-type": "application/json", authorization: "Bearer " + token, ...(init.headers || {}) } });
  const text = await res.text();
  if (res.status === 401 || res.status === 403) { const e = new Error("Apify anahtarı (APIFY_TOKEN) geçersiz ya da yetkisiz"); e.fatal = true; throw e; }
  if (res.status === 402 || /not-enough-usage|usage limit|insufficient/i.test(text)) { const e = new Error("Apify kredisi yetmiyor (aylık kredi bitmiş olabilir)"); e.fatal = true; throw e; }
  if (res.status === 429) throw new Error("Apify istek sınırı aşıldı (HTTP 429)");
  if (!res.ok) throw new Error(redact(`Apify HTTP ${res.status}: ${text.slice(0, 200)}`, token));
  try { return JSON.parse(text); } catch { throw new Error(redact(`Apify yanıtı okunamadı: ${text.slice(0, 200)}`, token)); }
}

// Robotu başlatır, bitmesini bekler, sonuç satırlarını döndürür. Anahtar adrese yazılmaz, başlıkla gider.
export async function runActor(input, { token, fetchImpl = fetch, sleep, maxPolls = 40 }) {
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
    maxConcurrency: 8,
  };
}

// ---------- sonuçları otellerle eşleştirme ----------

const STOP = new Set(["hotel", "hotels", "the", "and", "by", "a", "of", "boutique", "suites", "spa", "collection", "autograph", "luxury", "curio", "hilton", "ihg"]);
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

// Sitenin tanınmış listede olup olmadığı ("Booking.com" = "booking", "Expedia.com" = "expedia" ...)
const siteKey = (s) => norm(s).replace(/\b(com|net|co|uk|www|deals)\b/g, "").replace(/\s+/g, "");
export function isTrusted(option, trusted = DEFAULT_TRUSTED) {
  if (option.resmi) return trusted.some((t) => /kendi sitesi|official/i.test(t));
  const k = siteKey(option.site);
  return !!k && trusted.some((t) => { const tk = siteKey(t); return tk && (k === tk || k.startsWith(tk)); });
}

// Tek satırı kayda çevirir. Ana fiyat = tanınmış sitelerin en ucuz toplamı (2 gece). Tanınmış site yoksa en ucuz.
export function toRecord(row, nights = 2, currency = "EUR", trusted = DEFAULT_TRUSTED) {
  if (!row) return { durum: "sonuc_yok", not: "Robot bu otel için satır döndürmedi" };
  if (row.recordType === "error") return { durum: row.errorCode === "NOT_FOUND" ? "bulunamadi" : "hata", not: row.errorCode || "bilinmeyen hata" };
  if (row.currency && row.currency !== currency) return { durum: "hata", not: `Para birimi ${row.currency}, beklenen ${currency}` };
  const options = (Array.isArray(row.bookingOptions) ? row.bookingOptions : []).map((o) => {
    const toplam = num(o.totalStayPrice) ? o.totalStayPrice : num(o.nightlyPrice) ? o.nightlyPrice * nights : null;
    return toplam == null ? null : { site: o.isOfficialSite ? (o.provider || "Otelin kendi sitesi") : (o.provider || "?"), toplam, resmi: !!o.isOfficialSite, link: o.bookingUrl || null };
  }).filter(Boolean);
  const google = num(row.totalPrice) ? row.totalPrice : num(row.pricePerNight) ? row.pricePerNight * nights : null;
  const base = {
    googleKimlik: row.hotelId || null, puan: num(row.rating) ? row.rating : null, yildiz: row.hotelClass ?? null,
    konum: num(row.latitude) && num(row.longitude) ? [r2(row.latitude * 1000) / 1000, r2(row.longitude * 1000) / 1000] : null,
  };
  const min = (a) => a.reduce((x, y) => (!x || y.toplam < x.toplam ? y : x), null);
  const anyPrice = options.length ? min(options) : google != null ? { site: "Google Hotels", toplam: google, resmi: false, link: row.url || null } : null;
  if (!anyPrice) return { durum: "dolu", not: "Otel bulundu ama bu tarihler için fiyat yok (dolu ya da satışta değil)", ...base };
  const good = min(options.filter((o) => isTrusted(o, trusted)));
  const head = good || anyPrice;
  const official = min(options.filter((o) => o.resmi));
  return {
    durum: "fiyat", fiyat: r2(head.toplam), gecelik: r2(head.toplam / nights), site: head.site, link: head.link || row.url || null, guvenilir: !!good,
    enUcuz: good && anyPrice.toplam < good.toplam - 0.5 ? { fiyat: r2(anyPrice.toplam), site: anyPrice.site, link: anyPrice.link || null } : null,
    googleFiyat: google == null ? null : r2(google), resmiSiteFiyat: official ? r2(official.toplam) : null,
    firsat: row.deal || null, tipikGecelik: num(row.typicalPriceLow) && num(row.typicalPriceHigh) ? [row.typicalPriceLow, row.typicalPriceHigh] : null,
    ...base,
  };
}

// ---------- kayıt ----------

export function emptyState() {
  return { guncellendi: null, kaynak: "Google Hotels (Apify: eiv/google-hotels-scraper)", paraBirimi: "EUR", konaklama: "Cuma giriş, Pazar çıkış, 2 gece, 2 yetişkin", googleKimlik: {}, konum: {}, harcama: { donem: null, usd: 0 }, sonCalisma: null, haftaSonlari: {} };
}

const HISTORY_MAX = 60;
export function mergeWeekend(state, w, hotels, records, checkedAt, usedIds = {}) {
  const slot = (state.haftaSonlari[w.giris] ||= { cikis: w.cikis, oteller: {} });
  for (const h of hotels) {
    const rec = records[h.id];
    if (!rec) continue;
    const { konum, ...keep } = rec;
    const o = (slot.oteller[h.id] ||= { son: null, gecmis: [] });
    o.son = { ...keep, kontrol: checkedAt };
    o.gecmis.push({ t: checkedAt, durum: rec.durum, fiyat: rec.fiyat ?? null });
    if (o.gecmis.length > HISTORY_MAX) o.gecmis.splice(0, o.gecmis.length - HISTORY_MAX);
    if (konum) state.konum[h.id] = konum;
    if (rec.googleKimlik) state.googleKimlik[h.id] = rec.googleKimlik;
    else if (rec.durum === "bulunamadi" && usedIds[h.id]) delete state.googleKimlik[h.id]; // kimlik bozulduysa bir dahakine adla ara
  }
}

// Bitmiş hafta sonlarını sade haliyle arşive taşır (bağlantısız), ana dosyalar küçük kalır.
export function archivePast(state, archive, todayIso) {
  let moved = 0;
  for (const [giris, w] of Object.entries(state.haftaSonlari)) {
    if (w.cikis >= todayIso) continue;
    const oteller = {};
    for (const [id, o] of Object.entries(w.oteller)) oteller[id] = { son: o.son ? { durum: o.son.durum, fiyat: o.son.fiyat ?? null, site: o.son.site ?? null } : null, gecmis: o.gecmis };
    archive.haftaSonlari[giris] = { cikis: w.cikis, oteller };
    delete state.haftaSonlari[giris]; moved++;
  }
  return moved;
}

// Kayıt şehir şehir ayrı dosyalara bölünür: sayfa sadece seçilen şehrin dosyasını indirir.
export const citySlug = (sehir) => norm(sehir).replace(/\s+/g, "-");
export function splitState(state, hotelsDoc) {
  const { haftaSonlari, ...meta } = state;
  meta.sehirler = {};
  const files = {};
  for (const c of hotelsDoc.sehirler) {
    const ids = new Set(c.oteller.map((h) => h.id)), slug = citySlug(c.sehir), hs = {};
    for (const [g, w] of Object.entries(haftaSonlari)) {
      const ot = Object.fromEntries(Object.entries(w.oteller).filter(([id]) => ids.has(id)));
      if (Object.keys(ot).length) hs[g] = { cikis: w.cikis, oteller: ot };
    }
    files[slug] = { sehir: c.sehir, guncellendi: state.guncellendi, paraBirimi: state.paraBirimi, konaklama: state.konaklama, haftaSonlari: hs };
    meta.sehirler[c.sehir] = "data/fiyatlar/" + slug + ".json";
  }
  return { meta, files };
}
export function joinState(meta, files) {
  const { sehirler, ...rest } = meta || {};
  const state = { ...emptyState(), ...rest, haftaSonlari: {} };
  for (const f of Object.values(files || {})) for (const [g, w] of Object.entries(f.haftaSonlari || {})) {
    const slot = (state.haftaSonlari[g] ||= { cikis: w.cikis, oteller: {} });
    Object.assign(slot.oteller, w.oteller);
  }
  return state;
}

// Listeden çıkarılan otellerin eski kayıtlarını temizler
export function pruneRemoved(state, allIds) {
  const keep = new Set(allIds);
  for (const w of Object.values(state.haftaSonlari)) for (const id of Object.keys(w.oteller)) if (!keep.has(id)) delete w.oteller[id];
  for (const m of [state.googleKimlik, state.konum]) for (const id of Object.keys(m)) if (!keep.has(id)) delete m[id];
}

// ---------- ana akış ----------

async function pool(items, size, fn) {
  let i = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } });
  await Promise.all(workers);
}

export async function run({ token, hotelsDoc, state = emptyState(), archive = { haftaSonlari: {} }, now = new Date(), mode = "takvim", fetchImpl = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), concurrency = 3, only = null }) {
  if (!token) throw new Error("APIFY_TOKEN tanımlı değil (GitHub > Settings > Secrets and variables > Actions bölümüne eklenmeli)");
  const settings = hotelsDoc.ayarlar, nights = 2, today = istanbulToday(now), rate = rateOf(settings);
  const trusted = settings.guvenilir_siteler || DEFAULT_TRUSTED;
  state = { ...emptyState(), ...structuredClone(state) }; // girdiyi değiştirmemek için kopya
  const cities = hotelsDoc.sehirler.filter((c) => !only || only.includes(c.sehir));
  const hotels = cities.flatMap((c) => c.oteller);
  pruneRemoved(state, hotelsDoc.sehirler.flatMap((c) => c.oteller.map((h) => h.id)));

  // bütçe: fatura dönemi değiştiyse sayaç sıfırlanır
  const donem = billingPeriod(today, settings.fatura_gunu || 1);
  if (!state.harcama || state.harcama.donem !== donem) state.harcama = { donem, usd: 0 };
  const budget = num(settings.aylik_butce_usd) ? settings.aylik_butce_usd : Infinity;

  const plan = planFor(today, settings, mode);
  const report = { tarih: today, gun: DAY_NAME[weekday(today)], mod: mode, plan: settings.apify_plan || "free", haftaSonlari: [], butceAtlanan: [], otelSayisi: hotels.length, fiyat: 0, dolu: 0, bulunamadi: 0, hata: 0, sonuc_yok: 0, guvenilirDisi: 0, ucretliSatir: 0, tahminiMaliyetUsd: 0, hatalar: [], butce: { donem, sinir: budget, harcanan: 0 } };
  const checkedAt = now.toISOString();
  let okRuns = 0, tried = 0, reserved = 0, fatal = null;

  await pool(plan, concurrency, async (w) => {
    if (fatal) return;
    const est = hotels.length * rate;
    if (state.harcama.usd + reserved + est > budget + 1e-9) { report.butceAtlanan.push(w.giris); return; }
    reserved += est; tried++;
    const ids = state.googleKimlik, usedIds = {};
    for (const h of hotels) if (ids[h.id]) usedIds[h.id] = ids[h.id];
    let records, charged = 0;
    try {
      const rows = await runActor(actorInput(hotels, w, settings, ids), { token, fetchImpl, sleep });
      const matched = matchRows(hotels, rows, ids);
      records = Object.fromEntries(hotels.map((h) => [h.id, toRecord(matched[h.id], nights, settings.para_birimi || "EUR", trusted)]));
      charged = Object.values(records).filter((r) => r.durum === "fiyat" || r.durum === "dolu").length;
      okRuns++; report.haftaSonlari.push(w.giris);
    } catch (e) {
      const msg = redact(e.message, token);
      report.hatalar.push(`${w.giris}: ${msg}`);
      if (e.fatal) { fatal = e; reserved -= est; return; }
      records = Object.fromEntries(hotels.map((h) => [h.id, { durum: "hata", not: msg }]));
    }
    reserved -= est;
    state.harcama.usd = r2(state.harcama.usd + charged * rate);
    report.ucretliSatir += charged;
    mergeWeekend(state, w, hotels, records, checkedAt, usedIds);
    for (const rec of Object.values(records)) {
      report[rec.durum] = (report[rec.durum] || 0) + 1;
      if (rec.durum === "fiyat" && !rec.guvenilir) report.guvenilirDisi++;
    }
  });

  if (tried > 0 && okRuns === 0) throw new Error("Hiçbir kontrol başarılı olmadı: " + (report.hatalar[0] || "bilinmeyen hata"));
  report.haftaSonlari.sort();
  report.tahminiMaliyetUsd = r2(report.ucretliSatir * rate);
  report.butce.harcanan = state.harcama.usd;
  report.arsivlenen = archivePast(state, archive, today);
  if (okRuns > 0) { state.guncellendi = checkedAt; state.sonCalisma = { tarih: checkedAt, mod: mode, hafta_sonu: report.haftaSonlari.length, kontrol: report.ucretliSatir + report.bulunamadi + report.hata + report.sonuc_yok, fiyatli: report.fiyat, tahminiMaliyetUsd: report.tahminiMaliyetUsd, butceAtlanan: report.butceAtlanan.length }; }
  return { state, archive, report, plan, fatal: fatal ? redact(fatal.message, token) : null };
}

export function toMarkdown({ report, plan, state, hotelsDoc }) {
  const eur = (n) => (n == null ? "" : `${Math.round(n)} €`);
  const p = [`# Otel fiyat robotu`, "", `Tarih: ${report.tarih} (${report.gun}), mod: ${report.mod}, Apify planı: ${report.plan}.`, ""];
  if (!plan.length) { p.push("Bugün takvime göre kontrol günü değil, hiçbir şey çekilmedi."); return p.join("\n"); }
  p.push(`Kontrol edilen hafta sonları: ${report.haftaSonlari.join(", ") || "yok"} (${report.otelSayisi} otel).`);
  if (report.butceAtlanan.length) p.push(`Bütçe sınırı yüzünden atlanan hafta sonları: ${report.butceAtlanan.sort().join(", ")}.`);
  p.push(`Sonuç: ${report.fiyat} fiyat (${report.guvenilirDisi} tanesi sadece bilinmeyen sitelerde), ${report.dolu} dolu, ${report.bulunamadi} bulunamadı, ${report.hata} hata.`);
  p.push(`Bu çalışma: ~${report.tahminiMaliyetUsd} $. Fatura dönemi (başlangıç ${report.butce.donem}): ~${report.butce.harcanan} $ / sınır ${report.butce.sinir} $.`, "");
  const shown = report.haftaSonlari.slice(0, 3);
  const label = { fiyat: "", dolu: "dolu", bulunamadi: "BULUNAMADI", hata: "HATA", sonuc_yok: "sonuç yok" };
  if (shown.length) for (const city of hotelsDoc.sehirler) {
    const cells = city.oteller.map((h) => shown.map((g) => { const s = state.haftaSonlari[g]?.oteller[h.id]?.son; return !s ? "" : s.durum === "fiyat" ? eur(s.fiyat) + (s.guvenilir ? "" : "*") : label[s.durum] || s.durum; }));
    if (!cells.some((r) => r.some((x) => x))) continue;
    p.push(`## ${city.sehir}`, "", "| Otel | Kategori | " + shown.map((g) => g.slice(5)).join(" | ") + " |", "| --- | --- | " + shown.map(() => "---").join(" | ") + " |");
    city.oteller.forEach((h, i) => p.push(`| ${h.ad} | ${h.kategori} | ${cells[i].join(" | ")} |`));
    p.push("");
  }
  if (report.hatalar.length) p.push("Hatalar:", ...report.hatalar.map((x) => "- " + x), "");
  p.push("Not: Fiyatlar 2 yetişkin, Cuma-Pazar 2 gece içindir. * işaretli fiyat sadece az bilinen sitelerde bulundu.");
  return p.join("\n");
}

async function readJson(path, fallback) { try { return JSON.parse(await readFile(path, "utf8")); } catch (e) { if (e.code === "ENOENT") return fallback; throw e; } }

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const P = { hotels: root + "data/hotels.json", meta: root + "data/otel-fiyatlari.json", city: (slug) => root + "data/fiyatlar/" + slug + ".json", archive: (ym) => root + "data/arsiv/" + ym + ".json" };
  (async () => {
    const hotelsDoc = await readJson(P.hotels);
    const mode = (process.env.MOD || "takvim").trim();
    const only = (process.env.SEHIR || "").split(",").map((s) => s.trim()).filter(Boolean);
    const meta = await readJson(P.meta, emptyState());
    const files = {};
    for (const c of hotelsDoc.sehirler) { const f = await readJson(P.city(citySlug(c.sehir)), null); if (f) files[citySlug(c.sehir)] = f; }
    // eski tek dosya biçiminden geçiş: haftaSonlari ana dosyadaysa onu da al
    const state = meta.haftaSonlari && Object.keys(meta.haftaSonlari).length ? { ...joinState(meta, files), haftaSonlari: { ...joinState(meta, files).haftaSonlari, ...meta.haftaSonlari } } : joinState(meta, files);
    const ym = istanbulToday().slice(0, 7);
    const archive = await readJson(P.archive(ym), { haftaSonlari: {} });
    const out = await run({ token: process.env.APIFY_TOKEN, hotelsDoc, state, archive, mode, only: only.length ? only : null });
    const md = toMarkdown({ ...out, hotelsDoc }); console.log(md);
    if (process.env.GITHUB_STEP_SUMMARY) await writeFile(process.env.GITHUB_STEP_SUMMARY, md + "\n", { flag: "a" });
    if (out.plan.length) {
      const sp = splitState(out.state, hotelsDoc);
      await mkdir(dirname(P.city("x")), { recursive: true });
      await writeFile(P.meta, JSON.stringify(sp.meta, null, 1) + "\n");
      for (const [slug, f] of Object.entries(sp.files)) await writeFile(P.city(slug), JSON.stringify(f) + "\n");
      if (out.report.arsivlenen) { await mkdir(dirname(P.archive(ym)), { recursive: true }); await writeFile(P.archive(ym), JSON.stringify(out.archive) + "\n"); }
    }
    if (out.fatal) { console.error("HATA:", out.fatal); process.exit(1); }
  })().catch((e) => { console.error("HATA:", redact(e.message, process.env.APIFY_TOKEN)); process.exit(1); });
}
