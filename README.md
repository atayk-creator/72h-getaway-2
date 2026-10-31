# 72h Getaway: hesaplayıcı sitesi

Bu klasörün **tamamı** GitHub deposuna yüklenir. Hiçbir dosyayı silme ya da yerini değiştirme.

## Klasörde ne var?

| Dosya | Ne işe yarar |
| --- | --- |
| `index.html` | Hesaplayıcı uygulamanın kendisi (site bu) |
| `oteller.html` | Seçilmiş otellerin Cuma–Pazar fiyatları ve en ucuz hafta sonları |
| `data/hotels.json` | Otel fiyat robotunun listesi ve kontrol takvimi. Otel eklemek/çıkarmak için bunu değiştir |
| `data/otel-fiyatlari.json`, `data/fiyatlar/` | Robotun bulduğu fiyatlar (robot yazar, elle değiştirme) |
| `data/arsiv/` | Geçmiş hafta sonlarının fiyatları (robot yazar) |
| `data/ucus-ayarlari.json`, `data/ucuslar.json` | Uçak robotunun ayarları ve bulduğu fiyatlar |
| `data/restoran-ayarlari.json`, `data/restoranlar.json`, `data/restoran-adaylari.json` | Restoran robotunun ayarları, seçtiği restoranlar ve adaylar |
| `data.json` | Euro/TL, euro/forint ve diğer kurlar (her gün 18:23, ECB referans kuru) |
| `data/gezi.json` | 26 şehrin gezi yerleri ve toplu taşıma fiyatları |
| `prices.json`, `price-status.json` | Resmî bilet fiyatları ve kontrol durumu |
| `tablo/72h-getaway-veri.xlsx`, `data/tablo-*.json` | Google E-Tablolar ile elle düzenleme (aşağıda) |
| `scripts/` | Kuru güncelleyen, uçuş, otel ve restoran verisini çeken programlar, Denetçi ve testleri (`for t in scripts/test-*.mjs; do node $t; done`, `python3 scripts/test_tablo.py`) |
| `.github/workflows/` | Otomatik çalışan görevler |
| `.nojekyll` | GitHub'ın siteyi bozmadan yayınlaması için boş dosya |

## Otel fiyat robotu

- 26 AB başkenti (Lefkoşa hariç), her şehirde 8 otel: 1 ikonik, 2 pahalı, 3 konforlu, 2 ucuz (`data/hotels.json`).
- Kaynak: Google Hotels, Apify'daki hazır robot ile (`eiv/google-hotels-scraper`). Bir hafta sonu için tüm oteller tek çalışmada sorgulanır.
- Fiyat: 2 yetişkin, Cuma giriş, Pazar çıkış (2 gece), euro, **vergiler dahil**. Ana fiyat tanınmış sitelerden (`guvenilir_siteler`);
  daha ucuz az bilinen site varsa ayrıca kaydedilir (`enUcuz`, o da vergili).
- Vergi (`vergi_kontrolu: true`): Google Hotels bağlantılarda ABD pazarını (POSCountryCode=US) kullanıyor ve site fiyatlarını
  vergisiz gösteriyor (Priceline kayıtlarının 211/212'sinde fiyat = bağlantıdaki `pdt` − `pdtax`; Booking, Agoda, Expedia,
  Hotels.com ve Trip.com'da da aynı). Robot vergili toplamı şu sırayla bulur:
  a) bağlantıdaki vergili toplam ve vergi (`pdt`/`pdtax`, `ext_price_total`/`ext_price_tax`, `mpf`/`mpj`, `PriceTotal`/`PriceTax` ...),
  b) Google satırındaki vergi kırılımı (`totalPriceBeforeTaxes`, `taxesAndFees`), seçilen fiyat vergisiz toplama ±%3 yakınsa,
  c) Google'ın vergili toplamı (`totalPrice`) fiyatın %3–45 üstündeyse o, d) yoksa fiyat olduğu gibi.
- Kayıt alanları (`haftaSonlari[Cuma].oteller[id].son`):
  - `fiyat`: 2 gecelik vergili toplam (€), `gecelik` = fiyat / 2. `fiyatVergisiz`: sitenin vergisiz fiyatı (sadece fiyat artırıldıysa).
  - `vergi`: `dahil` (fiyat zaten vergili), `eklendi` (vergi eklendi), `bilinmiyor`.
  - `durum`: `fiyat` (tanınmış sitede bulundu), `dogrulanamadi` (sadece az bilinen sitelerde; fiyat, site, bağlantı bilgi için
    kalır ama sitede kullanılmaz), `dolu`, `bulunamadi`, `hata`, `sonuc_yok`.
  - `supheli: true`: gecelik fiyat otelin Google'daki olağan üst fiyatının (`tipikGecelik[1]`) 1,5 katından fazla; kullanılmaz.
  - Kullanılabilir fiyat = `durum === "fiyat"` ve `supheli` değil. Özet (`sonCalisma.fiyatli`), robot raporu ve Denetçi buna göre sayar.
  - `gecmis` satırları ve arşiv de aynı alanları (`fiyat`, `fiyatVergisiz`, `vergi`, `supheli`) taşır.
- Kategori sırası: her şehirde kategori ortancaları ucuz ≤ konforlu ≤ pahalı olmalı; değilse robot özeti ve Denetçi uyarır.
- Takvim (`kontrol_takvimi`), İstanbul saatiyle 06:17:
  - 1–2. hafta sonu: Pazartesi ve Perşembe
  - 3–8. hafta sonu: iki haftada bir Pazartesi
  - 9–13. hafta sonu: dört haftada bir Perşembe
- `ozel_tarihler`: buraya yazılan Cuma tarihleri (yılbaşı, büyük etkinlik) her zaman en sık kontrol edilir.
- Bütçe: `apify_plan` (free / starter), `aylik_butce_usd` ve `fatura_gunu` (Apify fatura döneminin başladığı gün).
  Dönem içinde tahmini harcama sınıra gelince robot kalan hafta sonlarını atlar, önce en yakınlar çekilir.
  Ölçülen maliyet: otel başına ~0,0028 $ (bir hafta sonunun 208 oteli ~0,59 $); bu takvimle ayda ~21 $.
  Özel tarihler (şu an 2026-12-25 ve 2027-01-01) o hafta sonu geçene kadar ayda ~7 $ ekler.
- Sonuçlar: `data/otel-fiyatlari.json` (özet, konumlar, harcama) ve `data/fiyatlar/<şehir>.json` (fiyatlar).
  Geçmiş hafta sonları `data/arsiv/<yıl-ay>.json`'a taşınır.
- Elle çalıştırma: Actions > "Otel fiyat robotu" > Run workflow. `test` = sadece en yakın hafta sonu,
  `sehir` kutusuna "Paris,Roma" yazılırsa sadece o şehirler.
- Pazar A/B denemesi (vergili fiyatı doğrudan veren pazarı bulmak için): Run workflow > mod `test`, sehir `Amsterdam,Kopenhag`
  (vergi farkı en büyük şehirler), `pazar` kutusu boş (şu anki ayar). Sonra aynısını `pazar` = `nl`, `de`, `us` ... ile çalıştır.
  `pazar` doluyken veriler kaydedilmez; özetteki "Pazar denemesi" tablosu her otelin site fiyatını, vergili fiyatını ve vergi
  durumunu gösterir. Bir pazarda "zaten vergili" sayısı belirgin artıyor ve fiyatlar Google'ın vergili toplamına yakınsa
  `data/hotels.json` > `pazar` o pazara çevrilir. Pazarı denemeden değiştirme. Her deneme ~16 otel × 0,003 $ ≈ 0,05 $.
- Eski kayıtların vergili fiyata geçişi: `node scripts/gecis-vergi.mjs` (tek seferlik; `vergi` alanı olan kayıtları atlar,
  tekrar çalıştırmak bir şey değiştirmez). 2026-10-31'de 2391 kayıt çevrildi; ortanca artış %13 (Amsterdam %33,5, Kopenhag %25, Lüksemburg %3).
- Sayfalar: hesaplayıcının otel adımı bu fiyatları kullanır; `oteller.html?sehir=Paris` şehir şehir fiyat takvimini gösterir.

## Uçak fiyat robotu

- İstanbul (IST ve SAW) çıkışlı, Cuma gidiş Pazar dönüş, 1 kişi gidiş-dönüş en ucuz ve en ucuz aktarmasız uçuş, 26 başkent.
- Kaynak: Google Flights, Apify'daki hazır robot ile (`dz_omar/google-flights-scraper`). Ayarlar `data/ucus-ayarlari.json`, sonuç `data/ucuslar.json`.
- Takvim: her Salı 06:17; 13 hafta sonu: 1–4. hafta sonu her hafta, 5–8. iki haftada bir, 9–13. dört haftada bir.
  `ozel_tarihler` (2026-12-25, 2027-01-01) her hafta aranır.
- Ölçülen maliyet: şehir-hafta sonu başına ~0,028 $ (26 şehir ~0,73 $); bu takvimle ayda ~23 $ (8 hafta sonuyla ~19 $ idi,
  9–13. hafta sonları ~4 $ ekledi; özel tarihler geçene kadar +~2 $). Toplu arama ucuzlatmıyor.
- Bağlantılar Google Flights'ı Türkçe açar (`hl=tr`); eski kayıtlar `node scripts/gecis-ucus-baglanti.mjs` ile çevrildi.
- Hesaplayıcı: seçilen tarihe denk gelen hafta sonunun fiyatını gösterir, "Uçağı bütçeye ekle" ile toplama katar.
  Aktarmasız uçuş en ucuzdan en fazla %20 pahalıysa onu öne çıkarır.

## Restoran robotu

- Her başkentin merkezinde (`data/restoran-ayarlari.json` > `merkez`, `yaricap_km`) Google Maps'te restoran arar, Apify'daki hazır robot ile (`compass/crawler-google-places`).
- Seçim: 2 uygun (şehrin en ucuz %35'i), 2 popüler (orta fiyatta en çok yorumlu, puan 4,5+), 2 lüks (şehrin ortanca fiyatının en az 1,8 katı). Hepsinde puan 4,4+ ve yeterli yorum; zincirler, barlar, caz kulüpleri, tekne turları elenir.
- Kişi başı fiyat: Google kullanıcılarının bildirdiği aralığın ortası, ECB kuruyla euroya çevrilir.
- Sonuç `data/restoranlar.json`, tüm adaylar `data/restoran-adaylari.json`.
- `mutfak`: Google'ın İngilizce kategori adı; `mutfakTr`: sitede gösterilen Türkçe adı ("Fine dining restaurant" → "Gurme",
  "Hungarian restaurant" → "Macar mutfağı"; sözlükte yoksa sondaki " restaurant" atılır). Tablodan elle yazılan mutfak adı aynen kullanılır.
- Takvim: her ayın 3'ünde `yenile` (seçilenlerin puan/fiyat/açık bilgisini tazeler, kapananı değiştirir, ~1 $).
  Elle: `kesif` (baştan arama, ~0,36 $/şehir), `sec` (kurallar değişince adaylardan yeniden seçim, ücretsiz).

## Şehir turu ve ulaşım (data/gezi.json)

- 26 başkent: toplu taşıma fiyatları (tek bilet, günlük, 72 saatlik kart, havalimanı) ve 25 şehirde 10'ar gezi yeri
  (Budapeşte'nin yerleri `index.html` içinde). Fiyatlar yerel para biriminde, resmî sayfalardan; `fiyat: null` = henüz doğrulanmadı.
- Konumlar Google Maps'ten: Actions > "Gezi yerleri konum robotu" (sadece konumu olmayanları arar, ~0,003 $/yer).
- `kapali`: Google Maps yeri geçici (`"gecici"`) ya da kalıcı (`"kalici"`) kapalı gösteriyorsa robot yazar (örnek: Marché des Enfants Rouges,
  sezon dışındaki Noel pazarları). Haftalık kapalı gün ya da "geçici sergi" kapanma sayılmaz.
- Hesaplayıcı: ulaşım bütçesi = havalimanı gidiş-dönüş + kalınan günler için en ucuz seçenek (günde 2 yolculuk);
  gezi bütçesi = programdaki yerlerin biletleri (fiyatı bilinmeyenler için şehrin ortanca bilet fiyatı).
- Para birimleri `data.json` > `kurlar` (ECB, her gün) ile euroya çevrilir.

## Google E-Tablolar ile elle düzenleme

- Tablo: `tablo/72h-getaway-veri.xlsx` (sekmeler: Okubeni, Oteller, Restoranlar, Gezi, Ulaşım). Google Drive'a yüklenip Google E-Tablolar olarak açılır.
- Bağlantı: Dosya > Paylaş > Web'de yayınla > Tüm doküman + Microsoft Excel (.xlsx). Çıkan bağlantı `data/tablo-ayar.json` > `url` alanına yazılır.
- Robot (`scripts/tablo.py`, Actions > "Tablo aktarımı") her sabah 07:41'de tabloyu okur ve SADECE son okumadan bu yana değişen hücreleri işler.
  Karşılaştırma için son görülen tablo `data/tablo-son.json`'da tutulur; rapor `data/tablo-rapor.json`'a ve Actions özetine yazılır.
- Kurallar: satır silmek bir şey silmez, çıkarmak için `Aktif` = HAYIR. Yeni satırda `Kimlik` boş bırakılır.
  Değiştirilen ya da eklenen restoran kilitlenir (`kilit: true`), restoran robotu ona dokunmaz; HAYIR yapılanlar `haric` listesine girer, bir daha seçilmez.
  Otelin "Google'da aranacak ad"ı değişirse eski eşleşme silinir, robot yeniden arar. Yeni ya da aranacak adı değişen gezi yerinin konumunu aynı görev bulur.
  Hatalı hücre (geçersiz kategori, sayı olmayan fiyat) işlenmez, düzeltilene kadar her gün raporlanır.
- Robotların eklediği yeni restoranları tabloda görmek için: Actions > "Tablo aktarımı" > Run workflow > "yeni tablo"; üretilen dosya
  Google'da Dosya > İçe aktar > Yükle > "E-tabloyu değiştir" ile aynı tabloya yüklenir (bağlantı değişmez).
- Otel listesi elle (ya da robotla) değiştiğinde tabloyu yenile: "yeni tablo" ile üretip aynı tabloya yükle. Yüklemeden önce tabloda
  eski satırlar durur; onlara dokunulmadıkça zarar vermez, ama listeden çıkmış bir oteli düzenlemek "kimliği bulunamadı" hatası verir.
- Testler: `python3 scripts/test_tablo.py`

## Denetçi (günlük sağlık kontrolü)

- `scripts/denetci.mjs`, Actions > "Denetçi": her gün 06:40 UTC (09:40 İstanbul) ve elle. Ücretli API kullanmaz.
- Kontroller: kur (`data.json`) son 4 iş gününde, otel robotu (`sonCalisma.tarih`) son 5 günde, uçak robotu son 9 günde,
  restoran robotu son 40 günde veri yazmış mı; her şehirde önümüzdeki 2 hafta sonu için kullanılabilir otel fiyatı en az %60 mı;
  gelecek hafta sonlarının hiçbirinde kullanılabilir fiyatı olmayan oteller; her iş akışının son tamamlanan çalışması başarısız mı;
  https://72hgetaway.com/ açılıyor mu (HTTPS/sertifika sorunu ayrıca yazılır); tablo aktarım raporunda hata var mı.
- Sorun varsa "denetci" etiketli tek bir issue ("Denetçi: sorun var") açar ya da gövdesini günceller; sorunlar bitince yorum yazıp kapatır.
  Kategori sırası uyarıları ve henüz kontrol edilmemiş yeni oteller raporda bilgi olarak geçer, issue açtırmaz.
- Testler: `node scripts/test-denetci.mjs`.

## Apify bütçesi (tüm robotlar ortak)

- Robotlar çalışmadan önce Apify'ın kendi kullanım sayacını okur (`/users/me/limits`); harcama sınırı geçecekse kalan aramaları atlar.
- Her çalışmanın gerçek maliyeti, çalışma öncesi ve sonrası sayaç farkıyla ölçülüp `data/otel-fiyatlari.json` > `olcumler` alanına yazılır.
- Sınır: `data/hotels.json` > `aylik_butce_usd` (45 $) ve Apify hesabının kendi aylık sınırı (hangisi düşükse).
- Fatura: Apify Starter planı ayda 19 $ ve bu 19 $'lık kullanımı içerir; aşan kullanım ayrıca ödenir. Yani normal bir ayın faturası
  19 $ + kullanım değil, yaklaşık toplam kullanım kadardır: otel ~21 $ + uçak ~19 $ + restoran ~1 $ ≈ 41 $; uçak robotu
  13 hafta sonuna genişleyince ≈ 45 $. Kasım–Aralık'ta özel tarihlerle (yılbaşı) kullanım ~54 $'a çıkabilir; o zaman sınır (45 $)
  dönem sonunda uzak hafta sonlarını atlatır. Daha fazlası isteniyorsa `aylik_butce_usd` artırılır.
- Uçak robotunun ölçümleri `data/ucuslar.json` > `olcumler` alanındadır.

## Gerekli ayarlar
1. Settings > Pages > Source: Deploy from a branch, branch: main, klasör: / (root)
2. Settings > Secrets and variables > Actions > New repository secret:
   - `APIFY_TOKEN`: otel, uçak, restoran ve gezi konum robotları için (Apify > Settings > API & Integrations)

   - Denetçi ek anahtar istemez; GitHub'ın kendi `GITHUB_TOKEN`'ını kullanır (izinler iş akışında: contents read, issues write, actions read).

Gizli anahtarı hiçbir yere yazma, yalnızca GitHub'ın kasasına koy.
