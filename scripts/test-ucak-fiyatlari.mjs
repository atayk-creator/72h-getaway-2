import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { flightInput, toFlightRecord, run, toMarkdown, emptyFlights, dropPast, mergeFlight, COST_PER_ROW, COST_PER_RUN } from "./ucak-fiyatlari.mjs";
import { planFor, emptyState } from "./otel-fiyatlari.mjs";

const cfg = JSON.parse(await readFile(new URL("../data/ucus-ayarlari.json", import.meta.url), "utf8"));
const hotels = JSON.parse(await readFile(new URL("../data/hotels.json", import.meta.url), "utf8"));
const TOKEN = "apify_api_TESTJETON1234567890abcdef";
const res = (b, status = 200) => ({ ok: status < 400, status, text: async () => (typeof b === "string" ? b : JSON.stringify(b)) });
const BUD = cfg.sehirler.find((c) => c.sehir === "Budapeşte");

// 0) ayarlar: otel listesindeki her şehrin havalimanı var
{ const names = new Set(cfg.sehirler.map((c) => c.sehir));
  for (const c of hotels.sehirler) assert.ok(names.has(c.sehir), "havalimanı eksik: " + c.sehir);
  for (const c of cfg.sehirler) { assert.ok(c.havalimani.length >= 1); for (const k of c.havalimani) assert.match(k, /^[A-Z]{3}$/); }
  assert.deepEqual(cfg.kalkis, ["IST", "SAW"]); console.log(`ok 0: ${cfg.sehirler.length} şehir, kalkış IST+SAW`); }

// 1) takvim: Salı; yakın 4 hafta sonu her hafta, 5-8 iki haftada bir
{ assert.deepEqual(planFor("2026-11-02", cfg), [], "Pazartesi yok");
  const a = planFor("2026-11-03", cfg).map((w) => w.no), b = planFor("2026-11-10", cfg).map((w) => w.no);
  assert.ok([4, 8].includes(a.length) && [4, 8].includes(b.length) && a.length !== b.length, `${a} / ${b}`);
  assert.deepEqual(planFor("2026-11-03", cfg)[0], { no: 1, giris: "2026-11-06", cikis: "2026-11-08", kademe: "yakin" }); console.log("ok 1: takvim"); }

// 2) robot girdisi: gidiş-dönüş, iki kalkış, şehrin havalimanları, 1 kişi, euro
{ const i = flightInput(cfg, cfg.sehirler.find((c) => c.sehir === "Paris"), { giris: "2026-11-06", cikis: "2026-11-08" });
  assert.deepEqual(i.origin, ["IST", "SAW"]); assert.deepEqual(i.destination, ["CDG", "ORY"]); assert.equal(i.tripType, "round_trip");
  assert.equal(i.departureDate, "2026-11-06"); assert.equal(i.returnDate, "2026-11-08"); assert.equal(i.adults, 1); assert.equal(i.currency, "EUR"); console.log("ok 2: robot girdisi"); }

// 3) kayıt: en ucuz ve en ucuz aktarmasız; başka şehir/para birimi/bozuk fiyat elenir
const fl = (price, o = {}) => ({ rowType: "flight", origin: "IST", destination: "BUD", price, currency: "EUR", airlines: ["Wizz Air"], stopsLabel: "Nonstop", departureTime: "2026-11-06T09:55", durationMinutes: 125, googleFlightsUrl: "https://www.google.com/travel/flights?x", ...o });
{ const r = toFlightRecord([fl(211, { airlines: ["Turkish Airlines", "Wizz Air"], stopsLabel: "1 stop" }), fl(182, { stopsLabel: "2 stops", origin: "SAW" }), fl(250), fl(99, { destination: "PRG" }), fl(80, { currency: "USD" }), fl(null), fl(190, { origin: "ESB" })], cfg, BUD);
  assert.equal(r.durum, "fiyat"); assert.equal(r.fiyat, 182); assert.equal(r.kalkis, "SAW"); assert.equal(r.aktarma, null); assert.equal(r.aktarmaYazi, "2 stops");
  assert.equal(r.aktarmasiz.fiyat, 250); assert.equal(r.aktarmasiz.havayolu, "Wizz Air"); assert.equal(r.aktarmasiz.aktarma, 0);
  assert.equal(toFlightRecord([], cfg, BUD).durum, "yok"); assert.equal(toFlightRecord([{ rowType: "no_results" }], cfg, BUD).durum, "yok");
  assert.equal(toFlightRecord([{ rowType: "search_failed", message: "blocked" }], cfg, BUD).durum, "hata");
  assert.equal(toFlightRecord([fl(150, { stopsLabel: "1 stop" })], cfg, BUD).aktarmasiz, null);
  const ins = toFlightRecord([fl(120, { priceInsights: { priceLevel: "low", typicalPrice: 160 } })], cfg, BUD); assert.equal(ins.tipikFiyat, 160); assert.equal(ins.fiyatSeviyesi, "low");
  console.log("ok 3: uçuş kaydı"); }

// 4) geçmiş ve eski hafta sonlarını silme
{ const st = emptyFlights(); const w = { giris: "2026-11-06", cikis: "2026-11-08" };
  for (let i = 0; i < 35; i++) mergeFlight(st, w, "Budapeşte", { durum: "fiyat", fiyat: 100 + i }, "t" + i);
  assert.equal(st.haftaSonlari["2026-11-06"].sehirler["Budapeşte"].gecmis.length, 30); assert.equal(st.haftaSonlari["2026-11-06"].sehirler["Budapeşte"].son.fiyat, 134);
  assert.equal(dropPast(st, "2026-11-09"), 1); assert.deepEqual(st.haftaSonlari, {}); console.log("ok 4: geçmiş"); }

// Sahte Apify
function fake({ seen = [], status = 200, body = null } = {}) {
  const runs = {}; let n = 0;
  return async (url, init = {}) => {
    seen.push({ url, init }); if (body) return res(body, status);
    const u = new URL(url);
    if (init.method === "POST") { const id = "r" + ++n; runs[id] = JSON.parse(init.body); return res({ data: { id, status: "SUCCEEDED", defaultDatasetId: "ds" + id } }); }
    const inp = runs[u.pathname.split("/")[3].slice(2)];
    const d = inp.destination[0];
    return res(d === "MLA" ? [{ rowType: "no_results" }] : [fl(150, { destination: d, origin: "SAW", stopsLabel: "1 stop" }), fl(190, { destination: d })]);
  };
}
const hs = { ...hotels.ayarlar, apify_plan: "starter", aylik_butce_usd: 100, fatura_gunu: 28 };

// 5) uçtan uca Salı: yakın hafta sonları x 26 şehir, ortak harcama sayacına eklenir
{ const seen = [], meta = { ...emptyState(), harcama: { donem: "2026-10-28", usd: 1.5 }, sehirler: { a: 1 } };
  const out = await run({ token: TOKEN, cfg, meta, hotelSettings: hs, now: new Date("2026-11-03T03:17:00Z"), fetchImpl: fake({ seen }), sleep: async () => {} });
  const posts = seen.filter((s) => s.init.method === "POST").length, n = out.plan.length * cfg.sehirler.length;
  assert.equal(posts, n); assert.equal(out.report.fiyat, n - out.plan.length); assert.equal(out.report.yok, out.plan.length, "Valletta: uçuş yok");
  const s = out.state.haftaSonlari["2026-11-06"].sehirler["Budapeşte"].son; assert.equal(s.fiyat, 150); assert.equal(s.aktarmasiz.fiyat, 190);
  assert.ok(Math.abs(out.meta.harcama.usd - (1.5 + posts * COST_PER_RUN + (n - out.plan.length) * 2 * COST_PER_ROW)) < 0.02); assert.equal(out.meta.sehirler.a, 1, "otel özet dosyasının diğer alanları korunur");
  assert.equal(meta.harcama.usd, 1.5, "girdi değiştirilmez");
  assert.ok(seen.every((x) => !x.url.includes(TOKEN))); assert.match(toMarkdown({ ...out, cfg }), /Budapeşte \| 150 €/); console.log("ok 5: uçtan uca, ortak harcama"); }

// 6) ortak bütçe dolunca arama yapılmaz; şehir filtresi; kontrol günü değilse boş
{ const seen = []; const out = await run({ token: TOKEN, cfg, meta: { ...emptyState(), harcama: { donem: "2026-10-28", usd: 99.999 } }, hotelSettings: hs, now: new Date("2026-11-03T03:17:00Z"), fetchImpl: fake({ seen }), sleep: async () => {} });
  assert.equal(seen.length, 0); assert.ok(out.report.butceAtlanan > 0);
  const seen2 = []; await run({ token: TOKEN, cfg, hotelSettings: hs, mode: "test", only: ["Paris"], now: new Date("2026-11-03T03:17:00Z"), fetchImpl: fake({ seen: seen2 }), sleep: async () => {} });
  assert.equal(seen2.filter((s) => s.init.method === "POST").length, 1);
  const out3 = await run({ token: TOKEN, cfg, hotelSettings: hs, now: new Date("2026-11-02T03:17:00Z"), fetchImpl: async () => { throw new Error("çağrılmamalı"); } });
  assert.equal(out3.plan.length, 0); console.log("ok 6: bütçe, şehir filtresi, boş gün"); }

// 7) ölümcül hatalar
await assert.rejects(() => run({ token: "", cfg, hotelSettings: hs }), /APIFY_TOKEN/);
{ const err = await run({ token: TOKEN, cfg, hotelSettings: hs, mode: "test", concurrency: 1, now: new Date("2026-11-03T03:17:00Z"), fetchImpl: fake({ status: 401, body: "bad " + TOKEN }), sleep: async () => {} }).catch((e) => e.message);
  assert.match(err, /geçersiz/); assert.ok(!err.includes(TOKEN)); }
console.log("ok 7: hatalar");
console.log("TÜM TESTLER GEÇTİ");
