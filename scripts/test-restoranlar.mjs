import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parsePrice, perPersonEur, toCandidate, eligible, selectRestaurants, searchInput, refreshInput, run, toMarkdown, emptyRestaurants, fetchFx, mutfakTr, withMutfakTr } from "./restoranlar.mjs";

const cfg = JSON.parse(await readFile(new URL("../data/restoran-ayarlari.json", import.meta.url), "utf8"));
const hotels = JSON.parse(await readFile(new URL("../data/hotels.json", import.meta.url), "utf8"));
const TOKEN = "apify_api_TESTJETON1234567890abcdef";
const res = (b, status = 200) => ({ ok: status < 400, status, text: async () => (typeof b === "string" ? b : JSON.stringify(b)), json: async () => b });
const BUD = cfg.sehirler.find((c) => c.sehir === "Budapeşte");
const FX = { EUR: 1, HUF: 400, CZK: 25, PLN: 4, SEK: 10, DKK: 7.5, RON: 5, BGN: 1.95583, GBP: 0.85, USD: 1.1 };

// 0) ayarlar: otel listesindeki her şehir var, merkez ve yarıçap makul
{ const names = new Set(cfg.sehirler.map((c) => c.sehir));
  for (const c of hotels.sehirler) assert.ok(names.has(c.sehir), c.sehir);
  for (const c of cfg.sehirler) { assert.ok(c.merkez[0] > 34 && c.merkez[0] < 61 && c.merkez[1] > -10 && c.merkez[1] < 27, c.sehir); assert.ok(c.yaricap_km >= 0.8 && c.yaricap_km <= 3); }
  console.log(`ok 0: ${cfg.sehirler.length} şehir`); }

// 0b) Türkçe mutfak adı: sözlük, milliyet, bilinmeyende " restaurant" atılır; veri dosyasında her restoranda var
{ const cases = { "Haute French restaurant": "Fransız (üst düzey)", "Doner kebab restaurant": "Döner", "Fine dining restaurant": "Gurme", "Breakfast restaurant": "Kahvaltı",
    "Brunch restaurant": "Brunch", "Hungarian restaurant": "Macar mutfağı", "Tapas restaurant": "Tapas", "Modern European restaurant": "Modern Avrupa", "Sandwich shop": "Sandviç",
    "Steak house": "Steakhouse", "Italian restaurant": "İtalyan", "Restaurant": "Restoran", "Lithuanian restaurant": "Litvanya", "Klingon restaurant": "Klingon", "Poke bar": "Poke bar" };
  for (const [en, tr] of Object.entries(cases)) assert.equal(mutfakTr(en), tr, en);
  assert.equal(mutfakTr(null), null);
  assert.equal(withMutfakTr({ mutfak: "Italian restaurant", mutfakTr: "eski" }).mutfakTr, "İtalyan", "robot seçiminde yeniden hesaplanır");
  assert.equal(withMutfakTr({ mutfak: "Italian restaurant", mutfakTr: "Napoliten pizza", kilit: true }).mutfakTr, "Napoliten pizza", "tablodan elle yazılan korunur");
  const data = JSON.parse(await readFile(new URL("../data/restoranlar.json", import.meta.url), "utf8"));
  for (const [s, c] of Object.entries(data.sehirler)) for (const r of c.restoranlar) assert.ok(!r.mutfak || r.mutfakTr, `${s} ${r.ad} mutfakTr`);
  console.log("ok 0b: Türkçe mutfak adı"); }

// 1) fiyat yazısı (Google'ın gerçek biçimleri)
assert.deepEqual(parsePrice("Ft 2,000–4,000", "HUF"), { alt: 2000, ust: 4000, arti: false, para: "HUF" });
assert.deepEqual(parsePrice("Ft 20,000+", "HUF"), { alt: 20000, ust: null, arti: true, para: "HUF" });
assert.deepEqual(parsePrice("€10–20", "EUR"), { alt: 10, ust: 20, arti: false, para: "EUR" });
assert.deepEqual(parsePrice("€100+", "EUR"), { alt: 100, ust: null, arti: true, para: "EUR" });
assert.deepEqual(parsePrice("200–400 Kč", "CZK"), { alt: 200, ust: 400, arti: false, para: "CZK" });
assert.deepEqual(parsePrice("zł 40–60", "PLN"), { alt: 40, ust: 60, arti: false, para: "PLN" });
assert.deepEqual(parsePrice("SEK 200–300", "SEK"), { alt: 200, ust: 300, arti: false, para: "SEK" });
assert.equal(parsePrice("kr 150–250", "DKK").para, "DKK"); assert.equal(parsePrice("kr 150–250", "SEK").para, "SEK");
assert.equal(parsePrice("2.000–4.000 Ft", "HUF").ust, 4000); assert.equal(parsePrice("$$", "EUR"), null); assert.equal(parsePrice(null, "EUR"), null);
console.log("ok 1: fiyat yazısı");

// 2) kişi başı euro
assert.equal(perPersonEur(parsePrice("Ft 2,000–4,000", "HUF"), FX), 7.5);
assert.equal(perPersonEur(parsePrice("€100+", "EUR"), FX), 130);
assert.equal(perPersonEur(parsePrice("200–400 Kč", "CZK"), FX), 12);
assert.equal(perPersonEur({ alt: 10, ust: 20, para: "XXX" }, FX), null); console.log("ok 2: euro çevirisi");

// 3) aday ve uygunluk
const row = (title, score, reviews, price, o = {}) => ({ title, placeId: "id-" + title, totalScore: score, reviewsCount: reviews, price, categoryName: "Hungarian restaurant", categories: ["Hungarian restaurant"], neighborhood: "District V.", location: { lat: 47.498123, lng: 19.051234 }, url: "https://www.google.com/maps/search/?api=1&query=x&query_place_id=" + title, searchString: "restaurant", ...o });
{ const c = toCandidate(row("Retek", 4.8, 6711, "Ft 4,000–8,000"), BUD, FX);
  assert.equal(c.kisiBasiEur, 15); assert.deepEqual(c.konum, [47.49812, 19.05123]); assert.ok(eligible(c, cfg));
  assert.ok(!eligible(toCandidate(row("McDonald's Deák", 4.5, 9000, "Ft 2,000–4,000"), BUD, FX), cfg), "zincir");
  assert.ok(!eligible(toCandidate(row("Szimpla", 4.6, 50000, "Ft 2,000–4,000", { categoryName: "Bar" }), BUD, FX), cfg), "bar");
  assert.ok(!eligible(toCandidate(row("Kapalı", 4.9, 900, "Ft 2,000–4,000", { temporarilyClosed: true }), BUD, FX), cfg), "kapalı");
  assert.ok(!eligible(toCandidate(row("Fiyatsız", 4.9, 900, null), BUD, FX), cfg), "fiyatsız");
  assert.equal(toCandidate({ title: "x" }, BUD, FX), null); console.log("ok 3: aday ve uygunluk"); }

// 4) seçim: 2 uygun, 2 popüler, 2 lüks; kurallara uyar
const sample = [
  ["Cheap A", 4.8, 900, "Ft 2,000–4,000", "Hamburger restaurant"], ["Cheap B", 4.7, 1500, "Ft 2,000–4,000", "Falafel restaurant"], ["Cheap C", 4.9, 120, "Ft 2,000–4,000", "Soup restaurant"],
  ["Cheap D", 4.2, 5000, "Ft 2,000–4,000", "Pizza restaurant"], ["Cheap E", 4.9, 2000, "Ft 2,000–4,000", "Hamburger restaurant"],
  ["Mid Huge", 4.6, 42000, "Ft 6,000–16,000", "Fusion restaurant"], ["Mid Big", 4.8, 40000, "Ft 6,000–18,000", "Restaurant"], ["Mid Small", 4.9, 800, "Ft 6,000–16,000", "Restaurant"],
  ["Mid Low", 4.4, 60000, "Ft 6,000–16,000", "Restaurant"], ["Mid X", 4.6, 3000, "Ft 4,000–10,000", "Bistro"], ["Mid Y", 4.7, 4000, "Ft 4,000–8,000", "Hungarian restaurant"],
  ["Lux Fine", 4.8, 704, "Ft 20,000+", "Fine dining restaurant"], ["Lux Plus", 4.7, 4542, "Ft 20,000+", "Turkish restaurant"], ["Lux Tiny", 4.9, 40, "Ft 20,000+", "Fine dining restaurant"],
].map(([t, s, r, p, k]) => toCandidate(row(t, s, r, p, { categoryName: k, categories: [k] }), BUD, FX));
{ const s = selectRestaurants(sample, cfg), by = (t) => s.secilen.filter((x) => x.seviye === t).map((x) => x.ad);
  assert.equal(s.secilen.length, 6);
  assert.equal(by("uygun").length, 2);
  assert.ok(!by("uygun").includes("Cheap C"), "yorum az"); assert.ok(!by("uygun").includes("Cheap D"), "puan düşük");
  assert.ok(!(by("uygun").includes("Cheap A") && by("uygun").includes("Cheap E")), "aynı mutfaktan iki tane olmaz");
  assert.deepEqual(by("populer").sort(), ["Mid Big", "Mid Huge"], "en çok yorumlu popüler");
  assert.ok(!by("populer").includes("Mid Low"), "popülerde puan 4,5+");
  assert.ok(by("luks").includes("Lux Fine") && by("luks").includes("Lux Plus")); assert.ok(!by("luks").includes("Lux Tiny"));
  for (const t of ["uygun", "populer", "luks"]) { const v = s.secilen.filter((x) => x.seviye === t).map((x) => x.kisiBasiEur); assert.deepEqual(v, v.slice().sort((a, b) => a - b)); }
  console.log("ok 4: seçim kuralları"); }

// 5) az aday varsa komşudan doldurur ama fiyatsız/düşük puanlı almaz
{ const few = sample.filter((c) => !c.ad.startsWith("Lux")); const s = selectRestaurants(few, cfg);
  assert.equal(s.secilen.length, 6); assert.ok(s.secilen.every((x) => x.puan >= cfg.secim.min_puan));
  const mx = (t) => Math.max(...s.secilen.filter((x) => x.seviye === t).map((x) => x.kisiBasiEur)), mn = (t) => Math.min(...s.secilen.filter((x) => x.seviye === t).map((x) => x.kisiBasiEur));
  assert.ok(mn("luks") >= mx("uygun"), "lüks, uygundan pahalı"); console.log("ok 5: seviyeler şehrin kendi fiyatlarına göre"); }

// 6) Apify girdileri
{ const i = searchInput(cfg, BUD); assert.deepEqual(i.customGeolocation.coordinates, [BUD.merkez[1], BUD.merkez[0]]); assert.equal(i.scrapePlaceDetailPage, true); assert.ok(i.searchStringsArray.includes("restaurant"));
  const r = refreshInput([{ url: "https://maps/1" }, { url: null }]); assert.deepEqual(r.startUrls, [{ url: "https://maps/1" }]); console.log("ok 6: girdiler"); }

// Sahte Apify + kur
function fake({ seen = [], rowsFor } = {}) {
  const runs = {}; let n = 0;
  return async (url, init = {}) => {
    seen.push({ url, init }); const u = new URL(url);
    if (u.hostname.includes("frankfurter")) return res({ date: "2026-10-29", rates: { HUF: 400, CZK: 25, PLN: 4, SEK: 10, DKK: 7.5, RON: 5, GBP: 0.85, USD: 1.1 } });
    if (u.pathname.endsWith("/users/me/limits")) return res({ data: { current: { monthlyUsageUsd: 10 }, limits: { maxMonthlyUsageUsd: 45 } } });
    if (init.method === "POST") { const id = "r" + ++n; runs[id] = JSON.parse(init.body); return res({ data: { id, status: "SUCCEEDED", defaultDatasetId: "ds" + id } }); }
    return res(rowsFor(runs[u.pathname.split("/")[3].slice(2)]));
  };
}
const raw = sample.map((c) => row(c.ad, c.puan, c.yorum, c.fiyatYazi, { categoryName: c.mutfak, categories: [c.mutfak] }));
const hs = { ...hotels.ayarlar, aylik_butce_usd: 45 };

// 7) keşif uçtan uca (2 şehir), kur ECB'den
{ const seen = []; const out = await run({ token: TOKEN, cfg, hotelSettings: hs, mode: "kesif", only: ["Budapeşte", "Prag"], fetchImpl: fake({ seen, rowsFor: () => raw }), sleep: async () => {} });
  assert.equal(seen.filter((s) => s.init.method === "POST").length, 2); assert.equal(out.report.sehir, 2); assert.equal(out.state.sehirler["Budapeşte"].restoranlar.length, 6);
  assert.match(out.state.kur.kaynak, /ECB/); assert.equal(out.cands.sehirler["Budapeşte"].adaylar.length, sample.length);
  assert.ok(out.state.harcama.usd > 0); assert.match(toMarkdown({ ...out, cfg }), /Budapeşte/); assert.ok(seen.every((s) => !s.url.includes(TOKEN)));
  // 8) yenile: seçim korunur, kapanan değiştirilir
  const closed = (inp) => inp.startUrls.map((s) => { const c = sample.find((x) => s.url.endsWith(x.ad)); return row(c.ad, c.puan, c.yorum, c.fiyatYazi, { categoryName: c.mutfak, categories: [c.mutfak], permanentlyClosed: c.ad === "Mid Huge" }); });
  const seen2 = []; const out2 = await run({ token: TOKEN, cfg, state: out.state, cands: out.cands, hotelSettings: hs, mode: "yenile", only: ["Budapeşte"], fetchImpl: fake({ seen: seen2, rowsFor: closed }), sleep: async () => {} });
  const before = out.state.sehirler["Budapeşte"].restoranlar.map((x) => x.ad), after = out2.state.sehirler["Budapeşte"].restoranlar.map((x) => x.ad);
  assert.equal(JSON.parse(seen2.find((s) => s.init.method === "POST").init.body).startUrls.length, 6);
  if (before.includes("Mid Huge")) { assert.ok(!after.includes("Mid Huge")); assert.match(out2.report.degisen.join(), /Mid Huge çıkarıldı/); }
  assert.equal(after.length, 6); for (const n of before.filter((x) => x !== "Mid Huge")) assert.ok(after.includes(n), "korunur: " + n);
  console.log("ok 7-8: keşif ve yenileme"); }

// 9) sec modu Apify'a gitmez; bütçe dolunca atlar; kur yedeği
{ const seen = []; const cands = { sehirler: { "Budapeşte": { adaylar: sample } } };
  const out = await run({ token: "", cfg, cands, mode: "sec", only: ["Budapeşte"], fetchImpl: fake({ seen, rowsFor: () => [] }) });
  assert.equal(seen.filter((s) => !new URL(s.url).hostname.includes("frankfurter")).length, 0); assert.equal(out.state.sehirler["Budapeşte"].restoranlar.length, 6);
  const fx = await fetchFx(cfg, async () => { throw new Error("ağ yok"); }); assert.match(fx.kaynak, /yedek/); assert.equal(fx.EUR, 1);
  const full = async (url, init = {}) => { if (url.includes("/users/me/limits")) return res({ data: { current: { monthlyUsageUsd: 44.99 }, limits: { maxMonthlyUsageUsd: 45 } } }); return fake({ rowsFor: () => raw })(url, init); };
  await assert.rejects(() => run({ token: TOKEN, cfg, hotelSettings: hs, mode: "kesif", only: ["Paris"], fetchImpl: full, sleep: async () => {} }), /bütçe/);
  console.log("ok 9: sec modu, kur yedeği, bütçe"); }

// 10) tablodan kilitlenen restoran korunur, haric olan seçilmez
{ const cands = { sehirler: { "Budapeşte": { adaylar: sample } } };
  const first = await run({ token: "", cfg, cands, mode: "sec", only: ["Budapeşte"], fetchImpl: fake({ seen: [], rowsFor: () => [] }) });
  const st = structuredClone(first.state), b = st.sehirler["Budapeşte"];
  const lockedOne = { ...b.restoranlar[0], kisiBasiEur: 99, fiyatYazi: "elle", seviye: "luks", kilit: true };
  const elle = { id: "elle-benim-yerim", ad: "Benim Yerim", kisiBasiEur: 12, seviye: "uygun", kilit: true, puan: null, yorum: 0 };
  const outId = b.restoranlar[1].id;
  b.restoranlar = [lockedOne, elle, ...b.restoranlar.slice(2)]; b.haric = [outId];
  const out = await run({ token: "", cfg, state: st, cands, mode: "sec", only: ["Budapeşte"], fetchImpl: fake({ seen: [], rowsFor: () => [] }) });
  const r = out.state.sehirler["Budapeşte"];
  const L = r.restoranlar.find((x) => x.id === lockedOne.id);
  assert.ok(L && L.kisiBasiEur === 99 && L.seviye === "luks" && L.kilit, "kilitli değerler korunur");
  assert.ok(r.restoranlar.some((x) => x.id === "elle-benim-yerim"), "elle eklenen kalır");
  assert.ok(!r.restoranlar.some((x) => x.id === outId), "haric seçilmez");
  assert.deepEqual(r.haric, [outId]);
  for (const t of ["uygun", "populer", "luks"]) assert.ok(r.restoranlar.filter((x) => x.seviye === t).length <= Math.max(cfg.secim[t], r.restoranlar.filter((x) => x.seviye === t && x.kilit).length));
  console.log("ok 10: kilit ve haric"); }
console.log("TÜM TESTLER GEÇTİ");
