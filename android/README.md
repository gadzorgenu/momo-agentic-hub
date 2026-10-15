# MoMo Forwarder (Android)

Tiny companion app that captures every MoMo SMS on the merchant's phone and
posts it to the MoMo Hub backend. No parsing, no UI beyond status + settings —
the backend owns the agent reasoning. This is the thing that stops the merchant
from having to paste SMS into the dashboard.

## What it does

1. Listens for incoming SMS (`RECEIVE_SMS`).
2. Keeps the ones whose sender ID matches an allowlist (MTN, Telecel, AT by default).
3. Writes each matched SMS to a local Room queue.
4. A `WorkManager` worker drains the queue to `POST /api/reconcile/ingest`
   with exponential backoff.
5. On first run, backfills the last 7 days of MoMo SMS from the inbox so the
   agent starts with real history.

Everything that isn't on the allowlist stays on the phone and is never read
again.

## Project layout

```
android/
  app/
    src/main/
      AndroidManifest.xml
      kotlin/gh/momohub/forwarder/
        ForwarderApp.kt           - WorkManager bootstrap
        MainActivity.kt           - Compose host + permission flow
        data/                     - Room db + DataStore settings
        net/IngestClient.kt       - OkHttp wrapper for /ingest
        sms/
          SmsReceiver.kt          - BroadcastReceiver for new SMS
          SmsBackfill.kt          - 7-day inbox scan
          SenderFilter.kt         - allowlist matcher
          Fingerprint.kt          - stable dedupe key
        ui/
          MainScreen.kt           - status card + sync/backfill buttons
          SettingsScreen.kt       - backend URL, API key, allowlist
          theme/Theme.kt
        work/ForwardWorker.kt     - drains queue to backend
      res/                        - manifest resources (icon, strings)
  build.gradle.kts, settings.gradle.kts, gradle/libs.versions.toml
```

## Build

Open the `android/` directory in Android Studio (Narwhal or newer). Let Gradle
sync, then Run on a device or emulator. From the CLI:

```sh
cd android
./gradlew :app:assembleDebug
./gradlew :app:installDebug      # with a device/emulator attached
```

> You'll need a Gradle wrapper. If `./gradlew` isn't present yet, run
> `gradle wrapper --gradle-version 8.11.1` once from inside `android/`
> (requires a system Gradle), or open the project in Android Studio which
> generates the wrapper on first sync.

## First-run setup

1. Install and launch on the merchant's phone.
2. Grant **SMS** + **Notifications** permissions when asked.
3. Open **Settings** (gear icon).
4. **Backend URL** — the public URL of the MoMo Hub backend
   (e.g. `https://hub.example.com`). Don't include a trailing `/api/...`.
5. **API key** — optional. If the backend protects `/api/reconcile/ingest`,
   paste the bearer token here.
6. **Sender allowlist** — comma-separated. The defaults cover MTN, Telecel
   and AT. Add more if the operator has rebranded or if the merchant uses a
   bank-issued MoMo short code.
7. Tap **Test connection** to verify the backend answers. A `201` means
   the stub SMS was accepted.
8. Save. Back on the main screen, tap **Backfill 7d** once to seed the
   ledger with the last week of MoMo SMS from the inbox.

After this, every new MoMo SMS forwards automatically with no user action.
The app can be force-closed; the receiver and WorkManager keep running.

## Backend contract this scaffold assumes

- `POST /api/reconcile/ingest`
  - body: `{ "rawSms": "<the SMS body>" }`
  - headers:
    - `Content-Type: application/json`
    - `X-Idempotency-Key: <sha256 of sender|second|body>` (optional on backend,
      guards against WorkManager retries)
    - `Authorization: Bearer <api key>` (if configured)
  - response: `2xx` with `{ runId }` on success, anything else triggers retry.

The backend already dedupes at the `momoTxId` level, so the idempotency key is
belt-and-suspenders — safe to ignore server-side for now.

## What this scaffold deliberately leaves out

- No foreground service / notification. For the pilot a plain receiver +
  WorkManager is enough on Android 7+. Add a foreground service only if OEM
  battery optimizers (Xiaomi, Oppo, Huawei) start killing the worker in field
  testing.
- No multi-tenant auth. One phone forwards to one backend. If multiple
  merchants ever share one backend, add a merchant ID header.
- No Google Play Billing / updates. Install via APK side-load during the
  pilot; worry about distribution once a merchant actually uses it for a week.
- No analytics. The audit log is in the backend; the phone stays dumb.

## Known OEM gotcha

Xiaomi, Oppo, Realme, Vivo and some Huawei phones aggressively kill
background apps even with WorkManager scheduled. In testing you'll want to
walk the merchant through enabling **"Autostart"** and disabling **"battery
optimization"** for MoMo Forwarder in their device settings — otherwise SMS
captured while the phone screen is off may sit in the queue until the next
unlock. This is the single biggest reliability bug to watch for in the pilot.

## Development checklist

- [ ] Replace the vector launcher icon with a real one.
- [ ] Harden the backend `/api/reconcile/ingest` to accept and honor the
      `X-Idempotency-Key` header (optional).
- [ ] Add an "export queue as JSON" debug action in Settings for triage.
- [ ] Add a Play Billing / update story when going beyond the pilot.
