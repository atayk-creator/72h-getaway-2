# 72h Getaway telefon uygulaması

Sitenin hesaplayıcısı + uygulamaya özgü kabuk (`shell/`): alt menü, Turlarım (kayıtlı turlar), çevrimdışı çalışma,
telefonun paylaşma menüsü, PDF'i kaydet/paylaş, uygulama içi tarayıcı, ilk açılış tanıtımı. Capacitor 8 ile Android ve iOS.

- Uygulama kimliği: `com.getaway72h.app` (mağazalarda değiştirilemez)
- Web içeriği: `node scripts/build-app.mjs` siteyi `app/www`'ye kopyalar ve kabuğu ekler. Fiyatlar uygulamada önce
  canlı (72hgetaway.com, yedek GitHub) okunur; internet yoksa uygulamayla gelen son veri gösterilir.
- Simge ve açılış ekranı: `assets/` (Capacitor Assets bunlardan tüm boyutları üretir).
- Derleme: GitHub Actions > "Telefon uygulaması". Android test dosyası (APK) "Sürümler" sayfasına konur;
  iOS simülatörde derlenip çalıştırılır, ekran görüntüleri `uygulama-ekran` dalına yazılır.
- `android/` ve `ios/` klasörleri derlemede üretilir; mağaza imzalama ayarları eklenince depoya alınacak.
