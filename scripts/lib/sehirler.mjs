// Şehir listesi tek yerden gelir: index.html içindeki D dizisi okunur, robotlar aynı rakamları kullanır.
// Buraya yalnızca uygulamada olmayan bilgiler eklenir: dosya adı (slug) ve havalimanı kodu.
import { readFile } from "node:fs/promises";

// IATA şehir kodları. Bern'in tarifeli uçuşu çok az, Zürih üzerinden aranır.
export const IATA = {
  "Londra": "LON", "Dublin": "DUB", "Paris": "PAR", "Brüksel": "BRU", "Amsterdam": "AMS", "Lüksemburg": "LUX",
  "Berlin": "BER", "Bern": "ZRH", "Viyana": "VIE", "Madrid": "MAD", "Lizbon": "LIS", "Roma": "ROM", "Valletta": "MLA",
  "Atina": "ATH", "Reykjavik": "REK", "Oslo": "OSL", "Stokholm": "STO", "Kopenhag": "CPH", "Helsinki": "HEL",
  "Tallinn": "TLL", "Riga": "RIX", "Vilnius": "VNO", "Varşova": "WAW", "Prag": "PRG", "Bratislava": "BTS",
  "Budapeşte": "BUD", "Ljubljana": "LJU", "Zagreb": "ZAG", "Bükreş": "BUH", "Sofya": "SOF", "Kişinev": "KIV",
  "Belgrad": "BEG", "Saraybosna": "SJJ", "Podgorica": "TGD", "Üsküp": "SKP", "Tiran": "TIA", "Priştine": "PRN",
};
export const IATA_NOTE = { "Bern": "Zürih havalimanı üzerinden" };

export function slugify(name) {
  const map = { "ç": "c", "ğ": "g", "ı": "i", "ö": "o", "ş": "s", "ü": "u", "â": "a", "î": "i", "û": "u" };
  return String(name).toLocaleLowerCase("tr-TR").replace(/[çğıöşüâîû]/g, (c) => map[c]).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// index.html'deki ["Londra","Birleşik Krallık","Batı Avrupa",200,80,10,28 ...] satırlarını okur.
export function parseCities(html) {
  const start = html.indexOf("var D = [");
  if (start < 0) throw new Error("index.html içinde şehir listesi (var D) bulunamadı");
  const body = html.slice(start, html.indexOf("].map(", start));
  const re = /\["([^"]+)","([^"]+)","([^"]+)",(\d+(?:\.\d+)?),(\d+(?:\.\d+)?),(\d+(?:\.\d+)?),(\d+(?:\.\d+)?)/g;
  const out = []; let m;
  while ((m = re.exec(body))) {
    out.push({ name: m[1], country: m[2], region: m[3], h: +m[4], f: +m[5], t: +m[6], a: +m[7], slug: slugify(m[1]), iata: IATA[m[1]] || null });
  }
  if (out.length < 10) throw new Error("Şehir listesi beklenenden kısa: " + out.length);
  return out;
}

export async function loadCities(file = "index.html") {
  return parseCities(await readFile(file, "utf8"));
}
