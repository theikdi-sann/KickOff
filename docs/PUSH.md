# PUSH — end-to-end notification setup

The complete path from an empty Firebase project to a reminder in a phone's
notification tray, including every credential, every dashboard click and every
`curl`. It exists because push has five independent links and any one missing
produces a different symptom; [`RUNBOOK`](RUNBOOK.md) §11 is the short
procedure, this document is the reference.

- **Status:** living document · **Owner:** engineering
- **Last verified:** 2026-11-19 (Android, Xiaomi Pad 6 / Android 14 — see
  `RUNBOOK` §11.7)
- **Related:** [`RUNBOOK`](RUNBOOK.md) (§11 procedure, §4 rotation) ·
  [`TESTING.md`](TESTING.md) (PUSH contracts) · [`SECURITY.md`](SECURITY.md)
  (secret inventory)

## 0. The five links

| # | Link | Lives in | Breaks as |
|---|---|---|---|
| 1 | Firebase client config | `apps/mobile/google-services.json` (committed) | *Unable to get Firebase Messaging instance* |
| 2 | FCM V1 service account key | EAS credential store (secret, never committed) | Token issued, no notification ever arrives |
| 3 | EAS project id | `apps/mobile/eas.json` `build.<profile>.env` | *EAS_PROJECT_ID is missing* |
| 4 | Device token | `public.device_tokens` row via `POST /devices` | `{"sent":0,"reason":"no registered devices"}` |
| 5 | Ticket holder for the match | `public.tickets` (`status = 'valid'`) | `{"sent":0,"reason":"no ticket holders"}` |

Links 1–3 are build/deploy-time, 4 is the fan opting in, 5 is normal sales.
Work top-down: a later step cannot compensate for an earlier one.

## 1. Firebase project and `google-services.json` (link 1)

1. <https://console.firebase.google.com> → **Add project** (or reuse the
   existing `kickoff` project). Google Analytics is not needed for push.
2. In the project → **Project settings** (gear) → **General** → *Your apps* →
   **Add app** → **Android**.
3. Android package name: **`app.kickoff.fan`**. It must equal
   `android.package` in `apps/mobile/app.config.ts` exactly — a mismatch makes
   FCM return `403 PERMISSION_DENIED` and no token is ever issued.
   Nickname: `KickOff fan`. App signing SHA-1 is optional for FCM (only needed
   for Google Sign-In / App Check).
4. **Register app** → **Download `google-services.json`**.
5. Put it at `apps/mobile/google-services.json` and commit it. It contains
   public identifiers only (project id, API key restricted to the app) and it
   is a **build input**: `app.config.ts` points `android.googleServicesFile` at
   it, so the Expo config plugin copies it into the Gradle build. Ignoring it
   would break every clone and every EAS build (`PUSH-HW-6`).

The downloaded `*firebase-adminsdk*.json` from step 2.x is a **different file**
and a real secret — see below.

## 2. FCM V1 service-account key (link 2)

This is the server side: Expo Push authenticates to Firebase with it.

### 2.1 Create the key in Firebase

1. Firebase console → Project settings → Service accounts tab.
2. Click **Generate new private key** → **Generate key**. A
   `kickoff-firebase-adminsdk-xxxxx.json` file downloads.
3. Treat it as a password: it grants send access to every device in the
   project. Never commit it — `.gitignore` covers
   `*firebase-adminsdk*.json`, and `PUSH-HW-4` fails if anything references it
   by path.

### 2.2 Upload it to EAS (the step that is easy to skip)

From `apps/mobile`:

```bash
npx eas-cli@latest login
npx eas-cli@latest credentials
```

Then follow the menu exactly:

1. **Android**
2. **production** (the *credential* profile — it is shared by every build
   profile that talks to the same Firebase project; `development` and
   `preview` are not asked for a separate push key)
3. **Google Service Account**
4. **Manage your Google Service Account Key for Push Notifications (FCM V1)**
5. **Set up a Google Service Account Key for Push Notifications (FCM V1)**
6. **Upload a new service account key** → select the
   `*firebase-adminsdk*.json` file from step 2.1

To inspect later, `npx eas-cli@latest credentials` → Android → production →
*Google Service Account* shows the key's project and client email. Delete and
re-upload there if it is wrong.

**Alternative, no CLI:** <https://expo.dev> → your project → **Project
settings** → **Credentials** → Android → *Service Credentials* → **Add a
service account key** → upload the same JSON. Identical result.

### 2.3 Verify before you build

- Firebase console → **Cloud Messaging** should show the FCM V1 API enabled
  (new projects have it by default).
- In Google Cloud console → **APIs & Services** → **Enabled APIs**, allow
  **Firebase Cloud Messaging API**, **FCM Registration API** and **Firebase
  Installations API** for the project. A key restricted to only some of these
  produces the "token saved, nothing arrives" failure.
- `google-services.json` belongs to the **same project** as the uploaded key.
  A key from another Firebase project is the classic `MismatchSenderId`.

No app rebuild is needed after a key upload — it is used at send time, not at
build time.

## 3. The EAS project id (link 3)

The token call needs the EAS project id, and the build server must be able to
see it:

```json
// apps/mobile/eas.json — build.development.env and build.preview.env
"env": { "EAS_PROJECT_ID": "6f1ad5f2-435e-4d40-ae54-50772a22bdcb" }
```

It must be in `eas.json`, not only in `apps/mobile/.env`: that file is
gitignored and EAS uploads the project *respecting* `.gitignore`, so a value
that only exists in `.env` is absent on the build server. The APK then bakes
`extra.eas.projectId: undefined` and the app says *"EAS_PROJECT_ID is
missing"* (`PUSH-HW-3`). Get the value from `npx eas-cli@latest project:info`
or the project's URL on expo.dev.

## 4. Build and install the development client

Expo Go cannot receive push since SDK 53, and emulators cannot register.

```bash
cd apps/mobile
npx eas-cli@latest build --profile development --platform android
```

The `development` profile sets `developmentClient: true` and
`distribution: internal`, so EAS produces an installable **APK** (not an
`.aab`) whose URL it prints when the build finishes.

1. Open that URL **on the phone** and install the APK.
2. Launch the **installed app** — not Expo Go, not the QR code.
3. Sign in with a fan account that holds a ticket for the match you will test
   with.

If the app was installed before `googleServicesFile` was wired, rebuild: that
config is applied at build time, so an old APK keeps throwing *"Unable to get
Firebase Messaging instance"* forever.

## 5. Obtain the `ExponentPushToken` (link 4)

### What the app does

`apps/mobile/src/lib/notifications.ts` → `registerPushToken()`:

```ts
await Notifications.setNotificationChannelAsync('default', { name: 'Match updates' /* … */ });
await Notifications.requestPermissionsAsync();               // POST_NOTIFICATIONS / iOS dialog
const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
await api.post('devices', { token, platform: Platform.OS }); // upsert into device_tokens
```

`pushUnavailableReason()` refuses up front with the precise fix when the
runtime is Expo Go, the device is an emulator, or the EAS project id is
missing — that is the message under the Settings switch.

### What the operator does

1. Open the installed dev build → **Profile → Settings & notifications**.
2. Turn on **Match reminders** and accept the OS permission dialog.
3. That is the whole client step. The screen shows only a switch, **not** the
   token, so confirm it in the database (below).

### Where the token is (SQL editor)

Supabase dashboard → project `cvebikawynavfyfbjnzu` → **SQL editor** → new
query:

```sql
select token, platform, created_at
from device_tokens
order by created_at desc
limit 5;
```

A healthy row looks like `ExponentPushToken[abc123…]`, `android`, and a recent
timestamp. `device_tokens` (migration `0014`) is the table — `devices` is the
Edge Function endpoint that writes it, not a table.

Copy the token into a scratch buffer for §6, but **never paste a full token**
into a ticket, a doc, a commit or a chat: it is a live credential that can send
notifications to that phone. Record the first ~10 characters
(`ExponentPushToken[…`) as evidence and the rest only in the `curl` you run
locally.

## 6. Send a test push (the token works?)

Background the app first (home button, or swipe it out of recents) so you are
testing tray delivery rather than the foreground handler.

```bash
curl -X POST https://exp.host/--/api/v2/push/send \
  -H 'Content-Type: application/json' \
  -d '{"to":"ExponentPushToken[…your-token-here…]","title":"KickOff","body":"Hardware push proof","sound":"default"}'
```

A good ticket response:

```json
{"data":{"status":"ok","id":"0193f0c1-…"}}
```

`"status":"ok"` means **accepted**, not delivered. Keep the `id` and check the
receipt a few seconds later:

```bash
curl -X POST https://exp.host/--/api/v2/push/getReceipts \
  -H 'Content-Type: application/json' \
  -d '{"ids":["0193f0c1-…"]}'
```

| Receipt | Meaning | Fix |
|---|---|---|
| `{"status":"ok"}` | delivered to FCM/APNs and the device | none |
| `DeviceNotRegistered` | token stale — app reinstalled, or permission revoked | re-toggle the switch, re-read `device_tokens` |
| `MismatchSenderId` | `google-services.json` and the uploaded FCM key are different Firebase projects | re-upload the key from the same project (§2) |
| `InvalidCredentials` | the FCM V1 key is missing, revoked or lacks the Cloud Messaging API | re-upload (§2.2), enable the API (§2.3) |
| `MessageTooBig` / `InvalidPayload` | malformed body | title/body are strings, payload < 4 KB |

Browser alternative: <https://expo.dev/notifications> → paste the token → send.
Same service, same receipts. A test push proves **link 1–4**; it does not
exercise the reminder function.

## 7. The real reminder path (links 4 and 5)

`send-kickoff-reminders` is what `pg_cron` calls 24 h and 2 h before kickoff.
It is the only path that also proves the ticket query.

### 7.1 The secret

Supabase → **SQL editor**:

```sql
select value from app_secrets where key = 'reminders_secret';
```

The function requires it in the `x-cron-secret` header; the function is
deployed with `verify_jwt=false` so the scheduler needs no user session. Keep
the value out of tickets and shell history (`export` it in the current shell
only, or pass it inline).

### 7.2 A match to test with

```sql
select id, opponent, kickoff_at, status
from matches
where status = 'upcoming' and kickoff_at > now()
order by kickoff_at
limit 5;
```

Without a `matchId`, the function picks the earliest `upcoming` match inside
the next **26 hours**. If nothing is in range it answers
`{"sent":0,"reason":"no upcoming match"}` — pass an explicit `matchId` to skip
the window.

Check the two remaining links for that match:

```sql
select count(*) filter (where status = 'valid') as valid_tickets
from tickets where match_id = '<match-id>';

select count(*) as devices from device_tokens;
```

### 7.3 Call it

```bash
curl -X POST "https://cvebikawynavfyfbjnzu.supabase.co/functions/v1/send-kickoff-reminders" \
  -H "x-cron-secret: <secret from 7.1>" \
  -H "content-type: application/json" \
  -d '{"matchId":"<match-id>"}'
```

Omit the body or send `{}` to use the automatic match. A healthy response:

```json
{"ok":true,"data":{"sent":1,"matchId":"m-cmi","devices":1}}
```

`sent` counts Expo tickets accepted; `devices` counts the tokens looked up for
that match's ticket holders.

| Response | Meaning | Next |
|---|---|---|
| `{"sent":0,"reason":"no upcoming match"}` | nothing inside 26 h | pass `matchId` |
| `{"sent":0,"reason":"match already started"}` | kickoff is in the past | pick a future match |
| `{"sent":0,"reason":"no ticket holders"}` | no `valid` ticket rows | sell/issue a ticket, or pick another match |
| `{"sent":0,"reason":"no registered devices"}` | no `device_tokens` rows | repeat §5 |
| `401 Invalid reminder scheduler secret` | wrong/missing `x-cron-secret` | re-read §7.1 |

Then confirm delivery with `getReceipts` (§6) or the Edge log:
**Edge Functions → send-kickoff-reminders → Logs** carries the Expo ticket
status per send.

With the app swiped out of recents the reminder should appear in the tray
within a few seconds — *"Matchday is coming"* plus opponent, time and venue.

## 8. SQL editor recipes

All run against the hosted project (`cvebikawynavfyfbjnzu`) in the Supabase
dashboard's **SQL editor**; the service role is implicit there.

```sql
-- 1. cron secret (used as the x-cron-secret header)
select value from app_secrets where key = 'reminders_secret';

-- 2. upcoming matches to test against
select id, opponent, kickoff_at, status
from matches
where status = 'upcoming' and kickoff_at > now()
order by kickoff_at limit 5;

-- 3. registered devices — one row per opt-in
select token, platform, created_at
from device_tokens order by created_at desc limit 10;

-- 4. a fan's devices (replace the email)
select d.token, d.platform, d.created_at
from device_tokens d
join profiles p on p.id = d.user_id
where p.email = 'fan@example.com';

-- 5. valid tickets for the match under test
select t.id, t.status, t.user_id
from tickets t
where t.match_id = '<match-id>' and t.status = 'valid';

-- 6. remove a dead token after DeviceNotRegistered
delete from device_tokens where token = 'ExponentPushToken[…your-token-here…]';
```

The token column is unique, so re-toggling on the same phone updates the row
rather than duplicating it.

## 9. Troubleshooting

| Symptom | Probable cause | Fix |
|---|---|---|
| Settings says *EAS_PROJECT_ID is missing* | APK built before the `eas.json` env | rebuild (§4) |
| Settings says *Expo Go cannot receive push* | opened in Expo Go | install/open the dev-client APK |
| Settings says *needs a physical device* | emulator/simulator | real hardware |
| *Unable to get Firebase Messaging instance* | `googleServicesFile` unwired or wrong package | §1, rebuild |
| *Notification permission was not granted* | denied at OS level | Android Settings → Apps → KickOff → Notifications → allow |
| Token row exists, test push returns `InvalidCredentials` | FCM V1 key missing/revoked | §2.2 |
| Token row exists, `MismatchSenderId` | key and `google-services.json` from different projects | §2, re-upload |
| Notification only while app is open | tested in foreground, or channel missing | background/swipe out, resend |
| `sent:1` but nothing arrives | delivery problem, not the function | `getReceipts` (§6) and Edge logs |
| Worked yesterday, stopped after an app reinstall | token changed | re-toggle the switch (§5) |

## 10. Security and rotation

- The **FCM V1 service account key** is an EAS-held secret: never in the repo,
  never in a doc, never in a ticket. `.gitignore` covers
  `*firebase-adminsdk*.json`.
- An **ExpoPushToken** is also a credential: it can only address one device,
  but it can send to it. Prefixes in writing, full tokens only inside a local
  `curl`.
- **Rotation:** Firebase console → *Service accounts* → **Generate new private
  key** → `npx eas-cli@latest credentials` → Android → production → *Google
  Service Account* → *Manage … FCM V1* → upload the new key (delete the old
  entry if offered). No app rebuild is required, but **delivery stops until
  the new key is uploaded** — do it in the same sitting. Then send one test
  push (§6) to confirm.
- Rotate after any suspected leak, when someone with console access leaves,
  and at least quarterly. `RUNBOOK` §4 lists it beside the other secrets.

## 11. iOS

Same shape, different server credential: create an **APNs key** (`.p8`) in the
Apple Developer portal, upload it with `npx eas-cli@latest credentials` →
**iOS** → production → *Push Notifications Key*, and build with
`--platform ios` on a physical device. No `google-services.json` is involved.
The iOS run has not been performed yet; `RUNBOOK` §11.7 records the Android
run and says so.
