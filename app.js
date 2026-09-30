// Nearby News & Alert System - Optimized app.js with image compression + reverse geocoding
// App version: 1.8.1 — see CHANGELOG.md for history

document.addEventListener("DOMContentLoaded", () => {
  const $ = (id) => document.getElementById(id);

  const emailInput = $("emailInput");
  const passwordInput = $("passwordInput");
  const signupBtn = $("signupBtn");
  const loginBtn = $("loginBtn");
  const logoutBtn = $("logoutBtn");
  const userInfo = $("userInfo");
  const titleInput = $("titleInput");
  const contentInput = $("contentInput");
  const postTypeInput = $("postTypeInput");
  const imageInput = $("imageInput");
  const postBtn = $("postBtn");
  const loadNearbyBtn = $("loadNearbyBtn");
  const newsList = $("newsList");

  let currentUser = null;
  let db = null;

  // Shared metadata for road-hazard post types (used here and mirrored
  // in index.html / map.html / news.html since this is a plain static
  // site with no shared JS module system).
  const HAZARD_TYPES = {
    road_damage: { label: "Road Damage", emoji: "🚧", color: "#f97316" },
    bridge_damage: { label: "Bridge Damage/Closed", emoji: "🌉", color: "#dc2626" },
    accident: { label: "Accident", emoji: "🚗", color: "#b91c1c" },
    flooding: { label: "Flooding", emoji: "🌊", color: "#0284c7" },
    other_hazard: { label: "Road Hazard", emoji: "⚠️", color: "#ca8a04" }
  };

  // ---------- FIREBASE INIT ----------
  function initFirebase() {
    if (!window.firebase || !window.firebase.initializeApp) {
      if (userInfo) userInfo.textContent = "Firebase SDK not loaded.";
      console.error("Firebase SDK not loaded.");
      return false;
    }
    try {
      // firebaseConfig.js already calls firebase.initializeApp(...)
      db = firebase.firestore();
      return true;
    } catch (e) {
      console.error("Firebase init error:", e);
      if (userInfo) userInfo.textContent = "Firebase init failed.";
      return false;
    }
  }

  if (!initFirebase()) {
    if (postBtn) postBtn.disabled = true;
    if (loadNearbyBtn) loadNearbyBtn.disabled = true;
    return;
  }

  // ---------- HELPERS ----------
  function haversineDistance(lat1, lon1, lat2, lon2) {
    const toRad = (x) => (x * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  function formatDistance(userLat, userLng, loc) {
    if (
      !loc ||
      typeof loc.latitude !== "number" ||
      typeof loc.longitude !== "number"
    ) {
      return "";
    }
    const distKm = haversineDistance(
      userLat,
      userLng,
      loc.latitude,
      loc.longitude
    );
    const roundedKm = Math.round(distKm * 10) / 10;
    const distM = Math.round(distKm * 1000);

    // Hamesha km + meters
    return `${roundedKm} km (${distM} m) away`;
  }

  function setAuthUI(user) {
    currentUser = user;
    if (!userInfo || !signupBtn || !loginBtn || !logoutBtn) return;

    if (user) {
      userInfo.textContent = "Logged in as " + (user.email || "unknown");
      signupBtn.style.display = "none";
      loginBtn.style.display = "none";
      logoutBtn.style.display = "inline-block";
    } else {
      userInfo.textContent = "Not logged in.";
      signupBtn.style.display = "inline-block";
      loginBtn.style.display = "inline-block";
      logoutBtn.style.display = "none";
    }
  }

  function getInputValue(el) {
    return el ? el.value.trim() : "";
  }

  function clearPostForm() {
    if (titleInput) titleInput.value = "";
    if (contentInput) contentInput.value = "";
    if (postTypeInput) postTypeInput.value = "";
    if (imageInput) imageInput.value = "";
  }

  function showAlert(msg) {
    alert(msg);
  }

  // ---------- IMAGE COMPRESSION (~90KB) ----------
  async function compressImageToTargetKB(file, targetKB = 90) {
    const targetBytes = targetKB * 1024;

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");

          const maxDim = 1024;
          let { width, height } = img;

          if (width > height && width > maxDim) {
            height = (height * maxDim) / width;
            width = maxDim;
          } else if (height > width && height > maxDim) {
            width = (width * maxDim) / height;
            height = maxDim;
          }

          canvas.width = width;
          canvas.height = height;
          // Fix: JPEG has no alpha channel, so transparent PNGs/WebPs
          // turned black. Paint a white background first.
          ctx.fillStyle = "#fff";
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);

          // Optimization: the old version re-tried the *same* quality
          // level twice per loop (compress, then immediately compress
          // again at the already-decremented quality before recursing),
          // roughly doubling canvas.toBlob calls for no benefit. This
          // does one attempt per quality step, stepping down until it
          // fits the target size or hits the floor.
          let quality = 0.9;

          const tryCompress = () => {
            canvas.toBlob(
              (blob) => {
                if (!blob) {
                  reject(new Error("Canvas toBlob failed"));
                  return;
                }
                if (blob.size <= targetBytes || quality <= 0.3) {
                  resolve(blob);
                  return;
                }
                quality = Math.max(0.3, quality - 0.1);
                tryCompress();
              },
              "image/jpeg",
              quality
            );
          };

          tryCompress();
        };
        img.onerror = () => reject(new Error("Image load failed"));
        img.src = e.target.result;
      };
      reader.onerror = () => reject(new Error("File read failed"));
      reader.readAsDataURL(file);
    });
  }

  // ---------- IMGBB UPLOAD ----------
  const IMGBB_API_KEY = "626612f93c87680ce07cd7ab1406725c";

  async function uploadToImgBB(file) {
    if (!file) return null;
    if (!IMGBB_API_KEY) {
      console.warn("ImgBB API key not set.");
      return null;
    }

    const compressed = await compressImageToTargetKB(file, 90).catch((e) => {
      console.warn("Compression failed, using original file:", e);
      return null;
    });

    const uploadFile = compressed || file;
    console.log("Upload size (bytes):", uploadFile.size);

    const formData = new FormData();
    formData.append("image", uploadFile);

    const url =
      "https://api.imgbb.com/1/upload?key=" +
      encodeURIComponent(IMGBB_API_KEY);

    const res = await fetch(url, { method: "POST", body: formData });
    if (!res.ok) throw new Error("ImgBB upload failed: " + res.status);
    const data = await res.json();
    if (data && data.data && data.data.url) return data.data.url;
    throw new Error("ImgBB response invalid");
  }

  // ---------- REVERSE GEOCODING (ADDRESS) ----------
  async function fetchAddressFromLatLng(lat, lng) {
    try {
      const url =
        "https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=" +
        encodeURIComponent(lat) +
        "&longitude=" +
        encodeURIComponent(lng) +
        "&localityLanguage=en";

      const res = await fetch(url);
      if (!res.ok) throw new Error("Reverse geocode failed: " + res.status);
      const data = await res.json();

      const locality = data.locality || data.city || "";
      const principalSubdivision = data.principalSubdivision || "";
      const postcode = data.postcode || "";
      const country = data.countryName || "";

      const parts = [];
      if (locality) parts.push(locality);
      if (principalSubdivision) parts.push(principalSubdivision);
      if (postcode) parts.push(postcode);
      if (country) parts.push(country);

      if (parts.length === 0) return null;
      return parts.join(", ");
    } catch (e) {
      console.warn("Reverse geocode error:", e);
      return null;
    }
  }

  // ---------- AUTH ----------
  firebase.auth().onAuthStateChanged(setAuthUI);

  function handleSignup() {
    const email = getInputValue(emailInput);
    const password = getInputValue(passwordInput);
    if (!email || !password) {
      showAlert("Please fill email & password.");
      return;
    }
    // Bug fix: button wasn't disabled during the request, so a slow
    // network + double click could fire this twice.
    if (signupBtn) signupBtn.disabled = true;
    firebase
      .auth()
      .createUserWithEmailAndPassword(email, password)
      .catch((e) => {
        console.error("Signup error:", e);
        showAlert("Signup error: " + e.message);
      })
      .finally(() => {
        if (signupBtn) signupBtn.disabled = false;
      });
  }

  function handleLogin() {
    const email = getInputValue(emailInput);
    const password = getInputValue(passwordInput);
    if (!email || !password) {
      showAlert("Please fill email & password.");
      return;
    }
    if (loginBtn) loginBtn.disabled = true;
    firebase
      .auth()
      .signInWithEmailAndPassword(email, password)
      .catch((e) => {
        console.error("Login error:", e);
        showAlert("Login error: " + e.message);
      })
      .finally(() => {
        if (loginBtn) loginBtn.disabled = false;
      });
  }

  function handleLogout() {
    firebase
      .auth()
      .signOut()
      .catch((e) => {
        console.error("Logout error:", e);
        showAlert("Logout error: " + e.message);
      });
  }

  // ---------- CREATE POST ----------
  function handleCreatePost() {
    if (!currentUser) {
      showAlert("Please login first.");
      return;
    }
    if (!navigator.geolocation) {
      showAlert("Geolocation not supported.");
      return;
    }

    const title = getInputValue(titleInput);
    const content = getInputValue(contentInput);
    const hazardType = postTypeInput ? postTypeInput.value || null : null;
    const file = imageInput?.files?.[0] || null;

    if (!title || !content) {
      showAlert("Please fill title & details.");
      return;
    }
    // Fix: maxlength exists only in the HTML, so it was trivially
    // bypassable. Enforce the same limits in JS.
    if (title.length > 150 || content.length > 3000) {
      showAlert("Title max 150 and details max 3000 characters.");
      return;
    }
    if (file && !file.type.startsWith("image/")) {
      showAlert("Please choose an image file.");
      return;
    }

    // Bug fix: there was no limit on the selected file's size before
    // handing it to canvas-based compression — a very large image
    // (e.g. 40MB raw photo) could freeze the tab for several seconds
    // while the browser decodes/draws it. Reject oversized files early
    // with a clear message instead.
    const MAX_IMAGE_MB = 20;
    if (file && file.size > MAX_IMAGE_MB * 1024 * 1024) {
      showAlert(`Image is too large. Please choose a file under ${MAX_IMAGE_MB}MB.`);
      return;
    }

    // Bug fix: postBtn had no disabled state, so clicking it twice while
    // the (potentially slow) image upload + geolocation lookup was still
    // running created two duplicate posts.
    if (postBtn) {
      postBtn.disabled = true;
      postBtn.textContent = "Posting...";
    }
    const resetPostBtn = () => {
      if (postBtn) {
        postBtn.disabled = false;
        postBtn.textContent = "Post with my location";
      }
    };

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;

        try {
          let imageUrl = null;
          if (file) imageUrl = await uploadToImgBB(file);

          const address = await fetchAddressFromLatLng(lat, lng);

          await db.collection("posts").add({
            title,
            content,
            userId: currentUser.uid,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            location: new firebase.firestore.GeoPoint(lat, lng),
            imageUrl: imageUrl || null,
            address: address || null,
            hazardType: hazardType || null
          });

          showAlert("Post created.");
          clearPostForm();
        } catch (e) {
          console.error("Error creating post:", e);
          showAlert("Error creating post: " + e.message);
        } finally {
          resetPostBtn();
        }
      },
      (err) => {
        console.error("Location error (create post):", err);
        showAlert("Location error: " + err.message);
        resetPostBtn();
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  // ---------- LOAD NEARBY ----------
  function renderPostItem(data, distanceText) {
    const li = document.createElement("li");
    const title = data.title || "No title";
    const content = data.content || "";
    const address = data.address || "";

    const fullContent =
      content.length > 120
        ? content.slice(0, 120).trimEnd() + "..."
        : content;

    // Enhancement: road-hazard posts get a colored badge so they stand
    // out from regular news in the nearby list.
    const hazardMeta = data.hazardType ? HAZARD_TYPES[data.hazardType] : null;
    if (hazardMeta) {
      const badge = document.createElement("span");
      badge.className = "hazard-badge";
      badge.style.background = hazardMeta.color;
      badge.textContent = `${hazardMeta.emoji} ${hazardMeta.label}`;
      li.appendChild(badge);
      li.appendChild(document.createElement("br"));
    }

    let line = `${title} - ${fullContent}`;
    if (distanceText) line += ` (${distanceText})`;
    if (address) line += ` • ${address}`;

    li.appendChild(document.createTextNode(line));

    if (data.imageUrl) {
      const img = document.createElement("img");
      img.src = data.imageUrl;
      img.alt = title || "news image";
      img.className = "news-image";
      img.loading = "lazy";
      // Bug fix: a dead ImgBB link (expired/deleted) used to leave a
      // broken-image icon sitting in the list; just remove it instead.
      img.onerror = () => img.remove();
      li.appendChild(document.createElement("br"));
      li.appendChild(img);
    }
    return li;
  }

  function handleLoadNearby() {
    if (!navigator.geolocation) {
      showAlert("Geolocation not supported.");
      return;
    }
    if (loadNearbyBtn) {
      loadNearbyBtn.disabled = true;
      loadNearbyBtn.textContent = "Loading...";
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const userLat = pos.coords.latitude;
        const userLng = pos.coords.longitude;
        try {
          const snap = await db
            .collection("posts")
            .orderBy("createdAt", "desc")
            .limit(50)
            .get();

          if (!newsList) return;
          newsList.innerHTML = "";

          if (snap.empty) {
            newsList.innerHTML = "<li>No nearby news.</li>";
            return;
          }

          // Bug fix: this button is literally called "Load nearby news"
          // and computes a distance for every post, but never actually
          // sorted by that distance — it just showed the 50 most recent
          // posts in whatever order Firestore returned them, regardless
          // of how far away they were. Sorting nearest-first here
          // matches what index.html's home feed already does.
          const withDistance = snap.docs.map((doc) => {
            const data = doc.data();
            let dKm = Number.POSITIVE_INFINITY;
            if (
              data.location &&
              typeof data.location.latitude === "number" &&
              typeof data.location.longitude === "number"
            ) {
              dKm = haversineDistance(
                userLat,
                userLng,
                data.location.latitude,
                data.location.longitude
              );
            }
            return { data, dKm };
          });
          withDistance.sort((a, b) => a.dKm - b.dKm);

          withDistance.forEach(({ data }) => {
            const distanceText = formatDistance(
              userLat,
              userLng,
              data.location
            );
            const li = renderPostItem(data, distanceText);
            newsList.appendChild(li);
          });
        } catch (e) {
          console.error("Error loading news:", e);
          showAlert("Error loading news: " + e.message);
        } finally {
          if (loadNearbyBtn) {
            loadNearbyBtn.disabled = false;
            loadNearbyBtn.textContent = "Load nearby news";
          }
        }
      },
      (err) => {
        console.error("Location error (load nearby):", err);
        showAlert("Location error: " + err.message);
        if (loadNearbyBtn) {
          loadNearbyBtn.disabled = false;
          loadNearbyBtn.textContent = "Load nearby news";
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
    );
  }

  // ---------- EVENT BINDINGS ----------
  if (signupBtn) signupBtn.addEventListener("click", handleSignup);
  if (loginBtn) loginBtn.addEventListener("click", handleLogin);
  if (logoutBtn) logoutBtn.addEventListener("click", handleLogout);
  if (postBtn) postBtn.addEventListener("click", handleCreatePost);
  if (loadNearbyBtn)
    loadNearbyBtn.addEventListener("click", handleLoadNearby);

  // Enhancement: Enter key in email/password fields logs in, instead of
  // doing nothing (these inputs aren't wrapped in a <form>).
  [emailInput, passwordInput].forEach((el) => {
    if (!el) return;
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !(loginBtn && loginBtn.disabled)) handleLogin();
    });
  });
});
