// TEK SEFERLİK: Fenerbahçe deplasman maçları için 2 gecelik (salı → perşembe) otel ve uçak fiyatları.
// Otel: eiv~google-hotels-scraper (otel adıyla, ~0,003 $/otel). Uçak: eiv~google-flights-scraper (~0,003 $/arama).
// Ham sonuçları data/mac-gezisi-2.json'a yazar; yorumlama elle yapılır. Toplam maliyet ~0,15 $.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { runActor, apifyUsage } from "./otel-fiyatlari.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const token = process.env.APIFY_TOKEN;
if (!token) throw new Error("APIFY_TOKEN yok");
const hotels = JSON.parse(await readFile(root + "data/hotels.json", "utf8"));
const ours = (s) => hotels.sehirler.find((c) => c.sehir === s).oteller.map((h) => h.arama);
const LINZ = ["Hotel Wolfinger Linz", "Arcotel Nike Linz", "Austria Trend Hotel Schillerpark Linz", "Courtyard by Marriott Linz",
  "Hotel am Domplatz Linz", "Park Inn by Radisson Linz", "Star Inn Hotel Premium Linz", "Hotel Schwarzer Bär Linz", "Motel One Linz-Hauptplatz",
  "B&B Hotel Linz-Hbf", "ibis Linz City", "Hotel Harruckern Linz"];
const TRIPS = [
  { mac: "Shakhtar – Fenerbahçe (Londra, Stamford Bridge)", giris: "2026-11-24", cikis: "2026-11-26", oteller: ours("Londra"),
    ucus: ["IST,SAW-LHR,LGW,STN,LTN 2026-11-24 2026-11-26"] },
  { mac: "LASK – Fenerbahçe (Linz, Raiffeisen Arena)", giris: "2026-12-08", cikis: "2026-12-10", oteller: LINZ,
    ucus: ["IST,SAW-LNZ 2026-12-08 2026-12-10", "IST,SAW-VIE 2026-12-08 2026-12-10", "IST,SAW-SZG 2026-12-08 2026-12-10", "IST,SAW-MUC 2026-12-08 2026-12-10"] },
  { mac: "Atlético Madrid – Fenerbahçe (Madrid, Metropolitano)", giris: "2027-01-26", cikis: "2027-01-28", oteller: ours("Madrid"),
    ucus: ["IST,SAW-MAD 2027-01-26 2027-01-28"] },
];
// 2. tur: sadece hata veren uçuş aramaları (oteller ilk turda alındı)
const RETRY = [
  { mac: "Londra uçuş (tekrar)", ucus: ["IST,SAW-LHR 2026-11-24 2026-11-26", "IST,SAW-LGW,STN,LTN 2026-11-24 2026-11-26"] },
  { mac: "Linz çevresi uçuş (tekrar)", ucus: ["IST,SAW-VIE 2026-12-08 2026-12-10", "IST,SAW-MUC 2026-12-08 2026-12-10", "IST,SAW-SZG 2026-12-08 2026-12-10"] },
];
TRIPS.length = 0; TRIPS.push(...RETRY);
const before = await apifyUsage({ token }).catch(() => null);
const out = { tarih: new Date().toISOString(), not: "2 yetişkin, 1 oda, 2 gece; uçak 1 kişi gidiş-dönüş EUR", geziler: [] };
for (const t of TRIPS) {
  const g = { mac: t.mac, giris: t.giris, cikis: t.cikis };
  if (t.oteller) try {
    g.otel = await runActor({ hotels: t.oteller, checkInDate: t.giris, checkOutDate: t.cikis, adults: 2, currency: "EUR", country: "tr", language: "en", maxConcurrency: 8 },
      { token, sleep: (ms) => new Promise((r) => setTimeout(r, ms)), maxPolls: 60 });
  } catch (e) { g.otelHata = String(e.message); }
  try {
    g.ucus = await runActor({ searches: t.ucus, adults: 1, cabinClass: "economy", currency: "EUR", market: "TR", language: "en", sortBy: "price",
      maxResultsPerSearch: 8, maxItems: t.ucus.length * 8 + 10, includePriceInsights: true, includeSearchSummary: true, maxConcurrency: 4 },
      { token, actor: "eiv~google-flights-scraper", sleep: (ms) => new Promise((r) => setTimeout(r, ms)), maxPolls: 60 });
  } catch (e) { g.ucusHata = String(e.message); }
  console.log(t.mac, "otel satırı:", (g.otel || []).length, "uçuş satırı:", (g.ucus || []).length, g.otelHata || "", g.ucusHata || "");
  out.geziler.push(g);
}
const after = await apifyUsage({ token }).catch(() => null);
out.maliyet = before && after ? Math.round((after.usd - before.usd) * 1000) / 1000 : null; out.sayac = after;
await writeFile(root + "data/mac-gezisi-2.json", JSON.stringify(out, null, 1) + "\n");
console.log("maliyet:", out.maliyet);
