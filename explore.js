// Explore recommender (v1.8.0): score = urgency + interest + popularity
// + freshness - already_seen. Interest/seen live in localStorage (works
// logged-out, default cold start); likes/saves sync to Firestore.
const Explore = (() => {
  const W = { urgency: 0.4, interest: 0.3, popularity: 0.15, freshness: 0.15 };
  const SEVERITY = { accident: 1, bridge_damage: 0.9, flooding: 0.9, road_damage: 0.6, other_hazard: 0.4 };
  const URGENT_KM = 15, CLOSE_KM = 2, URGENT_HRS = 24;
  const SEEN_PENALTY = 0.5;
  const DELTA = { open: 1, like: 3, save: 4, dismiss: -5 };

  const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const cat = (p) => p.hazardType || "general";

  function km(a, b, c, d) {
    const r = (x) => (x * Math.PI) / 180, dLa = r(c - a), dLo = r(d - b);
    const h = Math.sin(dLa / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(dLo / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }
  function markSeen(id) {
    const s = read("i7x_seen", []).filter((x) => x !== id); s.push(id);
    write("i7x_seen", s.slice(-300));
  }
  function bump(post, type) {
    const w = read("i7x_interest", {}); const c = cat(post);
    w[c] = Math.max(-10, Math.min(30, (w[c] || 0) + DELTA[type])); write("i7x_interest", w);
  }
  function dismiss(id, post) {
    const d = read("i7x_hidden", []); if (!d.includes(id)) d.push(id);
    write("i7x_hidden", d.slice(-300)); bump(post, "dismiss");
  }
  function score(id, p, loc) {
    const ageH = p.createdAt && p.createdAt.toDate ? (Date.now() - p.createdAt.toDate()) / 36e5 : 999;
    const w = read("i7x_interest", {});
    const interest = 1 - Math.exp(-Math.max(0, w[cat(p)] || 0) / 5); // 0 on cold start
    const popularity = Math.min(1, Math.log(1 + (p.likeCount || 0)) / Math.log(21));
    const freshness = Math.pow(0.5, ageH / 48);
    let urgency = 0;
    const sev = SEVERITY[p.hazardType] || 0;
    const l = p.location;
    if (sev && loc && l && typeof l.latitude === "number" && !(l.latitude === 0 && l.longitude === 0) && ageH < URGENT_HRS) {
      const d = km(loc.lat, loc.lng, l.latitude, l.longitude);
      const prox = d <= CLOSE_KM ? 1 : d >= URGENT_KM ? 0 : 1 - (d - CLOSE_KM) / (URGENT_KM - CLOSE_KM);
      const rec = ageH <= 6 ? 1 : 1 - (ageH - 6) / (URGENT_HRS - 6);
      urgency = sev * prox * rec;
    }
    const seen = read("i7x_seen", []).includes(id) ? SEEN_PENALTY : 0;
    return { urgency, total: W.urgency * urgency + W.interest * interest + W.popularity * popularity + W.freshness * freshness - seen };
  }
  // docs: Firestore docs. Returns { urgent, forYou } (hidden posts removed).
  function rank(docs, loc) {
    const hidden = read("i7x_hidden", []);
    const rows = docs.filter((d) => !hidden.includes(d.id)).map((d) => {
      const s = score(d.id, d.data(), loc); return { doc: d, ...s };
    });
    const urgent = rows.filter((r) => r.urgency > 0).sort((a, b) => b.urgency - a.urgency).slice(0, 5);
    const ids = new Set(urgent.map((r) => r.doc.id));
    const forYou = rows.filter((r) => !ids.has(r.doc.id)).sort((a, b) => b.total - a.total);
    return { urgent: urgent.map((r) => r.doc), forYou: forYou.map((r) => r.doc) };
  }
  async function fetchCandidates(db) {
    const since = firebase.firestore.Timestamp.fromMillis(Date.now() - 7 * 864e5);
    const snap = await db.collection("posts").where("createdAt", ">=", since).orderBy("createdAt", "desc").limit(100).get();
    return snap.docs;
  }
  // Per-user liked/saved ids: fetched ONCE per session (2 reads total)
  // instead of 2 reads per card, then shared by every card.
  let userState = null;
  const repaints = [];
  let authHooked = false;
  function hookAuth() {
    if (authHooked || !firebase.auth) return;
    authHooked = true;
    firebase.auth().onAuthStateChanged(() => { userState = null; repaints.forEach((f) => f()); });
  }
  function loadUserState(db, u) {
    if (userState && userState.uid === u.uid) return userState.ready;
    const st = { uid: u.uid, likes: new Set(), saves: new Set() };
    const col = (n) => db.collection("users").doc(u.uid).collection(n).get();
    st.ready = Promise.all([col("likes"), col("saves")]).then(([l, s]) => {
      l.forEach((d) => st.likes.add(d.id)); s.forEach((d) => st.saves.add(d.id)); return st;
    }).catch((e) => { console.warn("Explore state:", e); return st; });
    userState = st; return st.ready;
  }
  // Like/Save/Not-interested bar. `onDismiss` lets the caller remove the card.
  function mountActions(el, db, id, post, onDismiss) {
    hookAuth();
    const bar = document.createElement("div"); bar.className = "explore-actions";
    const mk = (t) => { const b = document.createElement("button"); b.type = "button"; b.className = "explore-btn"; b.textContent = t; bar.appendChild(b); return b; };
    const likeB = mk("👍 Like"), saveB = mk("🔖 Save"), hideB = onDismiss ? mk("🚫 Not interested") : null;
    let liked = false, saved = false;
    const paint = () => {
      likeB.textContent = (liked ? "👍 Liked" : "👍 Like") + (post.likeCount ? " · " + post.likeCount : "");
      saveB.textContent = saved ? "🔖 Saved" : "🔖 Save";
    };
    const repaint = async () => {
      const u = firebase.auth().currentUser;
      if (u) { const st = await loadUserState(db, u); liked = st.likes.has(id); saved = st.saves.has(id); }
      else { liked = false; saved = false; }
      paint();
    };
    repaints.push(repaint); paint(); repaint();
    const needUser = async () => {
      const u = firebase.auth().currentUser;
      if (!u) { alert("Please login first (Login / Signup in the menu)."); return null; }
      return { u, st: await loadUserState(db, u) };
    };
    bar.addEventListener("click", (e) => e.stopPropagation());
    likeB.addEventListener("click", async () => {
      const c = await needUser(); if (!c) return;
      likeB.disabled = true;
      try {
        const ref = db.collection("posts").doc(id);
        const lr = db.collection("users").doc(c.u.uid).collection("likes").doc(id);
        const b = db.batch(), inc = firebase.firestore.FieldValue.increment;
        if (liked) { b.delete(lr); b.update(ref, { likeCount: inc(-1) }); }
        else { b.set(lr, { at: firebase.firestore.FieldValue.serverTimestamp() }); b.update(ref, { likeCount: inc(1) }); }
        await b.commit();
        post.likeCount = Math.max(0, (post.likeCount || 0) + (liked ? -1 : 1));
        if (liked) c.st.likes.delete(id); else { c.st.likes.add(id); bump(post, "like"); }
        liked = !liked; paint();
      } catch (e) { alert("Couldn't update like: " + e.message); }
      likeB.disabled = false;
    });
    saveB.addEventListener("click", async () => {
      const c = await needUser(); if (!c) return;
      saveB.disabled = true;
      try {
        const r = db.collection("users").doc(c.u.uid).collection("saves").doc(id);
        if (saved) { await r.delete(); c.st.saves.delete(id); }
        else { await r.set({ at: firebase.firestore.FieldValue.serverTimestamp() }); c.st.saves.add(id); bump(post, "save"); }
        saved = !saved; paint();
      } catch (e) { alert("Couldn't update save: " + e.message); }
      saveB.disabled = false;
    });
    if (hideB) hideB.addEventListener("click", () => { dismiss(id, post); onDismiss(); });
    el.appendChild(bar);
  }
  return { rank, fetchCandidates, mountActions, markSeen, bump };
})();
