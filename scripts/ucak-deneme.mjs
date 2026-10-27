// Google Flights denemesi: Apify'daki dz_omar/google-flights-scraper robotunun ne döndürdüğünü görmek için
// birkaç küçük arama yapar ve ham sonucu data/deneme/ucak-ham.json'a yazar. Maliyeti 1 sentin altında.
import { writeFile, mkdir } from "node:fs/promises";
import { runActor, upcomingWeekends, istanbulToday } from "./otel-fiyatlari.mjs";

const ACTOR = "dz_omar~google-flights-scraper";
const w = upcomingWeekends(istanbulToday(), 2)[1]; // gelecek haftanın hafta sonu
const base = { tripType: "round_trip", destination: "BUD", departureDate: w.giris, returnDate: w.cikis, adults: 1, currency: "EUR", market: "TR", language: "en-US", resultsView: "cheapest", maxResults: 4 };
const tests = [
  { ad: "IST tek", input: { ...base, origin: "IST" } },
  { ad: "SAW tek", input: { ...base, origin: "SAW" } },
  { ad: "IST,SAW birlikte", input: { ...base, origin: "IST,SAW" } },
  { ad: "IST 2 kişi", input: { ...base, origin: "IST", adults: 2, maxResults: 2 } },
];
const out = { tarih: new Date().toISOString(), hafta_sonu: w, sonuclar: [] };
for (const t of tests) {
  try {
    const rows = await runActor(t.input, { token: process.env.APIFY_TOKEN, actor: ACTOR, sleep: (ms) => new Promise((r) => setTimeout(r, ms)) });
    out.sonuclar.push({ ad: t.ad, girdi: t.input, satir: rows.length, ilk: rows.slice(0, 3) });
    console.log(t.ad, "→", rows.length, "satır", rows.slice(0, 3).map((r) => `${r.origin}-${r.destination} ${r.price} ${r.currency} ${r.stopsLabel || r.stops} ${r.airlines}`).join(" | "));
  } catch (e) {
    out.sonuclar.push({ ad: t.ad, girdi: t.input, hata: String(e.message).split(process.env.APIFY_TOKEN || "§").join("***") });
    console.log(t.ad, "→ HATA", e.message);
  }
}
await mkdir("data/deneme", { recursive: true });
await writeFile("data/deneme/ucak-ham.json", JSON.stringify(out, null, 1) + "\n");
