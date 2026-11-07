// DENEME: eiv/google-flights-scraper (uçuş başına ücret) ile mevcut robotun (dz_omar, arama başına ~0,028 $) karşılaştırması.
// 26 şehir × 2 hafta sonu, Cuma 05–12 gidiş / Pazar 16–24 dönüş, fiyata göre sıralı ilk 5 uçuş + ücretsiz özet satırı.
// Gerçek maliyet Apify sayacından ölçülür. Sonuç: data/ucak-deneme.json (karşılaştırma + ham örnek satırlar).
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { runActor, apifyUsage } from "./otel-fiyatlari.mjs";

const ACTOR = "eiv~google-flights-scraper";
const root = fileURLToPath(new URL("..", import.meta.url));
const token = process.env.APIFY_TOKEN;
const cfg = JSON.parse(await readFile(root + "data/ucus-ayarlari.json", "utf8"));
const eski = JSON.parse(await readFile(root + "data/ucuslar.json", "utf8"));
const WEEKENDS = [["2026-11-13", "2026-11-15"], ["2026-11-20", "2026-11-22"]];
const searches = [];
for (const [g, c] of WEEKENDS) for (const s of cfg.sehirler) searches.push({ sehir: s.sehir, giris: g, line: `${cfg.kalkis.join(",")}-${s.havalimani.join(",")} ${g} ${c}` });
const input = {
  searches: searches.map((x) => x.line), adults: 1, cabinClass: "economy", currency: "EUR", market: "TR", language: "en",
  departureTimeRange: cfg.gidis_saat, returnDepartureTimeRange: cfg.donus_saat,
  sortBy: "price", maxResultsPerSearch: 5, maxItems: 400, includePriceInsights: true, includeSearchSummary: true, maxConcurrency: 5,
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const once = async (f) => { try { return await f(); } catch (e) { return { hata: String(e.message).split(token || "§").join("***") }; } };
const before = await apifyUsage({ token });
const t0 = Date.now();
const rows = await runActor(input, { token, sleep, actor: ACTOR, maxPolls: 120 });
const sure = Math.round((Date.now() - t0) / 1000);
await sleep(90000);
const after = await apifyUsage({ token });
const usd = before && after ? Math.round((after.usd - before.usd) * 1000) / 1000 : null;

// satırları aramalara eşle (alan adları bilinmediği için birkaç olası alana bak)
const keyOf = (r) => r.searchQuery || r.search || r.query || r.searchLine || r.input || r.route || null;
const kinds = {}; for (const r of rows) { const k = r.type || r.rowType || r.kind || "flight"; kinds[k] = (kinds[k] || 0) + 1; }
const out = { tarih: new Date().toISOString(), aktor: ACTOR, arama: searches.length, satir: rows.length, turler: kinds, sureSn: sure, olculenUsd: usd,
  aramaBasiUsd: usd != null ? Math.round((usd / searches.length) * 100000) / 100000 : null, eskiAramaBasiUsd: 0.028,
  alanlar: [...new Set(rows.flatMap((r) => Object.keys(r)))].slice(0, 120), ornek: rows.slice(0, 6), karsilastirma: [] };
for (const s of searches) {
  const mine = rows.filter((r) => { const k = keyOf(r); return k ? String(k).includes(s.line.split(" ")[0]) && String(k).includes(s.giris) : false; });
  const fl = mine.filter((r) => typeof r.price === "number");
  const sum = mine.find((r) => /summary/i.test(String(r.type || r.rowType || r.kind || "")));
  const e = ((eski.haftaSonlari[s.giris] || {}).sehirler || {})[s.sehir];
  out.karsilastirma.push({ sehir: s.sehir, giris: s.giris, eski: e && e.son ? e.son.fiyat : null, eskiAktarmasiz: e && e.son && e.son.aktarmasiz ? e.son.aktarmasiz.fiyat : null,
    yeni: fl.length ? Math.min(...fl.map((r) => r.price)) : null, yeniUcus: fl.length, ozet: sum ? Object.fromEntries(Object.entries(sum).filter(([k]) => !/history|histor/i.test(k)).slice(0, 25)) : null });
}
await writeFile(root + "data/ucak-deneme.json", JSON.stringify(out, null, 1) + "\n");
console.log(JSON.stringify({ arama: out.arama, satir: out.satir, turler: kinds, usd, aramaBasi: out.aramaBasiUsd, sure }, null, 1));
