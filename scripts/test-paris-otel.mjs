import assert from "node:assert/strict";
import { weekendDates, median, normalizeRatings, pickTiers, topShareCut, run, toMarkdown, valueScore, RULES } from "./paris-otel-havuzu.mjs";

// 1) hafta sonu tarihleri: cuma giriş, pazar çıkış, haftada bir
{ const w = weekendDates(new Date("2026-10-07T10:00:00Z"), 4);
  assert.equal(w.length, 4); assert.equal(w[0].checkIn, "2026-10-16"); assert.equal(w[0].checkOut, "2026-10-18");
  for (const x of w) { assert.equal(new Date(x.checkIn).getUTCDay(), 5); assert.equal(new Date(x.checkOut).getUTCDay(), 0); }
  assert.equal(w[1].checkIn, "2026-10-23"); console.log("ok 1: hafta sonu tarihleri"); }
// 2) medyan
assert.equal(median([3, 1, 2]), 2); assert.equal(median([1, 2, 3, 4]), 2.5); assert.equal(median([]), null); assert.equal(median([NaN, 5]), 5); console.log("ok 2: medyan");
// 3) puan ölçeği 0-100 ise 10'a bölünür
{ const a = normalizeRatings([{ rating: 86 }, { rating: 91 }]); assert.equal(a.hotels[1].rating10, 9.1); const b = normalizeRatings([{ rating: 8.6 }]); assert.equal(b.hotels[0].rating10, 8.6); console.log("ok 3: puan ölçeği otomatik algılandı"); }
// 4) kademe seçimi
const H = (name, rating10, km, nightEur) => ({ name, rating10, km, nightEur });
const pool = [H("Ucuz A", 8.4, 1.3, 141), H("Ucuz B", 8.1, 1.0, 120), H("Çok ucuz ama uzak", 8.3, 5, 60), H("Düşük puanlı ucuz", 7.2, 1, 70),
  H("Değer X", 9.2, 1.2, 201), H("Değer Y", 8.2, 1, 203), H("Lüks Z", 9.5, 1.6, 480), H("Lüks W", 9.0, 1.1, 458), H("Lüks uzak", 9.6, 4, 500), H("Fiyatsız", 9.0, 1, null)];
{ const p = pickTiers(pool, RULES, 9.4);
  assert.equal(p.tier1[0].name, "Ucuz B", "en ucuz uygun otel"); assert.ok(!p.tier1.some((h) => h.name === "Çok ucuz ama uzak" || h.name === "Düşük puanlı ucuz"));
  assert.equal(p.tier2[0].name, "Değer X"); assert.ok(Math.abs(p.tier2[0].score - valueScore(9.2, 201)) < 1e-9);
  assert.deepEqual(p.tier3.map((h) => h.name), ["Lüks Z"], "yalnızca ilk %10 eşiğini geçen ve ≤ 2 km olan"); console.log("ok 4: kademe kuralları"); }
// 5) "puan ÷ fiyat" hatası geri gelmesin: ucuz+düşük puan, pahalı+yüksek puanı geçmemeli
assert.ok(valueScore(9.2, 201) > valueScore(8.2, 203)); assert.ok(valueScore(8.3, 150) < valueScore(9.3, 160)); console.log("ok 5: değer skoru adil");
assert.equal(topShareCut([{ rating10: 9.6 }, { rating10: 9.5 }, { rating10: 9.0 }, { rating10: 8.0 }, { rating10: 7.0 }, { rating10: 6.0 }, { rating10: 8.5 }, { rating10: 8.4 }, { rating10: 8.2 }, { rating10: 8.1 }], 0.1), 9.6);

// ---- sahte API ile uçtan uca
const hotelsList = [
  { id: 1, name: { en: "Hotel Trianon" }, stars: 4, rating: 84, popularity: 900, distance: 1.3, location: { lat: 48.848, lon: 2.339 } },
  { id: 2, name: { en: "Select Hotel" }, stars: 4, rating: 92, popularity: 800, distance: 1.2, location: { lat: 48.848, lon: 2.343 } },
  { id: 3, name: { en: "Hotel Mansart" }, stars: 4, rating: 95, popularity: 700, distance: 1.6, location: { lat: 48.868, lon: 2.329 } },
  { id: 4, name: { en: "Uzak otel" }, stars: 3, rating: 90, popularity: 600, distance: 7.5, location: { lat: 48.9, lon: 2.4 } },
  { id: 5, name: { en: "Düşük puan" }, stars: 2, rating: 60, popularity: 500, distance: 1, location: { lat: 48.85, lon: 2.35 } },
];
const nightly = { 1: 141, 2: 201, 3: 480 };
const mockFetch = (over = {}) => async (url) => {
  const u = new URL(url); const ok = (b) => ({ ok: true, status: 200, text: async () => JSON.stringify(b) });
  if (over[u.pathname]) return over[u.pathname](u);
  if (u.pathname.endsWith("lookup.json")) return ok({ results: { locations: [{ id: "7", fullName: "Paris, France" }], hotels: [] }, status: "ok" });
  if (u.pathname.endsWith("hotels.json")) return ok({ hotels: hotelsList });
  if (u.pathname.endsWith("cache.json")) { const id = +u.searchParams.get("hotelId"); return ok(nightly[id] ? [{ hotelId: id, priceAvg: nightly[id] * 2 + (id === 2 ? (u.searchParams.get("checkIn") === "2026-10-16" ? 40 : 0) : 0), priceFrom: nightly[id] * 2 - 20 }] : []); }
  return { ok: false, status: 404, text: async () => "yok" };
};
const base = { token: "T", now: new Date("2026-10-07T10:00:00Z"), sleep: async () => {} };
{ const r = await run({ ...base, fetchImpl: mockFetch() });
  assert.equal(r.ratingScale, "0-100, 10'a bölündü"); assert.equal(r.poolSize, 5); assert.equal(r.pricedCandidates, 3, "uzak ve düşük puanlı elendi, fiyat çağrısı harcanmadı");
  assert.equal(r.picks.tier1[0].name, "Hotel Trianon"); assert.equal(r.picks.tier2[0].name, "Select Hotel"); assert.equal(r.picks.tier3[0].name, "Hotel Mansart");
  assert.equal(r.priced.find((h) => h.id === 2).nightEur, 201, "medyan: 4 hafta sonundan biri 20 € yüksek olsa da medyan değişmez");
  const md = toMarkdown(r); assert.match(md, /Hotel Mansart/); assert.match(md, /önbelleğinden/); console.log("ok 6: uçtan uca (sahte API)"); }
// 7) hiç fiyat yoksa tahmin yürütmez
{ const r = await run({ ...base, fetchImpl: mockFetch({ "/api/v2/cache.json": () => ({ ok: true, status: 200, text: async () => "[]" }) }) });
  assert.equal(r.picks.tier1.length + r.picks.tier2.length + r.picks.tier3.length, 0); assert.match(toMarkdown(r), /bulunamadı/); console.log("ok 7: fiyat yoksa boş döner, uydurmaz"); }
// 8) hata mesajları açıklayıcı
await assert.rejects(() => run({ ...base, fetchImpl: mockFetch({ "/api/v2/lookup.json": () => ({ ok: false, status: 403, text: async () => "denied" }) }) }), /HTTP 403/);
await assert.rejects(() => run({ ...base, fetchImpl: mockFetch({ "/api/v2/static/hotels.json": () => ({ ok: true, status: 200, text: async () => "<html>" }) }) }), /JSON okunamadı/);
await assert.rejects(() => run({ ...base, token: "" }), /TRAVELPAYOUTS_TOKEN/);
await assert.rejects(() => run({ ...base, fetchImpl: mockFetch({ "/api/v2/lookup.json": () => ({ ok: true, status: 200, text: async () => JSON.stringify({ results: { locations: [] } }) }) }) }), /bulunamadı/);
console.log("ok 8: hata mesajları (erişim yok, bozuk veri, jeton yok, şehir yok)");
console.log("TÜM TESTLER GEÇTİ");
