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
| `scripts/` | Kuru güncelleyen, uçuş ve otel fiyatlarını çeken programlar ve testleri |
| `.github/workflows/` | Otomatik çalışan görevler |
| `.nojekyll` | GitHub'ın siteyi bozmadan yayınlaması için boş dosya |

## Otel fiyat robotu

- 26 AB başkenti (Lefkoşa hariç), her şehirde 8 otel: 1 ikonik, 2 pahalı, 3 konforlu, 2 ucuz (`data/hotels.json`).
- Kaynak: Google Hotels, Apify'daki hazır robot ile (`eiv/google-hotels-scraper`). Bir hafta sonu için tüm oteller tek çalışmada sorgulanır.
- Fiyat: 2 yetişkin, Cuma giriş, Pazar çıkış (2 gece), euro. Ana fiyat tanınmış sitelerden (`guvenilir_siteler`);
  daha ucuz az bilinen site varsa ayrıca kaydedilir.
- Takvim (`kontrol_takvimi`), İstanbul saatiyle 06:17:
  - 1–2. hafta sonu: Pazartesi ve Perşembe
  - 3–8. hafta sonu: iki haftada bir Pazartesi
  - 9–13. hafta sonu: dört haftada bir Perşembe
- `ozel_tarihler`: buraya yazılan Cuma tarihleri (yılbaşı, büyük etkinlik) her zaman en sık kontrol edilir.
- Bütçe: `apify_plan` (free / starter), `aylik_butce_usd` ve `fatura_gunu` (Apify fatura döneminin başladığı gün).
  Dönem içinde tahmini harcama sınıra gelince robot kalan hafta sonlarını atlar, önce en yakınlar çekilir.
  Ölçülen maliyet: otel başına ~0,0028 $ (bir hafta sonunun 208 oteli ~0,59 $); bu takvimle ayda ~21 $.
- Sonuçlar: `data/otel-fiyatlari.json` (özet, konumlar, harcama) ve `data/fiyatlar/<şehir>.json` (fiyatlar).
  Geçmiş hafta sonları `data/arsiv/<yıl-ay>.json`'a taşınır.
- Elle çalıştırma: Actions > "Otel fiyat robotu" > Run workflow. `test` = sadece en yakın hafta sonu,
  `sehir` kutusuna "Paris,Roma" yazılırsa sadece o şehirler.
- Sayfalar: hesaplayıcının otel adımı bu fiyatları kullanır; `oteller.html?sehir=Paris` şehir şehir fiyat takvimini gösterir.

## Uçak fiyat robotu

- İstanbul (IST ve SAW) çıkışlı, Cuma gidiş Pazar dönüş, 1 kişi gidiş-dönüş en ucuz ve en ucuz aktarmasız uçuş, 26 başkent.
- Kaynak: Google Flights, Apify'daki hazır robot ile (`dz_omar/google-flights-scraper`). Ayarlar `data/ucus-ayarlari.json`, sonuç `data/ucuslar.json`.
- Takvim: her Salı 06:17; 1–4. hafta sonu her hafta, 5–8. hafta sonu iki haftada bir.
- Ölçülen maliyet: şehir-hafta sonu başına ~0,028 $ (26 şehir ~0,73 $); bu takvimle ayda ~19 $. Toplu arama ucuzlatmıyor.
- Hesaplayıcı: seçilen tarihe denk gelen hafta sonunun fiyatını gösterir, "Uçağı bütçeye ekle" ile toplama katar.
  Aktarmasız uçuş en ucuzdan en fazla %20 pahalıysa onu öne çıkarır.

## Restoran robotu

- Her başkentin merkezinde (`data/restoran-ayarlari.json` > `merkez`, `yaricap_km`) Google Maps'te restoran arar, Apify'daki hazır robot ile (`compass/crawler-google-places`).
- Seçim: 2 uygun (şehrin en ucuz %35'i), 2 popüler (orta fiyatta en çok yorumlu, puan 4,5+), 2 lüks (şehrin ortanca fiyatının en az 1,8 katı). Hepsinde puan 4,4+ ve yeterli yorum; zincirler, barlar, caz kulüpleri, tekne turları elenir.
- Kişi başı fiyat: Google kullanıcılarının bildirdiği aralığın ortası, ECB kuruyla euroya çevrilir.
- Sonuç `data/restoranlar.json`, tüm adaylar `data/restoran-adaylari.json`.
- Takvim: her ayın 3'ünde `yenile` (seçilenlerin puan/fiyat/açık bilgisini tazeler, kapananı değiştirir, ~1 $).
  Elle: `kesif` (baştan arama, ~0,36 $/şehir), `sec` (kurallar değişince adaylardan yeniden seçim, ücretsiz).

## Şehir turu ve ulaşım (data/gezi.json)

- 26 başkent: toplu taşıma fiyatları (tek bilet, günlük, 72 saatlik kart, havalimanı) ve 25 şehirde 10'ar gezi yeri
  (Budapeşte'nin yerleri `index.html` içinde). Fiyatlar yerel para biriminde, resmî sayfalardan; `fiyat: null` = henüz doğrulanmadı.
- Konumlar Google Maps'ten: Actions > "Gezi yerleri konum robotu" (sadece konumu olmayanları arar, ~0,003 $/yer).
- Hesaplayıcı: ulaşım bütçesi = havalimanı gidiş-dönüş + kalınan günler için en ucuz seçenek (günde 2 yolculuk);
  gezi bütçesi = programdaki yerlerin biletleri (fiyatı bilinmeyenler için şehrin ortanca bilet fiyatı).
- Para birimleri `data.json` > `kurlar` (ECB, her gün) ile euroya çevrilir.

## Apify bütçesi (tüm robotlar ortak)

- Robotlar çalışmadan önce Apify'ın kendi kullanım sayacını okur (`/users/me/limits`); harcama sınırı geçecekse kalan aramaları atlar.
- Her çalışmanın gerçek maliyeti, çalışma öncesi ve sonrası sayaç farkıyla ölçülüp `data/otel-fiyatlari.json` > `olcumler` alanına yazılır.
- Sınır: `data/hotels.json` > `aylik_butce_usd` (45 $) ve Apify hesabının kendi aylık sınırı (hangisi düşükse). İki robotun toplamı ayda ~40 $.
- Uçak robotunun ölçümleri `data/ucuslar.json` > `olcumler` alanındadır.

## Gerekli ayarlar
1. Settings > Pages > Source: Deploy from a branch, branch: main, klasör: / (root)
2. Settings > Secrets and variables > Actions > New repository secret:
   - `APIFY_TOKEN`: otel fiyat robotu için (Apify > Settings > API & Integrations)
   - `TRAVELPAYOUTS_TOKEN`: uçuş ve Paris otel testleri için

Gizli anahtarı hiçbir yere yazma, yalnızca GitHub'ın kasasına koy.
