import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  istanbulToday, upcomingWeekends, planFor, estimateMonthly, billingPeriod, actorInput, matchRows, toRecord, nameScore, isTrusted,
  mergeWeekend, archivePast, pruneRemoved, nameOk, validateRecords, emptyState, splitState, joinState, citySlug, run, toMarkdown, runActor, PLAN_RATES,
} from "./otel-fiyatlari.mjs";

const doc = JSON.parse(await readFile(new URL("../data/hotels.json", import.meta.url), "utf8"));
const S = doc.ayarlar, ALL = doc.sehirler.flatMap((c) => c.oteller), BUD = doc.sehirler.find((c) => c.sehir === "Budapeşte").oteller;
const TOKEN = "apify_api_TESTJETON1234567890abcdef";
const res = (b, status = 200) => ({ ok: status < 400, status, text: async () => (typeof b === "string" ? b : JSON.stringify(b)) });

// 0) liste dosyası: her şehirde 8 otel, 1/2/3/2 dağılım, tekil kimlik, tüm alanlar dolu
{ assert.ok(doc.sehirler.length >= 26, "en az 26 şehir");
  assert.equal(new Set(ALL.map((h) => h.id)).size, ALL.length, "kimlikler tekil olmalı");
  assert.equal(new Set(doc.sehirler.map((c) => citySlug(c.sehir))).size, doc.sehirler.length, "şehir dosya adları tekil olmalı");
  for (const c of doc.sehirler) {
    const k = c.oteller.reduce((a, h) => ((a[h.kategori] = (a[h.kategori] || 0) + 1), a), {});
    assert.deepEqual(k, { ikonik: 1, pahali: 2, konforlu: 3, ucuz: 2 }, c.sehir);
    for (const h of c.oteller) for (const f of ["id", "ad", "arama", "kategori", "not"]) assert.ok(h[f], `${c.sehir} ${h.id} ${f}`);
  }
  console.log(`ok 0: ${doc.sehirler.length} şehir, ${ALL.length} otel, hepsinde 1/2/3/2`); }

// 1) İstanbul saati
assert.equal(istanbulToday(new Date("2026-10-27T22:30:00Z")), "2026-10-28");
assert.equal(istanbulToday(new Date("2026-11-02T03:17:00Z")), "2026-11-02"); console.log("ok 1: İstanbul tarihi");

// 2) hafta sonları
{ const w = upcomingWeekends("2026-10-28", 13);
  assert.equal(w.length, 13); assert.deepEqual(w[0], { no: 1, giris: "2026-10-30", cikis: "2026-11-01" });
  for (const x of w) { assert.equal(new Date(x.giris).getUTCDay(), 5); assert.equal(new Date(x.cikis).getUTCDay(), 0); }
  assert.equal(upcomingWeekends("2026-10-30", 1)[0].giris, "2026-10-30"); console.log("ok 2: hafta sonu tarihleri"); }

// 3) kademeli takvim: 4 haftalık döngüde her hafta sonu en az bir kez, en yakınlar haftada 2 kez
{ const seen = {}; let days = 0;
  for (let i = 0; i < 28; i++) { const d = new Date(Date.UTC(2026, 10, 2 + i)).toISOString().slice(0, 10); const p = planFor(d, S); if (p.length) days++; for (const w of p) seen[w.no] = (seen[w.no] || 0) + 1; }
  for (let n = 1; n <= S.kac_hafta_sonu; n++) assert.ok(seen[n] >= 1, `${n}. hafta sonu 4 haftada en az bir kez`);
  assert.equal(seen[1], 8, "en yakın hafta sonu haftada 2 kez"); assert.equal(days, 8, "sadece Pazartesi ve Perşembe");
  assert.deepEqual(planFor("2026-11-03", S), [], "Salı kontrol yok");
  assert.equal(planFor("2026-11-03", S, "test").length, 1); assert.equal(planFor("2026-11-03", S, "hepsi").length, S.kac_hafta_sonu);
  assert.throws(() => planFor("2026-11-03", S, "yanlis"), /Bilinmeyen mod/);
  const ozel = { ...S, ozel_tarihler: ["2026-12-25"] };
  assert.ok(planFor("2026-11-02", ozel).some((w) => w.giris === "2026-12-25"), "özel tarih sıcak sayılır");
  console.log("ok 3: takvim"); }

// 4) bütçe tahmini: Starter planda aylık 25 $ altında
{ const e = estimateMonthly(S, ALL.length, "2026-11-02", "starter"); assert.ok(e.usd < 25, `aylık ${e.usd} $`); console.log(`ok 4: ${ALL.length} otel, aylık ~${e.sorgu} sorgu, Starter'da ~${e.usd} $`); }

// 5) fatura dönemi
assert.equal(billingPeriod("2026-10-28", 28), "2026-10-28"); assert.equal(billingPeriod("2026-11-05", 28), "2026-10-28");
assert.equal(billingPeriod("2026-11-28", 28), "2026-11-28"); assert.equal(billingPeriod("2027-01-10", 28), "2026-12-28");
assert.equal(billingPeriod("2026-03-05", 31), "2026-02-28", "kısa ayda son güne yuvarlanır"); assert.equal(billingPeriod("2026-11-05", 1), "2026-11-01");
console.log("ok 5: fatura dönemi");

// 6) robot girdisi
{ const i = actorInput(BUD, { giris: "2026-10-30", cikis: "2026-11-01" }, S, { "bud-aria": "ChoIabc" });
  assert.equal(i.checkInDate, "2026-10-30"); assert.equal(i.checkOutDate, "2026-11-01"); assert.equal(i.adults, 2); assert.equal(i.currency, "EUR"); assert.equal(i.country, "tr");
  assert.equal(i.hotels.length, 8); assert.equal(i.hotels[2], "ChoIabc"); assert.equal(i.hotels[0], "Párisi Udvar Hotel Budapest"); console.log("ok 6: robot girdisi"); }

// 7) eşleştirme
{ assert.equal(nameScore("Hotel Rum", "Hotel Rum Budapest"), 1); assert.ok(nameScore("Hotel Rum", "Rumbach Hotel") < 0.6);
  const rows = [
    { recordType: "hotel", name: "Hotel Rum", hotelId: "R1" },
    { recordType: "hotel", name: "Some Other Place", hotelId: "X", searchQuery: "D8 Hotel Budapest" },
    { recordType: "hotel", name: "Kempinski Hotel Corvinus Budapest", hotelId: "K1" },
    { recordType: "hotel", name: "Totally Different", hotelId: "ARIA" },
    { recordType: "error", errorCode: "NOT_FOUND", input: "Hotel Clark Budapest" },
  ];
  const m = matchRows(BUD, rows, { "bud-aria": "ARIA" });
  assert.equal(m["bud-rum"].hotelId, "R1"); assert.equal(m["bud-d8"].hotelId, "X"); assert.equal(m["bud-kempinski"].hotelId, "K1");
  assert.equal(m["bud-aria"].hotelId, "ARIA"); assert.equal(m["bud-clark"].errorCode, "NOT_FOUND"); assert.equal(m["bud-moments"], null); console.log("ok 7: eşleştirme"); }

// 7b) Google'ın döndürdüğü ad kontrolü ve aynı otele çift eşleşme
{ assert.ok(nameOk({ ad: "Hôtel Lutetia", arama: "Hotel Lutetia Paris" }, "Mandarin Oriental Lutetia, Paris"));
  assert.ok(nameOk({ ad: "Polonia Palace Hotel", arama: "Polonia Palace Hotel Warsaw" }, "Hotel Polonia Palace"));
  assert.ok(nameOk({ ad: "Hotel Cru", arama: "Cru Hotel Tallinn" }, "Cru hotell"));
  assert.ok(!nameOk({ ad: "ibis Warszawa Stare Miasto", arama: "ibis Warszawa Stare Miasto" }, "ibis budget Warszawa Centrum"));
  assert.ok(!nameOk({ ad: "Palace Hotel Zagreb", arama: "Palace Hotel Zagreb" }, "Sheraton Zagreb Hotel"));
  const hs = [{ id: "a", ad: "Sheraton Zagreb Hotel", arama: "Sheraton Zagreb Hotel" }, { id: "b", ad: "Esplanade", arama: "Esplanade Zagreb" }, { id: "c", ad: "Hotel Sheraton Zagreb Center", arama: "Hotel Sheraton Zagreb Center" }];
  const v = validateRecords(hs, { a: { durum: "fiyat", googleAd: "Sheraton Zagreb Hotel", googleKimlik: "S" }, b: { durum: "fiyat", googleAd: "Westin Zagreb", googleKimlik: "W" }, c: { durum: "fiyat", googleAd: "Sheraton Zagreb Hotel", googleKimlik: "S" } });
  assert.equal(v.a.durum, "fiyat"); assert.equal(v.b.durum, "bulunamadi"); assert.match(v.b.not, /başka bir otel/); assert.equal(v.c.durum, "bulunamadi"); assert.match(v.c.not, /karıştırdı/);
  console.log("ok 7b: ad kontrolü ve çift eşleşme"); }

// 8) tanınmış site tespiti
{ const T = S.guvenilir_siteler;
  for (const s of ["Booking.com", "booking.com", "Expedia.com", "Expedia", "Hotels.com", "Agoda", "Trip.com", "Priceline"]) assert.ok(isTrusted({ site: s }, T), s);
  for (const s of ["Super.com", "Amimir.com", "Clicktrip.com", "trivago DEALS", "KAYAK.com", "Vio.com", "Hotelscombined.com", "Tripening Hotels", "?", ""]) assert.ok(!isTrusted({ site: s }, T), s);
  assert.ok(isTrusted({ site: "Hotel Rum", resmi: true }, T), "otelin kendi sitesi"); console.log("ok 8: tanınmış siteler"); }

// 9) kayıt: tanınmış en ucuz öne, daha ucuz bilinmeyen site ayrı; tanınmış yoksa en ucuz; dolu/bulunamadı; konum
{ const row = { recordType: "hotel", hotelId: "G1", currency: "EUR", totalPrice: 300, url: "https://g/1", deal: "15% less than usual", rating: 4.6, hotelClass: 4, latitude: 47.49812345, longitude: 19.0512345,
    bookingOptions: [{ provider: "Super.com", totalStayPrice: 251, bookingUrl: "https://s" }, { provider: "Booking.com", totalStayPrice: 280, bookingUrl: "https://b" }, { provider: "Hotel Rum", totalStayPrice: 290, isOfficialSite: true, bookingUrl: "https://r" }, { provider: "Expedia.com", nightlyPrice: 145 }, { provider: "Bozuk", totalStayPrice: "?" }] };
  const r = toRecord(row, 2, "EUR", S.guvenilir_siteler);
  assert.equal(r.durum, "fiyat"); assert.equal(r.fiyat, 280); assert.equal(r.gecelik, 140); assert.equal(r.site, "Booking.com"); assert.equal(r.link, "https://b"); assert.equal(r.guvenilir, true);
  assert.deepEqual(r.enUcuz, { fiyat: 251, site: "Super.com", link: "https://s" }); assert.equal(r.resmiSiteFiyat, 290); assert.equal(r.googleFiyat, 300); assert.deepEqual(r.konum, [47.49812, 19.05123]);
  const only = toRecord({ recordType: "hotel", currency: "EUR", bookingOptions: [{ provider: "Super.com", totalStayPrice: 200 }, { provider: "Amimir.com", totalStayPrice: 210 }] }, 2, "EUR", S.guvenilir_siteler);
  assert.equal(only.fiyat, 200); assert.equal(only.guvenilir, false); assert.equal(only.enUcuz, null);
  assert.equal(toRecord({ recordType: "hotel", pricePerNight: 99, currency: "EUR" }).fiyat, 198, "sadece gecelik fiyat varsa 2 geceyle çarpılır");
  assert.equal(toRecord({ recordType: "hotel", hotelId: "G2", bookingOptions: [] }).durum, "dolu");
  assert.equal(toRecord({ recordType: "error", errorCode: "NOT_FOUND" }).durum, "bulunamadi"); assert.equal(toRecord({ recordType: "error", errorCode: "BLOCKED" }).durum, "hata");
  assert.equal(toRecord(null).durum, "sonuc_yok"); assert.equal(toRecord({ recordType: "hotel", currency: "USD", totalPrice: 100 }).durum, "hata"); console.log("ok 9: fiyat kaydı"); }

// 10) birleştirme, geçmiş, kimlik/konum, arşiv (sade), listeden çıkarılan otel temizliği
{ const st = emptyState(), w = { giris: "2026-10-30", cikis: "2026-11-01" }, hs = BUD.slice(0, 2);
  for (let i = 0; i < 65; i++) mergeWeekend(st, w, hs, { [hs[0].id]: { durum: "fiyat", fiyat: 100 + i, googleKimlik: "P1", konum: [1, 2], link: "https://x" }, [hs[1].id]: { durum: "dolu" } }, `t${i}`);
  const o = st.haftaSonlari["2026-10-30"].oteller[hs[0].id];
  assert.equal(o.gecmis.length, 60); assert.equal(o.son.fiyat, 164); assert.equal(o.son.konum, undefined, "konum her kayıtta tekrarlanmaz"); assert.deepEqual(st.konum[hs[0].id], [1, 2]);
  mergeWeekend(st, w, hs, { [hs[0].id]: { durum: "bulunamadi" }, [hs[1].id]: { durum: "dolu" } }, "t", { [hs[0].id]: "P1" });
  assert.equal(st.googleKimlik[hs[0].id], undefined, "bozuk kimlik unutulur");
  const ar = { haftaSonlari: {} }; mergeWeekend(st, { giris: "2026-11-06", cikis: "2026-11-08" }, hs, { [hs[0].id]: { durum: "dolu" }, [hs[1].id]: { durum: "dolu" } }, "t");
  assert.equal(archivePast(st, ar, "2026-11-02"), 1); assert.ok(!st.haftaSonlari["2026-10-30"]);
  assert.equal(ar.haftaSonlari["2026-10-30"].oteller[hs[0].id].son.link, undefined, "arşivde bağlantı tutulmaz");
  st.konum["eski-otel"] = [0, 0]; st.haftaSonlari["2026-11-06"].oteller["eski-otel"] = {}; pruneRemoved(st, ALL.map((h) => h.id));
  assert.ok(!st.konum["eski-otel"]); assert.ok(!st.haftaSonlari["2026-11-06"].oteller["eski-otel"]); console.log("ok 10: geçmiş, kimlik, konum, arşiv, temizlik"); }

// 11) şehir dosyalarına bölme ve geri birleştirme
{ const st = emptyState(); const w = { giris: "2026-11-06", cikis: "2026-11-08" };
  mergeWeekend(st, w, ALL, Object.fromEntries(ALL.map((h, i) => [h.id, { durum: "fiyat", fiyat: 100 + i }])), "t");
  const { meta, files } = splitState(st, doc);
  assert.equal(meta.haftaSonlari, undefined, "ana dosyada fiyat yok"); assert.equal(Object.keys(files).length, doc.sehirler.length);
  assert.equal(meta.sehirler["Budapeşte"], "data/fiyatlar/budapeste.json"); assert.equal(Object.keys(files.budapeste.haftaSonlari["2026-11-06"].oteller).length, 8);
  const back = joinState(meta, files); assert.equal(Object.keys(back.haftaSonlari["2026-11-06"].oteller).length, ALL.length); assert.equal(back.haftaSonlari["2026-11-06"].oteller[ALL[5].id].son.fiyat, 105);
  console.log("ok 11: şehir dosyaları"); }

// Sahte Apify
function fakeApify(rowsFor, { failDates = [], status = 200, body = null, seen = [] } = {}) {
  const runs = {}; let n = 0;
  return async (url, init = {}) => {
    seen.push({ url, init });
    if (body) return res(body, status);
    const u = new URL(url);
    if (init.method === "POST") { const input = JSON.parse(init.body); const id = "run" + ++n; runs[id] = input;
      if (failDates.includes(input.checkInDate)) return res({ data: { id, status: "FAILED", defaultDatasetId: "ds" + id } });
      return res({ data: { id, status: "RUNNING", defaultDatasetId: "ds" + id } }); }
    if (u.pathname.startsWith("/v2/actor-runs/")) { const id = u.pathname.split("/").pop(); return res({ data: { id, status: "SUCCEEDED", defaultDatasetId: "ds" + id } }); }
    if (u.pathname.startsWith("/v2/datasets/")) { const id = u.pathname.split("/")[3].slice(2); return res(rowsFor(runs[id])); }
    return res("bilinmeyen adres", 404);
  };
}
const rowsOk = (input) => input.hotels.map((q, i) => (i % 8 === 7 ? { recordType: "error", errorCode: "NOT_FOUND", input: q } : i % 8 === 6 ? { recordType: "hotel", searchQuery: q, name: q.startsWith("id") ? ALL[+q.slice(2)].arama : q, hotelId: "id" + i, bookingOptions: [] }
  : { recordType: "hotel", searchQuery: q, name: q.startsWith("id") ? ALL[+q.slice(2)].arama : q, hotelId: "id" + i, currency: "EUR", latitude: 47 + i / 1000, longitude: 19, totalPrice: 220 + i, bookingOptions: [{ provider: "Booking.com", totalStayPrice: 200 + i, bookingUrl: "https://b/" + i }, { provider: "Super.com", totalStayPrice: 180 + i }] }));
const big = { ...S, apify_plan: "starter", aylik_butce_usd: 100 };
const base = { token: TOKEN, hotelsDoc: { ...doc, ayarlar: big }, sleep: async () => {} };
const N = ALL.length, perCity = 6 / 8 * N; // her 8 otelden 6'sı fiyatlı

// 12) Apify çağrısı
{ const seen = []; const items = await runActor({ hotels: ["x"], checkInDate: "2026-10-30" }, { token: TOKEN, fetchImpl: fakeApify(() => [{ recordType: "hotel" }], { seen }), sleep: async () => {} });
  assert.equal(items.length, 1); assert.equal(seen.length, 3); assert.ok(seen[0].url.includes("/acts/eiv~google-hotels-scraper/runs"));
  assert.equal(seen[0].init.headers.authorization, "Bearer " + TOKEN); assert.ok(seen.every((s) => !s.url.includes(TOKEN))); console.log("ok 12: Apify çağrısı"); }

// 13) uçtan uca Pazartesi: her hafta sonu tek çalışma, tüm şehirler birlikte; bütçe sayacı
{ const seen = [];
  const out = await run({ ...base, now: new Date("2026-11-09T03:17:00Z"), fetchImpl: fakeApify(rowsOk, { seen }) });
  const posts = seen.filter((s) => s.init.method === "POST");
  assert.equal(posts.length, 8, "8 hafta sonu = 8 çalışma"); assert.equal(JSON.parse(posts[0].init.body).hotels.length, N, "tüm oteller tek çalışmada");
  assert.equal(out.report.haftaSonlari.length, 8); assert.equal(out.report.fiyat, 8 * perCity); assert.equal(out.report.ucretliSatir, 8 * 7 / 8 * N);
  const a = out.state.haftaSonlari["2026-11-13"].oteller["bud-aria"].son; assert.equal(a.site, "Booking.com"); assert.ok(a.enUcuz && a.enUcuz.site === "Super.com");
  assert.equal(out.state.harcama.donem, "2026-10-28"); assert.ok(Math.abs(out.state.harcama.usd - 8 * 7 / 8 * N * PLAN_RATES.starter) < 0.05, "harcama " + out.state.harcama.usd);
  assert.ok(out.state.konum["bud-aria"]); assert.equal(out.state.googleKimlik["bud-aria"], "id" + ALL.findIndex((h) => h.id === "bud-aria"));
  const md = toMarkdown({ ...out, hotelsDoc: doc }); assert.match(md, /Budapeşte/); assert.match(md, /BULUNAMADI/); assert.ok(!md.includes(TOKEN));
  // ikinci çalışma: öğrenilen kimlikler kullanılır, harcama birikir
  const seen2 = []; const out2 = await run({ ...base, state: out.state, now: new Date("2026-11-12T03:17:00Z"), fetchImpl: fakeApify(rowsOk, { seen: seen2 }) });
  assert.ok(JSON.parse(seen2.find((s) => s.init.method === "POST").init.body).hotels.includes("id" + ALL.findIndex((h) => h.id === "bud-aria")));
  assert.ok(out2.state.harcama.usd > out.state.harcama.usd); console.log("ok 13: uçtan uca, tek çalışmada tüm şehirler, bütçe sayacı"); }

// 14) bütçe sınırı: sınır dolunca kalan hafta sonları atlanır, önce en yakınlar çekilir
{ const tight = { ...doc, ayarlar: { ...big, aylik_butce_usd: 2 * N * PLAN_RATES.starter + 0.01 } };
  const seen = []; const out = await run({ ...base, hotelsDoc: tight, concurrency: 1, now: new Date("2026-11-09T03:17:00Z"), fetchImpl: fakeApify(rowsOk, { seen }) });
  assert.equal(seen.filter((s) => s.init.method === "POST").length, 2); assert.deepEqual(out.report.haftaSonlari, ["2026-11-13", "2026-11-20"]);
  assert.equal(out.report.butceAtlanan.length, 6); assert.match(toMarkdown({ ...out, hotelsDoc: doc }), /Bütçe sınırı/);
  const next = await run({ ...base, hotelsDoc: tight, state: out.state, now: new Date("2026-11-12T03:17:00Z"), fetchImpl: fakeApify(rowsOk) });
  assert.equal(next.report.haftaSonlari.length, 0, "aynı dönemde bütçe bitti");
  const newPeriod = await run({ ...base, hotelsDoc: tight, state: out.state, now: new Date("2026-11-30T03:17:00Z"), fetchImpl: fakeApify(rowsOk) });
  assert.equal(newPeriod.state.harcama.donem, "2026-11-28"); assert.ok(newPeriod.report.haftaSonlari.length >= 1, "yeni dönemde sayaç sıfırlanır");
  console.log("ok 14: bütçe sınırı ve yeni fatura dönemi"); }

// 15) SEHIR filtresi sadece o şehri sorgular
{ const seen = []; await run({ ...base, only: ["Budapeşte"], mode: "test", now: new Date("2026-11-09T03:17:00Z"), fetchImpl: fakeApify(rowsOk, { seen }) });
  assert.equal(JSON.parse(seen[0].init.body).hotels.length, 8); console.log("ok 15: tek şehir filtresi"); }

// 16) kontrol günü değilse hiçbir şey çekmez
{ let called = 0; const out = await run({ ...base, now: new Date("2026-11-03T03:17:00Z"), fetchImpl: async () => { called++; return res({}); } });
  assert.equal(called, 0); assert.equal(out.plan.length, 0); assert.match(toMarkdown({ ...out, hotelsDoc: doc }), /kontrol günü değil/); console.log("ok 16: Salı boş geçer"); }

// 17) bir hafta sonu başarısız olursa diğerleri sürer
{ const out = await run({ ...base, now: new Date("2026-11-09T03:17:00Z"), fetchImpl: fakeApify(rowsOk, { failDates: ["2026-11-20"] }) });
  assert.equal(out.state.haftaSonlari["2026-11-20"].oteller["bud-aria"].son.durum, "hata"); assert.equal(out.state.haftaSonlari["2026-11-27"].oteller["bud-aria"].son.durum, "fiyat");
  assert.equal(out.report.hatalar.length, 1); console.log("ok 17: tek hafta sonu hatası işi durdurmaz"); }

// 18) ölümcül hatalar
await assert.rejects(() => run({ ...base, token: "", now: new Date("2026-11-09T03:17:00Z") }), /APIFY_TOKEN tanımlı değil/);
{ const seen = []; const err = await run({ ...base, concurrency: 1, now: new Date("2026-11-09T03:17:00Z"), fetchImpl: fakeApify(null, { status: 401, body: `bad token ${TOKEN}`, seen }) }).catch((e) => e.message);
  assert.match(err, /geçersiz/); assert.ok(!err.includes(TOKEN)); assert.equal(seen.length, 1, "anahtar bozuksa tekrar denemez"); }
await assert.rejects(() => run({ ...base, now: new Date("2026-11-09T03:17:00Z"), fetchImpl: fakeApify(null, { status: 402, body: "not-enough-usage" }) }), /kredisi yetmiyor/);
console.log("ok 18: hata mesajları, anahtar sızmıyor");

console.log("TÜM TESTLER GEÇTİ");
