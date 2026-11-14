// Uçak fiyat robotu: İstanbul'dan (IST + SAW) her başkente Cuma sabah gidiş, Pazar akşam dönüş, 1 kişi
// (saat aralıkları ayarda: gidis_saat, donus_saat; o saatlerde uçuş yoksa saat dışı en ucuz uçuş "saatDisi" işaretiyle yazılır)
// gidiş-dönüş en ucuz uçuşu ve en ucuz aktarmasız uçuşu Google Flights'tan çeker.
// Google Flights'ı Apify'daki hazır robot okur. Ayarda "aktor":
//  - "eiv~google-flights-scraper" (varsayılan, uçuş başına ücret: arama başına ~0,0036 $; gidiş VE dönüş saat aralığını Google'da uygular,
//    ücretsiz özet satırında Google'ın fiyat seviyesi (düşük/normal/yüksek), normal fiyat aralığı ve en ucuz aktarmasız fiyat gelir)
//  - "dz_omar~google-flights-scraper" (eski, arama başına ~0,028 $)
// Ayarlar: data/ucus-ayarlari.json. Sonuç: data/ucuslar.json.
// Bütçe: Apify'ın kendi kullanım sayacı (iki robot ortak) ve data/hotels.json > aylik_butce_usd. Ölçümler bu dosyada tutulur.
// "toplu": true ise bir hafta sonu için tüm şehirler tek Apify çalışmasında aranır (çalışma başına ücret tek sefer ödenir).
// Fiyat bulunamazsa tahmin yürütmez: "yok" ya da "hata" yazar.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { runActor, planFor, istanbulToday, billingPeriod, apifyUsage, makeBudget, measureCost, isActive } from "./otel-fiyatlari.mjs";

export const FLIGHT_ACTOR = "dz_omar~google-flights-scraper";
export const EIV_ACTOR = "eiv~google-flights-scraper";
export const actorOf = (cfg) => cfg.aktor || EIV_ACTOR;
export const isEiv = (cfg) => /^eiv~/.test(actorOf(cfg));
// Tahmini maliyet: uçuş satırı başına 0,0003 $ + çalışma başına güvenlik payı
export const COST_PER_ROW = 0.0003, COST_PER_RUN = 0.004;
const r2 = (x) => Math.round(x * 100) / 100;
const num = (x) => typeof x === "number" && Number.isFinite(x);
const HISTORY_MAX = 30;

export function flightInput(cfg, city, w, cities = null, { saatsiz = false } = {}) {
  const dest = cities ? [...new Set(cities.flatMap((c) => c.havalimani))] : city.havalimani;
  const saat = saatsiz ? {} : { ...(cfg.gidis_saat ? { outboundDepartureTime: cfg.gidis_saat } : {}), ...(cfg.donus_saat ? { returnDepartureTime: cfg.donus_saat } : {}) };
  return { ...saat,
    tripType: "round_trip", origin: cfg.kalkis, destination: dest,
    departureDate: w.giris, returnDate: w.cikis, adults: cfg.kisi || 1,
    currency: cfg.para_birimi || "EUR", market: cfg.pazar || "TR", language: "en-US",
    resultsView: "cheapest", maxResults: cities ? Math.min(500, (cfg.toplu_sonuc_sayisi || 8) * cities.length) : cfg.sonuc_sayisi || 6,
  };
}

// Google Flights bağlantısı Türkçe açılsın (robot hl=en-US döndürüyor); diğer parametreler aynen kalır
export function trLink(url) {
  if (!url || typeof url !== "string") return url || null;
  try {
    const u = new URL(url);
    if (!/(^|\.)google\.[a-z.]+$/.test(u.hostname)) return url;
    u.searchParams.set("hl", "tr");
    return u.toString();
  } catch { return url; }
}

const isNonstop = (r) => r.stops === 0 || /nonstop|direct|aktarmas/i.test(String(r.stopsLabel || ""));
const pick = (r) => ({
  fiyat: r2(r.price), havayolu: Array.isArray(r.airlines) ? r.airlines.join(", ") : r.airlines || null,
  aktarma: num(r.stops) ? r.stops : isNonstop(r) ? 0 : null, aktarmaYazi: r.stopsLabel || null,
  kalkis: r.origin || null, varis: r.destination || null, ucusSaati: r.departureTime || null,
  sureDk: num(r.durationMinutes) ? r.durationMinutes : null, link: trLink(r.googleFlightsUrl || null),
});

// "5-12" -> [5, 12]; kalkış saati (ISO "2026-11-06T08:15") bu aralıkta mı
export function inWindow(iso, win) {
  if (!win || !iso) return true;
  const m = /^(\d{1,2})-(\d{1,2})$/.exec(String(win)), h = /T(\d{2}):(\d{2})/.exec(String(iso));
  if (!m || !h) return true;
  const x = +h[1] + +h[2] / 60;
  return x >= +m[1] && x <= +m[2];
}
const winText = (w) => { const m = /^(\d{1,2})-(\d{1,2})$/.exec(String(w || "")); return m ? `${m[1].padStart(2, "0")}:00–${m[2].padStart(2, "0")}:00` : null; };
export const saatAraligi = (cfg) => (cfg.gidis_saat || cfg.donus_saat ? { gidis: winText(cfg.gidis_saat), donus: winText(cfg.donus_saat) } : null);

// Plan sayfasındaki "kendin oluştur" için: fiyat sırasıyla, havayolu + kalkış + aktarma durumu farklı ilk 4 uçuş (bağlantısız, dosya büyümesin)
export function secenekSec(list, n = 4) {
  const gor = new Set(), out = [];
  for (const u of list) {
    const k = `${u.havayolu}|${u.kalkis}|${u.aktarma ? 1 : 0}`;
    if (gor.has(k)) continue;
    gor.add(k); out.push({ fiyat: u.fiyat, havayolu: u.havayolu, aktarma: u.aktarma, kalkis: u.kalkis, varis: u.varis, ucusSaati: u.ucusSaati });
    if (out.length >= n) break;
  }
  return out;
}

// Robotun satırlarından en ucuz ve en ucuz aktarmasız uçuşu seçer (saatli aramada gidiş saati aralık dışındaysa elenir)
export function toFlightRecord(rows, cfg, city, { saatli = false } = {}) {
  const ok = (rows || []).filter((r) => r && (r.rowType || r.type || "flight") === "flight" && num(r.price) && r.price > 0
    && (!saatli || inWindow(r.departureTime, cfg.gidis_saat))
    && (!r.currency || r.currency === (cfg.para_birimi || "EUR"))
    && (!r.origin || cfg.kalkis.includes(r.origin)) && (!r.destination || city.havalimani.includes(r.destination)));
  const fails = (rows || []).filter((r) => r && /input_error|search_failed/.test(String(r.rowType || r.type || r.status || "")));
  if (!ok.length) return fails.length ? { durum: "hata", not: String(fails[0].message || fails[0].error || fails[0].rowType || "arama başarısız").slice(0, 160) } : { durum: "yok", not: "Bu tarihlerde gidiş-dönüş uçuş bulunamadı" };
  const sorted = ok.slice().sort((a, b) => a.price - b.price);
  const direct = sorted.find(isNonstop);
  const ins = sorted.find((r) => r.priceInsights)?.priceInsights || null;
  return {
    durum: "fiyat", ...pick(sorted[0]),
    aktarmasiz: direct ? pick(direct) : null,
    secenekler: secenekSec(sorted.map(pick)),
    tipikFiyat: ins && num(ins.typicalPrice) ? ins.typicalPrice : null, fiyatSeviyesi: ins ? ins.priceLevel || null : null,
  };
}

// ---------- eiv/google-flights-scraper ----------
export const eivLine = (cfg, city, w) => `${cfg.kalkis.join(",")}-${city.havalimani.join(",")} ${w.giris} ${w.cikis}`;
export function eivInput(cfg, cities, w, { saatsiz = false } = {}) {
  const per = cfg.sonuc_sayisi || 5;
  return {
    searches: cities.map((c) => eivLine(cfg, c, w)), adults: cfg.kisi || 1, cabinClass: "economy",
    currency: cfg.para_birimi || "EUR", market: cfg.pazar || "TR", language: "en",
    ...(saatsiz ? {} : { ...(cfg.gidis_saat ? { departureTimeRange: cfg.gidis_saat } : {}), ...(cfg.donus_saat ? { returnDepartureTimeRange: cfg.donus_saat } : {}) }),
    sortBy: "price", maxResultsPerSearch: per, maxItems: cities.length * per + 10, includePriceInsights: true, includeSearchSummary: true, maxConcurrency: 5,
  };
}
const pickEiv = (r) => ({
  fiyat: r2(r.price), havayolu: Array.isArray(r.airlines) && r.airlines.length ? r.airlines.join(", ") : r.airline || null,
  aktarma: num(r.stops) ? r.stops : null, aktarmaYazi: num(r.stops) ? (r.stops === 0 ? "Aktarmasız" : `${r.stops} aktarma`) : null,
  kalkis: r.origin || null, varis: r.destination || null, ucusSaati: r.departAt || null,
  sureDk: num(r.durationMinutes) ? r.durationMinutes : null, link: trLink(r.googleFlightsUrl || null),
});
const LEVEL = { low: "dusuk", typical: "normal", high: "yuksek" };
// Bir aramanın satırlarından kayıt: en ucuz uçuş, en ucuz aktarmasız (satırlarda yoksa ücretsiz özetten), Google fiyat seviyesi
export function eivRecord(rows, cfg, city) {
  const fl = rows.filter((r) => r && r.recordType === "flight" && num(r.price) && r.price > 0
    && (!r.currency || r.currency === (cfg.para_birimi || "EUR")) && (!r.destination || city.havalimani.includes(r.destination)))
    .sort((a, b) => a.price - b.price);
  const sum = rows.find((r) => r && r.recordType === "search-summary") || {};
  const err = rows.find((r) => r && (r.errorCode || r.recordType === "error"));
  if (!fl.length) {
    if (err && err.errorCode !== "NO_FLIGHTS") return { durum: "hata", kod: err.errorCode || null, not: String(err.errorMessage || err.errorCode || "arama başarısız").slice(0, 160) };
    return { durum: "yok", not: "Bu tarihlerde gidiş-dönüş uçuş bulunamadı" };
  }
  const direct = fl.find((r) => r.stops === 0);
  let aktarmasiz = direct ? pickEiv(direct) : null;
  if (!aktarmasiz && num(sum.cheapestNonstopPrice)) aktarmasiz = { fiyat: r2(sum.cheapestNonstopPrice), havayolu: null, aktarma: 0, aktarmaYazi: "Aktarmasız", kalkis: null, varis: null, ucusSaati: null, sureDk: null, link: trLink(sum.googleFlightsUrl || fl[0].googleFlightsUrl || null) };
  const lvl = sum.priceLevel || fl[0].priceLevel || null;
  return {
    durum: "fiyat", ...pickEiv(fl[0]), aktarmasiz, secenekler: secenekSec(fl.map(pickEiv)),
    tipikFiyat: num(sum.typicalPrice) ? sum.typicalPrice : null,
    tipikAralik: num(sum.typicalPriceLow ?? fl[0].typicalPriceLow) && num(sum.typicalPriceHigh ?? fl[0].typicalPriceHigh) ? [sum.typicalPriceLow ?? fl[0].typicalPriceLow, sum.typicalPriceHigh ?? fl[0].typicalPriceHigh] : null,
    fiyatSeviyesi: lvl ? LEVEL[lvl] || lvl : null, bulunanUcus: num(sum.flightsFound) ? sum.flightsFound : null,
  };
}
const byLine = (rows) => { const m = new Map(); for (const r of rows || []) { if (!r || !r.input) continue; if (!m.has(r.input)) m.set(r.input, []); m.get(r.input).push(r); } return m; };

export function emptyFlights() {
  return { harcama: { donem: null, usd: 0 }, apifyKullanim: null, olcumler: [], guncellendi: null, kaynak: "Google Flights (Apify: eiv/google-flights-scraper)", paraBirimi: "EUR", kisi: 1, aciklama: "Kişi başı gidiş-dönüş, Cuma sabah gidiş Pazar akşam dönüş, İstanbul (IST veya SAW) çıkışlı", haftaSonlari: {} };
}

export function mergeFlight(state, w, sehir, rec, t) {
  const slot = (state.haftaSonlari[w.giris] ||= { cikis: w.cikis, sehirler: {} });
  const o = (slot.sehirler[sehir] ||= { son: null, gecmis: [] });
  // Google/robot hatasında son geçerli fiyat silinmez (bilgi kaybı olmasın); hata ayrıca not edilir
  if (rec.durum === "hata" && o.son && o.son.durum === "fiyat") o.sonHata = { t, not: rec.not || null, kod: rec.kod || null };
  else { o.son = { ...rec, kontrol: t }; delete o.sonHata; }
  o.gecmis.push({ t, durum: rec.durum, fiyat: rec.fiyat ?? null });
  if (o.gecmis.length > HISTORY_MAX) o.gecmis.splice(0, o.gecmis.length - HISTORY_MAX);
}

export function dropPast(state, todayIso) {
  let n = 0;
  for (const [g, w] of Object.entries(state.haftaSonlari)) if (w.cikis < todayIso) { delete state.haftaSonlari[g]; n++; }
  return n;
}

async function pool(items, size, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => { while (i < items.length) { const k = i++; await fn(items[k]); } }));
}

// meta: otel robotunun özet dosyası (ortak harcama sayacı burada), hotelSettings: data/hotels.json > ayarlar
export async function run({ token, cfg, state = emptyFlights(), hotelSettings = {}, now = new Date(), mode = "takvim", only = null, fetchImpl = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), concurrency = 4 }) {
  if (!token) throw new Error("APIFY_TOKEN tanımlı değil (GitHub > Settings > Secrets and variables > Actions bölümüne eklenmeli)");
  state = { ...emptyFlights(), ...structuredClone(state) };
  const today = istanbulToday(now), t = now.toISOString();
  const donem = billingPeriod(today, hotelSettings.fatura_gunu || 1);
  if (!state.harcama || state.harcama.donem !== donem) state.harcama = { donem, usd: 0 };
  const usage = planFor(today, cfg, mode).length ? await apifyUsage({ token, fetchImpl }) : null;
  if (usage) state.apifyKullanim = { ...usage, kontrol: now.toISOString() };
  const B = makeBudget(state, hotelSettings.aylik_butce_usd, usage);
  const cities = cfg.sehirler.filter((c) => (!only || only.includes(c.sehir)) && isActive(c, istanbulToday(now)));
  const plan = planFor(today, cfg, mode);
  const eiv = isEiv(cfg);
  const jobs = [];
  for (const w of plan) { if (eiv || cfg.toplu) jobs.push({ w, group: cities }); else for (const c of cities) jobs.push({ w, group: [c] }); }
  const report = { gercekKullanim: usage ? usage.usd : null, sinir: B.cap, tarih: today, mod: mode, plan: plan.map((w) => w.giris), arama: 0, fiyat: 0, yok: 0, hata: 0, butceAtlanan: 0, tahminiMaliyetUsd: 0, hatalar: [] };
  let ok = 0, fatal = null;
  const perSearch = cfg.arama_basi_usd || (eiv ? 0.005 : 0.03); // ölçülen: eiv ~0,0036 $, dz_omar ~0,028 $
  await pool(jobs, eiv ? Math.min(concurrency, 2) : concurrency, async ({ w, group }) => {
    if (fatal) return;
    if (eiv) return eivJob(w, group);
    const est = perSearch * group.length;
    if (!B.reserve(est)) { report.butceAtlanan += group.length; return; }
    report.arama += group.length; report.calisma = (report.calisma || 0) + 1;
    let recs;
    try {
      const saatli = !!(cfg.gidis_saat || cfg.donus_saat);
      const rows = await runActor(group.length > 1 ? flightInput(cfg, null, w, group) : flightInput(cfg, group[0], w), { token, fetchImpl, sleep, actor: FLIGHT_ACTOR, maxPolls: 60 });
      recs = group.map((c) => [c, toFlightRecord(rows, cfg, c, { saatli })]); ok++;
      // Cuma sabah / Pazar akşam uçuşu yoksa (tek seferli hatlar) saat şartı olmadan bir kez daha ara
      if (saatli && group.length === 1 && recs[0][1].durum === "yok" && B.reserve(perSearch)) {
        report.arama++; report.saatDisiArama = (report.saatDisiArama || 0) + 1;
        const rows2 = await runActor(flightInput(cfg, group[0], w, null, { saatsiz: true }), { token, fetchImpl, sleep, actor: FLIGHT_ACTOR, maxPolls: 60 });
        B.release(perSearch); B.spend(perSearch); report.tahminiMaliyetUsd += perSearch;
        const r2rec = toFlightRecord(rows2, cfg, group[0]);
        if (r2rec.durum === "fiyat") recs = [[group[0], { ...r2rec, saatDisi: true, not: "Cuma sabah gidiş / Pazar akşam dönüş saatlerinde uçuş yok; saat dışı en ucuz uçuş" }]];
      }
      for (const [, rec] of recs) if (rec.durum === "fiyat" && saatli && !rec.saatDisi) rec.saat = saatAraligi(cfg);
    } catch (e) {
      const msg = String(e.message).split(token).join("***");
      if (e.fatal) { fatal = msg; B.release(est); return; }
      recs = group.map((c) => [c, { durum: "hata", not: msg }]); report.hatalar.push(`${w.giris} (${group.length} şehir): ${msg}`);
    }
    B.release(est);
    B.spend(est); report.tahminiMaliyetUsd += est;
    for (const [c, rec] of recs) { report[rec.durum] = (report[rec.durum] || 0) + 1; mergeFlight(state, w, c.sehir, rec, t); }
  });
  // eiv: hafta sonu başına tek Apify çalışması (tüm şehirler); Google hatası verenler bir kez daha, saat aralığında uçuşu olmayanlar saat şartsız aranır
  async function eivJob(w, group) {
    const est = perSearch * group.length;
    if (!B.reserve(est)) { report.butceAtlanan += group.length; return; }
    report.arama += group.length; report.calisma = (report.calisma || 0) + 1;
    const saatli = !!(cfg.gidis_saat || cfg.donus_saat);
    const call = (cs, o) => runActor(eivInput(cfg, cs, w, o), { token, fetchImpl, sleep, actor: EIV_ACTOR, maxPolls: 120 });
    const recs = new Map();
    try {
      let m = byLine(await call(group, {})); ok++;
      for (const c of group) recs.set(c.sehir, eivRecord(m.get(eivLine(cfg, c, w)) || [], cfg, c));
      const retry = group.filter((c) => recs.get(c.sehir).durum === "hata");
      if (retry.length && B.reserve(perSearch * retry.length)) {
        report.arama += retry.length; report.tekrar = (report.tekrar || 0) + retry.length;
        m = byLine(await call(retry, {}));
        for (const c of retry) recs.set(c.sehir, eivRecord(m.get(eivLine(cfg, c, w)) || [], cfg, c));
        B.release(perSearch * retry.length); B.spend(perSearch * retry.length); report.tahminiMaliyetUsd += perSearch * retry.length;
      }
      const none = saatli ? group.filter((c) => recs.get(c.sehir).durum === "yok") : [];
      if (none.length && B.reserve(perSearch * none.length)) {
        report.arama += none.length; report.saatDisiArama = (report.saatDisiArama || 0) + none.length;
        m = byLine(await call(none, { saatsiz: true }));
        for (const c of none) { const r = eivRecord(m.get(eivLine(cfg, c, w)) || [], cfg, c);
          if (r.durum === "fiyat") recs.set(c.sehir, { ...r, saatDisi: true, not: "Cuma sabah gidiş / Pazar akşam dönüş saatlerinde uçuş yok; saat dışı en ucuz uçuş" }); }
        B.release(perSearch * none.length); B.spend(perSearch * none.length); report.tahminiMaliyetUsd += perSearch * none.length;
      }
    } catch (e) {
      const msg = String(e.message).split(token).join("***");
      if (e.fatal) { fatal = msg; B.release(est); return; }
      for (const c of group) if (!recs.has(c.sehir)) recs.set(c.sehir, { durum: "hata", not: msg });
      report.hatalar.push(`${w.giris} (${group.length} şehir): ${msg}`);
    }
    B.release(est); B.spend(est); report.tahminiMaliyetUsd += est;
    for (const c of group) { const rec = recs.get(c.sehir); if (rec.durum === "fiyat" && saatli && !rec.saatDisi) rec.saat = saatAraligi(cfg);
      if (rec.durum === "hata" && rec.kod) report.hatalar.push(`${w.giris} ${c.sehir}: ${rec.kod}`);
      report[rec.durum] = (report[rec.durum] || 0) + 1; mergeFlight(state, w, c.sehir, rec, t); }
  }
  if (report.arama > 0 && ok === 0) throw new Error("Hiçbir uçuş araması başarılı olmadı: " + (fatal || report.hatalar[0] || "bilinmeyen hata"));
  state.harcama.usd = r2(state.harcama.usd); report.tahminiMaliyetUsd = r2(report.tahminiMaliyetUsd);
  report.gercekMaliyet = await measureCost({ token, fetchImpl, sleep, before: usage, holder: state, robot: eiv ? "ucak-eiv" : cfg.toplu ? "ucak-toplu" : "ucak", queries: report.arama, t });
  report.silinen = dropPast(state, today);
  if (ok > 0) { state.guncellendi = t; state.saatAraligi = saatAraligi(cfg); state.aciklama = emptyFlights().aciklama; state.kaynak = `Google Flights (Apify: ${actorOf(cfg).replace("~", "/")})`; }
  return { state, report, plan, fatal };
}

export function toMarkdown({ report, state, cfg }) {
  const p = ["# Uçak fiyat robotu", "", `Tarih: ${report.tarih}, mod: ${report.mod}. Hafta sonları: ${report.plan.join(", ") || "yok (bugün kontrol günü değil)"}.`];
  if (!report.plan.length) return p.join("\n");
  p.push(`Arama: ${report.arama} (${report.calisma || 0} Apify çalışması), fiyat: ${report.fiyat}, uçuş yok: ${report.yok}, hata: ${report.hata}, bütçe yüzünden atlanan: ${report.butceAtlanan}. Tahmini maliyet: ~${report.tahminiMaliyetUsd} $${report.gercekMaliyet != null ? `, Apify sayacına göre ${report.gercekMaliyet} $` : ""}. Apify'ın kendi sayacı (çalışma öncesi): ${report.gercekKullanim ?? "okunamadı"} $, sınır ${report.sinir} $.`, "");
  const g = report.plan[0], w = state.haftaSonlari[g];
  if (w) {
    p.push(`## ${g} hafta sonu (kişi başı gidiş-dönüş)`, "", "| Şehir | En ucuz | Havayolu | Kalkış | Aktarmasız en ucuz |", "| --- | --- | --- | --- | --- |");
    for (const c of cfg.sehirler) { const s = w.sehirler[c.sehir]?.son; if (!s) continue;
      p.push(s.durum === "fiyat" ? `| ${c.sehir} | ${Math.round(s.fiyat)} € | ${s.havayolu || ""} | ${s.kalkis || ""} | ${s.aktarmasiz ? Math.round(s.aktarmasiz.fiyat) + " € (" + s.aktarmasiz.havayolu + ")" : "yok"} |` : `| ${c.sehir} | ${s.durum} | | | |`); }
  }
  if (report.hatalar.length) p.push("", "Hatalar:", ...report.hatalar.slice(0, 20).map((x) => "- " + x));
  return p.join("\n");
}

async function readJson(path, fallback) { try { return JSON.parse(await readFile(path, "utf8")); } catch (e) { if (e.code === "ENOENT") return fallback; throw e; } }

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const P = { cfg: root + "data/ucus-ayarlari.json", state: root + "data/ucuslar.json", hotels: root + "data/hotels.json" };
  (async () => {
    const cfg = await readJson(P.cfg), hotels = await readJson(P.hotels, { ayarlar: {} });
    const only = (process.env.SEHIR || "").split(",").map((s) => s.trim()).filter(Boolean);
    if (process.env.TOPLU) cfg.toplu = process.env.TOPLU === "1";
    const out = await run({ token: process.env.APIFY_TOKEN, cfg, state: await readJson(P.state, emptyFlights()), hotelSettings: hotels.ayarlar, mode: (process.env.MOD || "takvim").trim(), only: only.length ? only : null });
    const md = toMarkdown({ ...out, cfg }); console.log(md);
    if (process.env.GITHUB_STEP_SUMMARY) await writeFile(process.env.GITHUB_STEP_SUMMARY, md + "\n", { flag: "a" });
    if (out.plan.length) {
      await writeFile(P.state, JSON.stringify(out.state) + "\n");
    }
    if (out.fatal) { console.error("HATA:", out.fatal); process.exit(1); }
  })().catch((e) => { console.error("HATA:", String(e.message).split(process.env.APIFY_TOKEN || "§").join("***")); process.exit(1); });
}
