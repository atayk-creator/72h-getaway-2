import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { update, validate, fromDaily, SRC_DAILY, SRC_ECB } from "./update-rates.mjs";

const NOW = new Date("2026-10-05T12:00:00Z");
const base = { updated: "2026-10-02", eurTry: 55.3, eurHuf: 368.5, source: "elle" };
const ok = (rates, date = "2026-10-05") => async () => ({ ok: true, status: 200, json: async () => ({ base: "EUR", date, rates }) });
async function tmpFile(obj = base) { const d = await mkdtemp(join(tmpdir(), "kur-")); const f = join(d, "data.json"); await writeFile(f, JSON.stringify(obj)); return f; }

// 1) normal güncelleme
{ const f = await tmpFile(); const changed = await update({ file: f, now: NOW, fetchImpl: ok({ TRY: 55.8123, HUF: 370.456, CZK: 24.312345, PLN: 4.25, SEK: -1 }) });
  const j = JSON.parse(await readFile(f, "utf8"));
  assert.equal(changed, true); assert.equal(j.eurTry, 55.81); assert.equal(j.eurHuf, 370.46); assert.equal(j.updated, "2026-10-05"); assert.match(j.source, /ECB/); assert.deepEqual(j.kurlar, { CZK: 24.3123, PLN: 4.25 }); console.log("ok 1: normal güncelleme, diğer kurlar"); }
// 2) değişiklik yoksa dosya yazılmaz
{ const f = await tmpFile({ ...base, updated: "2026-10-05", eurTry: 55.81, eurHuf: 370.46, kurlar: {}, source: "ECB referans kuru (Frankfurter API)" });
  assert.equal(await update({ file: f, now: NOW, fetchImpl: ok({ TRY: 55.81, HUF: 370.46 }) }), false); console.log("ok 2: değişiklik yok"); }
// 3) birinci adres düşerse ikincisi denenir
{ let n = 0; const f = await tmpFile(); const fetchImpl = async () => (++n === 1 ? { ok: false, status: 503, json: async () => ({}) } : { ok: true, status: 200, json: async () => ({ date: "2026-10-05", rates: { TRY: 56, HUF: 371 } }) });
  assert.equal(await update({ file: f, now: NOW, fetchImpl }), true); assert.equal(n, 2); console.log("ok 3: yedek adres"); }
// 4) iki adres de düşerse hata verir ve dosyaya dokunmaz
{ const f = await tmpFile(); const fetchImpl = async () => { throw new Error("ağ yok"); };
  await assert.rejects(() => update({ file: f, fetchImpl }), /Kur alınamadı/); assert.deepEqual(JSON.parse(await readFile(f, "utf8")), base); console.log("ok 4: ağ hatası dosyayı bozmuyor"); }
// 5) saçma değer reddedilir
for (const bad of [{ TRY: 0.5, HUF: 370 }, { TRY: 55, HUF: 5 }, { TRY: "55", HUF: 370 }, {}]) assert.throws(() => validate({ date: "2026-10-05", rates: bad }));
assert.throws(() => validate({ date: "bugün", rates: { TRY: 55, HUF: 370 } })); console.log("ok 5: geçersiz veri reddediliyor");
// 6) ani sıçrama (%15 üzeri) engellenir
{ const f = await tmpFile(); await assert.rejects(() => update({ file: f, now: NOW, fetchImpl: ok({ TRY: 80, HUF: 370 }) }), /Elle kontrol et/); assert.deepEqual(JSON.parse(await readFile(f, "utf8")), base); console.log("ok 6: ani sıçrama engelleniyor"); }
// 7) hafta sonu: ECB cuma kurunu verir, günlük kaynak bugünü verir -> günlük kullanılır
const route = (ecb, daily) => async (url) => url.includes("currency-api")
  ? (daily ? { ok: true, status: 200, json: async () => daily } : { ok: false, status: 503, json: async () => ({}) })
  : { ok: true, status: 200, json: async () => ecb };
const SAT = new Date("2026-10-31T09:00:00Z");
const ecbFri = { date: "2026-10-30", rates: { TRY: 55.8, HUF: 366.33, CZK: 24.35 } };
const dSat = { date: "2026-10-31", eur: { try: 55.912345, huf: 366.8, czk: 24.36, pln: 4.4, sek: 10.98, dkk: 7.47, ron: 5.34 } };
{ const f = await tmpFile({ ...base, updated: "2026-10-30", eurTry: 55.8, eurHuf: 366.33 });
  assert.equal(await update({ file: f, now: SAT, fetchImpl: route(ecbFri, dSat) }), true);
  const j = JSON.parse(await readFile(f, "utf8")); assert.equal(j.updated, "2026-10-31"); assert.equal(j.eurTry, 55.91); assert.equal(j.source, SRC_DAILY); assert.equal(j.kurlar.RON, 5.34);
  console.log("ok 7: hafta sonu günlük kur"); }
// 8) iş günü ECB bugünün kurunu verdiyse günlük kaynağa hiç gidilmez
{ let daily = 0; const f = await tmpFile({ ...base, updated: "2026-10-30", eurTry: 55.8, eurHuf: 366.33 });
  const fi = async (url) => { if (url.includes("currency-api")) daily++; return route({ date: "2026-11-02", rates: { TRY: 56, HUF: 367 } }, dSat)(url); };
  await update({ file: f, now: new Date("2026-11-02T16:00:00Z"), fetchImpl: fi });
  const j = JSON.parse(await readFile(f, "utf8")); assert.equal(daily, 0); assert.equal(j.source, SRC_ECB); assert.equal(j.updated, "2026-11-02");
  console.log("ok 8: iş günü ECB"); }
// 9) günlük kaynak düşerse ECB'nin son kuruyla devam; ECB düşerse günlük kur
{ const f = await tmpFile({ ...base, updated: "2026-10-29", eurTry: 55.4, eurHuf: 366 });
  assert.equal(await update({ file: f, now: SAT, fetchImpl: route(ecbFri, null) }), true);
  assert.equal(JSON.parse(await readFile(f, "utf8")).updated, "2026-10-30");
  const g = await tmpFile({ ...base, updated: "2026-10-29", eurTry: 55.4, eurHuf: 366 });
  const noEcb = async (url) => url.includes("currency-api") ? { ok: true, status: 200, json: async () => dSat } : { ok: false, status: 500, json: async () => ({}) };
  assert.equal(await update({ file: g, now: SAT, fetchImpl: noEcb }), true); assert.equal(JSON.parse(await readFile(g, "utf8")).source, SRC_DAILY);
  console.log("ok 9: kaynaklardan biri düşerse diğeri"); }
// 10) eldeki kurdan eski kura geri dönülmez (pazartesi sabahı ECB hâlâ cuma, günlük kaynak düşük)
{ const f = await tmpFile({ ...base, updated: "2026-11-01", eurTry: 55.9, eurHuf: 366.8 });
  assert.equal(await update({ file: f, now: new Date("2026-11-02T04:00:00Z"), fetchImpl: route(ecbFri, null) }), false);
  assert.throws(() => fromDaily({ date: "2026-10-31", eur: { try: 0.01, huf: 366 } }));
  console.log("ok 10: eski kura dönmez, saçma günlük değer reddedilir"); }
console.log("TÜM TESTLER GEÇTİ");
