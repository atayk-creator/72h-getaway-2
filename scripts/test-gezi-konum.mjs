import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { km, geoInput, applyRow, run } from "./gezi-konum.mjs";

const data = JSON.parse(await readFile(new URL("../data/gezi.json", import.meta.url), "utf8"));
const hotels = JSON.parse(await readFile(new URL("../data/hotels.json", import.meta.url), "utf8"));
const res = (b, status = 200) => ({ ok: status < 400, status, text: async () => JSON.stringify(b) });

// 0) veri: otel listesindeki her şehir var, yerlerin zorunlu alanları dolu, fiyat sayı ya da null
{ for (const c of hotels.sehirler) assert.ok(data.sehirler[c.sehir], c.sehir);
  for (const [s, c] of Object.entries(data.sehirler)) {
    assert.ok(["EUR", "HUF", "CZK", "PLN", "SEK", "DKK", "RON"].includes(c.para), s + " para");
    const u = c.ulasim; assert.ok(u && u.tek_bilet && typeof u.tek_bilet.fiyat === "number", s + " tek bilet");
    assert.ok(u.havalimani && typeof u.havalimani.fiyat === "number", s + " havalimanı");
    const ids = new Set();
    for (const p of c.yerler) {
      for (const f of ["id", "ad", "arama", "tur", "bolge", "bilgi", "fiyat_yazi"]) assert.ok(p[f], `${s} ${p.ad} ${f}`);
      assert.ok(p.sure_dk >= 10 && p.sure_dk <= 480, `${s} ${p.ad} süre`); assert.ok(p.fiyat === null || p.fiyat >= 0, `${s} ${p.ad} fiyat`);
      assert.ok(!ids.has(p.id)); ids.add(p.id);
    }
  }
  console.log(`ok 0: ${Object.keys(data.sehirler).length} şehir, ${Object.values(data.sehirler).reduce((a, c) => a + c.yerler.length, 0)} yer`); }

// 1) mesafe ve girdi
assert.ok(Math.abs(km([47.4979, 19.053], [48.2082, 16.3738]) - 214) < 5, "Budapeşte-Viyana ~214 km");
assert.deepEqual(geoInput([{ arama: "Louvre Museum Paris" }]).searchStringsArray, ["Louvre Museum Paris"]); console.log("ok 1: mesafe, girdi");

// 2) sonuç uygulama: uzak/uyuşmayan/kapalı
{ const p = { ad: "Louvre Müzesi", arama: "Louvre Museum Paris" }, c = [48.8606, 2.341];
  const ok = applyRow(p, { title: "Louvre Museum", location: { lat: 48.8606111, lng: 2.337644 }, totalScore: 4.7, reviewsCount: 300000, url: "https://maps" }, c);
  assert.deepEqual(ok.konum, [48.86061, 2.33764]); assert.equal(ok.konumNotu, undefined); assert.equal(ok.puan, 4.7);
  const far = applyRow(p, { title: "Louvre-Lens", location: { lat: 50.43, lng: 2.8 } }, c); assert.equal(far.konum, null); assert.match(far.konumNotu, /km uzakta/);
  const odd = applyRow(p, { title: "Café Marly", location: { lat: 48.861, lng: 2.335 } }, c); assert.ok(odd.konum); assert.match(odd.konumNotu, /uyuşmuyor/);
  assert.equal(applyRow(p, { title: "Louvre Museum", location: { lat: 48.86, lng: 2.33 }, permanentlyClosed: true }, c).kapali, "kalici");
  assert.match(applyRow(p, null, c).konumNotu, /sonuç vermedi/); console.log("ok 2: sonuç kontrolü"); }

// 3) uçtan uca: sadece konumu olmayanlar aranır
{ const seen = []; const small = { sehirler: { Paris: structuredClone(data.sehirler.Paris) } }; small.sehirler.Paris.yerler.forEach((y, i) => { y.konum = i === 0 ? [1, 1] : null; });
  const fake = async (url, init = {}) => { seen.push({ url, init }); const u = new URL(url);
    if (u.pathname.endsWith("/users/me/limits")) return res({ data: { current: { monthlyUsageUsd: 1 }, limits: { maxMonthlyUsageUsd: 45 } } });
    if (init.method === "POST") return res({ data: { id: "r1", status: "SUCCEEDED", defaultDatasetId: "d1" } });
    const inp = JSON.parse(seen.find((x) => x.init.method === "POST").init.body);
    return res(inp.searchStringsArray.map((q) => ({ searchString: q, title: q.replace(/ Paris$/, ""), location: { lat: 48.86, lng: 2.34 } }))); };
  const { data: out, report } = await run({ token: "apify_api_TEST", data: small, centers: { Paris: [48.8606, 2.341] }, hotelSettings: { aylik_butce_usd: 45 }, fetchImpl: fake, sleep: async () => {} });
  assert.equal(JSON.parse(seen.find((x) => x.init.method === "POST").init.body).searchStringsArray.length, small.sehirler.Paris.yerler.length - 1);
  assert.deepEqual(out.sehirler.Paris.yerler[0].konum, [1, 1]); assert.ok(out.sehirler.Paris.yerler.slice(1).every((p) => p.konum)); assert.equal(report.sehir, 1);
  console.log("ok 3: uçtan uca"); }
console.log("TÜM TESTLER GEÇTİ");
