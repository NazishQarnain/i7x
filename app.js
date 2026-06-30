// Nearby News & Alert System - Optimized app.js with image compression + reverse geocoding

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
  const imageInput = $("imageInput");
  const postBtn = $("postBtn");
  const loadNearbyBtn = $("loadNearbyBtn");
  const newsList = $("newsList");

  let currentUser = null;
  let db = null;

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
          ctx.drawImage(img, 0, 0, width, height);

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
  const MAX_TITLE_LEN = 120;
  const MAX_CONTENT_LEN = 2000;
  const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB raw upload cap

  function handleCreatePost() {
    if (!currentUser) {
      showAlert("Please login first.");
      return;
    }
    if (!navigator.geolocation) {
      showAlert("Geolocation not supported.");
      return;
    }

    const title = getInputValue(titleInput).slice(0, MAX_TITLE_LEN);
    const content = getInputValue(contentInput).slice(0, MAX_CONTENT_LEN);
    const file = imageInput?.files?.[0] || null;

    if (!title || !content) {
      showAlert("Please fill title & details.");
      return;
    }

    if (file) {
      if (!file.type || !file.type.startsWith("image/")) {
        showAlert("Please select a valid image file.");
        return;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        showAlert("Image is too large. Please choose a file under 8MB.");
        return;
      }
    }

    if (postBtn) {
      postBtn.disabled = true;
      postBtn.textContent = "Getting location...";
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;

        try {
          if (postBtn) postBtn.textContent = "Posting...";

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
            address: address || null
          });

          showAlert("Post created.");
          clearPostForm();
        } catch (e) {
          console.error("Error creating post:", e);
          showAlert("Error creating post: " + e.message);
        } finally {
          if (postBtn) {
            postBtn.disabled = false;
            postBtn.textContent = "Post with my location";
          }
        }
      },
      (err) => {
        console.error("Location error (create post):", err);
        showAlert("Location error: " + err.message);
        if (postBtn) {
          postBtn.disabled = false;
          postBtn.textContent = "Post with my location";
        }
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

    let line = `${title} - ${fullContent}`;
    if (distanceText) line += ` (${distanceText})`;
    if (address) line += ` • ${address}`;

    li.textContent = line;

    if (data.imageUrl) {
      const img = document.createElement("img");
      img.src = data.imageUrl;
      img.alt = title || "news image";
      img.className = "news-image";
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

          snap.forEach((doc) => {
            const data = doc.data();
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
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  // ---------- EVENT BINDINGS ----------
  if (signupBtn) signupBtn.addEventListener("click", handleSignup);
  if (loginBtn) loginBtn.addEventListener("click", handleLogin);
  if (logoutBtn) logoutBtn.addEventListener("click", handleLogout);
  if (postBtn) postBtn.addEventListener("click", handleCreatePost);
  if (loadNearbyBtn)
    loadNearbyBtn.addEventListener("click", handleLoadNearby);
});
