// Deplasman fiyat robotu testleri (ağ yok). Çalıştır: node scripts/test-deplasman-fiyat.mjs
import assert from "node:assert/strict";
import { due, upcoming, hotelTotal, flightOptions, applyMatch } from "./deplasman-fiyat.mjs";
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
  assert.deepEqual(o.map((x) => [x.fiyat, x.havayolu]), [[190, "Pegasus gidiş + AJet dönüş"], [210, "Pegasus"]]);
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
