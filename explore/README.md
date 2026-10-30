# Interior — kreathaus.com/explore

A voice-guided Internal Family Systems practice. Single static page + one PHP file.
No build step. Upload the whole `explore/` folder to `public_html/explore/`.

## Setup (once)

### 1. The guide's voice (ElevenLabs)
1. elevenlabs.io → your profile → **API keys** → create a key.
2. GitHub → repo → Settings → Secrets and variables → Actions → add `ELEVENLABS_API_KEY`.
   The next deploy writes `api/config.php` on the server from it. (Manual alternative:
   copy `api/config.sample.php` to `api/config.php`, paste the key, upload by FTP.)
3. On the phone: **Settings → The guide's voice → Hear** each one, choose, then
   **Prepare the guide's voice** once. Every line is generated on your server and cached as
   MP3, so sessions never wait and the ElevenLabs quota is spent once per line, not per session.
4. If lines never cache, make `api/cache/` writable (755/775) in cPanel File Manager.

Any voice from your ElevenLabs library works — including a designed or cloned voice.
Paste its voice ID into `config.js` → `voices`.

### 2. Sign in with Google (Firebase — same project as /daily)
1. Firebase console → the project behind kreathaus.com/daily → **Project settings → Your apps
   → Web app → config**. Paste the values into `config.js` → `firebase`.
2. **Authentication → Sign-in method**: Google is already enabled for /daily. Confirm
   **Authorized domains** includes `kreathaus.com` and `www.kreathaus.com`.
3. **Firestore → Rules**: add this block alongside the existing rules. Interior keeps its data in
   its own `interior_users` collection, so nothing in /daily is touched.

```
match /interior_users/{uid} {
  allow read, write: if request.auth != null && request.auth.uid == uid;
}
```

Each account gets one document: name, chosen voice, parts, sessions. Signing in on a
second device merges, never overwrites.

## Updating the live site
Automatic. `.github/workflows/deploy-explore.yml` uploads this folder to ftp.kreathaus.com
on every push that touches `explore/` (branches `claude/interior-explore` and `main`), and can be
run by hand from the repo's Actions tab. It never overwrites `api/config.php` or cached audio.

One-time setup: GitHub → repo → Settings → Secrets and variables → Actions → add
`FTP_USERNAME` and `FTP_PASSWORD`.

Fallback without GitHub — cPanel → Terminal, one line:

```
rm -rf /tmp/khx && git clone -q --depth 1 -b claude/interior-explore https://github.com/jonathankbowden/Kreathaus_2026 /tmp/khx && cp -r /tmp/khx/explore/. ~/public_html/explore/ && rm -rf /tmp/khx && echo updated
```

After either, force-quit and relaunch the home-screen app on the phone.

## Files
- `index.html` — the app
- `config.js` — Firebase config + voice IDs (safe to commit; these are client-side values)
- `api/tts.php` — ElevenLabs proxy with disk cache, origin check and a daily generation cap
- `api/config.php` — your key (git-ignored); `api/config.sample.php` is the template
- `api/cache/` — generated MP3s
- `icon-180.png` — home-screen icon (Safari → Share → Add to Home Screen)

## Notes
- Voice input uses the browser's speech recognition (works on iPhone Safari over https).
- If the proxy can't be reached, the device voice stands in and a note says so once.
- `TTS_DAILY_CAP` in `config.php` limits new generations per day (cached lines are free).
