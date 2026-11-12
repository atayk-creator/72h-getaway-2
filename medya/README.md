# medya/ — geçici yayın dosyaları

Sosyal medya ofisi, Metricool'a video vermek için yayınlanacak videoları ve kapakları buraya koyar.
Metricool dosyayı kendi sunucusuna kopyalar; gönderi yayınlandıktan sonra buradaki dosyalar silinebilir.
Site kodu değildir, siteden hiçbir yere bağlanmaz.

## Metricool için adres (13 Kasım'dan itibaren)

Buraya konan her dosya birkaç dakika içinde `medya-yayin` dalına otomatik kopyalanır (`.github/workflows/medya-senkron.yml`).
Metricool'a bu kalıcı adresi ver:

    https://raw.githubusercontent.com/atayk-creator/72h-getaway-2/medya-yayin/<dosya-adı>

3 günden eski dosyalar her gece buradan (main dalından) silinir; medya-yayin dalında durmaya devam eder.
Böylece site her güncellemede yüzlerce MB video yayınlamaz.
