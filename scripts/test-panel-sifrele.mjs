// panel-sifrele.mjs testi: şifrele → çöz aynı içeriği verir; yanlış şifre çözemez; kabukta düz veri yoktur.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { anahtar, sifrele, coz, kabuk } from "./panel-sifrele.mjs";
const tuz = randomBytes(16), html = "<!doctype html><title>Panel</title><p>Takipçi 987 · Karar: örnek başlık ğüşiöç</p>";
const k = anahtar("dogru-sifre-en-az-16-karakter", tuz), s = sifrele(html, k);
assert.equal(coz(s, k), html);
assert.throws(() => coz(s, anahtar("yanlis-sifre-en-az-16-karakter", tuz)));
const sayfa = kabuk({ tuz: tuz.toString("base64"), ...s });
assert.ok(!sayfa.includes("987") || !sayfa.includes("Takipçi 987"));
assert.ok(!sayfa.includes("örnek başlık"));
assert.ok(sayfa.includes('content="noindex,nofollow"'));
assert.notEqual(sifrele(html, k).ct, s.ct); // her seferinde yeni IV
console.log("TÜM TESTLER GEÇTİ");
