// Google Maps denemesi (restoranlar): ne döndüğünü ve gerçek maliyeti görmek için Budapeşte'de küçük arama.
import { writeFile, mkdir } from "node:fs/promises";
import { runActor, apifyUsage } from "./otel-fiyatlari.mjs";
const token = process.env.APIFY_TOKEN, ACTOR = "compass~crawler-google-places";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const before = await apifyUsage({ token });
const input = {
  searchStringsArray: ["best restaurants", "cheap eats", "fine dining restaurant"],
  locationQuery: "Budapest, Hungary", maxCrawledPlacesPerSearch: 20, language: "en",
  skipClosedPlaces: true, scrapePlaceDetailPage: false, maxReviews: 0, maxImages: 0,
};
let rows = [], err = null;
try { rows = await runActor(input, { token, actor: ACTOR, sleep, maxPolls: 60 }); } catch (e) { err = String(e.message).split(token).join("***"); }
await sleep(90000);
const after = await apifyUsage({ token });
const out = { girdi: input, hata: err, satir: rows.length, maliyet: before && after ? Math.round((after.usd - before.usd) * 1000) / 1000 : null,
  alanlar: rows[0] ? Object.keys(rows[0]) : [], ornek: rows.slice(0, 2),
  ozet: rows.map((r) => ({ ad: r.title, puan: r.totalScore, yorum: r.reviewsCount, fiyat: r.price, kat: r.categoryName, semt: r.neighborhood, arama: r.searchString, kapali: r.permanentlyClosed || r.temporarilyClosed })) };
console.log("satır", out.satir, "maliyet", out.maliyet, "hata", err);
console.log("fiyatlı satır", out.ozet.filter((x) => x.fiyat).length);
for (const x of out.ozet.slice(0, 60)) console.log(JSON.stringify(x));
await mkdir("data/deneme", { recursive: true });
await writeFile("data/deneme/restoran-ham.json", JSON.stringify(out, null, 1) + "\n");
