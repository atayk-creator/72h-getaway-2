// Uçuş fiyatları: Travelpayouts Aviasales Data API (prices_for_dates).
// Kaynak: https://support.travelpayouts.com/hc/en-us/articles/203956163-Aviasales-Data-API
// Fiyatlar canlı değil, kullanıcı aramalarından gelen önbellek (belgeye göre 2-7 gün).
// Yapay zekâ kullanmaz, ücretsizdir. Veri yoksa tahmin yürütmez, "veri yok" yazar.
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export const API_URL = "https://api.travelpayouts.com/aviasales/v3/prices_for_dates";
export const LINK_BASE = "https://www.aviasales.com/search/";

// Uygulamadaki iki şehir. Budapeşte: gerçek çekim tarihleri. Paris: önümüzdeki cuma-pazar hafta sonları.
export const ROUTES = [
  { key: "budapeste", label: "İstanbul → Budapeşte", origin: "IST", destination: "BUD", trips: [{ departure: "2026-12-08", return: "2026-12-11" }] },
  { key: "paris", label: "İstanbul → Paris", origin: "IST", destination: "PAR", weekends: 4 },
];

export const median = (a) => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const iso = (d) => d.toISOString().slice(0, 10);

// Önümüzdeki N hafta sonu: cuma gidiş, pazar dönüş
export function weekendTrips(from = new Date(), count = 4) {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + 3);
  while (d.getUTCDay() !== 5) d.setUTCDate(d.getUTCDate() + 1);
  return Array.from({ length: count }, (_, i) => {
    const dep = new Date(d.getTime() + i * 7 * 86400000), ret = new Date(dep.getTime() + 2 * 86400000);
    return { departure: iso(dep), return: iso(ret) };
  });
}

// Jeton adrese yazılmaz (günlüklere sızmasın), başlıkla gider
export function buildUrl(route, trip) {
  const p = new URLSearchParams({ origin: route.origin, destination: route.destination, departure_at: trip.departure, return_at: trip.return, one_way: "false", currency: "eur", limit: "10", sorting: "price" });
  return API_URL + "?" + p.toString();
}

const redact = (s, token) => (token ? String(s).split(token).join("***") : String(s));

export function normalizeLink(link) {
  if (!link) return null;
  return LINK_BASE + String(link).replace(/^\/?(search\/)?/, "");
}

export async function getOffers(route, trip, token, fetchImpl) {
  const url = buildUrl(route, trip);
  const res = await fetchImpl(url, { headers: { accept: "application/json", "X-Access-Token": token } });
  const text = await res.text();
  if (res.status === 429) throw new Error("HTTP 429: istek sınırı aşıldı (dakikada 600), bir dakika bekleyip yeniden dene");
  if (!res.ok) throw new Error(redact(`HTTP ${res.status}: ${text.slice(0, 200)}`, token));
  let j; try { j = JSON.parse(text); } catch { throw new Error(redact(`JSON okunamadı: ${text.slice(0, 200)}`, token)); }
  if (j && j.success === false) throw new Error(redact("API hatası: " + (j.error || JSON.stringify(j).slice(0, 200)), token));
  const data = Array.isArray(j && j.data) ? j.data : [];
  return data.filter((o) => typeof o.price === "number" && Number.isFinite(o.price)).sort((a, b) => a.price - b.price).map((o) => ({
    price: o.price, airline: o.airline || null, flightNumber: o.flight_number || null, departureAt: o.departure_at || null, returnAt: o.return_at || null,
    transfers: o.transfers ?? null, returnTransfers: o.return_transfers ?? null, durationMin: o.duration ?? null, link: normalizeLink(o.link),
  }));
}

export async function run({ token, routes = ROUTES, fetchImpl = fetch, now = new Date(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  if (!token) throw new Error("TRAVELPAYOUTS_TOKEN tanımlı değil (GitHub Settings > Secrets bölümüne eklenmeli)");
  const out = []; let ok = 0, total = 0, firstError = null;
  for (const r of routes) {
    const trips = r.trips || weekendTrips(now, r.weekends || 4), rows = [];
    for (const t of trips) {
      total++;
      try {
        const offers = await getOffers(r, t, token, fetchImpl); ok++;
        const direct = offers.find((o) => o.transfers === 0 && (o.returnTransfers ?? 0) === 0) || null;
        rows.push({ ...t, cheapest: offers[0] || null, cheapestDirect: direct, offerCount: offers.length, error: null });
      } catch (e) { firstError = firstError || e.message; rows.push({ ...t, cheapest: null, cheapestDirect: null, offerCount: 0, error: e.message }); }
      await sleep(250);
    }
    const prices = rows.map((x) => x.cheapest && x.cheapest.price).filter(Number.isFinite);
    out.push({ key: r.key, label: r.label, origin: r.origin, destination: r.destination, rows, summary: { tripsTotal: rows.length, tripsWithPrice: prices.length, cheapestEur: prices.length ? Math.min(...prices) : null, medianEur: prices.length ? Math.round(median(prices)) : null } });
  }
  if (ok === 0) throw new Error("Hiçbir istek başarılı olmadı: " + firstError);
  return { generated: now.toISOString(), currency: "EUR", source: "Travelpayouts Aviasales Data API (önbellek)", routes: out };
}

export function toMarkdown(r) {
  const eur = (n) => (n == null ? "" : `${Math.round(n)} €`);
  const parts = [`# Uçuş fiyatları testi`, "", `Kaynak: ${r.source}. Para birimi: euro. Üretim zamanı: ${r.generated}.`, ""];
  for (const x of r.routes) {
    parts.push(`## ${x.label}`, "");
    parts.push("| Gidiş | Dönüş | En ucuz | Havayolu | Aktarma | Aktarmasız en ucuz | Bulunan teklif | Bağlantı |", "| --- | --- | --- | --- | --- | --- | --- | --- |");
    for (const w of x.rows) {
      if (w.error) { parts.push(`| ${w.departure} | ${w.return} | HATA: ${w.error} | | | | | |`); continue; }
      if (!w.cheapest) { parts.push(`| ${w.departure} | ${w.return} | önbellekte fiyat yok | | | | 0 | |`); continue; }
      const c = w.cheapest;
      parts.push(`| ${w.departure} | ${w.return} | ${eur(c.price)} | ${c.airline ?? ""} | ${c.transfers ?? "?"} | ${w.cheapestDirect ? eur(w.cheapestDirect.price) : "yok"} | ${w.offerCount} | ${c.link ? `[Aviasales](${c.link})` : ""} |`);
    }
    const s = x.summary;
    parts.push("", s.tripsWithPrice ? `Özet: ${s.tripsWithPrice}/${s.tripsTotal} tarihte fiyat bulundu. En düşük ${eur(s.cheapestEur)}, ortanca ${eur(s.medianEur)}.` : `Özet: ${s.tripsTotal} tarihin hiçbirinde önbellekte fiyat yok.`, "");
  }
  parts.push("Notlar:", "- Fiyatlar canlı değil, kullanıcı aramalarından gelen önbellek. Müsaitlik garantisi yok.", "- Belge kişi sayısını belirtmiyor. Fiyatın 1 yetişkin için gidiş-dönüş olduğunu varsayıyoruz, bir bağlantıyı Aviasales'te açıp doğrula.", "- Video ya da uygulamada fiyat olarak sunmadan önce kaynağı ve tarihi yanına yaz.");
  return parts.join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run({ token: process.env.TRAVELPAYOUTS_TOKEN }).then(async (r) => {
    await writeFile("ucus-fiyatlari.json", JSON.stringify(r, null, 2));
    const md = toMarkdown(r); await writeFile("ucus-ozet.md", md); console.log(md);
    if (process.env.GITHUB_STEP_SUMMARY) await writeFile(process.env.GITHUB_STEP_SUMMARY, md, { flag: "a" });
  }).catch((e) => { console.error("HATA:", e.message); process.exit(1); });
}
