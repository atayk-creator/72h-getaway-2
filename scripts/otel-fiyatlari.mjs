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
export async function runActor(input, { token, fetchImpl = fetch, sleep, maxPolls = 40, actor = ACTOR }) {
  let j = await call(fetchImpl, `${API}/acts/${actor}/runs?waitForFinish=60`, token, { method: "POST", body: JSON.stringify(input) });
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

// Apify'ın kendi kullanım sayacı: bu fatura döneminde gerçekten harcanan tutar ve hesabın aylık sınırı.
// Robotlar bütçeyi tahmine değil buna göre kontrol eder. Okunamazsa null döner (tahmini sayaç kullanılır).
export async function apifyUsage({ token, fetchImpl = fetch }) {
  try {
    const j = await call(fetchImpl, `${API}/users/me/limits`, token);
    const d = j && j.data, usd = d && d.current && d.current.monthlyUsageUsd, sinir = d && d.limits && d.limits.maxMonthlyUsageUsd;
    if (!num(usd)) return null;
    const cyc = d.monthlyUsageCycle || {};
    return { usd: r2(usd), sinir: num(sinir) ? sinir : null, donemBasi: cyc.startAt ? String(cyc.startAt).slice(0, 10) : null, donemSonu: cyc.endAt ? String(cyc.endAt).slice(0, 10) : null };
  } catch (e) {
    if (e.fatal && /geçersiz/.test(e.message)) throw e;
    return null;
  }
}
// Çalışmanın gerçek maliyetini ölçer: Apify sayacını çalışma sonrası tekrar okur (sayaç birkaç dakika gecikebilir)
export async function measureCost({ token, fetchImpl, sleep, before, holder, robot, queries, t }) {
  if (!before || !queries) return null;
  if (sleep) await sleep(90000);
  const after = await apifyUsage({ token, fetchImpl }).catch(() => null);
  if (!after) return null;
  const usd = r2(after.usd - before.usd);
  holder.apifyKullanim = { ...after, kontrol: t };
  holder.olcumler = [...(holder.olcumler || []), { robot, t, sorgu: queries, usd, sorguBasi: queries ? Math.round((usd / queries) * 100000) / 100000 : null }].slice(-30);
  return usd;
}

// Bütçe kontrolü: gerçek kullanım (varsa) + bu çalışmada eklenen tahmin + ayrılmış tutar, sınırı geçmemeli
export function makeBudget(state, settingsBudget, usage) {
  const cap = Math.min(num(settingsBudget) ? settingsBudget : Infinity, usage && num(usage.sinir) ? usage.sinir - 0.1 : Infinity);
  const base = usage ? usage.usd : state.harcama.usd;
  let added = 0, reserved = 0;
  return {
    cap, base,
    reserve(est) { if (base + added + reserved + est > cap + 1e-9) return false; reserved += est; return true; },
    release(est) { reserved -= est; },
    spend(cost) { added += cost; state.harcama.usd += cost; },
    get added() { return added; },
  };
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

// Google'ın döndürdüğü otel bizim otelimiz mi? Bizim adımızdaki ayırt edici kelimelerin çoğu onun adında geçmeli.
const CITY_WORDS = new Set("dublin paris brussels bruxelles amsterdam luxembourg berlin vienna wien madrid lisbon lisboa rome roma valletta malta floriana athens stockholm copenhagen helsinki tallinn riga vilnius warsaw warszawa prague praha bratislava budapest ljubljana zagreb bucharest sofia city centre center centrum old town".split(" "));
export function nameOk(h, googleName) {
  const strip = (s) => new Set([...tokens(s)].filter((t) => !CITY_WORDS.has(t)));
  const theirs = strip(googleName);
  const cover = (ours) => { const a = strip(ours); if (!a.size) return 1; let n = 0; for (const t of a) if (theirs.has(t)) n++; return n / a.size; };
  return Math.max(cover(h.ad), cover(h.arama)) >= 0.6;
}
// Ad uyuşmazsa ya da iki otel aynı Google oteline eşleştiyse o fiyat kullanılmaz
export function validateRecords(hotels, records) {
  const byId = {};
  for (const h of hotels) {
    const r = records[h.id];
    if (!r || !r.googleAd) continue;
    if (!nameOk(h, r.googleAd)) { records[h.id] = { durum: "bulunamadi", not: "Google başka bir otel döndürdü: " + r.googleAd, googleAd: r.googleAd }; continue; }
    if (r.googleKimlik) (byId[r.googleKimlik] ||= []).push(h);
  }
  for (const hs of Object.values(byId)) {
    if (hs.length < 2) continue;
    const score = (h) => Math.max(nameScore(h.ad, records[h.id].googleAd), nameScore(h.arama, records[h.id].googleAd));
    hs.sort((a, b) => score(b) - score(a));
    for (const h of hs.slice(1)) records[h.id] = { durum: "bulunamadi", not: "Google bu oteli başka bir otelle karıştırdı: " + records[h.id].googleAd, googleAd: records[h.id].googleAd };
  }
  return records;
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
  return !!k && trusted.some((t) => siteKey(t) === k); // tam eşleşme: "Hotelscombined" ≠ "Hotels.com"
}

// ---------- vergi ----------
// Google Hotels ABD pazarında (bağlantılarda POSCountryCode=US, userCountry=US) site fiyatlarını VERGİSİZ gösteriyor.
// Rezervasyon sitelerinin bağlantısında çoğu zaman vergili toplam ve vergi tutarı yazar; ondan vergili fiyat bulunur.
// Kanıt (2026-10-29 verisi): Priceline 211/212, Booking 378/379, Agoda 331/331, Expedia/Hotels.com 582/586 kayıtta
// kayıtlı fiyat = toplam - vergi. Biçim: [vergili toplam, vergi, (ek ücret)], bazıları sadece belirli sitede.
const LINK_TAX = [
  { t: "pdt", x: ["pdtax", "pdf"] },                      // Priceline
  { t: "ext_price_total", x: ["ext_price_tax"] },          // Booking.com
  { t: "mpf", x: ["mpj"] },                                // Expedia, Hotels.com
  { t: "PriceTotal", x: ["PriceTax", "PriceFee"] },        // Agoda
  { t: "priceDisplayedTotal", x: ["priceDisplayedTax"] },  // otel zincirleri (Derbysoft), trivago
  { t: "br", x: ["tf"], host: /(^|\.)trip\.com$/ },        // Trip.com
];
const pnum = (v) => { if (v == null || v === "") return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
// Bağlantıdan { toplam (vergili), vergi } okur; yoksa null
export function linkTax(link) {
  if (!link || typeof link !== "string") return null;
  let u; try { u = new URL(link); } catch { return null; }
  const q = u.searchParams;
  for (const k of LINK_TAX) {
    if (k.host && !k.host.test(u.hostname)) continue;
    const T = pnum(q.get(k.t)), X = k.x.reduce((a, n) => (pnum(q.get(n)) == null ? a : (a ?? 0) + pnum(q.get(n))), null);
    if (T != null && X != null && T > 0 && X >= 0 && X < T) return { toplam: T, vergi: r2(X) };
  }
  const tt = q.get("tt_meta_price"); // Triptease: "vergili toplam_vergi_ücret" (kayıtlı fiyat = toplam - vergi)
  if (tt && /^[\d.]+_[\d.]+(_[\d.]+)?$/.test(tt)) { const [T, x, f = 0] = tt.split("_").map(Number); if (T > 0 && x + f < T) return { toplam: T, vergi: r2(x + f) }; }
  return null;
}

// Vergili fiyat. Sıra: a) bağlantıdaki toplam/vergi, b) Google satırının vergi kırılımı, c) Google'ın vergili toplamı,
// d) olduğu gibi. Dönüş: { fiyat, vergi: "dahil" | "eklendi" | "bilinmiyor", carpan, kanit }
export const NEAR = 0.03, GOOGLE_MAX = 1.45;
const near = (a, b, tol = NEAR) => num(a) && num(b) && b > 0 && Math.abs(a - b) <= tol * b;
export function taxInclusive(price, { link = null, row = null, google = null } = {}) {
  if (!num(price) || price <= 0) return { fiyat: price, vergi: "bilinmiyor", carpan: 1, kanit: null };
  const lt = linkTax(link);
  if (lt) {
    const pre = lt.toplam - lt.vergi;
    if (lt.vergi <= lt.toplam * 0.005) return { fiyat: price, vergi: "dahil", carpan: 1, kanit: "baglanti" };
    if (near(price, lt.toplam, 0.01) && !near(price, pre, 0.01)) return { fiyat: price, vergi: "dahil", carpan: 1, kanit: "baglanti" };
    const c = lt.toplam / pre;
    return { fiyat: r2(price * c), vergi: "eklendi", carpan: c, kanit: "baglanti" };
  }
  const tf = row && row.taxesAndFees, tb = row && row.totalPriceBeforeTaxes;
  if (num(tf) && num(tb) && tb > 0 && tf >= 0) {
    if (near(price, tb)) {
      const c = 1 + tf / tb;
      return c > 1.0005 ? { fiyat: r2(price * c), vergi: "eklendi", carpan: c, kanit: "google_kirilim" } : { fiyat: price, vergi: "dahil", carpan: 1, kanit: "google_kirilim" };
    }
    if (near(price, tb + tf)) return { fiyat: price, vergi: "dahil", carpan: 1, kanit: "google_kirilim" };
  }
  if (num(google)) {
    if (google > price * (1 + NEAR) && google <= price * GOOGLE_MAX) return { fiyat: r2(google), vergi: "eklendi", carpan: google / price, kanit: "google_toplam" };
    if (near(google, price)) return { fiyat: price, vergi: "dahil", carpan: 1, kanit: "google_toplam" };
  }
  return { fiyat: price, vergi: "bilinmiyor", carpan: 1, kanit: null };
}
// Ana fiyatın dışındaki fiyatlar (en ucuz site, otelin kendi sitesi): kendi bağlantısında kanıt varsa o,
// yoksa ana fiyatın çarpanı (aynı otel, aynı vergiler)
export function taxLike(price, link, head) {
  if (!num(price)) return null;
  const own = taxInclusive(price, { link });
  if (own.kanit) return own;
  if (head && head.carpan > 1.0005) return { fiyat: r2(price * head.carpan), vergi: "eklendi", carpan: head.carpan, kanit: "ana_fiyat" };
  return { fiyat: price, vergi: head ? head.vergi : "bilinmiyor", carpan: 1, kanit: null };
}
// Fiyat kaydı sitede kullanılabilir mi: tanınmış sitede doğrulanmış ve şüpheli değil
export const usable = (s) => !!s && s.durum === "fiyat" && !s.supheli;
export const SUPHELI_KAT = 1.5;
export const isSuspicious = (gecelik, tip) => Array.isArray(tip) && num(tip[1]) && tip[1] > 0 && num(gecelik) && gecelik > SUPHELI_KAT * tip[1];

// Tek satırı kayda çevirir. Ana fiyat = tanınmış sitelerin en ucuz toplamı (2 gece), vergili.
// Tanınmış site yoksa en ucuz fiyat "dogrulanamadi" durumuyla kaydedilir (sitede kullanılmaz, bilgi için).
export function toRecord(row, nights = 2, currency = "EUR", trusted = DEFAULT_TRUSTED, { vergi = true } = {}) {
  if (!row) return { durum: "sonuc_yok", not: "Robot bu otel için satır döndürmedi" };
  if (row.recordType === "error") return { durum: row.errorCode === "NOT_FOUND" ? "bulunamadi" : "hata", not: row.errorCode || "bilinmeyen hata" };
  if (row.currency && row.currency !== currency) return { durum: "hata", not: `Para birimi ${row.currency}, beklenen ${currency}` };
  const options = (Array.isArray(row.bookingOptions) ? row.bookingOptions : []).map((o) => {
    const toplam = num(o.totalStayPrice) ? o.totalStayPrice : num(o.nightlyPrice) ? o.nightlyPrice * nights : null;
    return toplam == null ? null : { site: o.isOfficialSite ? (o.provider || "Otelin kendi sitesi") : (o.provider || "?"), toplam, resmi: !!o.isOfficialSite, link: o.bookingUrl || null };
  }).filter(Boolean);
  const google = num(row.totalPrice) ? row.totalPrice : num(row.pricePerNight) ? row.pricePerNight * nights : null;
  const googleVergili = num(row.totalPrice) ? row.totalPrice : null; // gecelik fiyat bazı pazarlarda vergisiz
  const base = {
    googleKimlik: row.hotelId || null, googleAd: row.name || null, puan: num(row.rating) ? row.rating : null, yildiz: row.hotelClass ?? null,
    konum: num(row.latitude) && num(row.longitude) ? [r2(row.latitude * 1000) / 1000, r2(row.longitude * 1000) / 1000] : null,
  };
  const min = (a) => a.reduce((x, y) => (!x || y.toplam < x.toplam ? y : x), null);
  const anyPrice = options.length ? min(options) : google != null ? { site: "Google Hotels", toplam: google, resmi: false, link: row.url || null } : null;
  if (!anyPrice) return { durum: "dolu", not: "Otel bulundu ama bu tarihler için fiyat yok (dolu ya da satışta değil)", ...base };
  const good = min(options.filter((o) => isTrusted(o, trusted)));
  const head = good || anyPrice;
  const official = min(options.filter((o) => o.resmi));
  const tipik = num(row.typicalPriceLow) && num(row.typicalPriceHigh) ? [row.typicalPriceLow, row.typicalPriceHigh] : null;
  const off = { fiyat: head.toplam, vergi: "bilinmiyor", carpan: 1, kanit: null };
  const H = vergi ? taxInclusive(head.toplam, { link: head.link, row, google: googleVergili }) : off;
  let enUcuz = null;
  if (good && anyPrice !== good) {
    const E = vergi ? taxLike(anyPrice.toplam, anyPrice.link, H) : { ...off, fiyat: anyPrice.toplam };
    if (E.fiyat < H.fiyat - 0.5) enUcuz = { fiyat: r2(E.fiyat), site: anyPrice.site, link: anyPrice.link || null, vergi: E.vergi, ...(E.fiyat !== anyPrice.toplam ? { fiyatVergisiz: r2(anyPrice.toplam) } : {}) };
  }
  const resmi = official ? (official === head ? H : vergi ? taxLike(official.toplam, official.link, H) : { fiyat: official.toplam }) : null;
  const fiyat = r2(H.fiyat), gecelik = r2(fiyat / nights);
  return {
    durum: good ? "fiyat" : "dogrulanamadi", fiyat, gecelik, ...(fiyat !== r2(head.toplam) ? { fiyatVergisiz: r2(head.toplam) } : {}), vergi: H.vergi,
    ...(isSuspicious(gecelik, tipik) ? { supheli: true } : {}),
    site: head.site, link: head.link || row.url || null, guvenilir: !!good,
    ...(good ? {} : { not: "Fiyat sadece az bilinen sitelerde bulundu, tanınmış bir sitede doğrulanamadı" }),
    enUcuz, googleFiyat: google == null ? null : r2(google), resmiSiteFiyat: resmi ? r2(resmi.fiyat) : null,
    firsat: row.deal || null, tipikGecelik: tipik,
    ...base,
  };
}

// ---------- kayıt ----------

export function emptyState() {
  return { guncellendi: null, kaynak: "Google Hotels (Apify: eiv/google-hotels-scraper)", paraBirimi: "EUR", konaklama: "Cuma giriş, Pazar çıkış, 2 gece, 2 yetişkin", googleKimlik: {}, konum: {}, harcama: { donem: null, usd: 0 }, sonCalisma: null, haftaSonlari: {} };
}

const HISTORY_MAX = 60;
// Geçmiş kaydı: son kaydın fiyat alanlarının sade hali (vergi bilgisi ve şüpheli işareti varsa)
export function historyEntry(t, rec) {
  return { t, durum: rec.durum, fiyat: rec.fiyat ?? null, ...(rec.fiyatVergisiz != null ? { fiyatVergisiz: rec.fiyatVergisiz } : {}), ...(rec.vergi ? { vergi: rec.vergi } : {}), ...(rec.supheli ? { supheli: true } : {}) };
}
export function mergeWeekend(state, w, hotels, records, checkedAt, usedIds = {}) {
  const slot = (state.haftaSonlari[w.giris] ||= { cikis: w.cikis, oteller: {} });
  for (const h of hotels) {
    const rec = records[h.id];
    if (!rec) continue;
    const { konum, ...keep } = rec;
    const o = (slot.oteller[h.id] ||= { son: null, gecmis: [] });
    o.son = { ...keep, kontrol: checkedAt };
    o.gecmis.push(historyEntry(checkedAt, rec));
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
    for (const [id, o] of Object.entries(w.oteller)) { const { t, ...h } = o.son ? historyEntry(null, o.son) : {}; oteller[id] = { son: o.son ? { ...h, site: o.son.site ?? null } : null, gecmis: o.gecmis }; }
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
  const vergi = settings.vergi_kontrolu !== false; // false: site fiyatları olduğu gibi (pazar A/B testi için)
  state = { ...emptyState(), ...structuredClone(state) }; // girdiyi değiştirmemek için kopya
  const cities = hotelsDoc.sehirler.filter((c) => !only || only.includes(c.sehir));
  const hotels = cities.flatMap((c) => c.oteller);
  pruneRemoved(state, hotelsDoc.sehirler.flatMap((c) => c.oteller.map((h) => h.id)));

  // bütçe: fatura dönemi değiştiyse sayaç sıfırlanır
  const donem = billingPeriod(today, settings.fatura_gunu || 1);
  if (!state.harcama || state.harcama.donem !== donem) state.harcama = { donem, usd: 0 };
  const plan = planFor(today, settings, mode);
  const usage = plan.length ? await apifyUsage({ token, fetchImpl }) : null;
  if (usage) state.apifyKullanim = { ...usage, kontrol: now.toISOString() };
  const B = makeBudget(state, settings.aylik_butce_usd, usage);
  const report = { tarih: today, gun: DAY_NAME[weekday(today)], mod: mode, plan: settings.apify_plan || "free", haftaSonlari: [], butceAtlanan: [], otelSayisi: hotels.length, fiyat: 0, dogrulanamadi: 0, supheli: 0, kullanilabilir: 0, dolu: 0, bulunamadi: 0, hata: 0, sonuc_yok: 0, vergi: { dahil: 0, eklendi: 0, bilinmiyor: 0 }, ucretliSatir: 0, tahminiMaliyetUsd: 0, hatalar: [], butce: { donem, sinir: B.cap, harcanan: 0, gercek: usage ? usage.usd : null } };
  const checkedAt = now.toISOString();
  let okRuns = 0, tried = 0, fatal = null;

  await pool(plan, concurrency, async (w) => {
    if (fatal) return;
    const est = hotels.length * rate;
    if (!B.reserve(est)) { report.butceAtlanan.push(w.giris); return; }
    tried++;
    const ids = state.googleKimlik, usedIds = {};
    for (const h of hotels) if (ids[h.id]) usedIds[h.id] = ids[h.id];
    let records, charged = 0;
    try {
      const rows = await runActor(actorInput(hotels, w, settings, ids), { token, fetchImpl, sleep });
      const matched = matchRows(hotels, rows, ids);
      records = Object.fromEntries(hotels.map((h) => [h.id, toRecord(matched[h.id], nights, settings.para_birimi || "EUR", trusted, { vergi })]));
      charged = Object.values(records).filter((r) => r.durum === "fiyat" || r.durum === "dogrulanamadi" || r.durum === "dolu").length; // Apify bulduğu her otel için ücret alır
      validateRecords(hotels, records);
      okRuns++; report.haftaSonlari.push(w.giris);
    } catch (e) {
      const msg = redact(e.message, token);
      report.hatalar.push(`${w.giris}: ${msg}`);
      if (e.fatal) { fatal = e; B.release(est); return; }
      records = Object.fromEntries(hotels.map((h) => [h.id, { durum: "hata", not: msg }]));
    }
    B.release(est);
    B.spend(charged * rate);
    report.ucretliSatir += charged;
    mergeWeekend(state, w, hotels, records, checkedAt, usedIds);
    for (const rec of Object.values(records)) {
      report[rec.durum] = (report[rec.durum] || 0) + 1;
      if (rec.supheli) report.supheli++;
      if (usable(rec)) report.kullanilabilir++;
      if (rec.vergi) report.vergi[rec.vergi] = (report.vergi[rec.vergi] || 0) + 1;
    }
  });

  if (tried > 0 && okRuns === 0) throw new Error("Hiçbir kontrol başarılı olmadı: " + (report.hatalar[0] || "bilinmeyen hata"));
  report.gercekMaliyet = await measureCost({ token, fetchImpl, sleep, before: usage, holder: state, robot: "otel", queries: report.ucretliSatir, t: now.toISOString() });
  report.haftaSonlari.sort();
  report.tahminiMaliyetUsd = r2(report.ucretliSatir * rate);
  state.harcama.usd = r2(state.harcama.usd);
  report.butce.harcanan = usage ? r2(usage.usd + B.added) : state.harcama.usd;
  report.arsivlenen = archivePast(state, archive, today);
  if (okRuns > 0) { state.guncellendi = checkedAt; state.sonCalisma = { tarih: checkedAt, mod: mode, hafta_sonu: report.haftaSonlari.length, kontrol: report.ucretliSatir + report.bulunamadi + report.hata + report.sonuc_yok, fiyatli: report.kullanilabilir, dogrulanamadi: report.dogrulanamadi, supheli: report.supheli, vergi: report.vergi, tahminiMaliyetUsd: report.tahminiMaliyetUsd, butceAtlanan: report.butceAtlanan.length }; }
  return { state, archive, report, plan, fatal: fatal ? redact(fatal.message, token) : null };
}

export function toMarkdown({ report, plan, state, hotelsDoc }) {
  const eur = (n) => (n == null ? "" : `${Math.round(n)} €`);
  const p = [`# Otel fiyat robotu`, "", `Tarih: ${report.tarih} (${report.gun}), mod: ${report.mod}, Apify planı: ${report.plan}${report.pazar ? `, pazar: ${report.pazar}` : ""}.`, ""];
  if (!plan.length) { p.push("Bugün takvime göre kontrol günü değil, hiçbir şey çekilmedi."); return p.join("\n"); }
  p.push(`Kontrol edilen hafta sonları: ${report.haftaSonlari.join(", ") || "yok"} (${report.otelSayisi} otel).`);
  if (report.butceAtlanan.length) p.push(`Bütçe sınırı yüzünden atlanan hafta sonları: ${report.butceAtlanan.sort().join(", ")}.`);
  p.push(`Sonuç: ${report.kullanilabilir} kullanılabilir fiyat (${report.fiyat} tanınmış sitede, ${report.supheli} tanesi şüpheli yüksek), ${report.dogrulanamadi} doğrulanamadı (sadece az bilinen sitelerde), ${report.dolu} dolu, ${report.bulunamadi} bulunamadı, ${report.hata} hata.`);
  p.push(`Vergi: ${report.vergi.dahil} fiyat zaten vergili, ${report.vergi.eklendi} fiyata vergi eklendi, ${report.vergi.bilinmiyor} fiyatın vergisi bilinmiyor.`);
  p.push(`Bu çalışma: tahmini ~${report.tahminiMaliyetUsd} $${report.gercekMaliyet != null ? `, Apify sayacına göre ${report.gercekMaliyet} $` : ""}. Fatura dönemi (başlangıç ${report.butce.donem}): ~${report.butce.harcanan} $ / sınır ${report.butce.sinir} $${report.butce.gercek != null ? ` (Apify'ın kendi sayacı: ${report.butce.gercek} $)` : " (Apify sayacı okunamadı, tahmin)"}.`, "");
  const shown = report.haftaSonlari.slice(0, 3);
  const label = { fiyat: "", dolu: "dolu", bulunamadi: "BULUNAMADI", hata: "HATA", sonuc_yok: "sonuç yok" };
  const cell = (s) => (!s ? "" : s.durum === "fiyat" ? eur(s.fiyat) + (s.supheli ? " ?" : "") : s.durum === "dogrulanamadi" ? eur(s.fiyat) + "*" : label[s.durum] || s.durum);
  if (shown.length) for (const city of hotelsDoc.sehirler) {
    const cells = city.oteller.map((h) => shown.map((g) => cell(state.haftaSonlari[g]?.oteller[h.id]?.son)));
    if (!cells.some((r) => r.some((x) => x))) continue;
    p.push(`## ${city.sehir}`, "", "| Otel | Kategori | " + shown.map((g) => g.slice(5)).join(" | ") + " |", "| --- | --- | " + shown.map(() => "---").join(" | ") + " |");
    city.oteller.forEach((h, i) => p.push(`| ${h.ad} | ${h.kategori} | ${cells[i].join(" | ")} |`));
    p.push("");
  }
  if (report.deneme && shown.length) {
    // pazar denemesi: her otelin site fiyatı, vergili fiyatı ve Google'ın vergili toplamı yan yana
    p.push(`## Pazar denemesi (pazar: ${report.pazar}, veriler kaydedilmedi)`, "", "| Şehir | Otel | Site | Site fiyatı | Vergili | Vergi | Google toplamı |", "| --- | --- | --- | --- | --- | --- | --- |");
    for (const city of hotelsDoc.sehirler) for (const h of city.oteller) {
      const s = state.haftaSonlari[shown[0]]?.oteller[h.id]?.son;
      if (s && s.fiyat != null) p.push(`| ${city.sehir} | ${h.ad} | ${s.site || ""} | ${eur(s.fiyatVergisiz ?? s.fiyat)} | ${eur(s.fiyat)} | ${s.vergi || ""} | ${eur(s.googleFiyat)} |`);
    }
    p.push("");
  }
  if (report.hatalar.length) p.push("Hatalar:", ...report.hatalar.map((x) => "- " + x), "");
  p.push("Not: Fiyatlar 2 yetişkin, Cuma-Pazar 2 gece, vergiler dahil. * işaretli fiyat sadece az bilinen sitelerde bulundu (doğrulanamadı), ? işaretli fiyat otelin olağan fiyatının 1,5 katından yüksek (şüpheli); ikisi de sitede kullanılmaz.");
  return p.join("\n");
}

async function readJson(path, fallback) { try { return JSON.parse(await readFile(path, "utf8")); } catch (e) { if (e.code === "ENOENT") return fallback; throw e; } }

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const P = { hotels: root + "data/hotels.json", meta: root + "data/otel-fiyatlari.json", city: (slug) => root + "data/fiyatlar/" + slug + ".json", archive: (ym) => root + "data/arsiv/" + ym + ".json" };
  (async () => {
    const hotelsDoc = await readJson(P.hotels);
    const mode = (process.env.MOD || "takvim").trim();
    // Pazar A/B denemesi: PAZAR verilirse o çalışma başka pazarla yapılır, sonuç sadece özete yazılır, veriler değişmez
    const pazar = (process.env.PAZAR || "").trim().toLowerCase();
    const deneme = !!pazar && pazar !== String(hotelsDoc.ayarlar.pazar || "").toLowerCase();
    if (pazar) hotelsDoc.ayarlar.pazar = pazar;
    const only = (process.env.SEHIR || "").split(",").map((s) => s.trim()).filter(Boolean);
    const meta = await readJson(P.meta, emptyState());
    const files = {};
    for (const c of hotelsDoc.sehirler) { const f = await readJson(P.city(citySlug(c.sehir)), null); if (f) files[citySlug(c.sehir)] = f; }
    // eski tek dosya biçiminden geçiş: haftaSonlari ana dosyadaysa onu da al
    const state = meta.haftaSonlari && Object.keys(meta.haftaSonlari).length ? { ...joinState(meta, files), haftaSonlari: { ...joinState(meta, files).haftaSonlari, ...meta.haftaSonlari } } : joinState(meta, files);
    const ym = istanbulToday().slice(0, 7);
    const archive = await readJson(P.archive(ym), { haftaSonlari: {} });
    const out = await run({ token: process.env.APIFY_TOKEN, hotelsDoc, state, archive, mode, only: only.length ? only : null });
    out.report.pazar = hotelsDoc.ayarlar.pazar; out.report.deneme = deneme;
    const md = toMarkdown({ ...out, hotelsDoc }); console.log(md);
    if (process.env.GITHUB_STEP_SUMMARY) await writeFile(process.env.GITHUB_STEP_SUMMARY, md + "\n", { flag: "a" });
    if (out.plan.length && !deneme) {
      const sp = splitState(out.state, hotelsDoc);
      await mkdir(dirname(P.city("x")), { recursive: true });
      await writeFile(P.meta, JSON.stringify(sp.meta, null, 1) + "\n");
      for (const [slug, f] of Object.entries(sp.files)) await writeFile(P.city(slug), JSON.stringify(f) + "\n");
      if (out.report.arsivlenen) { await mkdir(dirname(P.archive(ym)), { recursive: true }); await writeFile(P.archive(ym), JSON.stringify(out.archive) + "\n"); }
    }
    if (out.fatal) { console.error("HATA:", out.fatal); process.exit(1); }
  })().catch((e) => { console.error("HATA:", redact(e.message, process.env.APIFY_TOKEN)); process.exit(1); });
}
