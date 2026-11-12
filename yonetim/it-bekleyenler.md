# IT: bekleyen işler

Bir sonraki IT notuna girecek konular. Yapılınca buradan silinir ve durum notunda raporlanır.

## 1. `medya/` klasörünü `medya-yayin` dalına taşı (yönetim kurulu, 10 Kasım) — YAPILDI 12 Kasım

Otomatik senkron kuruldu (`.github/workflows/medya-senkron.yml`): yeni dosyalar medya-yayin dalına kopyalanır, 3 günden eskiler main'den silinir. İlk çalışmada 19 dosya çıkarıldı (475 → 308 MB). Kalan iş: sosyal medya ofisinin Metricool'a raw.githubusercontent adresini vermesi (medya/README.md).

**Sorun**
- `medya/` klasörü 352 MB (10 Kasım). İçinde 50 video ve kapak var; her gün yaklaşık 15 dosya ekleniyor.
- GitHub Pages siteyi her güncellemede bütün depoyla birlikte yayınlıyor. Bu yük her yayında taşınıyor, yayın yavaşlıyor.
- Pages sitesinin önerilen üst sınırı 1 GB. Bu hızla birkaç haftada o sınıra yaklaşılır.

**Neden güvenli**
- `medya/README.md`'ye göre Metricool dosyayı gönderi planlanırken kendi sunucusuna kopyalıyor.
- Bu yüzden planlanmış gönderiler buradaki dosyaya bağlı değil.
- Sitenin hiçbir sayfası `medya/` klasörüne bağlantı vermiyor.

**Plan**
1. **Sosyal medya ofisiyle saat ayarla.** O sohbet dosyaları doğrudan `medya/` klasörüne yazıyor. Taşıma sırasında yeni dosya gelirse kaybolur.
2. Bugünkü `medya/` içeriğini tek commit'le `medya-yayin` dalına kopyala.
   - Bu dalın kendi geçmişi var, siteden bağımsız.
   - Metricool'a verilecek adres:
     `https://raw.githubusercontent.com/atayk-creator/72h-getaway-2/medya-yayin/<dosya>`
3. `main` dalında `medya/` klasöründen dosyaları sil. Klasörde yalnızca yeni yeri anlatan `README.md` kalsın.
4. Sosyal medya ofisinin yükleme talimatını yeni dala göre güncelle (onların README'si ve sohbet talimatı).
5. Koruma ekle: `main` dalında `medya/` klasörüne README dışında bir dosya girerse küçük bir denetim iş akışı uyarsın.
6. Bakım: `medya-yayin` dalında yayınlanmış gönderilerin dosyaları ayda bir silinsin.
   - Gerekirse dal geçmişsiz olarak yeniden başlatılsın, böylece klonlama da küçük kalır.

**Not:** Silinen 352 MB `main` dalının git geçmişinde kalır.
- Sitenin yayın yükü hemen düşer, çünkü Pages yalnızca güncel dosyaları yayınlar.
- Depoyu klonlamak ise büyük kalır.
- Geçmişi yeniden yazmak önerilmez: paralel çalışan sohbetler ve robotların açık işleri bozulur.

**Kontrol:** Taşımadan sonra bir site güncellemesinin yayın süresini öncekiyle karşılaştır. "pages build and deployment" iş akışının süresine bak.
