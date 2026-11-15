// Kurul notları (kararlar, uyarılar, ekip işleri, site işleri, yayın programı) depoya yalnızca ŞİFRELİ girer:
// yonetim/panel/notlar.enc. Kurul açık anahtarla şifreler (yonetim/panel/acik-anahtar.pem, gizli değildir);
// özel anahtar yalnızca GitHub Secret PANEL_NOT_ANAHTARI'nda durur ve saatlik iş akışı notları onunla açar.
// Yöntem: rastgele AES-256-GCM anahtarı, RSA-OAEP (SHA-256) ile sarılır.
// Kurulun kullanacağı tek satır:  node scripts/panel-not.mjs sifrele notlar.json
//   notlar.json = { "notlar": [ { "tip": "karar|uyari|is|it", "baslik": "", "son": "", "detay": "", "durum": "", "kim": "" } ],
//                   "program": [ { "gun": "2026-11-17", "sira": 0, "planli": true, "kod": "V-12", "icerik": "", "kim": "" } ] }
//   (notlar.json depoya KONMAZ; komut yalnızca yonetim/panel/notlar.enc dosyasını yazar.)
import { readFileSync, writeFileSync } from "node:fs";
import { publicEncrypt, privateDecrypt, randomBytes, createCipheriv, createDecipheriv, constants } from "node:crypto";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
export const ACIK = join(root, "yonetim/panel/acik-anahtar.pem"), SIFRELI = join(root, "yonetim/panel/notlar.enc");
const oaep = (key) => ({ key, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" });

export function notSifrele(veri, acikPem) {
  const k = randomBytes(32), iv = randomBytes(12), c = createCipheriv("aes-256-gcm", k, iv);
  const ct = Buffer.concat([c.update(Buffer.from(JSON.stringify(veri), "utf8")), c.final(), c.getAuthTag()]);
  return { v: 1, k: publicEncrypt(oaep(acikPem), k).toString("base64"), iv: iv.toString("base64"), ct: ct.toString("base64") };
}
export function notCoz(paket, ozelPem) {
  const k = privateDecrypt(oaep(ozelPem), Buffer.from(paket.k, "base64")), b = Buffer.from(paket.ct, "base64");
  const d = createDecipheriv("aes-256-gcm", k, Buffer.from(paket.iv, "base64"));
  d.setAuthTag(b.subarray(b.length - 16));
  return JSON.parse(Buffer.concat([d.update(b.subarray(0, b.length - 16)), d.final()]).toString("utf8"));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [komut, dosya] = process.argv.slice(2);
  if (komut !== "sifrele" || !dosya) { console.error("Kullanım: node scripts/panel-not.mjs sifrele <notlar.json>"); process.exit(2); }
  const veri = JSON.parse(readFileSync(dosya, "utf8"));
  if (!Array.isArray(veri.notlar)) { console.error('notlar.json içinde "notlar" dizisi olmalı.'); process.exit(2); }
  writeFileSync(SIFRELI, JSON.stringify(notSifrele(veri, readFileSync(ACIK, "utf8"))) + "\n");
  console.log(`Şifrelendi: yonetim/panel/notlar.enc (${veri.notlar.length} not, ${(veri.program || []).length} program satırı). Düz dosyayı depoya koyma.`);
}
