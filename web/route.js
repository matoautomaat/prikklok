'use strict';

/* A driver's day from the positions his phone took while he was clocked in:
   when he was at the restaurant and at each place on the round (a visit),
   where else he stood still (a stop), the drive in between (a leg: minutes
   and kilometres) and the stretches without any position (a gap: the app was
   closed or the phone had no signal). Used by the driver's own screen and by
   the manager's Ritten page; no DOM, so it can be tested on its own. */

(function (root) {
  const R = 6371000;
  const rad = d => d * Math.PI / 180;

  // Metres between two {lat, lng}, the same formula as app_private.distance_m.
  function distance(a, b) {
    const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2
      + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  const GAP_MIN = 5;         // no position for longer than this: a gap
  const STOP_MIN = 3;        // standing still at least this long outside the places: a stop
  const STOP_M = 60;         // ... within this many metres
  const JITTER_MIN = 3;      // a short hop out of a place and back in is still one visit
  const VAGUE_M = 250;       // a position this unsure says nothing about where he was
  const time = x => new Date(x).getTime();

  // The place a position is at: the closest one whose zone it is in. How unsure
  // the phone is counts in his favour, up to 50 m.
  function placeOf(p, places) {
    if (p.acc != null && p.acc > VAGUE_M) return null;
    let best = null, bestD = Infinity;
    for (const pl of places) {
      const d = distance(p, pl);
      if (d <= pl.radius_m + Math.min(p.acc || 0, 50) && d < bestD) { best = pl; bestD = d; }
    }
    return best;
  }

  // Kilometres along the positions, leaving out jumps no car makes (a bad fix).
  function km(pts) {
    let m = 0;
    for (let i = 1; i < pts.length; i++) {
      const d = distance(pts[i - 1], pts[i]), s = (pts[i].t - pts[i - 1].t) / 1000;
      if (s > 0 && d / s > 55) continue; // faster than 200 km/h
      m += d;
    }
    return m / 1000;
  }

  // One clocked time: entry {id, clock_in, clock_out}, its positions, the places.
  function session(entry, points, places, nowMs) {
    const start = time(entry.clock_in), end = entry.clock_out ? time(entry.clock_out) : nowMs;
    const pts = points.map(p => ({ ...p, t: time(p.at) })).filter(p => p.t >= start - 60000 && p.t <= end + 60000)
      .sort((a, b) => a.t - b.t);
    const good = pts.filter(p => p.acc == null || p.acc <= VAGUE_M);
    for (const p of good) p.place = placeOf(p, places);

    // runs of positions at the same place (or at none)
    let runs = [];
    for (const p of good) {
      const last = runs[runs.length - 1];
      if (last && last.place === p.place) last.pts.push(p);
      else runs.push({ place: p.place, pts: [p] });
    }
    // a short time outside a place between two times in it is one visit
    for (let i = 1; i + 1 < runs.length; i++) {
      const a = runs[i - 1], b = runs[i], c = runs[i + 1];
      if (!b.place && a.place && a.place === c.place && c.pts[0].t - a.pts[a.pts.length - 1].t <= JITTER_MIN * 60000) {
        a.pts.push(...b.pts, ...c.pts);
        runs.splice(i, 2);
        i--;
      }
    }

    const items = [];
    for (const r of runs) {
      const from = r.pts[0].t, to = r.pts[r.pts.length - 1].t;
      if (r.place) { items.push({ type: 'visit', place: r.place, from, to, pts: r.pts }); continue; }
      // standing still outside the places
      const ps = r.pts;
      for (let i = 0; i < ps.length;) {
        let j = i;
        while (j + 1 < ps.length && distance(ps[i], ps[j + 1]) <= STOP_M) j++;
        if (ps[j].t - ps[i].t >= STOP_MIN * 60000) {
          const group = ps.slice(i, j + 1);
          const lat = group.reduce((s, p) => s + p.lat, 0) / group.length, lng = group.reduce((s, p) => s + p.lng, 0) / group.length;
          const gap = group.some((p, k) => k && p.t - group[k - 1].t > GAP_MIN * 60000);
          items.push({ type: 'stop', lat, lng, from: ps[i].t, to: ps[j].t, gap, pts: group });
          i = j + 1;
        } else i++;
      }
    }
    items.sort((a, b) => a.from - b.from);

    // the drive from one place or stop to the next
    const legs = [];
    for (let i = 1; i < items.length; i++) {
      const a = items[i - 1], b = items[i];
      const between = good.filter(p => p.t >= a.to && p.t <= b.from);
      legs.push({ after: i - 1, from: a.to, to: b.from, minutes: (b.from - a.to) / 60000, km: km(between) });
    }

    // stretches without a position while clocked in
    const gaps = [];
    const marks = [start, ...pts.map(p => p.t).filter(t => t > start && t < end), end];
    for (let i = 1; i < marks.length; i++) {
      if (marks[i] - marks[i - 1] > GAP_MIN * 60000) gaps.push({ from: marks[i - 1], to: marks[i] });
    }
    const worked = Math.max(0, end - start) / 60000;
    const unknown = gaps.reduce((s, g) => s + (g.to - g.from) / 60000, 0);
    return {
      entry, start, end, open: !entry.clock_out, points: good, items, legs, gaps,
      km: km(good), minutes: worked,
      known: worked ? Math.max(0, Math.min(1, 1 - unknown / worked)) : 1,
      last: pts.length ? pts[pts.length - 1] : null,
    };
  }

  // Every clocked time with its analysis, oldest first. site: the restaurant
  // ({lat, lng, radius_m}), shown as the place "Restaurant".
  function analyse({ entries, points, checkpoints, site, now = Date.now(), siteName = 'Restaurant' }) {
    const places = [...(site && site.lat != null ? [{ id: 'site', name: siteName, lat: site.lat, lng: site.lng, radius_m: site.radius_m, site: true }] : []),
      ...checkpoints.map(c => ({ ...c }))];
    const byEntry = new Map();
    for (const p of points) {
      if (!byEntry.has(p.entry_id)) byEntry.set(p.entry_id, []);
      byEntry.get(p.entry_id).push(p);
    }
    const sessions = [...entries].sort((a, b) => time(a.clock_in) - time(b.clock_in))
      .map(e => session(e, byEntry.get(e.id) || [], places, now));
    const visited = new Map();
    for (const s of sessions) for (const it of s.items) {
      if (it.type !== 'visit' || it.place.site) continue;
      if (!visited.has(it.place.id)) visited.set(it.place.id, []);
      visited.get(it.place.id).push(it);
    }
    return {
      places, sessions, visited,
      km: sessions.reduce((s, x) => s + x.km, 0),
      minutes: sessions.reduce((s, x) => s + x.minutes, 0),
      known: sessions.length ? sessions.reduce((s, x) => s + x.known * x.minutes, 0) / Math.max(1, sessions.reduce((s, x) => s + x.minutes, 0)) : 1,
    };
  }

  const api = { distance, placeOf, analyse, GAP_MIN, STOP_MIN };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Route = api;
})(typeof window !== 'undefined' ? window : globalThis);
