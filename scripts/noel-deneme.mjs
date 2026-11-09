// Tek seferlik: Münih otel fiyatı, başka hafta sonları. Sonuç data/noel-deneme.json. Kullanımdan sonra silinir.
import { writeFile } from "node:fs/promises";
import { runActor } from "./otel-fiyatlari.mjs";
import { hotelTotal } from "./deplasman-fiyat.mjs";
const token = process.env.APIFY_TOKEN, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const names = ["Hotel Torbräu Munich", "Mercure Hotel München Altstadt", "Hotel Blauer Bock Munich", "Motel One München-Sendlinger Tor", "Motel One München-Deutsches Museum", "ibis München City", "Platzl Hotel Munich", "Louis Hotel Munich Viktualienmarkt"];
const out = { otel: {}, ucus: {} };
for (const [g, c] of [["2026-11-27", "2026-11-29"], ["2026-12-11", "2026-12-13"], ["2026-12-18", "2026-12-20"]]) {
  const rows = await runActor({ hotels: names, checkInDate: g, checkOutDate: c, adults: 2, currency: "EUR", country: "tr", language: "en", maxConcurrency: 8 }, { token, sleep, maxPolls: 60 }).catch(() => []);
  out.otel[g] = Object.fromEntries(names.map((n) => [n, hotelTotal(rows.find((x) => x && x.input === n))]));
}
for (const s of ["IST,SAW-MUC 2026-12-11 2026-12-13", "IST,SAW-MUC 2026-12-18 2026-12-20"]) {
  const rows = await runActor({ searches: [s], adults: 1, cabinClass: "economy", currency: "EUR", market: "TR", language: "en", sortBy: "price", maxResultsPerSearch: 20, maxItems: 30, returnFlightsTop: 3, departureTimeRange: "5-14" },
    { token, actor: "eiv~google-flights-scraper", sleep, maxPolls: 80 }).catch(() => []);
  out.ucus[s] = rows.filter((r) => r.recordType === "flight" && r.stops === 0).map((r) => [r.section, r.airline, r.price, r.departureDate + " " + r.departureTime]).slice(0, 8);
}
await writeFile("data/noel-deneme.json", JSON.stringify(out, null, 1));
