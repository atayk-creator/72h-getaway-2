import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { update, validate } from "./update-rates.mjs";

const base = { updated: "2026-10-02", eurTry: 55.3, eurHuf: 368.5, source: "elle" };
const ok = (rates, date = "2026-10-05") => async () => ({ ok: true, status: 200, json: async () => ({ base: "EUR", date, rates }) });
async function tmpFile(obj = base) { const d = await mkdtemp(join(tmpdir(), "kur-")); const f = join(d, "data.json"); await writeFile(f, JSON.stringify(obj)); return f; }

// 1) normal güncelleme
{ const f = await tmpFile(); const changed = await update({ file: f, fetchImpl: ok({ TRY: 55.8123, HUF: 370.456 }) });
  const j = JSON.parse(await readFile(f, "utf8"));
  assert.equal(changed, true); assert.equal(j.eurTry, 55.81); assert.equal(j.eurHuf, 370.46); assert.equal(j.updated, "2026-10-05"); assert.match(j.source, /ECB/); console.log("ok 1: normal güncelleme"); }
// 2) değişiklik yoksa dosya yazılmaz
{ const f = await tmpFile({ ...base, updated: "2026-10-05", eurTry: 55.81, eurHuf: 370.46, source: "ECB referans kuru (Frankfurter API)" });
  assert.equal(await update({ file: f, fetchImpl: ok({ TRY: 55.81, HUF: 370.46 }) }), false); console.log("ok 2: değişiklik yok"); }
// 3) birinci adres düşerse ikincisi denenir
{ let n = 0; const f = await tmpFile(); const fetchImpl = async () => (++n === 1 ? { ok: false, status: 503, json: async () => ({}) } : { ok: true, status: 200, json: async () => ({ date: "2026-10-05", rates: { TRY: 56, HUF: 371 } }) });
  assert.equal(await update({ file: f, fetchImpl }), true); assert.equal(n, 2); console.log("ok 3: yedek adres"); }
// 4) iki adres de düşerse hata verir ve dosyaya dokunmaz
{ const f = await tmpFile(); const fetchImpl = async () => { throw new Error("ağ yok"); };
  await assert.rejects(() => update({ file: f, fetchImpl }), /Kur alınamadı/); assert.deepEqual(JSON.parse(await readFile(f, "utf8")), base); console.log("ok 4: ağ hatası dosyayı bozmuyor"); }
// 5) saçma değer reddedilir
for (const bad of [{ TRY: 0.5, HUF: 370 }, { TRY: 55, HUF: 5 }, { TRY: "55", HUF: 370 }, {}]) assert.throws(() => validate({ date: "2026-10-05", rates: bad }));
assert.throws(() => validate({ date: "bugün", rates: { TRY: 55, HUF: 370 } })); console.log("ok 5: geçersiz veri reddediliyor");
// 6) ani sıçrama (%15 üzeri) engellenir
{ const f = await tmpFile(); await assert.rejects(() => update({ file: f, fetchImpl: ok({ TRY: 80, HUF: 370 }) }), /Elle kontrol et/); assert.deepEqual(JSON.parse(await readFile(f, "utf8")), base); console.log("ok 6: ani sıçrama engelleniyor"); }
console.log("TÜM TESTLER GEÇTİ");
