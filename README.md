# 72h Getaway: hesaplayıcı sitesi

Bu klasörün **tamamı** GitHub deposuna yüklenir. Hiçbir dosyayı silme ya da yerini değiştirme.

## Klasörde ne var?

| Dosya | Ne işe yarar |
| --- | --- |
| `index.html` | Hesaplayıcı uygulamanın kendisi (site bu) |
| `data.json` | Euro/TL ve euro/forint kuru (otomatik güncellenir) |
| `prices.json`, `price-status.json` | Resmî bilet fiyatları ve kontrol durumu |
| `scripts/` | Kuru güncelleyen ve Paris otel havuzunu deneyen programlar |
| `.github/workflows/` | Otomatik çalışan görevler (kur her iş günü, otel testi elle) |
| `.nojekyll` | GitHub'ın siteyi bozmadan yayınlaması için boş dosya |

## Gerekli ayarlar
1. Settings > Pages > Source: Deploy from a branch, branch: main, klasör: / (root)
2. Settings > Secrets and variables > Actions > New repository secret: `TRAVELPAYOUTS_TOKEN` (yalnızca otel testi için)

Gizli anahtarı hiçbir yere yazma, yalnızca GitHub'ın kasasına koy.
