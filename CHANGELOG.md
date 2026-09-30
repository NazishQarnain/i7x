# Changelog

All notable changes to i7x — Nearby News & Alert System are recorded here,
newest first. Current version is also shown in the app itself (open the
side menu — bottom of the list).

## v1.8.1 — Explore bug fixes and optimization

- Fixed: likes were only "one per user" by client convention. Rules now
  require the user's own like doc to be created/deleted in the same batch
  as the `likeCount` +/-1, so a user cannot inflate counts. Likes moved to
  `users/{uid}/likes/{postId}` (the old `posts/{id}/likes` is unused).
  **Redeploy `firestore.rules`.**
- Fixed: opening Explore before the GPS fix arrived showed no urgent
  hazards; it now refreshes when location becomes available.
- Optimized: each Explore card used to register its own auth listener and
  do 2 Firestore reads (up to ~200 per load). Liked/saved ids are now
  loaded once per session (2 reads) and shared.
- Optimized: home location uses a cached fix (up to 60 s) with normal
  accuracy, so the feed loads faster.
- Interest weights are clamped (-10..30) so one category cannot dominate
  forever.

## v1.8.0 — Explore (recommender)

- Added: home page now has **Nearby** and **Explore** tabs.
- Explore ranks the last 7 days of posts with
  `score = 0.4·urgency + 0.3·interest + 0.15·popularity + 0.15·freshness − already_seen`.
  - "⚠️ Abhi zaroori": top 5 hazards by severity × proximity (2–15 km) × recency (24 h).
  - "✨ Tumhare liye": everything else by score.
  - Cold start uses the default (no categories asked at signup); interest
    builds from opens (+1), likes (+3), saves (+4), not-interested (−5).
- Added: 👍 Like, 🔖 Save and 🚫 Not interested actions (Explore cards);
  Like/Save also on the post page. Needs login.
- Added: `explore.js` (scoring + actions), `likeCount` on posts,
  `posts/{id}/likes/{uid}` and `users/{uid}/saves/{postId}`.
- Rules: signed-in users may change only `likeCount` by ±1; likes and saves
  are per-user. **Redeploy `firestore.rules`.**
- Interest weights and seen/hidden lists are stored in this browser's
  localStorage (not synced across devices yet).

## v1.7.0 — Drive Mode reliability + post form hardening

- Fixed: a hazard first detected within 300 m fired both the 1 km and
  300 m alerts back-to-back. Now only one alert fires (the closest
  threshold crossed).
- Fixed: Drive Mode trusted the GPS heading even when nearly stationary,
  which is unreliable and could hide hazards at a red light. Heading is
  now used only above ~1 m/s, and the last known heading is kept while
  stopped.
- Fixed: transparent PNG/WebP uploads turned black after JPEG
  compression. A white background is now painted first.
- Fixed: title (150) and details (3000) length limits existed only in
  HTML `maxlength`; they are now enforced in JS too. Non-image files are
  rejected before upload.
- Fixed: pressing Enter repeatedly on the login fields could submit
  login twice while a request was in flight.
- Added: Drive Mode keeps the screen awake (Screen Wake Lock API) so GPS
  updates and alerts do not stop when the phone screen sleeps. Re-acquired
  when you return to the tab; released when Drive Mode stops.
- Optimized: "Load nearby news" accepts a location fix up to 30 s old
  instead of forcing a fresh high-accuracy fix every click.

## v1.6.1 — Bug fix pass 3

- Fixed: the Drive Mode "Recenter" feature broke itself — Leaflet's
  `zoomstart` event fires for both user zoom gestures AND our own
  programmatic `map.setView()` calls (the auto-follow recenter). Without
  telling those apart, every auto-follow update looked like "the user
  panned away", instantly disabling follow mode and showing the Recenter
  button right as Drive Mode started.
- Fixed: admin panel's content column always appended "..." even to
  short posts that weren't actually truncated, making them look cut off
  when they weren't.
- Fixed: the admin-access check accepted three different field names
  (`role`, `isAdmin`, `is_admin`), but firestore.rules (v1.2.0) only
  ever recognized `role === "admin"`. An account using one of the old
  field names could see the whole admin panel (client check passed)
  while every actual action — delete, import — silently failed with a
  permission-denied error from Firestore. Now both checks match exactly.
- Fixed: two places building a `news.html?id=...` link (the home feed
  card click, and "Open" in Account → My Posts) didn't URL-encode the
  post id, unlike the rest of the app. Firestore auto-IDs are safe in
  practice, but this closes the inconsistency.
- Cleaned up a stale code comment left over from the v1.6.0 refactor
  that no longer matched what the code actually does.

## v1.6.0 — Drive Mode optimizations

- Fixed: the map force-recentered on every single GPS update while
  Drive Mode was on, so panning or zooming to look at something got
  yanked back within seconds. Now it only auto-follows until you
  manually move the map, at which point a "🎯 Recenter" button appears.
- Optimized: Drive Mode's 60-second background refresh used to re-fetch
  all 100 latest posts (including plain news, not just hazards) and
  clear+redraw every pin on the map — wasted Firestore reads and caused
  a visible flicker across the whole map. It now queries only
  hazard-tagged posts and updates just the hazard panel, leaving the
  visible map pins alone.
- Added: live speed (km/h) shown in the Drive Mode panel when the GPS
  provides it.
- Optimized: marker cluster now uses `chunkedLoading` so adding 100+
  pins doesn't block the map for a moment.

## v1.5.0 — Drive Mode

- Added a "Post Type" selector when creating a post: General News / Road
  Damage / Bridge Damage-Closed / Accident / Flooding / Other Hazard.
- Added **Drive Mode** to the Live Map page: continuous GPS tracking
  (`watchPosition`), automatic direction-of-travel detection, and a live
  panel listing road hazards roughly ahead of you with real-time distance.
- Added proximity alerts (vibration + on-screen toast) at 1km and 300m as
  a hazard is approached.
- Hazard posts get distinct colored map pins (🚧🌉🚗🌊⚠️), plus a colored
  badge on the home feed, the nearby-news list, and the post detail page.

## v1.4.0 — Bug fix pass 2

- Fixed: "Load nearby news" listed posts by recency only — it computed a
  distance per post but never actually sorted by it. Now sorts nearest
  first, matching the home feed's behavior.
- Fixed: no file-size limit on post images — very large files could
  freeze the tab during compression. Added a 20MB cap.
- Fixed: deleting a post in the admin panel while on page 2+ left the
  pagination "Prev" button in a stale/incorrect state.
- Fixed: admin date filter silently returned "No posts found" if the end
  date was before the start date, with no explanation. Now shows a clear
  error instead of querying.
- Fixed: the same (0,0)-coordinate bug from map.html was also present in
  news.html's "Open in Google Maps" link for posts without real
  coordinates.
- Fixed: no `overflow-wrap` anywhere in the CSS — a long unbroken string
  (e.g. a pasted URL) in a title/content could overflow its card and
  break the grid layout.
- Added `maxlength` to the title (150) and content (3000) post fields.

## v1.3.0 — UI bug fixes & accessibility

- Fixed: the "Delete" button on the Account page used a `.danger-btn`
  class that was never actually styled — looked identical to a normal
  button, with no visual warning before a destructive action.
- Fixed: `.readonly-input:focus` removed the browser's focus outline
  with no replacement, leaving keyboard users with no visible focus
  indicator. Added a general `:focus-visible` ring across all
  buttons/inputs/links site-wide.
- Fixed: dark mode was incomplete — `.admin-badge` and `.back-btn` had
  no dark-mode styling and stayed bright/light even with dark mode on.
- Fixed: the map's "Loading news pins..." indicator overlapped Leaflet's
  built-in zoom (+/-) controls (both top-left).
- Added: active-page highlighting in the side menu.
- Added: theme toggle icon now reflects state (☀️/🌙 instead of a
  static 🌓).
- Added: Escape key closes the side menu.
- Added: favicon and `theme-color` meta tag on every page.
- Added: `color-scheme` CSS so native browser controls (date picker,
  scrollbar) also render dark when dark mode is on.

## v1.2.0 — Firestore Security Rules

- Added `firestore.rules`, fixing two privilege issues in the original
  rules:
  - Any logged-in user could write `role: "admin"` to their own
    `/users/{uid}` document and grant themselves admin access.
  - Any logged-in user could edit or delete *any* other user's post
    (the rule only checked "are you logged in", not "is this your
    post").
- Rules now restrict `role` changes to existing admins, and restrict
  post edit/delete to the post's own author (or an admin).

## v1.1.0 — Bug fixes & optimization pass 1

- Fixed: stored XSS — post titles/content were inserted via `innerHTML`
  in index.html, map.html, account.html, and admin.html, letting a
  malicious post title execute as HTML/script for every viewer. Switched
  to safe DOM construction / HTML-escaping everywhere.
- Fixed: imported external news without real coordinates was stored at
  (0,0) and plotted on the map as a pile of pins in the ocean.
  map.html now skips those like the other pages already did.
- Fixed: login/signup never redirected on success — the user was left
  looking at the login form after a successful login.
- Fixed: admin.html hardcoded its own incomplete duplicate Firebase
  config instead of the shared `firebaseConfig.js`.
- Fixed: admin.html had no site navigation at all — added the same
  navbar every other page uses.
- Fixed: no double-submit protection — login/signup/post-create buttons
  stayed clickable during the network request.
- Fixed: dead image links left a broken-image icon on screen; now
  hidden automatically.
- Optimized: the image-compression loop re-tried the same quality level
  twice per pass; simplified to one attempt per step.
- Added: marker clustering on the map for readability at scale.
- Added: Enter-key submits the login form.
- Added: loading/busy states on the relevant buttons.

## v1.0.0 — Original upload

Baseline version as uploaded (`i7x-NearbyNews-main.zip`): Firebase
Firestore-backed news app with login/signup, post creation with
geolocation + image upload (ImgBB), a nearby-news feed, a Leaflet map,
an admin panel, and external news import via NewsData.io.
