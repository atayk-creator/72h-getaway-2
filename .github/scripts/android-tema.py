"""Capacitor'ın ürettiği Android temasında pencere arka planını koyu laciverte çeker
(durum çubuğu ve alt hareket çubuğunun arkası beyaz kalmasın). cap add android'den sonra çalıştırılır."""
import pathlib, re, sys
res = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "app/android/app/src/main/res")
(res / "values" / "koyu.xml").write_text('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n  <color name="koyu_arka">#0F2A43</color>\n</resources>\n')
p = res / "values" / "styles.xml"; s = p.read_text()
ITEMS = '<item name="android:windowBackground">@color/koyu_arka</item><item name="android:statusBarColor">@color/koyu_arka</item><item name="android:navigationBarColor">@color/koyu_arka</item><item name="android:windowLightStatusBar">false</item>'
n = 0
def add(m):
    global n; n += 1
    body = re.sub(r'\s*<item name="android:(windowBackground|statusBarColor|navigationBarColor|windowLightStatusBar)">[^<]*</item>', "", m.group(2))
    return m.group(1) + body + ITEMS + m.group(3)
s = re.sub(r'(<style name="AppTheme[^"]*"[^>]*>)(.*?)(</style>)', add, s, flags=re.S)
p.write_text(s); print("tema güncellendi:", n, "stil")
assert n >= 1
