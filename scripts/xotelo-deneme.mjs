// DENEME (ücretsiz): Xotelo (TripAdvisor kaynaklı otel fiyatları, https://xotelo.com) otel robotumuzun yerini tutabilir mi?
// 1) 208 oteli Xotelo'da bulur: /search (otel adıyla) → olmazsa şehrin /list listesinde ad + konum eşleşmesi.
//    Eşleşme doğrulaması: ad benzerliği (nameOk) ve bizdeki Google konumuna uzaklık (≤ 1 km).
// 2) Bir hafta sonu için 2 yetişkin, 1 oda fiyatlarını çeker (/rates, gecelik), tanınmış sitelerin en ucuzunu 2 geceyle çarpar.
// 3) Mevcut Google fiyatımızla (vergili ve vergisiz) karşılaştırır. Sonuç: data/xotelo-deneme.json, eşleşmeler: data/xotelo-anahtar.json
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { nameOk, nameScore, norm } from "./otel-fiyatlari.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const API = "https://data.xotelo.com/api";
const W = { giris: process.env.GIRIS || "2026-11-13", cikis: process.env.CIKIS || "2026-11-15" };
const TRUSTED = /booking|expedia|hotels\.?com|agoda|trip\.?com|priceline/i;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const toRad = (d) => (d * Math.PI) / 180;
const km = (a, b) => { const R = 6371, dLat = toRad(b[0] - a[0]), dLon = toRad(b[1] - a[1]); const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
const citySlug = (s) => norm(s.replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c")).replace(/ /g, "-");
const stats = { istek: 0, hata: 0 };

async function get(path, params) {
  const u = API + path + "?" + new URLSearchParams(params).toString();
  for (let i = 0; i < 3; i++) {
    stats.istek++;
    try {
      const r = await fetch(u, { headers: { "user-agent": "72h-getaway-fiyat-denemesi", accept: "application/json" } });
      const txt = await r.text();
      if (r.status === 429) { await sleep(5000 * (i + 1)); continue; }
      let j; try { j = JSON.parse(txt); } catch { j = null; }
      if (!r.ok || !j) { stats.hata++; return { error: `HTTP ${r.status}: ${txt.slice(0, 120)}` }; }
      if (j.error) stats.apiHata = (stats.apiHata || 0) + 1;
      await sleep(350);
      return j;
    } catch (e) { stats.hata++; await sleep(1500); if (i === 2) return { error: String(e.message) }; }
  }
  return { error: "çok fazla istek (429)" };
}

const hotels = JSON.parse(await readFile(root + "data/hotels.json", "utf8"));
const meta = JSON.parse(await readFile(root + "data/otel-fiyatlari.json", "utf8"));
let keys = {}; try { keys = JSON.parse(await readFile(root + "data/xotelo-anahtar.json", "utf8")); } catch {}
const only = (process.env.SEHIR || "").split(",").map((s) => s.trim()).filter(Boolean);
const out = { tarih: new Date().toISOString(), hafta_sonu: W, otel: 0, bulunan: 0, fiyatli: 0, sehirler: {}, karsilastirma: [], aramaDurumu: null };

// /search çalışıyor mu?
const probe = await get("/search", { query: "Hotel Gellert Budapest", location_type: "accommodation" });
out.aramaDurumu = probe.error ? "search çalışmıyor: " + JSON.stringify(probe.error).slice(0, 200) : `search çalışıyor (${(probe.result && probe.result.list || []).length} sonuç)`;
const listCache = {};
async function cityList(sehir, geoKey) {
  if (listCache[sehir]) return listCache[sehir];
  const all = [];
  for (let off = 0; off < 1000; off += 100) {
    const j = await get("/list", { location_key: geoKey, limit: 100, offset: off, sort: "popularity" });
    const l = (j.result && j.result.list) || []; all.push(...l);
    if (l.length < 100) break;
  }
  const ctr = CENTER[sehir], ds = ctr ? all.filter((x) => x.geo).map((x) => km(ctr, [x.geo.latitude, x.geo.longitude])).sort((a, b) => a - b) : [];
  out.geoKontrol[sehir] = { kimlik: geoKey, otelSayisi: all.length, toplam: all.length, merkezeOrtancaKm: ds.length ? Math.round(ds[Math.floor(ds.length / 2)] * 10) / 10 : null, ilkUc: all.slice(0, 3).map((x) => x.name) };
  return (listCache[sehir] = all);
}
// TripAdvisor şehir kimlikleri (Xotelo'nun ücretsiz sürümünde /search kapalı). Doğruluk: listedeki otellerin şehir merkezine uzaklığıyla kontrol edilir.
const GEO = { "Dublin": "g186605", "Paris": "g187147", "Brüksel": "g188644", "Amsterdam": "g188590", "Lüksemburg": "g190356", "Berlin": "g187323", "Viyana": "g190454",
  "Madrid": "g187514", "Lizbon": "g189158", "Roma": "g187791", "Valletta": "g190328", "Atina": "g189400", "Stokholm": "g189852", "Kopenhag": "g189541", "Helsinki": "g189934",
  "Tallinn": "g274958", "Riga": "g274967", "Vilnius": "g274951", "Varşova": "g274856", "Prag": "g274707", "Bratislava": "g274924", "Budapeşte": "g274887",
  "Ljubljana": "g274873", "Zagreb": "g294454", "Bükreş": "g294458", "Sofya": "g294452" };
const rcfg = JSON.parse(await readFile(root + "data/restoran-ayarlari.json", "utf8"));
const CENTER = Object.fromEntries(rcfg.sehirler.map((c) => [c.sehir, c.merkez]));
out.geoKontrol = {};
async function geoKeyOf(sehir) { return GEO[sehir] || null; }

for (const c of hotels.sehirler) {
  if (only.length && !only.includes(c.sehir)) continue;
  const pf = JSON.parse(await readFile(root + "data/fiyatlar/" + citySlug(c.sehir) + ".json", "utf8").catch(() => "{}"));
  const ws = ((pf.haftaSonlari || {})[W.giris] || {}).oteller || {};
  const cs = (out.sehirler[c.sehir] = { otel: 0, bulunan: 0, fiyatli: 0 });
  for (const h of c.oteller) {
    out.otel++; cs.otel++;
    const pos = (meta.konum || {})[h.id] || null;
    let k = keys[h.id] && keys[h.id].key ? keys[h.id] : null, how = k ? "kayitli" : null;
    if (!k && !probe.error) {
      const j = await get("/search", { query: h.arama, location_type: "accommodation" });
      const cand = ((j.result && j.result.list) || []).filter((x) => x.hotel_key && nameOk(h, x.name)).sort((a, b) => nameScore(h.ad, b.name) - nameScore(h.ad, a.name))[0];
      if (cand) { k = { key: cand.hotel_key, ad: cand.name, yer: cand.short_place_name || null }; how = "search"; }
    }
    if (!k) {
      const geo = await geoKeyOf(c.sehir);
      if (geo) {
        const list = await cityList(c.sehir, geo.replace(/-d\d+$/, ""));
        const cand = list.filter((x) => x.key && nameOk(h, x.name)).map((x) => ({ x, d: pos && x.geo ? km(pos, [x.geo.latitude, x.geo.longitude]) : null }))
          .filter((o) => o.d == null || o.d <= 1).sort((a, b) => (a.d ?? 9) - (b.d ?? 9))[0];
        if (cand) { k = { key: cand.x.key, ad: cand.x.name, km: cand.d != null ? Math.round(cand.d * 100) / 100 : null }; how = "liste"; }
      }
    }
    const our = ws[h.id] && ws[h.id].son;
    const row = { sehir: c.sehir, id: h.id, ad: h.ad, kategori: h.kategori, eslesme: how, xoteloAd: k ? k.ad : null, key: k ? k.key : null,
      bizim: our && our.durum === "fiyat" ? our.fiyat : null, bizimVergisiz: our && our.durum === "fiyat" ? our.fiyatVergisiz ?? null : null, bizimSite: our ? our.site || null : null };
    if (k) {
      keys[h.id] = { key: k.key, ad: k.ad, nasil: how }; out.bulunan++; cs.bulunan++;
      const j = await get("/rates", { hotel_key: k.key, chk_in: W.giris, chk_out: W.cikis, currency: "EUR", rooms: 1, adults: 2 });
      const rates = ((j.result && j.result.rates) || []).filter((r) => typeof r.rate === "number" && r.rate > 0);
      const trusted = rates.filter((r) => TRUSTED.test(r.name || r.code || ""));
      const best = (trusted.length ? trusted : rates).sort((a, b) => a.rate - b.rate)[0];
      if (best) { out.fiyatli++; cs.fiyatli++; row.xotelo = Math.round(best.rate * 2 * 100) / 100; row.xoteloSite = best.name; row.siteSayisi = rates.length;
        row.xoteloTum = rates.map((r) => `${r.name}:${r.rate}`).join(" "); if (j.result && j.result.chk_in !== W.giris) row.tarihUyari = j.result.chk_in; }
      else row.xoteloHata = j.error ? String(j.error).slice(0, 120) : "fiyat yok";
    }
    out.karsilastirma.push(row);
  }
  console.log(`${c.sehir}: ${cs.bulunan}/${cs.otel} bulundu, ${cs.fiyatli} fiyatlı`);
}
for (const [s2, g] of Object.entries(out.geoKontrol)) console.log(`${s2}: ${g.kimlik} ${g.otelSayisi} otel, merkeze ortanca ${g.merkezeOrtancaKm} km (${g.ilkUc.join(" | ")})`);
// özet
const pairs = out.karsilastirma.filter((r) => r.xotelo && r.bizim);
const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const rel = (a, b) => (a - b) / b;
out.ozet = {
  bulunmaOrani: Math.round((100 * out.bulunan) / out.otel), fiyatOrani: Math.round((100 * out.fiyatli) / out.otel), karsilastirilan: pairs.length,
  medyanFarkVergili: pairs.length ? Math.round(100 * med(pairs.map((r) => rel(r.xotelo, r.bizim)))) : null,
  medyanFarkVergisiz: pairs.filter((r) => r.bizimVergisiz).length ? Math.round(100 * med(pairs.filter((r) => r.bizimVergisiz).map((r) => rel(r.xotelo, r.bizimVergisiz)))) : null,
  yuzde10Icinde: pairs.length ? Math.round((100 * pairs.filter((r) => Math.abs(rel(r.xotelo, r.bizimVergisiz || r.bizim)) <= 0.1).length) / pairs.length) : null,
  istek: stats.istek, istekHata: stats.hata, apiHata: stats.apiHata || 0,
};
await writeFile(root + "data/xotelo-deneme.json", JSON.stringify(out, null, 1) + "\n");
await writeFile(root + "data/xotelo-anahtar.json", JSON.stringify(keys, null, 1) + "\n");
console.log(out.aramaDurumu); console.log(JSON.stringify(out.ozet));
