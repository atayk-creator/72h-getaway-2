# Yönetim kurulundan devir notu (7 Kasım 2026)

Robot ve uygulama sohbeti için. Görev dağılımı: **yönetim kurulu** karar ve brif, **robot sohbeti** robotlar + site + uygulama (tüm kod), **Alper** videolar.

Bugün yönetim kurulu sohbetinden depoya giren değişiklikler; bundan sonra bunlar senin sorumluluğunda:

1. **Takvim etiketleri:** `scripts/sehir-sayfalari.mjs` → `saatUygun()`. Kalkış saati `saatAraligi.gidis` (05–12) dışındaki uçuşlar etikete girmiyor, "Fiyat doğrulanıyor" yazıyor (o gün 113 hafta sonu). 10 Kasım uçak taramasından sonra sayının düştüğünü kontrol et.
2. **Marka uyumu (index.html):** büyük rakam her yerde 2 kişi toplam; biniş kartı ve hikâye görselinde Canlı/Tahmini/Resmî etiketleri, "FİYAT [tarih] · [kaynak]" satırı ve "72 SAAT. GERÇEK FİYAT." sloganı; düğmelerde emoji yok (uygulama kabuğu dahil).
3. **Fontlar:** `fonts/` + `fonts/fonts.css` (Archivo, Figtree, IBM Plex Mono), indirme `.github/workflows/fontlar.yml`; `build-app.mjs` `fonts` klasörünü kopyalıyor.
4. **Belgrad ve Saraybosna (28 şehir):** `hotels.json` 8'er otel; `ucus-ayarlari.json` BEG, SJJ; `restoran-ayarlari.json` merkez + RSD/BAM; `gezi.json` 10'ar yer (konum yok, **gezi-konum çalıştırılmalı**; 6 yerin fiyatı null); `fotolar.json` + fotoğraflar; `update-rates.mjs` BAM sabit 1,95583, RSD yedek 117,2; testler 28'e göre.
5. **"Otel dolu"** yalnızca robot o hafta sonuna gerçekten baktıysa yazılıyor.
6. **Service worker** cache `72h-v12`.
7. **HTTPS:** 31 Ekim alan adı kontrolünde 72hgetaway.com HTTPS yanıt vermiyordu (`data/alan-adi-durum.txt`). Apple gizlilik sayfasını HTTPS istiyor; GitHub Pages'te "Enforce HTTPS" ve sertifikayı kontrol et.

**Bütçe uyarısı:** İki şehir Apify maliyetini yaklaşık %8 artırıyor; bu ay bütçe sınırda. Gerekirse Belgrad ve Saraybosna'nın uzak hafta sonlarını 28 Kasım dönem yenilenmesine kadar ertele.

**Bundan sonra:** Yönetim kurulu bu depoya kod göndermeyecek; teknik istekler bu klasöre not olarak gelecek.
