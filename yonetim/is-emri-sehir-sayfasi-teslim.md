# İş emri: yeni şehir sayfası (IS_EMRI_IT_SEHIR_SAYFASI_YENI) — teslim notları

İş emri dosyası (`72h_stok/yayina_hazir/…`) IT sohbetinin erişebildiği yerde olmadığı için teslim notları burada tutuluyor; dosya gelince altına kopyalanır.

## Teslim 1 — 14 Kasım 2026 (21 Kasım kapsamı, erken)

**Yayında (11 sayfa, hepsi aynı kalıp):**
- `/deplasman/fenerbahce-londra/`, `/deplasman/galatasaray-paris/`
- `/sehir/amsterdam/` (önümüzdeki 4 hafta sonu seçilebilir)
- `/noel/nurnberg/`, `/noel/dresden/`, `/noel/salzburg/`, `/noel/gdansk/`, `/noel/munih/`, `/noel/strazburg/`, `/noel/krakov/`, `/noel/brugge/`
- Deneme klasörü (`deneme/fenerbahce-londra/`) silindi.

**Yapılanlar:**
- Kalıp: `css/plan.css` + `js/plan.js` (deneme sayfasının görünümü). Sayfaları `scripts/plan-sayfalari.mjs` üretir; robotlar fiyat güncelleyince `sehir-sayfalari` iş akışı yeniden üretir.
- 3 hazır paket (Uygun, Konforlu, Lüks). Paketler kuralla seçilir, fiyat değişince kendiliğinden yeniden hesaplanır; Uygun hiçbir zaman Konforlu'dan pahalı otel seçmez.
- Her kalemde tarihli link: Google Flights (tarihli arama), Booking (otel + giriş/çıkış + 2 yetişkin), Google Hotels, OpenTable (2. akşam 19:00, 2 kişi; OpenTable'ın zayıf olduğu şehirlerde harita araması), kulüp sitesi, resmî ulaşım ve müze siteleri.
- "Kendin oluştur": her seçenek tek satır; toplam altta anında değişir.
- "Arkadaşına gönder": plan linke yazılır (`?p=…&u=…&o=…&t=…&y=…&g=…&b=…&s=…`, şehirde `&h=` hafta sonu). Listeden çıkmış bir seçenek varsa sayfa en yakın seçenekle açılır ve bunu yazar.
- "PDF rehber": seçilen planın 4 sayfalık rehberi (kapak + biniş kartı, kalemler ve linkler, 72 saat planı, kontrol listesi). Kişinin kendi planı için "PDF olarak kaydet" (tarayıcının yazdır → PDF'i).
- Günlük PDF robotu: `plan-pdf.yml` her sabah 06:40'ta bütün sayfaların 3 paket PDF'ini üretir, Releases → `rehberler` sürümüne üzerine yazar (depo büyümez). Sayfadaki "Hazır PDF'i indir" bu dosyaya gider.
- Elle girilen bilgiler: `data/plan/<sayfa>.json` (transfer, gezi linkleri, yemek, paket tercihleri). Yeni bir sayfa açmak = bu klasöre bir dosya eklemek.
- Takım sayfaları ve `/deplasman/` kartları yeni sayfalara bağlandı. Duman testi yeni sayfaları da geziyor.

**Açık kalanlar (28 Kasım teslimi):**
- Kalan şehirler ve deplasmanlar (Linz, Madrid, Atina, Köln, Lefkoşa; 27 şehir).
- Pegasus / AJet / THY'nin kendi tarihli linkleri: denenmedi (tarayıcı izni gerekiyor); çalışanlar "Diğer site" olarak eklenecek.
- Kişisel PDF'in tek dokunuşla indirilmesi (şu an yazdır → PDF olarak kaydet).
- Uçuş robotunun şehirler için ilk 5 uçuşu saklaması (şu an şehir sayfasında hafta sonu başına en uygun 1 uçuş var).
- Şehir sayfalarında 72 saat planı yalnızca elle yazılanlarda var (Amsterdam yazıldı).

**Bilinen durum:** Native Fulham Broadway (Londra) için robot fiyat bulamadı; Booking'de 25–27 Kasım için "müsait değil" görünüyor. Sayfada seçenek olarak duruyor ("fiyat sitede"); Uygun paket fiyatı olan en uygun oteli (The Z Hotel Piccadilly) kullanıyor.
