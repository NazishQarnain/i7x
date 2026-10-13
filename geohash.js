// Minimal geohash helper (v1.11.0). Lets Firestore answer "posts near me"
// with cheap prefix-range queries instead of reading only the latest posts.
const Geohash = (() => {
  const B32 = "0123456789bcdefghjkmnpqrstuvwxyz";

  function encode(lat, lng, precision) {
    precision = precision || 9;
    let latR = [-90, 90], lngR = [-180, 180];
    let idx = 0, bit = 0, even = true, hash = "";
    while (hash.length < precision) {
      const r = even ? lngR : latR, v = even ? lng : lat, mid = (r[0] + r[1]) / 2;
      if (v >= mid) { idx = idx * 2 + 1; r[0] = mid; } else { idx = idx * 2; r[1] = mid; }
      even = !even;
      if (++bit === 5) { hash += B32[idx]; bit = 0; idx = 0; }
    }
    return hash;
  }

  // The point's own cell plus its 8 neighbours at `precision`
  // (precision 5 -> cells of about 4.9 km, so roughly a 15 km wide area).
  function around(lat, lng, precision) {
    precision = precision || 5;
    const latBits = Math.floor((precision * 5) / 2), lngBits = Math.ceil((precision * 5) / 2);
    const dLat = 180 / Math.pow(2, latBits), dLng = 360 / Math.pow(2, lngBits);
    const out = new Set();
    for (let y = -1; y <= 1; y++) {
      for (let x = -1; x <= 1; x++) {
        const la = Math.max(-89.999999, Math.min(89.999999, lat + y * dLat));
        let ln = lng + x * dLng;
        if (ln > 180) ln -= 360; if (ln < -180) ln += 360;
        out.add(encode(la, ln, precision));
      }
    }
    return Array.from(out);
  }
  return { encode, around };
})();
