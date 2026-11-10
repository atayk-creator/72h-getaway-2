// Tek seferlik: Dedeağaç otel fiyatları (2 kişi, 15–16 Kasım). Sonuç yalnız çalışma kaydında. Kullanımdan sonra silinir.
import { runActor } from "./otel-fiyatlari.mjs";
import { hotelTotal } from "./deplasman-fiyat.mjs";
const token = process.env.APIFY_TOKEN, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const H = ["Alexander Beach Hotel Alexandroupoli", "Grand Hotel Egnatia Alexandroupoli", "Astir Egnatia Alexandroupolis", "Thraki Palace Hotel", "Hotel Hera Alexandroupoli", "Maritime Hotel Alexandroupoli", "Ramada by Wyndham Alexandroupolis", "Plaza Hotel Alexandroupoli", "Hotel Okeanis Alexandroupoli", "Erika Hotel Alexandroupoli"];
for (let k = 1; k <= 2; k++) {
  const rows = await runActor({ hotels: H, checkInDate: "2026-11-15", checkOutDate: "2026-11-16", adults: 2, currency: "EUR", country: k === 1 ? "us" : "gr", language: "en", maxConcurrency: 8 }, { token, sleep, maxPolls: 60 }).catch((e) => { console.log("otel hata", e.message); return []; });
  for (const n of H) { const r = rows.find((x) => x && x.input === n); console.log("OTEL " + JSON.stringify({ k, n, ad: r && r.name, t: hotelTotal(r), puan: r && r.rating, adres: r && r.address })); }
}
