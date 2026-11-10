// Tek seferlik: Selanik otel fiyatları (2 kişi). Sonuç yalnız çalışma kaydında. Kullanımdan sonra silinir.
import { runActor } from "./otel-fiyatlari.mjs";
import { hotelTotal } from "./deplasman-fiyat.mjs";
const token = process.env.APIFY_TOKEN, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const H = ["Electra Palace Thessaloniki", "The Excelsior Thessaloniki", "Hotel Egnatia Palace Thessaloniki", "Colors Central Thessaloniki", "ONOMA Hotel Thessaloniki", "Hotel Tourist Thessaloniki", "City Hotel Thessaloniki", "Orestias Kastorias Thessaloniki", "Ibis Thessaloniki", "Hotel Kastro Thessaloniki", "Daios Luxury Living Thessaloniki", "Mandrino Hotel Thessaloniki"];
for (const [g, c] of [["2026-11-13", "2026-11-15"]]) {
  const rows = await runActor({ hotels: H, checkInDate: g, checkOutDate: c, adults: 2, currency: "EUR", country: "tr", language: "en", maxConcurrency: 8 }, { token, sleep, maxPolls: 60 }).catch((e) => { console.log("otel hata", e.message); return []; });
  for (const n of H) { const r = rows.find((x) => x && x.input === n); console.log("OTEL " + JSON.stringify({ g, n, ad: r && r.name, t: hotelTotal(r), puan: r && (r.rating || r.overallRating), adres: r && r.address })); }
}
