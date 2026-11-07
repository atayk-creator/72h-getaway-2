// DENEME: eiv/google-flights-scraper (uçuş başına ücret) ile mevcut robotun (dz_omar, arama başına ~0,028 $) karşılaştırması.
// 26 şehir × 2 hafta sonu, Cuma 05–12 gidiş / Pazar 16–24 dönüş, fiyata göre sıralı ilk 5 uçuş + ücretsiz özet satırı.
// Gerçek maliyet Apify sayacından ölçülür. Sonuç: data/ucak-deneme.json (karşılaştırma + ham örnek satırlar).
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { runActor, apifyUsage } from "./otel-fiyatlari.mjs";

const ACTOR = "eiv~google-flights-scraper";
const root = fileURLToPath(new URL("..", import.meta.url));
const token = process.env.APIFY_TOKEN;
const cfg = JSON.parse(await readFile(root + "data/ucus-ayarlari.json", "utf8"));
const eski = JSON.parse(await readFile(root + "data/ucuslar.json", "utf8"));
const WEEKENDS = [["2026-11-13", "2026-11-15"], ["2026-11-20", "2026-11-22"]];
// 2. deneme: aynı aramalar iki kez: A = gidiş + dönüş saati şartlı, B = sadece gidiş saati şartlı (dönüş serbest)
const searches = [];
for (const [g, c] of WEEKENDS) for (const s of cfg.sehirler) searches.push({ sehir: s.sehir, giris: g, line: `${cfg.kalkis.join(",")}-${s.havalimani.join(",")} ${g} ${c}` });
const base = { searches: searches.map((x) => x.line), adults: 1, cabinClass: "economy", currency: "EUR", market: "TR", language: "en", departureTimeRange: cfg.gidis_saat,
  sortBy: "price", maxResultsPerSearch: 5, maxItems: 400, includePriceInsights: true, includeSearchSummary: true, maxConcurrency: 5 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const before = await apifyUsage({ token });
const [A, B] = await Promise.all([
  runActor({ ...base, returnDepartureTimeRange: cfg.donus_saat }, { token, sleep, actor: ACTOR, maxPolls: 120 }),
  runActor(base, { token, sleep, actor: ACTOR, maxPolls: 120 }),
]);
await sleep(90000);
const after = await apifyUsage({ token });
const usd = before && after ? Math.round((after.usd - before.usd) * 1000) / 1000 : null;
const pick = (rows, line) => {
  const mine = rows.filter((r) => r.input === line);
  const sum = mine.find((r) => r.recordType === "search-summary") || {};
  const fl = mine.filter((r) => r.recordType === "flight").sort((x, y) => x.price - y.price);
  const err = mine.find((r) => r.errorCode || r.errorMessage);
  const ph = (sum.priceHistory || []).slice(-8).map((x) => `${x.date.slice(5)}:${x.price}`).join(" ");
  return { enUcuz: fl[0] ? fl[0].price : null, ucus: fl[0] ? `${fl[0].airline} ${fl[0].departureTime} ${fl[0].stops} aktarma ${fl[0].origin}-${fl[0].destination}` : null,
    aktarmasiz: (fl.find((x) => x.stops === 0) || {}).price ?? null, ozetEnDusuk: sum.lowestPrice ?? null, ozetAktarmasiz: sum.cheapestNonstopPrice ?? null,
    seviye: sum.priceLevel || null, tipik: sum.typicalPriceLow != null ? `${sum.typicalPriceLow}-${sum.typicalPriceHigh}` : null, gecmis: ph, bulunan: sum.flightsFound ?? null, hata: err ? (err.errorCode || "") + " " + (err.errorMessage || "") : null };
};
const out = { tarih: new Date().toISOString(), aktor: ACTOR, arama: searches.length * 2, satirA: A.length, satirB: B.length, olculenUsd: usd,
  aramaBasiUsd: usd != null ? Math.round((usd / (searches.length * 2)) * 100000) / 100000 : null, karsilastirma: [] };
for (const s of searches) {
  const e = ((eski.haftaSonlari[s.giris] || {}).sehirler || {})[s.sehir];
  out.karsilastirma.push({ sehir: s.sehir, giris: s.giris, eski: e && e.son ? e.son.fiyat : null, eskiUcus: e && e.son ? `${e.son.havayolu} ${String(e.son.ucusSaati || "").slice(11, 16)}` : null,
    eskiKontrol: e && e.son ? String(e.son.kontrol).slice(0, 10) : null, A: pick(A, s.line), B: pick(B, s.line) });
}
await writeFile(root + "data/ucak-deneme.json", JSON.stringify(out, null, 1) + "\n");
console.log(JSON.stringify({ arama: out.arama, A: A.length, B: B.length, usd, aramaBasi: out.aramaBasiUsd }));
