// TEK SEFERLİK: Fenerbahçe deplasmanları için uçak fiyatları (3. tur: her havalimanı ayrı, Pegasus dahil tüm havayolları).
// eiv~google-flights-scraper (~0,003 $/arama). Hata veren arama bir kez tekrarlanır. Sonuç: data/mac-ucus.json
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { runActor, apifyUsage } from "./otel-fiyatlari.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const token = process.env.APIFY_TOKEN;
if (!token) throw new Error("APIFY_TOKEN yok");
const LON = (a) => `IST,SAW-${a} 2026-11-24 2026-11-26`;
const LINES = [...["LHR", "LGW", "STN", "LTN", "LCY", "SEN"].map(LON), "IST,SAW-VIE 2026-12-08 2026-12-10", "IST,SAW-MAD 2027-01-26 2027-01-28"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const input = (searches) => ({ searches, adults: 1, cabinClass: "economy", currency: "EUR", market: "TR", language: "en", sortBy: "price",
  maxResultsPerSearch: 30, maxItems: searches.length * 30 + 20, includePriceInsights: true, includeSearchSummary: true, returnFlightsTop: 6, maxConcurrency: 3 });
const before = await apifyUsage({ token }).catch(() => null);
let rows = await runActor(input(LINES), { token, actor: "eiv~google-flights-scraper", sleep, maxPolls: 80 });
const bad = LINES.filter((l) => rows.some((r) => r.input === l && r.errorCode === "GOOGLE_ERROR") && !rows.some((r) => r.input === l && r.recordType === "flight"));
if (bad.length) {
  console.log("tekrar:", bad);
  rows = rows.filter((r) => !bad.includes(r.input)).concat(await runActor(input(bad), { token, actor: "eiv~google-flights-scraper", sleep, maxPolls: 80 }));
}
const after = await apifyUsage({ token }).catch(() => null);
const out = { tarih: new Date().toISOString(), maliyet: before && after ? Math.round((after.usd - before.usd) * 1000) / 1000 : null, satirlar: rows };
await writeFile(root + "data/mac-ucus.json", JSON.stringify(out, null, 1) + "\n");
for (const l of LINES) console.log(l, rows.filter((r) => r.input === l && r.recordType === "flight").length, "uçuş");
console.log("maliyet:", out.maliyet);
