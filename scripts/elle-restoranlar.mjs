// Kullanıcının kendi seçtiği restoranları (data/elle-restoranlar.json) Google Maps'te bulur ve data/restoranlar.json'a
// KİLİTLİ olarak yazar (restoran robotu kilitli kayda dokunmaz). Apify: compass/crawler-google-places, yer başına ~0,0065 $.
// Kişi başı fiyat: Google kullanıcılarının bildirdiği aralığın ortası (diğer şehirlerle aynı yöntem);
// Google fiyat vermezse ayardaki yedek_fiyat (menü/yorum araştırması) "tahmini" olarak kullanılır.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { runActor, apifyUsage, nameScore } from "./otel-fiyatlari.mjs";
import { MAPS_ACTOR, COST_PER_PLACE, fetchFx, toCandidate } from "./restoranlar.mjs";

const num = (x) => typeof x === "number" && Number.isFinite(x);
export const levelOf = (eur) => (eur <= 15 ? "uygun" : eur >= 60 ? "luks" : "populer");

export function lookupInput(items) {
  return { searchStringsArray: items.map((x) => x.arama), maxCrawledPlacesPerSearch: 1, language: "en", skipClosedPlaces: false, scrapePlaceDetailPage: true, maxReviews: 0, maxImages: 0, maxQuestions: 0 };
}

// Ayardaki bir giriş + Google satırı -> restoranlar.json kaydı
export function toRecord(item, row, city, fx) {
  const c = row ? toCandidate(row, city, fx) : null;
  const sc = c ? Math.max(nameScore(item.ad, c.ad), nameScore(item.arama, c.ad)) : 0;
  const found = c && sc >= 0.5;
  const google = found && num(c.kisiBasiEur);
  const eur = google ? c.kisiBasiEur : item.yedek_fiyat;
  if (!num(eur)) return { hata: `${item.ad}: Google'da fiyat yok, yedek_fiyat da yazılmamış` };
  const rec = {
    id: found ? c.id : "elle-" + item.ad.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
    ad: item.ad, googleAd: found ? c.ad : null, mutfak: found ? c.mutfak : null, mutfakTr: item.tur || (found ? c.mutfakTr : null),
    puan: found ? c.puan : null, yorum: found ? c.yorum : 0,
    fiyatYazi: google ? c.fiyatYazi : `~${eur} €`, kisiBasiEur: eur, fiyatKaynagi: google ? "google" : "tahmini", artiFiyat: google ? c.artiFiyat : false,
    semt: found ? c.semt : null, konum: found ? c.konum : null, url: found ? c.url : null, web: found ? c.web : null, rezervasyon: found ? c.rezervasyon : null,
    seviye: item.seviye || levelOf(eur), kilit: true, elle: true, not: item.not || null,
  };
  if (found && c.kapali) rec.kapali = true;
  const uyari = !found ? `${item.ad}: Google Maps'te güvenle eşleşmedi${c ? ` (bulunan: "${c.ad}")` : ""}, konum/puan boş, fiyat tahmini` : !google ? `${item.ad}: Google fiyat aralığı yok, yedek fiyat (${eur} €) kullanıldı` : null;
  return { rec, uyari };
}

export function applyCity(state, sehir, conf, recs, t) {
  const old = state.sehirler[sehir] || {};
  const order = { uygun: 0, populer: 1, luks: 2 };
  const list = recs.slice().sort((a, b) => order[a.seviye] - order[b.seviye] || a.kisiBasiEur - b.kisiBasiEur);
  state.sehirler[sehir] = { ...old, guncellendi: t, restoranlar: list, sadeceElle: !!conf.sadece_elle, elleKaynak: conf.kaynak || null };
  return state;
}

export async function run({ token, cfg, rcfg, state, only = null, fetchImpl = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), now = new Date() }) {
  if (!token) throw new Error("APIFY_TOKEN tanımlı değil");
  state = structuredClone(state);
  const t = now.toISOString(), fx = await fetchFx(rcfg, fetchImpl), report = { sehir: 0, yer: 0, google: 0, uyarilar: [], hatalar: [] };
  const usage = await apifyUsage({ token, fetchImpl });
  for (const [sehir, conf] of Object.entries(cfg.sehirler)) {
    if (only && !only.includes(sehir)) continue;
    const city = rcfg.sehirler.find((c) => c.sehir === sehir) || { sehir, para: "EUR" };
    const items = conf.restoranlar || [];
    if (usage && usage.sinir && usage.usd + items.length * COST_PER_PLACE > usage.sinir) { report.hatalar.push(`${sehir}: Apify aylık sınırı`); continue; }
    const rows = await runActor(lookupInput(items), { token, fetchImpl, sleep, actor: MAPS_ACTOR, maxPolls: 60 });
    const by = new Map(); for (const r of rows || []) if (r && r.searchString && !by.has(r.searchString)) by.set(r.searchString, r);
    const recs = [];
    for (const it of items) {
      const { rec, uyari, hata } = toRecord(it, by.get(it.arama), city, fx);
      if (hata) { report.hatalar.push(hata); continue; }
      recs.push(rec); report.yer++; if (rec.fiyatKaynagi === "google") report.google++; if (uyari) report.uyarilar.push(uyari);
    }
    if (recs.length) { applyCity(state, sehir, conf, recs, t); report.sehir++; }
    report.tablo = (report.tablo || []).concat(recs.map((r) => `| ${sehir} | ${r.ad} | ${r.seviye} | ${r.kisiBasiEur} € | ${r.fiyatYazi} | ${r.fiyatKaynagi} | ${r.puan ?? ""} | ${r.yorum || ""} |`));
  }
  return { state, report };
}

async function readJson(p, f) { try { return JSON.parse(await readFile(p, "utf8")); } catch (e) { if (e.code === "ENOENT" && f !== undefined) return f; throw e; } }

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL("..", import.meta.url));
  (async () => {
    const cfg = await readJson(root + "data/elle-restoranlar.json"), rcfg = await readJson(root + "data/restoran-ayarlari.json");
    const state = await readJson(root + "data/restoranlar.json");
    const only = (process.env.SEHIR || "").split(",").map((s) => s.trim()).filter(Boolean);
    const { state: out, report } = await run({ token: process.env.APIFY_TOKEN, cfg, rcfg, state, only: only.length ? only : null });
    const md = ["# Elle seçilen restoranlar", "", `Şehir: ${report.sehir}, restoran: ${report.yer}, Google fiyatlı: ${report.google}.`, "",
      "| Şehir | Restoran | Seviye | Kişi başı | Fiyat yazısı | Kaynak | Puan | Yorum |", "| --- | --- | --- | --- | --- | --- | --- | --- |", ...(report.tablo || []),
      ...(report.uyarilar.length ? ["", "Kontrol et:", ...report.uyarilar.map((x) => "- " + x)] : []), ...(report.hatalar.length ? ["", "Hatalar:", ...report.hatalar.map((x) => "- " + x)] : [])].join("\n");
    console.log(md);
    if (process.env.GITHUB_STEP_SUMMARY) await writeFile(process.env.GITHUB_STEP_SUMMARY, md + "\n", { flag: "a" });
    await writeFile(root + "data/elle-restoran-rapor.md", md + "\n");
    await writeFile(root + "data/restoranlar.json", JSON.stringify(out, null, 1) + "\n");
  })().catch((e) => { console.error("HATA:", String(e.message).split(process.env.APIFY_TOKEN || "§").join("***")); process.exit(1); });
}
