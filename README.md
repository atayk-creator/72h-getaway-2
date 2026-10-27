# 72h Getaway: hesaplayıcı sitesi ve robotları

Site: https://atayk-creator.github.io/72h-getaway-2/

## Robotlar

| Robot | Ne yapar | Ne zaman (TR saati) | Yapay zekâ | Sonuç nereye gider |
| --- | --- | --- | --- | --- |
| **Kur Bekçisi** | Euro/TL ve euro/forint kurunu ECB'den alır | Her iş günü 19:10 | Hayır | `data.json` (doğrudan) |
| **Uçuş Robotu** | İstanbul'dan 37 başkente cuma-pazartesi en ucuz gidiş-dönüş | Salı ve cuma 08:20 | Hayır | `flights.json` (doğrudan) |
| **Bilet Robotu** | Resmî sayfalardan bilet fiyatlarını okur, sayfadaki alıntıyla kanıtlar | Pazartesi 09:00 | Evet (ucuz model) | Değişiklik varsa **onay isteği** |
| **Şehir Araştırmacısı** | Sıradaki şehir için 3 otel, 3 restoran, ulaşım; her satır kaynaklı | Çarşamba 10:00 ya da elle | Evet + web araması | **Onay isteği** |
| **İçerik Robotu** | Uygulamanın rakamlarıyla haftanın 4 Shorts taslağı | Pazar 11:00 | Evet | **Issue** (e-postana gelir) |
| **Denetçi** | Veri eskidi mi, robot hata verdi mi, site açık mı | Her sabah 09:40 | Hayır | Sorun varsa **Issue** |

Hepsi Actions sekmesinden "Run workflow" ile elle de çalıştırılabilir.

## Güvenlik kuralları (kodla denetlenir)

- Bilet Robotu, yapay zekânın verdiği fiyatı ancak **sayfada birebir geçen alıntıyla** kabul eder.
- Şehir Araştırmacısı, yalnızca **o çalışmada gerçekten gördüğü arama sonuçlarını** kaynak gösterebilir. Uydurma bağlantı, saçma fiyat ya da aşırı sapan tahmin otomatik elenir.
- İçerik Robotu rakam hesaplamaz. Rakamlar uygulamanın formülüyle hesaplanır; taslakta başka rakam geçerse reddedilir.
- Yapay zekâlı robotların her çalışmasında bütçe sınırı var (bilet 0,5 $, şehir 1,5 $, içerik 0,6 $). Aşılırsa robot durur.
- Senin onayın (Merge) olmadan hiçbir araştırma ya da fiyat değişikliği siteye girmez. Kur ve uçuş verisi doğrudan girer, sitede tarih ve "önbellek" notuyla gösterilir.

## Kurulum (bir kerelik)

1. **Settings > Secrets and variables > Actions > New repository secret**
   - `ANTHROPIC_API_KEY`: Claude API anahtarın (platform.claude.com)
   - `TRAVELPAYOUTS_TOKEN`: Travelpayouts API jetonun
2. **Settings > Actions > General > Workflow permissions**: "Read and write permissions" ve "Allow GitHub Actions to create and approve pull requests" işaretli, Save.
3. **Settings > Pages**: Deploy from a branch, `main`, `/ (root)`.

Anahtar yokken yapay zekâlı robotlar hata vermez, "atlandı" yazıp geçer; Denetçi bunu bilgi olarak bildirir.

## Klasörler

| Yol | İçerik |
| --- | --- |
| `index.html` | Uygulama |
| `data.json`, `flights.json`, `prices.json`, `price-status.json` | Robotların yazdığı veri |
| `sehirler/` | Onaylanmış şehir araştırmaları; `sira.json` araştırma sırası (istediğin gibi değiştir) |
| `scripts/` | Robotlar; `scripts/lib/` ortak parçalar; `scripts/test/` testler |
| `.github/workflows/` | Zamanlamalar |

Testler: `node --test "scripts/test/*.test.mjs"` ve `node scripts/test-update-rates.mjs`.

## Model ve maliyet ayarı

Varsayılan modeller `claude-haiku-5-5` (bilet) ve `claude-sonnet-5-5` (şehir, içerik). Değiştirmek için kod yerine
**Settings > Secrets and variables > Actions > Variables** bölümüne `CLAUDE_MODEL_UCUZ` / `CLAUDE_MODEL_ORTA` ekle.
Claude Console'da aylık harcama sınırı koy.
