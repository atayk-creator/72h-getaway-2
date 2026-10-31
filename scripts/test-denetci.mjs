import assert from "node:assert/strict";
import { businessDaysBetween, isEcbHoliday, checkData, checkWorkflows, checkSite, toMarkdown, run, LIMITS } from "./denetci.mjs";

const res = (b, status = 200) => ({ ok: status < 400, status, json: async () => b, text: async () => JSON.stringify(b) });
const NOW = new Date("2026-11-10T03:40:00Z"); // Salı; önümüzdeki hafta sonları 13 ve 20 Kasım

// Sahte veri: 2 şehir, şehir başına 4 otel
const city = (sehir, pre) => ({ sehir, oteller: ["ikonik", "pahali", "konforlu", "ucuz"].map((k, i) => ({ id: `${pre}-${i}`, ad: `${sehir} Otel ${i}`, kategori: k })) });
const hotelsDoc = { sehirler: [city("Paris", "par"), city("Roma", "rom")] };
const fiyat = (g) => ({ son: { durum: "fiyat", fiyat: 2 * g, gecelik: g, vergi: "eklendi" } });
const cityFile = (pre, recs) => ({ haftaSonlari: Object.fromEntries(Object.entries(recs).map(([g, list]) => [g, { cikis: g.slice(0, 8) + String(+g.slice(8) + 2).padStart(2, "0"), oteller: Object.fromEntries(list.map((r, i) => [`${pre}-${i}`, r]).filter(([, r]) => r)) }])) });
const good = () => ({
  rates: { updated: "2026-11-09" },
  hotelMeta: { sonCalisma: { tarih: "2026-11-09T03:59:00Z" } },
  hotelsDoc,
  cityFiles: {
    paris: cityFile("par", { "2026-11-13": [fiyat(500), fiyat(300), fiyat(200), fiyat(100)], "2026-11-20": [fiyat(500), fiyat(300), fiyat(200), fiyat(100)] }),
    roma: cityFile("rom", { "2026-11-13": [fiyat(400), fiyat(250), fiyat(150), fiyat(90)], "2026-11-20": [fiyat(400), fiyat(250), fiyat(150), fiyat(90)] }),
  },
  flights: { guncellendi: "2026-11-03T03:30:00Z" },
  restaurants: { guncellendi: "2026-11-03T04:00:00Z" },
  tabloRapor: { tarih: "2026-11-10T04:41:00Z", islenen: [], hatalar: [] },
});

// 1) iş günü sayımı ve ECB tatilleri
assert.equal(businessDaysBetween("2026-10-30", "2026-10-31"), 0, "Cuma -> Cumartesi");
assert.equal(businessDaysBetween("2026-10-30", "2026-11-05"), 4); assert.equal(businessDaysBetween("2026-10-30", "2026-11-06"), 5);
assert.ok(isEcbHoliday("2026-12-25") && isEcbHoliday("2027-01-01") && isEcbHoliday("2026-04-03") && isEcbHoliday("2026-04-06"), "Noel, yılbaşı, Paskalya 2026");
assert.ok(!isEcbHoliday("2026-11-10"));
assert.equal(businessDaysBetween("2026-12-24", "2026-12-31"), 4, "25 Aralık (Cuma) sayılmaz");
console.log("ok 1: iş günleri");

// 2) her şey yolunda
{ const r = checkData({ now: NOW, ...good() });
  assert.deepEqual(r.sorunlar, []); assert.deepEqual(r.uyarilar, []); assert.ok(r.bilgi.some((x) => /kapsaması/.test(x))); console.log("ok 2: sağlıklı veri"); }

// 3) eski veriler
{ const d = good(); d.rates.updated = "2026-11-02"; d.hotelMeta.sonCalisma.tarih = "2026-11-04T03:00:00Z"; d.flights.guncellendi = "2026-10-31T00:00:00Z"; d.restaurants.guncellendi = "2026-09-30T00:00:00Z";
  const r = checkData({ now: NOW, ...d });
  assert.equal(r.sorunlar.length, 4, r.sorunlar.join("\n"));
  assert.match(r.sorunlar[0], /Kur 6 iş günüdür/); assert.match(r.sorunlar[1], /Otel fiyat robotu 5 günden/); assert.match(r.sorunlar[2], /Uçak fiyat robotu 9 günden/); assert.match(r.sorunlar[3], /Restoran robotu 40 günden/);
  const d2 = good(); d2.rates.updated = "2026-11-04"; d2.hotelMeta.sonCalisma.tarih = "2026-11-05T04:00:00Z"; d2.flights.guncellendi = "2026-11-01T04:00:00Z"; d2.restaurants.guncellendi = "2026-10-02T04:00:00Z";
  assert.deepEqual(checkData({ now: NOW, ...d2 }).sorunlar, [], "sınırların içinde");
  const d3 = good(); d3.hotelMeta = null; assert.match(checkData({ now: NOW, ...d3 }).sorunlar[0], /Otel fiyat robotu .*yok/);
  console.log("ok 3: eski veri"); }

// 4) kapsama ve hiç kullanılamayan oteller (doğrulanamadı ve şüpheli kullanılamaz)
{ const d = good();
  const bad = { son: { durum: "dogrulanamadi", fiyat: 100, gecelik: 50 } }, dolu = { son: { durum: "dolu" } }, sup = { son: { durum: "fiyat", fiyat: 999, gecelik: 499, supheli: true } };
  d.cityFiles.roma = cityFile("rom", { "2026-11-13": [fiyat(400), bad, dolu, sup], "2026-11-20": [fiyat(400), bad, fiyat(150), sup], "2026-11-06": [fiyat(1), fiyat(1), fiyat(1), fiyat(1)] });
  const r = checkData({ now: NOW, ...d });
  assert.equal(r.sorunlar.length, 2, r.sorunlar.join("\n"));
  assert.match(r.sorunlar[0], /Roma: %38 \(11-13: 1\/4, 11-20: 2\/4\)/); assert.ok(!/Paris:/.test(r.sorunlar[0]));
  assert.match(r.sorunlar[1], /Roma \/ Roma Otel 1 \(pahali\): 2 dogrulanamadi/); assert.match(r.sorunlar[1], /Roma Otel 3 \(ucuz\): 2 şüpheli/);
  assert.ok(!/Otel 2/.test(r.sorunlar[1]), "bir hafta sonu kullanılabilir olan listelenmez"); assert.ok(!/Otel 0/.test(r.sorunlar[1]), "geçmiş hafta sonu sayılmaz");
  const d2 = good(); delete d2.cityFiles.roma.haftaSonlari["2026-11-20"].oteller["rom-3"]; delete d2.cityFiles.roma.haftaSonlari["2026-11-13"].oteller["rom-3"];
  const r2 = checkData({ now: NOW, ...d2 });
  assert.match(r2.bilgi.find((x) => /Henüz/.test(x)), /Roma \/ Roma Otel 3/, "verisi olmayan yeni otel sadece bilgi"); assert.ok(r2.sorunlar.every((x) => !/hiçbirinde/.test(x)));
  console.log("ok 4: kapsama ve ölü oteller"); }

// 5) kategori sırası uyarısı ve tablo hataları
{ const d = good(); d.cityFiles.paris = cityFile("par", { "2026-11-13": [fiyat(500), fiyat(100), fiyat(200), fiyat(300)], "2026-11-20": [fiyat(500), fiyat(100), fiyat(200), fiyat(300)] });
  d.tabloRapor.hatalar = ["Tablo indirilemedi: dosya paylaşılmamış"];
  const r = checkData({ now: NOW, ...d });
  assert.equal(r.uyarilar.length, 2); assert.match(r.uyarilar[0], /Paris: ucuz/); assert.equal(r.sorunlar.length, 1); assert.match(r.sorunlar[0], /Tablo aktarımı hata verdi[\s\S]*paylaşılmamış/);
  console.log("ok 5: kategori uyarısı, tablo hataları"); }

// 6) iş akışları: son tamamlanan çalışma başarısızsa sorun; kendisi ve pasif olanlar atlanır
{ const seen = [];
  const fake = async (url, init) => { seen.push({ url, init }); const u = new URL(url);
    if (u.pathname.endsWith("/actions/workflows")) return res({ workflows: [{ id: 1, name: "Otel fiyat robotu", path: ".github/workflows/otel-fiyatlari.yml", state: "active" }, { id: 2, name: "Uçak", path: ".github/workflows/ucak-fiyatlari.yml", state: "active" }, { id: 3, name: "Denetçi", path: ".github/workflows/denetci.yml", state: "active" }, { id: 4, name: "Eski", path: ".github/workflows/eski.yml", state: "disabled_manually" }, { id: 5, name: "Yeni", path: ".github/workflows/yeni.yml", state: "active" }] });
    const id = u.pathname.split("/")[6];
    if (id === "1") return res({ workflow_runs: [{ conclusion: "failure", updated_at: "2026-11-09T03:20:00Z", html_url: "https://github.com/x/y/actions/runs/9" }] });
    if (id === "2") return res({ workflow_runs: [{ conclusion: "success" }] });
    if (id === "5") return res({ workflow_runs: [] });
    throw new Error("beklenmeyen istek " + url); };
  const r = await checkWorkflows({ repo: "x/y", token: "ghs_TEST", fetchImpl: fake });
  assert.equal(r.sorunlar.length, 1); assert.match(r.sorunlar[0], /"Otel fiyat robotu" iş akışının son çalışması başarısız .*runs\/9/);
  assert.ok(seen.every((s) => s.init.headers.authorization === "Bearer ghs_TEST")); assert.ok(seen.every((s) => !s.url.includes("ghs_TEST")));
  assert.ok(seen.some((s) => s.url.includes("status=completed&per_page=1"))); assert.ok(!seen.some((s) => /workflows\/(3|4)\/runs/.test(s.url)));
  assert.match((await checkWorkflows({ repo: "x/y", token: "t", fetchImpl: async () => res({}, 403) })).sorunlar[0], /HTTP 403/);
  assert.match((await checkWorkflows({ repo: "x/y", token: "t", fetchImpl: async () => { throw new Error("ağ yok"); } })).sorunlar[0], /ulaşılamadı: ağ yok/);
  assert.equal((await checkWorkflows({ repo: null, token: null })).sorunlar.length, 0);
  console.log("ok 6: iş akışları"); }

// 7) site: açık, HTTP hatası, HTTPS sertifika sorunu, hiç açılmıyor
{ assert.deepEqual((await checkSite({ fetchImpl: async () => res("ok") })).sorunlar, []);
  assert.match((await checkSite({ fetchImpl: async () => res("x", 404) })).sorunlar[0], /HTTP 404/);
  const tlsErr = () => { const e = new TypeError("fetch failed"); e.cause = { code: "ERR_TLS_CERT_ALTNAME_INVALID", message: "Hostname/IP does not match certificate's altnames" }; return e; };
  const tls = await checkSite({ fetchImpl: async (u) => { if (u.startsWith("https:")) throw tlsErr(); return res("ok"); } });
  assert.match(tls.sorunlar[0], /^HTTPS sorunu: .*ERR_TLS_CERT_ALTNAME_INVALID.* HTTP ile açılıyor mu: evet/);
  const dns = await checkSite({ fetchImpl: async () => { const e = new TypeError("fetch failed"); e.cause = { code: "ENOTFOUND" }; throw e; } });
  assert.match(dns.sorunlar[0], /^Site açılmıyor: .*ENOTFOUND/);
  console.log("ok 7: site kontrolü"); }

// 8) uçtan uca: rapor metni
{ const ok = await run({ now: NOW, files: good(), fetchImpl: async (u) => (u.startsWith("https://api.github.com") ? res(u.includes("/runs") ? { workflow_runs: [{ conclusion: "success" }] } : { workflows: [{ id: 1, name: "A", path: ".github/workflows/a.yml", state: "active" }] }) : res("ok")), repo: "x/y", token: "t" });
  assert.deepEqual(ok.sorunlar, []); assert.match(ok.markdown, /Her şey yolunda/); assert.match(ok.markdown, /^# Denetçi raporu/);
  const d = good(); d.rates.updated = "2026-10-01";
  const bad = await run({ now: NOW, files: d, fetchImpl: async () => res("x", 500), repo: "x/y", token: "t" });
  assert.ok(bad.sorunlar.length >= 3); assert.match(bad.markdown, /## Sorunlar \(\d+\)/); assert.match(bad.markdown, /Kur \d+ iş günüdür/); assert.match(bad.markdown, /Site hata veriyor/);
  assert.equal(LIMITS.kapsama, 0.6);
  console.log("ok 8: rapor"); }

console.log("TÜM TESTLER GEÇTİ");
