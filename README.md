# 72h Getaway: hesaplayıcı sitesi

Bu klasörün **tamamı** GitHub deposuna yüklenir. Hiçbir dosyayı silme ya da yerini değiştirme.

## Klasörde ne var?

| Dosya | Ne işe yarar |
| --- | --- |
| `index.html` | Hesaplayıcı uygulamanın kendisi (site bu) |
| `oteller.html` | Seçilmiş otellerin Cuma–Pazar fiyatları ve en ucuz hafta sonları |
| `data/hotels.json` | Otel fiyat robotunun listesi ve kontrol takvimi. Otel eklemek/çıkarmak için bunu değiştir |
| `data/otel-fiyatlari.json` | Robotun bulduğu fiyatlar (robot yazar, elle değiştirme) |
| `data/otel-fiyat-arsivi.json` | Geçmiş hafta sonlarının fiyatları (robot yazar) |
| `data.json` | Euro/TL ve euro/forint kuru (otomatik güncellenir) |
| `prices.json`, `price-status.json` | Resmî bilet fiyatları ve kontrol durumu |
| `scripts/` | Kuru güncelleyen, uçuş ve otel fiyatlarını çeken programlar ve testleri |
| `.github/workflows/` | Otomatik çalışan görevler |
| `.nojekyll` | GitHub'ın siteyi bozmadan yayınlaması için boş dosya |

## Otel fiyat robotu

- Kaynak: Google Hotels, Apify'daki hazır robot ile (`eiv/google-hotels-scraper`).
- Fiyat: 2 yetişkin, Cuma giriş, Pazar çıkış (2 gece), en ucuz teklif, euro.
- Takvim (`data/hotels.json` > `kontrol_takvimi`), İstanbul saatiyle 06:17:
  - 1–4. hafta sonu: Pazartesi, Çarşamba, Cuma
  - 5–8. hafta sonu: Pazartesi, Perşembe
  - 9–13. hafta sonu: Pazartesi
  - 14–26. hafta sonu: iki haftada bir Pazartesi
- `ozel_tarihler` listesine yazılan Cuma tarihleri (yılbaşı, büyük etkinlik) her zaman "sıcak" kontrol edilir.
- Maliyet: Budapeşte'nin 8 oteli için ayda yaklaşık 1.080 sorgu ≈ 4 $. Apify'ın ücretsiz aylık 5 $ kredisine sığar.
  Yeni şehir eklemeden önce ücretli plana geçmek ya da takvimi seyreltmek gerekir.
- Elle deneme: Actions > "Otel fiyat robotu" > Run workflow > mod: `test` (sadece en yakın hafta sonu, yaklaşık 3 sent).

## Gerekli ayarlar
1. Settings > Pages > Source: Deploy from a branch, branch: main, klasör: / (root)
2. Settings > Secrets and variables > Actions > New repository secret:
   - `APIFY_TOKEN`: otel fiyat robotu için (Apify > Settings > API & Integrations)
   - `TRAVELPAYOUTS_TOKEN`: uçuş ve Paris otel testleri için

Gizli anahtarı hiçbir yere yazma, yalnızca GitHub'ın kasasına koy.
