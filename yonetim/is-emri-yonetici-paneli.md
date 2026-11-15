# İŞ EMRİ · IT · Şifreli yönetici paneli (72hgetaway.com/panel/)
Veren: Yönetim kurulu · Atay'ın onayı: 15 Kas 2026 18:08 ("Hazırla")
Öncelik: ORTA (site tasarımı Faz A'dan sonra) · Teslim: 22 Kas
Teslim notlarını bu dosyanın altına yaz.

## Amaç
Atay'ın telefonunda ayrı bir uygulama gibi açılan, yalnız onun görebildiği yönetici paneli.
Bugün panel Claude'da duruyor ("72h Yönetici Ekranı"); aynı içerik sitenin arkasına, şifreli olarak taşınacak.

## Neden şifreli
GitHub Pages'te "gizli sayfa" yoktur: adresi bilen açar, depo herkese açıksa dosyalar da okunur.
Panelde kararlar, ekip işleri ve hesap rakamları var. Bu yüzden:
- Yayınlanan sayfanın İÇERİĞİ şifrelenir (StatiCrypt benzeri: AES-256, şifreden türetilmiş anahtar, tarayıcıda çözülür).
- Depoda panelin düz (şifresiz) çıktısı, kurul notları ve Metricool yanıtları ASLA durmaz.
- İLK İŞ: deponun herkese açık mı özel mi olduğunu kontrol et ve teslim notuna yaz. Aşağıdaki tasarım herkese açık depo varsayar.

## Mimari
1. `.github/workflows/panel.yml` — saatte bir (ve elle tetiklenebilir):
   a. Metricool'dan veriyi çeker (aşağıda "Veri").
   b. Kurul notlarını ve yayın programını okur (aşağıda "Kurul notları").
   c. `scripts/panel.mjs` ile tek dosyalık panel HTML'ini üretir (veri HTML'in içine gömülü; sayfa dışarıya istek atmaz).
   d. HTML'i PANEL_SIFRE ile şifreler → `panel/index.html` (yalnız şifre kutusu + şifreli blok + çözücü betik).
   e. Yalnız şifreli dosyayı commit eder. Ara dosyalar runner'da kalır, artifact olarak YÜKLENMEZ, loglara yazılmaz.
2. `panel/index.html`: `<meta name="robots" content="noindex,nofollow">`; sitemap.xml'e EKLENMEZ; robots.txt'ye `Disallow: /panel/`; hiçbir sayfadan link verilmez; sw.js önbelleğine ALINMAZ.
3. Ana ekrana eklenebilir: `panel/manifest.webmanifest` (name "72h Panel", display standalone, start_url /panel/, lacivert tema, mevcut uygulama ikonu) + apple-touch-icon + `apple-mobile-web-app-capable`.
4. Şifre: doğru girilince çözülmüş anahtar telefonda hatırlanır ("Bu cihazda hatırla" kutusu, varsayılan açık; localStorage, try/catch). "Çıkış" düğmesi anahtarı siler.
5. Yanlış şifre: içerik çözülemez, "Şifre yanlış" yazar. Deneme sayısı sınırı gerekmez (çevrimdışı şifreleme); bu yüzden şifre UZUN olmalı (Atay'a not: en az 16 karakter).

## Gizli anahtarlar (GitHub Secrets — Atay kendisi girer, hiçbir sohbete yazılmaz)
- `PANEL_SIFRE` — panelin şifresi.
- `METRICOOL_TOKEN`, `METRICOOL_USER_ID` — Metricool API erişimi (blogId 7239144 koda yazılabilir).
- `PANEL_NOT_ANAHTARI` — kurul notlarını çözen özel anahtar (aşağıya bak). Bunu IT üretir, Atay'a Secrets'a nasıl ekleneceğini söyler ya da iş akışı izinleri yetiyorsa `gh secret set` ile ekler; özel anahtar hiçbir dosyaya, loga, sohbete yazılmaz.
Secrets yoksa iş akışı paneli ÜRETMEZ ve sessizce çıkar (kırmızı hata yok); eksik olanı teslim notuna yaz.

## Veri (Metricool)
Panel bugün şu üç sorguyu kullanıyor (Claude bağlayıcısındaki adlarıyla); REST karşılıklarını Metricool API belgesinden bul:
- Kurulu gönderiler: bugün → +6 gün (getScheduledPosts; brand 7239144, Europe/Istanbul).
- İçerik etkileşimleri: son 14 gün; alanlar ağ, tarih-saat, link, gösterim, etkileşim, biçim (BSPO01, 02, 03, 06, 07, 09).
- Günlük takipçi: son 14 gün; IGEV01 (IG takipçi), IGEV43 (kazanılan), TKEV07 (TikTok takipçi), IGEV05 (IG görüntülenme).
Metricool planı API'ye izin vermiyorsa: DUR, teslim notuna yaz. Yedek yol: kurul her kontrolde veriyi kendi bağlantısıyla çekip şifreli anlık görüntü olarak depoya koyar (aşağıdaki açık anahtarla); o zaman panel saatlik değil, kurul kontrol ettikçe yenilenir.

## Kurul notları ve program (düz metin depoya girmez)
- Açık/özel anahtar çifti üret (age ya da RSA-OAEP + AES; hangisi kolaysa). AÇIK anahtar: `yonetim/panel/acik-anahtar.txt` (depoda durabilir).
- Yönetim kurulu notları bu açık anahtarla şifreleyip `yonetim/panel/notlar.enc` olarak commit eder. Şifreleme komutunu teslim notuna tek satır olarak yaz (kurul onu kullanacak).
- İş akışı `PANEL_NOT_ANAHTARI` ile çözer. Not biçimi: `[{id, tip: karar|uyari|is|it, baslik, detay, kim, son, durum}]`.
- Yayın programı gizli değil: `yonetim/panel-kaynak/yayin_programi.json` (`[{gun, sira 0-4, kod, icerik, kim, planli}]`). Kurul günceller.

## Panelin içeriği ve hesapları
Kaynak: `yonetim/panel-kaynak/panel-claude.html` (Claude panelinin sayfa kodu; `dash.*` ve `d3` oradaki çalışma ortamına ait. Hesapları ve görünümü buradan AYNEN al, veri erişimini gömülü JSON'a çevir; d3 yerine elle SVG ya da sitede barındırılan d3 kullan, CDN yok).
Sekmeler: Özet · Yayın · Sosyal medya · Kararlar · Ekip · Site ve uygulama.
Korunacak hesaplar:
- Slot kuralı: hafta içi 07:45 V, 12:30 P, 18:15 V, 20:00 P, 21:30 V · hafta sonu 10:30 V, 13:30 P, 17:00 V, 19:30 P, 21:30 V. Hikâye = gönderi + 5 dk.
- Slot durumu: Kurulu / Boş / Geçti / Plan yok (programda bilerek boş). Taslaklar (draft:true, "KOPYA") sayılmaz.
- Otomatik kural kontrolü: metinde ya da ilk yorumda emoji · "ucuz" kelimesi · aynı ağa aynı saatte iki gönderi · hikâye eksik.
- "Şimdi sırada ne var?": önce kural sorunları, sonra bugün+yarın boş slotlar, sonra ilk 3 karar.
- Etkileşim: içerikler paylaşıldığı İstanbul gününe ve ağa göre toplanır (Metricool saatleri UTC).
- Takipçi hedefi çubuğu (hedef sayısı tek sabit; Atay yeni hedefi söyleyince güncellenecek).
Panelin üstünde: "Veri: <son yenileme tarihi saati>" ve 3 saatten eskiyse uyarı.
Görsel dil: site ile aynı (lacivert/turuncu/krem, Archivo/Figtree/IBM Plex Mono), telefon önce, alt sekme çubuğu.

## Yapılmayacaklar
- Panelden Metricool'a yazma (gönderi kurma/değiştirme) YOK. Yalnız okuma.
- Kişisel veri, şifre, anahtar hiçbir dosyada, logda, commit mesajında yok.
- Panel adresi hiçbir herkese açık sayfada, videoda, postta geçmez.

## Kabul
1. Atay telefonda /panel/ açar → şifre kutusu → şifreyle panel açılır → ana ekrana ekler → simgeden tam ekran açılır, şifre tekrar sorulmaz.
2. Gizli pencerede adres açılınca yalnız şifre kutusu görünür; sayfa kaynağında ve depoda düz veri yok (teslimde `grep` çıktısıyla göster: bir takipçi sayısı ve bir karar başlığı aranır, bulunmaz).
3. İş akışı saatte bir çalışıyor; "Veri:" saati yenileniyor.
4. Google'da ve sitemap'te /panel/ yok.

---

## Teslim notu · 1 (15 Kas 2026 18:30): depo kontrolü ve şifreleme altyapısı

**İlk iş, depo herkese açık mı: EVET, herkese açık.**
- GitHub API yanıtı (15 Kas 2026): `atayk-creator/72h-getaway-2` → `private: false`, `visibility: public`.
- Sonuç: iş emrindeki tasarım (herkese açık depo varsayımı) aynen geçerli. Depodaki her dosya, `yonetim/` klasörü dahil, adresi bilen herkesçe okunabilir (`yonetim/` yalnızca siteden hariç tutulur, depodan değil).
- **Dikkat (kurulun bilgisine):** bu iş emri dosyası da depoda olduğu için panelin adresi (/panel/) ve mimarisi herkese açık. Güvenlik adresin gizliliğine değil şifrelemeye dayanıyor, yani sorun değil; ama "panel adresi hiçbir herkese açık sayfada geçmez" maddesi depo için sağlanmıyor. İstenirse iş emri depodan çıkarılır (git geçmişinde kalır) ya da depo özel yapılır (GitHub Pages özel depoda ücretli plan ister).
- `yonetim/panel-kaynak/panel-claude.html` incelendi: yalnızca sayfa kodu, içinde veri yok (takipçi hedefi sabiti 1.000 dışında).

**Bu adımda yapılanlar (düz veri, şifre, anahtar içermez)**
- `scripts/panel-sifrele.mjs`: içerik gzip + AES-256-GCM; anahtar şifreden PBKDF2-SHA256, 600.000 tur. Çıktı `panel/index.html` = şifre kutusu + şifreli blok + çözücü (WebCrypto). Şifre yalnızca `PANEL_SIFRE` ortam değişkeninden okunur, hiçbir yere yazdırılmaz.
- `yonetim/panel/tuz.txt`: rastgele tuz (gizli değildir). Sabit tutulur ki telefonda hatırlanan anahtar saatlik yenilemelerde geçerli kalsın. Şifre değişirse eski kayıt kendiliğinden düşer ("Şifre değişmiş; yeniden gir").
- "Bu cihazda hatırla" (varsayılan açık, localStorage, try/catch) ve "Çıkış" (`window.PANEL_CIKIS()`: anahtarı siler, şifre kutusuna döner).
- `panel/manifest.webmanifest` (72h Panel, standalone, start_url /panel/, lacivert), apple-touch-icon ve `apple-mobile-web-app-capable` kabukta.
- `robots.txt`: `Disallow: /panel/`. Kabukta `noindex,nofollow`. sitemap.xml'e eklenmiyor. `sw.js` (v17): /panel/ altındaki hiçbir şey önbelleğe alınmaz.
- Test: `scripts/test-panel-sifrele.mjs` (şifrele-çöz, yanlış şifre, kabukta düz metin yok). Tarayıcıda denendi: yanlış şifre "Şifre yanlış.", doğru şifreyle açılıyor, yeniden açınca şifre sormuyor, Çıkış'tan sonra soruyor.

**Sıradaki (22 Kas'a kadar)**
1. `scripts/panel.mjs`: Claude panelinin hesaplarını ve görünümünü gömülü JSON ile çalışan tek dosyaya çevirmek (d3 yerine elle SVG).
2. `scripts/panel-veri.mjs`: Metricool REST sorguları. Plan API'ye izin vermiyorsa durup buraya yazılacak.
3. Kurul notları için anahtar çifti ve `notlar.enc` çözümü; kurulun kullanacağı tek satırlık şifreleme komutu.
4. `.github/workflows/panel.yml`: saatlik; Secrets eksikse panel üretmeden, hata vermeden çıkar.

**Atay'dan beklenen (GitHub → Settings → Secrets and variables → Actions; hiçbiri sohbete yazılmaz)**
- `PANEL_SIFRE`: en az 16 karakter (çevrimdışı deneme-yanılmaya karşı uzunluk tek savunma).
- `METRICOOL_TOKEN`, `METRICOOL_USER_ID`.
- `PANEL_NOT_ANAHTARI`: özel anahtar. IT sohbeti özel anahtarı göremesin diye Atay kendi Mac'inde üretecek; komut 3. adımda verilecek (özel anahtar yalnızca panoya kopyalanır, dosyaya yazılmaz).

**Bilinen sınır:** panel saatte bir commit edilirse depo geçmişi ayda yaklaşık 10–15 MB büyür (şifreli blok her seferinde tamamen değişir). Gerekirse veri değişmediğinde commit atlanır.
