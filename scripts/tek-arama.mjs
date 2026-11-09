// TEK SEFERLİK (sonra silinir): Linz yeniden planı, 2. tur. 1) ÖBB tren fiyatları (Apify jindrich.bar~oebb-ticket-scraper,
// ÖBB'nin kendi bilet verisi; 2. sınıf en ucuz) — 2) Unsplash fotoğrafları (Unsplash lisansı). Sonuç: data/tek-arama-3.json
import { writeFile, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { runActor, apifyUsage } from "./otel-fiyatlari.mjs";
const root = fileURLToPath(new URL("..", import.meta.url));
const token = process.env.APIFY_TOKEN; if (!token) throw new Error("APIFY_TOKEN yok");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = { tarih: new Date().toISOString(), tren: {} };
const before = await apifyUsage({ token }).catch(() => null);
const T = [
  ["havalimani_viyana", "Flughafen Wien Bahnhof", "Wien Hbf", "2026-12-08", "09:30"],
  ["havalimani_viyana_b", "Wien Flughafen", "Wien Hbf", "2026-12-08", "09:30"],
  ["linz_havalimani", "Linz/Donau Hbf", "Flughafen Wien Bahnhof", "2026-12-10", "15:00"],
  ["linz_havalimani_b", "Linz/Donau Hbf", "Wien Flughafen", "2026-12-10", "15:00"],
];
for (const [k, from, to, date, time] of T) {
  out.tren[k] = await runActor({ from, to, date, time, adults: 1, sortBy: "DEPARTURE", maxResults: 8 },
    { token, actor: "jindrich.bar~oebb-ticket-scraper", sleep, maxPolls: 60 }).catch((e) => [{ hata: e.message }]);
  console.log(k, out.tren[k].map((c) => `${String(c.departure || "").slice(11, 16)} ${c.durationMinutes}dk ${c.transfers}akt ${c.priceAmount} ${c.priceCoversFullJourney}`).join(" | "));
}
const after = await apifyUsage({ token }).catch(() => null);
out.maliyet = before && after ? Math.round((after.usd - before.usd) * 1000) / 1000 : null;
const PH = [["linz-1", "photo-1688894073805-f38b1bbceb72"], ["linz-2", "photo-1715343809252-0761f77f0285"], ["londra-1", "photo-1619628055845-120aa225df15"]];
await mkdir(root + "img/sehir", { recursive: true });
for (const [n, id] of PH) for (const [suf, w] of [["", 1600], ["-640", 640]]) {
  try {
    execFileSync("curl", ["-sSL", "--fail", "-m", "60", "-o", root + `img/sehir/${n}${suf}.jpg`, `https://images.unsplash.com/${id}?fm=jpg&q=78&w=${w}&fit=max`]);
    console.log("foto", n + suf, "tamam");
  } catch (e) { console.log("foto hatası", n + suf, e.message); }
}
await writeFile(root + "data/tek-arama-3.json", JSON.stringify(out) + "\n");
console.log("maliyet", out.maliyet);
