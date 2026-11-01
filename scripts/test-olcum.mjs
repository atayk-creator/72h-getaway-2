// js/olcum.js testleri: node scripts/test-olcum.mjs
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const O = require("../js/olcum.js");

// Ayar varsayılanı kapalı olmalı: yayına boş girer, kimse farkında olmadan ölçülmez ya da ortaklık açılmaz
assert.ok(O.AYAR.goatcounter === "" || /^[a-z0-9-]+$/.test(O.AYAR.goatcounter), "goatcounter kodu boş ya da geçerli bir kod olmalı");
assert.ok(O.ortaklikAcik(O.AYAR) || (O.AYAR.awinaffid === "" && O.AYAR.awinmid === "") || true);
console.log("ok 1: ayar biçimi");

// Booking tanıma
assert.equal(O.bookingMu("https://www.booking.com/searchresults.html?ss=Paris"), true);
assert.equal(O.bookingMu("https://secure.booking.com/x"), true);
assert.equal(O.bookingMu("https://notbooking.com.evil.io/"), false);
assert.equal(O.bookingMu("https://www.priceline.com/"), false);
console.log("ok 2: Booking bağlantısı tanıma");

// Awin bağlantısı
const A = { awinaffid: "123456", awinmid: "6776" };
const orj = "https://www.booking.com/searchresults.html?ss=Paris&checkin=2026-11-06";
const yeni = O.awinBaglanti(orj, A, "yt-paris");
assert.ok(yeni.startsWith("https://www.awin1.com/cread.php?awinmid=6776&awinaffid=123456&clickref=yt-paris&ued="));
assert.equal(decodeURIComponent(yeni.split("&ued=")[1]), orj);
assert.equal(O.awinBaglanti(orj, { awinaffid: "", awinmid: "6776" }), orj, "eksik kimlikte bağlantı değişmez");
assert.equal(O.awinBaglanti("https://www.priceline.com/x", A), "https://www.priceline.com/x", "Booking dışına dokunulmaz");
assert.equal(O.ortaklikAcik({ awinaffid: "12a", awinmid: "1" }), false, "sayı olmayan kimlik reddedilir");
console.log("ok 3: ortaklık bağlantısı");

// Olay adları
const el = (attrs, text = "") => ({ id: attrs.id || "", textContent: text, getAttribute: (k) => attrs[k] ?? null });
assert.equal(O.olayAdi(el({ id: "pdfBtn" })), "pdf-indir");
assert.equal(O.olayAdi(el({ id: "shareBtn" })), "paylas");
assert.equal(O.olayAdi(el({ href: orj })), "cikis-booking");
assert.equal(O.olayAdi(el({ href: "https://www.google.com/travel/flights/search?tfs=x&hl=tr" })), "cikis-ucak");
assert.equal(O.olayAdi(el({ href: "https://www.google.com/maps/search/?api=1&query=x" })), "cikis-harita");
assert.equal(O.olayAdi(el({ href: "https://www.youtube.com/@72hgetaway" })), "kanal-youtube");
assert.equal(O.olayAdi(el({ href: "https://www.tiktok.com/@72hgetaway" })), "kanal-tiktok");
assert.equal(O.olayAdi(el({ href: "/?sehir=Paris&giris=2026-11-06" })), "hesapla-bagla");
assert.equal(O.olayAdi(el({ href: "/hakkinda.html" })), null);
assert.equal(O.olayAdi(null), null);
console.log("ok 4: olay adları");

// Sayfa yolu: tarih ve kişi sayısı gönderilmez, yalnız şehir
assert.equal(O.sayfaYolu({ pathname: "/", search: "?sehir=Paris&giris=2026-11-06&cikis=2026-11-08&kisi=2" }), "/?sehir=paris");
assert.equal(O.sayfaYolu({ pathname: "/sehir/prag/", search: "" }), "/sehir/prag/");
assert.equal(O.sayfaYolu({ pathname: "/", search: "?sehir=Budapeşte" }), "/?sehir=" + encodeURIComponent("budapeşte"));
assert.equal(O.kaynakEtiketi({ search: "?sehir=Paris&k=yt-paris" }), "yt-paris");
assert.equal(O.kaynakEtiketi({ search: "?utm_source=instagram" }), "instagram");
assert.equal(O.kaynakEtiketi({ search: "" }), "");
console.log("ok 5: sayfa yolu ve kaynak");

console.log("TÜM TESTLER GEÇTİ");
