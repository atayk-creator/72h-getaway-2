// Tek seferlik: Gdańsk Pazar dönüş seferi (tek yön). Sonuç data/noel.json'a yazılır. Kullanımdan sonra silinir.
import { readFile, writeFile } from "node:fs/promises";
import { runActor } from "./otel-fiyatlari.mjs";
import { donusDoldur } from "./deplasman-fiyat.mjs";
const token = process.env.APIFY_TOKEN, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const d = JSON.parse(await readFile("data/noel.json", "utf8")), m = d.maclar.find((x) => x.id === "gdansk");
for (let i = 1; i <= 5; i++) {
  const rows = await runActor({ searches: ["GDN-IST,SAW 2026-12-06"], adults: 1, cabinClass: "economy", currency: "EUR", market: "TR", language: "en", sortBy: "price", maxResultsPerSearch: 20, maxItems: 30 },
    { token, actor: "eiv~google-flights-scraper", sleep, maxPolls: 80 }).catch((e) => { console.log("hata", e.message); return []; });
  const fl = rows.filter((r) => r.recordType === "flight");
  console.log("deneme", i, fl.map((r) => [r.airline, r.stops, r.departureTime, r.arrivalTime, r.price, (r.flightNumbers || []).join(",")]));
  if (fl.length) { console.log("dolduruldu:", donusDoldur(m, rows), m.ucus.oneri.donus); break; }
  await sleep(60000);
}
await writeFile("data/noel.json", JSON.stringify(d, null, 1) + "\n");
