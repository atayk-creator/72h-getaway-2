// Panel hesapları, Metricool dönüştürücüleri, not şifreleme ve uçtan uca üretim testi (sahte veriyle; ağ yok).
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { slotlar, ozet, gunluk, etkozet, eniyi, takipozet, panelHtml } from "./panel.mjs";
import { etkilesimSatiri, seriGunleri, metricoolVerisi } from "./panel-veri.mjs";
import { notSifrele, notCoz } from "./panel-not.mjs";

const now = Date.UTC(2026, 10, 16, 9, 0); // 16 Kas 2026 Pzt 12:00 TSİ
const y = (dt, text, nets, o = {}) => ({ publicationDate: { dateTime: dt }, text, providers: nets.map((network) => ({ network })), draft: false, ...o });
const yayinlar = [
  y("2026-11-16T07:45:00", "Londra 72 saat", ["instagram", "tiktok"]), y("2026-11-16T07:50:00", "", ["instagram"], { instagramData: { type: "STORY" } }),
  y("2026-11-16T18:15:00", "En ucuz şehir 😀", ["instagram"]), y("2026-11-17T07:45:00", "KOPYA taslak", ["instagram"], { draft: true }),
  y("2026-11-17T12:30:00", "Post", ["instagram"]), y("2026-11-17T12:30:00", "Post iki", ["instagram"]),
];
const program = [{ gun: "2026-11-17", sira: 0, planli: true, kod: "V-12", icerik: "Paris", kim: "Ecem" }, { gun: "2026-11-17", sira: 4, planli: false }];
const S = slotlar(yayinlar, program, now);
assert.equal(S.length, 35);
const b = (g, s) => S.find((r) => r.gun === g && r.saat === s);
assert.equal(b("2026-11-16", "07:45").durum, "Kurulu"); assert.equal(b("2026-11-16", "07:45").sorun, ""); assert.equal(b("2026-11-16", "07:45").aglar, "IG · TT");
assert.match(b("2026-11-16", "18:15").sorun, /emoji var/); assert.match(b("2026-11-16", "18:15").sorun, /"ucuz" geçiyor/); assert.match(b("2026-11-16", "18:15").sorun, /hikâye yok/);
assert.equal(b("2026-11-16", "12:30").durum, "Boş"); // 12:30 henüz geçmedi (12:00)
assert.equal(b("2026-11-17", "07:45").durum, "Boş"); assert.equal(b("2026-11-17", "07:45").plan, "V-12 Paris"); // taslak sayılmaz
assert.match(b("2026-11-17", "12:30").sorun, /aynı ağa iki gönderi/);
assert.equal(b("2026-11-17", "21:30").durum, "Plan yok");
const notlar = [{ tip: "karar", baslik: "Örnek karar", son: "bugün", detay: "ayrıntı", durum: "açık" }, { tip: "is", baslik: "İş", kim: "Ecem", son: "yarın", durum: "tamam" }];
const O = ozet(S, notlar, now);
assert.equal(O.karar, 1); assert.equal(O.is, 0); assert.equal(O.yarinToplam, 4); assert.equal(O.yarinKurulu, 1);

assert.deepEqual(etkilesimSatiri("instagram", { publishedAt: { dateTime: "2026-11-15T20:00:00" }, url: "https://x/1", impressionsTotal: 900, interactions: 40, type: "reel" }, "POST"), { ag: "instagram", gun: "2026-11-15", link: "https://x/1", gosterim: 900, etkilesim: 40, bicim: "REEL" });
assert.equal(etkilesimSatiri("tiktok", { createTime: "2026-11-14T10:00:00", shareUrl: "https://t/2", viewCount: 500, likeCount: 10, commentCount: 2, shareCount: 3 }, "VIDEO").etkilesim, 15);
assert.deepEqual(seriGunleri([{ metric: "followers", values: [{ dateTime: "2026-11-15T00:00:00", value: 310 }, { dateTime: "2026-11-16T00:00:00", value: 321 }] }]), { "2026-11-15": 310, "2026-11-16": 321 });
const etk = [{ ag: "instagram", gun: "2026-11-15", link: "https://x/1", gosterim: 900, etkilesim: 40, bicim: "REEL" }, { ag: "tiktok", gun: "2026-11-15", link: "https://t/2", gosterim: 500, etkilesim: 15, bicim: "VIDEO" }, { ag: "instagram", gun: "2026-11-15", link: "https://x/3", gosterim: 50, etkilesim: 99, bicim: "STORY" }];
const G = gunluk(etk, now);
assert.equal(G.length, 14); assert.equal(G[12].toplam, 154); assert.equal(etkozet(G).enIyiGun, "2026-11-15"); assert.equal(eniyi(etk).length, 2);
assert.deepEqual(takipozet([{ igTakipci: 310, igKazanilan: 4, ttTakipci: null }, { igTakipci: 321, igKazanilan: 11, ttTakipci: 80 }]), { ig: 321, tt: 80, ig7: 15 });

// Metricool istemcisi: sahte fetch; bir uç 403 dönerse yalnız o bölüm hataya düşer, anahtar hiçbir çıktıda görünmez
const cevap = (d, ok = true, status = 200) => ({ ok, status, json: async () => ({ data: d }) });
const istekler = [];
const fetchFn = async (u, o) => { istekler.push([String(u), o.headers["X-Mc-Auth"]]); const p = new URL(u).pathname;
  if (p.endsWith("/settings/brands")) return cevap([{ id: 77, label: "72h Getaway" }]);
  if (p.endsWith("/scheduler/posts")) return cevap(yayinlar);
  if (p.endsWith("/posts/tiktok")) return cevap(null, false, 403);
  if (p.includes("/analytics/posts/") || p.includes("/analytics/reels/")) return cevap([{ publishedAt: { dateTime: "2026-11-15T20:00:00" }, url: "https://x/1", impressions: 10, interactions: 2 }]);
  if (p.endsWith("/timelines")) return new URL(u).searchParams.get("network") === "instagram" ? cevap([{ values: [{ dateTime: "2026-11-15T00:00:00", value: 310 }, { dateTime: "2026-11-16T00:00:00", value: 321 }] }]) : cevap(null, false, 404);
  return cevap(null, false, 404); };
const M = await metricoolVerisi({ token: "GIZLI-ANAHTAR", userId: "1", now, fetchFn });
assert.equal(M.yayinlar.length, 6); assert.equal(M.etkilesim.length, 5); assert.ok(M.hatalar.includes("etkileşim (tiktok video)")); assert.ok(M.hatalar.includes("TikTok takipçi serisi"));
assert.equal(M.takipci.at(-1).igTakipci, 321); assert.equal(M.takipci.at(-1).igKazanilan, 11);
assert.ok(istekler.every(([u, k]) => k === "GIZLI-ANAHTAR" && !u.includes("GIZLI-ANAHTAR") && u.includes("blogId=77") || u.includes("/settings/brands")));

// Kurul notları: açık anahtarla şifrele, özel anahtarla aç; şifreli pakette düz metin yok
const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048, publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs8", format: "pem" } });
const paket = notSifrele({ notlar, program }, publicKey);
assert.ok(!JSON.stringify(paket).includes("Örnek karar"));
assert.deepEqual(notCoz(paket, privateKey).notlar, notlar);
assert.throws(() => notCoz(paket, generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } }).privateKey));

const html = panelHtml({ ...M, notlar, program, hatalar: { metricool: M.hatalar }, now });
for (const s of ["72h Yönetici Ekranı", "Örnek karar", "Kural sorunu", "Metricool&#39;dan alınamayan", "<svg", "V-12 Paris"]) assert.ok(html.includes(s), s);
assert.ok(!html.includes("GIZLI-ANAHTAR"));
const bos = panelHtml({ yayinlar: null, etkilesim: null, takipci: null, notlar: null, hatalar: { notlar: "Kurul notları henüz yüklenmedi (yonetim/panel/notlar.enc yok)." }, now });
assert.ok(bos.includes("Metricool yüklenemedi") && bos.includes("Kurul notları henüz yüklenmedi"));
console.log("TÜM TESTLER GEÇTİ");
