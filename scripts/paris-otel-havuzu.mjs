// Yol B testi: Hotellook veri API'sinden (Travelpayouts jetonuyla) Paris otel havuzunu çeker,
// hafta sonu fiyatlarının ortancasını (medyan) hesaplar ve Grup C kurallarını uygular.
// Yapay zekâ kullanmaz, ücretsizdir. Hatalı ya da boş veride tahmin yürütmez, nedenini yazar.
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// UYARI: Bu adresler resmî belgede görünmüyor (örnek istekler kesilmişti), hafızamdan yazıldı.
// İlk çalıştırmada 404 verirse aşağıdaki üç satırı belgedeki gerçek adresle düzeltiriz.
export const API = {
  lookup: "https://engine.hotellook.com/api/v2/lookup.json",
  hotels: "https://engine.hotellook.com/api/v2/static/hotels.json",
  prices: "https://engine.hotellook.com/api/v2/cache.json",
};

// Şehir grubu C (Paris) bantları, onaylandı
export const RULES = { minRating: 8.0, maxKm: 3, luxuryMaxKm: 2, cheapMax: 150, valueMin: 150, valueMax: 280, luxuryMin: 350, topShare: 0.10 };

export const median = (a) => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const iso = (d) => d.toISOString().slice(0, 10);

// Önümüzdeki N hafta sonu: cuma giriş, pazar çıkış (2 gece)
export function weekendDates(from = new Date(), count = 4) {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + 3); // en az 3 gün sonrası (önbellekte veri olması için)
  while (d.getUTCDay() !== 5) d.setUTCDate(d.getUTCDate() + 1);
  return Array.from({ length: count }, (_, i) => {
    const ci = new Date(d.getTime() + i * 7 * 86400000), co = new Date(ci.getTime() + 2 * 86400000);
    return { checkIn: iso(ci), checkOut: iso(co), nights: 2 };
  });
}

// Puan ölçeği bilinmiyor (0-10 mu 0-100 mü). En büyük değere bakıp 10'luk ölçeğe getir.
export function normalizeRatings(hotels) {
  const max = Math.max(0, ...hotels.map((h) => h.rating || 0));
  const div = max > 10 ? 10 : 1;
  return { hotels: hotels.map((h) => ({ ...h, rating10: h.rating ? h.rating / div : null })), scale: max > 10 ? "0-100, 10'a bölündü" : "0-10", max };
}

export const valueScore = (rating10, eurPerNight) => ((rating10 - 7) / eurPerNight) * 100;

// Kural: kademe 1 en ucuz, kademe 2 en yüksek değer skoru, kademe 3 puanı ilk %10 içinde en yüksek (≤ 2 km)
export function topShareCut(hotels, share) {
  const r = hotels.filter((h) => h.rating10 != null).map((h) => h.rating10).sort((a, b) => b - a);
  return r.length ? r[Math.max(0, Math.ceil(r.length * share) - 1)] : Infinity;
}
export function pickTiers(hotels, rules = RULES, topCutOverride) {
  const topCut = topCutOverride ?? topShareCut(hotels, rules.topShare);
  const ok = hotels.filter((h) => h.rating10 >= rules.minRating && h.km != null && h.nightEur != null);
  const near = ok.filter((h) => h.km <= rules.maxKm);
  const t1 = near.filter((h) => h.nightEur <= rules.cheapMax).sort((a, b) => a.nightEur - b.nightEur);
  const t2 = near.filter((h) => h.nightEur > rules.valueMin && h.nightEur <= rules.valueMax)
    .map((h) => ({ ...h, score: valueScore(h.rating10, h.nightEur) })).sort((a, b) => b.score - a.score);
  const t3 = ok.filter((h) => h.km <= rules.luxuryMaxKm && h.nightEur >= rules.luxuryMin && h.rating10 >= topCut)
    .sort((a, b) => b.rating10 - a.rating10 || b.nightEur - a.nightEur);
  return { topCut, tier1: t1.slice(0, 3), tier2: t2.slice(0, 3), tier3: t3.slice(0, 3), counts: { degerlendirilen: hotels.length, kuralaUyan: ok.length, merkezeYakin: near.length } };
}

// ---- ağ katmanı (test edilirken sahte fetch verilir)
async function getJson(fetchImpl, base, params) {
  const url = base + "?" + new URLSearchParams(params).toString();
  const res = await fetchImpl(url, { headers: { accept: "application/json" } });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} (${base}): ${text.slice(0, 200)}`);
  try { return JSON.parse(text); } catch { throw new Error(`JSON okunamadı (${base}): ${text.slice(0, 200)}`); }
}

export async function resolveLocation(city, token, fetchImpl) {
  const j = await getJson(fetchImpl, API.lookup, { query: city, lang: "en", lookFor: "city", limit: 1, token });
  const loc = j && j.results && j.results.locations && j.results.locations[0];
  if (!loc) throw new Error(`"${city}" şehri bulunamadı: ` + JSON.stringify(j).slice(0, 200));
  return { id: Number(loc.id), name: loc.fullName || loc.cityName };
}

export async function fetchHotelList(locationId, token, fetchImpl) {
  const j = await getJson(fetchImpl, API.hotels, { locationId, token });
  const list = Array.isArray(j) ? j : j && j.hotels;
  if (!Array.isArray(list) || !list.length) throw new Error("Otel listesi boş ya da beklenmeyen biçimde: " + JSON.stringify(j).slice(0, 200));
  return list.map((h) => ({ id: h.id, name: (h.name && (h.name.en || Object.values(h.name)[0])) || String(h.id), stars: h.stars, rating: h.rating, popularity: h.popularity,
    km: typeof h.distance === "number" ? h.distance : null, lat: h.location && h.location.lat, lon: h.location && h.location.lon, link: h.link }));
}

export async function fetchWeekendNightPrice(hotelId, we, token, fetchImpl) {
  const j = await getJson(fetchImpl, API.prices, { hotelId, checkIn: we.checkIn, checkOut: we.checkOut, adults: 2, currency: "eur", token });
  const row = Array.isArray(j) ? j[0] : j;
  if (!row || typeof row.priceAvg !== "number") return null; // önbellekte yok
  return { avg: row.priceAvg / we.nights, from: typeof row.priceFrom === "number" ? row.priceFrom / we.nights : null };
}

export async function run({ token, city = "Paris", fetchImpl = fetch, now = new Date(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)), maxHotels = 40, weekends = 4 } = {}) {
  if (!token) throw new Error("TRAVELPAYOUTS_TOKEN tanımlı değil (GitHub Settings > Secrets bölümüne eklenmeli)");
  const loc = await resolveLocation(city, token, fetchImpl);
  const raw = await fetchHotelList(loc.id, token, fetchImpl);
  const { hotels: all, scale, max } = normalizeRatings(raw);
  // fiyat çağrılarını sınırlamak için: puanı yeterli ve merkeze yakın olanlar, popülerliğe göre
  const cand = all.filter((h) => h.rating10 >= RULES.minRating && h.km != null && h.km <= RULES.maxKm + 0.5).sort((a, b) => (b.popularity || 0) - (a.popularity || 0)).slice(0, maxHotels);
  const wes = weekendDates(now, weekends), priced = [];
  for (const h of cand) {
    const per = [];
    for (const we of wes) { const p = await fetchWeekendNightPrice(h.id, we, token, fetchImpl); if (p) per.push(p.avg); await sleep(1100); }
    priced.push({ ...h, nightEur: per.length ? Math.round(median(per)) : null, weekendsWithPrice: per.length });
  }
  const poolCut = topShareCut(all, RULES.topShare); // "ilk %10" eşiği tüm havuzdan, yalnızca adaylardan değil
  const final = pickTiers(priced, RULES, poolCut);
  return { city: loc.name, locationId: loc.id, generated: now.toISOString(), ratingScale: scale, ratingMax: max, poolSize: all.length, pricedCandidates: priced.length, weekends: wes, picks: final, priced };
}

export function toMarkdown(r) {
  const row = (h) => `| ${h.name} | ${h.stars ?? "?"} | ${h.rating10?.toFixed(1)} | ${h.km} | ${h.nightEur} | ${h.score ? h.score.toFixed(2) : ""} | ${h.weekendsWithPrice}/${r.weekends.length} |`;
  const tbl = (t) => (t.length ? ["| Otel | Yıldız | Puan | Merkeze km | Gecelik € (medyan) | Skor | Fiyatı olan hafta sonu |", "| --- | --- | --- | --- | --- | --- | --- |", ...t.map(row)].join("\n") : "_Kurala uyan otel bulunamadı._");
  return [`# ${r.city}: Hotellook otel havuzu testi`, "",
    `Havuz: ${r.poolSize} otel. Fiyat bakılan aday: ${r.pricedCandidates}. Puan ölçeği: ${r.ratingScale} (en büyük ham değer ${r.ratingMax}). İlk %10 puan eşiği: ${r.picks.topCut?.toFixed(1)}.`,
    `Hafta sonları: ${r.weekends.map((w) => w.checkIn + " → " + w.checkOut).join(", ")}.`, "",
    "## Kademe 1: uygun", tbl(r.picks.tier1), "", "## Kademe 2: fiyat-performans", tbl(r.picks.tier2), "", "## Kademe 3: en güzellerinden", tbl(r.picks.tier3), "",
    "Not: fiyatlar Hotellook önbelleğinden (kullanıcı aramalarından), müsaitlik bilgisi yok. Gerçek fiyat olarak sunma, kaynak ve tarihiyle birlikte teyit et."].join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run({ token: process.env.TRAVELPAYOUTS_TOKEN }).then(async (r) => {
    await writeFile("paris-otel-havuzu.json", JSON.stringify(r, null, 2));
    const md = toMarkdown(r); await writeFile("paris-otel-ozet.md", md); console.log(md);
    if (process.env.GITHUB_STEP_SUMMARY) await writeFile(process.env.GITHUB_STEP_SUMMARY, md, { flag: "a" });
  }).catch((e) => { console.error("HATA:", e.message); process.exit(1); });
}
