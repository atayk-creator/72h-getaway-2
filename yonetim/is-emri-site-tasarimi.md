# İŞ EMRİ · IT · Sitenin yeni tasarımı (ana sayfa, şehirler, şehir sayfası, Planım)
Veren: Yönetim kurulu · Atay'ın kararı (15 Kas 2026 17:08): "A1 ana sayfa olsun, devamına kurul karar versin."
Öncelik: YÜKSEK · Faz A 18 Kas · Faz B 21 Kas · Faz C 25 Kas
Teslim notlarını bu dosyanın altına yaz (yonetim/ klasöründe).

## Tasarım kaynağı
Claude Design tuvali: "72h Getaway — Ana Sayfa Seçenekleri" (Atay paylaşacak). Bu iş için kullanılacak çizimler:
- A1 · Biniş kartı · Ana sayfa  → ANA SAYFA (Atay seçti)
- Ş3 · Şehirler · Konulara göre raflar + Ş1 · Şehirler · Biniş kartı listesi → ŞEHİRLER SAYFASI (kurul kararı)
- A2 · Biniş kartı · Şehir (Paris) + F · Fiyat takvimi → ŞEHİR SAYFASININ ÜST KISMI (kurul kararı)
- Q · Pasaport damgaları → PLANIM (kurul kararı)
Diğer çizimler (B–S) kullanılmayacak; fikir olarak dursun.
Görsel dil: tasarım sistemi "72h Getaway" (lacivert #0F2A43, turuncu #F4A62A yalnız zemin, krem #FBF6EC; Archivo / Figtree / IBM Plex Mono; biniş kartı: turuncu koçan + kesik çizgi + krem gövde).

## Ortak (bütün sayfalar)
- Telefon önce: 390 px'te tek kolon, yatay kaydırma yok, dokunma hedefi ≥ 44 px, safe-area boşlukları.
- ALT SEKME ÇUBUĞU (sabit): Keşfet (/) · Şehirler (/sehirler/) · Deplasman (/deplasman/) · Planım (/planim/). Aktif sekmede turuncu çizgi. Şehir ve maç sayfasında alt çubuk yerine mevcut "toplam + Arkadaşına gönder + PDF" çubuğu kalır.
- Üst bant lacivert: logo (72h|getaway biniş kartı logosu) + sağda küçük mono etiket.
- Fontlar sitede barındırılsın (Google'a istek yok), sw.js önbelleğine eklensin.
- "ucuz" kelimesi arayüzde YOK. Robotun etiketi `ucuz` → "Uygun hafta", `normal` → "Normal fiyat", `pahali` → "Normalden +%{fark}". Emoji yok.
- Fiyat = 2 kişi toplam, altında kişi başı. Vitrin rakamı "uçak + otel" diye etiketlensin (yemek dahil değil).
- Mevcut adresler değişmez (/sehir/<şehir>/, /deplasman/<maç>/, /noel/<şehir>/). sitemap.xml güncellenir.
- Lighthouse mobil performans ≥ 85, erişilebilirlik ≥ 95.

## FAZ A · 18 Kas · Ana sayfa (A1) + Şehirler
### Ana sayfa (/)
1. Lacivert bant: "İSTANBUL ÇIKIŞLI" · başlık "Bu hafta sonu nereye?" · hafta sonu çipleri (vitrin.json'daki ilk 4 hafta sonu; "Bu hafta / 1 hafta sonra / 2 hafta / 3 hafta"). Seçili çip turuncu.
2. EN UYGUN biniş kartı: seçili hafta sonunun en düşük toplamlı şehri. Üstte şehir fotoğrafı (img/sehir/<şehir>-1-640.jpg), altında mono satır "IST → {IATA} · 2 KİŞİ · 2 GECE", şehir adı, "{ülke} · uçak + otel", büyük toplam. Karta dokununca şehir sayfası o hafta sonuyla açılır (&h=).
3. "Bu hafta sonu" rafı: sonraki 6–10 şehir, yana kaydırmalı fotoğraf kartları (ad + toplam). Sağda "28 şehir" → /sehirler/.
4. İki kutu: "ARALIK · Noel pazarları" (lacivert) → /sehir/noel/ · "MAÇ + 72 SAAT · Deplasman" (turuncu) → /deplasman/.
5. Altta (kaydırınca) mevcut "Nasıl çalışır" ve alt bilgi kısaltılarak kalabilir.
Hafta sonu çipi değişince 2 ve 3 anında yenilenir (sayfa yenilenmeden).

### Şehirler (/sehirler/)
- Üst: başlık "Şehirler" + hafta sonu düğmesi + arama kutusu ("28 şehir içinde ara", yazdıkça süzer).
- RAFLAR (Ş3), sırayla, her biri yana kaydırmalı:
  a) "40 bin altı" (toplam < 40.000 TL)
  b) "Bu hafta sonu normal fiyatında" (fark ≤ %10)
  c) "Vizesiz" (data'da vize alanı; Belgrad, Saraybosna vb.)
  d) "Biraz uzak, değer" (uçuş > 3 saat)
  Her rafta "Tümü" → aynı sayfada liste görünümü, o filtre seçili.
- LİSTE (Ş1): "28 şehrin hepsi, fiyata göre" düğmesiyle ya da arama/filtreyle açılır. Her satır küçük biniş kartı: sıra no'lu koçan (1. turuncu), fotoğraf, ad, ülke · uçak + otel, toplam, durum çipi. Filtre çipleri: En uygun / Vizesiz / 40 bin altı. Fiyatı olmayanlar en altta tek satır: "{şehirler}: robot bu hafta sonunu kontrol ediyor".

## FAZ B · 21 Kas · Şehir sayfası üst kısmı (A2 + F)
Mevcut kalıp (css/plan.css, js/plan.js) KALIR; sadece üst kısım ve hafta sonu seçimi yenilenir:
1. Üstte tam genişlik şehir fotoğrafı (210 px), sol üstte geri düğmesi.
2. Fotoğrafın üstüne binen biniş kartı: "IST → {IATA} · {tarih} · 2 KİŞİ", şehir adı, seçili paketin toplamı, "{paket} paket · kişi başı …".
3. Paket sekmeleri tek kutuda yan yana (Uygun · Konforlu · Lüks), seçili lacivert.
4. FİYAT TAKVİMİ (F): hafta sonu seçicinin yerine ay ay kutular (4 sütun). Kutu rengi: Uygun hafta yeşil (#2E7D5B, beyaz yazı), normal beyaz, pahalı turuncu; fiyatı olmayan kesik çizgili "kontrol". Seçili kutu kalın lacivert çerçeve. Altında seçili hafta sonu kartı: tarih, toplam, "{şehir}'in olağan fiyatından %X uygun/pahalı".
5. Kalem satırları tek satır (ad + kısa açıklama + fiyat + düğme). Uzun açıklama dokununca açılır.
6. "Kendin oluştur" grupları açılır-kapanır; kapalıyken yalnız seçili satır görünür ("Otel: Strand Palace ▾").
Maç ve Noel sayfaları aynı üst kısmı kullanır (maçta takvim yok; maç bilgisi kutuları kalır).

## FAZ C · 25 Kas · Planım (/planim/, Q)
- Şehir/maç sayfasına "Kaydet" (yer imi simgesi). Kayıtlar yalnız tarayıcıda (localStorage, try/catch); hesap yok, kişisel veri yok.
- Planım: üstte "SIRADAKİ" kartı (en yakın tarihli kayıtlı plan, kalan gün, kontrol listesi ilerlemesi), altında damgalar: kayıtlı = kesik çizgili damga + güncel toplam; "Gittim" işaretlenen = renkli damga + ay/yıl.
- Kayıtlı planın fiyatı düşerse sayfada "Fiyat düştü: −X TL" etiketi (bildirim sonraki iş).

## Kabul
Telefonda: ana sayfada hafta sonu değiştir → en uygun kart ve raf değişiyor → karta bas → şehir sayfası doğru hafta sonuyla, takvimde seçili açılıyor → paket seç → kalem linkleri tarihli açılıyor → kaydet → Planım'da damga görünüyor. Alt sekme çubuğu her sayfada çalışıyor. "ucuz" kelimesi kaynakta arayüz metni olarak geçmiyor (denetci.yml'e kontrol ekle).

## Teslim
Her faz bitince bu dosyanın altına: yapılanlar, canlı linkler, açık kalanlar, ekran görüntüsü yolu.
