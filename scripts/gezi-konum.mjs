// Gezi yerlerinin konumunu Google Maps'ten bulur (Apify: compass/crawler-google-places), data/gezi.json'a yazar.
// Her yerin "arama" metniyle tek sonuç ister. Sonuç şehir merkezinden çok uzaksa ya da adı uyuşmazsa konum yazılmaz,
// "konumNotu" alanına neden yazılır. Kalıcı kapanmış yerleri işaretler. Bütçe: Apify sayacı (diğer robotlarla ortak).
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { runActor, apifyUsage, makeBudget, measureCost, istanbulToday, billingPeriod, nameScore } from "./otel-fiyatlari.mjs";

export const ACTOR = "compass~crawler-google-places";
export const COST_PER_PLACE = 0.0045;
const num = (x) => typeof x === "number" && Number.isFinite(x);
const toRad = (d) => (d * Math.PI) / 180;
export function km(a, b) {
  const R = 6371, dLat = toRad(b[0] - a[0]), dLon = toRad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function geoInput(places) {
  return { searchStringsArray: places.map((p) => p.arama), maxCrawledPlacesPerSearch: 1, language: "en", skipClosedPlaces: false, scrapePlaceDetailPage: false, maxReviews: 0, maxImages: 0, maxQuestions: 0 };
}

// Sonuç satırını yere uygular. maxKm: şehir merkezinden en fazla uzaklık.
export function applyRow(p, r, center, maxKm = 25) {
  if (!r || !r.location || !num(r.location.lat)) return { ...p, konumNotu: "Google sonuç vermedi" };
  const k = [Math.round(r.location.lat * 1e5) / 1e5, Math.round(r.location.lng * 1e5) / 1e5];
  const d = center ? km(center, k) : 0;
  if (d > maxKm) return { ...p, konum: null, konumNotu: `Google ${Math.round(d)} km uzakta bir yer buldu: ${r.title}` };
  const sc = Math.max(nameScore(p.arama, r.title), nameScore(p.ad, r.title));
  const out = { ...p, konum: k, googleAd: r.title || null, puan: num(r.totalScore) ? r.totalScore : null, yorum: num(r.reviewsCount) ? r.reviewsCount : null, harita: r.url || null };
  if (sc < 0.34) out.konumNotu = `Ad uyuşmuyor olabilir: Google "${r.title}" buldu`; else delete out.konumNotu;
  if (r.permanentlyClosed) out.kapali = "kalici"; else if (r.temporarilyClosed) out.kapali = "gecici"; else delete out.kapali;
  return out;
}

export async function run({ token, data, centers, hotelSettings = {}, only = null, all = false, now = new Date(), fetchImpl = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  if (!token) throw new Error("APIFY_TOKEN tanımlı değil");
  data = structuredClone(data);
  const donem = billingPeriod(istanbulToday(now), hotelSettings.fatura_gunu || 1);
  data.harcama = data.harcama && data.harcama.donem === donem ? data.harcama : { donem, usd: 0 };
  const usage = await apifyUsage({ token, fetchImpl });
  const B = makeBudget(data, hotelSettings.aylik_butce_usd, usage);
  const report = { sehir: 0, yer: 0, bulunan: 0, notlu: [], hatalar: [] };
  let places = 0;
  for (const [sehir, c] of Object.entries(data.sehirler)) {
    if (only && !only.includes(sehir)) continue;
    const todo = c.yerler.filter((p) => all || !p.konum);
    if (!todo.length) continue;
    const est = todo.length * COST_PER_PLACE;
    if (!B.reserve(est)) { report.hatalar.push(`${sehir}: bütçe sınırı`); continue; }
    let rows = [];
    try { rows = await runActor(geoInput(todo), { token, fetchImpl, sleep, actor: ACTOR, maxPolls: 60 }); }
    catch (e) { B.release(est); const m = String(e.message).split(token).join("***"); if (e.fatal) throw new Error(m); report.hatalar.push(`${sehir}: ${m}`); continue; }
    B.release(est); B.spend(rows.length * COST_PER_PLACE); places += rows.length;
    const bySearch = new Map(); for (const r of rows) if (r && r.searchString && !bySearch.has(r.searchString)) bySearch.set(r.searchString, r);
    const center = (centers || {})[sehir];
    c.yerler = c.yerler.map((p) => {
      if (!todo.includes(p)) return p;
      const q = applyRow(p, bySearch.get(p.arama), center);
      report.yer++; if (q.konum) report.bulunan++; if (q.konumNotu || q.kapali) report.notlu.push(`${sehir} / ${p.ad}: ${q.konumNotu || "kapalı (" + q.kapali + ")"}`);
      return q;
    });
    report.sehir++;
  }
  data.harcama.usd = Math.round(data.harcama.usd * 100) / 100;
  report.gercekMaliyet = await measureCost({ token, fetchImpl, sleep, before: usage, holder: data, robot: "gezi-konum", queries: places, t: now.toISOString() });
  return { data, report };
}

async function readJson(p, f) { try { return JSON.parse(await readFile(p, "utf8")); } catch (e) { if (e.code === "ENOENT" && f !== undefined) return f; throw e; } }

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL("..", import.meta.url));
  (async () => {
    const data = await readJson(root + "data/gezi.json"), hotels = await readJson(root + "data/hotels.json", { ayarlar: {} });
    const rc = await readJson(root + "data/restoran-ayarlari.json", { sehirler: [] });
    const centers = Object.fromEntries(rc.sehirler.map((c) => [c.sehir, c.merkez]));
    const only = (process.env.SEHIR || "").split(",").map((s) => s.trim()).filter(Boolean);
    const { data: out, report } = await run({ token: process.env.APIFY_TOKEN, data, centers, hotelSettings: hotels.ayarlar, only: only.length ? only : null, all: process.env.HEPSI === "1" });
    const md = [`# Gezi konumları`, "", `Şehir: ${report.sehir}, yer: ${report.yer}, konumu bulunan: ${report.bulunan}. Apify sayacına göre maliyet: ${report.gercekMaliyet ?? "?"} $.`, "", ...(report.notlu.length ? ["Kontrol edilmesi gerekenler:", ...report.notlu.map((x) => "- " + x)] : []), ...(report.hatalar.length ? ["", "Hatalar:", ...report.hatalar.map((x) => "- " + x)] : [])].join("\n");
    console.log(md);
    if (process.env.GITHUB_STEP_SUMMARY) await writeFile(process.env.GITHUB_STEP_SUMMARY, md + "\n", { flag: "a" });
    await writeFile(root + "data/gezi.json", JSON.stringify(out, null, 1) + "\n");
  })().catch((e) => { console.error("HATA:", String(e.message).split(process.env.APIFY_TOKEN || "§").join("***")); process.exit(1); });
}
