// Uçak robotu, yeni kaynak: eiv/google-flights-scraper (uçuş başına ücret). Çalıştır: node scripts/test-ucak-eiv.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { eivInput, eivLine, eivRecord, run, toMarkdown, isEiv, actorOf } from "./ucak-fiyatlari.mjs";
import { planFor } from "./otel-fiyatlari.mjs";

const cfg = JSON.parse(await readFile(new URL("../data/ucus-ayarlari.json", import.meta.url), "utf8"));
const TOKEN = "apify_api_TESTJETON1234567890abcdef";
const BUD = cfg.sehirler.find((c) => c.sehir === "Budapeşte"), AMS = cfg.sehirler.find((c) => c.sehir === "Amsterdam");
const W = { giris: "2026-11-13", cikis: "2026-11-15" };

// 0) ayar: varsayılan kaynak eiv
assert.ok(isEiv(cfg)); assert.equal(actorOf(cfg), "eiv~google-flights-scraper"); console.log("ok 0: kaynak eiv");

// 1) girdi: tüm şehirler tek çalışmada, iki saat aralığı, fiyata göre sıralı, arama başına sınırlı uçuş + ücretsiz özet
{ const i = eivInput(cfg, cfg.sehirler, W);
  assert.equal(i.searches.length, cfg.sehirler.length); assert.equal(i.searches[0], `IST,SAW-${cfg.sehirler[0].havalimani.join(",")} 2026-11-13 2026-11-15`);
  assert.equal(i.departureTimeRange, "5-12"); assert.equal(i.returnDepartureTimeRange, "16-24"); assert.equal(i.sortBy, "price");
  assert.equal(i.maxResultsPerSearch, cfg.sonuc_sayisi); assert.ok(i.maxItems <= cfg.sehirler.length * cfg.sonuc_sayisi + 10);
  assert.equal(i.includeSearchSummary, true); assert.equal(i.currency, "EUR"); assert.equal(i.market, "TR"); assert.equal(i.adults, 1);
  const j = eivInput(cfg, [BUD], W, { saatsiz: true }); assert.ok(!("departureTimeRange" in j) && !("returnDepartureTimeRange" in j));
  console.log("ok 1: girdi"); }

// Örnek satırlar (gerçek çıktının biçimi)
const line = (c, w = W) => eivLine(cfg, c, w);
const summary = (c, o = {}) => ({ recordType: "search-summary", input: line(c), flightsFound: 7, lowestPrice: 248, cheapestNonstopPrice: 305, currency: "EUR", priceLevel: "high", typicalPrice: 192, typicalPriceLow: 170, typicalPriceHigh: 225, priceHistory: [{ date: "2026-11-06", price: 248 }], googleFlightsUrl: "https://www.google.com/travel/flights/search?tfs=AAA&hl=en&gl=TR&curr=EUR", ...o });
const flight = (c, price, o = {}) => ({ recordType: "flight", input: line(c), price, currency: "EUR", airline: "Air Serbia", airlines: ["Air Serbia"], origin: "IST", destination: c.havalimani[0], departAt: "2026-11-13T05:25", durationMinutes: 345, stops: 1, priceLevel: "high", typicalPriceLow: 170, typicalPriceHigh: 225, googleFlightsUrl: "https://www.google.com/travel/flights/search?tfs=BBB&hl=en&gl=TR&curr=EUR", ...o });

// 2) kayıt: en ucuz uçuş, aktarmasız satırlardan ya da özetten, fiyat seviyesi Türkçe, link hl=tr
{ const r = eivRecord([summary(AMS), flight(AMS, 260, { stops: 0, airline: "KLM", airlines: ["KLM"], departAt: "2026-11-13T08:00" }), flight(AMS, 248)], cfg, AMS);
  assert.equal(r.durum, "fiyat"); assert.equal(r.fiyat, 248); assert.equal(r.havayolu, "Air Serbia"); assert.equal(r.ucusSaati, "2026-11-13T05:25"); assert.equal(r.aktarma, 1);
  assert.equal(r.aktarmasiz.fiyat, 260); assert.equal(r.aktarmasiz.havayolu, "KLM"); assert.equal(r.fiyatSeviyesi, "yuksek"); assert.deepEqual(r.tipikAralik, [170, 225]); assert.equal(r.tipikFiyat, 192);
  assert.match(r.link, /hl=tr/);
  const s = eivRecord([summary(AMS), flight(AMS, 248)], cfg, AMS); assert.equal(s.aktarmasiz.fiyat, 305, "aktarmasız özetten"); assert.equal(s.aktarmasiz.havayolu, null);
  const n = eivRecord([summary(AMS, { cheapestNonstopPrice: null }), flight(AMS, 248)], cfg, AMS); assert.equal(n.aktarmasiz, null);
  assert.equal(eivRecord([{ recordType: "error", input: line(AMS), errorCode: "NO_FLIGHTS", errorMessage: "no flights" }], cfg, AMS).durum, "yok");
  const h = eivRecord([{ recordType: "error", input: line(AMS), errorCode: "GOOGLE_ERROR", errorMessage: "internal" }], cfg, AMS); assert.equal(h.durum, "hata"); assert.equal(h.kod, "GOOGLE_ERROR");
  assert.equal(eivRecord([flight(AMS, 99, { destination: "XXX" }), flight(AMS, 120, { currency: "USD" })], cfg, AMS).durum, "yok", "başka havalimanı/para elenir");
  console.log("ok 2: kayıt"); }

// 3) uçtan uca (sahte Apify): Salı planı, hafta sonu başına tek çalışma; Stokholm ilk seferde Google hatası (tekrar), Bratislava saat aralığında yok (saatsiz), Valletta hep hata
const res = (b, status = 200) => ({ ok: status < 400, status, text: async () => JSON.stringify(b) });
function fakeApify(log) {
  let id = 0; const data = {}, calls = {};
  return async (url, init = {}) => {
    log.push({ url, init });
    if (url.includes("/users/me/limits")) return res({ data: { current: { monthlyUsageUsd: 10 }, limits: { maxMonthlyUsageUsd: 75 } } });
    if (init.method === "POST" && url.includes("/acts/eiv~google-flights-scraper/runs")) {
      const inp = JSON.parse(init.body), k = "r" + ++id, rows = [];
      for (const s of inp.searches) {
        const c = cfg.sehirler.find((x) => s.startsWith(`IST,SAW-${x.havalimani.join(",")} `)); const w = { giris: s.split(" ")[1], cikis: s.split(" ")[2] };
        const L = eivLine(cfg, c, w); calls[L] = (calls[L] || 0) + 1;
        if (c.sehir === "Valletta") { rows.push({ recordType: "error", input: L, errorCode: "GOOGLE_ERROR", errorMessage: "internal" }); continue; }
        if (c.sehir === "Stokholm" && calls[L] === 1) { rows.push({ recordType: "error", input: L, errorCode: "GOOGLE_ERROR", errorMessage: "internal" }); continue; }
        if (c.sehir === "Bratislava" && inp.departureTimeRange) { rows.push({ recordType: "error", input: L, errorCode: "NO_FLIGHTS", errorMessage: "none" }); continue; }
        rows.push({ ...summary(c), input: L }, { ...flight(c, c.sehir === "Budapeşte" ? 150 : 200, { departAt: `${w.giris}T09:55` }), input: L });
      }
      data[k] = rows; return res({ data: { id: k, status: "SUCCEEDED", defaultDatasetId: k } });
    }
    const m = /datasets\/(r\d+)\/items/.exec(url); if (m) return res(data[m[1]]);
    return res({ data: { status: "SUCCEEDED" } });
  };
}
{ const log = [], now = new Date("2026-11-10T06:00:00Z"), plan = planFor("2026-11-10", cfg);
  const out = await run({ token: TOKEN, cfg, state: undefined, hotelSettings: { aylik_butce_usd: 75, fatura_gunu: 28 }, now, fetchImpl: fakeApify(log), sleep: async () => {} });
  const posts = log.filter((x) => x.init.method === "POST");
  // her hafta sonu: 1 ana + 1 tekrar (Stokholm + Valletta) + 1 saatsiz (Bratislava)
  assert.equal(posts.length, plan.length * 3, "hafta sonu başına 3 çalışma");
  assert.equal(out.report.arama, plan.length * (28 + 2 + 1));
  assert.equal(out.report.fiyat, plan.length * 27); assert.equal(out.report.hata, plan.length); assert.equal(out.report.yok || 0, 0);
  const g = plan[0].giris, S = out.state.haftaSonlari[g].sehirler;
  assert.equal(S["Budapeşte"].son.fiyat, 150); assert.deepEqual(S["Budapeşte"].son.saat, { gidis: "05:00–12:00", donus: "16:00–24:00" }); assert.equal(S["Budapeşte"].son.fiyatSeviyesi, "yuksek");
  assert.equal(S["Stokholm"].son.durum, "fiyat", "Google hatası tekrarla düzelir");
  assert.equal(S["Bratislava"].son.saatDisi, true); assert.ok(!S["Bratislava"].son.saat);
  assert.equal(S["Valletta"].son.durum, "hata");
  assert.match(out.state.kaynak, /eiv\/google-flights-scraper/);
  assert.ok(Math.abs(out.report.tahminiMaliyetUsd - out.report.arama * cfg.arama_basi_usd) < 0.02);
  assert.ok(log.every((x) => !String(x.url).includes(TOKEN)), "jeton adreste görünmez");
  assert.match(toMarkdown({ ...out, cfg }), /Budapeşte \| 150 €/);
  console.log(`ok 3: uçtan uca (${plan.length} hafta sonu, ${posts.length} Apify çalışması, ${out.report.arama} arama, ~${out.report.tahminiMaliyetUsd} $)`); }

// 4) bütçe dolunca arama yok
{ const log = [];
  const f = fakeApify(log); const fi = async (u, i) => (u.includes("/users/me/limits") ? res({ data: { current: { monthlyUsageUsd: 74.99 }, limits: { maxMonthlyUsageUsd: 75 } } }) : f(u, i));
  const out = await run({ token: TOKEN, cfg, hotelSettings: { aylik_butce_usd: 75, fatura_gunu: 28 }, now: new Date("2026-11-10T06:00:00Z"), fetchImpl: fi, sleep: async () => {} });
  assert.equal(log.filter((x) => x.init.method === "POST").length, 0); assert.ok(out.report.butceAtlanan > 0); console.log("ok 4: bütçe"); }
// 5) hata son geçerli fiyatı silmez
{ const { mergeFlight, emptyFlights } = await import("./ucak-fiyatlari.mjs");
  const st = emptyFlights(); mergeFlight(st, W, "Berlin", { durum: "fiyat", fiyat: 160 }, "2026-11-03T10:00:00Z");
  mergeFlight(st, W, "Berlin", { durum: "hata", kod: "GOOGLE_ERROR", not: "x" }, "2026-11-07T10:00:00Z");
  const o = st.haftaSonlari[W.giris].sehirler.Berlin; assert.equal(o.son.fiyat, 160); assert.equal(o.son.kontrol, "2026-11-03T10:00:00Z"); assert.equal(o.sonHata.kod, "GOOGLE_ERROR"); assert.equal(o.gecmis.length, 2);
  mergeFlight(st, W, "Berlin", { durum: "fiyat", fiyat: 170 }, "2026-11-10T10:00:00Z"); assert.equal(o.son.fiyat, 170); assert.ok(!o.sonHata);
  console.log("ok 5: hata eski fiyatı silmez"); }
console.log("TÜM TESTLER GEÇTİ");
