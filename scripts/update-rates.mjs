// Euro/TL, Euro/Forint ve diğer kurları çekip data.json'a yazar. Anahtar gerekmez.
// İş günlerinde ECB referans kuru (Frankfurter API). ECB hafta sonu ve tatillerde kur yayımlamaz; o günlerde
// her gün yenilenen piyasa orta kuru (fawazahmed0/currency-api) kullanılır, böylece kur her gün güncel olur.
// Hatalı ya da şüpheli veride dosyayı DEĞİŞTİRMEZ ve hata verir.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const URLS = [
  "https://api.frankfurter.dev/v1/latest?base=EUR&symbols=TRY,HUF,CZK,PLN,SEK,DKK,RON",
  "https://api.frankfurter.app/latest?from=EUR&to=TRY,HUF,CZK,PLN,SEK,DKK,RON",
];
const DAILY_URLS = [
  "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/eur.min.json",
  "https://latest.currency-api.pages.dev/v1/currencies/eur.min.json",
];
export const SRC_ECB = "ECB referans kuru (Frankfurter API)";
export const SRC_DAILY = "Piyasa orta kuru (currency-api, günlük; ECB'nin yayımlamadığı günlerde)";
const MAX_JUMP = { eurTry: 0.15, eurHuf: 0.10 }; // eski değere göre izin verilen en büyük değişim

const round2 = (n) => Math.round(n * 100) / 100;

export function validate(j) {
  const t = j && j.rates && j.rates.TRY, h = j && j.rates && j.rates.HUF;
  if (typeof t !== "number" || !(t >= 1 && t <= 500)) throw new Error("TRY değeri geçersiz: " + t);
  if (typeof h !== "number" || !(h >= 100 && h <= 1000)) throw new Error("HUF değeri geçersiz: " + h);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(j.date || "")) throw new Error("Tarih geçersiz: " + j.date);
  // Diğer şehirlerin para birimleri (gezi ve ulaşım fiyatları için); geçersiz olan atlanır
  const kurlar = {};
  for (const k of ["CZK", "PLN", "SEK", "DKK", "RON"]) { const v = j.rates[k]; if (typeof v === "number" && v > 0 && v < 1000) kurlar[k] = Math.round(v * 10000) / 10000; }
  // ECB'nin yayımlamadığı ama sabit/yönetilen kurlar: BAM euroya yasal olarak sabit; RSD Sırbistan Merkez Bankası'nca dar bantta tutulur
  kurlar.BAM = 1.95583;
  if (!kurlar.RSD) kurlar.RSD = 117.2;
  return { eurTry: round2(t), eurHuf: round2(h), date: j.date, kurlar };
}

// currency-api biçimi: { date, eur: { try, huf, ... } } -> ECB biçimine çevrilir
export function fromDaily(j) {
  const e = (j && j.eur) || {};
  const rates = {};
  for (const k of ["TRY", "HUF", "CZK", "PLN", "SEK", "DKK", "RON"]) if (typeof e[k.toLowerCase()] === "number") rates[k] = e[k.toLowerCase()];
  return validate({ date: j && j.date, rates });
}

export async function fetchDaily(fetchImpl = fetch) {
  const errors = [];
  for (const url of DAILY_URLS) {
    try {
      const res = await fetchImpl(url, { headers: { accept: "application/json" } });
      if (!res.ok) { errors.push(url + " → HTTP " + res.status); continue; }
      return fromDaily(await res.json());
    } catch (e) { errors.push(url + " → " + e.message); }
  }
  throw new Error("Günlük kur alınamadı:\n" + errors.join("\n"));
}

const istanbulDate = (now) => new Date(now.getTime() + 3 * 3600e3).toISOString().slice(0, 10);

// ECB'nin kuru bugüne aitse onu, değilse (hafta sonu/tatil/yayın öncesi) daha yeni tarihli günlük kuru seçer.
export async function bestRates(fetchImpl = fetch, now = new Date()) {
  let ecb = null, daily = null, ecbErr = null, dailyErr = null;
  try { ecb = await fetchRates(fetchImpl); } catch (e) { ecbErr = e; }
  if (!ecb || ecb.date < istanbulDate(now)) {
    try { daily = await fetchDaily(fetchImpl); } catch (e) { dailyErr = e; }
  }
  console.log(`ECB: ${ecb ? ecb.date + " " + ecb.eurTry : "alınamadı (" + (ecbErr && ecbErr.message) + ")"} · günlük: ${daily ? daily.date + " " + daily.eurTry : dailyErr ? "alınamadı (" + dailyErr.message + ")" : "sorulmadı"}`);
  if (daily && (!ecb || daily.date > ecb.date)) return { ...daily, source: SRC_DAILY };
  if (ecb) return { ...ecb, source: SRC_ECB };
  throw new Error([ecbErr && ecbErr.message, dailyErr && dailyErr.message].filter(Boolean).join("\n"));
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

export async function update({ file = "data.json", fetchImpl = fetch, now = new Date() } = {}) {
  const old = JSON.parse(await readFile(file, "utf8"));
  const r = await bestRates(fetchImpl, now);
  if (old.updated && r.date < old.updated) return false; // elimizdeki kurdan eski bir kura asla geri dönme
  for (const key of ["eurTry", "eurHuf"]) {
    const jump = Math.abs(r[key] / old[key] - 1);
    if (jump > MAX_JUMP[key]) throw new Error(`${key} eskisine göre %${(jump * 100).toFixed(1)} değişti (sınır %${MAX_JUMP[key] * 100}). Elle kontrol et.`);
  }
  const next = { ...old, updated: r.date, eurTry: r.eurTry, eurHuf: r.eurHuf, kurlar: { ...(old.kurlar || {}), ...r.kurlar }, source: r.source };
  if (JSON.stringify(next) === JSON.stringify(old)) return false;
  await writeFile(file, JSON.stringify(next, null, 2) + "\n", "utf8");
  return true;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  update().then((changed) => console.log(changed ? "data.json güncellendi" : "değişiklik yok"))
    .catch((e) => { console.error(e.message); process.exit(1); });
}
