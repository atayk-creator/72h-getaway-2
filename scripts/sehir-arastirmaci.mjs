// ŞEHİR ARAŞTIRMACISI
// Bir şehir için 3 otel (Sade, Orta, Şık) ve 3 restoran (Ucuz, Orta, Şık) önerir; ayrıca uygulamanın
// günlük yemek, ulaşım ve gezi tahminlerini kaynaklı olarak günceller. Web araması yapan model kullanılır.
// Güvenlik kuralları (kodla denetlenir, yapay zekânın sözüne bırakılmaz):
//  - Her satırın kaynağı, robotun o çalışmada GERÇEKTEN gördüğü arama sonuçlarından biri olmalı.
//  - Fiyatlar makul aralıkta olmalı ve uygulamanın şehir tahminine göre aşırı sapmamalı.
//  - Geçemeyen satır atılır, yerine uygulamanın "Tahmini" satırı kalır.
// Sonuç sehirler/<şehir>.json dosyasına yazılır ve GitHub bunu senin onayına (Pull request) sunar.
// Sen "Merge" demeden uygulamada görünmez.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { ask, Meter, MODELS, parseJson, searchedUrls, normUrl, webSearchTool, hasKey } from "./lib/claude.mjs";
import { loadCities } from "./lib/sehirler.mjs";

export const MAX_USD = Number(process.env.SEHIR_MAX_USD || 1.5);
const HT = ["Sade", "Orta", "Şık"], RT = ["Ucuz", "Orta", "Şık"];
const HM = { Sade: 0.7, Orta: 1, Şık: 1.5 }, RM = { Ucuz: 0.3, Orta: 0.55, Şık: 1.3 };

const SYSTEM = `Sen 72h Getaway için çalışan bir seyahat bütçe araştırmacısısın. Okurlar Türkiye'den kısa şehir kaçamağı yapan çiftler.
Kurallar:
- Web aramasıyla güncel ve gerçek bilgi bul. Bilmediğin hiçbir şeyi uydurma.
- Her satırın "source" alanına, bilgiyi gerçekten okuduğun arama sonucunun adresini yaz.
- Otel fiyatı: 2 kişilik standart oda, bir gece, euro, yaklaşık ve tarihsiz tipik fiyat (sezon dışı hafta sonu).
- Restoran fiyatı: kişi başı, içecek dahil, euro.
- Açıklamalar Türkçe, 1-2 cümle, samimi ve somut. Abartma, reklam dili kullanma.
- Cevabının sonunda yalnızca istenen JSON'u bir \`\`\`json bloğu içinde ver.`;

export function buildPrompt(city) {
  const b = (m) => Math.round(city.h * m);
  return `Şehir: ${city.name} (${city.country}).
Uygulamanın şu anki tahminleri (euro): orta otel gecesi ${city.h}, kişi başı günlük yemek ${city.f}, kişi başı günlük ulaşım ${city.t}, kişi başı günlük gezi ${city.a}.

Bul:
1) 3 otel, merkezi konumda, iyi puanlı:
   - "Sade": yaklaşık ${b(0.5)}-${b(0.9)} €/gece
   - "Orta": yaklaşık ${b(0.8)}-${b(1.3)} €/gece
   - "Şık":  yaklaşık ${b(1.2)}-${b(2.2)} €/gece
2) 3 restoran: "Ucuz" (sokak lezzeti ya da sosyal medyada bilinen ucuz yer), "Orta" (yerel mutfak), "Şık" (özel akşam).
3) Şehir içi ulaşım: tek biletin ve varsa 72 saatlik kartın resmî fiyatı (resmî ulaşım sitesinden).
4) Gerekirse günlük yemek, ulaşım ve gezi tahmininde düzeltme önerisi (kaynaklı).

JSON biçimi:
{
 "hotels":[{"t":"Sade","name":"...","p":70,"sc":"8,4","area":"semt adı","desc":"...","source":"https://..."}],
 "restos":[{"t":"Ucuz","name":"...","p":12,"q":"Ad + sokak + şehir (Google Haritalar araması için)","desc":"...","source":"https://..."}],
 "transport":[{"label":"Tek bilet","value":2.5,"currency":"EUR","source":"https://..."}],
 "params":{"f":null,"t":null,"a":null,"why":"...","source":null},
 "note":"Okura 1-2 cümlelik özet: neler araştırıldı, nelere dikkat etmeli."
}
"sc" bilinmiyorsa boş bırak. Önerin yoksa params değerlerini null bırak.`;
}

export function validate(raw, city, seen) {
  const problems = [], ok = (u) => u && seen.has(normUrl(u));
  const pick = (arr, tiers, mult, base, lo, hi, kind) => tiers.map((t) => {
    const x = (arr || []).find((r) => r && r.t === t);
    if (!x) { problems.push(`${kind} ${t}: önerilmedi`); return null; }
    const p = Number(x.p), exp = base * mult[t];
    if (!x.name || !Number.isFinite(p)) { problems.push(`${kind} ${t}: ad ya da fiyat eksik`); return null; }
    if (p < lo || p > hi || p < exp * 0.35 || p > exp * 3) { problems.push(`${kind} ${t} (${x.name}): fiyat ${p} € beklenen aralığın dışında`); return null; }
    if (!ok(x.source)) { problems.push(`${kind} ${t} (${x.name}): kaynak arama sonuçlarında yok (${x.source || "boş"})`); return null; }
    return x;
  });
  const hotels = pick(raw.hotels, HT, HM, city.h, 20, 1500, "Otel").map((x) => x && { t: x.t, name: String(x.name).slice(0, 80), p: Math.round(+x.p), sc: x.sc ? String(x.sc).slice(0, 6) : "", s: "res", desc: String(x.desc || "").slice(0, 300) + (x.area ? ` Semt: ${String(x.area).slice(0, 40)}.` : ""), source: x.source });
  const restos = pick(raw.restos, RT, RM, city.f, 3, 400, "Restoran").map((x) => x && { t: x.t, name: String(x.name).slice(0, 80), p: Math.round(+x.p), sc: "", s: "res", q: String(x.q || `${x.name} ${city.name}`).slice(0, 120), desc: String(x.desc || "").slice(0, 300), source: x.source });
  const transport = (raw.transport || []).filter((x) => x && Number.isFinite(+x.value) && +x.value > 0 && +x.value < 200 && ok(x.source)).slice(0, 4)
    .map((x) => ({ label: String(x.label).slice(0, 60), value: +x.value, currency: String(x.currency || "EUR").slice(0, 5), source: x.source }));
  const params = {};
  if (raw.params && ok(raw.params.source)) {
    for (const k of ["f", "t", "a"]) {
      const v = Number(raw.params[k]);
      if (raw.params[k] != null && Number.isFinite(v) && v > 0 && v >= city[k] * 0.5 && v <= city[k] * 2 + 5) params[k] = Math.round(v);
      else if (raw.params[k] != null) problems.push(`Tahmin düzeltmesi ${k}=${raw.params[k]} reddedildi (mevcut ${city[k]}, aşırı sapma)`);
    }
    if (Object.keys(params).length) { params.why = String(raw.params.why || "").slice(0, 300); params.source = raw.params.source; }
  }
  return { hotels, restos, transport, params, problems, note: String(raw.note || "").slice(0, 400) };
}

export async function research(city, { apiFetch = fetch, today = new Date().toISOString().slice(0, 10) } = {}) {
  const meter = new Meter(MAX_USD);
  const r = await ask({ model: MODELS.orta, system: SYSTEM, prompt: buildPrompt(city), tools: [webSearchTool({ maxUses: 14 })], maxTokens: 6000, meter, fetchImpl: apiFetch, maxTurns: 8 });
  const seen = searchedUrls(r.content);
  const v = validate(parseJson(r.text), city, seen);
  const good = v.hotels.filter(Boolean).length + v.restos.filter(Boolean).length;
  const file = {
    city: city.name, slug: city.slug, researched: today, by: "sehir-arastirmaci (" + MODELS.orta + ")",
    confidence: good >= 6 && v.transport.length ? "orta" : "düşük",
    note: v.note || `Robot araştırması (${today}). Fiyatlar yaklaşık ve tarihsizdir, rezervasyonda kendi tarihine bak.`,
    hotels: v.hotels, restos: v.restos, transport: v.transport, params: Object.keys(v.params).length ? v.params : null,
    problems: v.problems,
  };
  return { file, meter, seenCount: seen.size };
}

export function report({ file, meter, seenCount }) {
  const L = [`# Şehir araştırması: ${file.city}`, "", `Güven: **${file.confidence}** · ${seenCount} arama sonucu tarandı · ${meter.summary()}`, "", file.note, "", "## Oteller (gece, 2 kişilik oda)", "", "| Kademe | Otel | Fiyat | Puan | Kaynak |", "| --- | --- | --- | --- | --- |"];
  HT.forEach((t, i) => { const h = file.hotels[i]; L.push(h ? `| ${t} | ${h.name} | ~${h.p} € | ${h.sc} | [kaynak](${h.source}) |` : `| ${t} | — (uygulamanın tahmini kalır) | | | |`); });
  L.push("", "## Restoranlar (kişi başı, içecek dahil)", "", "| Kademe | Restoran | Fiyat | Kaynak |", "| --- | --- | --- | --- |");
  RT.forEach((t, i) => { const r = file.restos[i]; L.push(r ? `| ${t} | ${r.name} | ~${r.p} € | [kaynak](${r.source}) |` : `| ${t} | — (uygulamanın tahmini kalır) | | |`); });
  if (file.transport.length) { L.push("", "## Ulaşım", ""); for (const t of file.transport) L.push(`- ${t.label}: ${t.value} ${t.currency} ([kaynak](${t.source}))`); }
  if (file.params) L.push("", "## Tahmin düzeltmesi", "", `${Object.entries(file.params).filter(([k]) => ["f", "t", "a"].includes(k)).map(([k, v]) => ({ f: "günlük yemek", t: "günlük ulaşım", a: "günlük gezi" }[k] + " → " + v + " €")).join(", ")}. Gerekçe: ${file.params.why} ([kaynak](${file.params.source}))`);
  if (file.problems.length) { L.push("", "## Robotun elediği satırlar", ""); for (const p of file.problems) L.push("- " + p); }
  L.push("", "---", "**Senin işin:** her kaynağı açıp ad ve fiyatı kontrol et. Yanlış bir satır görürsen bu sayfada yorum yaz ya da kapat. Hepsi doğruysa \"Merge pull request\" düğmesine bas; şehir uygulamada \"Araştırıldı\" olarak görünür.");
  return L.join("\n");
}

async function readJson(f, d) { try { return JSON.parse(await readFile(f, "utf8")); } catch { return d; } }

export async function pickCity(cities, requested) {
  if (requested) {
    const c = cities.find((x) => x.name.toLocaleLowerCase("tr-TR") === requested.trim().toLocaleLowerCase("tr-TR") || x.slug === requested.trim());
    if (!c) throw new Error(`"${requested}" uygulamadaki şehirlerden biri değil. Seçenekler: ${cities.map((x) => x.name).join(", ")}`);
    return c;
  }
  const queue = await readJson("sehirler/sira.json", { sira: [] });
  const index = await readJson("sehirler/index.json", { sehirler: [] });
  const done = new Set(index.sehirler.map((x) => x.slug));
  for (const name of queue.sira) { const c = cities.find((x) => x.name === name); if (c && !done.has(c.slug) && c.name !== "Budapeşte") return c; }
  return null;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  (async () => {
    if (!hasKey()) { console.log("ANTHROPIC_API_KEY yok: şehir araştırmacısı atlandı (kurulum tamamlanınca çalışacak)."); return; }
    const cities = await loadCities();
    const city = await pickCity(cities, process.env.SEHIR);
    if (!city) { console.log("Sıradaki tüm şehirler araştırılmış. sehirler/sira.json'a yeni şehir ekle."); return; }
    console.log("Araştırılıyor:", city.name);
    const r = await research(city);
    await mkdir("sehirler", { recursive: true });
    await writeFile(`sehirler/${city.slug}.json`, JSON.stringify(r.file, null, 2) + "\n");
    const index = await readJson("sehirler/index.json", { sehirler: [] });
    index.sehirler = index.sehirler.filter((x) => x.slug !== city.slug).concat({ name: city.name, slug: city.slug, file: `sehirler/${city.slug}.json`, researched: r.file.researched });
    await writeFile("sehirler/index.json", JSON.stringify(index, null, 2) + "\n");
    const md = report(r); await writeFile("sehir-raporu.md", md + "\n"); console.log(md);
    if (process.env.GITHUB_OUTPUT) await writeFile(process.env.GITHUB_OUTPUT, `sehir=${city.name}\nslug=${city.slug}\n`, { flag: "a" });
    if (process.env.GITHUB_STEP_SUMMARY) await writeFile(process.env.GITHUB_STEP_SUMMARY, md + "\n", { flag: "a" });
  })().catch((e) => { console.error("HATA:", e.message); process.exit(1); });
}
