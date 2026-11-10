# Mağaza kurulumu: Atay için adım adım

Bu rehber bireysel Apple ve Google geliştirici hesapları açıldıktan sonra yapılacakları anlatır.
Derleme ve yükleme işini GitHub'daki **"Mağaza sürümü"** iş akışı yapar (`.github/workflows/magaza.yml`).

**Altın kural:** İmza anahtarları, şifreler ve `.p8` dosyası **yalnızca** iki yerde durur:
1. GitHub Secrets
2. Senin şifre yöneticin ve yedeklerin

Bunlar depoya, e-postaya, WhatsApp'a ya da bir yapay zekâ sohbetine (Claude dahil) asla yapıştırılmaz.

---

## A. Android: yükleme anahtarı (upload key)

Google Play App Signing kullanıyoruz:
- Uygulamayı kullanıcılara asıl imzalayan anahtarı Google oluşturur ve saklar.
- Bizim anahtarımız yalnızca Google'a yükleme yapmak içindir.

Bu anahtar kaybolursa Play Console'dan "yükleme anahtarını sıfırlama" istenebilir. Ama bu birkaç gün sürer ve o sürede güncelleme yapılamaz. Bu yüzden yedek şart.

### A1. Anahtarı oluştur (kendi bilgisayarında, bir kez)

Java gerekir. Android Studio kuruluysa içinde vardır. Yoksa https://adoptium.net adresinden "Temurin 21" kurulur.

Mac'te Terminal'i aç ve şu komutu çalıştır:

```bash
cd ~/Desktop
keytool -genkeypair -v -keystore 72h-upload.jks -storetype PKCS12 \
  -alias 72h-upload -keyalg RSA -keysize 2048 -validity 10000 \
  -dname "CN=72h Getaway, O=72h Getaway, C=TR"
```

- Şifreyi soracak. En az 20 karakterlik bir şifre seç ve hemen şifre yöneticine kaydet.
- PKCS12'de anahtar şifresi ile dosya şifresi aynıdır.
- Windows'ta aynı komut PowerShell'de tek satır olarak çalışır (`\` olmadan).

### A2. Parmak izini not et

```bash
keytool -list -v -keystore 72h-upload.jks -alias 72h-upload | grep SHA256
```

Çıkan SHA-256 satırını şifre yöneticisindeki kayda ekle. İleride Google'ın gördüğü anahtarla aynı olduğunu bununla doğrularsın.

### A3. Yedek (kaybolursa uygulama güncellenemez)

1. **Şifre yöneticisi** (1Password, Bitwarden ya da iCloud Anahtar Zinciri güvenli notu). Kayda şunları koy:
   - `72h-upload.jks` dosyasını ek olarak
   - Şifre
   - Takma ad: `72h-upload`
   - SHA-256 parmak izi
2. **Şifreli USB bellek ya da harici disk.** Mac'te Disk İzlencesi'nde şifreli bir disk görüntüsü (.dmg, AES-256) oluştur, dosyayı içine koy. Evde ayrı bir yerde sakla.
3. Masaüstündeki kopyayı yedekler doğrulandıktan sonra sil.

E-postayla gönderme, Google Drive ya da iCloud Drive'a şifresiz koyma, depoya ekleme.

### A4. GitHub Secrets'a koy

1. Dosyayı metne çevir ve panoya kopyala.
   - Mac:
     ```bash
     base64 -i 72h-upload.jks | pbcopy
     ```
   - Windows (PowerShell):
     ```powershell
     [Convert]::ToBase64String([IO.File]::ReadAllBytes("72h-upload.jks")) | Set-Clipboard
     ```
2. GitHub'da depoya git: **Settings > Secrets and variables > Actions > New repository secret**. Dört sır ekle:

| Ad | Değer |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | Panodaki uzun metin |
| `ANDROID_KEYSTORE_PASSWORD` | Şifre |
| `ANDROID_KEY_ALIAS` | `72h-upload` |
| `ANDROID_KEY_PASSWORD` | Aynı şifre |

### A5. İmzalı AAB'yi üret

1. **Actions > "Mağaza sürümü" > Run workflow** yolunu izle.
2. Platform olarak `android` seç ve **Run** de.
3. Bitince çalıştırmanın sayfasının en altındaki **Artifacts** bölümünden `android-magaza` dosyasını indir. Bu bir zip, içinde `72h-getaway-1.0.0-1xx.aab` var.

Dosya adı `DENEME-YUKLEMEYIN-...` ile başlıyorsa sırlar okunamamış demektir. O dosyayı yükleme.

---

## B. Google Play: kapalı test (14 gün sayacı)

Bireysel hesaplarda Google, üretime çıkmadan önce şunu ister: **en az 12 test kullanıcısı, kesintisiz 14 gün kapalı testte**.

Sayaç ancak kapalı test sürümü yayına girince başlar. Bu yüzden hesap açılır açılmaz bu bölüm yapılmalı.

### B1. Şimdiden hazırlanacaklar

**15–20 test kullanıcısı.** 12 kişi yetiyor ama yedek olsun.
- Her biri bir Gmail ya da Google hesabı ve Android telefon kullanan biri olmalı.
- 14 gün boyunca uygulamayı silmemeleri gerektiğini önceden söyle.
- Adreslerin listesi yönetim kurulunda toplanacak.
- Pratik yol: bir Google Grubu açmak (örneğin `72h-test@googlegroups.com`) ve herkesi oraya eklemek.

### B2. Hesap açılınca sırayla

1. **Kimlik ve cihaz doğrulama:** Play Console'un istediği kimlik doğrulamasını ve Play Console mobil uygulamasıyla cihaz doğrulamasını bitir.
2. **Uygulama oluştur:**
   - Ad: `72h Getaway: Hafta Sonu Bütçe`
   - Varsayılan dil: Türkçe
   - Tür: Uygulama
   - Ücret: Ücretsiz
   - Beyan kutularını işaretle.
3. **Uygulama içeriği** (Policy > App content). Değerler `MAGAZA.md` dosyasında:
   - Gizlilik politikası: `https://72hgetaway.com/hakkinda.html#gizlilik`
   - Reklam: Hayır
   - Uygulamaya erişim: Tüm işlevler giriş gerektirmez
   - İçerik derecelendirmesi anketi: Kategori "Diğer tüm uygulama türleri", şiddet, kumar vb. hepsi Hayır
   - Hedef kitle: **18 ve üzeri** öneriyorum. 13 yaş altı seçilirse Google'ın sıkı "Aileler" kuralları devreye girer.
   - Veri güvenliği: "Veri toplanmıyor / paylaşılmıyor"
   - Haber uygulaması: Hayır
   - Devlet, finans ve sağlık özellikleri: Yok
4. **Mağaza girişi:**
   - Kısa ve uzun açıklama `MAGAZA.md` dosyasında.
   - Ekran görüntüleri `magaza/ekran/android/` klasöründe.
   - Simge ve öne çıkan görsel (1024×500) gerekiyor.
5. **Kapalı test kanalı:**
   1. Test ve yayınla > Test > **Kapalı test** > "Closed testing - Alpha" > **Test kullanıcıları**: e-posta listesini ya da Google Grubu'nu ekle.
   2. Aynı kanalda **Yeni sürüm oluştur** de. Play App Signing için "Google tarafından oluşturulan anahtarı kullan" seçeneğini kabul et.
   3. `android-magaza` içindeki `.aab` dosyasını yükle. **İlk AAB elle yüklenir;** Google, ilk sürümün API'yle yüklenmesine izin vermez.
   4. Sürüm notu yaz, ülke olarak **Türkiye** seç ve incelemeye gönder.
6. **Davet:** Sürüm onaylanınca "Test kullanıcılarına katılma bağlantısı"nı kopyala ve test kullanıcılarına gönder.
   - Her biri bağlantıyı açıp "Test kullanıcısı ol" demeli, sonra Play Store'dan kurmalı.
   - **14 gün buradan sayılır.**
7. **14 gün sonra:** Kontrol paneli > **Üretime erişim için başvur**. Testle ilgili kısa soruları yanıtla.

### B3. Sonraki sürümler (isteğe bağlı otomatik yükleme)

Play Console > Kurulum > API erişimi yolunu izle:
1. Bir Google Cloud hizmet hesabı oluştur.
2. Hesaba "Sürümleri yayınla" yetkisi ver.
3. JSON anahtarını `PLAY_SERVICE_ACCOUNT_JSON` adıyla GitHub Secrets'a koy.

Bundan sonra iş akışında **"AAB'yi Google Play'e otomatik yükle"** kutusu işaretlenince sürüm seçilen kanala taslak olarak yüklenir.

---

## C. iOS: App Store Connect API anahtarı ve TestFlight

### C1. Apple hesabı onaylanınca: kimlikler

1. **Takım kimliği (Team ID):** https://developer.apple.com/account > **Membership details** sayfasında 10 karakterlik "Team ID" yazar.
2. **Bundle ID'yi kaydet:** Certificates, IDs & Profiles > **Identifiers** > **+** > App IDs > App.
   - Description: `72h Getaway`
   - Bundle ID: **Explicit** `com.getaway72h.app`
   - Ek özellik (capability) seçme ve **Register** de.
3. **Uygulama kaydı:** https://appstoreconnect.apple.com > Uygulamalar > **+** > Yeni Uygulama.
   - Platform: iOS
   - Ad: `72h Getaway`
   - Birincil dil: Türkçe
   - Bundle ID: `com.getaway72h.app`
   - SKU: `72hgetaway`
   - Kullanıcı erişimi: Tam erişim

### C2. API anahtarını oluştur

1. App Store Connect > **Kullanıcılar ve Erişim > Entegrasyonlar > App Store Connect API > Takım Anahtarları** yolunu izle. İlk seferde "Erişim iste" çıkabilir; hesap sahibi olarak onayla.
2. **+** ile yeni anahtar oluştur:
   - Ad: `GitHub Actions`
   - Erişim: **Admin**. Robotun dağıtım sertifikasını Apple'ın bulutunda kendisinin oluşturabilmesi için gerekli.
3. **"API Anahtarını İndir"** de. `AuthKey_XXXXXXXXXX.p8` dosyası **yalnızca bir kez** indirilebilir.
4. Sayfadaki iki değeri not et:
   - **Key ID**: 10 karakter
   - **Issuer ID**: tirelerle ayrılmış uzun kimlik
5. `.p8` dosyasını şifre yöneticisine ek olarak kaydet. Kaybolursa yenisini oluşturup eskisini iptal etmek yeterli; Android anahtarı kadar kritik değil.

### C3. GitHub Secrets'a koy

| Ad | Değer |
|---|---|
| `APPSTORE_API_KEY_ID` | Key ID |
| `APPSTORE_API_ISSUER_ID` | Issuer ID |
| `APPSTORE_API_PRIVATE_KEY` | `.p8` dosyasını Metin Düzenleyici'de aç ve **tamamını** kopyala, `-----BEGIN PRIVATE KEY-----` ve `-----END PRIVATE KEY-----` satırları dahil |
| `APPLE_TEAM_ID` | Team ID |

### C4. TestFlight'a yükle

1. **Actions > "Mağaza sürümü" > Run workflow** yolunu izle, platform olarak `ios` seç.
2. Yaklaşık 15–25 dakikada derlenip App Store Connect'e yüklenir. İşlendikten 10–30 dakika sonra **TestFlight** sekmesinde görünür.
   - Şifreleme sorusu sorulmaz, uygulamada yanıtı hazır.
3. TestFlight > **Dahili Test** > bir grup oluştur ve kendini ekle. iPhone'a **TestFlight** uygulamasını kur ve davetten yükle.
4. `MAGAZA.md` dosyasındaki "Göndermeden önce kontrol listesi"ni gerçek iPhone'da yap. Sonra App Store sürüm sayfasında metinleri, ekran görüntülerini (`magaza/ekran/ios/`) ve "App Privacy: Data Not Collected" seçimini doldurup incelemeye gönder.

---

## D. Sürüm numaraları

- **Sürüm adı** `app/package.json` dosyasındaki `version` alanıdır (şu an 1.0.0). Yeni mağaza sürümünde bunu artır, örneğin 1.0.1.
- **Sürüm kodu ve derleme numarası** her çalıştırmada otomatik olarak `100 + çalıştırma sayısı` olur. Her yükleme öncekinden büyük olmalı.
  - Mağaza "bu numara kullanıldı" derse iş akışını "Sürüm kodu" kutusuna daha büyük bir sayı yazarak çalıştır.
- İş akışı dosyası değiştiğinde otomatik bir **deneme derlemesi** yapılır.
  - Bu denemelerde gerçek anahtarlar hiç kullanılmaz ve hiçbir şey yüklenmez.
  - Gerçek imza yalnızca **Run workflow** ile elle başlatılınca kullanılır.
