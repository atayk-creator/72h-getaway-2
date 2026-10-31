// Şehir sayfaları üreticisinin testleri: node scripts/test-sehir-sayfalari.mjs
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  slugify, esc, jsonLd, yonelme, mutfakTr, toEur, usableHotel, buildCity, renderCityPage, renderIndexPage, renderSitemap, generate, calcLink, fmtTl,
} from "./sehir-sayfalari.mjs";

let n = 0;
function test(ad, fn) { fn(); n++; console.log("✓ " + ad); }

test("slugify Türkçe harfleri sadeleştirir", () => {
  assert.equal(slugify("Budapeşte"), "budapeste");
  assert.equal(slugify("Bükreş"), "bukres");
  assert.equal(slugify("Varşova"), "varsova");
  assert.equal(slugify("Lüksemburg"), "luksemburg");
  assert.equal(slugify("Brüksel"), "bruksel");
  assert.equal(slugify("ĞIİÇÖŞÜ çğıöşü"), "giicosu-cgiosu");
  assert.equal(slugify("Kuzey  Kıbrıs"), "kuzey-kibris");
  assert.equal(slugify("  Paris "), "paris");
  assert.equal(slugify(null), "");
});

test("esc ve jsonLd HTML'i kaçırır", () => {
  assert.equal(esc(`<a href="x">'&'</a>`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  assert.equal(esc(undefined), "");
  assert.ok(!jsonLd({ a: "</script><b>" }).includes("</script>"));
});

test("yönelme eki ünlü uyumuna uyar", () => {
  assert.equal(yonelme("Paris"), "Paris'e");
  assert.equal(yonelme("Roma"), "Roma'ya");
  assert.equal(yonelme("Budapeşte"), "Budapeşte'ye");
  assert.equal(yonelme("Prag"), "Prag'a");
});

test("mutfak: mutfakTr > eşleme > ' restaurant' atılır", () => {
  assert.equal(mutfakTr({ mutfak: "Italian restaurant", mutfakTr: "İtalyan mutfağı" }), "İtalyan mutfağı");
  assert.equal(mutfakTr({ mutfak: "Lebanese restaurant" }), "Lübnan");
  assert.equal(mutfakTr({ mutfak: "Martian restaurant" }), "Martian");
  assert.equal(mutfakTr({ mutfak: "Restaurant" }), "Restoran");
  assert.equal(mutfakTr({}), "Restoran");
});

test("kur dönüşümü ve TL yuvarlama", () => {
  const kur = { eurTry: 55.8, eurHuf: 400, kurlar: { CZK: 25 } };
  assert.equal(toEur(50, "CZK", kur), 2);
  assert.equal(toEur(800, "HUF", kur), 2);
  assert.equal(toEur(5, "XYZ", kur), null);
  assert.equal(fmtTl(100, 55.8), "5.600 TL");
  assert.equal(fmtTl(100, 0), null);
});

test("kullanılabilir otel fiyatı: durum fiyat ve şüpheli değil", () => {
  assert.ok(usableHotel({ durum: "fiyat", fiyat: 300 }));
  assert.ok(!usableHotel({ durum: "fiyat", fiyat: 300, supheli: true }));
  assert.ok(!usableHotel({ durum: "dogrulanamadi", fiyat: 300 }));
  assert.ok(!usableHotel({ durum: "dolu" }));
  assert.ok(!usableHotel(null));
});

// Sahte veri
const TODAY = "2026-10-31";
function fixture() {
  const otel = (fiyat, extra = {}) => ({ son: { durum: "fiyat", fiyat, gecelik: fiyat / 2, kontrol: "2026-10-29T04:00:00Z", ...extra } });
  return {
    hotels: { sehirler: [
      { sehir: "Paris", ulke: "Fransa", oteller: [
        { id: "p1", ad: "Lüks <Otel>", kategori: "ikonik" }, { id: "p2", ad: "Ucuz Otel", kategori: "ucuz" }, { id: "p3", ad: "Yeni Otel", kategori: "konforlu" },
      ] },
      { sehir: "Budapeşte", ulke: "Macaristan", oteller: [{ id: "b1", ad: "Dolu Otel", kategori: "ucuz" }] },
    ] },
    fiyatlar: {
      Paris: { guncellendi: "2026-10-29T04:00:00Z", haftaSonlari: {
        "2026-10-30": { cikis: "2026-11-01", oteller: { p1: otel(100), p2: otel(50) } }, // geçmiş hafta sonu: kullanılmamalı
        "2026-11-06": { cikis: "2026-11-08", oteller: { p1: otel(2000, { vergi: "dahil" }), p2: otel(9000, { supheli: true }) } },
        "2026-11-13": { cikis: "2026-11-15", oteller: { p1: otel(1800), p2: otel(300), p3: { son: { durum: "dogrulanamadi", fiyat: 10 } } } },
      } },
      Budapeşte: { haftaSonlari: { "2026-11-06": { cikis: "2026-11-08", oteller: { b1: { son: { durum: "dolu" } } } } } },
    },
    ucuslar: { guncellendi: "2026-10-28T00:00:00Z", haftaSonlari: {
      "2026-10-30": { cikis: "2026-11-01", sehirler: { Paris: { son: { durum: "fiyat", fiyat: 10, havayolu: "Eski" } } } },
      "2026-11-06": { cikis: "2026-11-08", sehirler: { Paris: { son: { durum: "fiyat", fiyat: 250, havayolu: "AJet", aktarma: 0 } } } },
      "2026-11-13": { cikis: "2026-11-15", sehirler: { Paris: { son: { durum: "fiyat", fiyat: 200, havayolu: "Pegasus", aktarma: 1 } } } },
    } },
    restoranlar: { sehirler: { Paris: { restoranlar: [
      { ad: "Lüks Yer", seviye: "luks", kisiBasiEur: 150, mutfak: "Fine dining restaurant" },
      { ad: "Uygun & İyi", seviye: "uygun", kisiBasiEur: 20, mutfak: "Lebanese restaurant" },
    ] } } },
    gezi: { sehirler: { Paris: { para: "EUR", ulasim: { tek_bilet: { fiyat: 2.55 }, havalimani: { fiyat: 14 } }, yerler: [
      { ad: "Eyfel", tur: "Anıt", fiyat: 36.7 }, { ad: "Kapanan Pazar", tur: "Pazar", fiyat: 0, kapali: "gecici" }, { ad: "Bedava Park", tur: "Park", fiyat: 0 }, { ad: "Bilinmeyen", tur: "Müze", fiyat: null },
    ] } } },
    kur: { eurTry: 50 },
  };
}

test("model: geçmiş hafta sonu atlanır, şüpheli fiyat kullanılmaz", () => {
  const m = buildCity(fixture(), "Paris", TODAY);
  assert.equal(m.secili.g, "2026-11-06");
  assert.equal(m.secili.otel.toplam, 2000); // p2'nin 9000'lik şüpheli fiyatı alınmaz
  assert.equal(m.secili.ucus.fiyat, 250);
  const ucuz = m.kategoriler.find((k) => k.kategori === "ucuz");
  assert.equal(ucuz.buHafta, null);
  assert.equal(ucuz.enUcuz.gecelik, 150);
  assert.equal(ucuz.enUcuz.g, "2026-11-13");
  const konforlu = m.kategoriler.find((k) => k.kategori === "konforlu");
  assert.equal(konforlu.enUcuz, null); // doğrulanamadı fiyatı sayılmaz
  assert.equal(m.enUcuzUcus.fiyat, 200);
  assert.equal(m.enUcuzKombi.g, "2026-11-13"); // 300 + 2*200 = 700 < 2000 + 500
  assert.equal(m.restoranlar[0].ad, "Uygun & İyi");
  assert.deepEqual(m.yerler.map((y) => y.ad), ["Eyfel", "Bedava Park", "Bilinmeyen"]);
});

test("şehir sayfası: başlık, canonical, CTA, kaçış, JSON-LD", () => {
  const m = buildCity(fixture(), "Paris", TODAY);
  const html = renderCityPage(m);
  assert.ok(html.includes("<title>Paris hafta sonu bütçesi: otel, uçak, restoran (TL) | 72h Getaway</title>"));
  assert.ok(html.includes('<link rel="canonical" href="https://72hgetaway.com/sehir/paris/">'));
  assert.ok(html.includes('<html lang="tr">'));
  assert.ok(html.includes("Kendi bütçeni hesapla"));
  assert.ok(html.includes('href="/?sehir=Paris&amp;giris=2026-11-06&amp;cikis=2026-11-08&amp;kisi=2"'));
  assert.ok(html.includes('href="/oteller.html?sehir=Paris"'));
  assert.ok(html.includes("Lüks &lt;Otel&gt;"));
  assert.ok(!html.includes("Lüks <Otel>"));
  assert.ok(html.includes("Uygun &amp; İyi"));
  assert.ok(html.includes('"@type":"BreadcrumbList"'));
  assert.ok(html.includes('"@type":"WebPage"'));
  assert.ok(html.includes("tarihli robot kontrolüne göre; cuma–pazar 2 gece, 2 kişi; tahminidir."));
  assert.ok(html.includes("og:title"));
  assert.ok(html.includes("100.000 TL")); // 2000 € × 50 = 100.000 TL
  assert.ok(!html.includes("Kapanan Pazar"));
  assert.ok(!html.includes("undefined") && !html.includes("NaN") && !html.includes("null"));
});

test("Türkçe şehir adı CTA'da kodlanır", () => {
  assert.equal(calcLink({ sehir: "Budapeşte", secili: { g: "2026-11-06", cikis: "2026-11-08" } }), "/?sehir=Budape%C5%9Fte&giris=2026-11-06&cikis=2026-11-08&kisi=2");
  assert.equal(calcLink({ sehir: "Budapeşte", secili: null }), "/?sehir=Budape%C5%9Fte&kisi=2");
});

test("uçuşu ve kullanılabilir oteli olmayan şehir de sayfa üretir", () => {
  const m = buildCity(fixture(), "Budapeşte", TODAY);
  assert.equal(m.secili, null);
  assert.equal(m.ucuslar.length, 0);
  const html = renderCityPage(m);
  assert.ok(html.includes("<title>Budapeşte hafta sonu bütçesi"));
  assert.ok(html.includes("uçak fiyatı henüz yok"));
  assert.ok(html.includes("henüz güvenilir otel ya da uçak fiyatı yok"));
  assert.ok(html.includes('href="/?sehir=Budape%C5%9Fte&amp;kisi=2"'));
  assert.ok(!html.includes("undefined") && !html.includes("NaN"));
});

test("hiç verisi olmayan şehir (dosyalar eksik) çökmez", () => {
  const d = { hotels: { sehirler: [{ sehir: "Riga", oteller: [] }] }, fiyatlar: {}, ucuslar: {}, restoranlar: {}, gezi: {}, kur: {} };
  const m = buildCity(d, "Riga", TODAY);
  const html = renderCityPage(m);
  assert.ok(html.includes("Riga hafta sonu bütçesi"));
  assert.ok(!html.includes("undefined") && !html.includes("NaN"));
});

test("generate: tüm sayfalar, dizin ve sitemap", () => {
  const { files } = generate({ data: fixture(), today: TODAY, write: false });
  assert.deepEqual(Object.keys(files).sort(), ["sehir/budapeste/index.html", "sehir/index.html", "sehir/paris/index.html", "sitemap.xml"]);
  assert.ok(files["sehir/index.html"].includes('href="/sehir/paris/"'));
  assert.ok(files["sehir/index.html"].includes('href="/sehir/budapeste/"'));
  assert.ok(files["sitemap.xml"].includes("<loc>https://72hgetaway.com/sehir/budapeste/</loc><lastmod>2026-10-31</lastmod>"));
  assert.ok(files["sitemap.xml"].includes("<loc>https://72hgetaway.com/hakkinda.html</loc>"));
});

test("gerçek veriyle 26 şehir üretilir", () => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const { models, files } = generate({ root, today: TODAY, write: false });
  assert.equal(models.length, 26);
  assert.equal(new Set(models.map((m) => m.slug)).size, 26);
  for (const m of models) assert.match(m.slug, /^[a-z0-9-]+$/);
  for (const [k, v] of Object.entries(files)) if (k.endsWith(".html")) assert.ok(!v.includes("undefined") && !v.includes("NaN"), k);
});

console.log(`\n${n} test. TÜM TESTLER GEÇTİ`);
