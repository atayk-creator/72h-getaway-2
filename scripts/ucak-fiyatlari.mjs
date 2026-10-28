// Uçak fiyat robotu: İstanbul'dan (IST + SAW) her başkente Cuma gidiş, Pazar dönüş, 1 kişi
// gidiş-dönüş en ucuz uçuşu ve en ucuz aktarmasız uçuşu Google Flights'tan çeker.
// Google Flights'ı Apify'daki hazır robot okur: https://apify.com/dz_omar/google-flights-scraper
// Ayarlar: data/ucus-ayarlari.json. Sonuç: data/ucuslar.json.
// Apify harcaması otel robotuyla ortak sayılır (data/otel-fiyatlari.json > harcama), sınır data/hotels.json'da.
// Fiyat bulunamazsa tahmin yürütmez: "yok" ya da "hata" yazar.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { runActor, planFor, istanbulToday, billingPeriod, emptyState, apifyUsage, makeBudget } from "./otel-fiyatlari.mjs";

export const FLIGHT_ACTOR = "dz_omar~google-flights-scraper";
// Tahmini maliyet: uçuş satırı başına 0,0003 $ + çalışma başına güvenlik payı
export const COST_PER_ROW = 0.0003, COST_PER_RUN = 0.004;
const r2 = (x) => Math.round(x * 100) / 100;
const num = (x) => typeof x === "number" && Number.isFinite(x);
const HISTORY_MAX = 30;

export function flightInput(cfg, city, w) {
  return {
    tripType: "round_trip", origin: cfg.kalkis, destination: city.havalimani,
    departureDate: w.giris, returnDate: w.cikis, adults: cfg.kisi || 1,
    currency: cfg.para_birimi || "EUR", market: cfg.pazar || "TR", language: "en-US",
    resultsView: "cheapest", maxResults: cfg.sonuc_sayisi || 6,
  };
}

const isNonstop = (r) => r.stops === 0 || /nonstop|direct|aktarmas/i.test(String(r.stopsLabel || ""));
const pick = (r) => ({
  fiyat: r2(r.price), havayolu: Array.isArray(r.airlines) ? r.airlines.join(", ") : r.airlines || null,
  aktarma: num(r.stops) ? r.stops : isNonstop(r) ? 0 : null, aktarmaYazi: r.stopsLabel || null,
  kalkis: r.origin || null, varis: r.destination || null, ucusSaati: r.departureTime || null,
  sureDk: num(r.durationMinutes) ? r.durationMinutes : null, link: r.googleFlightsUrl || null,
});

// Robotun satırlarından en ucuz ve en ucuz aktarmasız uçuşu seçer
export function toFlightRecord(rows, cfg, city) {
  const ok = (rows || []).filter((r) => r && (r.rowType || r.type || "flight") === "flight" && num(r.price) && r.price > 0
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
    tipikFiyat: ins && num(ins.typicalPrice) ? ins.typicalPrice : null, fiyatSeviyesi: ins ? ins.priceLevel || null : null,
  };
}

export function emptyFlights() {
  return { guncellendi: null, kaynak: "Google Flights (Apify: dz_omar/google-flights-scraper)", paraBirimi: "EUR", kisi: 1, aciklama: "Kişi başı gidiş-dönüş, Cuma gidiş Pazar dönüş, İstanbul (IST veya SAW) çıkışlı", haftaSonlari: {} };
}

export function mergeFlight(state, w, sehir, rec, t) {
  const slot = (state.haftaSonlari[w.giris] ||= { cikis: w.cikis, sehirler: {} });
  const o = (slot.sehirler[sehir] ||= { son: null, gecmis: [] });
  o.son = { ...rec, kontrol: t };
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
export async function run({ token, cfg, state = emptyFlights(), meta = emptyState(), hotelSettings = {}, now = new Date(), mode = "takvim", only = null, fetchImpl = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), concurrency = 4 }) {
  if (!token) throw new Error("APIFY_TOKEN tanımlı değil (GitHub > Settings > Secrets and variables > Actions bölümüne eklenmeli)");
  state = { ...emptyFlights(), ...structuredClone(state) };
  meta = structuredClone(meta);
  const today = istanbulToday(now), t = now.toISOString();
  const donem = billingPeriod(today, hotelSettings.fatura_gunu || 1);
  if (!meta.harcama || meta.harcama.donem !== donem) meta.harcama = { donem, usd: 0 };
  const usage = planFor(today, cfg, mode).length ? await apifyUsage({ token, fetchImpl }) : null;
  if (usage) meta.apifyKullanim = { ...usage, kontrol: now.toISOString() };
  const B = makeBudget(meta, hotelSettings.aylik_butce_usd, usage);
  const cities = cfg.sehirler.filter((c) => !only || only.includes(c.sehir));
  const plan = planFor(today, cfg, mode);
  const jobs = [];
  for (const w of plan) for (const c of cities) jobs.push({ w, c });
  const report = { gercekKullanim: usage ? usage.usd : null, sinir: B.cap, tarih: today, mod: mode, plan: plan.map((w) => w.giris), arama: 0, fiyat: 0, yok: 0, hata: 0, butceAtlanan: 0, tahminiMaliyetUsd: 0, hatalar: [] };
  let ok = 0, fatal = null;
  const est = COST_PER_RUN + (cfg.sonuc_sayisi || 6) * COST_PER_ROW;
  await pool(jobs, concurrency, async ({ w, c }) => {
    if (fatal) return;
    if (!B.reserve(est)) { report.butceAtlanan++; return; }
    report.arama++;
    let rec, cost = COST_PER_RUN;
    try {
      const rows = await runActor(flightInput(cfg, c, w), { token, fetchImpl, sleep, actor: FLIGHT_ACTOR });
      cost += rows.length * COST_PER_ROW;
      rec = toFlightRecord(rows, cfg, c); ok++;
    } catch (e) {
      const msg = String(e.message).split(token).join("***");
      if (e.fatal) { fatal = msg; B.release(est); return; }
      rec = { durum: "hata", not: msg }; report.hatalar.push(`${c.sehir} ${w.giris}: ${msg}`);
    }
    B.release(est);
    B.spend(cost); report.tahminiMaliyetUsd += cost; // küçük tutarlar: yuvarlama en sonda
    report[rec.durum] = (report[rec.durum] || 0) + 1;
    mergeFlight(state, w, c.sehir, rec, t);
  });
  if (report.arama > 0 && ok === 0) throw new Error("Hiçbir uçuş araması başarılı olmadı: " + (fatal || report.hatalar[0] || "bilinmeyen hata"));
  meta.harcama.usd = r2(meta.harcama.usd); report.tahminiMaliyetUsd = r2(report.tahminiMaliyetUsd);
  report.silinen = dropPast(state, today);
  if (ok > 0) state.guncellendi = t;
  return { state, meta, report, plan, fatal };
}

export function toMarkdown({ report, state, cfg }) {
  const p = ["# Uçak fiyat robotu", "", `Tarih: ${report.tarih}, mod: ${report.mod}. Hafta sonları: ${report.plan.join(", ") || "yok (bugün kontrol günü değil)"}.`];
  if (!report.plan.length) return p.join("\n");
  p.push(`Arama: ${report.arama}, fiyat: ${report.fiyat}, uçuş yok: ${report.yok}, hata: ${report.hata}, bütçe yüzünden atlanan: ${report.butceAtlanan}. Tahmini maliyet: ~${report.tahminiMaliyetUsd} $. Apify'ın kendi sayacı (çalışma öncesi): ${report.gercekKullanim ?? "okunamadı"} $, sınır ${report.sinir} $.`, "");
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
  const P = { cfg: root + "data/ucus-ayarlari.json", state: root + "data/ucuslar.json", meta: root + "data/otel-fiyatlari.json", hotels: root + "data/hotels.json" };
  (async () => {
    const cfg = await readJson(P.cfg), hotels = await readJson(P.hotels, { ayarlar: {} });
    const only = (process.env.SEHIR || "").split(",").map((s) => s.trim()).filter(Boolean);
    const out = await run({ token: process.env.APIFY_TOKEN, cfg, state: await readJson(P.state, emptyFlights()), meta: await readJson(P.meta, emptyState()), hotelSettings: hotels.ayarlar, mode: (process.env.MOD || "takvim").trim(), only: only.length ? only : null });
    const md = toMarkdown({ ...out, cfg }); console.log(md);
    if (process.env.GITHUB_STEP_SUMMARY) await writeFile(process.env.GITHUB_STEP_SUMMARY, md + "\n", { flag: "a" });
    if (out.plan.length) {
      await writeFile(P.state, JSON.stringify(out.state) + "\n");
      await writeFile(P.meta, JSON.stringify(out.meta, null, 1) + "\n");
    }
    if (out.fatal) { console.error("HATA:", out.fatal); process.exit(1); }
  })().catch((e) => { console.error("HATA:", String(e.message).split(process.env.APIFY_TOKEN || "§").join("***")); process.exit(1); });
}
