// Tek seferlik: Aralık 5 gece İstanbul → Hollanda uçuş taraması. Sonuç yalnız Actions artifact'ı (depoya yazılmaz). Kullanımdan sonra silinir.
import { writeFile } from "node:fs/promises";
import { runActor } from "./otel-fiyatlari.mjs";
const token = process.env.APIFY_TOKEN, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const d = (n) => `2026-12-${String(n).padStart(2, "0")}`;
const S = [];
for (let g = 1; g <= 26; g++) S.push(`IST,SAW-AMS,EIN,RTM ${d(g)} ${d(g + 5)}`);
const out = {};
for (let i = 0; i < S.length; i += 6) {
  const part = S.slice(i, i + 6);
  for (let k = 1; k <= 4; k++) {
    const rows = await runActor({ searches: part, adults: 1, cabinClass: "economy", currency: "EUR", market: "TR", language: "en", sortBy: "price",
      maxResultsPerSearch: 25, maxItems: part.length * 25 + 20, includeSearchSummary: true, returnFlightsTop: 3, maxConcurrency: 3 },
      { token, actor: "eiv~google-flights-scraper", sleep, maxPolls: 120 }).catch((e) => { console.log("hata", e.message); return []; });
    const fl = rows.filter((r) => r.recordType === "flight");
    console.log(part[0], "…", "deneme", k, "uçuş", fl.length);
    if (fl.length) {
      if (i === 0) console.log("ANAHTARLAR", Object.keys(fl[0]).join(","));
      for (const r of fl) console.log("ROW " + JSON.stringify({ q: r.searchQuery || r.search || r.query || r.searchId || null, gd: r.departureDate, s: r.section, a: r.airline, st: r.stops, p: r.price, t: r.departureTime, v: r.arrivalTime, o: r.origin, d: r.destination, n: r.flightNumbers, ob: r.outboundFlightNumbers, du: r.durationMinutes || r.duration }));
      break;
    }
    await sleep(60000);
  }
}

