#!/usr/bin/env node
// Şehir sayfaları üreticisi: robotların verisinden her takip edilen şehir için statik /sehir/<slug>/index.html,
// /sehir/index.html (tüm şehirler) ve sitemap.xml yazar. Node 22, bağımlılık yok.
// Çalıştırma: node scripts/sehir-sayfalari.mjs   (BUGUN=2026-10-31 ile tarih sabitlenebilir)
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SITE = "https://72hgetaway.com";
const KAT_SIRA = ["ikonik", "pahali", "konforlu", "ucuz"];
const KAT_AD = { ikonik: "İkonik", pahali: "Pahalı", konforlu: "Konforlu", ucuz: "Ucuz" };
const SEVIYE_AD = { uygun: "Uygun", populer: "Popüler", luks: "Lüks" };
const SEVIYE_SIRA = { uygun: 0, populer: 1, luks: 2 };
const UZAK_HAFTA = 8; // "önümüzdeki 8 hafta sonu"

// ---------- küçük yardımcılar ----------
const TR_HARF = { "ç": "c", "Ç": "c", "ğ": "g", "Ğ": "g", "ı": "i", "I": "i", "İ": "i", "ö": "o", "Ö": "o", "ş": "s", "Ş": "s", "ü": "u", "Ü": "u" };
export function slugify(s) {
  return String(s ?? "")
    .replace(/[çÇğĞıIİöÖşŞüÜ]/g, (c) => TR_HARF[c])
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]+/g, "")
    .replace(/-+/g, "-").replace(/^-|-$/g, "");
}
const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export function esc(s) { return String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]); }
export function jsonLd(obj) { return JSON.stringify(obj).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026"); }

export function todayIstanbul(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(now);
}
const nf = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 });
export function fmtEur(n) { return nf.format(Math.round(n)) + " €"; }
export function fmtEurKurus(n) { return nf2.format(Math.round(n * 100) / 100) + " €"; }
export function fmtTl(eur, kur) { return kur > 0 ? nf.format(Math.round((eur * kur) / 100) * 100) + " TL" : null; }
/** "12.300 TL (220 €)" ya da kur yoksa "220 €" */
export function para(eur, kur, kurus = false) {
  const e = kurus ? fmtEurKurus(eur) : fmtEur(eur);
  const t = fmtTl(eur, kur);
  return t ? `${t} <span class="eur">(${e})</span>` : e;
}
/** Türkçe yönelme eki: Paris'e, Roma'ya, Budapeşte'ye, Prag'a. */
const EK_ISTISNA = { "Stokholm": "Stokholm'e" };
export function yonelme(ad) {
  const s = String(ad ?? "");
  if (EK_ISTISNA[s]) return EK_ISTISNA[s];
  const unluler = s.toLocaleLowerCase("tr").match(/[aeıioöuü]/g);
  const son = unluler ? unluler[unluler.length - 1] : "e";
  const ek = "aıou".includes(son) ? "a" : "e";
  return s + "'" + (/[aeıioöuü]$/i.test(s.toLocaleLowerCase("tr")) ? "y" : "") + ek;
}
function day(s) { return new Date(s + "T00:00:00Z"); }
function plus2(g) { const d = day(g); d.setUTCDate(d.getUTCDate() + 2); return d.toISOString().slice(0, 10); }
const fGun = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", timeZone: "UTC" });
const fGunYil = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const fKisa = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", timeZone: "UTC" });
export function aralik(g, c) {
  const a = day(g), b = day(c);
  if (a.getUTCMonth() === b.getUTCMonth()) return a.getUTCDate() + "–" + fGun.format(b);
  return fGun.format(a) + " – " + fGun.format(b);
}
function aralikKisa(g, c) {
  const a = day(g), b = day(c);
  if (a.getUTCMonth() === b.getUTCMonth()) return a.getUTCDate() + "–" + fKisa.format(b);
  return fKisa.format(a) + " – " + fKisa.format(b);
}
function tarihYazi(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d)) return null;
  return fGunYil.format(day(todayIstanbul(d)));
}

// ---------- veri ----------
export function usableHotel(s) { return !!s && s.durum === "fiyat" && !s.supheli && typeof s.fiyat === "number" && s.fiyat > 0; }
export function usableFlight(s) { return !!s && s.durum === "fiyat" && !s.supheli && typeof s.fiyat === "number" && s.fiyat > 0; }
function nightly(s) { return typeof s.gecelik === "number" && s.gecelik > 0 ? s.gecelik : s.fiyat / 2; }

function readJson(path, fallback) {
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return fallback; }
}
/** Sitenin kökünden tüm veriyi okur; eksik/bozuk dosyalar boş kabul edilir. */
export function loadData(root) {
  const hotels = readJson(join(root, "data/hotels.json"), { sehirler: [] });
  const meta = readJson(join(root, "data/otel-fiyatlari.json"), {});
  const fiyatlar = {};
  for (const c of hotels.sehirler || []) {
    const rel = (meta.sehirler && meta.sehirler[c.sehir]) || `data/fiyatlar/${slugify(c.sehir)}.json`;
    fiyatlar[c.sehir] = readJson(join(root, rel), null);
  }
  return {
    hotels,
    fiyatlar,
    ucuslar: readJson(join(root, "data/ucuslar.json"), {}),
    restoranlar: readJson(join(root, "data/restoranlar.json"), {}),
    gezi: readJson(join(root, "data/gezi.json"), {}),
    kur: readJson(join(root, "data.json"), {}),
  };
}

/** Yerel para biriminden euroya. Bilinmeyen para birimi: null. */
export function toEur(n, para, kur) {
  if (typeof n !== "number") return null;
  if (!para || para === "EUR") return n;
  if (para === "HUF" && kur.eurHuf > 0) return n / kur.eurHuf;
  const r = kur.kurlar && kur.kurlar[para];
  return r > 0 ? n / r : null;
}

const MUTFAK = {
  "restaurant": "Restoran", "fine dining": "Fine dining", "italian": "İtalyan", "hamburger": "Hamburger", "pizza": "Pizza",
  "asian": "Asya", "french": "Fransız", "haute french": "Fransız (gurme)", "japanese": "Japon", "breakfast": "Kahvaltı",
  "brunch": "Brunch", "chinese": "Çin", "chinese noodle": "Çin eriştesi", "indian": "Hint", "belgian": "Belçika",
  "barbecue": "Barbekü", "lebanese": "Lübnan", "mexican": "Meksika", "vietnamese": "Vietnam", "portuguese": "Portekiz",
  "steak house": "Steakhouse", "bistro": "Bistro", "scandinavian": "İskandinav", "danish": "Danimarka", "vegan": "Vegan",
  "asian fusion": "Asya füzyon", "hungarian": "Macar", "vegetarian": "Vejetaryen", "spanish": "İspanyol",
  "middle eastern": "Orta Doğu", "irish": "İrlanda", "falafel": "Falafel", "tapas": "Tapas", "modern european": "Modern Avrupa",
  "sandwich shop": "Sandviç", "peruvian": "Peru", "doner kebab": "Döner", "austrian": "Avusturya", "roman": "Roma mutfağı",
  "cafe": "Kafe", "fast food": "Fast food", "greek": "Yunan", "seafood": "Deniz ürünleri", "swedish": "İsveç",
  "nepalese": "Nepal", "finnish": "Fin", "ukrainian": "Ukrayna", "eastern european": "Doğu Avrupa", "lithuanian": "Litvanya",
  "polish": "Polonya", "brewpub": "Bira evi", "croatian": "Hırvat", "venezuelan": "Venezuela", "eclectic": "Karma",
  "turkish": "Türk", "bulgarian": "Bulgar", "czech": "Çek", "german": "Alman", "dutch": "Hollanda", "mediterranean": "Akdeniz",
  "thai": "Tay", "korean": "Kore", "sushi": "Suşi", "ramen": "Ramen", "latvian": "Letonya", "estonian": "Estonya",
  "maltese": "Malta", "romanian": "Romen", "slovak": "Slovak", "slovenian": "Sloven", "european": "Avrupa", "gastropub": "Gastropub",
};
export function mutfakTr(r) {
  if (r && typeof r.mutfakTr === "string" && r.mutfakTr.trim()) return r.mutfakTr.trim();
  const raw = String((r && r.mutfak) || "").trim();
  if (!raw) return "Restoran";
  const k = raw.toLowerCase().replace(/\s+restaurant$/, "").trim();
  if (MUTFAK[k]) return MUTFAK[k];
  const stripped = raw.replace(/\s+restaurant$/i, "").trim();
  return stripped || "Restoran";
}

/** Bir şehrin sayfa modeli. Eksik veride ilgili bölüm boş kalır, sayfa yine üretilir. */
export function buildCity(data, cityName, today) {
  const city = (data.hotels.sehirler || []).find((c) => c.sehir === cityName) || { sehir: cityName, oteller: [] };
  const kur = data.kur || {};
  const eurTry = kur.eurTry > 0 ? kur.eurTry : 0;
  const fy = data.fiyatlar[cityName] || {};
  const hs = fy.haftaSonlari || {};
  const uhs = (data.ucuslar && data.ucuslar.haftaSonlari) || {};
  const cikis = (g) => (hs[g] && hs[g].cikis) || (uhs[g] && uhs[g].cikis) || plus2(g);

  const fridays = [...new Set([...Object.keys(hs), ...Object.keys(uhs)])].filter((g) => /^\d{4}-\d{2}-\d{2}$/.test(g) && g >= today).sort();
  const next = fridays.slice(0, UZAK_HAFTA);

  // Otel: hafta sonu başına kategori kategori en ucuz kullanılabilir fiyat
  const hotelAt = (g) => {
    const out = {};
    const w = hs[g];
    if (!w || !w.oteller) return out;
    for (const h of city.oteller || []) {
      const s = w.oteller[h.id] && w.oteller[h.id].son;
      if (!usableHotel(s)) continue;
      const cur = out[h.kategori];
      if (!cur || s.fiyat < cur.toplam) out[h.kategori] = { ad: h.ad, toplam: s.fiyat, gecelik: nightly(s), g, vergi: s.vergi || null };
    }
    return out;
  };
  const flightAt = (g) => {
    const w = uhs[g];
    const s = w && w.sehirler && w.sehirler[cityName] && w.sehirler[cityName].son;
    if (!usableFlight(s)) return null;
    return { g, fiyat: s.fiyat, havayolu: s.havayolu || null, aktarma: typeof s.aktarma === "number" ? s.aktarma : null };
  };
  const perWeek = next.map((g) => {
    const cats = hotelAt(g);
    const vals = Object.values(cats);
    const cheapest = vals.length ? vals.reduce((a, b) => (b.toplam < a.toplam ? b : a)) : null;
    return { g, cikis: cikis(g), cats, cheapest, flight: flightAt(g) };
  });

  const chosen = perWeek.find((w) => w.cheapest) || perWeek.find((w) => w.flight) || null;
  const kategoriler = KAT_SIRA.filter((k) => (city.oteller || []).some((h) => h.kategori === k)).map((k) => {
    let best = null;
    for (const w of perWeek) { const c = w.cats[k]; if (c && (!best || c.gecelik < best.gecelik)) best = { ...c, cikis: w.cikis }; }
    return { kategori: k, ad: KAT_AD[k] || k, buHafta: chosen ? chosen.cats[k] || null : null, enUcuz: best };
  });
  const ucuslar = perWeek.filter((w) => w.flight).map((w) => ({ ...w.flight, cikis: w.cikis }));
  const enUcuzUcus = ucuslar.length ? ucuslar.reduce((a, b) => (b.fiyat < a.fiyat ? b : a)) : null;

  // Hafta sonu kombinasyonu: en ucuz otel (2 gece) + 2 kişi uçak
  let enUcuzKombi = null;
  for (const w of perWeek) {
    if (!w.cheapest || !w.flight) continue;
    const toplam = w.cheapest.toplam + 2 * w.flight.fiyat;
    if (!enUcuzKombi || toplam < enUcuzKombi.toplam) enUcuzKombi = { g: w.g, cikis: w.cikis, otel: w.cheapest, ucus: w.flight, toplam };
  }

  const rs = ((data.restoranlar && data.restoranlar.sehirler && data.restoranlar.sehirler[cityName]) || {}).restoranlar || [];
  const restoranlar = rs.filter((r) => r && r.ad && !r.kapali && r.acik !== false)
    .slice().sort((a, b) => (SEVIYE_SIRA[a.seviye] ?? 9) - (SEVIYE_SIRA[b.seviye] ?? 9))
    .slice(0, 6)
    .map((r) => ({ ad: r.ad, seviye: SEVIYE_AD[r.seviye] || "", kisiBasiEur: typeof r.kisiBasiEur === "number" ? r.kisiBasiEur : null, mutfak: mutfakTr(r), puan: typeof r.puan === "number" ? r.puan : null, url: /^https:\/\//.test(r.url || "") ? r.url : null }));

  const g = (data.gezi && data.gezi.sehirler && data.gezi.sehirler[cityName]) || {};
  const yerler = (g.yerler || []).filter((y) => y && y.ad && !y.kapali).slice(0, 6).map((y) => ({
    ad: y.ad, tur: y.tur || "", eur: y.fiyat === 0 ? 0 : toEur(y.fiyat, g.para, kur),
  }));
  const ul = g.ulasim || {};
  const ulasim = [
    ["tek_bilet", "Tek bilet"], ["gunluk", "Günlük kart"], ["cok_gunluk", null], ["havalimani", "Havalimanı → merkez (tek yön)"],
  ].map(([k, ad]) => {
    const u = ul[k];
    if (!u || typeof u.fiyat !== "number") return null;
    const eur = toEur(u.fiyat, g.para, kur);
    if (eur == null) return null;
    return { ad: ad || `${u.gun || 3} günlük kart`, eur };
  }).filter(Boolean);

  return {
    sehir: cityName, slug: slugify(cityName), ulke: city.ulke || "", eurTry,
    otelGuncel: tarihYazi(fy.guncellendi), ucusGuncel: tarihYazi(data.ucuslar && data.ucuslar.guncellendi),
    secili: chosen ? { g: chosen.g, cikis: chosen.cikis, otel: chosen.cheapest, ucus: chosen.flight } : null,
    kategoriler, ucuslar, enUcuzUcus, enUcuzKombi, restoranlar, yerler, ulasim, today,
  };
}

// ---------- HTML ----------
const CSS = `
:root { color-scheme: light dark; --bg: #FBF6EC; --surface: #FFFFFF; --ink: #0F2A43; --muted: #5B6B7C; --line: #E3DCCB; --accent: #F4A62A; --band: #0F2A43; --chip-ink: #6B4A00; --chip-bg: #FCE9C4; --focus: #0F2A43; --pick: #FFF4D6; --good: #17744C; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #0F2A43; --surface: #153552; --ink: #FBF6EC; --muted: #A9B8C7; --line: #2F506D; --band: #0A1F33; --chip-ink: #FBE3B0; --chip-bg: #5A4313; --focus: #F4A62A; --pick: #3A4A52; --good: #7BD6A6; } }
:root[data-theme="dark"] { --bg: #0F2A43; --surface: #153552; --ink: #FBF6EC; --muted: #A9B8C7; --line: #2F506D; --band: #0A1F33; --chip-ink: #FBE3B0; --chip-bg: #5A4313; --focus: #F4A62A; --pick: #3A4A52; --good: #7BD6A6; }
*, *::before, *::after { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif; line-height: 1.55; padding-bottom: env(safe-area-inset-bottom, 0px); }
:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
header :focus-visible { outline-color: #F4A62A; }
a { color: inherit; }
.wrap { max-width: 1040px; margin: 0 auto; padding: 0 16px; }
header { background: var(--band); color: #FBF6EC; padding: calc(env(safe-area-inset-top, 0px) + 10px) 0 28px; }
.crumbs { display: flex; flex-wrap: wrap; align-items: center; gap: 0 6px; font-size: 0.9rem; margin: 0; padding: 0; list-style: none; }
.crumbs a { display: inline-flex; align-items: center; min-height: 44px; color: #F4A62A; font-weight: 600; text-decoration: none; }
.crumbs a:hover { text-decoration: underline; }
.crumbs li + li::before { content: "›"; color: #D5DEE8; margin-right: 6px; }
.crumbs [aria-current] { color: #D5DEE8; }
header h1 { font-size: clamp(1.5rem, 4.6vw, 2.3rem); margin: 4px 0 8px; letter-spacing: -0.02em; line-height: 1.15; }
header p { margin: 0; color: #D5DEE8; max-width: 64ch; }
.hero { margin-top: 18px; display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
.big { display: inline-flex; align-items: center; justify-content: center; min-height: 52px; padding: 0 24px; border-radius: 999px; background: #F4A62A; color: #0F2A43; font-weight: 800; font-size: 1.05rem; text-decoration: none; }
.big:hover { background: #F7B852; }
.ghost { display: inline-flex; align-items: center; min-height: 44px; padding: 0 16px; border-radius: 999px; border: 1.5px solid rgba(251,246,236,0.4); color: #FBF6EC; font-weight: 600; text-decoration: none; }
.ghost:hover { border-color: #F4A62A; }
main.wrap { padding-top: 26px; padding-bottom: 48px; }
section { margin-top: 34px; }
section:first-child { margin-top: 0; }
h2 { font-size: 1.25rem; margin: 0 0 4px; letter-spacing: -0.01em; }
.lead { color: var(--muted); margin: 0 0 14px; }
.sum { background: var(--pick); border-radius: 16px; padding: 16px 18px; }
.sum .tot { font-size: 1.7rem; font-weight: 800; letter-spacing: -0.02em; line-height: 1.2; }
.sum ul { margin: 8px 0 0; padding-left: 18px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 230px), 1fr)); gap: 12px; }
.card { background: var(--surface); border: 1.5px solid var(--line); border-radius: 16px; padding: 14px 16px; min-width: 0; }
.card h3 { margin: 0 0 4px; font-size: 1rem; }
.card .p { font-size: 1.3rem; font-weight: 800; letter-spacing: -0.01em; }
.card .s, .eur, .muted { color: var(--muted); font-size: 0.88rem; }
.card .p .eur { font-weight: 600; }
.chip { display: inline-block; font-size: 0.74rem; font-weight: 700; background: var(--chip-bg); color: var(--chip-ink); border-radius: 999px; padding: 2px 9px; }
.rows { list-style: none; margin: 0; padding: 0; background: var(--surface); border: 1.5px solid var(--line); border-radius: 16px; }
.rows li { display: flex; justify-content: space-between; align-items: baseline; gap: 4px 12px; flex-wrap: wrap; padding: 10px 16px; border-top: 1px solid var(--line); }
.rows li:first-child { border-top: 0; }
.rows .r { font-weight: 700; text-align: right; }
.rows .best { color: var(--good); }
.note { margin-top: 28px; background: var(--surface); border: 1.5px dashed var(--line); border-radius: 14px; padding: 12px 16px; color: var(--muted); font-size: 0.9rem; }
.empty { color: var(--muted); background: var(--surface); border: 1.5px dashed var(--line); border-radius: 14px; padding: 14px 16px; margin: 0; }
.links { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 14px; }
.btn { display: inline-flex; align-items: center; min-height: 44px; padding: 0 18px; border-radius: 999px; border: 1.5px solid var(--line); background: var(--surface); font-weight: 700; text-decoration: none; }
.btn.primary { background: var(--accent); border-color: var(--accent); color: #0F2A43; }
.btn:hover { border-color: var(--accent); }
.cities { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 240px), 1fr)); gap: 12px; list-style: none; margin: 0; padding: 0; }
.cities a { display: block; height: 100%; text-decoration: none; background: var(--surface); border: 1.5px solid var(--line); border-radius: 16px; padding: 14px 16px; }
.cities a:hover { border-color: var(--accent); }
.cities b { font-size: 1.08rem; }
footer { border-top: 1.5px solid var(--line); color: var(--muted); font-size: 0.88rem; padding: 18px 0 32px; }
footer a { display: inline-flex; align-items: center; min-height: 44px; margin-right: 14px; }
`;

function head({ title, description, canonical, ogTitle, ogDescription, ld }) {
  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="theme-color" content="#0F2A43">
<link rel="canonical" href="${esc(canonical)}">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" href="/img/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/img/icon-180.png">
<link rel="manifest" href="/manifest.webmanifest">
<meta property="og:type" content="website">
<meta property="og:site_name" content="72h Getaway">
<meta property="og:locale" content="tr_TR">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:title" content="${esc(ogTitle || title)}">
<meta property="og:description" content="${esc(ogDescription || description)}">
<meta property="og:image" content="${SITE}/img/paylas.png">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">${jsonLd(ld)}</script>
<style>${CSS}</style>
</head>`;
}
function foot() {
  return `<footer><div class="wrap">
  <a href="/">Bütçe hesaplayıcı</a><a href="/sehir/">Tüm şehirler</a><a href="/oteller.html">Otel fiyatları</a><a href="/hakkinda.html">Hakkında</a>
  <div>72h Getaway bir seyahat acentesi değildir; fiyatlar bilgi amaçlıdır, rezervasyondan önce ilgili sitede kontrol et.</div>
</div></footer>
<script>if ("serviceWorker" in navigator) addEventListener("load", function () { navigator.serviceWorker.register("/sw.js").catch(function () {}); });</script>
</body>
</html>
`;
}
function breadcrumb(items) {
  return { "@type": "BreadcrumbList", itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: it.url })) };
}
export function calcLink(m) {
  const q = new URLSearchParams({ sehir: m.sehir });
  if (m.secili) { q.set("giris", m.secili.g); q.set("cikis", m.secili.cikis); }
  q.set("kisi", "2");
  return "/?" + q.toString().replace(/\+/g, "%20");
}

export function renderCityPage(m) {
  const url = `${SITE}/sehir/${m.slug}/`;
  const kur = m.eurTry;
  const title = `${m.sehir} hafta sonu bütçesi: otel, uçak, restoran (TL) | 72h Getaway`;
  const s = m.secili;
  const parts = [];
  if (s && s.otel) parts.push(`en ucuz otel gecelik ${fmtTl(s.otel.gecelik, kur) || fmtEur(s.otel.gecelik)}`);
  if (m.enUcuzUcus) parts.push(`İstanbul'dan uçak kişi başı ${fmtTl(m.enUcuzUcus.fiyat, kur) || fmtEur(m.enUcuzUcus.fiyat)}'den`);
  const description = `${yonelme(m.sehir)} hafta sonu kaçamağı kaça patlar? ` +
    (parts.length ? (s ? aralik(s.g, s.cikis) + " için " : "") + parts.join(", ") + ". " : "") +
    "Restoran, müze ve ulaşım fiyatlarıyla 2 kişilik Cuma–Pazar bütçesi.";
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebPage", "@id": url, url, name: title, description, inLanguage: "tr", dateModified: m.today,
        isPartOf: { "@type": "WebSite", name: "72h Getaway", url: SITE + "/" }, about: { "@type": "City", name: m.sehir } },
      breadcrumb([{ name: "72h Getaway", url: SITE + "/" }, { name: "Şehirler", url: SITE + "/sehir/" }, { name: m.sehir, url }]),
    ],
  };
  const calc = calcLink(m);
  const otelLink = "/oteller.html?sehir=" + encodeURIComponent(m.sehir);

  // Özet
  let ozet;
  if (s && (s.otel || s.ucus)) {
    const lines = [];
    let tot = 0;
    if (s.otel) { tot += s.otel.toplam; lines.push(`<li>Otel, 2 gece: ${para(s.otel.toplam, kur)} <span class="muted">· ${esc(s.otel.ad)}</span></li>`); }
    else lines.push(`<li>Bu hafta sonu için güvenilir otel fiyatı yok.</li>`);
    if (s.ucus) { tot += 2 * s.ucus.fiyat; lines.push(`<li>Uçak, 2 kişi gidiş-dönüş: ${para(2 * s.ucus.fiyat, kur)} <span class="muted">· ${esc(s.ucus.havayolu || "")}${s.ucus.aktarma === 0 ? ", aktarmasız" : s.ucus.aktarma ? `, ${s.ucus.aktarma} aktarma` : ""}</span></li>`); }
    else lines.push(`<li>Bu hafta sonu için uçak fiyatı henüz yok.</li>`);
    ozet = `<div class="sum"><div class="muted">${esc(aralik(s.g, s.cikis))} hafta sonu · 2 kişi · en ucuz seçeneklerle</div>
      <div class="tot">${s.otel && s.ucus ? "~" : ""}${para(tot, kur)}</div>
      <div class="muted">${s.otel && s.ucus ? "otel + uçak toplamı; yemek, gezi ve ulaşım hariç" : "eksik kalemler hariç"}</div>
      <ul>${lines.join("")}</ul></div>`;
  } else {
    ozet = `<p class="empty">Önümüzdeki hafta sonları için henüz güvenilir otel ya da uçak fiyatı yok. Robot kontrol ettikçe burası dolacak; şimdilik hesaplayıcıda tahmini bütçeyi görebilirsin.</p>`;
  }

  const otelKart = m.kategoriler.map((k) => {
    const bu = k.buHafta, eu = k.enUcuz;
    if (!bu && !eu) return `<div class="card"><h3>${esc(k.ad)}</h3><div class="s">Önümüzdeki hafta sonlarında güvenilir fiyat yok.</div></div>`;
    return `<div class="card"><h3>${esc(k.ad)}</h3>` +
      (bu ? `<div class="p">${para(bu.gecelik, kur)}</div><div class="s">gecelik · ${esc(bu.ad)} · ${esc(aralikKisa(s.g, s.cikis))} · ${bu.vergi === "dahil" || bu.vergi === "eklendi" ? "vergiler dahil" : "vergiler dahil olmayabilir"}</div>` : `<div class="s">${s ? esc(aralikKisa(s.g, s.cikis)) + " için fiyat yok." : ""}</div>`) +
      (eu && (!bu || eu.g !== bu.g || eu.gecelik < bu.gecelik) ? `<div class="s" style="margin-top:6px">8 hafta içinde en ucuzu: <b>${esc(fmtTl(eu.gecelik, kur) || fmtEur(eu.gecelik))}</b> gecelik, ${esc(aralikKisa(eu.g, eu.cikis))} (${esc(eu.ad)})</div>` : "") +
      `</div>`;
  }).join("");

  const ucusList = m.ucuslar.length
    ? `<ul class="rows">${m.ucuslar.map((u) => `<li><span>${esc(aralik(u.g, u.cikis))}<span class="muted"> · ${esc(u.havayolu || "")}${u.aktarma === 0 ? ", aktarmasız" : u.aktarma ? `, ${u.aktarma} aktarma` : ""}</span></span><span class="r${m.enUcuzUcus && u.g === m.enUcuzUcus.g ? " best" : ""}">${para(u.fiyat, kur)}</span></li>`).join("")}</ul>`
    : `<p class="empty">${esc(m.sehir)} için önümüzdeki hafta sonlarında uçak fiyatı henüz yok.</p>`;

  const restList = m.restoranlar.length
    ? `<ul class="rows">${m.restoranlar.map((r) => `<li><span>${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener nofollow">${esc(r.ad)}</a>` : esc(r.ad)} <span class="chip">${esc(r.seviye)}</span><span class="muted"> · ${esc(r.mutfak)}${r.puan ? " · " + esc(String(r.puan).replace(".", ",")) + "★" : ""}</span></span><span class="r">${r.kisiBasiEur != null ? para(r.kisiBasiEur, kur) + '<span class="muted"> / kişi</span>' : "fiyat yok"}</span></li>`).join("")}</ul>`
    : `<p class="empty">Restoran listesi henüz hazır değil.</p>`;

  const yerList = m.yerler.length
    ? `<ul class="rows">${m.yerler.map((y) => `<li><span>${esc(y.ad)}<span class="muted"> · ${esc(y.tur)}</span></span><span class="r">${y.eur === 0 ? "Ücretsiz" : y.eur == null ? '<span class="muted">fiyatı doğrulanmadı</span>' : para(y.eur, kur, y.eur < 20)}</span></li>`).join("")}</ul>`
    : `<p class="empty">Gezi yerleri ve bilet fiyatları hesaplayıcının tur adımında.</p>`;

  const ulList = m.ulasim.length
    ? `<ul class="rows">${m.ulasim.map((u) => `<li><span>${esc(u.ad)}</span><span class="r">${para(u.eur, kur, true)}</span></li>`).join("")}</ul>`
    : `<p class="empty">Ulaşım fiyatları henüz eklenmedi.</p>`;

  const kaynak = [m.otelGuncel && `otel fiyatları ${m.otelGuncel}`, m.ucusGuncel && `uçak fiyatları ${m.ucusGuncel}`].filter(Boolean).join(", ");
  const kaynakSatiri = `Fiyatlar ${kaynak ? kaynak + " tarihli" : "son"} robot kontrolüne göre; cuma–pazar 2 gece, 2 kişi; tahminidir.` +
    (kur ? ` TL tutarları 1 € = ${nf2.format(kur)} TL kuruyla 100 TL'ye yuvarlandı.` : "");

  return head({ title, description, canonical: url, ogTitle: `${m.sehir} hafta sonu bütçesi: otel, uçak, restoran`, ogDescription: description, ld }) + `
<body>
<header>
  <div class="wrap">
    <nav aria-label="Konum"><ol class="crumbs"><li><a href="/">72h Getaway</a></li><li><a href="/sehir/">Şehirler</a></li><li><span aria-current="page">${esc(m.sehir)}</span></li></ol></nav>
    <h1>${esc(m.sehir)} hafta sonu bütçesi</h1>
    <p>İstanbul'dan ${esc(yonelme(m.sehir))} Cuma–Pazar kaçamağı: robotun bulduğu gerçek otel ve uçak fiyatları, restoranlar, müze biletleri ve ulaşım. 2 kişi için.</p>
    <div class="hero"><a class="big" href="${esc(calc)}">Kendi bütçeni hesapla</a><a class="ghost" href="${esc(otelLink)}">Otel fiyat takvimi →</a></div>
  </div>
</header>
<main class="wrap">
  <section aria-labelledby="h-ozet">
    <h2 id="h-ozet">${s ? "En yakın hafta sonu: " + esc(aralik(s.g, s.cikis)) : "En yakın hafta sonu"}</h2>
    <p class="lead">${esc(kaynakSatiri)}</p>
    ${ozet}
  </section>
  <section aria-labelledby="h-otel">
    <h2 id="h-otel">Otel, gecelik</h2>
    <p class="lead">Seçtiğimiz otellerde kategori kategori en ucuz gecelik fiyat (2 kişilik oda). Tüm hafta sonları için <a href="${esc(otelLink)}">otel fiyat takvimine</a> bak.</p>
    <div class="grid">${otelKart || '<p class="empty">Bu şehir için otel listesi yok.</p>'}</div>
  </section>
  <section aria-labelledby="h-ucak">
    <h2 id="h-ucak">İstanbul'dan uçak</h2>
    <p class="lead">Kişi başı gidiş-dönüş, Cuma gidiş Pazar dönüş, IST ya da SAW çıkışlı en ucuz uçuş.</p>
    ${ucusList}
  </section>
  <section aria-labelledby="h-rest">
    <h2 id="h-rest">Nerede yemeli?</h2>
    <p class="lead">Google Maps'te yüksek puanlı, uygun / popüler / lüks restoranlar ve kişi başı ortalama harcama.</p>
    ${restList}
  </section>
  <section aria-labelledby="h-gezi">
    <h2 id="h-gezi">Gezilecek yerler ve biletler</h2>
    <p class="lead">Öne çıkan yerler ve yetişkin giriş fiyatı.</p>
    ${yerList}
  </section>
  <section aria-labelledby="h-ulasim">
    <h2 id="h-ulasim">Şehir içi ulaşım</h2>
    ${ulList}
  </section>
  <div class="note">${esc(kaynakSatiri)} Şehir/konaklama vergisi, bagaj, vize ve sigorta dahil değildir.
    <div class="links"><a class="btn primary" href="${esc(calc)}">Kendi bütçeni hesapla</a><a class="btn" href="${esc(otelLink)}">${esc(m.sehir)} otel fiyatları</a><a class="btn" href="/sehir/">Diğer şehirler</a></div>
  </div>
</main>
` + foot();
}

export function renderIndexPage(models, today) {
  const url = `${SITE}/sehir/`;
  const title = "Avrupa'da hafta sonu bütçesi: 26 başkent, otel + uçak (TL) | 72h Getaway";
  const description = "İstanbul'dan 26 Avrupa başkentine Cuma–Pazar kaçamağı: şehir şehir en ucuz hafta sonu otel ve uçak tahmini, restoran ve gezi fiyatları. 2 kişi, TL.";
  const sorted = models.slice().sort((a, b) => a.sehir.localeCompare(b.sehir, "tr"));
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebPage", "@id": url, url, name: title, description, inLanguage: "tr", dateModified: today, isPartOf: { "@type": "WebSite", name: "72h Getaway", url: SITE + "/" } },
      breadcrumb([{ name: "72h Getaway", url: SITE + "/" }, { name: "Şehirler", url }]),
      { "@type": "ItemList", itemListElement: sorted.map((m, i) => ({ "@type": "ListItem", position: i + 1, name: m.sehir, url: `${SITE}/sehir/${m.slug}/` })) },
    ],
  };
  const items = sorted.map((m) => {
    const k = m.enUcuzKombi;
    let body;
    if (k) body = `<div class="muted">${esc(aralikKisa(k.g, k.cikis))} · 2 kişi otel + uçak</div><div class="card-p"><b>~${para(k.toplam, m.eurTry)}</b></div>`;
    else if (m.secili && m.secili.otel) body = `<div class="muted">${esc(aralikKisa(m.secili.g, m.secili.cikis))} · otel, 2 gece</div><div><b>${para(m.secili.otel.toplam, m.eurTry)}</b> <span class="muted">· uçak fiyatı yok</span></div>`;
    else if (m.enUcuzUcus) body = `<div class="muted">Uçak, kişi başı gidiş-dönüş</div><div><b>${para(m.enUcuzUcus.fiyat, m.eurTry)}</b> <span class="muted">· otel fiyatı yok</span></div>`;
    else body = `<div class="muted">Fiyatlar henüz hazır değil</div>`;
    return `<li><a href="/sehir/${esc(m.slug)}/"><b>${esc(m.sehir)}</b> <span class="muted">${esc(m.ulke)}</span>${body}</a></li>`;
  }).join("");
  return head({ title, description, canonical: url, ogTitle: "Avrupa'da hafta sonu bütçesi: 26 başkent", ogDescription: description, ld }) + `
<body>
<header>
  <div class="wrap">
    <nav aria-label="Konum"><ol class="crumbs"><li><a href="/">72h Getaway</a></li><li><span aria-current="page">Şehirler</span></li></ol></nav>
    <h1>Hafta sonu nereye? 26 Avrupa başkenti</h1>
    <p>Her şehir için önümüzdeki 8 hafta sonunun en ucuzu: seçtiğimiz otellerin en ucuzunda 2 gece + İstanbul'dan 2 kişi gidiş-dönüş uçak. Robot fiyatlarına göre, tahminidir.</p>
    <div class="hero"><a class="big" href="/">Kendi bütçeni hesapla</a><a class="ghost" href="/oteller.html">Otel fiyat takvimi →</a></div>
  </div>
</header>
<main class="wrap">
  <ul class="cities">${items}</ul>
  <div class="note">Fiyatlar cuma–pazar 2 gece, 2 kişi; otel + uçak dışında yemek, gezi ve ulaşım dahil değildir. ${models[0] && models[0].eurTry ? `TL tutarları 1 € = ${esc(nf2.format(models[0].eurTry))} TL kuruyla 100 TL'ye yuvarlandı.` : ""}</div>
</main>
` + foot();
}

export function renderSitemap(paths, today) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paths.map((p) => `  <url><loc>${esc(SITE + p)}</loc><lastmod>${today}</lastmod></url>`).join("\n")}
</urlset>
`;
}

/** Tüm sayfaları üretir. write=false ise dosya yazmaz, {yol: içerik} döndürür. */
export function generate({ root, today = process.env.BUGUN || todayIstanbul(), data = null, write = true } = {}) {
  const d = data || loadData(root);
  const names = (d.hotels.sehirler || []).map((c) => c.sehir).filter(Boolean);
  const models = names.map((n) => buildCity(d, n, today));
  const out = {};
  for (const m of models) out[`sehir/${m.slug}/index.html`] = renderCityPage(m);
  out["sehir/index.html"] = renderIndexPage(models, today);
  const paths = ["/", "/oteller.html", "/hakkinda.html", "/sehir/", ...models.map((m) => `/sehir/${m.slug}/`)];
  out["sitemap.xml"] = renderSitemap(paths, today);
  if (write) {
    for (const [rel, html] of Object.entries(out)) {
      const p = join(root, rel);
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, html);
    }
  }
  return { files: out, models };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const { files, models } = generate({ root });
  const eksik = models.filter((m) => !m.secili).map((m) => m.sehir);
  console.log(`${Object.keys(files).length} dosya yazıldı (${models.length} şehir).` + (eksik.length ? ` Fiyatı olmayan: ${eksik.join(", ")}` : ""));
}
