// Tek seferlik: Noel planı için uçuş günleri ve otel adı denemesi. Sonuç data/noel-deneme.json. Kullanımdan sonra silinir.
import { writeFile } from "node:fs/promises";
import { runActor } from "./otel-fiyatlari.mjs";
import { hotelTotal } from "./deplasman-fiyat.mjs";
const token = process.env.APIFY_TOKEN, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = { ucus: {}, otel: {} };
const S = ["IST-RVN 2026-12-17 2026-12-20", "IST-RVN 2026-12-18 2026-12-21", "IST-RVN 2026-12-19 2026-12-21", "IST-RVN 2026-12-16 2026-12-18",
  "IST-RVN 2026-12-11 2026-12-13", "IST-RVN 2026-12-12 2026-12-14", "IST,SAW-KRK 2026-12-26 2026-12-28", "IST,SAW-KRK 2026-12-24 2026-12-27",
  "IST,SAW-KRK 2026-12-25 2026-12-28", "IST,SAW-NUE 2026-12-11 2026-12-13"];
for (const s of S) {
  const rows = await runActor({ searches: [s], adults: 1, cabinClass: "economy", currency: "EUR", market: "TR", language: "en", sortBy: "price", maxResultsPerSearch: 30, maxItems: 50, returnFlightsTop: 4, includeSearchSummary: true },
    { token, actor: "eiv~google-flights-scraper", sleep, maxPolls: 80 }).catch((e) => [{ hata: e.message }]);
  out.ucus[s] = rows.filter((r) => r.recordType === "flight").map((r) => ({ y: r.section, a: r.airline, s: r.stops, f: r.price, d: r.departureDate + " " + r.departureTime, v: r.arrivalTime, o: r.origin, n: r.flightNumbers, ob: r.outboundFlightNumbers }));
  console.log(s, out.ucus[s].length);
}
const H = {
  "2026-12-04|2026-12-06": ["Mercure München Altstadt", "Hotel Blauer Bock München", "Motel One München Sendlinger Tor", "MEININGER Hotel München City Center", "Hotel Schlicker München", "ibis München City", "Motel One München-Deutsches Museum", "Hotel Uhland München"],
  "2026-12-18|2026-12-20": ["Maison Rouge Strasbourg Hotel Spa", "Regent Petite France Strasbourg", "ibis Strasbourg Centre Petite France", "Hotel Le Kleber Strasbourg", "Hotel Hannong Strasbourg", "Hotel Suisse Strasbourg",
    "Arctic TreeHouse Hotel", "Arctic Light Hotel", "Santa Claus Holiday Village", "Hotel Santa Claus", "Santas Hotel Rudolf", "City Hotel Rovaniemi", "Lapland Hotels Sky Ounasvaara", "Hotel Aakenus Rovaniemi"],
  "2026-12-25|2026-12-27": ["PURO Kraków Stare Miasto", "Hotel Polski Pod Białym Orłem Kraków"],
};
for (const [k, names] of Object.entries(H)) {
  const [g, c] = k.split("|");
  const rows = await runActor({ hotels: names, checkInDate: g, checkOutDate: c, adults: 2, currency: "EUR", country: "tr", language: "en", maxConcurrency: 8 }, { token, sleep, maxPolls: 60 }).catch((e) => [{ hata: e.message }]);
  for (const n of names) { const r = rows.find((x) => x && x.input === n); out.otel[n] = r ? { ad: r.name, toplam: hotelTotal(r), adres: r.address } : null; }
}
await writeFile("data/noel-deneme.json", JSON.stringify(out, null, 1));
