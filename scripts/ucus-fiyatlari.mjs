// UÇUŞ ROBOTU
// İstanbul'dan uygulamadaki her başkente, önümüzdeki hafta sonları (cuma gidiş, pazartesi dönüş = 3 gece) için
// en ucuz gidiş-dönüş fiyatını Travelpayouts Aviasales Data API'sinden çeker ve flights.json'a yazar.
// Kaynak: https://support.travelpayouts.com/hc/en-us/articles/203956163-Aviasales-Data-API
// Fiyatlar canlı değil: kullanıcı aramalarından gelen önbellek (belgeye göre 2-7 günlük).
// Yapay zekâ kullanmaz, ücretsizdir. Veri yoksa tahmin yürütmez, "veri yok" yazar.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { loadCities, IATA_NOTE } from "./lib/sehirler.mjs";

export const API_URL = "https://api.travelpayouts.com/aviasales/v3/prices_for_dates";
export const LINK_BASE = "https://www.aviasales.com/search/";
export const ORIGIN = "IST"; // İstanbul (IST ve SAW birlikte)
export const WEEKENDS = 4;
export const NIGHTS = 3;

export const median = (a) => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const iso = (d) => d.toISOString().slice(0, 10);

// Önümüzdeki N hafta sonu: cuma gidiş, pazartesi dönüş (3 gece, uygulamanın varsayılanı). En az 3 gün sonrası.
export function weekendTrips(from = new Date(), count = WEEKENDS) {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + 3);
  while (d.getUTCDay() !== 5) d.setUTCDate(d.getUTCDate() + 1);
  return Array.from({ length: count }, (_, i) => {
    const dep = new Date(d.getTime() + i * 7 * 86400000), ret = new Date(dep.getTime() + NIGHTS * 86400000);
    return { departure: iso(dep), return: iso(ret) };
  });
}

// Jeton adrese yazılmaz (günlüklere sızmasın), başlıkla gider
export function buildUrl(origin, destination, trip) {
  const p = new URLSearchParams({ origin, destination, departure_at: trip.departure, return_at: trip.return, one_way: "false", currency: "eur", limit: "10", sorting: "price" });
  return API_URL + "?" + p.toString();
}

const redact = (s, token) => (token ? String(s).split(token).join("***") : String(s));

export function normalizeLink(link) {
  if (!link) return null;
  return LINK_BASE + String(link).replace(/^\/?(search\/)?/, "");
}

export async function getOffers(origin, destination, trip, token, fetchImpl) {
  const res = await fetchImpl(buildUrl(origin, destination, trip), { headers: { accept: "application/json", "X-Access-Token": token } });
  const text = await res.text();
  if (res.status === 429) throw new Error("HTTP 429: istek sınırı aşıldı");
  if (res.status === 401 || res.status === 403) throw new Error("HTTP " + res.status + ": jeton geçersiz ya da yenilenmiş, GitHub'daki TRAVELPAYOUTS_TOKEN'ı güncelle");
  if (!res.ok) throw new Error(redact(`HTTP ${res.status}: ${text.slice(0, 200)}`, token));
  let j; try { j = JSON.parse(text); } catch { throw new Error(redact(`JSON okunamadı: ${text.slice(0, 200)}`, token)); }
  if (j && j.success === false) throw new Error(redact("API hatası: " + (j.error || JSON.stringify(j).slice(0, 200)), token));
  const data = Array.isArray(j && j.data) ? j.data : [];
  return data.filter((o) => typeof o.price === "number" && Number.isFinite(o.price) && o.price > 0).sort((a, b) => a.price - b.price).map((o) => ({
    price: Math.round(o.price), airline: o.airline || null, transfers: o.transfers ?? null, returnTransfers: o.return_transfers ?? null, link: normalizeLink(o.link),
  }));
}

export async function run({ token, cities, fetchImpl = fetch, now = new Date(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  if (!token) throw new Error("TRAVELPAYOUTS_TOKEN tanımlı değil (GitHub Settings > Secrets bölümüne eklenmeli)");
  const trips = weekendTrips(now);
  const out = {}; let ok = 0, total = 0, firstError = null;
  for (const c of cities) {
    if (!c.iata) continue;
    const rows = [];
    for (const t of trips) {
      total++;
      try {
        const offers = await getOffers(ORIGIN, c.iata, t, token, fetchImpl); ok++;
        const direct = offers.find((o) => o.transfers === 0 && (o.returnTransfers ?? 0) === 0) || null;
        const best = offers[0] || null;
        rows.push({ dep: t.departure, ret: t.return, eur: best ? best.price : null, airline: best ? best.airline : null, stops: best ? best.transfers : null, directEur: direct ? direct.price : null, link: best ? best.link : null });
      } catch (e) {
        firstError = firstError || e.message;
        if (/jeton/.test(e.message)) throw e; // jeton hatasında devam etmenin anlamı yok
        rows.push({ dep: t.departure, ret: t.return, eur: null, error: e.message.slice(0, 120) });
      }
      await sleep(150);
    }
    const prices = rows.map((x) => x.eur).filter(Number.isFinite);
    const cheapest = prices.length ? rows.find((x) => x.eur === Math.min(...prices)) : null;
    out[c.name] = { iata: c.iata, note: IATA_NOTE[c.name] || null, minEur: cheapest ? cheapest.eur : null, medianEur: prices.length ? Math.round(median(prices)) : null, best: cheapest, rows };
  }
  if (ok === 0) throw new Error("Hiçbir istek başarılı olmadı: " + firstError);
  return { generated: now.toISOString(), origin: ORIGIN, currency: "EUR", perPerson: true, roundTrip: true, source: "Travelpayouts Aviasales Data API (önbellek, canlı değil)", cities: out, stats: { requests: total, ok } };
}

export function toMarkdown(r) {
  const lines = [`# Uçuş robotu raporu`, "", `İstanbul çıkışlı, kişi başı gidiş-dönüş, cuma-pazartesi (3 gece). Kaynak: ${r.source}. ${r.stats.ok}/${r.stats.requests} istek başarılı.`, "", "| Şehir | En ucuz | Ortanca | Tarih | Havayolu | Aktarma |", "| --- | --- | --- | --- | --- | --- |"];
  const entries = Object.entries(r.cities).sort((a, b) => (a[1].minEur ?? 1e9) - (b[1].minEur ?? 1e9));
  for (const [name, c] of entries) {
    if (c.minEur == null) { lines.push(`| ${name} | veri yok | | | | |`); continue; }
    lines.push(`| ${name} | ${c.minEur} € | ${c.medianEur} € | ${c.best.dep} → ${c.best.ret} | ${c.best.airline || ""} | ${c.best.stops ?? "?"} |`);
  }
  lines.push("", "Not: önbellek verisidir, müsaitlik garantisi yok. Uygulamada \"yaklaşık\" olarak gösterilir.");
  return lines.join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  (async () => {
    const cities = await loadCities();
    const r = await run({ token: process.env.TRAVELPAYOUTS_TOKEN, cities });
    // Bir şehirde bu sefer veri gelmediyse eski veriyi silme, tarihiyle koru
    try {
      const old = JSON.parse(await readFile("flights.json", "utf8"));
      for (const [k, v] of Object.entries(r.cities)) if (v.minEur == null && old.cities && old.cities[k] && old.cities[k].minEur != null) r.cities[k] = { ...old.cities[k], stale: old.cities[k].stale || old.generated };
    } catch {}
    await writeFile("flights.json", JSON.stringify(r, null, 1) + "\n");
    const md = toMarkdown(r); console.log(md);
    if (process.env.GITHUB_STEP_SUMMARY) await writeFile(process.env.GITHUB_STEP_SUMMARY, md + "\n", { flag: "a" });
  })().catch((e) => { console.error("HATA:", e.message); process.exit(1); });
}
