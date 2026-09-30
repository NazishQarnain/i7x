# i7x — Nearby News & Alert System

**Current version: v1.8.1** · see [CHANGELOG.md](CHANGELOG.md)

A location-aware news and hazard-alert web app. People post local news (with photo and GPS location), browse what's happening near them, see it all on a live map, and get proximity alerts for road hazards while driving.

Built with plain HTML, CSS and JavaScript on top of Firebase. No build step, no framework.

## Features

### News
- Email/password sign-up and login (Firebase Auth)
- Create posts with a title (max 150 chars), description (max 3000 chars), automatic GPS location with reverse-geocoded address, and an optional image (client-side compression, 20 MB file cap, hosted on ImgBB)
- Home feed of the latest posts, sorted nearest-first with distance shown in km/m
- "Load nearby news" list on the app page, also sorted nearest-first
- Post detail page with an "Open in Google Maps" link
- Account page with your profile and **My Posts** (open or delete your own)

### Explore (recommender)
Home has **Nearby** and **Explore** tabs. Explore shows "⚠️ Abhi zaroori" (urgent hazards near you) and "✨ Tumhare liye" (ranked by `0.4·urgency + 0.3·interest + 0.15·popularity + 0.15·freshness − already_seen`). Like, Save and Not interested feed your interest profile (kept in localStorage). Logic lives in `explore.js`.

### Post types and hazards
Each post can be tagged as: General News, Road Damage, Bridge Damage/Closed, Accident, Flooding, or Other Hazard. Hazard posts get a colored badge in every list and a distinct map pin (🚧 🌉 🚗 🌊 ⚠️).

### Live Map
- Leaflet + OpenStreetMap, with marker clustering for dense areas
- **Drive Mode**: continuous GPS tracking, screen wake lock, direction-of-travel detection, a live panel of hazards roughly ahead with real-time distance, live speed (when GPS provides it), and vibration + on-screen alerts at 1 km and 300 m
- Map auto-follows you until you pan or zoom, then shows a **🎯 Recenter** button
- Hazards refresh every 60 seconds without redrawing the whole map

### Admin panel
- Restricted to accounts with `role: "admin"` in their `/users/{uid}` document
- Paginated post list with date-range filter and delete
- One-click import of 60 latest headlines from NewsData.io (external links only, stored as `system-news` posts)

### UI
Responsive layout with a side menu, light/dark theme toggle (remembers your choice and follows the system setting by default), keyboard-visible focus styles, and the app version shown at the bottom of the menu.

## Tech stack

| Area | Tech |
| --- | --- |
| Frontend | HTML, CSS, vanilla JavaScript |
| Auth and database | Firebase Authentication, Cloud Firestore (Firebase JS SDK v8.10.1) |
| Maps | Leaflet 1.9.4, Leaflet.markercluster 1.5.3, OpenStreetMap tiles |
| Image hosting | ImgBB |
| Reverse geocoding | BigDataCloud client API |
| External news | NewsData.io |
| Browser APIs | Geolocation (`getCurrentPosition`, `watchPosition`), Vibration |

## Project structure

```
index.html        Home feed (latest 20 posts, nearest first)
app.html          Create a post + nearby news list
news.html         Single post detail (news.html?id=<postId>)
map.html          Live map + Drive Mode
account.html      Profile and My Posts
login.html        Login / sign-up
admin.html        Admin panel (filter, delete, NewsData.io import)
explore.js        Explore scoring, likes/saves, interest profile
app.js            Core logic: auth, post creation, ImgBB upload, nearby list
nav.js            Side menu, theme toggle, version label (APP_VERSION)
firebaseConfig.js Firebase config, shared by all pages
firestore.rules   Firestore security rules
style.css         Global styles, including dark mode
CHANGELOG.md      Version history
```

## Data model

**`/posts/{postId}`**: `title`, `content`, `userId`, `location` (GeoPoint), `address`, `imageUrl` (nullable), `hazardType` (nullable), `createdAt`. Imported posts use `userId: "system-news"`.

**`/users/{uid}`**: profile data plus an optional `role`. Only `role == "admin"` is recognized.

## Security rules

`firestore.rules` enforces:
- Anyone can read posts (public feed)
- Creating a post requires sign-in, a non-empty title and content, and `userId` equal to your own uid (admins may also write `system-news`)
- Signed-in users may change only `likeCount` (±1); likes and saves are per-user
- Only a post's author or an admin can edit or delete it
- Users can read and edit their own profile but can never set their own `role`; only admins can change roles

The client-side admin check and these rules both use the same condition (`role === "admin"`), so the UI and the server agree.

## Setup

1. **Clone or download** the repo. There is nothing to install.
2. **Firebase**
   - Create a Firebase project and enable **Email/Password** sign-in under Authentication.
   - Create a Firestore database.
   - Paste your web app config into `firebaseConfig.js`.
   - Deploy `firestore.rules` (Firebase console → Firestore → Rules, or `firebase deploy --only firestore:rules`).
3. **Firestore index**: the admin date filter and hazard query combine ordering and filters, so Firestore may ask you to create a composite index. Open the link it prints in the browser console.
4. **API keys** (both are optional; features degrade gracefully if unset)
   - ImgBB: set `IMGBB_API_KEY` in `app.js` for image uploads.
   - NewsData.io: set `NEWSDATA_API_KEY` in `admin.html` for the headline import.
5. **Make yourself admin**: sign up in the app, then in the Firestore console set `role: "admin"` on your `/users/{uid}` document.
6. **Run locally**: serve the folder over HTTP, e.g. `npx serve` or `python -m http.server`. Geolocation needs HTTPS or `localhost`, so opening the files directly will not work.

## Security notes

- Firebase web config values are designed to be public, but restrict your API key by HTTP referrer in the Google Cloud console and rely on the Firestore rules for protection.
- The ImgBB and NewsData.io keys are currently in client-side code, so anyone can read them. Treat them as low-privilege keys, restrict or rotate them if abused, and consider moving those calls behind a small backend (e.g. a Cloud Function) later.
- Post text is rendered with safe DOM construction or HTML-escaping, not raw `innerHTML`.

## Versioning

The version lives in `APP_VERSION` at the top of `nav.js` and is shown in the side menu. When you ship a meaningful set of changes, bump it and add an entry to `CHANGELOG.md`.
