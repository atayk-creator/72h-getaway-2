// TEK SEFERLİK arama (sonra silinir): Londra maç günü sabah gidiş (25 Kas, 12:00'den önce varış) ve
// iki gün önce gidiş (23 Kas) seçenekleri + bu tarihlerde otel fiyatları. Sonuç: data/tek-arama.json
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { runActor, apifyUsage } from "./otel-fiyatlari.mjs";
const root = fileURLToPath(new URL("..", import.meta.url));
const token = process.env.APIFY_TOKEN; if (!token) throw new Error("APIFY_TOKEN yok");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fb = JSON.parse(await readFile(root + "data/fenerbahce.json", "utf8"));
const lon = fb.maclar.find((m) => m.id === "londra");
const AP = ["STN", "LGW", "LHR", "LTN"];
const fl = (searches, extra) => runActor({ searches, adults: 1, cabinClass: "economy", currency: "EUR", market: "TR", language: "en", sortBy: "price",
  maxResultsPerSearch: 25, maxItems: searches.length * 25 + 20, includePriceInsights: true, includeSearchSummary: true, returnFlightsTop: 4, maxConcurrency: 3, ...extra },
  { token, actor: "eiv~google-flights-scraper", sleep, maxPolls: 80 }).catch((e) => [{ hata: e.message }]);
const before = await apifyUsage({ token }).catch(() => null);
const out = { tarih: new Date().toISOString() };
// A) maç günü: çarşamba sabah gidiş (TR saati 00–11 kalkış), cuma dönüş (2 gece: çar + per)
out.macGunu = await fl(AP.map((a) => `IST,SAW-${a} 2026-11-25 2026-11-27`), { departureTimeRange: "0-11" });
// B) iki gün önce: pazartesi gidiş, perşembe dönüş (3 gece: pzt + salı + çar)
out.ikiGunOnce = await fl(AP.map((a) => `IST,SAW-${a} 2026-11-23 2026-11-26`), {});
const H = (g, c) => runActor({ hotels: lon.oteller.map((h) => h.arama), checkInDate: g, checkOutDate: c, adults: 2, currency: "EUR", country: "tr", language: "en", maxConcurrency: 8 },
  { token, sleep, maxPolls: 60 }).catch((e) => [{ hata: e.message }]);
out.otel_25_27 = await H("2026-11-25", "2026-11-27");
out.otel_23_26 = await H("2026-11-23", "2026-11-26");
const after = await apifyUsage({ token }).catch(() => null);
out.maliyet = before && after ? Math.round((after.usd - before.usd) * 100) / 100 : null;
await writeFile(root + "data/tek-arama.json", JSON.stringify(out) + "\n");
console.log("maliyet", out.maliyet);
