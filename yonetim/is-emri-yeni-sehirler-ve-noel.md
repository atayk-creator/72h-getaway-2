# İT BRİFİ · Yeni şehir sayfaları (sosyal medya ofisi, 16 Kas 2026)

> Atay onayıyla (16 Kas 00:37) sosyal medya ofisi tarafından yazıldı. Sıra: önce bu işten önceki işinizi bitirin, sonra bu. Sorular ve teslim: SOSYAL_MEDYA_TESLIM.md (Mac, 72h_stok/yayina_hazir) ya da durum notu.

**Karar (Atay, 16 Kas 00:16):** 4 popüler şehir siteye ekleniyor: **Barselona, Londra, Milano, Münih**.

**Neden:** Sosyal medyada şehirleri popülerliğe göre üç gruba ayırdık. A grubu herkesin bildiği şehirler, B grubu ikinci tercihler, C grubu keşif şehirleri. Her hafta 8 şehir videosunun 4'ü A grubundan olacak. Bu 4 şehir A grubunda, ama sitede sayfaları yok. Videonun açıklamasında ve ilk yorumda siteye link veriyoruz, sayfa yoksa video da yapamıyoruz.

## İstenen
Mevcut şehirlerle aynı yapıda tam şehir sayfası: `/sehir/<slug>/`, uçuş (IST ve SAW), 4 otel kategorisi (uygun, konforlu, lüks, ikonik), gezi, restoran, 2 kişilik toplam fiyat, plan PDF'i, sitemap.

| Sıra | Şehir | Slug | Havalimanı | Vize notu | İstenen tarih |
|---|---|---|---|---|---|
| 1 | Barselona | barselona | BCN | Schengen | Cmt 21 Kas |
| 2 | Londra | londra | LHR, LGW, STN, LTN | **Schengen değil, Birleşik Krallık vizesi gerekir** | Cmt 21 Kas |
| 3 | Milano | milano | MXP, BGY, LIN | Schengen | Çar 25 Kas |
| 4 | Münih | munih | MUC | Schengen | Çar 25 Kas |

- Londra'nın vize alanında "Schengen vizesi gerekir" yazmasın. Doğru bilgi: Birleşik Krallık ayrı vize istiyor, Schengen vizesi geçmiyor.
- Milano'da Bergamo (BGY) uygun fiyatlı uçuşlar için önemli. Bergamo'dan şehre ulaşımı da plana ekleyin: otobüs, yaklaşık 1 saat.
- Münih'in Noel pazarı zaten Noel sayfasında var (noel-munih). Şehir sayfası ondan ayrı olacak; isterseniz birbirine bağlayın.
- Sayfa hazır olunca teslim dosyasına (SOSYAL_MEDYA_TESLIM.md) şu satırı yazın: "İT · <şehir> sayfası yayında · 2 kişi toplam … TL · fiyat tarihi …". Ofis o satırı görünce Ecem'e ve Alper'e video iş emri açacak.

## Dikkat: robot bütçesi
`data/ucuslar.json` dosyasına göre Apify kullanımı 70,33 $. Dönem sınırı 75 $, dönem 27 Kasım'da bitiyor. 4 yeni şehir uçuş ve otel sorgularını artıracak. Sınırı aşacaksa önce Atay'a haber verin. Gerekirse ilk fiyat çekimini 28 Kasım'a bırakın ve sayfayı fiyatsız ("fiyat yakında") yayınlayın; sırayı bozmayın.

## Bu fırsatla bir düzeltme: Strazburg Noel tarihi
`data/noel.json` dosyasında Strazburg için `pazar_bit: 2026-12-27` ve "27 Kasım – 27 Aralık" yazıyor. Ofisin elindeki bilgiye göre pazar 24 Aralık'ta kapanıyor. Resmî kaynaktan (strasbourg.eu / noel.strasbourg.eu) kontrol edip düzeltin; videoda kullandığımız tarih buna bağlı.

## Bilgi (yapılacak iş yok): sosyal medyanın şehir kategorileri
- **A · Herkesin bildiği:** Paris, Roma, Amsterdam, Prag, Viyana, Budapeşte, Berlin, Atina, Barselona, Londra, Milano
- **B · İkinci tercih:** Madrid, Lizbon, Kopenhag, Brüksel, Dublin, Varşova, Krakov, Stokholm, Münih
- **C · Keşif:** Ljubljana, Zagreb, Bratislava, Riga, Tallinn, Vilnius, Valletta, Lüksemburg, Helsinki, Sofya, Bükreş
- **Vizesiz:** Belgrad, Saraybosna. İleride Tiflis, Üsküp ve Podgorica eklenebilir; bunun için şimdilik bir şey yapmayın, Atay karar verecek.

## 5 · EK (16 Kas 00:45): Noel sayfasına eklenecek şehirler
Aylık planda bu şehirlere Noel videosu var ama `data/noel.json` dosyasında yoklar: **Köln, Prag, Zagreb, Berlin** (videolar 24–28 Kas), **Viyana, Budapeşte, Tallinn, Kopenhag** (videolar 30 Kas–3 Ara), **Dublin, Riga** (4 ve 10 Ara). Diğer Noel şehirleriyle aynı yapıda eklenebilirse (pazar tarihleri resmî kaynaktan, uçuş, otel, 2 kişi toplam) Noel videosu doğrudan Noel sayfasına link verir. Önce ilk dört şehir: Cmt 22 Kas 18:00. Eklenemezse video şehir sayfasına link verir; olmayan bilgiyi uydurmayın. Robot bütçesi notu burada da geçerli.
