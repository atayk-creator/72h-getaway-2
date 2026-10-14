import assert from "node:assert/strict";
import { weekendTrips, median, buildUrl, normalizeLink, getOffers, run, toMarkdown, ROUTES } from "./ucus-fiyatlari.mjs";

const TOKEN = "TESTJETON1234567890abcdef12345678";
const ok = (b, status = 200) => ({ ok: status < 400, status, text: async () => (typeof b === "string" ? b : JSON.stringify(b)) });
const offer = (price, o = {}) => ({ origin: "IST", destination: "BUD", price, airline: "TK", flight_number: 1035, departure_at: "2026-12-08T08:00:00+03:00", return_at: "2026-12-11T20:00:00+01:00", transfers: 0, return_transfers: 0, duration: 330, link: "/search/IST0812BUD11121?t=abc", ...o });
const base = { token: TOKEN, now: new Date("2026-10-14T10:00:00Z"), sleep: async () => {} };

// 1) hafta sonu: cuma gidiş, pazar dönüş
{ const w = weekendTrips(new Date("2026-10-14T10:00:00Z"), 4);
  assert.equal(w.length, 4); assert.equal(w[0].departure, "2026-10-23"); assert.equal(w[0].return, "2026-10-25"); assert.equal(w[1].departure, "2026-10-30");
  for (const x of w) { assert.equal(new Date(x.departure).getUTCDay(), 5); assert.equal(new Date(x.return).getUTCDay(), 0); } console.log("ok 1: hafta sonu tarihleri"); }
// 2) adres: doğru uç nokta ve parametreler, jeton adreste YOK
{ const u = new URL(buildUrl(ROUTES[0], ROUTES[0].trips[0]));
  assert.equal(u.origin + u.pathname, "https://api.travelpayouts.com/aviasales/v3/prices_for_dates");
  assert.equal(u.searchParams.get("origin"), "IST"); assert.equal(u.searchParams.get("destination"), "BUD"); assert.equal(u.searchParams.get("departure_at"), "2026-12-08");
  assert.equal(u.searchParams.get("return_at"), "2026-12-11"); assert.equal(u.searchParams.get("one_way"), "false"); assert.equal(u.searchParams.get("currency"), "eur");
  assert.ok(!u.search.includes("token"), "jeton adrese yazılmamalı"); console.log("ok 2: adres ve parametreler, jeton adreste yok"); }
// 3) bağlantı biçimleri
assert.equal(normalizeLink("/search/IST0812BUD11121?t=a"), "https://www.aviasales.com/search/IST0812BUD11121?t=a");
assert.equal(normalizeLink("IST0812BUD11121?t=a"), "https://www.aviasales.com/search/IST0812BUD11121?t=a"); assert.equal(normalizeLink(undefined), null); console.log("ok 3: bağlantı biçimleri");
// 4) başlıkla jeton gider, en ucuz seçilir, sayı olmayan fiyat elenir
{ let seen; const f = async (url, init) => { seen = init; return ok({ success: true, data: [offer(210), offer(160, { transfers: 1 }), offer("abc"), offer(null), offer(180, { transfers: 0 })], currency: "eur" }); };
  const o = await getOffers(ROUTES[0], ROUTES[0].trips[0], TOKEN, f);
  assert.equal(seen.headers["X-Access-Token"], TOKEN); assert.deepEqual(o.map((x) => x.price), [160, 180, 210]); assert.equal(o[0].link, "https://www.aviasales.com/search/IST0812BUD11121?t=abc"); console.log("ok 4: jeton başlıkta, en ucuz seçimi, bozuk fiyat elenir"); }
// 5) uçtan uca: Budapeşte tek tarih, Paris dört hafta sonu, ortanca
{ const prices = { "2026-10-23": 120, "2026-10-30": 140, "2026-11-06": 100, "2026-11-13": 200 };
  const f = async (url) => { const u = new URL(url);
    if (u.searchParams.get("destination") === "BUD") return ok({ success: true, data: [offer(190), offer(230, { transfers: 1 })] });
    const p = prices[u.searchParams.get("departure_at")]; return ok({ success: true, data: p ? [offer(p, { destination: "PAR" })] : [] }); };
  const r = await run({ ...base, fetchImpl: f });
  const b = r.routes[0], p = r.routes[1];
  assert.equal(b.summary.cheapestEur, 190); assert.equal(b.rows[0].cheapestDirect.price, 190);
  assert.equal(p.summary.tripsTotal, 4); assert.equal(p.summary.tripsWithPrice, 4); assert.equal(p.summary.cheapestEur, 100); assert.equal(p.summary.medianEur, 130, "ortanca: 100,120,140,200");
  const md = toMarkdown(r); assert.match(md, /İstanbul → Paris/); assert.match(md, /önbellek/); assert.ok(!md.includes(TOKEN)); console.log("ok 5: uçtan uca, ortanca ve özet"); }
// 6) veri yoksa uydurmaz
{ const r = await run({ ...base, fetchImpl: async () => ok({ success: true, data: [] }) });
  assert.equal(r.routes[0].summary.cheapestEur, null); assert.equal(r.routes[1].summary.tripsWithPrice, 0); const md = toMarkdown(r); assert.match(md, /önbellekte fiyat yok/); assert.match(md, /hiçbirinde önbellekte fiyat yok/); console.log("ok 6: veri yoksa 'yok' yazar, tahmin yürütmez"); }
// 7) hatalar: 429, 401 (jeton yankılansa bile gizlenir), bozuk gövde, success:false, jeton yok
await assert.rejects(() => run({ ...base, fetchImpl: async () => ok("limit", 429) }), /Hiçbir istek başarılı olmadı: HTTP 429/);
{ const err = await run({ ...base, fetchImpl: async () => ok(`unauthorized ${TOKEN}`, 401) }).catch((e) => e.message);
  assert.match(err, /HTTP 401/); assert.ok(!err.includes(TOKEN), "jeton hata mesajına sızmamalı"); }
await assert.rejects(() => run({ ...base, fetchImpl: async () => ok("<html>bakım</html>") }), /JSON okunamadı/);
await assert.rejects(() => run({ ...base, fetchImpl: async () => ok({ success: false, error: "Wrong token", data: {} }) }), /API hatası: Wrong token/);
await assert.rejects(() => run({ ...base, token: "" }), /TRAVELPAYOUTS_TOKEN/); console.log("ok 7: hata mesajları, jeton sızmıyor");
// 8) bir tarih hata verirse diğerleri sürer ve hata satırda görünür
{ let n = 0; const f = async (url) => { n++; if (new URL(url).searchParams.get("departure_at") === "2026-10-30") return ok("limit", 500); return ok({ success: true, data: [offer(150, { destination: "PAR" })] }); };
  const r = await run({ ...base, fetchImpl: f }); const p = r.routes[1];
  assert.equal(p.summary.tripsWithPrice, 3); assert.ok(p.rows[1].error); assert.match(toMarkdown(r), /HATA: HTTP 500/); console.log("ok 8: tek tarih hatası işi durdurmaz, satırda görünür"); }
console.log("TÜM TESTLER GEÇTİ");
