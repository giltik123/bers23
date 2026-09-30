#!/usr/bin/env bash
set -euo pipefail

OUT_DIR="${1:-artifacts/hsme-virtual-android-preflight}"
mkdir -p "$OUT_DIR"

adb wait-for-device

boot_completed=""
for _ in $(seq 1 60); do
  boot_completed="$(adb shell getprop sys.boot_completed | tr -d '\r')"
  if [[ "$boot_completed" == "1" ]]; then
    break
  fi
  sleep 2
done
if [[ "$boot_completed" != "1" ]]; then
  echo "Android emulator did not finish booting" >&2
  exit 1
fi

serial="$(adb get-serialno | tr -d '\r')"
sdk="$(adb shell getprop ro.build.version.sdk | tr -d '\r')"
model="$(adb shell getprop ro.product.model | tr -d '\r')"
product="$(adb shell getprop ro.product.name | tr -d '\r')"
abi="$(adb shell getprop ro.product.cpu.abi | tr -d '\r')"
qemu_kernel="$(adb shell getprop ro.kernel.qemu | tr -d '\r')"
qemu_boot="$(adb shell getprop ro.boot.qemu | tr -d '\r')"

case "$serial" in
  emulator-*) ;;
  *)
    echo "Expected an Android emulator serial, got: $serial" >&2
    exit 1
    ;;
esac

if [[ "$qemu_kernel" != "1" && "$qemu_boot" != "1" && "$product" != *sdk_gphone* && "$model" != *sdk_gphone* ]]; then
  echo "Expected an explicit emulator/QEMU marker" >&2
  exit 1
fi

# Exercise Android's virtual battery controls. These are intentionally classified
# as simulated state and must never be promoted to physical-device evidence.
adb emu power ac off >/dev/null
adb emu power status discharging >/dev/null
adb emu power capacity 73 >/dev/null
adb shell dumpsys battery | tr -d '\r' | tee "$OUT_DIR/battery.txt"
grep -F "AC powered: false" "$OUT_DIR/battery.txt"
grep -F "level: 73" "$OUT_DIR/battery.txt"

# Exercise the Android procfs RSS path used by the reviewed Android working-set
# semantics. This proves the plumbing exists on a virtual Android device only.
pid="$(adb shell pidof com.android.systemui | tr -d '\r' | awk '{print $1}')"
if [[ -z "$pid" ]]; then
  pid="$(adb shell pidof system_server | tr -d '\r' | awk '{print $1}')"
fi
if [[ -z "$pid" ]]; then
  echo "Could not resolve an Android process for RSS capture" >&2
  exit 1
fi
rss_kb="$(adb shell "awk '/^VmRSS:/ {print \\$2}' /proc/$pid/status" | tr -d '\r')"
if ! [[ "$rss_kb" =~ ^[0-9]+$ ]] || (( rss_kb <= 0 )); then
  echo "Invalid VmRSS reading: $rss_kb" >&2
  exit 1
fi

# Thermal service is captured for compatibility/preflight only. Emulator thermal
# state is not accepted as physical thermal/throttling evidence.
if adb shell dumpsys thermalservice | tr -d '\r' >"$OUT_DIR/thermalservice.txt" 2>"$OUT_DIR/thermalservice.err"; then
  thermal_service_available=true
else
  thermal_service_available=false
fi

jq -n \
  --arg serial "$serial" \
  --arg sdk "$sdk" \
  --arg model "$model" \
  --arg product "$product" \
  --arg abi "$abi" \
  --arg qemuKernel "$qemu_kernel" \
  --arg qemuBoot "$qemu_boot" \
  --argjson rssKb "$rss_kb" \
  --argjson thermalServiceAvailable "$thermal_service_available" \
  '{
    schemaVersion:"BERS_HSME_VIRTUAL_ANDROID_PREFLIGHT_V1",
    evidenceClass:"VIRTUAL_ANDROID_PREFLIGHT_ONLY",
    platform:"ANDROID",
    deviceClass:"MOBILE",
    virtualDevice:true,
    emulatorSerial:$serial,
    androidApiLevel:$sdk,
    productModel:$model,
    productName:$product,
    cpuAbi:$abi,
    qemuMarkers:{kernel:$qemuKernel,boot:$qemuBoot},
    processResidentSetRssKb:$rssKb,
    simulatedBattery:{acPowered:false,levelPercent:73,status:"DISCHARGING"},
    thermalServiceAvailable:$thermalServiceAvailable,
    realPhysicalMobileDeviceMeasurement:false,
    physicalDeviceAttestationSha256:null,
    energyMicroJoulesPerRun:null,
    powerSource:"SIMULATED_BATTERY",
    productionAuthorityGranted:false,
    mobileBackendAdmissionAllowed:false
  }' >"$OUT_DIR/evidence.json"

test "$(jq -r '.evidenceClass' "$OUT_DIR/evidence.json")" = "VIRTUAL_ANDROID_PREFLIGHT_ONLY"
test "$(jq -r '.virtualDevice' "$OUT_DIR/evidence.json")" = "true"
test "$(jq -r '.realPhysicalMobileDeviceMeasurement' "$OUT_DIR/evidence.json")" = "false"
test "$(jq -r '.physicalDeviceAttestationSha256' "$OUT_DIR/evidence.json")" = "null"
test "$(jq -r '.energyMicroJoulesPerRun' "$OUT_DIR/evidence.json")" = "null"
test "$(jq -r '.powerSource' "$OUT_DIR/evidence.json")" = "SIMULATED_BATTERY"
test "$(jq -r '.productionAuthorityGranted' "$OUT_DIR/evidence.json")" = "false"
test "$(jq -r '.mobileBackendAdmissionAllowed' "$OUT_DIR/evidence.json")" = "false"

cat "$OUT_DIR/evidence.json"
