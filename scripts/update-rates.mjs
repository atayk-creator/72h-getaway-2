// Euro/TL ve Euro/Forint kurunu ECB referans kurlarından (Frankfurter API) çekip data.json'a yazar.
// Anahtar gerekmez. Hatalı ya da şüpheli veride dosyayı DEĞİŞTİRMEZ ve hata verir.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const URLS = [
  "https://api.frankfurter.dev/v1/latest?base=EUR&symbols=TRY,HUF",
  "https://api.frankfurter.app/latest?from=EUR&to=TRY,HUF",
];
const MAX_JUMP = { eurTry: 0.15, eurHuf: 0.10 }; // eski değere göre izin verilen en büyük değişim

const round2 = (n) => Math.round(n * 100) / 100;

export function validate(j) {
  const t = j && j.rates && j.rates.TRY, h = j && j.rates && j.rates.HUF;
  if (typeof t !== "number" || !(t >= 1 && t <= 500)) throw new Error("TRY değeri geçersiz: " + t);
  if (typeof h !== "number" || !(h >= 100 && h <= 1000)) throw new Error("HUF değeri geçersiz: " + h);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(j.date || "")) throw new Error("Tarih geçersiz: " + j.date);
  return { eurTry: round2(t), eurHuf: round2(h), date: j.date };
}

export async function fetchRates(fetchImpl = fetch) {
  const errors = [];
  for (const url of URLS) {
    try {
      const res = await fetchImpl(url, { headers: { accept: "application/json" } });
      if (!res.ok) { errors.push(url + " → HTTP " + res.status); continue; }
      return validate(await res.json());
    } catch (e) { errors.push(url + " → " + e.message); }
  }
  throw new Error("Kur alınamadı:\n" + errors.join("\n"));
}

export async function update({ file = "data.json", fetchImpl = fetch } = {}) {
  const old = JSON.parse(await readFile(file, "utf8"));
  const r = await fetchRates(fetchImpl);
  for (const key of ["eurTry", "eurHuf"]) {
    const jump = Math.abs(r[key] / old[key] - 1);
    if (jump > MAX_JUMP[key]) throw new Error(`${key} eskisine göre %${(jump * 100).toFixed(1)} değişti (sınır %${MAX_JUMP[key] * 100}). Elle kontrol et.`);
  }
  const next = { ...old, updated: r.date, eurTry: r.eurTry, eurHuf: r.eurHuf, source: "ECB referans kuru (Frankfurter API)" };
  if (JSON.stringify(next) === JSON.stringify(old)) return false;
  await writeFile(file, JSON.stringify(next, null, 2) + "\n", "utf8");
  return true;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  update().then((changed) => console.log(changed ? "data.json güncellendi" : "değişiklik yok"))
    .catch((e) => { console.error(e.message); process.exit(1); });
}
