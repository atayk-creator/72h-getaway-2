// Tek seferlik: Selanik otel fiyatları (2 kişi). Sonuç yalnız çalışma kaydında. Kullanımdan sonra silinir.
import { runActor } from "./otel-fiyatlari.mjs";
import { hotelTotal } from "./deplasman-fiyat.mjs";
const token = process.env.APIFY_TOKEN, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const H = ["Electra Palace Hotel Thessaloniki", "Egnatia Palace Thessaloniki", "Colors Ladadika Central", "ONOMA Hotel", "City Hotel Thessaloniki", "Orestias Kastorias", "ibis Styles Thessaloniki", "Hotel Pella Thessaloniki", "Hotel Aegeon Thessaloniki", "Park Hotel Thessaloniki", "Holiday Inn Thessaloniki", "Le Palace Hotel Thessaloniki", "Hotel Metropolitan Thessaloniki", "Capsis Hotel Thessaloniki"];
for (let k = 1; k <= 2; k++) {
  const rows = await runActor({ hotels: H, checkInDate: "2026-11-13", checkOutDate: "2026-11-15", adults: 2, currency: "EUR", country: k === 1 ? "gr" : "us", language: "en", maxConcurrency: 8 }, { token, sleep, maxPolls: 60 }).catch((e) => { console.log("otel hata", e.message); return []; });
  for (const n of H) { const r = rows.find((x) => x && x.input === n); console.log("OTEL " + JSON.stringify({ k, n, ad: r && r.name, t: hotelTotal(r), puan: r && (r.rating || r.overallRating), adres: r && r.address, keys: k === 1 && n === H[0] && r ? Object.keys(r).join(",") : undefined })); }
}
