#!/usr/bin/env sh
set -eu

# Bounded debug evidence only: no release signing, store upload or physical-device claim.
node --test tests/android-release-contract.test.mjs
gradle -p android --no-daemon lintDebug assembleDebug
