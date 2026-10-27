// İÇERİK ROBOTU
// Her hafta uygulamanın verisinden 4 Shorts senaryo taslağı yazar (Can ve Nehir, üç seri).
// Rakamları yapay zekâ HESAPLAMAZ: uygulamanın formülüyle burada hesaplanır ve "bilgi kartı" olarak verilir.
// Taslakta bilgi kartında olmayan bir rakam geçerse taslak reddedilir ve bir kez düzelttirilir;
// yine geçerse rapora "kontrol et" uyarısı düşer. Sonuç GitHub'da bir "issue" olarak açılır (e-postana da gelir).
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { ask, Meter, MODELS, parseJson, digits, hasKey } from "./lib/claude.mjs";
import { loadCities } from "./lib/sehirler.mjs";
import { cost, withResearch, readJsonFile, DEFAULTS } from "./lib/hesap.mjs";

export const MAX_USD = Number(process.env.ICERIK_MAX_USD || 0.6);
export const POZLAR = ["Can şaşırmış", "Can cüzdanına bakıyor", "Can heyecanlı", "Nehir haklı çıkmış gülümsüyor", "Nehir telefondan fiyat gösteriyor", "Nehir kollarını kavuşturmuş", "İkisi birlikte kadeh/kahve kaldırıyor", "İkisi valizle yürüyor"];
const PRIORITY = ["Budapeşte", "Prag", "Atina", "Lizbon", "Sofya", "Belgrad", "Roma", "Viyana", "Paris", "Londra", "Berlin", "Madrid", "Amsterdam", "Varşova"];

const round100 = (n) => Math.round(n / 100) * 100;
const fmt = (n) => new Intl.NumberFormat("tr-TR").format(n);
export function isoWeek(d = new Date()) { const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day); const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return Math.ceil(((t - y) / 86400000 + 1) / 7); }

export function cityCard(c, rate, flights) {
  const k = cost(c, DEFAULTS);
  const fl = flights && flights.cities && flights.cities[c.name];
  return {
    sehir: c.name, ulke: c.country, durum: c.s === "res" ? "araştırıldı" : "uygulama tahmini",
    toplam_tl: round100(k.sum * rate), kisi_basi_tl: round100(k.sum * rate / 2),
    otel_tl: round100(k.hotel * rate), yemek_tl: round100((k.food + k.resto) * rate), ulasim_tl: round100(k.trans * rate), gezi_tl: round100(k.act * rate),
    otel_adi: c.hotels && c.hotels[1] && c.hotels[1].name ? c.hotels[1].name : null,
    ucak_kisi_basi_tl: fl && fl.minEur != null ? round100(fl.minEur * rate) : null,
    ucak_tarih: fl && fl.best ? `${fl.best.dep} → ${fl.best.ret}` : null,
  };
}

export function pickWeek(cities, week) {
  const order = [...cities].sort((a, b) => (b.s === "res") - (a.s === "res") || (PRIORITY.indexOf(a.name) + 99) % 99 - (PRIORITY.indexOf(b.name) + 99) % 99);
  const pool = order.slice(0, Math.max(6, order.filter((c) => c.s === "res").length + 4));
  const at = (i) => pool[(week * 2 + i) % pool.length];
  const s1 = [at(0), at(1)];
  const others = cities.filter((c) => !s1.includes(c));
  const a = others[(week * 3) % others.length];
  const b = others.filter((c) => c !== a && c.region === a.region)[week % Math.max(1, others.filter((c) => c !== a && c.region === a.region).length)] || others[(week * 3 + 5) % others.length];
  return { s1, s2: [a, b] };
}

// 3. seri için bir "orada ne eder" kalemi: resmî bilet fiyatı ya da araştırılmış ulaşım bileti
export function pickItem(prices, cityFiles, data, week) {
  const items = [];
  for (const [k, i] of Object.entries((prices && prices.items) || {})) {
    if (i.tier === "ikincil") continue;
    const eur = i.currency === "Ft" || i.currency === "HUF" ? i.value / data.eurHuf : i.currency === "EUR" || i.currency === "€" ? i.value : null;
    if (eur) items.push({ sehir: "Budapeşte", kalem: i.label, yerel: `${fmt(i.value)} ${i.currency}`, tl: Math.round(eur * data.eurTry), kaynak: i.source });
  }
  for (const f of cityFiles) for (const t of (f && f.transport) || []) {
    if (String(t.currency).toUpperCase() === "EUR") items.push({ sehir: f.city, kalem: t.label, yerel: `${t.value} €`, tl: Math.round(t.value * data.eurTry), kaynak: t.source });
  }
  return items.length ? items[week % items.length] : null;
}

export function allowedNumbers(facts) {
  const set = new Set(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "24", "48", "72", "2026", "2027"]);
  const walk = (v) => { if (v == null) return; if (typeof v === "number") { set.add(digits(Math.round(v))); set.add(digits(fmt(v))); } else if (typeof v === "string") for (const m of v.match(/\d[\d.,\s]*\d|\d/g) || []) set.add(digits(m)); else if (typeof v === "object") Object.values(v).forEach(walk); };
  walk(facts);
  return set;
}

export function checkNumbers(drafts, allowed) {
  const bad = [];
  for (const v of drafts.videolar || []) {
    const texts = [v.baslik, v.kanca, v.kapanis, ...(v.sahneler || []).flatMap((s) => [s.metin, s.ekran])];
    for (const t of texts) for (const m of String(t || "").match(/\d[\d.,]*\d|\d/g) || []) { const d = digits(m); if (!allowed.has(d)) bad.push(`"${m}" (${v.baslik})`); }
  }
  return bad;
}

const SYSTEM = `Sen 72h Getaway YouTube kanalının senaristisin. Kanalın yüzü çizgi karakter bir çift: Can (takım elbiseli, hesapçı, biraz telaşlı) ve Nehir (siyah elbiseli, uzun dalgalı saçlı, pratik, genelde haklı çıkan).
Vaat: "Gitmeden önce bil: bu şehir sana 3 gecede kaça patlar?" Ton: samimi, esprili, Türkçe, kısa cümleler.
Kesin kurallar:
- Rakam olarak YALNIZCA bilgi kartındaki değerleri kullan. Kendin hesap yapma, yuvarlama yapma, yeni rakam üretme.
- "Gittik, harcadık" deme; karakterler kurgusal, bilgi uygulamadan geliyor. "Tahmini" durumdaki şehirlerde "yaklaşık" de.
- Uçak fiyatı ayrı söylenir, toplam bütçeye ekleme.
- Her video 30-50 saniye, ilk sahne en fazla 2 saniye ve doğrudan rakamla açılır.
- Görsel tarifinde karakter pozlarını yalnızca şu listeden seç: ${POZLAR.join("; ")}.
- Cevap olarak yalnızca istenen JSON'u ver.`;

export function buildPrompt(facts) {
  return `Bu haftanın bilgi kartı:\n${JSON.stringify(facts, null, 1)}\n\n4 video yaz:\n- 2 adet Seri 1 "3 Gece Kaça Patlar?": seri1_sehirler'deki her şehir için bir video. Kanca: toplam rakam. Sonra otel, yemek, ulaşım, gezi; en sonda uçak ayrıca.\n- 1 adet Seri 2 "Hangisi Daha Ucuz?": seri2_karsilastirma'daki iki şehir. Can birini, Nehir diğerini savunur, rakamlar kazananı belirler.\n- 1 adet Seri 3 "Orada Ne Eder?": seri3_kalem'deki kalemin TL karşılığı. Kalem yoksa Seri 1 formatında seri2'nin ilk şehrini yaz.\n\nJSON:\n{"videolar":[{"seri":1,"baslik":"(YouTube başlığı, en fazla 60 karakter, Can/Nehir isimleri başlıkta geçmez)","kanca":"ilk 2 saniyedeki ekran yazısı","sahneler":[{"sn":2,"gorsel":"poz + arka plan","konusan":"Can|Nehir|Anlatıcı","metin":"söylenecek cümle","ekran":"ekran yazısı"}],"kapanis":"son cümle + abone çağrısı"}]}`;
}

export function toMarkdown(drafts, facts, warnings, meter, dateStr) {
  const L = [`Bu hafta için 4 Shorts taslağı (${dateStr}). Rakamlar uygulamadan, uygulamanın varsayılan ayarlarıyla (2 kişi, 3 gece, orta otel, gezi dahil, uçak hariç) hesaplandı. Kur: 1 € = ${facts.kur_eur_tl} TL.`, ""];
  if (warnings.length) L.push("> ⚠️ **Kontrol et:** taslakta bilgi kartında olmayan rakamlar var: " + warnings.join(", "), "");
  (drafts.videolar || []).forEach((v, i) => {
    L.push(`## ${i + 1}. ${v.baslik}`, "", `Seri ${v.seri} · Kanca: **${v.kanca}**`, "", "| Sn | Görsel | Konuşan | Metin | Ekran yazısı |", "| --- | --- | --- | --- | --- |");
    for (const s of v.sahneler || []) L.push(`| ${s.sn} | ${s.gorsel} | ${s.konusan} | ${String(s.metin).replace(/\|/g, "/")} | ${String(s.ekran || "").replace(/\|/g, "/")} |`);
    L.push("", `Kapanış: ${v.kapanis}`, "");
  });
  L.push("---", "Yayından önce: YouTube'da \"değiştirilmiş ya da yapay içerik\" bildirimini işaretle. Açıklamaya uygulama bağlantısını ve \"rakamlar tahminidir, uçak hariç\" notunu ekle.", "", `<details><summary>Bilgi kartı (robotun kullandığı veri)</summary>\n\n\`\`\`json\n${JSON.stringify(facts, null, 1)}\n\`\`\`\n</details>`, "", `Maliyet: ${meter.summary()}`);
  return L.join("\n");
}

export async function buildFacts({ now = new Date() } = {}) {
  const html = await readFile("index.html", "utf8");
  const data = await readJsonFile("data.json", null);
  const flights = await readJsonFile("flights.json", null);
  const prices = await readJsonFile("prices.json", null);
  const idx = await readJsonFile("sehirler/index.json", { sehirler: [] });
  const cityFiles = await Promise.all((idx.sehirler || []).map((e) => readJsonFile(e.file, null)));
  const cities = await withResearch(await loadCities(), { html, readJson: readJsonFile });
  const week = isoWeek(now), { s1, s2 } = pickWeek(cities, week), rate = data.eurTry;
  return {
    hafta: week, kur_eur_tl: rate, kur_tarihi: data.updated,
    seri1_sehirler: s1.map((c) => cityCard(c, rate, flights)),
    seri2_karsilastirma: s2.map((c) => cityCard(c, rate, flights)),
    seri3_kalem: pickItem(prices, cityFiles.filter(Boolean), data, week),
  };
}

export async function run({ facts, apiFetch = fetch }) {
  const meter = new Meter(MAX_USD), allowed = allowedNumbers(facts);
  let r = await ask({ model: MODELS.orta, system: SYSTEM, prompt: buildPrompt(facts), maxTokens: 5000, meter, fetchImpl: apiFetch });
  let drafts = parseJson(r.text), bad = checkNumbers(drafts, allowed);
  if (bad.length) {
    const msgs = [{ role: "user", content: buildPrompt(facts) }, { role: "assistant", content: r.text }, { role: "user", content: `Bu rakamlar bilgi kartında yok: ${bad.join(", ")}. Onları kaldır ya da bilgi kartındaki değerle değiştir. JSON'un tamamını yeniden ver.` }];
    r = await ask({ model: MODELS.orta, system: SYSTEM, messages: msgs, maxTokens: 5000, meter, fetchImpl: apiFetch });
    drafts = parseJson(r.text); bad = checkNumbers(drafts, allowed);
  }
  return { drafts, warnings: bad, meter };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  (async () => {
    if (!hasKey()) { console.log("ANTHROPIC_API_KEY yok: içerik robotu atlandı (kurulum tamamlanınca çalışacak)."); return; }
    const facts = await buildFacts();
    const r = await run({ facts });
    const md = toMarkdown(r.drafts, facts, r.warnings, r.meter, new Date().toISOString().slice(0, 10));
    await writeFile("icerik-taslak.md", md + "\n"); console.log(md);
    if (process.env.GITHUB_STEP_SUMMARY) await writeFile(process.env.GITHUB_STEP_SUMMARY, md + "\n", { flag: "a" });
  })().catch((e) => { console.error("HATA:", e.message); process.exit(1); });
}
