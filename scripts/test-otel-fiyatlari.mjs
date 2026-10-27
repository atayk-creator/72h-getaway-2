import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  istanbulToday, upcomingWeekends, planFor, estimateMonthly, actorInput, matchRows, toRecord, nameScore,
  mergeWeekend, archivePast, emptyState, run, toMarkdown, runActor, COST_PER_LOOKUP_USD,
} from "./otel-fiyatlari.mjs";

const doc = JSON.parse(await readFile(new URL("../data/hotels.json", import.meta.url), "utf8"));
const S = doc.ayarlar, H = doc.sehirler[0].oteller, TOKEN = "apify_api_TESTJETON1234567890abcdef";
const res = (b, status = 200) => ({ ok: status < 400, status, text: async () => (typeof b === "string" ? b : JSON.stringify(b)) });

// 0) liste dosyası doğru
assert.equal(H.length, 8); assert.equal(new Set(H.map((h) => h.id)).size, 8, "kimlikler tekil olmalı");
const cnt = H.reduce((a, h) => ((a[h.kategori] = (a[h.kategori] || 0) + 1), a), {});
assert.deepEqual(cnt, { ikonik: 1, pahali: 2, konforlu: 3, ucuz: 2 }); console.log("ok 0: 8 otel, 1 ikonik / 2 pahalı / 3 konforlu / 2 ucuz");

// 1) İstanbul saati: UTC 22:30 İstanbul'da ertesi gün
assert.equal(istanbulToday(new Date("2026-10-27T22:30:00Z")), "2026-10-28");
assert.equal(istanbulToday(new Date("2026-11-02T03:17:00Z")), "2026-11-02"); console.log("ok 1: İstanbul tarihi");

// 2) hafta sonları: Cuma giriş Pazar çıkış, Cuma günü o hafta sonu dahil
{ const w = upcomingWeekends("2026-10-28", 26);
  assert.equal(w.length, 26); assert.deepEqual(w[0], { no: 1, giris: "2026-10-30", cikis: "2026-11-01" });
  for (const x of w) { assert.equal(new Date(x.giris).getUTCDay(), 5); assert.equal(new Date(x.cikis).getUTCDay(), 0); }
  assert.equal(upcomingWeekends("2026-10-30", 1)[0].giris, "2026-10-30"); console.log("ok 2: hafta sonu tarihleri"); }

// 3) kademeli takvim
{ const nos = (d) => planFor(d, S).map((w) => w.no);
  assert.deepEqual(nos("2026-11-03"), [], "Salı kontrol yok");
  assert.deepEqual(nos("2026-11-04"), [1, 2, 3, 4], "Çarşamba sadece sıcak");
  assert.deepEqual(nos("2026-11-05"), [5, 6, 7, 8], "Perşembe sadece ılık");
  assert.deepEqual(nos("2026-11-06"), [1, 2, 3, 4], "Cuma sadece sıcak");
  const a = nos("2026-11-02"), b = nos("2026-11-09");
  assert.ok(a.length === 13 || a.length === 26); assert.ok(b.length === 13 || b.length === 26);
  assert.notEqual(a.length, b.length, "uzak kademe iki haftada bir");
  assert.equal(planFor("2026-11-03", S, "test").length, 1); assert.equal(planFor("2026-11-03", S, "hepsi").length, 26);
  assert.throws(() => planFor("2026-11-03", S, "yanlis"), /Bilinmeyen mod/);
  const ozel = { ...S, ozel_tarihler: ["2026-12-25"] }; // 9. hafta sonu, normalde sadece Pazartesi
  assert.ok(planFor("2026-10-28", ozel).some((w) => w.giris === "2026-12-25"), "özel tarih sıcak sayılır");
  console.log("ok 3: takvim (Pzt hepsi, Çar/Cum sıcak, Per ılık, uzak iki haftada bir, özel tarih)"); }

// 4) bütçe: 8 otel ücretsiz 5 $ krediye sığmalı
{ const e = estimateMonthly(S, 8); assert.ok(e.usd < 5, `aylık ${e.usd} $`); console.log(`ok 4: aylık ~${e.sorgu} sorgu, ~${e.usd} $ (5 $ altında)`); }

// 5) robot girdisi: tarihler, kişi, para birimi; öğrenilmiş Google kimliği adın yerine geçer
{ const i = actorInput(H, { giris: "2026-10-30", cikis: "2026-11-01" }, S, { "bud-aria": "ChoIabc" });
  assert.equal(i.checkInDate, "2026-10-30"); assert.equal(i.checkOutDate, "2026-11-01"); assert.equal(i.adults, 2); assert.equal(i.currency, "EUR"); assert.equal(i.country, "tr");
  assert.equal(i.hotels.length, 8); assert.equal(i.hotels[2], "ChoIabc"); assert.equal(i.hotels[0], "Párisi Udvar Hotel Budapest"); console.log("ok 5: robot girdisi"); }

// 6) eşleştirme: kimlik, arama metni, ad benzerliği; yanlış otel eşleşmez
{ assert.equal(nameScore("Hotel Rum", "Hotel Rum Budapest"), 1); assert.equal(nameScore("Párisi Udvar Hotel", "Parisi Udvar Hotel Budapest"), 1);
  assert.ok(nameScore("Hotel Rum", "Rumbach Hotel") < 0.6);
  const rows = [
    { recordType: "hotel", name: "Hotel Rum Budapest", hotelId: "R1" },
    { recordType: "hotel", name: "Some Other Place", hotelId: "X", searchQuery: "D8 Hotel Budapest" },
    { recordType: "hotel", name: "Kempinski Hotel Corvinus Budapest", hotelId: "K1" },
    { recordType: "hotel", name: "Totally Different", hotelId: "ARIA" },
    { recordType: "error", errorCode: "NOT_FOUND", input: "Hotel Clark Budapest" },
  ];
  const m = matchRows(H, rows, { "bud-aria": "ARIA" });
  assert.equal(m["bud-rum"].hotelId, "R1"); assert.equal(m["bud-d8"].hotelId, "X"); assert.equal(m["bud-kempinski"].hotelId, "K1");
  assert.equal(m["bud-aria"].hotelId, "ARIA"); assert.equal(m["bud-clark"].errorCode, "NOT_FOUND"); assert.equal(m["bud-moments"], null); console.log("ok 6: satır eşleştirme"); }

// 7) kayıt: en ucuz toplam seçilir, dolu / bulunamadı / para birimi
{ const row = { recordType: "hotel", hotelId: "G1", currency: "EUR", totalPrice: 300, pricePerNight: 150, url: "https://g/1", deal: "15% less than usual", rating: 4.6, hotelClass: 4,
    bookingOptions: [{ provider: "Booking.com", totalStayPrice: 280, bookingUrl: "https://b" }, { provider: "Otelin sitesi", totalStayPrice: 290, isOfficialSite: true }, { provider: "Bozuk", totalStayPrice: "?" }, { provider: "Gecelik", nightlyPrice: 145 }] };
  const r = toRecord(row);
  assert.equal(r.durum, "fiyat"); assert.equal(r.fiyat, 280); assert.equal(r.gecelik, 140); assert.equal(r.site, "Booking.com"); assert.equal(r.link, "https://b");
  assert.equal(r.resmiSiteFiyat, 290); assert.equal(r.googleFiyat, 300); assert.equal(r.googleKimlik, "G1"); assert.equal(r.firsat, "15% less than usual");
  assert.equal(toRecord({ recordType: "hotel", pricePerNight: 99, currency: "EUR" }).fiyat, 198, "sadece gecelik fiyat varsa 2 geceyle çarpılır");
  assert.equal(toRecord({ recordType: "hotel", hotelId: "G2", bookingOptions: [] }).durum, "dolu");
  assert.equal(toRecord({ recordType: "error", errorCode: "NOT_FOUND" }).durum, "bulunamadi");
  assert.equal(toRecord({ recordType: "error", errorCode: "BLOCKED" }).durum, "hata");
  assert.equal(toRecord(null).durum, "sonuc_yok");
  assert.equal(toRecord({ recordType: "hotel", currency: "USD", totalPrice: 100 }).durum, "hata"); console.log("ok 7: fiyat kaydı"); }

// 8) birleştirme, geçmiş sınırı, kimlik öğrenme ve unutma, arşiv
{ const st = emptyState(), w = { giris: "2026-10-30", cikis: "2026-11-01" }, hs = H.slice(0, 2);
  for (let i = 0; i < 65; i++) mergeWeekend(st, w, hs, { [hs[0].id]: { durum: "fiyat", fiyat: 100 + i, googleKimlik: "P1" }, [hs[1].id]: { durum: "dolu" } }, `t${i}`);
  const o = st.haftaSonlari["2026-10-30"].oteller[hs[0].id];
  assert.equal(o.gecmis.length, 60); assert.equal(o.son.fiyat, 164); assert.equal(o.son.kontrol, "t64"); assert.equal(st.googleKimlik[hs[0].id], "P1");
  mergeWeekend(st, w, hs, { [hs[0].id]: { durum: "bulunamadi" }, [hs[1].id]: { durum: "dolu" } }, "t", { [hs[0].id]: "P1" });
  assert.equal(st.googleKimlik[hs[0].id], undefined, "bozuk kimlik unutulur");
  const ar = { haftaSonlari: {} }; mergeWeekend(st, { giris: "2026-11-06", cikis: "2026-11-08" }, hs, { [hs[0].id]: { durum: "dolu" }, [hs[1].id]: { durum: "dolu" } }, "t");
  assert.equal(archivePast(st, ar, "2026-11-02"), 1); assert.ok(ar.haftaSonlari["2026-10-30"]); assert.ok(st.haftaSonlari["2026-11-06"]); assert.ok(!st.haftaSonlari["2026-10-30"]);
  console.log("ok 8: geçmiş, kimlik, arşiv"); }

// Sahte Apify: başlat -> (bir kez RUNNING) -> bitti -> satırlar
function fakeApify(rowsFor, { failDates = [], status = 200, body = null, seen = [] } = {}) {
  const runs = {}; let n = 0;
  return async (url, init = {}) => {
    seen.push({ url, init });
    if (body) return res(body, status);
    const u = new URL(url);
    if (init.method === "POST") { const input = JSON.parse(init.body); const id = "run" + ++n; runs[id] = { input, polls: 0 };
      if (failDates.includes(input.checkInDate)) return res({ data: { id, status: "FAILED", defaultDatasetId: "ds" + id } });
      return res({ data: { id, status: "RUNNING", defaultDatasetId: "ds" + id } }); }
    if (u.pathname.startsWith("/v2/actor-runs/")) { const id = u.pathname.split("/").pop(); return res({ data: { id, status: "SUCCEEDED", defaultDatasetId: "ds" + id } }); }
    if (u.pathname.startsWith("/v2/datasets/")) { const id = u.pathname.split("/")[3].slice(2); return res(rowsFor(runs[id].input)); }
    return res("bilinmeyen adres", 404);
  };
}
const rowsOk = (input) => input.hotels.map((q, i) => (i === 7 ? { recordType: "error", errorCode: "NOT_FOUND", input: q } : i === 6 ? { recordType: "hotel", searchQuery: q, name: q, hotelId: "id" + i, bookingOptions: [] }
  : { recordType: "hotel", searchQuery: q, name: q, hotelId: "id" + i, currency: "EUR", totalPrice: 200 + i * 50 + (input.checkInDate === "2026-11-06" ? 30 : 0), bookingOptions: [{ provider: "Booking.com", totalStayPrice: 190 + i * 50, bookingUrl: "https://b/" + i }] }));
const base = { token: TOKEN, hotelsDoc: doc, sleep: async () => {} };

// 9) Apify çağrısı: anahtar başlıkta, adreste değil; bekleme döngüsü
{ const seen = []; const items = await runActor({ hotels: ["x"], checkInDate: "2026-10-30" }, { token: TOKEN, fetchImpl: fakeApify(() => [{ recordType: "hotel" }], { seen }), sleep: async () => {} });
  assert.equal(items.length, 1); assert.equal(seen.length, 3, "başlat + durum + satırlar");
  assert.ok(seen[0].url.includes("/acts/eiv~google-hotels-scraper/runs")); assert.equal(seen[0].init.headers.authorization, "Bearer " + TOKEN);
  assert.ok(seen.every((s) => !s.url.includes(TOKEN)), "anahtar adrese yazılmamalı"); console.log("ok 9: Apify çağrısı"); }

// 10) uçtan uca, Çarşamba: 4 hafta sonu x 8 otel
{ const out = await run({ ...base, now: new Date("2026-11-04T03:17:00Z"), fetchImpl: fakeApify(rowsOk) });
  assert.deepEqual(out.report.haftaSonlari, ["2026-11-06", "2026-11-13", "2026-11-20", "2026-11-27"]);
  assert.equal(out.report.fiyat, 24); assert.equal(out.report.dolu, 4); assert.equal(out.report.bulunamadi, 4); assert.equal(out.report.ucretliSatir, 28);
  assert.equal(out.report.tahminiMaliyetUsd, Math.round(28 * COST_PER_LOOKUP_USD * 100) / 100);
  const a = out.state.haftaSonlari["2026-11-13"].oteller["bud-aria"].son; assert.equal(a.durum, "fiyat"); assert.equal(a.fiyat, 290); assert.equal(a.site, "Booking.com");
  assert.equal(out.state.googleKimlik["bud-aria"], "id2"); assert.equal(out.state.sonCalisma.fiyatli, 24);
  const md = toMarkdown({ ...out, hotelsDoc: doc }); assert.match(md, /Aria Hotel Budapest/); assert.match(md, /bulunamadı/); assert.match(md, /dolu/); assert.ok(!md.includes(TOKEN));
  // ikinci çalışma öğrenilen kimliklerle arar ve geçmişe ekler
  const seen = []; const out2 = await run({ ...base, state: out.state, now: new Date("2026-11-06T03:17:00Z"), fetchImpl: fakeApify(rowsOk, { seen }) });
  assert.equal(JSON.parse(seen[0].init.body).hotels[2], "id2", "öğrenilen kimlik kullanılır");
  assert.equal(out2.state.haftaSonlari["2026-11-06"].oteller["bud-aria"].gecmis.length, 2); console.log("ok 10: uçtan uca Çarşamba + Cuma"); }

// 11) kontrol günü değilse hiçbir şey çekmez
{ let called = 0; const out = await run({ ...base, now: new Date("2026-11-03T03:17:00Z"), fetchImpl: async () => { called++; return res({}); } });
  assert.equal(called, 0); assert.equal(out.plan.length, 0); assert.equal(out.state.guncellendi, null);
  assert.match(toMarkdown({ ...out, hotelsDoc: doc }), /kontrol günü değil/); console.log("ok 11: Salı boş geçer"); }

// 12) bir hafta sonu başarısız olursa diğerleri sürer
{ const out = await run({ ...base, now: new Date("2026-11-04T03:17:00Z"), fetchImpl: fakeApify(rowsOk, { failDates: ["2026-11-13"] }) });
  assert.equal(out.state.haftaSonlari["2026-11-13"].oteller["bud-aria"].son.durum, "hata"); assert.equal(out.state.haftaSonlari["2026-11-20"].oteller["bud-aria"].son.durum, "fiyat");
  assert.equal(out.report.hatalar.length, 1); console.log("ok 12: tek hafta sonu hatası işi durdurmaz"); }

// 13) ölümcül hatalar: anahtar yok, geçersiz anahtar (sızmaz), kredi bitti
await assert.rejects(() => run({ ...base, token: "", now: new Date("2026-11-04T03:17:00Z") }), /APIFY_TOKEN tanımlı değil/);
{ const seen = []; const err = await run({ ...base, now: new Date("2026-11-04T03:17:00Z"), fetchImpl: fakeApify(null, { status: 401, body: `bad token ${TOKEN}`, seen }) }).catch((e) => e.message);
  assert.match(err, /geçersiz/); assert.ok(!err.includes(TOKEN)); assert.equal(seen.length, 1, "anahtar bozuksa tekrar denemez"); }
await assert.rejects(() => run({ ...base, now: new Date("2026-11-04T03:17:00Z"), fetchImpl: fakeApify(null, { status: 402, body: "not-enough-usage" }) }), /kredisi yetmiyor/);
console.log("ok 13: hata mesajları, anahtar sızmıyor");

console.log("TÜM TESTLER GEÇTİ");
