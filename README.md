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
| `data.json` | Euro/TL ve euro/forint kuru (otomatik güncellenir) |
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
  208 otel için tahmini aylık tutar Starter planda yaklaşık 22 $.
- Sonuçlar: `data/otel-fiyatlari.json` (özet, konumlar, harcama) ve `data/fiyatlar/<şehir>.json` (fiyatlar).
  Geçmiş hafta sonları `data/arsiv/<yıl-ay>.json`'a taşınır.
- Elle çalıştırma: Actions > "Otel fiyat robotu" > Run workflow. `test` = sadece en yakın hafta sonu,
  `sehir` kutusuna "Paris,Roma" yazılırsa sadece o şehirler.
- Sayfalar: hesaplayıcının otel adımı bu fiyatları kullanır; `oteller.html?sehir=Paris` şehir şehir fiyat takvimini gösterir.

## Gerekli ayarlar
1. Settings > Pages > Source: Deploy from a branch, branch: main, klasör: / (root)
2. Settings > Secrets and variables > Actions > New repository secret:
   - `APIFY_TOKEN`: otel fiyat robotu için (Apify > Settings > API & Integrations)
   - `TRAVELPAYOUTS_TOKEN`: uçuş ve Paris otel testleri için

Gizli anahtarı hiçbir yere yazma, yalnızca GitHub'ın kasasına koy.
