// Deplasman fiyat robotu testleri (ağ yok). Çalıştır: node scripts/test-deplasman-fiyat.mjs
import assert from "node:assert/strict";
import { macAranacak, macPayi, donusDoldur, due, upcoming, hotelTotal, flightOptions, applyMatch, applyTrain } from "./deplasman-fiyat.mjs";
import { upcoming as pageUpcoming } from "./deplasman.mjs";
let n = 0; const t = (name, f) => { f(); n++; console.log("ok", name); };
const team = { robot: { son_arama: "2026-11-09", her_kac_gun: 2 }, maclar: [{ tarih: "2026-11-25" }, { tarih: "2026-12-09" }] };
t("2 günde bir", () => { assert.equal(due(team, "2026-11-10"), false); assert.equal(due(team, "2026-11-11"), true); assert.equal(due(team, "2026-11-10", true), true); });
t("oynanan maç düşer (robot ve sayfa)", () => {
  assert.equal(upcoming(team, "2026-11-25").length, 2); assert.equal(upcoming(team, "2026-11-26").length, 1);
  assert.equal(pageUpcoming(team, "2026-11-26").length, 1); assert.equal(pageUpcoming(team, "2026-12-10").length, 0);
});
t("otel: tanınmış site, vergili", () => {
  const r = { totalPrice: 120, totalPriceBeforeTaxes: 100, bookingOptions: [{ provider: "Shady.com", totalStayPrice: 50 }, { provider: "Booking.com", totalStayPrice: 90 }] };
  assert.equal(hotelTotal(r), 108); assert.equal(hotelTotal({ totalPrice: 77 }), 77); assert.equal(hotelTotal(null), null);
});
const F = (o) => ({ recordType: "flight", stops: 0, origin: "SAW", destination: "STN", departureDate: "2026-11-24", departureTime: "10:00", arrivalTime: "11:00", ...o });
const rows = [
  F({ section: "departing", airline: "Pegasus", price: 190, flightNumbers: ["PC1"] }),
  F({ section: "returning", airline: "AJet", price: 190, outboundFlightNumbers: ["PC1"], origin: "STN", destination: "SAW", departureDate: "2026-11-26" }),
  F({ section: "returning", airline: "Pegasus", price: 210, outboundFlightNumbers: ["PC1"], origin: "STN", destination: "SAW", departureDate: "2026-11-26" }),
  F({ section: "departing", airline: "Pegasus", price: 900, stops: 1, flightNumbers: ["PC9"] }),
  { recordType: "search-summary", priceLevel: "high", typicalPriceLow: 100, typicalPriceHigh: 200 },
];
t("uçak: karışık ve tek havayolu seçenekleri, aktarmalı yok", () => {
  const o = flightOptions(rows);
  assert.deepEqual(o.map((x) => [x.fiyat, x.havayolu, x.donusSaat]), [[190, "Pegasus gidiş + AJet dönüş", "10:00"], [210, "Pegasus", "10:00"]]);
});
t("maç güncelleme: bütçe, eski fiyat korunur", () => {
  const m = { ucus: { oneri: { donus: "x" } }, butce: { konforlu: { ucus: 1, otel: 1 }, ucuz: { ucus: 1, otel: 1 } },
    oteller: [{ arama: "A", kategori: "konforlu", toplam: 500 }, { arama: "B", kategori: "ucuz", toplam: 300 }] };
  applyMatch(m, rows, [{ input: "A", totalPrice: 400 }]);
  assert.equal(m.butce.ucuz.ucus, 190); assert.equal(m.butce.konforlu.ucus, 210); assert.equal(m.ucus.seviye, "yuksek");
  assert.equal(m.butce.konforlu.otel, 200); assert.equal(m.oteller[1].toplam, 300); assert.equal(m.oteller[1].eski, true); assert.equal(m.butce.ucuz.otel, 1);
  applyMatch(m, [], []); assert.equal(m.butce.ucuz.ucus, 190);
});
console.log(`\n${n} test geçti`);
t("seçili otel ve geç dönüş tercihi", () => {
  const G = (o) => F({ section: "departing", airline: "Pegasus", flightNumbers: ["PC5"], ...o });
  const R = (p, h) => F({ section: "returning", airline: "Pegasus", price: p, outboundFlightNumbers: ["PC5"], departureTime: h, departureDate: "2026-12-10" });
  const m = { donus_min: "15:00", secim: { konforlu: "Pahalı", ucuz: "Ucuz" }, ucus: { oneri: {} }, butce: { konforlu: {}, ucuz: {} },
    oteller: [{ ad: "Ucuz", arama: "U", kategori: "konforlu", toplam: 100 }, { ad: "Pahalı", arama: "P", kategori: "konforlu", toplam: 400 }] };
  applyMatch(m, [G({ price: 118 }), R(118, "10:05"), R(120, "19:55")], []);
  assert.equal(m.ucus.oneri.fiyat, 120); assert.equal(m.butce.konforlu.ucus, 120); assert.equal(m.butce.ucuz.ucus, 118);
  assert.equal(m.butce.konforlu.otel, 200);
  assert.equal(m.ucus.secenekler.length, 1);
});
console.log(`${n} test geçti (toplam)`);
t("iki şehir konaklama ve ÖBB treni", () => {
  const m = { ucus: { oneri: {} }, butce: { konforlu: {}, ucuz: {} }, konaklama: [
    { gece: "2026-12-08", secim: { konforlu: "V1", ucuz: "V2" }, oteller: [{ ad: "V1", arama: "v1", kategori: "konforlu", toplam: 300 }, { ad: "V2", arama: "v2", kategori: "ucuz", toplam: 100 }] },
    { gece: "2026-12-09", secim: { konforlu: "L1", ucuz: "L2" }, oteller: [{ ad: "L1", arama: "l1", kategori: "konforlu", toplam: 200 }, { ad: "L2", arama: "l2", kategori: "ucuz", toplam: 120 }] }] };
  applyMatch(m, [], [[{ input: "v1", totalPrice: 340 }], []]);
  assert.equal(m.konaklama[0].oteller[0].toplam, 340); assert.equal(m.konaklama[1].oteller[0].eski, true);
  assert.equal(m.butce.konforlu.otel, 270); assert.equal(m.butce.ucuz.otel, 110);
  const tr = { saat: "09:30" };
  const C = (dep, p, x = 0) => ({ departure: `2026-12-09T${dep}:00.000`, arrival: "2026-12-09T11:00:00.000", durationMinutes: 80, transfers: x, priceAmount: p, priceCoversFullJourney: true, legs: [{ line: "RJ", number: "1" }] });
  assert.equal(applyTrain(tr, [C("09:13", 9.9), C("09:28", 40.1), C("09:31", 12, 1)]), true);
  assert.equal(tr.secili.kalkis, "09:28"); assert.equal(tr.fiyat, 40.1);
  assert.equal(applyTrain(tr, []), false); assert.equal(tr.fiyat, 40.1);
});
console.log(`${n} test geçti (son)`);
t("aşırı otel fiyatı, ayrı uygun otel, sınıf uyarısı, dönüşü bilinen uçuş", () => {
  const F2 = (o) => ({ recordType: "flight", stops: 0, departureDate: "2026-12-04", departureTime: "12:50", arrivalTime: "13:40", origin: "IST", destination: "GDN", ...o });
  const m = { ucus: { oneri: null }, butce: { konforlu: {}, ucuz: {} }, secim: { konforlu: "K", ucuz: "K" },
    oteller: [{ ad: "S", arama: "s", kategori: "ikonik" }, { ad: "K", arama: "k", kategori: "konforlu" }, { ad: "K2", arama: "k2", kategori: "konforlu" }, { ad: "L", arama: "l", kategori: "pahali" }, { ad: "U", arama: "u", kategori: "ucuz" }] };
  applyMatch(m, [F2({ section: "departing", airline: "LOT", price: 250, flightNumbers: ["LO1"] }), F2({ section: "departing", airline: "THY", price: 300, flightNumbers: ["TK1"] }),
    F2({ section: "returning", airline: "THY", price: 300, outboundFlightNumbers: ["TK1"], departureTime: "18:00", departureDate: "2026-12-06" })],
    [{ input: "s", totalPrice: 7000 }, { input: "k", totalPrice: 400 }, { input: "k2", totalPrice: 900 }, { input: "l", totalPrice: 500 }]);
  assert.equal(m.oteller[0].toplam, null); assert.ok(m.oteller[0].kontrol);          // süit fiyatı gizlendi
  assert.equal(m.ucus.oneri.havayolu, "THY"); assert.ok(m.ucus.oneri.donus);        // dönüşü bilinen öneri
  assert.equal(m.secim.ucuz, undefined); assert.equal(m.uygun_plan, false);         // uygun otel fiyatsız → uygun plan yok
  assert.equal(m.uyarilar.length, 1); assert.match(m.uyarilar[0], /K2 \(Konforlu, 900 €\).*L \(Lüks, 500 €\)/);
  applyMatch(m, [], [{ input: "u", totalPrice: 300 }, { input: "k", totalPrice: 400 }]);
  assert.equal(m.secim.ucuz, "U"); assert.equal(m.uygun_plan, true);
});
console.log(`${n} test geçti (kurul kuralları)`);
t("uygun otel konforludan ucuz olmalı; tek yön dönüş", () => {
  const m = { ucus: { oneri: { havayolu: "LOT", havalimani: "Gdańsk (GDN)" } }, donus_min: "14:00", butce: { konforlu: {}, ucuz: {} }, secim: {},
    oteller: [{ ad: "M", arama: "m", kategori: "konforlu" }, { ad: "H", arama: "h", kategori: "ucuz" }] };
  applyMatch(m, [], [{ input: "m", totalPrice: 312 }, { input: "h", totalPrice: 594 }]);
  assert.equal(m.secim.konforlu, "M"); assert.equal(m.secim.ucuz, undefined); assert.equal(m.uygun_plan, false);
  const D = (a, h) => ({ recordType: "flight", airline: a, stops: 0, departureDate: "2026-12-06", departureTime: h, arrivalTime: "20:00", origin: "GDN", destination: "IST", flightNumbers: ["LO1"] });
  assert.equal(donusDoldur(m, [D("LOT", "06:00"), D("LOT", "15:10"), D("Turkish Airlines", "14:30")]), true);
  assert.match(m.ucus.oneri.donus, /GDN 15:10 → IST/);
});
console.log(`${n} test geçti (uygun ve dönüş)`);

t("maç takvimi: yakın 2 günde, Aralık haftada, Ocak 15 Aralık'a kadar bekler", () => {
  const T = { robot: { her_kac_gun: 2, son_arama: "2026-11-11" } };
  const lon = { tarih: "2026-11-25" }, ara = { tarih: "2026-12-08" }, oca = { tarih: "2027-01-26" };
  assert.equal(macAranacak(lon, T, "2026-11-12"), false); assert.equal(macAranacak(lon, T, "2026-11-13"), true);
  assert.equal(macAranacak(ara, T, "2026-11-13"), false); assert.equal(macAranacak(ara, T, "2026-11-18"), true);
  assert.equal(macAranacak(oca, T, "2026-12-14"), false); assert.equal(macAranacak(oca, T, "2026-12-15"), true);
  assert.equal(macAranacak({ ...ara, robot_son_arama: "2026-11-18" }, T, "2026-11-20"), false);
  assert.equal(macAranacak(oca, T, "2026-11-13", true), true);
  assert.equal(macPayi(lon, T, "2026-11-13"), 1); assert.equal(macPayi(ara, T, "2026-11-13"), 5);
});
