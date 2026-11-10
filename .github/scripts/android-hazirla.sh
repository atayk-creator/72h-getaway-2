#!/usr/bin/env bash
# Android projesini üretir (app/android): web içeriği, tema, simge/açılış ekranı. Test ve mağaza derlemesi ortak kullanır.
set -euo pipefail
cd app
npm install --no-audit --no-fund
npm run www
npx cap add android
python3 ../.github/scripts/android-tema.py android/app/src/main/res
npx capacitor-assets generate --android --iconBackgroundColor "#0F2A43" --iconBackgroundColorDark "#0F2A43" --splashBackgroundColor "#0F2A43" --splashBackgroundColorDark "#0F2A43"
npx cap sync android
npx cap --version
