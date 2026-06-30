# Nearby News & Alert System

A simple web app to create and view **nearby news** based on your real-time location, built with HTML, CSS, JavaScript, Firebase and ImgBB.

## Features

- Email/password authentication (Firebase Auth)
- Create news posts with:
  - Title and description
  - Automatic location (via browser geolocation)
  - Optional image upload (compressed and stored via ImgBB)
- View latest nearby news on the home page
- See distance of each news item from your current location (km + meters)
- Mobile-friendly layout with side navigation

## Tech Stack

- HTML, CSS, Vanilla JavaScript
- Firebase Authentication
- Firebase Firestore (for posts)
- ImgBB (for image hosting)
- Browser Geolocation API

## Project Structure

- `index.html` – Home page showing latest nearby news
- `app.html` – Main app (create post + nearby list)
- `login.html` – Separate login/signup page
- `account.html` – (optional) account-related view
- `app.js` – Core app logic (auth, create post, nearby listing)
- `firebaseConfig.js` – Firebase configuration and initialization
- `nav.js` – Responsive navbar / side menu logic
- `style.css` – Global styles

