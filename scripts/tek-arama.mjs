// Tek seferlik: Amsterdam merkez otel + Airbnb (2 kişi, 5 gece). Sonuç yalnız çalışma kaydında. Kullanımdan sonra silinir.
import { runActor } from "./otel-fiyatlari.mjs";
import { hotelTotal } from "./deplasman-fiyat.mjs";
const token = process.env.APIFY_TOKEN, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = [["2026-12-02", "2026-12-07"], ["2026-12-21", "2026-12-26"], ["2026-12-26", "2026-12-31"]];
const H = ["Motel One Amsterdam-Waterlooplein", "ibis Amsterdam Centre", "Park Plaza Victoria Amsterdam", "NH Amsterdam Centre", "Inntel Hotels Amsterdam Centre", "Hotel V Nesplein Amsterdam"];
for (const [g, c] of T) {
  const rows = await runActor({ hotels: H, checkInDate: g, checkOutDate: c, adults: 2, currency: "EUR", country: "tr", language: "en", maxConcurrency: 8 }, { token, sleep, maxPolls: 60 }).catch((e) => { console.log("otel hata", e.message); return []; });
  for (const n of H) { const r = rows.find((x) => x && x.input === n); console.log("OTEL " + JSON.stringify({ g, n, t: hotelTotal(r), puan: r && (r.rating || r.overallRating) })); }
  for (let k = 1; k <= 3; k++) {
    const a = await runActor({ location: "Amsterdam Centrum, Amsterdam, Netherlands", checkin: g, checkout: c, adults: 2, currency: "EUR", room_type: "any", limit: 20, proxy_country: "nl" },
      { token, actor: "s-r~airbnb-scraper", sleep, maxPolls: 80 }).catch((e) => { console.log("airbnb hata", e.message); return []; });
    for (const x of a) console.log("AIRBNB " + JSON.stringify({ g, ad: x.title || x.name, alt: x.subtitle, t: x.price_total, puan: x.rating, yorum: x.reviews_count, lat: x.lat || x.latitude, lng: x.lng || x.longitude, url: x.url }));
    if (a.length) break; await sleep(30000);
  }
}
