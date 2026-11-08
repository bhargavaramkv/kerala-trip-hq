# Kerala Trip HQ (standalone)

One invite link for the whole group. Anyone who opens it joins as a member, signed in with Google
(or by name only if you allow it). No approvals, no emails collected, no per-person setup.

* **Membership** lives in this app's own database. Claude Share/Editor is not used.
* **Contributions** (votes, comments, suggestions, expenses) are stored under the signed-in user's id.
* **Sessions** last a year, so people stay in when they come back.
* **Administrator** (Bhargava): Crew tab → copy the invite link, make a new link, remove a member.
  Removing a member cuts them off immediately. Making a new link stops the old one admitting new people.
* **AI** (Ask AI, suggestion reviews) is administrator-only and needs `ANTHROPIC_API_KEY`.
* No npm dependencies. Needs Node 22.13+.

## Run locally
```
BASE_URL=http://localhost:3000 node server.js
```
The terminal prints an admin link and the invite link.

## Google sign-in (recommended)
Google Cloud Console → APIs & Services → Credentials → Create OAuth client ID → Web application.
Authorised redirect URI: `https://YOURAPP.fly.dev/auth/google/callback`. Put the client id/secret in the secrets above.
Signing in with `OWNER_EMAIL` makes that account the administrator. Emails are only compared, never stored.

## No Google? Name-only joining
Set `ALLOW_ANON=1`. People join by typing a name. They are marked "Name only" in the Crew tab, and they
need the same browser to come back. To become administrator without Google, open `/admin/<ADMIN_KEY>` once.

## Start it (GitHub only, no setup)
1. Open **https://codespaces.new/bhargavaramkv/kerala-trip-hq** and press *Create codespace*.
2. Wait about a minute. The terminal prints a box with an **admin link**. Open it once: you become the administrator.
3. In the app go to **Crew**, copy the invite message and post it in the group. Friends tap the link, enter their name, and they are in.

Nothing else is needed: no secrets, no accounts. Port 8080 is made public automatically.
Limits: a Codespace stops after idle time (Settings > Codespaces > idle timeout, up to 4 h; restart it from
github.com/codespaces and the same link works again), the free tier is about 60 core-hours a month, and the data lives
on the Codespace disk, so don't delete it. Optional extras via Codespaces secrets: `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`OWNER_EMAIL`
(verified Google sign-in) and `ANTHROPIC_API_KEY` (AI reviews, administrator only).
