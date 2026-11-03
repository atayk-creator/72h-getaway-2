import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { toRecord, levelOf, run, lookupInput } from "./elle-restoranlar.mjs";
import { run as robot } from "./restoranlar.mjs";

const cfg = JSON.parse(await readFile(new URL("../data/elle-restoranlar.json", import.meta.url), "utf8"));
const rcfg = JSON.parse(await readFile(new URL("../data/restoran-ayarlari.json", import.meta.url), "utf8"));
const AMS = rcfg.sehirler.find((c) => c.sehir === "Amsterdam"), FX = { EUR: 1 };
const row = (title, o = {}) => ({ title, placeId: "p-" + title, totalScore: 4.6, reviewsCount: 1200, price: "€10–20", categoryName: "Cafe", neighborhood: "De Pijp", location: { lat: 52.35, lng: 4.89 }, url: "https://www.google.com/maps/search/?api=1&query=x", ...o });

// 0) ayar: 13 mekân, hepsinde arama ve yedek fiyat
{ const a = cfg.sehirler.Amsterdam.restoranlar; assert.equal(a.length, 13); for (const x of a) { assert.ok(x.arama && x.ad); assert.ok(x.yedek_fiyat > 0); } console.log("ok 0: ayar"); }
// 1) seviye kuralı
assert.equal(levelOf(9), "uygun"); assert.equal(levelOf(15), "uygun"); assert.equal(levelOf(40), "populer"); assert.equal(levelOf(75), "luks"); console.log("ok 1: seviye");
// 2) Google fiyatı varsa o, yoksa yedek; ad uyuşmazsa konum/puan yok
{ const it = { ad: "Chun", arama: "Chun Berenstraat Amsterdam", tur: "Sandviç", yedek_fiyat: 15, not: "n" };
  const a = toRecord(it, row("CHUN"), AMS, FX); assert.equal(a.rec.kisiBasiEur, 15); assert.equal(a.rec.fiyatKaynagi, "google"); assert.equal(a.rec.kilit, true); assert.equal(a.rec.elle, true); assert.equal(a.rec.puan, 4.6); assert.equal(a.rec.mutfakTr, "Sandviç"); assert.ok(!a.uyari);
  const b = toRecord(it, row("Chun", { price: null }), AMS, FX); assert.equal(b.rec.kisiBasiEur, 15); assert.equal(b.rec.fiyatKaynagi, "tahmini"); assert.match(b.uyari, /yedek/);
  const c = toRecord({ ...it, ad: "The Siren", arama: "The SIREN Restaurant Rokin Amsterdam", yedek_fiyat: 80 }, row("Burger King Damrak"), AMS, FX);
  assert.equal(c.rec.puan, null); assert.equal(c.rec.konum, null); assert.equal(c.rec.seviye, "luks"); assert.match(c.uyari, /eşleşmedi/);
  const d = toRecord({ ...it, seviye: "luks" }, row("Chun", { price: "€50–100" }), AMS, FX); assert.equal(d.rec.kisiBasiEur, 75); assert.equal(d.rec.seviye, "luks");
  console.log("ok 2: kayıt"); }
// 3) uçtan uca (sahte Apify): Amsterdam'ın listesi değişir, sadeceElle; restoran robotu sonra ekleme yapmaz
const res = (b, s = 200) => ({ ok: s < 400, status: s, text: async () => JSON.stringify(b), json: async () => b });
const fake = async (url, init = {}) => {
  if (url.includes("frankfurter")) return res({ date: "2026-11-03", rates: { HUF: 380 } });
  if (url.includes("/users/me/limits")) return res({ data: { current: { monthlyUsageUsd: 40 }, limits: { maxMonthlyUsageUsd: 75 } } });
  if (init.method === "POST") return res({ data: { id: "r1", status: "SUCCEEDED", defaultDatasetId: "ds1" } });
  if (url.includes("/datasets/")) return res(lookupInput(cfg.sehirler.Amsterdam.restoranlar).searchStringsArray.map((s, i) => ({ ...row(cfg.sehirler.Amsterdam.restoranlar[i].ad, { price: i % 3 ? "€20–30" : null }), searchString: s })));
  return res({ data: { status: "SUCCEEDED" } });
};
{ const state = JSON.parse(await readFile(new URL("../data/restoranlar.json", import.meta.url), "utf8"));
  const before = state.sehirler.Paris;
  const { state: out, report } = await run({ token: "apify_api_TEST", cfg, rcfg, state, fetchImpl: fake, sleep: async () => {} });
  const a = out.sehirler.Amsterdam; assert.equal(a.restoranlar.length, 13); assert.equal(a.sadeceElle, true); assert.ok(a.restoranlar.every((r) => r.kilit && r.elle));
  assert.deepEqual(out.sehirler.Paris, before, "diğer şehirler değişmez"); assert.equal(report.yer, 13);
  const cands = { sehirler: { Amsterdam: { adaylar: [{ id: "x1", ad: "Robot Yeri", mutfak: "Restaurant", puan: 4.8, yorum: 900, kisiBasiEur: 10, kategoriler: [] }, { id: "x2", ad: "Robot Lüks", mutfak: "Fine dining restaurant", puan: 4.8, yorum: 900, kisiBasiEur: 150, kategoriler: [] }] } } };
  const again = await robot({ token: "", cfg: rcfg, state: out, cands, mode: "sec", only: ["Amsterdam"], fetchImpl: fake });
  const r = again.state.sehirler.Amsterdam; assert.equal(r.restoranlar.length, 13); assert.ok(!r.restoranlar.some((x) => x.id.startsWith("x"))); assert.equal(r.sadeceElle, true);
  console.log("ok 3: uçtan uca, robot elle listeye dokunmuyor"); }
console.log("TÜM TESTLER GEÇTİ");
