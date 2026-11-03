#!/usr/bin/env bash
# Sanal Android telefonda uygulamayı kurar, açar, düğmelere dokunur ve ekran görüntüleri alır (ekran/ klasörüne).
set -u
APK=app/android/app/build/outputs/apk/debug/app-debug.apk
mkdir -p ekran
shot() { adb exec-out screencap -p > "ekran/$1.png"; }
adb install -r "$APK"
adb logcat -c || true
adb shell am start -n "$APP_ID/.MainActivity"; sleep 25
shot android-1-tanitim
SIZE=$(adb shell wm size | grep -o '[0-9]*x[0-9]*' | tail -1); W=${SIZE%x*}; H=${SIZE#*x}; echo "Ekran: ${W}x${H}"
# "Geç" düğmesi (tanıtımın en altı, ortada)
adb shell input tap $((W/2)) $((H*922/1000)); sleep 4
shot android-2-hesapla
adb shell input swipe $((W/2)) $((H*3/4)) $((W/2)) $((H/5)) 500; sleep 1
adb shell input swipe $((W/2)) $((H*3/4)) $((W/2)) $((H/5)) 500; sleep 3
shot android-3-kaydir
# Alt menü: "Turlarım" (4 sekmenin 3.sü)
adb shell input tap $((W*5/8)) $((H*955/1000)); sleep 3
shot android-4-turlarim
adb shell input keyevent 4; sleep 2
# Alt menü: "Oteller"
adb shell input tap $((W*3/8)) $((H*955/1000)); sleep 6
shot android-5-oteller
adb logcat -d | grep -iE "Capacitor/Console|AndroidRuntime|FATAL" | tail -n 60 > ekran/android-log.txt || true
adb logcat -d -b crash > ekran/android-crash.txt 2>/dev/null || true
ls -la ekran
