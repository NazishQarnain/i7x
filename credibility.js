// Credibility assessment (v1.9.0). Combines: text heuristics, an optional
// ML text model (fakenews_model.json, trained with train_fakenews_model.py),
// and community "report" signals. It flags posts that NEED VERIFICATION;
// it cannot prove a post is true or false.
const Credibility = (() => {
  let model = null;
  // Chain-message / clickbait phrases: English, Hinglish and Hindi (Devanagari).
  const CLICKBAIT = new RegExp([
    "shocking", "you won'?t believe", "forward this", "forward (it )?to (all|everyone)",
    "share before", "before it'?s deleted", "100% (true|confirmed)", "they don'?t want you",
    "forward kar(o|do| do)", "sabko (forward|bhejo|bhej do)", "bhej do sabko", "aage bhejo",
    "jaldi share", "share kar(o|do| do)", "delete hone se pehle", "viral kar(o|do| do)",
    "फॉरवर्ड", "शेयर कर(ो|ें)", "सबको भेज(ो|ें)", "डिलीट होने से पहले"
  ].join("|"), "gi");
  const tokenize = (t) => (String(t).toLowerCase().match(/[\p{L}\p{N}_]{2,}/gu) || []);

  const ready = fetch("fakenews_model.json")
    .then((r) => (r.ok ? r.json() : null))
    .then((m) => { model = m; })
    .catch(() => {}); // model is optional

  // ML probability that the text is fake (0..1), or null if no model.
  function mlProb(text) {
    if (!model) return null;
    const counts = {};
    tokenize(text).forEach((w) => { if (model.terms[w]) counts[w] = (counts[w] || 0) + 1; });
    let norm = 0; const vals = [];
    for (const w in counts) {
      const [idf, coef] = model.terms[w];
      const v = (1 + Math.log(counts[w])) * idf; // sublinear tf * idf
      vals.push([v, coef]); norm += v * v;
    }
    norm = Math.sqrt(norm) || 1;
    const z = vals.reduce((s, [v, c]) => s + (v / norm) * c, model.intercept);
    return 1 / (1 + Math.exp(-z));
  }

  function hasValidLocation(p) {
    const l = p.location;
    return !!(l && typeof l.latitude === "number" && !(l.latitude === 0 && l.longitude === 0));
  }

  function heuristics(p) {
    const text = `${p.title || ""} ${p.content || ""}`;
    const letters = text.replace(/[^A-Za-z]/g, "");
    const reasons = []; let r = 0;
    // A real emergency report (hazard type + real GPS location) is often
    // typed in capitals with "!" ("ACCIDENT!!! AVOID ROAD"), so shouting
    // counts for much less there. Chain-message phrases still count fully.
    const emergency = !!p.hazardType && hasValidLocation(p);
    if (letters.length >= 10 && letters.replace(/[^A-Z]/g, "").length / letters.length > 0.5) {
      r += emergency ? 0.1 : 0.3; reasons.push("Mostly capital letters");
    }
    if ((text.match(/!/g) || []).length >= 3) {
      r += emergency ? 0.05 : 0.15; reasons.push("Excessive exclamation marks");
    }
    const hits = new Set((text.match(CLICKBAIT) || []).map((m) => m.toLowerCase()));
    if (hits.size) { r += hits.size >= 2 ? 0.5 : 0.35; reasons.push("Clickbait / chain-message wording"); }
    if (/https?:\/\//i.test(text)) { r += 0.1; reasons.push("Contains external link"); }
    if ((p.content || "").trim().length < 30) { r += 0.15; reasons.push("Very short details"); }
    if (p.hazardType && !hasValidLocation(p)) { r += 0.2; reasons.push("Hazard report without a valid location"); }
    return { risk: Math.min(1, r), reasons };
  }

  // -> { risk 0..1, level: "ok"|"check"|"low", reasons[] }
  function assess(p) {
    // An admin review always wins over automated signals.
    if (p.adminLabel === "fake") return { risk: 1, level: "low", admin: "fake", reasons: ["Reviewed by an admin: likely misleading"], ml: null };
    if (p.adminLabel === "real") return { risk: 0, level: "ok", admin: "real", reasons: [], ml: null };
    const h = heuristics(p); const reasons = h.reasons.slice();
    const ml = mlProb(`${p.title || ""} ${p.content || ""}`);
    if (ml !== null && ml > 0.7) reasons.push("Text resembles known misleading posts");
    const reports = p.reportCount || 0, likes = p.likeCount || 0;
    const comm = Math.min(1, Math.max(0, (reports - 0.5 * likes) / 3));
    if (reports >= 2) reasons.push(`${reports} users reported this post`);
    let risk = ml !== null ? 0.35 * h.risk + 0.35 * ml + 0.3 * comm : Math.min(1, 0.75 * h.risk + 0.5 * comm);
    if (p.userId === "system-news") risk *= 0.5; // imported from a news API
    const level = risk >= 0.5 ? "low" : risk >= 0.25 ? "check" : "ok";
    return { risk, level, reasons, ml };
  }

  // Warning badge element (or null when nothing to warn about).
  function badge(p) {
    const a = assess(p); if (a.level === "ok") return null;
    const el = document.createElement("span");
    el.className = "cred-badge cred-" + a.level;
    el.textContent = a.admin === "fake" ? "🚫 Reviewed: likely misleading"
      : a.level === "low" ? "🚩 Unverified" : "🔎 Check source";
    el.title = a.reasons.join("; ") || "Treat with caution";
    return el;
  }
  return { assess, badge, ready };
})();
