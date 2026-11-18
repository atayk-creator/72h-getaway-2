# IT devir notu (19 Kasım 2026)

Yeni IT sohbeti bu dosyayla başlar. Eski IT sohbeti çok uzadığı için kapatıldı (kullanım kotası tasarrufu).
Depo herkese açık: bu dosyaya şifre, anahtar, kişisel bilgi yazılmaz.

## Önce oku
- `yonetim/it-oncelik-sirasi.md` (onaylı iş sırası ve İT durum notu)
- `yonetim/is-emri-yeni-sehirler-ve-noel.md` (altındaki İT teslim notu 1)
- `yonetim/is-emri-site-tasarimi.md` (Faz A ve B teslim notları; Faz C = Planım)

## Çalışma kuralları
- Her işten önce `git pull --rebase`; başka sohbetler de aynı depoya yazıyor. Üretilen dosyalarda çakışma olursa `node scripts/sehir-sayfalari.mjs` ile yeniden üret.
- Şifre, token, API anahtarı asla girilmez/yazılmaz; Secrets'ı Atay girer.
- Görünen metinde "ucuz" yok, "uygun" var. Noel ve deplasman sayfalarında yapay zekâ görseli ve kulüp logosu yok.
- Robot bütçesini aşacak iş (yeni şehir, toplu yenileme) önce Atay'a sorulur. Aylık sınır `data/hotels.json > ayarlar.aylik_butce_usd` = 100 $ (16 Kas kararı). Dönem her ayın 28'i–27'si.
- Canlı siteyi kontrol: WebFetch ile 72hgetaway.com (konteynerden curl engelli).

## Bu hafta yapılanlar (16–19 Kas)
- Ana sayfa: büyük biniş kartı 6 şehirlik kaydırmalı şerit (5 sn'de bir kayar, dokununca durur), altında sonraki 6 şehir ızgarası.
- Londra, Milano, Barselona, Münih sayfaları "fiyat yakında" kipinde yayında (`hotels.json` içinde `erken_sayfa: true`, `baslangic: 2026-11-28`). Barselona ve Münih'in kapak fotoğrafı yok; indirmek için Atay'ın onayı bekleniyor.
- Strazburg Noel pazarı: 27 Kasım – 24 Aralık (resmî site), düzeltildi.
- Kur günde 1 kez 09:53; uçak fiyatları en yakın 4 hafta sonu için Salı + Cumartesi.
- Robot sınırı 75 $ → 100 $.
- 19 Kas 01:40: toplu yenileme başlatıldı (otel + uçak, 13 hafta sonu). Sonucu kontrol edilecek: "Otel fiyatları yenilendi (toplu)" ve "Uçak fiyatları yenilendi (toplu)" commit'leri, `yonetim/apify-rapor.md`.

## Açık işler (sırayla)
1. Toplu yenilemenin sonucunu Atay'a TL olarak bildir (tahmin 11–14 $; 13 Kas dolar ≈ 50,4 TL).
2. Noel sayfasına Köln, Prag, Zagreb, Berlin (22 Kas); sonra Viyana, Budapeşte, Tallinn, Kopenhag, Dublin, Riga (29 Kas). Robotsuz; tarihler resmî kaynaktan.
3. 28 Kas robot ayarı: 4 yeni şehir açılacak. Daha önce eklenen 8 şehir (Bern, Oslo, Reykjavik, Kişinev, Podgorica, Üsküp, Tiran, Priştine) için Atay'ın kararı bekleniyor (öneri: beklet).
4. Tasarruf önerileri Atay'ın onayında: toplu yenileme yapmamak; restoranları 3 ayda bir; uzak hafta sonu otel ölçümünü seyreltmek.
5. Faz C · Planım (Aralık ilk hafta): kaydet düğmesi + `/planim/` pasaport damgaları (tasarım: Q çizimi, https://claude.ai/artifact/McsNnCq1vLVTjEB9uKqjbx).
6. Apple Developer: Atay'dan hangi hesabın kayıtlı olduğu bekleniyor.
7. Aralık: kişisel PDF, Budapeşte gezi listesi, Paris ve Noel gezi fiyatları.

## Zamanlanmış görevler
- Haftalık gider raporu: Pazartesi 10:43, Sonnet; panel "72h Yönetici Ekranı" (https://claude.ai/artifact/RRiNxHeiXQMDBsjqLqsB18) Giderler sekmesini günceller.
