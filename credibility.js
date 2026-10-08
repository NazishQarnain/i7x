// Credibility assessment (v1.9.0). Combines: text heuristics, an optional
// ML text model (fakenews_model.json, trained with train_fakenews_model.py),
// and community "report" signals. It flags posts that NEED VERIFICATION;
// it cannot prove a post is true or false.
const Credibility = (() => {
  let model = null;
  const CLICKBAIT = /(shocking|you won't believe|you wont believe|forward this|share before|before it'?s deleted|100% (true|confirmed)|breaking!!|they don'?t want you)/i;
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

  function heuristics(p) {
    const text = `${p.title || ""} ${p.content || ""}`;
    const letters = text.replace(/[^A-Za-z]/g, "");
    const reasons = []; let r = 0;
    if (letters.length >= 10 && letters.replace(/[^A-Z]/g, "").length / letters.length > 0.5) { r += 0.3; reasons.push("Mostly capital letters"); }
    if ((text.match(/!/g) || []).length >= 3) { r += 0.15; reasons.push("Excessive exclamation marks"); }
    if (CLICKBAIT.test(text)) { r += 0.3; reasons.push("Clickbait / chain-message wording"); }
    if (/https?:\/\//i.test(text)) { r += 0.1; reasons.push("Contains external link"); }
    if ((p.content || "").trim().length < 30) { r += 0.15; reasons.push("Very short details"); }
    const l = p.location;
    if (p.hazardType && (!l || (l.latitude === 0 && l.longitude === 0))) { r += 0.2; reasons.push("Hazard report without a valid location"); }
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
    let risk = ml !== null ? 0.35 * h.risk + 0.35 * ml + 0.3 * comm : 0.5 * h.risk + 0.5 * comm;
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
