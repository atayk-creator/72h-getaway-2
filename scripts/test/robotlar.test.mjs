// Robot testleri. Çalıştır: node --test scripts/test/
// Ağa çıkmaz: Travelpayouts, resmî sayfalar ve Claude API sahte yanıtlarla taklit edilir.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseCities, slugify } from "../lib/sehirler.mjs";
import { cost, DEFAULTS, parseResearched } from "../lib/hesap.mjs";
import { Meter, parseJson, searchedUrls, ask, digits, normUrl, BudgetError, NoKeyError } from "../lib/claude.mjs";
import * as ucus from "../ucus-fiyatlari.mjs";
import * as bilet from "../bilet-robotu.mjs";
import * as sehir from "../sehir-arastirmaci.mjs";
import * as icerik from "../icerik-robotu.mjs";
import * as denetci from "../denetci.mjs";

const HTML = await readFile(new URL("../../index.html", import.meta.url), "utf8");
const CITIES = parseCities(HTML);
const json = (obj, status = 200) => ({ ok: status < 400, status, text: async () => JSON.stringify(obj), json: async () => obj });
const claudeReply = (text, extra = {}) => json({ content: [{ type: "text", text }], stop_reason: "end_turn", usage: { input_tokens: 1000, output_tokens: 200 }, ...extra });
const withKey = async (fn) => { const k = process.env.ANTHROPIC_API_KEY; process.env.ANTHROPIC_API_KEY = "test-anahtar"; try { return await fn(); } finally { if (k === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = k; } };

// ---------- Şehir listesi ve hesap ----------
test("şehir listesi index.html'den okunuyor, hepsinin havalimanı kodu var", () => {
  assert.equal(CITIES.length, 37);
  for (const c of CITIES) assert.ok(c.iata, c.name + " için IATA yok");
  assert.equal(new Set(CITIES.map((c) => c.slug)).size, 37);
  assert.equal(slugify("Üsküp"), "uskup"); assert.equal(slugify("Kişinev"), "kisinev");
});

test("robotların bütçe hesabı uygulamanın hesabıyla birebir aynı", () => {
  // index.html'deki gerçek fonksiyonları çalıştırıp karşılaştırır: uygulama formülü değişirse bu test kırılır
  const part = HTML.slice(HTML.indexOf("var r5 ="), HTML.indexOf("var CHIP"));
  const costFn = HTML.slice(HTML.indexOf("function cost(c, o, idx, ridx)"), HTML.indexOf("/* ====================== MESAFE"));
  const app = new Function("visits", "foodMult", part + costFn + "; return { cost: cost };")(DEFAULTS.visits, 1);
  const bud = { hotels: parseResearched(HTML, "BUD_HOTELS"), restos: parseResearched(HTML, "BUD_RESTOS") };
  assert.ok(bud.hotels && bud.restos, "Budapeşte araştırma satırları okunamadı");
  for (const c0 of CITIES) {
    const c = c0.name === "Budapeşte" ? { ...c0, ...bud } : c0;
    const o = { nights: 3, ppl: 2, rooms: 1, act: true };
    assert.equal(cost(c, DEFAULTS).sum, app.cost(c, o, 1, 1).sum, c.name);
  }
});

// ---------- Claude ortak parçası ----------
test("maliyet sayacı ve bütçe sınırı", () => {
  const m = new Meter(0.01);
  m.add("claude-sonnet-5-5", { input_tokens: 1000, output_tokens: 100, server_tool_use: { web_search_requests: 1 } });
  assert.ok(Math.abs(m.usd - (0.002 + 0.001 + 0.01)) < 1e-9);
  assert.throws(() => m.check(), BudgetError);
});

test("JSON ayıklama, adres normalleştirme, rakam karşılaştırma", () => {
  assert.deepEqual(parseJson('Tamam:\n```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseJson('önce {"a":{"b":2}} sonra'), { a: { b: 2 } });
  assert.throws(() => parseJson("json yok"));
  assert.equal(normUrl("http://www.example.com/a/#x"), "https://example.com/a");
  assert.equal(digits("13 200 Ft"), "13200"); assert.equal(digits("13.200"), "13200");
});

test("API anahtarı yoksa çağrı yapılmaz", async () => {
  const k = process.env.ANTHROPIC_API_KEY; delete process.env.ANTHROPIC_API_KEY;
  await assert.rejects(() => ask({ model: "x", prompt: "y", fetchImpl: async () => { throw new Error("çağrılmamalı"); } }), NoKeyError);
  if (k !== undefined) process.env.ANTHROPIC_API_KEY = k;
});

test("geçici hata (529) yeniden denenir, pause_turn devam ettirilir", () => withKey(async () => {
  let n = 0; const sent = [];
  const fetchImpl = async (u, o) => { n++; sent.push(JSON.parse(o.body)); assert.equal(o.headers["x-api-key"], "test-anahtar");
    if (n === 1) return json({ error: { message: "overloaded" } }, 529);
    if (n === 2) return json({ content: [{ type: "text", text: "yarım " }], stop_reason: "pause_turn", usage: {} });
    return claudeReply("bitti"); };
  const orig = global.setTimeout; global.setTimeout = (f) => orig(f, 0);
  try { const r = await ask({ model: "m", prompt: "p", fetchImpl }); assert.equal(r.text, "yarım bitti"); assert.equal(n, 3); assert.equal(sent[2].messages.length, 2); }
  finally { global.setTimeout = orig; }
}));

test("web arama sürümü tanınmazsa eskisi denenir", () => withKey(async () => {
  const types = [];
  const fetchImpl = async (u, o) => { const b = JSON.parse(o.body); types.push(b.tools[0].type);
    return types.length === 1 ? json({ error: { message: "tools.0: unknown tool type web_search_20260318" } }, 400) : claudeReply("ok"); };
  await ask({ model: "m", prompt: "p", tools: [{ type: "web_search_20260318", name: "web_search" }], fetchImpl });
  assert.equal(types[0], "web_search_20260318"); assert.notEqual(types[1], types[0]);
}));

// ---------- Uçuş robotu ----------
test("uçuş: tarihler cuma gidiş, pazartesi dönüş", () => {
  const t = ucus.weekendTrips(new Date("2026-10-27T10:00:00Z"), 2);
  assert.deepEqual(t[0], { departure: "2026-10-30", return: "2026-11-02" });
  assert.equal(new Date(t[1].departure).getUTCDay(), 5); assert.equal(new Date(t[1].return).getUTCDay(), 1);
});

test("uçuş: şehir başına en ucuz ve ortanca, jeton adreste görünmez", async () => {
  const urls = [];
  const fetchImpl = async (u, o) => { urls.push(u); assert.equal(o.headers["X-Access-Token"], "GIZLI");
    const p = u.includes("destination=BUD") ? [{ price: 180, airline: "PC", transfers: 0, return_transfers: 0, link: "/search/IST3010BUD02111" }, { price: 150, airline: "W6", transfers: 1, link: "x" }] : [];
    return json({ success: true, data: p }); };
  const r = await ucus.run({ token: "GIZLI", cities: CITIES.filter((c) => ["Budapeşte", "Oslo"].includes(c.name)), fetchImpl, now: new Date("2026-10-27"), sleep: async () => {} });
  assert.equal(r.cities["Budapeşte"].minEur, 150); assert.equal(r.cities["Budapeşte"].best.stops, 1); assert.equal(r.cities["Budapeşte"].rows[0].directEur, 180);
  assert.equal(r.cities["Oslo"].minEur, null);
  assert.ok(urls.every((u) => !u.includes("GIZLI")));
});

test("uçuş: geçersiz jeton net hata verir ve durur", async () => {
  let n = 0; const fetchImpl = async () => { n++; return json({ message: "Unauthorized" }, 401); };
  await assert.rejects(() => ucus.run({ token: "x", cities: CITIES.slice(0, 5), fetchImpl, sleep: async () => {} }), /TRAVELPAYOUTS_TOKEN/);
  assert.equal(n, 1);
});

// ---------- Bilet robotu ----------
const PAGE = `<html><head><script>var x=1</script></head><body><h1>Prices</h1><table><tr><td>Daily ticket with locker (Mon-Thu)</td><td>13&nbsp;900 HUF</td></tr><tr><td>Daily ticket with locker (Fri-Sun)</td><td>14 800 HUF</td></tr></table>${"<p>Lorem ipsum dolor sit amet. </p>".repeat(20)}</body></html>`;
const PRICES = { version: 1, updated: "2026-10-02", items: {
  hafta_ici: { label: "Hafta içi", value: 13200, currency: "Ft", source: "https://bath.example/prices", tier: "resmi" },
  hafta_sonu: { label: "Hafta sonu", value: 14800, currency: "Ft", source: "https://bath.example/prices", tier: "resmi" },
  ikincil: { label: "Rehber fiyatı", value: 5000, currency: "Ft", source: "https://blog.example", tier: "ikincil" } } };

test("bilet: HTML metne çevrilir, kanıt kuralı çalışır", () => {
  const t = bilet.htmlToText(PAGE);
  assert.ok(t.includes("13 900 HUF")); assert.ok(!t.includes("var x"));
  assert.equal(bilet.verify(t, "Daily ticket with locker (Mon-Thu) 13 900 HUF", 13900), "ok"); // tablo satırı tek alıntı sayılır
  assert.equal(bilet.verify(t, "13 900 HUF", 13900), "ok");
  assert.equal(bilet.verify(t, "13 900 HUF", 15000), "rakam-alintida-yok");
  assert.equal(bilet.verify(t, "14 999 HUF", 14999), "alinti-sayfada-yok");
});

test("bilet: değişen fiyat önerilir, uydurma alıntı reddedilir, ikincil kaleme dokunulmaz", () => withKey(async () => {
  const pages = []; const fetchImpl = async (u) => { pages.push(u); return { ok: true, status: 200, text: async () => PAGE }; };
  const apiFetch = async () => claudeReply(JSON.stringify({ items: [
    { key: "hafta_ici", found: true, value: 13900, currency: "HUF", quote: "13 900 HUF" },
    { key: "hafta_sonu", found: true, value: 15500, currency: "HUF", quote: "15 500 HUF" } ] }));
  const r = await bilet.run({ prices: PRICES, fetchImpl, apiFetch, today: "2026-10-27" });
  assert.deepEqual(pages, ["https://bath.example/prices"]);
  assert.equal(r.changes.length, 1); assert.equal(r.next.items.hafta_ici.value, 13900); assert.equal(r.next.items.hafta_ici.previous, 13200);
  assert.equal(r.status.items.hafta_sonu.status, "dogrulanamadi"); assert.equal(r.next.items.hafta_sonu.value, 14800);
  assert.equal(r.status.items.ikincil, undefined);
  assert.match(bilet.report(r), /13900 Ft/);
}));

test("bilet: sayfa açılmazsa 'okunamadı', fiyat değişmez", () => withKey(async () => {
  const r = await bilet.run({ prices: PRICES, fetchImpl: async () => ({ ok: false, status: 403, text: async () => "" }), apiFetch: async () => { throw new Error("çağrılmamalı"); } });
  assert.equal(r.status.items.hafta_ici.status, "okunamadi"); assert.equal(r.changes.length, 0);
}));

// ---------- Şehir araştırmacısı ----------
const PARIS = CITIES.find((c) => c.name === "Paris");
const goodRaw = {
  hotels: [{ t: "Sade", name: "Hotel A", p: 115, source: "https://a.example/h1" }, { t: "Orta", name: "Hotel B", p: 170, sc: "8,7", source: "https://a.example/h2" }, { t: "Şık", name: "Hotel C", p: 260, source: "https://a.example/h3" }],
  restos: [{ t: "Ucuz", name: "Crêpe", p: 15, q: "Crêpe Paris", source: "https://a.example/r1" }, { t: "Orta", name: "Bistro", p: 40, source: "https://a.example/r2" }, { t: "Şık", name: "Le Chic", p: 95, source: "https://a.example/r3" }],
  transport: [{ label: "Tek bilet", value: 2.5, currency: "EUR", source: "https://ratp.example/" }],
  params: { f: null, t: 9, a: null, why: "Navigo", source: "https://ratp.example/" }, note: "Not" };
const seen = new Set(["https://a.example/h1", "https://a.example/h2", "https://a.example/h3", "https://a.example/r1", "https://a.example/r2", "https://a.example/r3", "https://ratp.example"].map(normUrl));

test("şehir: geçerli araştırma kabul edilir", () => {
  const v = sehir.validate(goodRaw, PARIS, seen);
  assert.equal(v.hotels.filter(Boolean).length, 3); assert.equal(v.restos.filter(Boolean).length, 3);
  assert.equal(v.hotels[1].s, "res"); assert.equal(v.params.t, 9); assert.deepEqual(v.problems, []);
});

test("şehir: uydurma kaynak, saçma fiyat ve aşırı tahmin düzeltmesi elenir", () => {
  const raw = JSON.parse(JSON.stringify(goodRaw));
  raw.hotels[0].source = "https://uydurma.example/otel"; raw.restos[2].p = 2000; raw.params.t = 80;
  const v = sehir.validate(raw, PARIS, seen);
  assert.equal(v.hotels[0], null); assert.equal(v.restos[2], null); assert.equal(v.params.t, undefined);
  assert.equal(v.problems.length, 3);
});

test("şehir: uçtan uca, kaynaklar arama sonuçlarından toplanıyor", () => withKey(async () => {
  const content = [
    { type: "server_tool_use", id: "s1", name: "web_search", input: { query: "Paris hotel" } },
    { type: "web_search_tool_result", tool_use_id: "s1", content: [...seen].map((url) => ({ type: "web_search_result", url, title: "t" })) },
    { type: "text", text: "```json\n" + JSON.stringify(goodRaw) + "\n```" }];
  const apiFetch = async (u, o) => { const b = JSON.parse(o.body); assert.equal(b.tools[0].name, "web_search"); return json({ content, stop_reason: "end_turn", usage: { input_tokens: 30000, output_tokens: 2000, server_tool_use: { web_search_requests: 6 } } }); };
  const r = await sehir.research(PARIS, { apiFetch, today: "2026-10-27" });
  assert.equal(r.file.confidence, "orta"); assert.equal(r.file.slug, "paris"); assert.ok(r.meter.usd < 0.2);
  assert.match(sehir.report(r), /Hotel B/);
}));

test("şehir: istenen şehir adı doğrulanır", async () => {
  assert.equal((await sehir.pickCity(CITIES, "paris")).name, "Paris");
  await assert.rejects(() => sehir.pickCity(CITIES, "Ankara"), /uygulamadaki şehirlerden/);
});

// ---------- İçerik robotu ----------
test("içerik: bilgi kartı uygulamanın rakamlarıyla dolu", async () => {
  const facts = await icerik.buildFacts({ now: new Date("2026-10-27") });
  assert.equal(facts.seri1_sehirler.length, 2); assert.equal(facts.seri2_karsilastirma.length, 2);
  for (const c of [...facts.seri1_sehirler, ...facts.seri2_karsilastirma]) { assert.ok(c.toplam_tl > 1000, c.sehir); assert.equal(c.toplam_tl % 100, 0); }
  assert.ok(facts.seri3_kalem && facts.seri3_kalem.tl > 0);
});

test("içerik: kartta olmayan rakam yakalanır ve düzelttirilir", () => withKey(async () => {
  const facts = { kur_eur_tl: 50, seri1_sehirler: [{ sehir: "X", toplam_tl: 44800 }] };
  const draft = (n) => JSON.stringify({ videolar: [{ seri: 1, baslik: "X'e 3 gece", kanca: `${n} TL`, sahneler: [{ sn: 2, metin: "2 kişi", ekran: "" }], kapanis: "Abone ol" }] });
  let n = 0; const apiFetch = async () => claudeReply(++n === 1 ? draft("51.234") : draft("44.800"));
  const r = await icerik.run({ facts, apiFetch });
  assert.equal(n, 2); assert.deepEqual(r.warnings, []);
  assert.deepEqual(icerik.checkNumbers(JSON.parse(draft("51.234")), icerik.allowedNumbers(facts)), ['"51.234" (X\'e 3 gece)']);
}));

// ---------- Denetçi ----------
test("denetçi: eski kur, eksik jeton ve bozuk dosya sorun olarak yakalanır", async () => {
  const now = Date.parse("2026-10-27T07:00:00Z");
  const r = await denetci.checkFiles({ now, hasTravelpayouts: false, files: {
    "data.json": { updated: "2026-10-02" }, "flights.json": { __error: "yok" }, "prices.json": {}, "price-status.json": { lastRun: null }, "sehirler/index.json": { sehirler: [] } } });
  assert.ok(r.issues.some((x) => /Kur 17 iş günüdür/.test(x)), r.issues.join("|"));
  assert.ok(r.issues.some((x) => /TRAVELPAYOUTS_TOKEN/.test(x)));
  const ok = await denetci.checkFiles({ now, hasTravelpayouts: true, hasAnthropic: true, files: {
    "data.json": { updated: "2026-10-26" }, "flights.json": { generated: "2026-10-23T05:20:00Z", cities: Object.fromEntries(CITIES.map((c) => [c.name, { minEur: 100 }])) },
    "prices.json": {}, "price-status.json": { lastRun: "2026-10-26", items: {} }, "sehirler/index.json": { sehirler: [] } } });
  assert.deepEqual(ok.issues, []);
});

test("denetçi: hata veren robot yakalanır", async () => {
  const fetchImpl = async () => json({ workflow_runs: [
    { name: "Uçuş Robotu", status: "completed", conclusion: "failure", html_url: "https://x/1" },
    { name: "Uçuş Robotu", status: "completed", conclusion: "success", html_url: "https://x/0" },
    { name: "Kur Bekçisi", status: "completed", conclusion: "success" } ] });
  const r = await denetci.checkRuns({ repo: "a/b", token: "t", fetchImpl });
  assert.equal(r.issues.length, 1); assert.match(r.issues[0], /Uçuş Robotu/);
});
