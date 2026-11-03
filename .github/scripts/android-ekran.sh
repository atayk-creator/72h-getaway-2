#!/usr/bin/env bash
# Sanal Android telefonda uygulamayı kurar, açar ve ekran görüntüleri alır (ekran/ klasörüne).
set -u
APK=app/android/app/build/outputs/apk/debug/app-debug.apk
mkdir -p ekran
shot() { adb exec-out screencap -p > "ekran/$1.png"; }
adb install -r "$APK"
adb shell am start -n "$APP_ID/.MainActivity"; sleep 25
shot android-1-tanitim
adb logcat -d | grep -iE "Capacitor|chromium|Console" | tail -n 80 > ekran/android-log.txt || true
# Tanıtımı geçilmiş say (Preferences = shared_prefs/CapacitorStorage.xml) ve yeniden aç
adb shell am force-stop "$APP_ID"
printf '<?xml version="1.0" encoding="utf-8" standalone="yes" ?>\n<map><string name="72h-tanitim">1</string></map>\n' > /tmp/cs.xml
adb push /tmp/cs.xml /data/local/tmp/cs.xml
adb shell "run-as $APP_ID mkdir -p shared_prefs && run-as $APP_ID cp /data/local/tmp/cs.xml shared_prefs/CapacitorStorage.xml"
adb shell am start -n "$APP_ID/.MainActivity"; sleep 20
shot android-2-hesapla
SIZE=$(adb shell wm size | grep -o '[0-9]*x[0-9]*' | tail -1); W=${SIZE%x*}; H=${SIZE#*x}
adb shell input swipe $((W/2)) $((H*3/4)) $((W/2)) $((H/5)) 400; sleep 2
adb shell input swipe $((W/2)) $((H*3/4)) $((W/2)) $((H/5)) 400; sleep 3
shot android-3-kaydir
# Alt menüde "Turlarım" (4 sekmeden 3.sü), en alt
adb shell input tap $((W*5/8)) $((H-H/30-60)); sleep 3
shot android-4-turlarim
ls -la ekran
