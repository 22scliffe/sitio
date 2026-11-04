/* Sitio – web app (v0). Plain JS, no build step.
   Data lives in this browser (localStorage + IndexedDB for photos) until Supabase is connected. */
(() => {
'use strict';
const CFG = window.SITIO_CONFIG || {};
const { CATS, CUISINES, PRICE_WORDS, ICON, ART, SAMPLE } = window.SITIO;
const STORE_KEY = 'sitio.v1';
const DEFAULT_ME = { lat: 40.4168, lng: -3.7038 }; // Puerta del Sol, used until location is allowed

/* ---------- helpers ---------- */
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => 'p-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const catOf = (id) => CATS.find(c => c.id === id) || CATS[0];
const icon = (name, fill = 'none', stroke = 'currentColor') => ICON[name].replace(/FILL/g, fill).replace(/STROKE/g, stroke);
const toMin = (t) => { const [h, m] = String(t).split(':').map(Number); return (h % 24) * 60 + (m || 0); };
const fmtMin = (m) => { m = ((m % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };

/* ---------- storage ---------- */
// Starters carry updatedAt 1 ("never edited"), so a fresh phone's copies never overwrite edits saved in the account
const starters = () => SAMPLE.places.map(p => Object.assign({}, p, { sample: true, hours: null, hoursSrc: 'osm', hoursAt: 0, addedAt: Date.now(), updatedAt: 1 }));
function loadDb() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* storage unavailable */ }
  return {
    user: { name: '', photo: null },
    settings: { hours: true, darkMap: true, dirApp: 'google' },
    cities: SAMPLE.cities.slice(),
    currentCityId: SAMPLE.cities[0].id,
    places: starters(),
    sample: true,
    v: 12,
    tourDone: false
  };
}
let snap = null; // id -> place JSON, used to notice edits/deletes for syncing
let db = loadDb();
// v2: older installs had 18 sample places; swap them for the single example spot
if (!db.v || db.v < 2) {
  const hadSample = db.places.some(x => x.sample);
  db.places = db.places.filter(x => !x.sample);
  if (hadSample) db.places.unshift(...starters());
  db.v = 2; save();
}
// v3: one-off clean-up for the very first test install
if (db.v < 3) {
  if (false) {
    const now = Date.now();
    db.places = [
      { id: 'p-pez-tortilla', cityId: 'c-madrid', name: 'Pez Tortilla', cat: 'bar', cuisine: '', lat: 40.41085, lng: -3.70945, area: 'La Latina', status: 'spot', price: 1, note: 'Tapas bar. Tortilla and croquetas.', photos: [], hours: null, hoursSrc: 'osm', hoursAt: 0, googleId: null, addedAt: now },
      { id: 'p-leinerhaus', cityId: 'c-madrid', name: 'Leinerhaus', cat: 'bar', cuisine: '', lat: 40.42175, lng: -3.70395, area: 'Centro', status: 'totry', price: 1, note: 'La Casa Alemana.', photos: [], hours: null, hoursSrc: 'osm', hoursAt: 0, googleId: null, addedAt: now - 1 }
    ];
    db.sample = false;
  }
  db.v = 3; save();
}
// v4: Leinerhaus is a bar, €
if (db.v < 4) {
  const l = db.places.find(x => x.id === 'p-leinerhaus');
  if (l) Object.assign(l, { cat: 'bar', cuisine: '', price: 1 });
  db.v = 4; save();
}
// v5: anyone still on the old example spot gets the two starter places instead
if (db.v < 5) {
  if (db.places.some(x => x.sample)) db.places = db.places.filter(x => !x.sample).concat(starters());
  db.v = 5; save();
}
// v6: early test installs had a default name; clear it so everyone sets their own
if (db.v < 6) {
  // (default name no longer used)
  db.v = 6; save();
}
// v7: "Start fresh" removed from settings; bring the starter places back if they were cleared
if (db.v < 7) {
  const st = starters().filter(s => !db.places.some(p => p.id === s.id || p.name === s.name));
  if (st.length) { db.places = db.places.concat(st); if (db.deleted) st.forEach(s => delete db.deleted[s.id]); }
  db.v = 7; save();
}
// v8: cities get map coordinates; cuisine list simplified
if (db.v < 8) {
  db.cities.forEach(c => { if (c.id === 'c-madrid' && c.lat == null) Object.assign(c, { lat: 40.4168, lng: -3.7038, cc: 'ES' }); });
  const map = { Japanese: 'Asian', Chinese: 'Asian', Korean: 'Asian', Thai: 'Asian', Vietnamese: 'Asian', Lebanese: 'Eastern', Peruvian: 'Other' };
  db.places.forEach(p => { if (map[p.cuisine]) p.cuisine = map[p.cuisine]; });
  db.v = 8; save();
}
if (db.v < 10) { db.cities.forEach(c => { if (/^(City of Westminster|City of London|Westminster)$/i.test(c.name)) c.name = 'London'; }); if (db.v >= 9) { db.v = 10; save(); } }
if (db.v < 12) { db.places.forEach(p => { if (p.photos && p.photos.length) { p.memories = (p.memories || []).concat(p.photos.map(id => ({ id, at: p.addedAt || Date.now() }))); p.photos = []; } }); if (db.v >= 11) { db.v = 12; save(); } }
if (db.v < 11) { if (db.tourDone === undefined) db.tourDone = db.places.some(x => !x.sample) || !!localStorage.getItem('sitio.auth'); if (db.v >= 10) { db.v = 11; save(); } }
if (db.v < 9) { db.places.forEach(p => { if (p.cuisine) p.cuisine = cuisList(p).map(q => q === 'Eastern' ? 'Middle Eastern' : q).join(', '); }); db.v = 9; save(); }
// Notification types: recaps and friends on, events (promotional) off until switched on
db.settings = db.settings || {}; if (db.settings.nRecaps === undefined) db.settings.nRecaps = true; if (db.settings.nFriends === undefined) db.settings.nFriends = true; if (db.settings.nEvents === undefined) db.settings.nEvents = false;
const hasSample = () => db.places.some(x => x.sample);
function save() { if (snap) stamp(); try { localStorage.setItem(STORE_KEY, JSON.stringify(db)); } catch (e) { flash('Couldn’t save on this device. Storage may be full.'); } if (snap) queuePush(); }
const pj = p => { const { updatedAt, ...r } = p; return JSON.stringify(r); };
let metaSnap = '';
const metaJson = () => JSON.stringify([db.user, db.settings, db.cities, db.currentCityId]);
function resnap() { snap = {}; db.places.forEach(p => { snap[p.id] = pj(p); }); metaSnap = metaJson(); }
// Stamp edited places with a time, remember deleted ones, so two phones can be merged correctly
function stamp() {
  const now = Date.now(), seen = {}; db.deleted = db.deleted || {};
  db.places.forEach(p => { let j = pj(p); if (p.sample && snap[p.id] !== undefined && snap[p.id] !== j) { delete p.sample; j = pj(p); } seen[p.id] = j; if (snap[p.id] !== j || !p.updatedAt) p.updatedAt = snap[p.id] === undefined ? (p.updatedAt || now) : now; });
  Object.keys(snap).forEach(id => { if (!seen[id]) db.deleted[id] = now; });
  Object.keys(db.deleted).forEach(id => { if (now - db.deleted[id] > 120 * 864e5) delete db.deleted[id]; });
  snap = seen;
  const m = metaJson(); if (m !== metaSnap) { db.metaAt = now; metaSnap = m; }
}

// Photos in IndexedDB (blobs), referenced by id from place.photos / user.photo
const idb = (() => {
  let dbp = null;
  const open = () => dbp || (dbp = new Promise((res, rej) => {
    try {
      const r = indexedDB.open('sitio-photos', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('photos');
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    } catch (e) { rej(e); }
  }));
  const tx = (mode, fn) => open().then(d => new Promise((res, rej) => { const t = d.transaction('photos', mode); const s = t.objectStore('photos'); const out = fn(s); t.oncomplete = () => res(out && out.result); t.onerror = () => rej(t.error); }));
  return {
    put: (id, blob) => tx('readwrite', s => s.put(blob, id)),
    get: (id) => tx('readonly', s => s.get(id)),
    del: (id) => tx('readwrite', s => s.delete(id))
  };
})();
const photoUrls = {};
function photoUrl(id) {
  if (photoUrls[id]) return photoUrls[id];
  photoUrls[id] = '';
  idb.get(id).then(b => { if (b) { photoUrls[id] = URL.createObjectURL(b); render(); } else if (typeof cloudPhoto === 'function') cloudPhoto(id); }).catch(() => {});
  return '';
}
function thumbUrl(blob, size = 160) {
  return new Promise(res => { const img = new Image(); const u = URL.createObjectURL(blob);
    img.onload = () => { const c = document.createElement('canvas'); c.width = c.height = size; const s = Math.min(img.width, img.height); c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size); URL.revokeObjectURL(u); res(c.toDataURL('image/jpeg', 0.8)); };
    img.onerror = () => res(null); img.src = u; });
}
function compress(file, max = 1000) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(b => b ? res(b) : rej(new Error('compress failed')), 'image/jpeg', 0.78);
      URL.revokeObjectURL(img.src);
    };
    img.onerror = rej; img.src = URL.createObjectURL(file);
  });
}

/* ---------- hours ---------- */
function weekFrom(open, close) { const r = [[toMin(open), toMin(close)]]; return [r, r, r, r, r, r, r]; }
// Parses common OpenStreetMap opening_hours ("Mo-Fr 09:00-20:00; Sa,Su 10:00-01:00", "24/7", "13:00-23:30")
function parseOH(str) {
  if (!str) return null;
  str = String(str).trim();
  if (str === '24/7') { const r = [[0, 1440]]; return [r, r, r, r, r, r, r]; }
  const D = ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'];
  const week = [[], [], [], [], [], [], []];
  let any = false;
  for (let part of str.split(';')) {
    part = part.trim(); if (!part) continue;
    const m = part.match(/^([A-Za-z,\- ]+?)?\s*((?:\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}\s*,?\s*)+|off|closed)$/i);
    if (!m) continue;
    let days = [0, 1, 2, 3, 4, 5, 6];
    if (m[1] && m[1].trim()) {
      days = [];
      for (const seg of m[1].toLowerCase().replace(/\s/g, '').split(',')) {
        const [a, b] = seg.split('-'); const ia = D.indexOf(a.slice(0, 2)); const ib = b ? D.indexOf(b.slice(0, 2)) : ia;
        if (ia < 0 || ib < 0) continue;
        for (let i = ia; ; i = (i + 1) % 7) { days.push(i); if (i === ib) break; }
      }
    }
    const spec = m[2].toLowerCase();
    const ranges = (spec === 'off' || spec === 'closed') ? [] : spec.split(',').map(r => r.trim()).filter(Boolean).map(r => { const [a, b] = r.split('-').map(s => s.trim()); return [toMin(a), toMin(b)]; });
    days.forEach(d => { week[d] = ranges; }); any = true;
  }
  return any ? week : null;
}
// Returns { open: bool, text } or null when unknown
function status(p, now = new Date()) {
  if (!db.settings.hours || !p.hours) return null;
  const day = (now.getDay() + 6) % 7, prev = (day + 6) % 7, t = now.getHours() * 60 + now.getMinutes();
  for (const [o, c] of p.hours[day] || []) {
    if (c > o ? (t >= o && t < c) : (t >= o)) return { open: true, text: 'Open · until ' + fmtMin(c) };
  }
  for (const [o, c] of p.hours[prev] || []) {
    if (c <= o && t < c) return { open: true, text: 'Open · until ' + fmtMin(c) };
  }
  const later = (p.hours[day] || []).map(r => r[0]).filter(o => o > t).sort((a, b) => a - b)[0];
  if (later != null) return { open: false, text: 'Closed · opens ' + fmtMin(later) };
  for (let i = 1; i <= 7; i++) { const r = p.hours[(day + i) % 7]; if (r && r.length) return { open: false, text: 'Closed · opens ' + (i === 1 ? 'tomorrow ' : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][(day + i) % 7] + ' ') + fmtMin(r[0][0]) }; }
  return { open: false, text: 'Closed' };
}

/* ---------- geography ---------- */
let me = Object.assign({}, DEFAULT_ME), haveLocation = false;
function dist(p) {
  const R = 6371000, toR = Math.PI / 180;
  const dLat = (p.lat - me.lat) * toR, dLng = (p.lng - me.lng) * toR;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(me.lat * toR) * Math.cos(p.lat * toR) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
const fmtDist = (m) => m < 1000 ? Math.round(m / 10) * 10 + ' m' : (m / 1000).toFixed(1) + ' km';
const AT = (() => { const m = (location.search.match(/[?&]at=(-?[\d.]+),(-?[\d.]+)/) || []); return m[1] ? { lat: +m[1], lng: +m[2] } : null; })();
function locate(center) {
  if (AT) { const first = !haveLocation; me = Object.assign({}, AT); haveLocation = true; if (center || (first && nearCity())) mapApi.center(me); if (first) whereAmI(); render(); return; }
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(pos => {
    const first = !haveLocation;
    me = { lat: pos.coords.latitude, lng: pos.coords.longitude }; haveLocation = true;
    if (center || (first && nearCity())) mapApi.center(me);
    if (first) whereAmI();
    render();
  }, () => { if (center) flash('Location is off. Allow it in Settings to see spots near you.'); }, { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 });
}

/* ---------- install (add to home screen) ---------- */
const UA = navigator.userAgent || '';
const PREVIEW = (location.search.match(/[?&]preview=([\w-]+)/) || [])[1] || '';
const IS_IOS = PREVIEW ? PREVIEW.startsWith('ios') : (/iPhone|iPad|iPod/.test(UA) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
const IS_ANDROID = PREVIEW ? PREVIEW.startsWith('android') : /Android/i.test(UA);
const IN_APP = !PREVIEW && /FBAN|FBAV|Instagram|Line\/|Snapchat|TikTok|LinkedInApp|GSA\//.test(UA);
const IOS26 = PREVIEW === 'ios' ? true : PREVIEW === 'ios-old' ? false : +((UA.match(/Version\/(\d+)/) || [])[1] || 0) >= 26;
const IOS_OTHER = !PREVIEW && IS_IOS && /CriOS|FxiOS|EdgiOS/.test(UA);
let STANDALONE = false; try { STANDALONE = !PREVIEW && (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true); } catch (e) { }
let installPrompt = PREVIEW === 'android' ? { prompt() { flash('Preview: on a real Android phone, Chrome now asks “Install Sitio?”'); }, userChoice: new Promise(() => {}) } : null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); if (!PREVIEW) { installPrompt = e; render(); } });
window.addEventListener('appinstalled', () => { ui.installed = true; installPrompt = null; render(); });
const appUrl = () => location.origin + location.pathname;
function skipInstallStored() { try { return sessionStorage.getItem('sitio.skipInstall') === '1'; } catch (e) { return false; } }

/* ---------- UI state ---------- */
const ui = {
  tab: 'home', filter: [], menu: null, cuisineOpen: false, selected: null,
  sheet: null, page: null, dialog: null, toast: null,
  spotsOpenNow: true, spotsSearch: '', tryNewest: false, expand: {}, add: null,
  install: !!PREVIEW || (!STANDALONE && !skipInstallStored()), installed: false
};
const city = () => db.cities.find(c => c.id === db.currentCityId) || db.cities[0];
const cur = () => (city() && city().currency) || '€';
// Centre of a city: where it was found, else the middle of its places
function cityCentre(c) {
  c = c || city(); if (!c) return null;
  if (c.lat != null) return { lat: c.lat, lng: c.lng };
  const ps = db.places.filter(p => p.cityId === c.id); if (!ps.length) return null;
  return { lat: ps.reduce((s, x) => s + x.lat, 0) / ps.length, lng: ps.reduce((s, x) => s + x.lng, 0) / ps.length };
}
// Filter cities by city or country name; sorted by country then city so same-named towns stay apart
function cityFilter(list, q) {
  q = (q || '').trim().toLowerCase(); const out = !q ? list.slice() : list.filter(c => (c.name || '').toLowerCase().includes(q) || (c.country || '').toLowerCase().includes(q) || (c.cc || '').toLowerCase() === q);
  return q ? out.sort((a, b) => (a.country || '').localeCompare(b.country || '') || a.name.localeCompare(b.name)) : out;
}
const nearCity = () => { const cc = cityCentre(); return !cc || !haveLocation || dist(cc) < 50000; };
const cityPlaces = () => ui.globe ? db.places.slice() : db.places.filter(p => p.cityId === db.currentCityId);
const plural = (n, one, many) => n + ' ' + (n === 1 ? one : (many || one + 's'));
const cityLabel = () => ui.globe ? 'Worldwide' : city().name;
const cityOf = p => db.cities.find(c => c.id === p.cityId);
const placeCur = p => (p && ui.globe && cityOf(p) && cityOf(p).currency) || cur();
const byId = (id) => db.places.find(p => p.id === id);

function matches(p, filter) {
  const lt = filter.filter(f => f.startsWith('list:'));
  if (lt.length) return lt.some(t => { const l = listOf(t.slice(5)); return l && l.ids.includes(p.id); });
  if (!filter.length) return p.status === 'spot';
  if (p.status === 'totry') return filter.includes('totry');
  const cats = filter.filter(f => !f.startsWith('cuisine:') && f !== 'totry');
  const cuis = filter.filter(f => f.startsWith('cuisine:')).map(f => f.slice(8));
  if (cuis.length && cuis.some(q => cuisList(p).includes(q))) return true;
  return catsOf(p).some(c => cats.includes(c));
}
const myLists = () => db.lists || (db.lists = []);
const listOf = id => myLists().find(l => l.id === id);
const LIST_EMOJI = ['❤️', '🍷', '☀️', '🌧️', '🎉', '🧳', '🍝', '🌮', '☕', '🍸', '🌿', '🏖️', '🎶', '💸', '⭐', '👀'];
function touchList(l) { l.updatedAt = Date.now(); save(); }
// A place can be several categories at once (e.g. a restaurant and a cocktail bar); p.cat stays the main one
function catsOf(p) { return p.cats && p.cats.length ? p.cats : (p.cat ? [p.cat] : []); }
const catNames = p => catsOf(p).map(c => catOf(c).name).join(' & ');
function cuisList(p) { return (p.cuisine || '').split(',').map(s => s.trim()).filter(Boolean); }
function catMatch(p, cats) {
  const lt = cats.filter(f => f.startsWith('list:'));
  if (lt.length && !lt.some(t => { const l = listOf(t.slice(5)); return l && l.ids.includes(p.id); })) return false;
  cats = cats.filter(f => f !== 'totry' && !f.startsWith('list:')); if (!cats.length) return true;
  const cuis = cats.filter(f => f.startsWith('cuisine:')).map(f => f.slice(8));
  if (cuis.length && cuis.some(q => cuisList(p).includes(q))) return true;
  return catsOf(p).some(c => cats.includes(c));
}
function filterLabel(filter) {
  if (!filter.length) return 'All';
  const cuis = filter.filter(f => f.startsWith('cuisine:')).map(f => f.slice(8));
  const parts = [];
  CATS.forEach(c => {
    if (c.id === 'restaurant' && cuis.length) parts.push(cuis.length === 1 ? 'Restaurants · ' + cuis[0] : 'Restaurants · ' + cuis.length + ' cuisines');
    else if (filter.includes(c.id)) parts.push(c.plural);
  });
  if (filter.includes('totry')) parts.push('To try');
  filter.filter(f => f.startsWith('list:')).forEach(t => { const l = listOf(t.slice(5)); if (l) parts.push(l.emoji + ' ' + l.name); });
  return parts.join(', ');
}
function toggleFilter(token) {
  let f = ui.filter.slice();
  if (token === 'all') f = [];
  else if (f.includes(token)) f = f.filter(x => x !== token);
  else f.push(token);
  if (token.startsWith('cuisine:')) f = f.filter(x => x !== 'restaurant');
  if (token === 'restaurant') f = f.filter(x => !x.startsWith('cuisine:'));
  if (token.startsWith('list:') && f.includes(token)) f = f.filter(x => x === token || x.startsWith('list:'));
  else if (!token.startsWith('list:') && token !== 'all') f = f.filter(x => !x.startsWith('list:'));
  ui.filter = f;
}

/* ---------- small renderers ---------- */
// Thumbnail: the one you picked, else the most recently uploaded memory
function coverOf(p) {
  const ms = p.memories || [];
  if (p.thumb && ms.some(m => m.id === p.thumb.id)) return p.thumb.id;
  return (ms.length && ms[ms.length - 1].id) || (p.photos && p.photos[0]) || null;
}
const art = (p) => {
  const id = coverOf(p);
  if (id) { const u = photoUrl(id); if (u) return `<img src="${u}" alt="">`; }
  return ART[p.cat] || ART.restaurant;
};
const priceHtml = (n, p) => { const c = placeCur(p); return `<span class="price"><span class="on">${c.repeat(n)}</span><span class="off">${c.repeat(3 - n)}</span></span>`; };
const metaLine = (p, withDist = true) => [catNames(p), p.cuisine || '', p.area, ui.globe && cityOf(p) ? cityOf(p).name : '', withDist ? fmtDist(dist(p)) : ''].filter(Boolean).join(' · ');
const gLink = (p) => p.googleId ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.name)}&query_place_id=${encodeURIComponent(p.googleId)}` : `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`;
const aLink = (p) => `https://maps.apple.com/?daddr=${p.lat},${p.lng}&q=${encodeURIComponent(p.name)}`;
const dirButtons = (p) => {
  const g = `<a class="big-btn ${db.settings.dirApp === 'google' ? 'primary-btn' : 'sec-btn'}" href="${gLink(p)}" target="_blank" rel="noopener">${ICON.pin}Google Maps</a>`;
  const a = `<a class="big-btn ${db.settings.dirApp === 'apple' ? 'primary-btn' : 'sec-btn'}" href="${aLink(p)}" target="_blank" rel="noopener">${ICON.nav}Apple Maps</a>`;
  return `<div class="btn-grid">${a + g}</div>`;
};
const hoursLine = (p) => {
  const s = status(p);
  if (!db.settings.hours) return '';
  if (!s) return `<button class="link-btn muted" data-act="hours" data-id="${p.id}" style="font-weight:700;font-size:13px">+ Add opening hours</button>`;
  return `<div class="hours ${s.open ? '' : 'closed'}"><span class="dot"></span>${esc(s.text)}</div>`;
};

/* ---------- map (sample map, or Google Maps when a key is set) ---------- */
const mapApi = (() => {
  const el = document.createElement('div'); el.className = 'map';
  let mode = 'mock', gmap = null, overlay = null, center = Object.assign({}, cityCentre() || DEFAULT_ME), k = 0.13; // px per metre
  const pinsEl = document.createElement('div'); pinsEl.className = 'pins';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'streets');
  const meEl = document.createElement('div'); meEl.className = 'me-dot';

  // Deterministic fake streets around Madrid for the sample map
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const streets = []; for (let i = 0; i < 90; i++) { const lat = 40.395 + rnd() * 0.05, lng = -3.73 + rnd() * 0.06, ang = rnd() * Math.PI, len = 0.003 + rnd() * 0.012; streets.push([lat, lng, lat + Math.sin(ang) * len, lng + Math.cos(ang) * len * 1.3, rnd() < 0.18]); }
  const labels = [['MALASAÑA', 40.4265, -3.7045], ['CHUECA', 40.4228, -3.6975], ['SOL', 40.4172, -3.7035], ['LA LATINA', 40.4115, -3.7100], ['LAVAPIÉS', 40.4092, -3.7015], ['RETIRO', 40.4150, -3.6840], ['SALAMANCA', 40.4290, -3.6800], ['CHAMBERÍ', 40.4340, -3.7030]];
  const proj = (lat, lng) => { const w = el.clientWidth || 390, h = el.clientHeight || 844; return [w / 2 + (lng - center.lng) * Math.cos(center.lat * Math.PI / 180) * 111320 * k, h / 2 - (lat - center.lat) * 110540 * k]; };

  function drawMock() {
    const P = (a, b) => proj(a, b).map(n => n.toFixed(1)).join(',');
    let s = `<rect width="100%" height="100%" fill="#141418"/>`;
    const park = [[40.4195, -3.6880], [40.4195, -3.6795], [40.4085, -3.6800], [40.4090, -3.6895]].map(q => P(q[0], q[1])).join(' ');
    s += `<polygon points="${park}" fill="#1A2620"/>`;
    const river = [[40.44, -3.7215], [40.425, -3.7225], [40.41, -3.7195], [40.40, -3.7150], [40.39, -3.7080]].map(q => P(q[0], q[1])).join(' ');
    s += `<polyline points="${river}" fill="none" stroke="#182434" stroke-width="${Math.max(8, 140 * k)}" stroke-linecap="round"/>`;
    streets.forEach(([a, b, c, d, major]) => { const [x1, y1] = proj(a, b), [x2, y2] = proj(c, d); s += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${major ? '#2A2A33' : '#202027'}" stroke-width="${major ? 6 : 2.5}" stroke-linecap="round"/>`; });
    labels.forEach(([t, a, b]) => { const [x, y] = proj(a, b); s += `<text x="${x.toFixed(0)}" y="${y.toFixed(0)}" font-family="Manrope,sans-serif" font-size="10" font-weight="700" letter-spacing="1.6" fill="#8A8A94" text-anchor="middle">${t}</text>`; });
    svg.innerHTML = s;
  }
  let pinMap = new Map();
  function placePins(list, selected) {
    pinMap = new Map(list.map(p => [p.id, p]));
    pinsEl.innerHTML = list.map(p => {
      const st = status(p); const closed = p.status === 'spot' && st && !st.open;
      return `<div class="pin ${p.status === 'totry' ? 'totry' : ''} ${closed ? 'closed' : ''} ${selected === p.id ? 'selected' : ''}" data-pin="${p.id}">
        <button class="ring" data-act="pin" data-id="${p.id}" aria-label="${esc(p.name)}">${p.status === 'totry' && !(p.photos && p.photos.length) ? ART.totry : art(p)}</button>
        <div class="label">${esc(p.name)}</div>${closed && selected === p.id ? `<div class="sub">${esc(st.text)}</div>` : ''}</div>`;
    }).join('');
    positionPins();
  }
  function positionPins() {
    if (mode === 'mock') {
      pinsEl.querySelectorAll('.pin').forEach(n => { const p = pinMap.get(n.dataset.pin); if (!p) return; const [x, y] = proj(p.lat, p.lng); n.style.left = x + 'px'; n.style.top = y + 'px'; });
      const [mx, my] = proj(me.lat, me.lng); meEl.style.left = mx + 'px'; meEl.style.top = my + 'px';
    } else if (overlay && overlay.getProjection()) {
      const pr = overlay.getProjection();
      pinsEl.querySelectorAll('.pin').forEach(n => { const p = pinMap.get(n.dataset.pin); if (!p) return; const pt = pr.fromLatLngToDivPixel(new google.maps.LatLng(p.lat, p.lng)); n.style.left = pt.x + 'px'; n.style.top = pt.y + 'px'; });
      const m = pr.fromLatLngToDivPixel(new google.maps.LatLng(me.lat, me.lng)); meEl.style.left = m.x + 'px'; meEl.style.top = m.y + 'px';
    }
  }
  let pinClickAt = 0;
  pinsEl.addEventListener('click', e => {
    const r = e.target.closest('.ring'); if (!r) return;
    e.stopPropagation(); pinClickAt = Date.now();
    if (ui.world) { ui.wSel = r.dataset.id; ui.menu = null; const wp = pinMap.get(ui.wSel); if (wp) api.focus(wp); render(); return; }
    ui.selected = r.dataset.id; ui.sheet = 'spot'; ui.menu = null; const sp = byId(ui.selected); if (sp) api.focus(sp); render();
  });
  function initMock() {
    el.appendChild(svg); el.appendChild(pinsEl); el.appendChild(meEl);
    let drag = null, pinchD = 0; const pts = new Map();
    el.addEventListener('pointerdown', e => { if (e.target.closest('.ring')) return; pts.set(e.pointerId, [e.clientX, e.clientY]); el.setPointerCapture(e.pointerId); drag = { x: e.clientX, y: e.clientY, c: Object.assign({}, center), moved: false }; if (pts.size === 2) { const [a, b] = [...pts.values()]; pinchD = Math.hypot(a[0] - b[0], a[1] - b[1]); } });
    el.addEventListener('pointermove', e => {
      if (!drag || !pts.has(e.pointerId)) return; pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 2) { const [a, b] = [...pts.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinchD) { k = Math.min(0.6, Math.max(0.03, k * d / pinchD)); pinchD = d; redraw(); } return; }
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
      center = { lat: drag.c.lat + dy / (110540 * k), lng: drag.c.lng - dx / (111320 * k * Math.cos(drag.c.lat * Math.PI / 180)) }; redraw();
    });
    const end = e => { pts.delete(e.pointerId); if (drag && !drag.moved && !e.target.closest('.ring') && (ui.selected || ui.menu)) { ui.selected = null; ui.sheet = null; ui.menu = null; render(); } if (!pts.size) drag = null; pinchD = 0; };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
    el.addEventListener('wheel', e => { e.preventDefault(); k = Math.min(0.6, Math.max(0.03, k * (e.deltaY < 0 ? 1.1 : 0.9))); redraw(); }, { passive: false });
    window.addEventListener('resize', redraw);
  }
  function redraw() { if (mode === 'mock') drawMock(); positionPins(); }
  const LIGHT = [{ elementType: 'geometry', stylers: [{ color: '#F2EFE9' }] }, { elementType: 'labels.text.fill', stylers: [{ color: '#5E5E66' }] }, { elementType: 'labels.text.stroke', stylers: [{ color: '#F2EFE9' }] }, { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#FFFFFF' }] }, { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#FFFFFF' }] }, { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#FCE8B2' }] }, { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#AAD3E8' }] }, { featureType: 'poi', stylers: [{ visibility: 'off' }] }, { featureType: 'poi.park', elementType: 'geometry', stylers: [{ visibility: 'on' }, { color: '#D3E8C8' }] }, { featureType: 'transit', stylers: [{ visibility: 'off' }] }, { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] }];
  const DARK = [{ elementType: 'geometry', stylers: [{ color: '#141418' }] }, { elementType: 'labels.text.fill', stylers: [{ color: '#8A8A94' }] }, { elementType: 'labels.text.stroke', stylers: [{ color: '#141418' }] }, { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#24242B' }] }, { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#2A2A33' }] }, { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#33333C' }] }, { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#182434' }] }, { featureType: 'poi', stylers: [{ visibility: 'off' }] }, { featureType: 'poi.park', elementType: 'geometry', stylers: [{ visibility: 'on' }, { color: '#1A2620' }] }, { featureType: 'transit', stylers: [{ visibility: 'off' }] }, { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] }];
  function initGoogle() {
    window.__sitioGmapsReady = () => {
      mode = 'google';
      const gEl = document.createElement('div'); gEl.style.cssText = 'position:absolute;inset:0'; el.appendChild(gEl);
      gmap = new google.maps.Map(gEl, { center: haveLocation && nearCity() ? me : center, zoom: haveLocation && nearCity() ? 15 : 13, disableDefaultUI: true, keyboardShortcuts: false, clickableIcons: false, gestureHandling: 'greedy', styles: db.settings.darkMap ? DARK : LIGHT, backgroundColor: db.settings.darkMap ? '#141418' : '#f2efe9' });
      overlay = new google.maps.OverlayView();
      overlay.onAdd = function () { this.getPanes().overlayMouseTarget.appendChild(pinsEl); this.getPanes().overlayMouseTarget.appendChild(meEl); pinsEl.style.pointerEvents = 'none'; };
      overlay.draw = positionPins; overlay.onRemove = () => {};
      overlay.setMap(gmap);
      gmap.addListener('click', () => { if (Date.now() - pinClickAt < 400) return; if (ui.selected || ui.menu) { ui.selected = null; ui.sheet = null; ui.menu = null; render(); } });
      render();
    };
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(CFG.googleMapsKey)}&v=weekly&libraries=places&loading=async&callback=__sitioGmapsReady`;
    s.async = true; s.onerror = () => { flash('Google Maps didn’t load. Showing the sample map.'); initMock(); redraw(); };
    document.head.appendChild(s);
  }
  const api = {
    el,
    init() { if (CFG.googleMapsKey) initGoogle(); else { initMock(); } },
    update(list, selected) { if (mode === 'mock') drawMock(); placePins(list, selected); },
    center(c) { center = { lat: c.lat, lng: c.lng }; if (gmap) { gmap.panTo(center); if (gmap.getZoom() < 14) gmap.setZoom(15); } else redraw(); },
    fit(list) {
      if (!list.length) return;
      if (gmap) { const b = new google.maps.LatLngBounds(); list.forEach(p => b.extend({ lat: p.lat, lng: p.lng })); gmap.fitBounds(b, 60); if (list.length === 1) gmap.setZoom(14); }
      else { center = { lat: list.reduce((s, p) => s + p.lat, 0) / list.length, lng: list.reduce((s, p) => s + p.lng, 0) / list.length }; redraw(); }
    },
    getCenter() { if (gmap) { const c = gmap.getCenter(); return { lat: c.lat(), lng: c.lng() }; } return Object.assign({}, center); },
    flyOut(c, z) { center = { lat: c.lat, lng: c.lng }; if (!gmap) return redraw(); const step = () => { const cz = gmap.getZoom(); if (cz <= z) return; gmap.setZoom(Math.max(z, cz - 2)); setTimeout(step, 260); }; gmap.panTo(center); setTimeout(step, 150); },
    view(c, z) { center = { lat: c.lat, lng: c.lng }; if (gmap) { gmap.setCenter(center); gmap.setZoom(z); } else redraw(); },
    // Puts a place in the upper part of the screen so it stays visible above a bottom sheet
    focus(c) { const h = el.clientHeight || 844; if (gmap) { gmap.panTo(c); gmap.panBy(0, h * 0.22); } else { center = { lat: c.lat - (h * 0.22) / (110540 * k), lng: c.lng }; redraw(); } },
    setStyle() { if (gmap) gmap.setOptions({ styles: db.settings.darkMap ? DARK : LIGHT, backgroundColor: db.settings.darkMap ? '#141418' : '#f2efe9' }); },
    get google() { return mode === 'google'; }
  };
  return api;
})();

/* ---------- views ---------- */
function tabbar() {
  const n = cityPlaces().filter(p => p.status === 'totry').length;
  const t = (id, label, iconName, extra = '') => {
    const on = ui.tab === id && !ui.page;
    const ic = iconName === 'totry' ? icon('totry', on ? '#FF5A4E' : 'none', on ? '#FF5A4E' : 'currentColor') : icon(iconName, on ? 'currentColor' : 'none');
    return `<button class="${on ? 'on' : ''}" data-act="tab" data-tab="${id}" aria-label="${label}">${ic}${label}${extra}</button>`;
  };
  return `<nav class="tabbar glass" aria-label="Main">${t('home', 'Home', 'home')}${t('spots', 'Spots', 'spots')}${t('totry', 'To try', 'totry', n && ui.tab !== 'totry' ? `<span class="badge">${n}</span>` : '')}${t('account', 'Account', 'account')}</nav>`;
}

function homeView() {
  const list = cityPlaces().filter(p => matches(p, ui.filter));
  const spots = list.filter(p => p.status === 'spot');
  const openN = spots.filter(p => { const s = status(p); return !s || s.open; }).length;
  const onlyTry = ui.filter.length === 1 && ui.filter[0] === 'totry';
  const pillCls = onlyTry ? 'totry' : (ui.menu === 'home' ? 'active' : '');
  return `
  <div class="top">
    <button class="city-title" data-act="cities" aria-label="Change city"><span>${esc(cityLabel())}</span>${ICON.chevDown}</button>
    <div class="filter-wrap"><button class="filter-pill ${pillCls} ${pillCls ? '' : 'glass'}" data-act="menu" data-menu="home">${ICON.filter}<span class="txt">${esc(filterLabel(ui.filter))}</span>${ICON.chevDown}</button>${ui.filter.length ? `<button class="filter-x round glass" data-act="filt" data-f="all" aria-label="Clear filter, show all">${ICON.close}</button>` : ''}</div>
    <div class="top-right">
      <button class="round glass" data-act="search" aria-label="Search your spots">${ICON.search}</button>
      <button class="round primary-btn" data-act="add" aria-label="Add a spot" style="box-shadow:0 8px 24px rgba(0,0,0,.5)">${ICON.plus}</button>
    </div>
  </div>
  ${hereMemoryChip()}
  <div class="map-bottom">
    ${onlyTry ? `<div class="open-chip glass"><span class="dot" style="background:var(--coral)"></span>${list.length} to try</div>` : (spots.length ? `<div class="open-chip glass"><span class="dot"></span>${openN} of ${spots.length} open now</div>` : '<span></span>')}
    <button class="locate round glass" data-act="locate" aria-label="Centre on my location" style="color:var(--blue)">${ICON.nav}</button>
  </div>
  ${ui.menu === 'home' ? filterMenu() : ''}`;
}

function filterMenu() {
  const f = ui.filter; const cuis = f.filter(x => x.startsWith('cuisine:')).map(x => x.slice(8));
  const used = [...new Set((ui.world ? worldList() : cityPlaces()).flatMap(cuisList))].sort();
  let h = `<div class="menu" role="menu" aria-label="Show on map">`;
  h += `<button class="${!f.length ? 'on' : ''}" data-act="filt" data-f="all">All${!f.length ? ICON.check : ''}</button>`;
  CATS.forEach(c => {
    const on = f.includes(c.id) || (c.id === 'restaurant' && cuis.length);
    if (c.id === 'restaurant') {
      h += `<button class="${on ? 'on' : ''}" data-act="filt" data-f="restaurant">Restaurants<span style="display:flex;align-items:center;gap:6px">${cuis.length ? `<span class="sub">${cuis.length === 1 ? esc(cuis[0]) : cuis.length + ' cuisines'}</span>` : ''}${f.includes('restaurant') ? ICON.check : ''}<span data-act="cuisines" style="display:flex;padding:8px;margin:-8px">${ui.cuisineOpen ? ICON.chevDown : ICON.chevRight}</span></span></button>`;
      if (ui.cuisineOpen) used.forEach(q => { const o = cuis.includes(q); h += `<button class="indent ${o ? 'on' : ''}" data-act="filt" data-f="cuisine:${esc(q)}">${esc(q)}${o ? ICON.check : ''}</button>`; });
      if (ui.cuisineOpen && !used.length) h += `<button class="indent" disabled><span class="sub">No cuisines saved yet</span></button>`;
    } else h += `<button class="${on ? 'on' : ''}" data-act="filt" data-f="${c.id}">${c.plural}${on ? ICON.check : ''}</button>`;
  });
  if (myLists().length && !ui.world) { h += `<div class="sep"></div><div class="menu-head">My lists</div>`; myLists().forEach(l => { const on = f.includes('list:' + l.id); h += `<button class="${on ? 'on' : ''}" data-act="filt" data-f="list:${l.id}"><span style="display:flex;align-items:center;gap:8px"><span>${l.emoji}</span>${esc(l.name)}</span>${on ? ICON.check : ''}</button>`; }); }
  if (ui.menu === 'home' || ui.menu === 'world') h += `<div class="sep"></div><button class="${f.includes('totry') ? 'on' : ''}" data-act="filt" data-f="totry" style="color:var(--coral-soft)"><span style="display:flex;align-items:center;gap:8px"><span class="dot" style="background:var(--coral)"></span>To try</span>${f.includes('totry') ? ICON.check : ''}</button>`;
  return h + `</div>`;
}

// Admin world map: everyone's places, ids made unique per person
function worldList() {
  const out = [];
  (ui.adminData || []).forEach(u => { const d = u.data || {}; const who = (d.user && d.user.name) || u.email || 'Someone';
    (d.places || []).forEach(p => { if (typeof p.lat !== 'number' || typeof p.lng !== 'number') return; const c = (d.cities || []).find(x => x.id === p.cityId);
      out.push(Object.assign({}, p, { id: u.user_id + ':' + p.id, photos: [], _src: p, _city: c, _cur: (c && c.currency) || '€', _who: who })); }); });
  return out;
}
function worldView() {
  const all = worldList(), users = (ui.adminData || []).length;
  const spots = all.filter(p => p.status === 'spot').length, tries = all.filter(p => p.status === 'totry').length;
  const shown = all.filter(p => matches(p, ui.filter)).length;
  const pillCls = ui.menu === 'world' ? 'active' : '';
  return `<div class="top">
    <div class="world-head glass"><button class="round sec-btn" style="width:40px;height:40px;flex:none" data-act="worldexit" aria-label="Back to admin">${ICON.back}</button>
      <div style="min-width:0"><div style="font-size:17px;font-weight:800">World map</div><div style="font-size:12px;font-weight:700;color:var(--text-2)">${users} ${users === 1 ? 'user' : 'users'} · ${spots} spots · ${tries} to try</div></div></div>
    <div class="filter-wrap" style="top:72px"><button class="filter-pill ${pillCls} ${pillCls ? '' : 'glass'}" data-act="menu" data-menu="world">${ICON.filter}<span class="txt">${esc(filterLabel(ui.filter))}</span>${ICON.chevDown}</button>${ui.filter.length ? `<button class="filter-x round glass" data-act="filt" data-f="all" aria-label="Clear filter">${ICON.close}</button>` : ''}</div>
  </div>
  <div class="map-bottom"><div class="open-chip glass"><span class="dot" style="background:#F5B83D"></span>${shown} shown</div><button class="locate round glass" data-act="worldfit" aria-label="Show everything" style="color:var(--blue)">${ICON.map}</button></div>
  ${ui.menu === 'world' ? filterMenu().replace('class="menu"', 'class="menu" style="top:calc(var(--safe-top) + 126px)"') : ''}`;
}
// Memories: photos of you at the place, kept with the date they were taken
const toLocalInput = t => { const d = new Date(t || Date.now()); const z = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()) + 'T' + z(d.getHours()) + ':' + z(d.getMinutes()); };
const fromLocalInput = v => { const m = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)/.exec(v || ''); return m ? new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5]).getTime() : null; };
const fmtWhen = t => { const d = new Date(t); return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) + ' · ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); };
// Top of a place: your memories first, with a big "add" tile; the place's illustration only until you add one
function memoryStrip(p) {
  const ms = (p.memories || []).slice().sort((a, b) => b.at - a.at);
  const old = (p.photos || []).map(id => ({ id, at: 0 }));
  const input = `<input type="file" accept="image/*" multiple hidden data-memory="${p.id}">`;
  const add = `<label class="ms-add ${ms.length ? '' : 'first'}"><span class="ms-cam">📸</span><b>${ms.length ? 'Add another' : (p.status === 'totry' ? 'Went? Add a memory' : 'Add a memory')}</b><span>${ms.length ? 'Photo of you here' : 'A photo of you here, saved with the date'}</span>${input}</label>`;
  const cov = coverOf(p);
  const tiles = ms.concat(old).map(m => { const u = photoUrl(m.id); return `<button class="ms-item" data-act="memview" data-id="${p.id}" data-m="${m.id}">${m.id === cov && ms.length > 1 ? '<span class="ms-cov">Thumbnail</span>' : ''}${u ? `<img src="${u}" alt="">` : (m.cloud ? '<span class="mem-gone">Loading…</span>' : '<span class="mem-gone">On another phone</span>')}${m.at ? `<span class="mem-date">${esc(new Date(m.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }))}</span>` : ''}</button>`; }).join('');
  const blank = ms.length || old.length ? '' : `<div class="ms-item ms-art">${ART[p.cat] || ART.restaurant}<span class="ms-hint">Your memories here will show who you came with and when</span></div>`;
  return `<div class="ms-wrap"><div class="ms-head"><span>📸 Memories${ms.length ? ' · ' + ms.length : ''}</span>${ms.length ? `<span class="ms-last">Last: ${esc(new Date(ms[0].at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }))}</span>` : ''}</div><div class="ms-strip">${add}${tiles}${blank}</div></div>`;
}
function memoriesHtml(p) {
  const ms = (p.memories || []).slice().sort((a, b) => b.at - a.at);
  const input = `<input type="file" accept="image/*" multiple hidden data-memory="${p.id}">`;
  if (!ms.length) return `<label class="mem-cta card"><span class="mem-ic">📸</span><span style="display:flex;flex-direction:column;gap:2px"><b>${p.status === 'totry' ? 'Went here? Add a memory' : 'Been here? Add a memory'}</b><span>A photo of you there, saved with the date and time it was taken.</span></span>${input}</label>`;
  return `<div class="mem"><div class="mem-head"><span>📸 Memories · ${ms.length}</span><label class="link-btn" style="color:var(--blue);cursor:pointer">${ICON.plus}Add${input}</label></div>
    <div class="mem-strip">${ms.map(m => { const u = photoUrl(m.id); return `<button class="mem-item" data-act="memview" data-id="${p.id}" data-m="${m.id}">${u ? `<img src="${u}" alt="">` : '<span class="mem-gone">Photo on another phone</span>'}<span class="mem-date">${esc(new Date(m.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }))}</span></button>`; }).join('')}</div></div>`;
}
// Read when a photo was actually taken (EXIF), so old photos get the right date
async function photoDate(file) {
  try {
    const buf = new DataView(await file.slice(0, 131072).arrayBuffer());
    if (buf.getUint16(0) !== 0xFFD8) throw 0;
    let o = 2;
    while (o < buf.byteLength - 4) {
      const marker = buf.getUint16(o), len = buf.getUint16(o + 2);
      if (marker === 0xFFE1 && buf.getUint32(o + 4) === 0x45786966) {
        const t = o + 10, le = buf.getUint16(t) === 0x4949; const u16 = x => buf.getUint16(x, le), u32 = x => buf.getUint32(x, le);
        const readIfd = (off, want) => { const n = u16(t + off); for (let k = 0; k < n; k++) { const e = t + off + 2 + k * 12; if (u16(e) === want) return e; } return 0; };
        const str = e => { let s = ''; const at = t + u32(e + 8); for (let k = 0; k < 19; k++) s += String.fromCharCode(buf.getUint8(at + k)); return s; };
        const ifd0 = u32(t + 4); let e = 0; const ex = readIfd(ifd0, 0x8769);
        if (ex) e = readIfd(u32(ex + 8), 0x9003); if (!e) e = readIfd(ifd0, 0x0132);
        if (e) { const m = /^(\d{4}):(\d\d):(\d\d) (\d\d):(\d\d):(\d\d)/.exec(str(e)); if (m) return new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime(); }
        break;
      }
      if ((marker & 0xFF00) !== 0xFF00) break; o += 2 + len;
    }
  } catch (e) { }
  return file.lastModified && Math.abs(Date.now() - file.lastModified) > 60000 ? file.lastModified : Date.now();
}
// Small hint on Home when you're standing at one of your places
function hereMemoryChip() {
  if (!haveLocation || ui.sheet || ui.menu) return '';
  const near = cityPlaces().filter(p => p.status === 'spot' && dist(p) < 80).sort((a, b) => dist(a) - dist(b))[0];
  if (!near) return '';
  const key = 'sitio.memAsk.' + near.id + '.' + new Date().toDateString(); try { if (localStorage.getItem(key)) return ''; } catch (e) { }
  return `<div class="mem-chip glass"><label style="display:flex;align-items:center;gap:8px;flex:1;min-width:0;cursor:pointer"><span style="font-size:18px">📸</span><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">At <b>${esc(near.name)}</b>? Add a memory</span><input type="file" accept="image/*" multiple hidden data-memory="${near.id}"></label><button class="round" data-act="memchipx" data-id="${near.id}" aria-label="Not now">${ICON.close}</button></div>`;
}
function roSheet(p, ro) {
  return `<div class="sheet" role="dialog" aria-label="${esc(p.name)}" data-swipeclose="closeadmin">
    <div class="grab"></div>
    <div class="sheet-photos"><div>${ART[p.cat] || ART.restaurant}</div><div style="background:var(--surface)"></div><div style="background:var(--surface)"></div></div>
    <div class="name-row"><div style="display:flex;align-items:center;gap:10px;min-width:0"><h2 class="big-name">${esc(p.name)}</h2>${p.status === 'totry' ? '<span class="tag">TO TRY</span>' : ''}${p.fav ? `<span class="star-btn on" style="display:flex">${ICON.star}</span>` : ''}</div></div>
    <div class="meta">${esc(metaLine(p))}</div>
    ${status(p) ? hoursLine(p) : ''}
    ${p.status === 'spot' && p.price ? `<div class="price-line"><span class="price"><span class="on">${esc(ro.cur.repeat(p.price))}</span><span class="off">${esc(ro.cur.repeat(3 - p.price))}</span></span>${PRICE_WORDS[p.price] || ''}</div>` : ''}
    ${p.note ? `<div class="note card">${esc(p.note)}</div>` : '<div style="height:14px"></div>'}
    <div class="btn-grid" style="margin-bottom:8px"><button class="big-btn primary-btn" data-act="copyspot">${ICON.check}Add to my Spots</button><button class="big-btn coral-btn" data-act="copytry">${ICON.plus}Add to my To try</button></div>
    ${dirButtons(p)}
    <p class="page-sub" style="font-size:12px;margin:10px 0 0">Saved by ${esc(ro.who)}${p.addedAt ? ' · ' + fmtDate(p.addedAt) : ''}. Their photos are private.</p>
  </div>`;
}
function spotSheet(p) {
  const isTry = p.status === 'totry';
  const more = `<button class="act-more" data-act="more" data-id="${p.id}" aria-label="More">${ICON.dots}</button>`;
  const first = isTry
    ? `<button class="act act-save" data-act="savetry" data-id="${p.id}">${ICON.check}<span>Save to Spots</span></button>`
    : `<button class="act ${p.fav ? 'fav-on' : ''}" data-act="fav" data-id="${p.id}" aria-pressed="${!!p.fav}">${ICON.star}<span>Favourite</span></button>`;
  return `<div class="sheet" role="dialog" aria-label="${esc(p.name)}">
    <div class="grab"></div>
    ${isTry ? tryCover(p) : memoryStrip(p)}
    <div class="name-row sheet-name"><h2 class="big-name">${esc(p.name)}</h2>${isTry ? '<span class="tag">TO TRY</span>' : ''}</div>
    <div class="act-row">${first}${more}</div>
    <div class="meta meta-edit">${esc(metaLine(p))}<button class="pen" data-act="editcat" data-id="${p.id}" aria-label="Change category">${ICON.pen}</button></div>
    ${hoursLine(p)}
    ${isTry ? '' : `<div class="price-line">${priceHtml(p.price, p)}${PRICE_WORDS[p.price] || (catsOf(p).includes('chill') ? 'Free' : '')}<button class="pen" data-act="editprice" data-id="${p.id}" aria-label="Edit price">${ICON.pen}</button></div>`}
    ${p.note ? `<button class="note card note-short ${ui.noteOpen === p.id ? 'open' : ''}" data-act="notetoggle" data-id="${p.id}">${esc(p.note)}</button>` : '<div style="height:12px"></div>'}
    ${dirButtons(p)}
  </div>`;
}
// To try places: same layout as Spots, with the place's picture where memories would be
function tryCover(p) {
  return `<div class="ms-wrap"><div class="ms-head"><span>📍 On your To try list</span>${p.addedAt ? `<span class="ms-last">Added ${esc(new Date(p.addedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }))}</span>` : ''}</div>
    <div class="try-cover">${ART[p.cat] || ART.restaurant}<span class="ms-hint">Been? Tap Save to Spots, then add a memory</span></div></div>`;
}
function spotsView() {
  const q = ui.spotsSearch.trim().toLowerCase();
  const cats = ui.filter.filter(f => f !== 'totry');
  let list = cityPlaces().filter(p => p.status === 'spot' && catMatch(p, cats));
  if (ui.spotsFav) list = list.filter(p => p.fav);
  if (q) list = list.filter(p => (p.name + ' ' + p.area + ' ' + p.cuisine + ' ' + p.note).toLowerCase().includes(q));
  if (ui.spotsOpenNow) list = list.filter(p => { const s = status(p); return !s || s.open; });
  list.sort((a, b) => dist(a) - dist(b));
  let body = '';
  if (!list.length) body = `<div class="empty card" style="border-radius:20px">${cityPlaces().some(p => p.status === 'spot') ? (ui.spotsFav && !cityPlaces().some(p => p.fav && p.status === 'spot') ? 'No favourites yet.<br>Tap the star on a spot to add it.' : 'Nothing matches right now.' + (ui.spotsOpenNow || ui.spotsFav ? '<br>Try turning off Open now or Favourites.' : '')) : (ui.globe ? 'No spots yet' : 'No spots in ' + esc(city().name) + ' yet') + '.<br>Tap + to add your first.'}</div>`;
  else if (!cats.length) {
    CATS.forEach(c => {
      const g = list.filter(p => catsOf(p).includes(c.id)); if (!g.length) return;
      body += `<div class="group"><div class="group-head"><span class="section-label">${c.plural} · ${g.length}</span></div><div class="list card">${g.map(rowSpot).join('')}</div></div>`;
    });
    const other = list.filter(p => !catsOf(p).some(id => CATS.some(c => c.id === id)));
    if (other.length) body += `<div class="group"><div class="group-head"><span class="section-label">Other · ${other.length}</span></div><div class="list card">${other.map(rowSpot).join('')}</div></div>`;
  } else {
    body = `<div class="group"><div class="group-head"><span class="section-label">${list.length} ${esc(filterLabel(cats).toLowerCase())} · nearest first</span></div><div class="list card">${list.map(rowSpot).join('')}</div></div>`;
  }
  return `<div class="page">
    <div class="page-head head2"><div><h1 class="page-title">Spots</h1><div class="page-sub">${cityPlaces().filter(p => p.status === 'spot').length} ${cityPlaces().filter(p => p.status === 'spot').length === 1 ? 'spot' : 'spots'} ${ui.globe ? 'worldwide' : 'in ' + esc(city().name)}</div></div><div style="display:flex;gap:8px;align-items:center"><button class="pill sec-btn" style="height:44px" data-act="cities">${esc(cityLabel())}${ICON.chevDown}</button><button class="pill primary-btn" style="height:44px;font-weight:800" data-act="add">${ICON.plus}Add</button></div></div>
    <div class="seg" role="tablist"><button class="${ui.spotsView !== 'lists' ? 'on' : ''}" data-act="spview" data-v="places" role="tab">Places</button><button class="${ui.spotsView === 'lists' ? 'on' : ''}" data-act="spview" data-v="lists" role="tab">Lists${myLists().length ? ` <span class="seg-n">${myLists().length}</span>` : ''}</button></div>
    ${ui.spotsView === 'lists' ? listsBody() : `<label class="search card">${ICON.search}<input type="search" placeholder="Search your spots" aria-label="Search your spots" value="${esc(ui.spotsSearch)}" data-input="spotsSearch"></label>
    <div class="row-btns" style="position:relative"><button class="pill sec-btn" data-act="menu" data-menu="spots">${ICON.filter}${esc(filterLabel(cats))}${ICON.chevDown}</button><button class="pill ${ui.spotsOpenNow ? 'green-on' : 'sec-btn'}" data-act="opennow" aria-pressed="${ui.spotsOpenNow}">${ui.spotsOpenNow ? ICON.check : ''}Open now</button><button class="pill ${ui.spotsFav ? 'fav-on' : 'sec-btn'}" data-act="favfilter" aria-pressed="${!!ui.spotsFav}">${ICON.star}Favourites</button></div>
    ${body}`}
  </div>${ui.menu === 'spots' && ui.spotsView !== 'lists' ? filterMenu() : ''}`;
}
function listsBody() {
  const ls = myLists();
  return `<div class="list-grid">${ls.map(l => { const n = l.ids.filter(id => byId(id)).length; return `<button class="list-card card" data-act="openlist" data-id="${l.id}"><span class="lc-emoji">${l.emoji}</span><span class="lc-name">${esc(l.name)}</span><span class="lc-n">${n} ${n === 1 ? 'place' : 'places'}</span></button>`; }).join('')}
    <button class="list-card new" data-act="newlist"><span class="lc-emoji">${ICON.plus}</span><span class="lc-name">New list</span><span class="lc-n">Date spots, rainy days…</span></button></div>
    ${ls.length ? '' : '<p class="page-sub" style="font-size:13px;line-height:1.45;margin-top:12px">Group places your way. Add any spot or To try place to a list from its page with the ' + ICON.list + ' button.</p>'}`;
}
function listAddRows(l, q) {
  const all = db.places.filter(p => !q || (p.name + ' ' + (p.area || '') + ' ' + (db.cities.find(c => c.id === p.cityId) || {}).name).toLowerCase().includes(q));
  const group = (title, ps) => ps.length ? `<div class="section-label" style="margin:8px 0 6px">${title} · ${ps.length}</div><div class="settings card">${ps.map(p => { const on = l.ids.includes(p.id), c = db.cities.find(x => x.id === p.cityId); return `<button class="set-row" data-act="listaddtoggle" data-id="${p.id}" style="min-height:54px"><span style="display:flex;flex-direction:column;gap:2px;text-align:left;min-width:0"><span style="font-weight:800">${esc(p.name)}</span><span style="font-size:12px;font-weight:600;color:var(--text-2)">${esc([catNames(p), c && c.name].filter(Boolean).join(' · '))}</span></span><span class="check-box ${on ? 'on' : ''}">${on ? ICON.check : ''}</span></button>`; }).join('')}</div>` : '';
  const html = group('Spots', all.filter(p => p.status === 'spot')) + group('To try', all.filter(p => p.status === 'totry'));
  return `<div style="max-height:52vh;overflow-y:auto">${html || '<p style="margin:8px 0">No places match.</p>'}</div>`;
}
function listPage(l) {
  const ps = l.ids.map(byId).filter(Boolean);
  const byCity = db.cities.map(c => ({ c, ps: ps.filter(p => p.cityId === c.id) })).filter(g => g.ps.length);
  return `<div class="page" style="z-index:15">
    <div class="page-head" style="justify-content:flex-start"><button class="round sec-btn" style="width:44px;height:44px;flex:none" data-act="closepage" aria-label="Back">${ICON.back}</button><span style="font-size:24px;margin-left:4px">${l.emoji}</span><span style="font-size:22px;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(l.name)}</span></div>
    <div class="row-btns" style="flex-wrap:nowrap;align-items:center"><button class="pill primary-btn" style="font-weight:800" data-act="listadd" data-id="${l.id}">${ICON.plus}Add</button><button class="pill sec-btn" data-act="listmap" data-id="${l.id}">${ICON.map}Show on map</button><button class="act-more" style="margin-left:auto" data-act="more" data-list="${l.id}" aria-label="More">${ICON.dots}</button></div>
    ${byCity.length ? byCity.map(g => `<div class="section-label" style="margin:12px 0 8px">${esc(g.c.name)} · ${g.ps.length}</div><div class="list card">${g.ps.map(rowSpot).join('')}</div>`).join('') : `<div class="empty card" style="border-radius:20px">This list is empty.<br>Open any place and tap ${ICON.list} to add it here.</div>`}
  </div>`;
}
function rowSpot(p) {
  const s = status(p);
  return `<div class="swipe" data-swipe="${p.id}"><div class="acts"><div class="save"></div><div class="del">Delete${ICON.bin}</div></div>
    <div class="fg"><div class="thumb">${art(p)}</div>
      <div class="row-main" data-act="open" data-id="${p.id}"><span class="row-name">${esc(p.name)}${p.status === 'totry' ? ' <span class="tag" style="font-size:9px;padding:2px 6px;vertical-align:middle">TO TRY</span>' : ''}</span><span class="row-meta">${esc([p.cat === 'restaurant' ? p.cuisine : '', p.area, ui.globe && cityOf(p) ? cityOf(p).name : '', fmtDist(dist(p))].filter(Boolean).join(' · '))}</span>
        <span class="row-line ${s && !s.open ? 'closed' : ''}">${s ? `<span class="dot"></span>${esc(s.text.replace('Open · until', 'Until').replace('Closed · opens', 'Opens'))}<span style="color:#6A6A72">·</span>` : ''}${priceHtml(p.price, p)}</span></div>
      <div class="mini-btns"><button class="round sec-btn mini star-btn ${p.fav ? 'on' : ''}" data-act="fav" data-id="${p.id}" aria-pressed="${!!p.fav}" aria-label="${p.fav ? 'Remove from favourites' : 'Add to favourites'}">${ICON.star}</button><button class="round sec-btn mini" data-act="dirs" data-id="${p.id}" aria-label="Directions to ${esc(p.name)}">${ICON.nav}</button></div></div></div>`;
}

function tryView() {
  const tcats = ui.filter.filter(f => f !== 'totry');
  let list = cityPlaces().filter(p => p.status === 'totry' && catMatch(p, tcats));
  list.sort(ui.tryNewest ? (a, b) => b.addedAt - a.addedAt : (a, b) => dist(a) - dist(b));
  const rows = list.map(p => `<div class="swipe" data-swipe="${p.id}" data-try="1"><div class="acts"><div class="save">${ICON.check}Save</div><div class="del">Delete${ICON.bin}</div></div>
    <div class="fg"><div class="thumb" style="width:58px;height:58px">${p.photos && p.photos.length ? art(p) : ART.totry}</div>
      <div class="row-main" data-act="showtry" data-id="${p.id}"><span class="row-name">${esc(p.name)}</span><span class="row-meta">${esc(metaLine(p))}</span>${p.note ? `<span class="row-note">${esc(p.note)}</span>` : ''}</div>
      <div class="mini-btns"><button class="round sec-btn mini" data-act="dirs" data-id="${p.id}" aria-label="Directions to ${esc(p.name)}">${ICON.nav}</button><button class="round x-btn mini" data-act="del" data-id="${p.id}" aria-label="Remove ${esc(p.name)}" style="color:var(--coral-soft)">${ICON.close}</button></div></div></div>`).join('');
  return `<div class="page">
    <div class="page-head head2"><div><h1 class="page-title">To try</h1><div class="page-sub">${list.length} ${list.length === 1 ? 'place' : 'places'} ${ui.globe ? 'worldwide' : 'in ' + esc(city().name)}</div></div>
      <div style="display:flex;gap:8px;align-items:center"><button class="pill sec-btn" style="height:44px" data-act="cities">${esc(cityLabel())}${ICON.chevDown}</button><button class="pill coral-btn" style="height:44px;font-weight:800" data-act="add">${ICON.plus}Add</button></div></div>
    <div class="row-btns" style="position:relative;flex-wrap:nowrap;align-items:center"><button class="pill sec-btn" data-act="menu" data-menu="try">${ICON.filter}${esc(filterLabel(tcats))}${ICON.chevDown}</button><button class="pill sec-btn" data-act="trysort">${ui.tryNewest ? 'Newest' : 'Nearest'}${ICON.chevDown}</button><button class="pill sec-btn" style="flex:none" data-act="trymap">${ICON.map}Show on map</button></div>
    ${list.length ? `<div class="list card">${rows}</div>` : `<div class="empty card" style="border-radius:20px">${tcats.length && cityPlaces().some(p => p.status === 'totry') ? 'Nothing to try in ' + esc(filterLabel(tcats)) + '.' : 'Nothing to try yet.<br>Found somewhere that looks good? Tap Add.'}</div>`}
  </div>${ui.menu === 'try' ? filterMenu() : ''}`;
}

function accountView() {
  const all = db.places; const u = db.user;
  const av = u.photo && photoUrl(u.photo) ? `<img src="${photoUrl(u.photo)}" alt="">` : (u.avatar ? `<img src="${u.avatar}" alt="">` : esc((u.name || 'You')[0].toUpperCase()));
  const row = (label, val, act) => `<button class="set-row" data-act="${act}"><span>${label}</span><span class="val">${val}${ICON.chevRight}</span></button>`;
  const tog = (label, sub, key) => `<div class="set-row"><span style="display:flex;flex-direction:column;gap:2px"><span>${label}</span>${sub ? `<span style="font-size:12px;font-weight:600;color:var(--text-2)">${sub}</span>` : ''}</span><button class="toggle ${db.settings[key] ? 'on' : ''}" data-act="toggle" data-key="${key}" aria-pressed="${!!db.settings[key]}" aria-label="${label}"></button></div>`;
  return `<div class="page">
    <div style="display:flex;align-items:center;gap:14px"><button class="avatar acct-av" data-act="${auth ? 'profile' : 'openauth'}" aria-label="${auth ? 'Account details' : 'Log in or create account'}" style="padding:0;color:var(--text)">${auth ? av : esc('?')}</button><div><div style="font-size:24px;font-weight:800">${auth ? esc(u.name || 'You') : 'Not logged in'}</div>${(() => { const li = levelOf(spotCount()); return li >= 0 ? `<button class="lvl-chip" data-act="levels"><span class="lvl-ico">${LEVELS[li].badge}</span><span class="lvl-txt"><span class="lvl-lv">Level ${li + 1}</span><span class="lvl-nm">${LEVELS[li].name}</span></span>${ICON.chevRight}</button>` : `<button class="lvl-chip start" data-act="levels"><span class="lvl-ico">🌱</span><span class="lvl-txt"><span class="lvl-lv">Level 0</span><span class="lvl-nm">Add a spot to level up</span></span>${ICON.chevRight}</button>`; })()}</div></div>
    ${cloudOn() && !auth ? `<button class="card acct-cta glow" data-act="openauth"><span style="display:flex;flex-direction:column;gap:3px;text-align:left"><b>Create an account</b><span>Save your spots online and use them on any phone</span></span>${ICON.chevRight}</button>` : ''}
    <div class="stats"><div class="stat card"><b>${all.filter(p => p.status === 'spot').length}</b><span>Spots</span></div><div class="stat card"><b style="color:var(--coral-soft)">${all.filter(p => p.status === 'totry').length}</b><span>To try</span></div><div class="stat card"><b>${db.cities.length}</b><span>${db.cities.length === 1 ? 'City' : 'Cities'}</span></div></div>
    <div class="section-label" style="margin-bottom:8px">Current city</div>
    <div class="settings card" style="margin-bottom:18px">${row(`<span style="display:flex;align-items:center;gap:10px"><span class="dot"></span>${esc(city().name)}</span>`, `${plural(cityPlaces().filter(p => p.status === 'spot').length, 'spot')} · ${cityPlaces().filter(p => p.status === 'totry').length} to try`, 'cities')}</div>
    <div class="section-label" style="margin-bottom:8px">Memory recaps</div>
    <div class="settings card rc-glow" style="margin-bottom:18px">${recapList('', new Date().getFullYear()).map(p => recapRow(p)).join('')}<button class="set-row" data-act="allrecaps"><span>Past recaps</span><span class="val">${recapList().filter(p => p.y < new Date().getFullYear()).length ? plural(recapList().filter(p => p.y < new Date().getFullYear()).length, 'recap') : 'All years'}${ICON.chevRight}</span></button>${recapSoonRows()}</div>
    <div class="section-label" style="margin-bottom:8px">Settings</div>
    <div class="settings card">
      ${row('Quick tour', 'See how Sitio works', 'tourreplay')}
      ${auth ? row('Invite friends', 'Send the app link', 'invite') : ''}
      ${auth ? row('Account details', 'username, photo, email', 'profile') : row('Log in or create account', '', 'openauth')}
      ${tog('Opening hours', 'Greys out closed spots on the map', 'hours')}
      ${tog('Dark mode', 'Turn off for a light app and map', 'darkMap')}
      ${row('Directions open in', db.settings.dirApp === 'apple' ? 'Apple Maps' : 'Google Maps', 'dirapp')}
      ${row('Currency', esc(city().currency) + ' (' + esc(city().name) + ')', 'currency')}
      ${STANDALONE ? '' : row('Add Sitio to your home screen', '', 'openinstall')}
      ${row('Back up my spots', 'Save a file', 'backup')}
      <label class="set-row" style="cursor:pointer"><span>Restore from backup</span><span class="val">${ICON.chevRight}</span><input type="file" accept="application/json,.json" hidden data-restore="1"></label>
      ${row('Import from Google Maps', importQ().length ? importQ().length + ' to add' : '', 'openimport')}
      ${row('Privacy', '', 'privacy')}
      ${row('Notifications', pushOn ? 'On' : 'Off', 'notifs')}
    </div>
    ${isAdmin && auth ? `<div class="section-label" style="margin:18px 0 8px">Admin</div><div class="settings card">${row('All users', '', 'admin')}</div>` : ''}
    <p class="page-sub" style="font-size:11px;margin-top:16px;opacity:.6" id="diag">${diag()}</p>
    <p class="page-sub" style="font-size:12px;margin-top:8px;line-height:1.5">${auth ? 'Logged in as ' + esc(auth.user.email) + ' · ' + (/^error/.test(syncState) ? 'Couldn’t reach your account just now. Your changes are safe on this phone and will sync when you’re back online.' : 'Your spots are saved to your account.') : 'Your spots are only on this phone until you create an account.'}</p>
  </div>`;
}

function memCount(online) { let n = 0; db.places.forEach(p => (p.memories || []).forEach(m => { if (!online || m.cloud) n++; })); return n; }
function diag() {
  let safe = 0; try { const p = document.createElement('div'); p.style.cssText = 'position:fixed;bottom:0;height:env(safe-area-inset-bottom);'; document.body.appendChild(p); safe = Math.round(p.getBoundingClientRect().height); p.remove(); } catch (e) { }
  return `v1.9.1 \u00b7 ${STANDALONE ? 'app' : 'browser'} \u00b7 window ${innerWidth}\u00d7${innerHeight} \u00b7 screen ${screen.width}\u00d7${screen.height} \u00b7 frame ${Math.round(root.getBoundingClientRect().height)} \u00b7 safe ${safe} \u00b7 ${auth ? esc(auth.user.email) + ' \u00b7 admin: ' + (isAdmin ? 'yes' : esc(adminErr || 'checking')) + ' \u00b7 sync: ' + (syncState || '–') + ' \u00b7 photos online: ' + memCount(true) + '/' + memCount() + (upErr ? ' \u00b7 photo error: ' + esc(upErr) : '') : 'logged out'}`;
}
function citiesPage() {
  return `<div class="page" style="z-index:15">
    <div class="page-head"><h1 class="page-title">Cities</h1><button class="round sec-btn" style="width:44px;height:44px" data-act="closepage" aria-label="Close">${ICON.close}</button></div>
    ${db.cities.length > 3 || ui.cityQ ? `<label class="search card" style="margin-bottom:12px">${ICON.search}<input type="search" placeholder="Search your cities or a country" data-input="cityQf" value="${esc(ui.cityQ || '')}"></label>` : ''}
    ${ui.cityQ ? '' : `<div class="settings card" style="margin-bottom:16px"><button class="set-row" data-act="pickworld" style="min-height:72px;${ui.globe ? 'background:rgba(var(--fg),0.05)' : ''}"><span style="display:flex;align-items:center;gap:14px"><span class="avatar globe-av">${ICON.globe}</span><span style="display:flex;flex-direction:column;gap:3px"><span style="font-size:17px;font-weight:800">Worldwide</span><span style="font-size:13px;font-weight:600;color:var(--text-2)">${plural(db.places.filter(p => p.status === 'spot').length, 'spot')} · ${db.places.filter(p => p.status === 'totry').length} to try · ${plural(db.cities.filter(c => db.places.some(p => p.cityId === c.id)).length, 'city', 'cities')}</span></span></span>${ui.globe ? `<span style="color:var(--green);display:flex;align-items:center;gap:6px;font-size:12px;font-weight:800">Current${ICON.check}</span>` : ''}</button></div>`}
    <div class="section-label" style="margin-bottom:8px">Your cities</div>
    <div class="settings card">${(ui.cityQ ? cityFilter(db.cities, ui.cityQ) : db.cities.slice().sort((x, y) => (y.id === db.currentCityId ? 1 : 0) - (x.id === db.currentCityId ? 1 : 0) || (y.usedAt || 0) - (x.usedAt || 0))).map(c => { const n = db.places.filter(p => p.cityId === c.id); const curr = !ui.globe && c.id === db.currentCityId;
      return `<button class="set-row" data-act="pickcity" data-id="${c.id}" style="min-height:72px;${curr ? 'background:rgba(var(--fg),0.05)' : ''}"><span style="display:flex;align-items:center;gap:14px"><span class="avatar" style="width:48px;height:48px;border-radius:14px;font-size:18px">${esc(c.name[0])}</span><span style="display:flex;flex-direction:column;gap:3px"><span style="font-size:17px;font-weight:800">${esc(c.name)}</span><span style="font-size:13px;font-weight:600;color:var(--text-2)">${esc(c.country || '')} · ${plural(n.filter(p => p.status === 'spot').length, 'spot')} · ${n.filter(p => p.status === 'totry').length} to try · ${esc(c.currency)}</span></span></span>${curr ? `<span style="color:var(--green);display:flex;align-items:center;gap:6px;font-size:12px;font-weight:800">Current${ICON.check}</span>` : ''}</button>`; }).join('')}
      <button class="set-row" data-act="addcity" style="min-height:64px"><span style="display:flex;align-items:center;gap:14px"><span class="avatar" style="width:48px;height:48px;border-radius:14px;background:transparent;border:1.5px dashed rgba(var(--fg),0.28)">${ICON.plus}</span><span style="font-size:16px;font-weight:800">Add a city or town</span></span></button></div>
    <p class="page-sub" style="font-size:13px;line-height:1.45;margin-top:10px">Each city keeps its own Spots and To try lists. Prices use that city's currency.</p>
  </div>`;
}

function profilePage() {
  if (!auth) return authPage();
  const u = db.user; const av = u.photo && photoUrl(u.photo) ? `<img src="${photoUrl(u.photo)}" alt="">` : (u.avatar ? `<img src="${u.avatar}" alt="">` : esc((u.name || 'You')[0].toUpperCase()));
  return `<div class="page" style="z-index:15">
    <div class="page-head" style="justify-content:flex-start"><button class="round sec-btn" style="width:44px;height:44px" data-act="closepage" aria-label="Back">${ICON.back}</button><span style="font-size:22px;font-weight:800">Account details</span></div>
    <div style="display:flex;flex-direction:column;align-items:center;gap:10px;margin:18px 0 22px"><div class="avatar" style="width:104px;height:104px;border-radius:52px;font-size:42px">${av}</div>
      <label class="link-btn" style="text-decoration:underline;cursor:pointer">Change photo<input type="file" accept="image/*" hidden data-userphoto="1"></label></div>
    <label class="field-label" for="nm">Username</label>
    <div style="display:flex;gap:8px"><input id="nm" class="input card" style="flex:1" value="${esc(ui.unameDraft != null ? ui.unameDraft : (u.name || ''))}" data-input="unameDraft" maxlength="20" autocapitalize="off" autocomplete="username" spellcheck="false"><button class="big-btn primary-btn" style="width:auto;padding:0 18px;height:52px" data-act="saveuname">Save</button></div>
    <div class="page-sub" style="font-size:12px;margin-top:6px">${USER_HINT}</div>
    ${auth ? `<label class="field-label">Email</label><div class="input card" style="display:flex;align-items:center;color:var(--text-2)">${esc(auth.user.email)}</div>
    <div class="settings card" style="margin-top:18px"><button class="set-row" data-act="chpass"><span>Change password</span><span class="val">${ICON.chevRight}</span></button><button class="set-row" data-act="resetmail"><span>Forgot password</span><span class="val" style="font-size:12px">Email me a reset link${ICON.chevRight}</span></button><button class="set-row" data-act="logout"><span style="color:var(--coral-soft)">Log out</span><span class="val"></span></button><button class="set-row" data-act="delacct"><span style="color:var(--coral-soft)">Delete account</span><span class="val"></span></button></div>`
    : `<label class="field-label">Account</label><button class="card acct-cta" data-act="openauth" style="width:100%"><span style="display:flex;flex-direction:column;gap:3px;text-align:left"><b>Create an account or log in</b><span>Save your spots online and use them on any phone</span></span>${ICON.chevRight}</button>`}
  </div>`;
}

function authPage() {
  const m = ui.authMode || 'signup', f = ui.authF || (ui.authF = {});
  const title = m === 'signup' ? 'Create your account' : m === 'login' ? 'Log in' : 'Reset password';
  const btn = ui.authBusy ? 'One moment…' : m === 'signup' ? 'Create account' : m === 'login' ? 'Log in' : 'Send reset link';
  return `<div class="page" style="z-index:15">
    <div class="page-head" style="justify-content:flex-start"><button class="round sec-btn" style="width:44px;height:44px" data-act="closepage" aria-label="Back">${ICON.back}</button><span style="font-size:22px;font-weight:800">${title}</span></div>
    <p class="page-sub" style="margin:4px 0 18px;line-height:1.45">${m === 'reset' ? 'Enter your email and we’ll send you a link to choose a new password.' : 'Your spots are saved online, so they’re safe and show up on any phone you log in on.'}</p>
    ${m === 'signup' ? `<label class="field-label" for="an">Username</label><input id="an" class="input card" data-input="authName" value="${esc(f.name || '')}" autocapitalize="off" spellcheck="false" autocomplete="username" maxlength="20" placeholder="e.g. liaa"><div class="page-sub" style="font-size:12px;margin-top:6px">${USER_HINT}</div>` : ''}
    <label class="field-label" for="ae">Email</label><input id="ae" class="input card" type="email" inputmode="email" autocapitalize="off" autocomplete="email" data-input="authEmail" value="${esc(f.email || '')}" placeholder="you@example.com">
    ${m !== 'reset' ? `<label class="field-label" for="ap">Password</label><input id="ap" class="input card" type="password" autocomplete="${m === 'signup' ? 'new-password' : 'current-password'}" data-input="authPass" value="${esc(f.pass || '')}" placeholder="${m === 'signup' ? 'At least 6 characters' : ''}">` : ''}
    ${ui.authMsg ? `<div class="card note" style="margin:14px 0 0;${ui.authMsg.ok ? '' : 'color:var(--coral-soft)'}">${esc(ui.authMsg.text)}</div>` : ''}
    <button class="big-btn primary-btn" style="width:100%;margin-top:18px" data-act="authgo" ${ui.authBusy ? 'disabled' : ''}>${btn}</button>
    <div style="display:flex;flex-direction:column;align-items:center;gap:12px;margin-top:18px">
      ${m === 'signup' ? '<button class="link-btn" data-act="authmode" data-v="login">Already have an account? Log in</button>' : '<button class="link-btn" data-act="authmode" data-v="signup">New here? Create an account</button>'}
      ${m === 'login' ? '<button class="link-btn" data-act="authmode" data-v="reset">Forgot password?</button>' : ''}
      ${m === 'reset' ? '<button class="link-btn" data-act="authmode" data-v="login">Back to log in</button>' : ''}
    </div>
    <p class="page-sub" style="font-size:11px;line-height:1.5;text-align:center;margin-top:18px;opacity:.8">${m === 'signup' ? 'By creating an account you agree that' : 'By logging in you agree that'} Sitio stores your email and saved places to run your account, as explained in the <button class="link-btn" style="display:inline;padding:0;font-size:11px;text-decoration:underline;color:inherit" data-act="privacy">Privacy notice</button>. You can delete your account at any time.</p>
    <p class="page-sub" style="font-size:12px;text-align:center;margin-top:14px;opacity:.7">Google and Apple sign-in coming soon.</p>
  </div>`;
}

const CONTACT = 'sitio.contact@gmail.com';
const USER_RE = /^[A-Za-z0-9._]{3,20}$/;
const USER_HINT = '3–20 letters, numbers, dots or underscores. No spaces.';
const delWord = () => (db.user.name || '').trim() || 'delete';
const LEVELS = [
  { min: 2, name: 'Exploring spots', badge: '🧭' },
  { min: 5, name: 'Local amateur', badge: '🗺️' },
  { min: 10, name: 'Local guide', badge: '📍' },
  { min: 20, name: 'Professional gatekeeper', badge: '🔑' },
  { min: 50, name: 'Spot connoisseur', badge: '👑' }
];
const spotCount = () => db.places.filter(p => p.status === 'spot').length;
function levelOf(n) { let i = -1; LEVELS.forEach((l, k) => { if (n >= l.min) i = k; }); return i; }
/* ---------- Two-month recap ---------- */
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function recapPer(y, k) { return { y, k, start: new Date(y, k * 2, 1).getTime(), end: new Date(y, k * 2 + 2, 1).getTime(), label: MONTH_NAMES[k * 2] + ' / ' + MONTH_NAMES[k * 2 + 1] }; }
const locMatch = (p, loc) => !loc || (loc.startsWith('cc:') ? ((cityOf(p) || {}).cc || '').toUpperCase() === loc.slice(3) : 'city:' + p.cityId === loc);
function recapItems(per, loc) {
  const out = []; db.places.filter(p => locMatch(p, loc)).forEach(p => (p.memories || []).forEach(m => { if (m.at >= per.start && m.at < per.end) out.push({ m, p }); }));
  return out.sort((x, y) => x.m.at - y.m.at);
}
function recapYear(y) { return { y, k: 'y', year: true, start: new Date(y, 0, 1).getTime(), end: new Date(y + 1, 0, 1).getTime(), label: String(y) }; }
const recapKey = per => 'sitio.recap.' + per.y + '-' + per.k;
// Which recaps are due: the year one from 30 Dec (or in January if missed); a two-month one on its last day (or later if missed)
function dueRecaps(now = new Date()) {
  const y = now.getFullYear(), mo = now.getMonth(), k = Math.floor(mo / 2), out = [];
  if (mo === 11 && now.getDate() >= 30) out.push(recapYear(y));
  if (mo === 0) out.push(recapYear(y - 1));
  if (now.getTime() >= releaseAt(recapPer(y, k))) out.push(recapPer(y, k));
  out.push(k ? recapPer(y, k - 1) : recapPer(y - 1, 5));
  return out;
}
function tryRecap(demo, tries = 0) {
  let per;
  if (demo) {
    if (demo === 'year') per = recapYear(new Date().getFullYear());
    else { const now = new Date(); per = recapPer(now.getFullYear(), Math.floor(now.getMonth() / 2)); for (let n = 0; n < 12 && !recapItems(per).length; n++) per = per.k ? recapPer(per.y, per.k - 1) : recapPer(per.y - 1, 5); }
    if (!per) return;
  }
  else per = dueRecaps().find(p => { try { if (localStorage.getItem(recapKey(p))) return false; } catch (e) { } return recapItems(p).length; });
  if (!per) return;
  const items = recapItems(per); if (!items.length) return;
  const ready = items.filter(x => photoUrl(x.m.id)).length;
  if ((ready < items.length && tries < 10) || ui.dialog || ui.install || ui.sheet || ui.page || ui.tour != null) { if (tries < 160) setTimeout(() => tryRecap(demo, tries + 1), 500); return; }
  if (!ready) return;
  if (!demo) { try { localStorage.setItem(recapKey(per), '1'); } catch (e) { } }
  ui.dialog = { type: 'recap', per, open: false, intro: true, introAt: Date.now() }; render();
}
const releaseAt = per => per.year || per.k === 5 ? new Date(per.y, 11, 30).getTime() : new Date(per.y, per.k * 2 + 2, 0).getTime();
const ordinal = n => n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');
const recapName = per => per.year ? '✨ ' + per.y : per.label.replace(/([A-Z][a-z]{2})[a-z]+/g, '$1');
// Every released recap with memories (optionally for one city or country), newest first
function recapList(loc, year) {
  const now = Date.now(), ats = db.places.flatMap(p => (p.memories || []).map(m => m.at)).filter(Boolean); if (!ats.length) return [];
  const y0 = new Date().getFullYear(), y1 = new Date(Math.min(...ats)).getFullYear(), out = [];
  for (let y = y0; y >= y1; y--) {
    if (year && y !== year) continue;
    const yr = recapYear(y); if (releaseAt(yr) <= now && recapItems(yr, loc).length) out.push(yr);
    for (let k = 5; k >= 0; k--) { const p = recapPer(y, k); if (releaseAt(p) <= now && recapItems(p, loc).length) out.push(p); }
  }
  return out;
}
function recapSoonRows() {
  const now = new Date(), cur = recapPer(now.getFullYear(), Math.floor(now.getMonth() / 2)), yr = recapYear(now.getFullYear());
  return [cur, yr].filter(p => releaseAt(p) > Date.now()).map(p => { const r = new Date(releaseAt(p)); const label = `<span>${esc(recapName(p))}</span><span class="val">Releasing ${ordinal(r.getDate())} ${MONTH_NAMES[r.getMonth()].slice(0, 3)}</span>`; return isAdmin && recapItems(p).length ? `<button class="set-row rc-soon admin" data-act="recapshow" data-y="${p.y}" data-k="${p.k}">${label}</button>` : `<div class="set-row rc-soon">${label}</div>`; }).join('');
}
// Festive background behind a recap: fireworks + sparkles for the year, soft seasonal glow for two-month ones
const SEASON = [['#9CC8FF', '#FFE2A8'], ['#FF9EC4', '#9BE3A8'], ['#FFD66B', '#FFB36B'], ['#FFB44D', '#3FC6D9'], ['#F5A03D', '#C2582E'], ['#8FD8FF', '#D9F2FF']];
function recapBg(per, el = 0) {
  const r = n => { const x = Math.sin(n * 9301 + 49297) * 233280; return x - Math.floor(x); };
  const sparks = Array.from({ length: per.year ? 60 : 18 }, (_, i) => `<b style="left:${(r(i + 1) * 100).toFixed(1)}%;top:${(r(i + 50) * 100).toFixed(1)}%;--s:${(2 + r(i + 90) * 3).toFixed(1)}px;--t:${(1.8 + r(i + 7) * 2.6).toFixed(2)}s;--dl:${(r(i + 3) * 3).toFixed(2)}s"></b>`).join('');
  if (per.year) {
    const cols = ['#FFD23F', '#FF5E5B', '#FF4FB8', '#3FA7FF', '#7CFF6B', '#B07CFF', '#FF9F1C', '#4DF2E0'];
    // 14 bursts spread over the whole screen in a loose grid, each on its own rhythm
    const bursts = Array.from({ length: 14 }, (_, b) => {
      const c = cols[b % cols.length], size = 54 + r(b + 50) * 50, n = 20, parts = Array.from({ length: n }, (_, k) => { const ang = k / n * Math.PI * 2, d = size * (k % 2 ? 1 : .78); return `<i style="--dx:${Math.round(Math.cos(ang) * d)}px;--dy:${Math.round(Math.sin(ang) * d)}px"></i>`; }).join('');
      const col = b % 2, row = Math.floor(b / 2);
      return `<div class="fw" style="left:${(8 + col * 46 + r(b + 200) * 38).toFixed(1)}%;top:${(2 + row * 14 + r(b + 300) * 10).toFixed(1)}%;--c:${c};--dl:${(r(b + 77) * 5).toFixed(2)}s;--ft:${(3.6 + r(b + 88) * 2).toFixed(2)}s">${parts}</div>`;
    }).join('');
    return `<div class="rc-bg year" aria-hidden="true" style="--el:${el}ms">${bursts}<div class="spk">${sparks}</div></div>`;
  }
  const [c1, c2] = SEASON[per.k] || SEASON[0];
  // things that drift down (snow, petals, leaves) or float up (beach bits)
  const fall = (n, glyphs, o = {}) => Array.from({ length: n }, (_, i) => `<s class="${o.up ? 'rise' : 'fall'}" style="left:${(r(i + (o.seed || 0) + 800) * 100).toFixed(1)}%;--fs:${Math.round((o.min || 12) + r(i + 900) * ((o.max || 22) - (o.min || 12)))}px;--t:${((o.t || 12) + r(i + 950) * (o.t || 12) * .8).toFixed(1)}s;--dl:${(-r(i + 990) * 24).toFixed(1)}s;--sw:${Math.round(20 + r(i + 1100) * 40)}px;--o:${o.o || .4}">${glyphs[i % glyphs.length]}</s>`).join('');
  const dots = n => fall(n, ['<i></i>'], { min: 3, max: 8, t: 9, o: .7, seed: 40 });
  const sun = cls => `<div class="sun ${cls || ''}"></div>`;
  const waves = '<svg class="waves" viewBox="0 0 1200 120" preserveAspectRatio="none"><path class="w1" d="M0 60 Q150 20 300 60 T600 60 T900 60 T1200 60 V120 H0Z"/><path class="w2" d="M0 75 Q150 40 300 75 T600 75 T900 75 T1200 75 V120 H0Z"/></svg>';
  const theme = [
    { cls: 'winter', html: sun('pale') + dots(26) + fall(5, ['❄'], { min: 12, max: 18, t: 16, o: .3, seed: 7 }) },              // Jan / Feb: snow and low winter sun
    { cls: 'spring', html: fall(16, ['🌸', '🌸', '🌼', '🍃'], { min: 12, max: 20, t: 13, o: .45, seed: 3 }) },                    // Mar / Apr: blossom
    { cls: 'summer', html: sun() + fall(14, ['<i></i>'], { min: 3, max: 6, t: 14, o: .5, up: true, seed: 11 }) },                // May / Jun: sunshine
    { cls: 'beach', html: sun('low') + waves + fall(9, ['🍹', '🌴', '🍉', '🐚', '🏖️', '🥥'], { min: 18, max: 26, t: 16, o: .32, up: true, seed: 5 }) }, // Jul / Aug: beach days
    { cls: 'autumn', html: fall(16, ['🍂', '🍁', '🍂', '🍃'], { min: 14, max: 22, t: 12, o: .45, seed: 9 }) },                    // Sep / Oct: falling leaves
    { cls: 'icy', html: dots(40) + fall(8, ['❄', '❅', '❆'], { min: 12, max: 22, t: 14, o: .4, seed: 2 }) }                        // Nov / Dec: snow and ice
  ][per.k] || { cls: '', html: '' };
  return `<div class="rc-bg ${theme.cls}" aria-hidden="true" style="--c1:${c1};--c2:${c2};--el:${el}ms">${theme.html}<div class="spk">${sparks}</div></div>`;
}
const recapRow = (p, loc) => `<button class="set-row" data-act="recapshow" data-y="${p.y}" data-k="${p.k}" data-loc="${esc(loc || '')}"><span>${esc(recapName(p))}</span><span class="val">${plural(recapItems(p, loc).length, 'memory', 'memories')}${ICON.chevRight}</span></button>`;
function recapsPage() {
  const f = ui.recapF || (ui.recapF = { y: '', loc: '' });
  const ats = db.places.flatMap(p => (p.memories || []).map(m => m.at)).filter(Boolean);
  const years = []; if (ats.length) for (let y = new Date().getFullYear(); y >= new Date(Math.min(...ats)).getFullYear(); y--) years.push(y);
  const withMem = db.cities.filter(c => db.places.some(p => p.cityId === c.id && (p.memories || []).length));
  const countries = [...new Map(withMem.filter(c => c.cc).map(c => [c.cc.toUpperCase(), c.country || c.cc.toUpperCase()])).entries()];
  const list = recapList(f.loc, f.y ? +f.y : 0);
  const locName = !f.loc ? 'All places' : f.loc.startsWith('cc:') ? ((countries.find(x => x[0] === f.loc.slice(3)) || [])[1] || 'Country') : ((db.cities.find(c => 'city:' + c.id === f.loc) || {}).name || 'City');
  const sel = (key, label, opts) => `<label class="pill sec-btn rc-sel">${esc(label)}${ICON.chevDown}<select data-input="${key}">${opts}</select></label>`;
  const byYear = {}; list.forEach(p => { (byYear[p.y] = byYear[p.y] || []).push(p); });
  return `<div class="page" style="z-index:15">
    <div class="page-head" style="justify-content:flex-start;gap:10px"><button class="round sec-btn" style="width:44px;height:44px;flex:none" data-act="closepage" aria-label="Back">${ICON.back}</button><h1 class="page-title" style="font-size:28px">All recaps</h1></div>
    <div class="row-btns">${sel('recapY', f.y || 'All years', `<option value="">All years</option>${years.map(y => `<option value="${y}" ${String(y) === f.y ? 'selected' : ''}>${y}</option>`).join('')}`)}${sel('recapLoc', locName, `<option value="">All places</option>${countries.length ? `<optgroup label="Countries">${countries.map(([cc, n]) => `<option value="cc:${cc}" ${f.loc === 'cc:' + cc ? 'selected' : ''}>${esc(n)}</option>`).join('')}</optgroup>` : ''}${withMem.length ? `<optgroup label="Cities">${withMem.map(c => `<option value="city:${c.id}" ${f.loc === 'city:' + c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</optgroup>` : ''}`)}</div>
    ${list.length ? Object.keys(byYear).sort((x, y) => y - x).map(y => `<div class="section-label" style="margin:14px 0 8px">${y}</div><div class="settings card">${byYear[y].map(p => recapRow(p, f.loc)).join('')}</div>`).join('') : `<div class="empty card" style="border-radius:20px;margin-top:12px">No recaps here yet.<br>They’re released on the last day of every two months.</div>`}
  </div>`;
}
function showLevelUp(i, demo) {
  const d = { type: 'levelup', i, demo }; ui.dialog = d; render();
  setTimeout(() => { if (ui.dialog === d) { const el = uiEl.querySelector('.levelup'); if (el) el.classList.add('out'); setTimeout(() => { if (ui.dialog === d) { ui.dialog = null; render(); } }, 300); } }, 4000);
}
function checkLevel() {
  const i = levelOf(spotCount());
  if (db.levelSeen === undefined) { db.levelSeen = i; return; }
  if (i > db.levelSeen) { db.levelSeen = i; save(); setTimeout(() => { if (!ui.dialog) showLevelUp(i); }, 900); }
  else if (i < db.levelSeen) db.levelSeen = i;
}
function levelsPage() {
  const n = spotCount(), i = levelOf(n), next = LEVELS[i + 1];
  const pct = next ? Math.max(4, Math.min(100, Math.round(n / next.min * 100))) : 100;
  return `<div class="page" style="z-index:15">
    <div class="page-head" style="justify-content:flex-start"><button class="round sec-btn" style="width:44px;height:44px" data-act="closepage" aria-label="Back">${ICON.back}</button><span style="font-size:22px;font-weight:800">Your level</span></div>
    <div class="card lvl-hero"><div class="lvl-badge big">${i >= 0 ? LEVELS[i].badge : '🌱'}</div>
      <div style="font-size:24px;font-weight:800;margin-top:10px">${i >= 0 ? LEVELS[i].name : 'Just getting started'}</div>
      <div class="page-sub" style="margin-top:4px">${n} ${n === 1 ? 'spot' : 'spots'} saved</div>
      ${next ? `<div class="lvl-bar"><span style="width:${pct}%"></span></div><div class="lvl-count">${n} / ${next.min} spots</div><div class="page-sub" style="font-size:13px">${next.min - n} more ${next.min - n === 1 ? 'spot' : 'spots'} to <b style="color:var(--text)">${next.name}</b> ${next.badge}</div>` : '<div class="page-sub" style="margin-top:12px;font-size:13px">Top level reached. You know every spot worth knowing.</div>'}
    </div>
    <div class="section-label" style="margin:20px 0 8px">All levels</div>
    <div class="settings card lvl-list">${LEVELS.map((l, k) => { const done = k <= i; const to = LEVELS[k + 1] ? LEVELS[k + 1].min - 1 : null;
      return `<div class="set-row" style="min-height:66px;${k === i ? 'background:rgba(var(--fg),0.06)' : ''}"><span style="display:flex;align-items:center;gap:14px"><span class="lvl-badge ${done ? '' : 'locked'}">${l.badge}</span><span style="display:flex;flex-direction:column;gap:2px"><span style="font-weight:800">${l.name}</span><span style="font-size:12px;font-weight:600;color:var(--text-2)">${to ? l.min + '–' + to : l.min + '+'} spots</span></span></span><span class="tl ${k === 0 ? 'first' : ''} ${k === LEVELS.length - 1 ? 'last' : ''} ${k < i ? 'past' : ''} ${k === i ? 'here' : ''} ${k > i ? 'future' : ''} ${k <= i ? 'up-gold' : ''}" aria-label="${k === i ? 'You are here' : done ? 'Reached' : 'Not reached yet'}"><i class="tl-up"></i><i class="tl-dot"></i><i class="tl-down"></i></span></div>`; }).join('')}</div>
    <p class="page-sub" style="font-size:12px;margin-top:10px">Every place in Spots counts, in every city.</p>
  </div>`;
}
const EURO = 'AT BE HR CY EE FI FR DE GR IE IT LV LT LU MT NL PT SK SI ES AD MC SM VA ME XK BG'.split(' ');
const CUR_BY_CC = { GB: '£', GI: '£', IM: '£', JE: '£', GG: '£', US: '$', CA: '$', AU: 'A$', NZ: '$', MX: '$', AR: '$', CL: '$', CO: '$', SG: '$', HK: '$', CH: 'CHF', LI: 'CHF', SE: 'kr', NO: 'kr', DK: 'kr', IS: 'kr', PL: 'zł', CZ: 'Kč', HU: 'Ft', JP: '¥', CN: '¥', KR: '₩', TH: '฿', IN: '₹', BR: 'R$', TR: '₺', AE: 'د.إ', ZA: 'R', MA: 'DH', RO: 'lei', IL: '₪', ID: 'Rp', VN: '₫', PH: '₱', MY: 'RM', EG: 'E£', PE: 'S/', UA: '₴', RS: 'din', GE: '₾' };
// Every official currency (from the phone's own currency data), with a short symbol and English name
const ALL_CUR = (() => {
  try {
    const dn = new Intl.DisplayNames(['en'], { type: 'currency' });
    const sym = c => { try { return new Intl.NumberFormat('en', { style: 'currency', currency: c, currencyDisplay: 'narrowSymbol' }).formatToParts(1).find(p => p.type === 'currency').value; } catch (e) { return c; } };
    return Intl.supportedValuesOf('currency').filter(c => !/^X(AU|AG|PT|PD|DR|SU|UA|TS|XX|BA|BB|BC|BD|FO|FU|RE)$/.test(c) && !/\(|Fund|Unit|Equivalent|Bond/.test(dn.of(c)))
      .map(code => ({ code, name: dn.of(code), sym: sym(code) }));
  } catch (e) { return null; }
})();
function curResults(d, c) { const res = curSearch(d.q || ''); if (res && !res.length) return '<p style="margin:6px 0 4px">No currency found. Check the spelling.</p>';
        const items = res || CURRENCIES.map(([sym, name]) => ({ sym, name, code: '' }));
        return `<div class="cur-grid">${items.map(x => `<button class="cur ${c.currency === x.sym ? 'on' : ''}" data-act="pickcur" data-v="${esc(x.sym)}"><b>${esc(x.sym)}</b><span>${esc(x.name)}</span>${res && x.code !== x.sym ? `<span class="cur-code">${esc(x.code)}</span>` : ''}</button>`).join('')}</div>${res ? '' : `<p style="margin:10px 0 0;font-size:12px">${ALL_CUR ? ALL_CUR.length : CURRENCIES.length} currencies. Search to see them all.</p>`}`; }
function lev(a, b) { // edit distance where swapping two letters counts as one typo
  const m = a.length, n = b.length, d = []; for (let i = 0; i <= m; i++) { d[i] = [i]; } for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) { const c = a[i - 1] === b[j - 1] ? 0 : 1; d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c); if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1); }
  return d[m][n];
}
const POPULAR_CUR = ['EUR', 'GBP', 'USD', 'CHF', 'JPY', 'AUD', 'CAD', 'MXN', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'TRY', 'MAD', 'BRL', 'INR', 'THB', 'AED', 'ZAR'];
// Search currencies by name, code or symbol, forgiving typos ("uero" finds Euro)
function curSearch(q) {
  q = q.trim().toLowerCase(); const list = ALL_CUR || CURRENCIES.map(([sym, name]) => ({ code: sym, name, sym }));
  if (!q) return null;
  return list.map(c => {
    const words = (c.name + ' ' + c.code).toLowerCase().split(/[\s-]+/);
    let s = 99;
    if (c.code.toLowerCase() === q || c.sym.toLowerCase() === q) s = 0;
    else if (c.name.toLowerCase().includes(q)) s = 1;
    else if (q.length >= 3) words.forEach(w => { const d = Math.min(lev(q, w), lev(q, w.slice(0, q.length))); const tol = q.length <= 4 ? 1 : 2; if (d <= tol) s = Math.min(s, 2 + d); });
    return { c, s, pop: POPULAR_CUR.indexOf(c.code) < 0 ? 99 : POPULAR_CUR.indexOf(c.code) };
  }).filter(x => x.s < 99).sort((a, b) => a.s - b.s || a.pop - b.pop || a.c.name.localeCompare(b.c.name)).slice(0, 16).map(x => x.c);
}
const currencyFor = cc => cc ? (EURO.includes(cc) ? '€' : (CUR_BY_CC[cc] || '€')) : '€';
const CURRENCIES = [['€', 'Euro'], ['£', 'Pound'], ['$', 'Dollar'], ['A$', 'Aus dollar'], ['DH', 'Dirham (MA)'], ['lei', 'Leu'], ['₪', 'Shekel'], ['Rp', 'Rupiah'], ['CHF', 'Swiss franc'], ['kr', 'Krona / krone'], ['zł', 'Złoty'], ['Kč', 'Koruna'], ['Ft', 'Forint'], ['¥', 'Yen / yuan'], ['₩', 'Won'], ['฿', 'Baht'], ['₹', 'Rupee'], ['R$', 'Real'], ['₺', 'Lira'], ['د.إ', 'Dirham'], ['R', 'Rand']];
function notifsPage() {
  const sw = (label, sub, key, dis) => `<div class="set-row" ${dis ? 'style="opacity:.45"' : ''}><span style="display:flex;flex-direction:column;gap:2px"><span>${label}</span><span style="font-size:12px;font-weight:600;color:var(--text-2)">${sub}</span></span><button class="toggle ${db.settings[key] ? 'on' : ''}" data-act="toggle" data-key="${key}" aria-pressed="${!!db.settings[key]}" aria-label="${label}" ${dis ? 'disabled' : ''}></button></div>`;
  const blocked = 'Notification' in window && Notification.permission === 'denied';
  const status = !pushSupported() ? (IS_IOS && !STANDALONE ? 'Add Sitio to your Home Screen to get notifications. iPhone only allows them there.' : 'This phone or browser doesn’t support notifications.')
    : !auth ? 'Log in to turn on notifications.' : blocked ? 'Notifications are blocked for Sitio. Turn them on in your phone’s Settings → Notifications → Sitio.' : '';
  const s = (h, t) => `<div class="section-label" style="margin:18px 0 6px">${h}</div><p class="page-sub" style="line-height:1.55;font-size:14px">${t}</p>`;
  return `<div class="page" style="z-index:16">
    <div class="page-head" style="justify-content:flex-start"><button class="round sec-btn" style="width:44px;height:44px" data-act="closepage" aria-label="Back">${ICON.back}</button><span style="font-size:22px;font-weight:800">Notifications</span></div>
    ${status ? `<div class="card note" style="margin-bottom:14px">${esc(status)}</div>` : ''}
    <div class="settings card" style="margin-bottom:18px"><div class="set-row"><span style="display:flex;flex-direction:column;gap:2px"><span>Notifications on this phone</span><span style="font-size:12px;font-weight:600;color:var(--text-2)">${pushOn ? 'On' : 'Off'}</span></span><button class="toggle ${pushOn ? 'on' : ''}" data-act="pushtoggle" aria-pressed="${pushOn}" aria-label="Notifications on this phone" ${status ? 'disabled' : ''}></button></div></div>
    <div class="section-label" style="margin-bottom:8px">What you get</div>
    <div class="settings card">
      ${sw('Memory recaps', 'Every two months, and your year in December', 'nRecaps', !pushOn)}
      ${sw('Spots and friends', 'When a friend shares something with you', 'nFriends', !pushOn)}
      ${sw('Events in ' + esc(city().name), 'Events happening in your city · off unless you turn it on', 'nEvents', !pushOn)}
    </div>
    ${s('How we use notifications', 'We only send the types you switch on above. Events are promotional, so they stay off unless you choose them. We never sell or share your details, and there are no ads from other companies.')}
    ${s('What we keep', 'When you turn notifications on, your phone gives Sitio a private notification address. We keep it with your account only to send the notifications you chose, and delete it when you turn them off, block them on your phone, or delete your account.')}
    ${s('Changing your mind', 'Switch any type off here, or turn notifications off completely here or in your phone’s Settings. It takes effect straight away. Questions: ' + CONTACT + '.')}
  </div>`;
}
function privacyPage() {
  const s = (h, t) => `<div class="section-label" style="margin:18px 0 6px">${h}</div><p class="page-sub" style="line-height:1.55;font-size:14px">${t}</p>`;
  return `<div class="page" style="z-index:16">
    <div class="page-head" style="justify-content:flex-start"><button class="round sec-btn" style="width:44px;height:44px" data-act="closepage" aria-label="Back">${ICON.back}</button><span style="font-size:22px;font-weight:800">Privacy</span></div>
    <p class="page-sub" style="line-height:1.55;font-size:14px">Sitio is a small, independent app. This explains what it keeps about you and why.</p>
    ${s('What’s stored', 'If you create an account: your email, your name and the places you save (names, locations, notes, prices, cities and settings). Your password is stored encrypted and nobody can read it. Memory photos are stored privately in your account: only you can see them.')}
    ${s('Why', 'Only to keep your lists safe and let you use them on any phone you log in on. Nothing is sold, shared or used for advertising.')}
    ${s('Who can see it', 'You. We at Sitio can also see account emails and saved lists, only to keep the app working, fix problems and help if you ask. Places you share with a link are seen by whoever you send it to.')}
    ${s('Where', 'Accounts and lists are stored with Supabase on servers in the EU. Maps and place search are provided by Google, under Google’s privacy policy.')}
    ${s('Notifications', 'Only if you turn them on: we keep a private notification address from your phone to send the types you chose (memory recaps, spots and friends, events). Events are off unless you switch them on. Turn any of them off under Notifications in Settings.')}
    ${s('Without an account', 'Everything stays on your phone only. Nothing is sent to Sitio.')}
    ${s('Your choices', 'You can see and change your data in the app, download it under Back up my spots, and delete your account at any time under Account details, which removes your email and lists for good. For anything else, email ' + CONTACT + '.')}
    <p class="page-sub" style="font-size:12px;margin-top:18px;opacity:.7">Last updated November 2026</p>
  </div>`;
}
const fmtDate = t => t ? new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '–';
function adminPage() {
  const users = ui.adminData;
  const head = `<div class="page-head" style="justify-content:flex-start"><button class="round sec-btn" style="width:44px;height:44px" data-act="closepage" aria-label="Back">${ICON.back}</button><span style="font-size:22px;font-weight:800">All users</span></div>`;
  if (ui.adminErr) return `<div class="page" style="z-index:15">${head}<div class="card note">${esc(ui.adminErr)}</div></div>`;
  if (!users) return `<div class="page" style="z-index:15">${head}<p class="page-sub">Loading…</p></div>`;
  const cnt = (d, st) => ((d && d.places) || []).filter(p => p.status === st).length;
  return `<div class="page" style="z-index:15">${head}
    <p class="page-sub" style="margin-bottom:14px">${users.length} ${users.length === 1 ? 'account' : 'accounts'} · only you can see this</p>
    <button class="card acct-cta" data-act="worldmap" style="width:100%;margin:0 0 14px"><span style="display:flex;align-items:center;gap:12px;text-align:left"><span style="font-size:26px">🌍</span><span style="display:flex;flex-direction:column;gap:3px"><b>World map</b><span>Every place saved by everyone, on one map</span></span></span>${ICON.chevRight}</button>
    <div class="settings card">${users.map(u => `<button class="set-row" data-act="adminuser" data-id="${esc(u.user_id)}" style="min-height:72px"><span style="display:flex;align-items:center;gap:12px;min-width:0"><span class="avatar" style="width:44px;height:44px;border-radius:22px;font-size:17px;flex:none">${u.data && u.data.user && u.data.user.avatar && /^data:image\//.test(u.data.user.avatar) ? `<img src="${u.data.user.avatar}" alt="">` : esc(((u.data && u.data.user && u.data.user.name) || u.email || '?')[0].toUpperCase())}</span><span style="display:flex;flex-direction:column;gap:3px;text-align:left;min-width:0"><span style="font-weight:800;font-size:16px;overflow:hidden;text-overflow:ellipsis">${esc((u.data && u.data.user && u.data.user.name) || 'No username yet')}</span><span style="font-size:12px;font-weight:600;color:var(--text-2);overflow:hidden;text-overflow:ellipsis">${esc(u.email || '(no email)')}</span><span style="font-size:12px;font-weight:600;color:var(--text-3)">Joined ${fmtDate(u.created_at)} · ${u.data ? cnt(u.data, 'spot') + (cnt(u.data, 'spot') === 1 ? ' spot · ' : ' spots · ') + cnt(u.data, 'totry') + ' to try · ' + ((u.data.cities || []).length) + ((u.data.cities || []).length === 1 ? ' city' : ' cities') : 'nothing synced yet'}</span></span></span><span class="val">${ICON.chevRight}</span></button>`).join('')}</div>
  </div>`;
}
function adminUserPage(id, cityId) {
  const u = (ui.adminData || []).find(x => x.user_id === id); if (!u) return '';
  const d = u.data || {}, places = d.places || [], cities = (d.cities || []).slice();
  places.forEach(p => { if (!cities.some(c => c.id === p.cityId)) cities.push({ id: p.cityId, name: 'Other' }); });
  const name = (d.user && d.user.name) || 'No username yet';
  const back = `<button class="round sec-btn" style="width:44px;height:44px;flex:none" data-act="closepage" aria-label="Back">${ICON.back}</button>`;
  if (!cityId) {
    return `<div class="page" style="z-index:16">
      <div class="page-head" style="justify-content:flex-start">${back}<span style="font-size:22px;font-weight:800;overflow:hidden;text-overflow:ellipsis">${esc(name)}</span></div>
      <p class="page-sub" style="margin:0 0 2px">${esc(u.email || '')}</p>
      <p class="page-sub" style="font-size:12px;margin:0 0 16px">Joined ${fmtDate(u.created_at)} · last login ${fmtDate(u.last_sign_in_at)}</p>
      ${!u.data ? '<div class="card note">Nothing has synced to this account yet. It appears once they open Sitio while logged in and online.</div>'
      : `${cities.length > 3 || ui.adminCityQ ? `<label class="search card" style="margin-bottom:12px">${ICON.search}<input type="search" placeholder="Search a city or country" data-input="adminCityQ" value="${esc(ui.adminCityQ || '')}"></label>` : ''}<div class="section-label" style="margin-bottom:8px">Cities</div><div class="settings card">${cityFilter(cities, ui.adminCityQ).map(c => { const ps = places.filter(p => p.cityId === c.id);
          return `<button class="set-row" data-act="admincity" data-id="${esc(u.user_id)}" data-city="${esc(c.id)}" style="min-height:64px"><span style="display:flex;flex-direction:column;gap:3px;text-align:left"><span style="font-weight:800;font-size:16px">${esc(c.name)}${c.country ? `<span style="font-weight:600;color:var(--text-2)"> · ${esc(c.country)}</span>` : ''}</span><span style="font-size:12px;font-weight:600;color:var(--text-2)">${ps.filter(p => p.status === 'spot').length} ${ps.filter(p => p.status === 'spot').length === 1 ? 'spot' : 'spots'} · ${ps.filter(p => p.status === 'totry').length} to try</span></span><span class="val">${ICON.chevRight}</span></button>`; }).join('')}</div>`}
    </div>`;
  }
  const c = cities.find(x => x.id === cityId) || { name: 'City' }, cur = c.currency || '€';
  const ps = places.filter(p => p.cityId === cityId), sp = ps.filter(p => p.status === 'spot'), tt = ps.filter(p => p.status === 'totry');
  const catName = k => (CATS.find(x => x.id === k) || {}).name || k;
  const line = p => `<button class="set-row" data-act="adminplace" data-id="${esc(u.user_id)}" data-city="${esc(cityId)}" data-place="${esc(p.id)}" style="min-height:56px"><span style="display:flex;flex-direction:column;gap:2px;text-align:left"><span style="font-weight:800">${esc(p.name)}${p.fav ? ' ★' : ''}${p.sample ? ' <span style="font-size:11px;font-weight:700;color:var(--text-2)">starter</span>' : ''}</span><span style="font-size:12px;font-weight:600;color:var(--text-2)">${esc([catNames(p), p.cuisine, p.area].filter(Boolean).join(' · '))}${p.note ? ' — ' + esc(p.note) : ''}</span></span><span class="val">${p.price ? esc(cur.repeat(p.price)) : ''}${ICON.chevRight}</span></button>`;
  return `<div class="page" style="z-index:17">
    <div class="page-head" style="justify-content:flex-start">${back}<span style="display:flex;flex-direction:column;min-width:0"><span style="font-size:22px;font-weight:800">${esc(c.name)}</span><span style="font-size:12px;font-weight:600;color:var(--text-2);overflow:hidden;text-overflow:ellipsis">${esc(name)} · ${esc(u.email || '')}</span></span></div>
    <div class="section-label" style="margin:10px 0 8px">Spots (${sp.length})</div>${sp.length ? `<div class="settings card">${sp.map(line).join('')}</div>` : '<div class="card note" style="margin:0">No spots here yet.</div>'}
    <div class="section-label" style="margin:18px 0 8px">To try (${tt.length})</div>${tt.length ? `<div class="settings card">${tt.map(line).join('')}</div>` : '<div class="card note" style="margin:0">Nothing to try here yet.</div>'}
  </div>`;
}

function spotPage(p, ro) {
  if (ro) return `<div class="page" style="z-index:18;padding-bottom:calc(var(--safe-bottom) + 30px)">
    <div class="hero">${art(p)}<div class="hero-btns"><button class="round glass" data-act="closepage" aria-label="Back">${ICON.back}</button><div></div></div></div>
    <div class="spot-body">
      <div style="display:flex;align-items:center;gap:10px"><h1 class="big-name" style="font-size:30px">${esc(p.name)}</h1>${p.status === 'totry' ? '<span class="tag">TO TRY</span>' : ''}${p.fav ? `<span class="star-btn on" style="display:flex">${ICON.star}</span>` : ''}</div>
      <div class="meta">${esc(metaLine(p))}</div>
      ${status(p) ? hoursLine(p) : ''}
      ${p.status === 'spot' && p.price ? `<div class="price-line"><span class="price"><span class="on">${esc(ro.cur.repeat(p.price))}</span><span class="off">${esc(ro.cur.repeat(3 - p.price))}</span></span>${PRICE_WORDS[p.price] || ''}</div>` : ''}
      ${p.note ? `<div class="note card">${esc(p.note)}</div>` : '<div style="height:16px"></div>'}
      <div class="btn-grid" style="margin-bottom:10px"><button class="big-btn primary-btn" data-act="copyspot">${ICON.check}Add to my Spots</button><button class="big-btn coral-btn" data-act="copytry">${ICON.plus}Add to my To try</button></div>
      <p class="page-sub" style="font-size:12px;margin:0 0 14px">Saved by ${esc(ro.who)}${p.addedAt ? ' · ' + fmtDate(p.addedAt) : ''}. Their photos stay on their phone.</p>
      ${dirButtons(p)}
    </div></div>`;
  const photos = (p.photos || []);
  const strip = photos.map((id, i) => { const u = photoUrl(id); return `<div style="height:72px;border-radius:12px;overflow:hidden;background:var(--surface)">${u ? `<img src="${u}" alt="" style="width:100%;height:100%;object-fit:cover">` : ''}</div>`; }).join('');
  return `<div class="page" style="z-index:15;padding-bottom:calc(var(--safe-bottom) + 30px)">
    <div class="hero">${art(p)}<div class="hero-btns"><button class="round glass" data-act="closepage" aria-label="Back">${ICON.back}</button><div><button class="round glass" data-act="share" data-id="${p.id}" aria-label="Share">${ICON.share}</button><button class="round glass" data-act="del" data-id="${p.id}" aria-label="Delete" style="color:var(--coral-soft)">${ICON.bin}</button></div></div></div>
    <div class="spot-body">
      <h1 class="big-name" style="font-size:30px">${esc(p.name)}</h1>
      <div class="meta meta-edit">${esc(metaLine(p))}<button class="pen" data-act="editcat" data-id="${p.id}" aria-label="Change category">${ICON.pen}</button></div>
      ${hoursLine(p)}
      <div class="price-line">${priceHtml(p.price, p)}${PRICE_WORDS[p.price] || (catsOf(p).includes('chill') ? 'Free' : '')}<button class="pen" data-act="editprice" data-id="${p.id}" aria-label="Edit price">${ICON.pen}</button></div>
      ${p.note ? `<div class="note card">${esc(p.note)}</div>` : '<div style="height:16px"></div>'}
      ${memoriesHtml(p)}
      <div class="section-label" style="margin-bottom:8px">Photos</div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:18px">${strip}<label class="add-photo" style="height:72px;border-radius:12px;cursor:pointer">${ICON.plus}<input type="file" accept="image/*" hidden data-photo="${p.id}"></label></div>
      ${dirButtons(p)}
    </div></div>`;
}

function addSheet() {
  const a = ui.add;
  const cuisineChips = true ? `<label class="field-label">Cuisine <span style="text-transform:none;letter-spacing:0;font-weight:600;opacity:.7">· optional, pick any</span></label><div class="chips">${CUISINES.map(c => `<button class="chip ${cuisList(a).includes(c) ? 'on' : ''}" data-act="addcuisine" data-v="${esc(c)}">${esc(c)}</button>`).join('')}</div>` : '';
  const pics = a.photos.map((id, i) => `<div style="height:76px;border-radius:14px;overflow:hidden;position:relative"><img src="${photoUrl(id)}" alt="" style="width:100%;height:100%;object-fit:cover"><button class="round" data-act="addrmphoto" data-i="${i}" aria-label="Remove photo" style="position:absolute;top:4px;right:4px;width:28px;height:28px;background:rgba(0,0,0,.6);border:0">${ICON.close}</button></div>`).join('');
  return `<div class="sheet" role="dialog" aria-label="Add a spot" style="max-height:94%">
    <div class="grab"></div>
    <div class="name-row"><div><div class="muted" style="font-size:13px;font-weight:700">Add a spot</div><div style="font-size:22px;font-weight:800">${esc(a.name || 'New place')}</div></div><button class="round sec-btn" style="width:44px;height:44px" data-act="closesheet" aria-label="Close">${ICON.close}</button></div>
    <label class="field-label" for="a-name">${a.custom ? 'Spot name' : 'Place'}</label>
    <div style="position:relative;${a.custom ? 'display:flex;gap:8px;align-items:center' : ''}"><input id="a-name" class="input card" ${a.custom ? 'style="flex:1;min-width:0"' : ''} placeholder="${a.custom ? 'Give the spot a name' : (mapApi.google ? 'Search for a place' : 'Name of the place')}" value="${esc(a.name)}" data-input="addName" autocomplete="off" maxlength="80">${a.custom ? `<button class="round sec-btn unpin-x" data-act="unpin" aria-label="Remove the pin and search for a place instead">${ICON.close}</button>` : ''}
      <div id="suggest"></div></div>
    <div class="loc-line">${a.googleId ? `<span class="muted">✓ Location from Google</span><button class="link-btn" data-act="droppin">${ICON.pin}Move pin</button>` : a.custom ? `<span style="color:var(--green)">✓ Pin dropped</span><button class="link-btn" data-act="droppin">${ICON.pin}Move pin</button></div><div class="muted" style="font-size:12px;font-weight:600;margin-top:2px">Tap × to remove the pin and search Google instead` : `<span class="muted">Not on Google Maps?</span><button class="link-btn" data-act="droppin">${ICON.pin}Drop a pin</button>`}</div>
    <label class="field-label">Category <span style="text-transform:none;letter-spacing:0;font-weight:600;opacity:.7">· pick one or more</span></label>
    <div class="cat-grid">${CATS.map(c => `<button class="sec-btn ${catsOf(a).includes(c.id) ? 'on' : ''}" data-act="addcat" data-v="${c.id}" aria-pressed="${catsOf(a).includes(c.id)}">${ICON.cat[c.id]}${c.name}</button>`).join('')}</div>
    ${cuisineChips}
    <label class="field-label">Photos</label>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">${pics}<label class="add-photo" style="height:76px;border-radius:14px;cursor:pointer">${ICON.plus}Add yours<input type="file" accept="image/*" hidden data-addphoto="1"></label></div>
    <label class="field-label" for="a-note">Your note</label>
    <textarea id="a-note" class="input card" rows="1" placeholder="What to order, when to go…" data-input="addNote" maxlength="500">${esc(a.note)}</textarea>
    <div class="add-actions"><button class="big-btn primary-btn" data-act="addsave">Save to Spots</button><button class="big-btn coral-btn" data-act="addtry">Add to To try</button></div>
  </div>`;
}

function dialogView() {
  const d = ui.dialog; if (!d) return '';
  if (d.type === 'price') {
    const p = d.place; const n = d.free ? 0 : (d.value || 0); const ok = n || d.free;
    return `<div class="dialog-scrim" data-act="closedialog"></div><div class="dialog" role="dialog" aria-labelledby="dlg-t">
      <h3 id="dlg-t">${d.edit ? 'Edit price for ' + esc(p.name) : 'How expensive is ' + esc(p.name) + '?'}</h3><p>${d.edit ? 'Currently ' + (PRICE_WORDS[p.price] || (d.allowFree ? 'free' : 'not set')) : (d.hint ? esc(d.hint) : 'Tap to rate the price')}</p>
      <div class="euro-bar" role="radiogroup" aria-label="Price">${[1, 2, 3].map(i => `<button class="${i <= n ? 'on' : ''}" role="radio" aria-checked="${i === n}" aria-label="${PRICE_WORDS[i]}" data-act="setprice" data-v="${i}">${esc(cur())}</button>`).join('')}</div>
      <span class="price-word">${d.free ? 'Free' : (PRICE_WORDS[n] || '')}</span>
      ${d.allowFree ? `<button class="pill ${d.free ? 'green-on' : 'sec-btn'}" style="margin:0 auto 14px" data-act="setfree" aria-pressed="${!!d.free}">${d.free ? ICON.check : ''}Free · no price</button>` : ''}
      <div class="stack"><button class="big-btn primary-btn" data-act="pricesave" ${ok ? '' : 'style="opacity:.45"'}>${d.edit ? 'Save' : 'Save to Spots'}</button><button class="big-btn" style="background:none;border:0;height:44px;color:var(--text-soft)" data-act="closedialog">Cancel</button></div></div>`;
  }
  if (d.type === 'confirm') {
    const p = d.place; const isTry = p.status === 'totry';
    return `<div class="dialog-scrim" data-act="closedialog"></div><div class="dialog" role="alertdialog" aria-labelledby="dlg-t">
      <h3 id="dlg-t">${isTry ? 'Remove ' + esc(p.name) + '?' : 'Delete ' + esc(p.name) + ' from Spots?'}</h3><p>${isTry ? 'It’ll be deleted from To try.' : 'It’ll come off your map and list, with its photos and note.'} You can’t undo this.</p>
      <div class="btn-grid"><button class="big-btn sec-btn" data-act="closedialog">Cancel</button><button class="big-btn coral-btn" data-act="confirmdel">${isTry ? 'Remove' : 'Delete'}</button></div></div>`;
  }
  if (d.type === 'more') {
    const it = (act, id, icon, label, cls = '') => `<button class="pm-item ${cls}" data-act="${act}" data-id="${id}"><span>${label}</span>${icon}</button>`;
    let items;
    if (d.list) {
      const l = listOf(d.list); if (!l) return '';
      items = it('editlist', l.id, ICON.pen, 'Edit list') + it('sharelist', l.id, ICON.share, 'Share list');
    } else {
      const p = byId(d.id); if (!p) return ''; const isTry = p.status === 'totry';
      items = it('listpick', p.id, ICON.list, 'Add to a list') + it('share', p.id, ICON.share, 'Share') + (isTry && ui.tab !== 'home' ? it('trymapone', p.id, ICON.map, 'Show on map') : '') + '<div class="pm-sep"></div>' + it('del', p.id, ICON.bin, isTry ? 'Remove from To try' : 'Delete from Spots', 'pm-danger');
    }
    const pos = d.up ? `bottom:${d.y}px` : `top:${d.y}px`;
    return `<div class="dialog-scrim pm-scrim" data-act="closedialog"></div><div class="popmenu ${d.up ? 'up' : ''}" role="menu" style="right:${d.x}px;${pos}">${items}</div>`;
  }
  if (d.type === 'dirs') {
    const p = d.place;
    return `<div class="dialog-scrim" data-act="closedialog"></div><div class="action-sheet" role="dialog" aria-label="Directions"><div class="group-box"><div class="head"><div style="font-size:15px;font-weight:800">Directions to ${esc(p.name)}</div><div class="muted" style="font-size:13px;font-weight:600">${esc([p.area, fmtDist(dist(p))].filter(Boolean).join(' · '))}</div></div>
      <a class="big-btn" style="height:58px;border-radius:0;font-size:17px" href="${aLink(p)}" target="_blank" rel="noopener" data-act="closedialog">${ICON.nav}Apple Maps</a><a class="big-btn" style="height:58px;border-radius:0;font-size:17px;border-top:1px solid rgba(var(--fg),.1)" href="${gLink(p)}" target="_blank" rel="noopener" data-act="closedialog">${ICON.pin}Google Maps</a></div>
      <button class="group-box" data-act="closedialog" style="border-radius:20px;font-weight:700">Cancel</button></div>`;
  }
  if (d.type === 'nudge') {
    const n = d.own;
    return `<div class="dialog-scrim" data-act="closedialog"></div><div class="dialog" role="dialog" aria-labelledby="dlg-t">
      <div style="width:56px;height:56px;border-radius:28px;margin:0 auto 12px;display:flex;align-items:center;justify-content:center;background:rgba(var(--fg),0.08)">${ICON.check}</div>
      <h3 id="dlg-t">${n ? 'Don’t lose your spots' : 'Save your spots to an account'}</h3>
      <p>${n ? 'You’ve saved ' + n + (n === 1 ? ' place' : ' places') + ', but right now ' + (n === 1 ? 'it only lives' : 'they only live') + ' on this phone. ' : ''}Create a free account to save your spots. Log in from any device to access them anywhere!</p>
      <button class="big-btn primary-btn" style="width:100%" data-act="nudgeyes">Create account</button>
      <button class="big-btn sec-btn" style="width:100%;margin-top:8px" data-act="nudgelogin">I already have an account</button>
      <button class="link-btn" style="margin:12px auto 0;color:var(--text-2)" data-act="closedialog">Not now</button></div>`;
  }
  if (d.type === 'delacct') {
    return `<div class="dialog-scrim" data-act="closedialog"></div><div class="dialog" role="alertdialog" aria-labelledby="dlg-t">
      <h3 id="dlg-t">Delete your account?</h3><p>Your email and all your saved places are removed for good. This can’t be undone. Tip: use Back up my spots first if you want a copy.</p>
      <p style="margin:0 0 8px;color:var(--text)">To confirm, type <b>${esc(delWord())}</b> below.</p>
      <input class="input card" style="margin-bottom:12px;text-align:center" data-input="delConfirm" autocomplete="off" autocapitalize="off" placeholder="${esc(delWord())}">
      <div class="btn-grid"><button class="big-btn sec-btn" data-act="closedialog">Cancel</button><button class="big-btn coral-btn" data-act="dodelacct">Yes, delete</button></div></div>`;
  }
  if (d.type === 'currency') {
    const c = db.cities.find(x => x.id === d.cityId) || city();
    return `<div class="dialog-scrim" data-act="closedialog"></div><div class="dialog" role="dialog" aria-labelledby="dlg-t">
      <h3 id="dlg-t">Currency for ${esc(c.name)}</h3><p>Used for prices in this city.</p>
      <label class="search card" style="margin-bottom:10px">${ICON.search}<input type="search" placeholder="Search, e.g. euro, peso, JPY" data-input="curQ" value="${esc(d.q || '')}" autocomplete="off" autocapitalize="off"></label>
      <div id="curres">${curResults(d, c)}</div>
      <button class="big-btn sec-btn" style="width:100%;margin-top:12px" data-act="closedialog">Cancel</button></div>`;
  }
  if (d.type === 'addcity') {
    return `<div class="dialog-scrim" data-act="closedialog"></div><div class="dialog" role="dialog" aria-labelledby="dlg-t" style="text-align:left;top:calc(var(--safe-top) + 24px);transform:translateX(-50%)">
      <h3 id="dlg-t">Add a city or town</h3><p>Its spots and To try list stay separate from other places.</p>
      <input class="input card" placeholder="${mapApi.google ? 'Search, e.g. London or Sitges' : 'Name, e.g. London'}" data-input="cityQ" autocomplete="off" autocapitalize="words">
      <div id="citysug" style="margin-top:8px"></div>
      <div class="btn-grid" style="margin-top:8px"><button class="big-btn sec-btn" data-act="closedialog">Cancel</button>${mapApi.google ? '' : '<button class="big-btn primary-btn" data-act="citymanual">Add</button>'}</div></div>`;
  }
  if (d.type === 'pushask') {
    return `<div class="dialog-scrim" data-act="closedialog"></div><div class="dialog" role="dialog" aria-labelledby="dlg-t">
      <div class="push-bell">🔔</div><h3 id="dlg-t">Know when your memories are ready to relive</h3><p>Get notified about your memory recaps, spots and friends, and events in your city. You can change what you get in Settings.</p>
      <div class="btn-grid"><button class="big-btn sec-btn" data-act="closedialog">Not now</button><button class="big-btn primary-btn" data-act="pushon">Turn on</button></div></div>`;
  }
  if (d.type === 'recap') {
    const items = d.shared ? d.shared.items : recapItems(d.per, d.loc).filter(x => photoUrl(x.m.id)).map(x => ({ src: photoUrl(x.m.id), name: x.p.name, where: [x.p.area, cityOf(x.p) && cityOf(x.p).name].filter(Boolean).join(', '), at: x.m.at, pid: x.p.id, mid: x.m.id }));
    if (!items.length) return '';
    const nPlaces = new Set(items.map(x => x.pid || x.name)).size;
    const cap = x => `<div class="rc-cap"><b>${esc(x.name)}</b><span>${esc(x.where)}</span><span class="rc-when">${esc(fmtWhen(x.at))}</span></div>`;
    const who = d.shared ? (d.shared.f ? esc(d.shared.f) + '’s ' : 'A friend’s ') : '';
    const head = `<div class="rc-head"><div class="rc-k">${d.shared ? who + (d.per.year ? 'year in Sitio' : 'recap') : d.per.year ? 'Your year in Sitio' : 'Your recap'}</div><div class="rc-t ${d.per.year ? 'big' : ''}" id="rc-t">${esc(d.per.label + (!d.per.year && d.per.y !== new Date().getFullYear() ? ' ' + d.per.y : ''))}</div><div class="rc-sub">${plural(items.length, 'memory', 'memories')} · ${plural(nPlaces, 'place')}</div></div>`;
    if (!d.open) {
      const back = items.slice(1, 4).map((x, k) => `<div class="rc-card back" style="--r:${[-9, 9, -4][k]}deg;--x:${[-38, 38, 0][k]}px;--y:${[10, 14, 22][k]}px;--d:${.08 + k * .06}s"><img src="${x.src}" alt=""></div>`).reverse().join('');
      return `<div class="dialog-scrim rc-scrim" data-act="closedialog" style="--el:${d.introAt ? Date.now() - d.introAt : 0}ms"></div>${recapBg(d.per, d.introAt ? Date.now() - d.introAt : 0)}<div class="recap ${d.intro ? 'intro' : ''}" style="--el:${d.introAt ? Date.now() - d.introAt : 0}ms" role="dialog" aria-labelledby="rc-t">${head}
        <button class="rc-stack" data-act="recapopen" aria-label="Open recap">${back}<div class="rc-card front"><img src="${items[0].src}" alt=""></div></button>
        ${cap(items[0])}
        <div class="rc-btns"><button class="big-btn sec-btn" data-act="closedialog">Skip</button><button class="big-btn primary-btn" data-act="recapopen">See all ${items.length}</button></div></div>`;
    }
    return `<div class="dialog-scrim rc-scrim" data-act="closedialog" style="--el:${d.introAt ? Date.now() - d.introAt : 0}ms"></div>${recapBg(d.per, d.introAt ? Date.now() - d.introAt : 0)}<div class="recap open" role="dialog" aria-labelledby="rc-t">${head}
      <div class="rc-strip">${items.map(x => `<div class="rc-slide"><div class="rc-photo"><img src="${x.src}" alt=""></div>${cap(x)}</div>`).join('')}</div>
      ${items.length > 1 ? `<div class="mv-count rc-dots">${items.map((x, i) => `<i class="${i === 0 ? 'on' : ''}"></i>`).join('')}</div>` : ''}
      ${!d.shared ? `<button class="link-btn" style="margin:-4px auto 0;color:rgba(255,255,255,.75)" data-act="recapsend">${ICON.share} Share this recap</button>` : ''}${!d.shared && isAdmin && auth ? `<button class="link-btn" style="margin:-8px auto 0;color:#FFD66B" data-act="recapdemo">Show this to everyone once (demo)</button>` : ''}
      <button class="big-btn primary-btn" style="width:100%" data-act="closedialog">Done</button></div>`;
  }
  if (d.type === 'levelup') {
    const l = LEVELS[d.i], old = d.i > 0 ? LEVELS[d.i - 1].badge : '🌱';
    const conf = Array.from({ length: 18 }, (_, k) => { const ang = k / 18 * 360, dx = Math.round(Math.cos(ang * Math.PI / 180) * (90 + (k % 3) * 22)), dy = Math.round(Math.sin(ang * Math.PI / 180) * (90 + (k % 3) * 22)); return `<i style="--dx:${dx}px;--dy:${dy}px;--c:${['#FFD166', '#FF8A5C', '#F5B83D', '#8FD99A', '#FF5A4E', '#FFFFFF'][k % 6]};--r:${k * 37}deg"></i>`; }).join('');
    return `<div class="dialog-scrim" data-act="closedialog"></div><div class="levelup" role="dialog" aria-labelledby="lu-t" data-act="closedialog">
      <div class="lu-stage"><div class="lu-rays"></div><div class="lu-conf">${conf}</div><div class="lu-b lu-old">${old}</div><div class="lu-b lu-new">${l.badge}</div></div>
      <div class="lu-text"><div class="lu-k">Level ${d.i + 1} unlocked</div><div class="lu-name" id="lu-t">${esc(l.name)}</div><div class="lu-sub">Congratulations! You’ve saved ${d.demo ? l.min : spotCount()} spots.</div></div>
    </div>`;
  }
  if (d.type === 'editcat') {
    const p = byId(d.id); if (!p) return '';
    return `<div class="dialog-scrim" data-act="closedialog"></div><div class="dialog" role="dialog" aria-labelledby="dlg-t" style="text-align:left">
      <h3 id="dlg-t">Categories for ${esc(p.name)}</h3>
      <p style="margin:6px 0 0">Pick one or more.</p><div class="cat-grid" style="margin-top:10px">${CATS.map(c => `<button class="sec-btn ${d.cats.includes(c.id) ? 'on' : ''}" data-act="ecat" data-v="${c.id}" aria-pressed="${d.cats.includes(c.id)}">${ICON.cat[c.id]}${c.name}</button>`).join('')}</div>
      ${true ? `<label class="field-label">Cuisine <span style="text-transform:none;letter-spacing:0;font-weight:600;opacity:.7">· optional, pick any</span></label><div class="chips">${CUISINES.map(c => `<button class="chip ${cuisList(d).includes(c) ? 'on' : ''}" data-act="ecuis" data-v="${esc(c)}">${esc(c)}</button>`).join('')}</div>` : ''}
      <div class="btn-grid" style="margin-top:16px"><button class="big-btn sec-btn" data-act="closedialog">Cancel</button><button class="big-btn primary-btn" data-act="ecatsave">Save</button></div></div>`;
  }
  if (d.type === 'here') {
    const h = d.h, nm = h.city ? h.city.name : h.name;
    return `<div class="dialog-scrim" data-act="closedialog"></div><div class="dialog" role="dialog" aria-labelledby="dlg-t">
      <div style="font-size:40px;margin-bottom:6px">📍</div>
      <h3 id="dlg-t">Looks like you’re in ${esc(nm)}</h3><p>Sitio is showing ${esc(city().name)}. Switch to ${esc(nm)} to save spots there?${h.city ? '' : ' Prices will be in ' + esc(currencyFor(h.cc)) + '.'}</p>
      <button class="big-btn primary-btn" style="width:100%" data-act="hereyes">Switch to ${esc(nm)}</button>
      <button class="big-btn sec-btn" style="width:100%;margin-top:8px" data-act="addcity">Pick another city or town</button>
      <button class="link-btn" style="margin:12px auto 0;color:var(--text-2)" data-act="hereno">Stay in ${esc(city().name)}</button></div>`;
  }
  if (d.type === 'uname') {
    return `<div class="dialog-scrim"></div><div class="dialog" role="dialog" aria-labelledby="dlg-t" style="text-align:left">
      <h3 id="dlg-t">${d.taken ? 'Pick a new username' : 'Choose a username'}</h3><p>${d.taken ? '“' + esc(d.cur) + '” is already taken or not allowed. ' : ''}Usernames are unique on Sitio. ${USER_HINT}</p>
      <input class="input card" data-input="unameDraft" maxlength="20" autocapitalize="off" spellcheck="false" placeholder="e.g. liaa" value="${esc(ui.unameDraft || '')}">
      <div class="btn-grid" style="margin-top:12px"><button class="big-btn sec-btn" data-act="closedialog">Later</button><button class="big-btn primary-btn" data-act="unamedlg">Save</button></div></div>`;
  }
  if (d.type === 'chpass') {
    return `<div class="dialog-scrim" data-act="closedialog"></div><div class="dialog" role="dialog" aria-labelledby="dlg-t" style="text-align:left">
      <h3 id="dlg-t">Change password</h3><p>Enter your current password, then your new one (at least 6 characters).</p>
      <input class="input card" style="margin-bottom:8px" type="password" autocomplete="current-password" placeholder="Current password" data-dlgfield="0" value="${esc((d.v || [])[0] || '')}">
      <input class="input card" style="margin-bottom:8px" type="password" autocomplete="new-password" placeholder="New password" data-dlgfield="1" value="${esc((d.v || [])[1] || '')}">
      ${d.err ? `<p style="color:var(--coral-soft);margin:4px 0 8px">${esc(d.err)}</p>` : ''}
      <button class="link-btn" style="margin:2px 0 12px;color:var(--blue)" data-act="resetmail">Forgot your current password? Email me a reset link</button>
      <div class="btn-grid"><button class="big-btn sec-btn" data-act="closedialog">Cancel</button><button class="big-btn primary-btn" data-act="chpassgo" ${d.busy ? 'disabled' : ''}>${d.busy ? 'Checking…' : 'Save'}</button></div></div>`;
  }
  if (d.type === 'listpick') {
    const p = byId(d.id); if (!p) return '';
    return `<div class="dialog-scrim" data-act="closedialog"></div><div class="dialog" role="dialog" aria-labelledby="dlg-t" style="text-align:left">
      <h3 id="dlg-t">Add ${esc(p.name)} to…</h3>
      ${myLists().length ? `<div class="settings card" style="max-height:46vh;overflow-y:auto">${myLists().map(l => { const on = l.ids.includes(p.id); return `<button class="set-row" data-act="listtoggle" data-id="${l.id}" style="min-height:54px"><span style="display:flex;align-items:center;gap:10px"><span style="font-size:20px">${l.emoji}</span><span style="font-weight:800">${esc(l.name)}</span></span><span class="check-box ${on ? 'on' : ''}">${on ? ICON.check : ''}</span></button>`; }).join('')}</div>` : '<p>You don’t have any lists yet.</p>'}
      <div class="btn-grid" style="margin-top:12px"><button class="big-btn sec-btn" data-act="newlist" data-id="${p.id}">${ICON.plus}New list</button><button class="big-btn primary-btn" data-act="closedialog">Done</button></div></div>`;
  }
  if (d.type === 'listadd') {
    const l = listOf(d.listId); if (!l) return '';
    const q = (d.q || '').trim().toLowerCase();
    return `<div class="dialog-scrim" data-act="closedialog"></div><div class="dialog" role="dialog" aria-labelledby="dlg-t" style="text-align:left;top:calc(var(--safe-top) + 20px);transform:translateX(-50%)">
      <h3 id="dlg-t">Add to ${l.emoji} ${esc(l.name)}</h3>
      <label class="search card" style="margin:10px 0">${ICON.search}<input type="search" placeholder="Search your places" data-input="listAddQ" value="${esc(d.q || '')}"></label>
      <div id="listaddres">${listAddRows(l, q)}</div>
      <button class="big-btn primary-btn" style="width:100%;margin-top:12px" data-act="closedialog">Done</button></div>`;
  }
  if (d.type === 'listedit') {
    return `<div class="dialog-scrim" data-act="closedialog"></div><div class="dialog" role="dialog" aria-labelledby="dlg-t" style="text-align:left">
      <h3 id="dlg-t">${d.listId ? 'Edit list' : 'New list'}</h3>
      <input class="input card" data-input="listName" maxlength="40" placeholder="e.g. Date spots" value="${esc(d.name || '')}">
      <div class="emoji-grid">${LIST_EMOJI.map(e => `<button class="${d.emoji === e ? 'on' : ''}" data-act="listemoji" data-v="${e}">${e}</button>`).join('')}</div>
      <div class="btn-grid" style="margin-top:12px"><button class="big-btn sec-btn" data-act="closedialog">Cancel</button><button class="big-btn primary-btn" data-act="listsave">${d.listId ? 'Save' : 'Create'}</button></div>
      ${d.listId ? `<button class="link-btn" style="margin:14px auto 0;color:var(--coral-soft)" data-act="dellist" data-id="${d.listId}">${ICON.bin}Delete this list</button>` : ''}</div>`;
  }
  if (d.type === 'dellist') {
    const l = listOf(d.listId); if (!l) return '';
    return `<div class="dialog-scrim" data-act="closedialog"></div><div class="dialog" role="alertdialog" aria-labelledby="dlg-t">
      <h3 id="dlg-t">Delete “${esc(l.name)}”?</h3><p>Only the list goes. The places stay in your Spots and To try.</p>
      <div class="btn-grid"><button class="big-btn sec-btn" data-act="closedialog">Cancel</button><button class="big-btn coral-btn" data-act="dellistok">Delete</button></div></div>`;
  }
  if (d.type === 'memdate') {
    const q = byId(d.id); if (!q) return '';
    const ms = d.ms.map(id => (q.memories || []).find(m => m.id === id)).filter(Boolean);
    return `<div class="dialog-scrim"></div><div class="dialog" role="dialog" aria-labelledby="dlg-t" style="text-align:left">
      <h3 id="dlg-t">${ms.length === 1 ? 'When was this?' : 'When were these?'}</h3><p>We used the date the photo was taken. Change it if you went another time.</p>
      <div style="display:flex;flex-direction:column;gap:10px;max-height:52vh;overflow-y:auto">${ms.map(m => { const u = photoUrl(m.id); return `<div class="md-row">${u ? `<img src="${u}" alt="">` : '<span class="md-ph"></span>'}<input class="input card" type="datetime-local" data-memdate="${m.id}" value="${toLocalInput(m.at)}" max="${toLocalInput(Date.now() + 864e5)}"></div>`; }).join('')}</div>
      <button class="big-btn primary-btn" style="width:100%;margin-top:14px" data-act="memdatesave">Save ${ms.length === 1 ? 'memory' : ms.length + ' memories'}</button></div>`;
  }
  if (d.type === 'memconfirm') {
    return `<div class="dialog-scrim" data-act="memdelno"></div><div class="dialog" role="alertdialog" aria-labelledby="dlg-t">
      <h3 id="dlg-t">Delete this memory?</h3><p>The photo will be removed from this place and from your account. You can’t undo this.</p>
      <div class="btn-grid"><button class="big-btn sec-btn" data-act="memdelno">Cancel</button><button class="big-btn coral-btn" data-act="memdelok">Delete</button></div></div>`;
  }
  if (d.type === 'memory') {
    const q = byId(d.id); if (!q) return '';
    const all = (q.memories || []).slice().sort((x, y) => y.at - x.at); const k = Math.max(0, all.findIndex(x => x.id === d.m)); const m = all[k]; if (!m) return '';
    return `<div class="dialog-scrim" data-act="closedialog" style="background:rgba(0,0,0,0.9)"></div><div class="mem-view" role="dialog" aria-label="Memory">
      <div class="mv-strip" data-start="${k}">${all.map(x => { const u = photoUrl(x.id); return `<div class="mv-slide" data-m="${x.id}" data-when="${esc(x.at ? fmtWhen(x.at) : 'No date')}">${u ? `<img src="${u}" alt="">` : `<div class="mem-gone" style="height:260px;width:100%">${x.cloud ? 'Loading…' : 'This photo is on another phone'}</div>`}</div>`; }).join('')}</div>
      ${(q.memories || []).length > 1 ? `<button class="mv-thumb ${coverOf(q) === m.id ? 'on' : ''}" data-act="memcover">${coverOf(q) === m.id ? ICON.check + 'Thumbnail' : 'Set as thumbnail'}</button>` : ''}
      ${all.length > 1 ? `<div class="mv-count">${all.map((x, i) => `<i class="${i === k ? 'on' : ''}"></i>`).join('')}</div>` : ''}
      <div class="mem-meta"><div><b>${esc(q.name)}</b><button class="mem-when" ${(q.memories || []).some(x => x.id === m.id) ? 'data-act="memredate"' : 'disabled'}><span class="mw-t">${m.at ? esc(fmtWhen(m.at)) : 'No date'}</span> ${(q.memories || []).some(x => x.id === m.id) ? ICON.pen : ''}</button></div><div style="display:flex;gap:8px;align-items:center"><button class="round sec-btn" style="width:44px;height:44px;color:var(--coral-soft)" data-act="memdel" aria-label="Delete memory">${ICON.bin}</button><button class="round sec-btn" style="width:44px;height:44px" data-act="closedialog" aria-label="Close">${ICON.close}</button></div></div></div>`;
  }
  if (d.type === 'sharedlist') {
    const s = d.data, shown = s.p.slice(0, 6);
    return `<div class="dialog-scrim" data-act="closedialog"></div><div class="dialog" role="dialog" aria-labelledby="dlg-t">
      <div style="font-size:40px;line-height:1;margin-bottom:8px">${s.e}</div>
      <h3 id="dlg-t">${esc(s.f || 'A friend')} shared “${esc(s.n)}”</h3><p>${s.p.length} ${s.p.length === 1 ? 'place' : 'places'}. Saving adds the list, and puts any places you don’t have yet into To try.</p>
      <div class="settings card" style="text-align:left;margin-bottom:14px">${shown.map(x => `<div class="set-row" style="min-height:46px"><span style="display:flex;flex-direction:column;gap:1px"><span style="font-weight:800">${esc(x.n)}</span><span style="font-size:11px;font-weight:600;color:var(--text-2)">${esc([catOf(x.c).name, x.ci.n].filter(Boolean).join(' · '))}</span></span></div>`).join('')}${s.p.length > 6 ? `<div class="set-row" style="min-height:40px;color:var(--text-2);font-size:13px">+ ${s.p.length - 6} more</div>` : ''}</div>
      <div class="stack"><button class="big-btn primary-btn" data-act="sharedlistsave">Save list</button><button class="big-btn" style="background:none;border:0;height:44px;color:var(--text-soft)" data-act="closedialog">Not now</button></div></div>`;
  }
  if (d.type === 'logout') {
    return `<div class="dialog-scrim" data-act="closedialog"></div><div class="dialog" role="alertdialog" aria-labelledby="dlg-t">
      <h3 id="dlg-t">Log out?</h3><p>Your spots stay safe in your account. This phone goes back to the starter spots until you log in again.</p>
      <div class="btn-grid"><button class="big-btn sec-btn" data-act="closedialog">Cancel</button><button class="big-btn coral-btn" data-act="dologout">Log out</button></div></div>`;
  }
  if (d.type === 'text') {
    return `<div class="dialog-scrim" data-act="closedialog"></div><div class="dialog" role="dialog" aria-labelledby="dlg-t" style="text-align:left">
      <h3 id="dlg-t">${esc(d.title)}</h3><p>${esc(d.text)}</p>${d.fields.map((f, i) => `<input class="input card" style="margin-bottom:8px" type="${f.type || 'text'}" ${f.type === 'password' ? 'autocomplete="new-password"' : ''} placeholder="${esc(f.ph)}" value="${esc(f.value || '')}" data-dlgfield="${i}">`).join('')}
      <div class="btn-grid" style="margin-top:8px"><button class="big-btn sec-btn" data-act="closedialog">Cancel</button><button class="big-btn primary-btn" data-act="dlgok">Save</button></div></div>`;
  }
  if (d.type === 'shared') {
    const s = d.data;
    return `<div class="dialog-scrim" data-act="closedialog"></div><div class="dialog" role="dialog" aria-labelledby="dlg-t" style="padding:0;overflow:hidden;text-align:left">
      <div style="height:150px">${ART[s.c] || ART.restaurant}</div><div style="padding:16px 18px 12px">
      <div class="section-label">${esc(s.f || 'A friend')} shared a spot with you</div><h3 id="dlg-t" style="font-size:24px;margin:4px 0">${esc(s.n)}</h3>
      <div class="meta" style="margin:0">${esc([catOf(s.c).name, s.q, s.a].filter(Boolean).join(' · '))}</div>
      ${s.p ? `<div class="price-line">${priceHtml(s.p)}${PRICE_WORDS[s.p]}, says ${esc(s.f || 'your friend')}</div>` : ''}
      ${s.o ? `<div class="note card" style="margin:10px 0"><b>${esc(s.f || 'Note')}:</b> ${esc(s.o)}</div>` : ''}
      <div class="stack" style="margin-top:10px"><button class="big-btn primary-btn" data-act="sharedspot">Add to Spots</button><button class="big-btn coral-btn" data-act="sharedtry">Add to To try</button><button class="big-btn" style="background:none;border:0;height:40px;color:var(--text-soft)" data-act="closedialog">Not now</button></div></div></div>`;
  }
  return '';
}

// Animated how-to for iPhone Safari: a looping mock of the real taps, including scrolling the share sheet
function iosHowTo(newSafari) {
  const SH = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M8 7l4-4 4 4M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7"/></svg>`;
  const PL = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8v8M8 12h8"/></svg>`;
  const page = `<div class="hw-page"><div class="hw-logo"><img src="icons/icon-192.png" alt=""></div><i style="width:60%"></i><i style="width:80%"></i><i style="width:70%"></i></div>`;
  const bar = newSafari
    ? `<div class="hw-bar"><span class="hw-b">‹</span><span class="hw-url"><span class="hw-menu">≡</span>${esc(location.host || 'sitio')}</span><span class="hw-b">•••</span></div>`
    : `<div class="hw-bar old"><span class="hw-b">‹</span><span class="hw-b">›</span><span class="hw-b">${SH}</span><span class="hw-b">▢</span><span class="hw-b">⧉</span></div>`;
  const rows = ['⧉ Copy', '☷ Add to Reading List', '☆ Add to Bookmarks', '♡ Add to Favourites', '✐ Add to Quick Note', '⌕ Find on Page'].map(r => `<div class="hw-row"><span class="hw-ri">${r.slice(0, 1)}</span><span>${r.slice(2)}</span></div>`).join('')
    + `<div class="hw-row hw-target"><span class="hw-ri">${PL}</span><span>Add to Home Screen</span></div>` + ['✎ Markup', '⎙ Print', '⚙ Edit Actions…'].map(r => `<div class="hw-row"><span class="hw-ri">${r.slice(0, 1)}</span><span>${r.slice(2)}</span></div>`).join('');
  const sheet = (scrolled, mark) => `<div class="hw-sheet"><div class="hw-sh-head"><img src="icons/icon-192.png" alt=""><span><b>Sitio</b><em>${esc(location.host || 'sitio')}</em></span><span class="hw-x">✕</span></div>
    <div class="hw-people"><i></i><i></i><i></i><i></i></div><div class="hw-apps"><i style="background:#34C759"></i><i style="background:#0A84FF"></i><i style="background:#25D366"></i><i style="background:#8E8E93"></i></div>
    <div class="hw-listwrap"><div class="hw-list ${scrolled ? 'is-scrolled' : 'scrolls'} ${mark ? 'mark' : ''}">${rows}</div></div></div>`;
  const sc = [];
  sc.push({ html: `${page}${bar}${newSafari ? '<span class="hw-ring r-menu"></span><span class="hw-ring r-more"></span><span class="hw-finger tap f-more"></span>' : '<span class="hw-ring r-share"></span><span class="hw-finger tap f-share"></span>'}`, cap: newSafari ? 'Tap <b>•••</b> (or <b>≡</b> in the address bar)' : 'Tap the <b>Share</b> button' });
  if (newSafari) sc.push({ html: `${page}<div class="hw-pop"><div class="hw-row hw-target"><span class="hw-ri">${SH}</span><span>Share</span></div><div class="hw-row"><span class="hw-ri">☆</span><span>Add to Bookmarks</span></div><div class="hw-row"><span class="hw-ri">⌕</span><span>Find on Page</span></div></div>${bar}<span class="hw-finger tap f-pop"></span>`, cap: 'Tap <b>Share</b>' });
  sc.push({ html: `${sheet(false)}<span class="hw-finger swipe f-swipe"></span>`, cap: 'Swipe up to see more options' });
  sc.push({ html: `${sheet(true, true)}<span class="hw-finger tap f-add"></span>`, cap: 'Tap <b>Add to Home Screen</b>' });
  sc.push({ html: `<div class="hw-confirm"><div class="hw-top"><span>Cancel</span><b>Add to Home Screen</b><span class="hw-addbtn">Add</span></div><div class="hw-app"><img src="icons/icon-192.png" alt=""><span>Sitio</span></div><div class="hw-toggle"><span>Open as Web App</span><i></i></div></div><span class="hw-finger tap f-confirm"></span>`, cap: 'Tap <b>Add</b> in the top corner' });
  sc.push({ html: `<div class="hw-home"><div class="hw-grid">${'<i></i>'.repeat(5)}<span class="hw-new"><img src="icons/icon-192.png" alt=""><em>Sitio</em></span>${'<i></i>'.repeat(6)}</div><div class="hw-dock"><i></i><i></i><i></i><i></i></div></div>`, cap: 'Done! Open Sitio from your home screen' });
  const n = sc.length, step = 3.2, dur = n * step, w = 100 / n, p = x => (w * x).toFixed(2) + '%';
  const css = `<style>
    .hw .hw-sc, .hw .hw-cap { animation: hwS ${dur}s linear infinite; }
    @keyframes hwS { 0% { opacity: 0; } ${p(.06)} { opacity: 1; } ${p(.94)} { opacity: 1; } ${p(1)}, 100% { opacity: 0; } }
    .hw .tap { animation: hwT ${dur}s ease-out infinite; }
    @keyframes hwT { 0% { opacity: 0; transform: translate(26px, 34px) scale(1); } ${p(.28)} { opacity: .95; transform: translate(0, 0) scale(1); } ${p(.42)} { transform: scale(.72); } ${p(.52)} { transform: scale(1); } ${p(.85)} { opacity: .95; } ${p(.93)}, 100% { opacity: 0; } }
    .hw .swipe { animation: hwW ${dur}s ease-in-out infinite; }
    @keyframes hwW { 0% { opacity: 0; transform: translateY(0); } ${p(.2)} { opacity: .95; transform: translateY(0); } ${p(.7)} { opacity: .95; transform: translateY(-110px); } ${p(.8)}, 100% { opacity: 0; transform: translateY(-110px); } }
    .hw .scrolls { animation: hwL ${dur}s ease-in-out infinite; }
    @keyframes hwL { 0%, ${p(.2)} { transform: translateY(0); } ${p(.7)}, 100% { transform: translateY(-140px); } }
    .hw .hw-ring { animation: hwR ${dur}s ease-out infinite; }
    @keyframes hwR { 0%, ${p(.2)} { opacity: 0; transform: scale(.7); } ${p(.35)} { opacity: 1; transform: scale(1.12); } ${p(.6)} { opacity: .9; transform: scale(1); } ${p(.9)}, 100% { opacity: 0; } }
    .hw .hw-new { animation: hwP ${dur}s ease-out infinite; }
    @keyframes hwP { 0%, ${p(.12)} { transform: scale(0); } ${p(.3)} { transform: scale(1.25); } ${p(.42)}, 100% { transform: scale(1); } }
  </style>`;
  const d = k => `animation-delay:${(k * step).toFixed(1)}s`;
  return `<div class="i-card card hw">${css}
    <div class="i-h" style="text-align:center">Add Sitio to your home screen</div>
    <div class="hw-phone">${sc.map((s, k) => `<div class="hw-sc" style="${d(k)}">${s.html.replace(/class="hw-(finger|ring|list|new)/g, m => `style="${d(k)}" ${m}`)}</div>`).join('')}</div>
    <div class="hw-caps">${sc.map((s, k) => `<div class="hw-cap" style="${d(k)}"><span class="hw-n">${k + 1}</span><span>${s.cap}</span></div>`).join('')}</div>
    <div class="muted" style="font-size:12px;font-weight:600;margin-top:10px;line-height:1.4;text-align:center">iPhones don’t let websites add themselves, so it takes these taps. You only do it once.</div></div>`;
}
function installView() {
  const step = (n, html) => `<li class="i-step"><span class="i-num">${n}</span><span>${html}</span></li>`;
  const shareIc = `<span class="i-ic">${ICON.share}</span>`;
  const plusIc = `<span class="i-ic"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8v8M8 12h8"/></svg></span>`;
  const dots = `<span class="i-ic" style="font-weight:800;letter-spacing:1px">•••</span>`;
  const kebab = `<span class="i-ic" style="font-weight:800">⋮</span>`;
  let body = '', arrow = '';
  if (ui.installed) {
    body = `<div class="i-card card"><div style="font-size:18px;font-weight:800;margin-bottom:6px">Sitio is on your home screen</div><div class="muted" style="font-size:14px;font-weight:600;line-height:1.45">Open it from there from now on. It works like a normal app.</div></div>`;
  } else if (IS_IOS && (IN_APP || IOS_OTHER && !/CriOS/.test(UA))) {
    body = `<div class="i-card card"><div class="i-h">First, open this page in Safari</div><ol class="i-steps">${step(1, `Tap ${dots} or the menu in this screen`)}${step(2, 'Choose <b>Open in Safari</b> (or Open in browser)')}${step(3, 'Then follow the steps shown there')}</ol>
      <button class="big-btn sec-btn" style="width:100%;margin-top:10px" data-act="copylink">Copy link instead</button></div>`;
  } else if (IS_IOS && (PREVIEW || !/CriOS/.test(UA))) {
    body = iosHowTo(IOS26);
  } else if (IS_IOS) {
    body = `<div class="i-card card"><div class="i-h">Add Sitio to your home screen</div><ol class="i-steps">
      ${step(1, `Tap the Share button ${shareIc} ${/CriOS/.test(UA) ? 'next to the address bar' : 'at the bottom of the screen'}`)}
      ${step(2, `Scroll down and tap <b>Add to Home Screen</b> ${plusIc}`)}
      ${step(3, 'Tap <b>Add</b> in the top corner')}</ol></div>`;
    if (!/CriOS/.test(UA)) arrow = `<div class="i-arrow" aria-hidden="true">${ICON.chevDown}</div>`;
  } else if (IS_ANDROID && installPrompt) {
    body = `<button class="big-btn primary-btn" style="width:100%;height:58px;font-size:17px" data-act="installnow">Install Sitio</button>
      <div class="muted" style="text-align:center;font-size:13px;font-weight:600;margin-top:10px">Free. Takes a second. No app store needed.</div>`;
  } else if (IS_ANDROID) {
    body = `<div class="i-card card"><div class="i-h">Add Sitio to your home screen</div><ol class="i-steps">
      ${step(1, `Tap the menu ${kebab} in the top corner of your browser`)}
      ${step(2, 'Tap <b>Install app</b> or <b>Add to Home screen</b>')}
      ${step(3, 'Tap <b>Install</b> to confirm')}</ol>
      <div class="muted" style="font-size:12px;font-weight:600;margin-top:8px">Opened from WhatsApp or Instagram? Tap ${kebab} and choose <b>Open in Chrome</b> first.</div></div>`;
  } else {
    body = `<div class="i-card card"><div class="i-h">Sitio is made for your phone</div><div class="muted" style="font-size:14px;font-weight:600;line-height:1.45;margin-bottom:12px">Open this link on your phone to add it to your home screen.</div>
      <div class="input card" style="display:flex;align-items:center;font-size:14px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${esc(appUrl())}</div>
      <button class="big-btn sec-btn" style="width:100%;margin-top:10px" data-act="copylink">Copy link</button></div>`;
  }
  return `<div class="install" role="dialog" aria-label="Install Sitio">
    <div class="i-top"><div class="i-brand"><img src="icons/icon-192.png" alt="" class="i-mark"><h1 class="i-title">Sitio</h1></div><p class="i-tag">Your own map of the places you vouch for: restaurants, bars, cafés and more.</p></div>
    ${ui.dialog && ui.dialog.type === 'sharedlist' ? `<div class="card" style="border-radius:18px;padding:12px 14px;margin-bottom:14px;font-size:14px;font-weight:700">${esc(ui.dialog.data.f || 'A friend')} shared a list with you: <b>${ui.dialog.data.e} ${esc(ui.dialog.data.n)}</b> (${ui.dialog.data.p.length} places). Add Sitio to see it.</div>` : ''}
    ${ui.dialog && ui.dialog.type === 'shared' ? `<div class="card" style="border-radius:18px;padding:12px 14px;margin-bottom:14px;font-size:14px;font-weight:700">${esc(ui.dialog.data.f || 'A friend')} shared <b>${esc(ui.dialog.data.n)}</b> with you. Add Sitio to see it.</div>` : ''}
    ${body}
    <button class="link-btn muted" style="margin:18px auto 0;font-weight:700;font-size:14px" data-act="skipinstall">${ui.installed ? 'Close' : 'Continue in the browser'}</button>
    ${arrow}
  </div>`;
}

/* ---------- render ---------- */
const root = document.getElementById('app');
const uiEl = document.createElement('div');
let lastMapKey = '';
function render() {
  document.body.classList.toggle('light', !db.settings.darkMap);
  // Map pins
  const list = (ui.world ? worldList() : cityPlaces()).filter(p => matches(p, ui.filter));
  const key = JSON.stringify([ui.world ? 'w' : 'c', list.map(p => p.id + p.status + p.price + coverOf(p) + (photoUrls[coverOf(p)] ? 1 : 0)), ui.selected, db.settings.hours, Math.floor(Date.now() / 60000)]);
  if (key !== lastMapKey) { mapApi.update(list, ui.selected); lastMapKey = key; }
  mapApi.el.style.visibility = ui.tab === 'home' || ui.world ? 'visible' : 'hidden';

  const focus = document.activeElement && document.activeElement.dataset && document.activeElement.dataset.input;
  const selStart = focus ? document.activeElement.selectionStart : null;
  let h = '';
  if (ui.world) { h += worldView(); if (ui.wSel) { const wp = worldList().find(x => x.id === ui.wSel); if (wp) h += '<div class="scrim" data-act="closeadmin" style="background:transparent"></div>' + roSheet(wp, { cur: wp._cur, who: wp._who }); else ui.wSel = null; } h += dialogView(); if (ui.toast) h += `<div class="toast" role="status"><span>${esc(ui.toast.text)}</span></div>`; if (ui.flash) h += `<div class="banner glass">${esc(ui.flash)}</div>`; uiEl.innerHTML = h; return; }
  if (ui.tab === 'home' && !ui.pinMode) h += homeView();
  if (ui.tab === 'spots') h += spotsView();
  if (ui.tab === 'totry') h += tryView();
  if (ui.tab === 'account') h += accountView();
  if (ui.page === 'cities') h += citiesPage();
  if (ui.page === 'recaps') h += recapsPage();
  else if (ui.page === 'profile') h += profilePage();
  else if (ui.page === 'auth') h += authPage();
  else if (ui.page === 'privacy') h += privacyPage();
  else if (ui.page === 'notifs') h += notifsPage();
  else if (ui.page === 'levels') h += levelsPage();
  else if (ui.page === 'import') h += importPage();
  else if (ui.page && ui.page.list) { const l = listOf(ui.page.list); if (l) h += listPage(l); else ui.page = null; }
  else if (ui.page === 'admin') h += adminPage();
  else if (false) {
    const au = (ui.adminData || []).find(x => x.user_id === ui.page.adminUser), ap = au && au.data && (au.data.places || []).find(x => x.id === ui.page.place);
    const ac = au && au.data && (au.data.cities || []).find(x => x.id === ui.page.city);
    if (ap) h += spotPage(ap, { cur: (ac && ac.currency) || '€', who: (au.data.user && au.data.user.name) || au.email }); else ui.page = { adminUser: ui.page.adminUser, city: ui.page.city };
  }
  else if (ui.page && ui.page.adminUser) h += adminUserPage(ui.page.adminUser, ui.page.city);
  else if (ui.page && ui.page.spot) { const p = byId(ui.page.spot); if (p) h += spotPage(p); else ui.page = null; }
  if ((!ui.page || ui.page === 'cities') && !ui.sheet) h += tabbar();
  if (ui.sheet === 'spot' && ui.selected && byId(ui.selected)) h += (ui.tab === 'home' ? '' : '<div class="scrim" data-act="closesheet"></div>') + spotSheet(byId(ui.selected));
  if (ui.adminSheet && ui.page && ui.page.adminUser && ui.page.city) {
    const au = (ui.adminData || []).find(x => x.user_id === ui.page.adminUser), ap = au && au.data && (au.data.places || []).find(x => x.id === ui.adminSheet);
    const ac = au && au.data && (au.data.cities || []).find(x => x.id === ui.page.city);
    if (ap) h += '<div class="scrim" data-act="closeadmin"></div>' + roSheet(ap, { cur: (ac && ac.currency) || '€', who: (au.data.user && au.data.user.name) || au.email }); else ui.adminSheet = null;
  }
  if (ui.sheet === 'add' && ui.add && ui.pinMode) h += `<div class="pin-mode"><div class="pm-top glass">Move the map to put the pin exactly on the spot</div><div class="pm-pin" aria-hidden="true"><div class="pm-head">${ICON.pin}</div><div class="pm-dot"></div></div><div class="pm-bar"><button class="big-btn sec-btn glass" data-act="pincancel">Cancel</button><button class="big-btn primary-btn" data-act="pinok">Use this spot</button></div><button class="locate round glass pm-loc" data-act="locate" aria-label="Go to my location" style="color:var(--blue)">${ICON.nav}</button></div>`;
  else if (ui.sheet === 'add' && ui.add) h += '<div class="scrim" data-act="closesheet"></div>' + addSheet();
  if (ui.toast) h += `<div class="toast" role="status"><span>${ui.toast.ok ? `<span style="color:var(--green);display:flex">${ICON.check}</span>` : ''}${esc(ui.toast.text)}</span>${ui.toast.undo ? '<button data-act="undo">Undo</button>' : ''}</div>`;
  h += dialogView();
  if (ui.install) h += installView();
  if (ui.flash) h += `<div class="banner glass">${esc(ui.flash)}</div>`;
  if (ui.tour != null && !ui.install) h += tourView();
  uiEl.innerHTML = h;
  if (ui.tour != null) placeTour();
  const rs = uiEl.querySelector('.rc-strip');
  if (rs) { let rt = null; rs.addEventListener('scroll', () => { clearTimeout(rt); rt = setTimeout(() => { const i = Math.round(rs.scrollLeft / rs.clientWidth); uiEl.querySelectorAll('.rc-dots i').forEach((d, k) => d.classList.toggle('on', k === i)); }, 60); }); }
  const mv = uiEl.querySelector('.mv-strip');
  if (mv) {
    mv.scrollLeft = (+mv.dataset.start || 0) * mv.clientWidth;
    let t = null; mv.addEventListener('scroll', () => { clearTimeout(t); t = setTimeout(() => {
      const i = Math.round(mv.scrollLeft / mv.clientWidth), sl = mv.children[i]; if (!sl || !ui.dialog || ui.dialog.type !== 'memory') return;
      ui.dialog.m = sl.dataset.m; const w = uiEl.querySelector('.mw-t'); if (w) w.textContent = sl.dataset.when;
      const tb = uiEl.querySelector('.mv-thumb'), q = byId(ui.dialog.id); if (tb && q) { const on = coverOf(q) === sl.dataset.m; tb.classList.toggle('on', on); tb.innerHTML = on ? ICON.check + 'Thumbnail' : 'Set as thumbnail'; }
      uiEl.querySelectorAll('.mv-count i').forEach((d, k) => d.classList.toggle('on', k === i)); }, 80); });
  }
  if (focus) { const el = uiEl.querySelector(`[data-input="${focus}"]`); if (el) { el.focus(); try { el.setSelectionRange(selStart, selStart); } catch (e) { } } }
}
function flash(text, ms = 3500) { ui.flash = text; render(); clearTimeout(flash.t); flash.t = setTimeout(() => { ui.flash = null; render(); }, ms); }
function toast(text, undo, ok = true) { ui.toast = { text, undo, ok }; render(); clearTimeout(toast.t); toast.t = setTimeout(() => { ui.toast = null; render(); }, 5000); }

/* ---------- actions ---------- */
function newAdd() { return { name: '', area: '', cat: 'restaurant', cats: ['restaurant'], cuisine: '', note: '', photos: [], lat: null, lng: null, googleId: null }; }
function placeFromAdd(status, price) {
  const a = ui.add;
  const jitter = () => (Math.random() - 0.5) * 0.0006;
  return { _importKey: a.importKey, id: uid(), cityId: db.currentCityId, name: a.name.trim(), area: a.area.trim(), cat: catsOf(a)[0], cats: catsOf(a), cuisine: a.cuisine || '', status, price: status === 'spot' ? price : 0, note: a.note.trim(), photos: [], memories: a.photos.map(id => ({ id, at: Date.now() })), lat: a.lat != null ? a.lat : me.lat + jitter(), lng: a.lng != null ? a.lng : me.lng + jitter(), googleId: a.googleId, hours: null, hoursSrc: null, addedAt: Date.now(), coordsAt: Date.now() };
}
function afterSave(p) { if (p._importKey) { setImportQ(importQ().filter(x => x.key !== p._importKey)); delete p._importKey; } checkLevel(); if (!p.hours) fetchOsmHours(p); setTimeout(() => maybeNudge('saved'), 2600); }
// Ask people without an account to make one, so their list isn't stuck on one phone
// Quick first-time tour: a few spotlights on Home, skippable, shown once
const TOUR = [
  { sel: null, title: 'You’re in 🎉', text: 'Your account is set up. Want a 20-second tour of how Sitio works?', next: 'Show me' },
  { sel: '.top-right [data-act="add"]', title: 'Add a place', text: 'Search any restaurant, bar or café, or drop a pin for a hidden spot. Save it to Spots, or to To try for later.' },
  { sel: '.filter-wrap .filter-pill', title: 'Filter your map', text: 'Show just bars, cafés, a cuisine, your To try places or one of your lists.' },
  { sel: '.sheet .ms-wrap', open: 'spot', title: 'Keep memories 📸', text: 'Every spot has a memories row. Add a photo of you there, with the date, and build a diary of everywhere you’ve been and who with.' },
  { sel: '.tabbar [data-tab="spots"]', title: 'Your Spots', text: 'Everything you vouch for, nearest first. Star favourites and group places into lists.' },
  { sel: '.tabbar [data-tab="totry"]', title: 'To try', text: 'Places you want to check out. Been? Save it to Spots and add a photo memory.' },
  { sel: '.tabbar [data-tab="account"]', title: 'Level up', text: 'Every spot you add levels you up, from Exploring spots to Spot connoisseur. Your progress is in Account.', next: 'Let’s go' }
];
const tourForced = /[?&]tour=1/.test(location.search);
function startTour() { if (ui.install || ui.tour != null) return; ui.tour = 0; ui.tab = 'home'; ui.sheet = null; ui.selected = null; ui.page = null; ui.menu = null; ui.dialog = null; render(); }
function endTour() { ui.tour = null; ui.sheet = null; ui.selected = null; db.tourDone = true; save(); render(); }
function tourSetup() {
  const s = TOUR[ui.tour];
  if (s && s.open === 'spot') { const sp = cityPlaces().find(p => p.status === 'spot') || db.places.find(p => p.status === 'spot'); if (sp) { ui.selected = sp.id; ui.sheet = 'spot'; } }
  else { ui.sheet = null; ui.selected = null; }
}
function tourView() {
  const s = TOUR[ui.tour]; const last = ui.tour === TOUR.length - 1;
  return `<div class="tour" role="dialog" aria-label="Quick tour"><div class="tour-spot ${s.sel ? '' : 'none'}"></div>
    <div class="tour-tip"><div class="tour-dots">${TOUR.map((_, k) => `<i class="${k === ui.tour ? 'on' : ''}"></i>`).join('')}</div>
      <b>${s.title}</b><p>${s.text}</p>
      <div class="tour-btns">${last ? '' : `<button class="link-btn" data-act="tourskip">${ui.tour === 0 ? 'No thanks' : 'Skip'}</button>`}<button class="big-btn primary-btn" data-act="tournext">${s.next || 'Next'}</button></div></div></div>`;
}
function placeTour() {
  const tour = uiEl.querySelector('.tour'); if (!tour) return; const s = TOUR[ui.tour];
  const spot = tour.querySelector('.tour-spot'), tip = tour.querySelector('.tour-tip');
  const el = s.sel && uiEl.querySelector(s.sel);
  if (!el) { spot.classList.add('none'); tip.style.top = '50%'; tip.style.transform = 'translateY(-50%)'; return; }
  const r = el.getBoundingClientRect(), rootR = root.getBoundingClientRect(), pad = 6;
  Object.assign(spot.style, { left: (r.left - rootR.left - pad) + 'px', top: (r.top - rootR.top - pad) + 'px', width: (r.width + pad * 2) + 'px', height: (r.height + pad * 2) + 'px', borderRadius: Math.min(r.height / 2 + pad, 28) + 'px' });
  const below = r.top + r.height / 2 < rootR.height / 2;
  tip.style.transform = 'none';
  if (below) { tip.style.top = (r.bottom - rootR.top + 18) + 'px'; tip.style.bottom = 'auto'; } else { tip.style.bottom = (rootR.bottom - r.top + 18) + 'px'; tip.style.top = 'auto'; }
}
function maybeNudge(reason) {
  if (ui.tour != null) return;
  if (!cloudOn() || auth || ui.install || ui.dialog || ui.sheet === 'add' || ui.page === 'auth') return;
  let last = 0; try { last = +localStorage.getItem('sitio.nudgeAt') || 0; } catch (e) { }
  const own = db.places.filter(p => !p.sample).length;
  const gap = reason === 'saved' ? 864e5 : 0;
  if (reason === 'saved' && !own) return;
  if (Date.now() - last < gap) return;
  try { localStorage.setItem('sitio.nudgeAt', String(Date.now())); } catch (e) { }
  ui.dialog = { type: 'nudge', own }; render();
}

function openPrice(place, opts = {}) {
  const d = Object.assign({ type: 'price', place, value: opts.value || place.price || 0 }, opts);
  const cs = place.cat ? catsOf(place) : opts.mode === 'new' && ui.add ? catsOf(ui.add) : opts.mode === 'copy' ? catsOf(opts.src) : opts.mode === 'shared' ? (opts.data.cs || [opts.data.c]) : [];
  d.allowFree = cs.includes('chill'); d.free = d.allowFree && opts.edit && !place.price;
  ui.dialog = d; render();
}
function confirmPrice() {
  const d = ui.dialog; if (d.free) d.value = 0; else if (!d.value) return;
  if (d.edit) { d.place.price = d.value; save(); ui.dialog = null; render(); return; }
  if (d.mode === 'new') {
    const p = placeFromAdd('spot', d.value); db.places.push(p); save();
    ui.dialog = null; ui.sheet = null; ui.add = null; ui.selected = null; ui.tab = 'home';
    toast(p.name + ' saved to Spots', () => { db.places = db.places.filter(x => x.id !== p.id); save(); });
    afterSave(p);
  } else if (d.mode === 'totry') {
    const p = d.place; p.status = 'spot'; p.price = d.value; save();
    ui.dialog = null; if (ui.sheet === 'spot') ui.sheet = null; ui.selected = null;
    toast(p.name + ' saved to Spots', () => { p.status = 'totry'; p.price = 0; save(); }); checkLevel();
  } else if (d.mode === 'copy') {
    const p = copyPlace(d.src, d.srcCity, 'spot', d.value); ui.dialog = null;
    toast(p.name + ' added to your Spots', () => { db.places = db.places.filter(x => x.id !== p.id); save(); }); afterSave(p);
  } else if (d.mode === 'shared') {
    const p = sharedToPlace(d.data, 'spot', d.value); db.places.push(p); save(); ui.dialog = null;
    toast(p.name + ' saved to Spots', () => { db.places = db.places.filter(x => x.id !== p.id); save(); }); afterSave(p);
  }
  render();
}
// Admin: copy someone's place into my own lists, in the matching city (created if I don't have it)
function copyPlace(src, srcCity, status, price) {
  let c = db.cities.find(x => srcCity && x.name.toLowerCase() === (srcCity.name || '').toLowerCase());
  if (!c && srcCity) { c = Object.assign({}, srcCity, { id: db.cities.some(x => x.id === srcCity.id) ? 'c-' + uid() : srcCity.id }); db.cities.push(c); }
  const p = { id: uid(), cityId: c ? c.id : db.currentCityId, name: src.name, area: src.area || '', cat: src.cat, cats: catsOf(src), cuisine: src.cuisine || '', status, price: status === 'spot' ? price : 0, note: '', photos: [], lat: src.lat, lng: src.lng, googleId: src.googleId || null, hours: src.hours || null, hoursSrc: src.hoursSrc || null, addedAt: Date.now() };
  db.places.push(p); save(); return p;
}
function delPlace(p) { db.places = db.places.filter(x => x.id !== p.id); (p.photos || []).forEach(id => idb.del(id).catch(() => {})); (p.memories || []).forEach(m => { idb.del(m.id).catch(() => {}); if (m.cloud) deleteCloudMemory(m.id); }); save(); if (ui.selected === p.id) { ui.selected = null; ui.sheet = null; } if (ui.page && ui.page.spot === p.id) ui.page = null; ui.dialog = null; render(); }

function shareLink(p) {
  const data = { n: p.name, c: p.cat, cs: catsOf(p), q: p.cuisine || '', a: p.area || '', la: +p.lat.toFixed(5), ln: +p.lng.toFixed(5), p: p.status === 'spot' ? p.price : 0, o: p.note || '', g: p.googleId || '', f: db.user.name || '', cu: cur() };
  const b = btoa(unescape(encodeURIComponent(JSON.stringify(data)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return location.origin + location.pathname + '#share=' + b;
}
async function share(p) {
  const url = shareLink(p); const text = `${p.name} · ${[catNames(p), p.area].filter(Boolean).join(', ')}${p.note ? ' — "' + p.note + '"' : ''}`;
  try { if (navigator.share) { await navigator.share({ title: p.name, text, url }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(text + '\n' + url); toast('Link copied', null); } catch (e) { flash('Couldn’t open sharing here.'); }
}
const b64enc = o => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64dec = s => JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/')))));
// Import from Google Maps (Google Takeout files). Each place opens the normal Add sheet, pre-filled
function importQ() { try { return JSON.parse(localStorage.getItem('sitio.importQ') || '[]'); } catch (e) { return []; } }
function setImportQ(q) { try { localStorage.setItem('sitio.importQ', JSON.stringify(q)); } catch (e) { } }
function parseCsv(t) {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < t.length; i++) { const ch = t[i];
    if (q) { if (ch === '"' && t[i + 1] === '"') { f += '"'; i++; } else if (ch === '"') q = false; else f += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { row.push(f); f = ''; } else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; } else f += ch; }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim()));
}
function coordsFromUrl(u) { const m = /@(-?\d+\.\d+),(-?\d+\.\d+)/.exec(u || '') || /[?&/](?:q|query|search\/)=?(-?\d+\.\d+),\s*(-?\d+\.\d+)/.exec(u || '') || /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/.exec(u || ''); return m ? { lat: +m[1], lng: +m[2] } : null; }
async function importFiles(files) {
  const items = [];
  for (const file of files) {
    const txt = await file.text(); const listName = file.name.replace(/\.(csv|json)$/i, '').replace(/_/g, ' ');
    if (/\.json$/i.test(file.name) || /^\s*\{/.test(txt)) {
      try { const j = JSON.parse(txt); (j.features || []).forEach(ft => { const pr = ft.properties || {}; const c = ft.geometry && ft.geometry.coordinates; const name = pr.Title || (pr.location && pr.location.name) || pr.name || (pr.Location && pr.Location['Business Name']); if (!name) return;
        items.push({ name: String(name).slice(0, 80), note: '', lat: c && +c[1], lng: c && +c[0], list: listName }); }); } catch (e) { }
    } else {
      const rows = parseCsv(txt); if (!rows.length) continue; const head = rows[0].map(h => h.trim().toLowerCase()); const ti = head.indexOf('title'), ni = head.indexOf('note'), ui_ = head.indexOf('url');
      rows.slice(ti >= 0 ? 1 : 0).forEach(r => { const name = (r[ti >= 0 ? ti : 0] || '').trim(); if (!name) return; const c = coordsFromUrl(r[ui_]); items.push({ name: name.slice(0, 80), note: (r[ni] || '').trim().slice(0, 500), lat: c && c.lat, lng: c && c.lng, list: listName }); });
    }
  }
  const have = n => db.places.some(p => p.name.toLowerCase() === n.toLowerCase());
  const q = importQ(); let skipped = 0, added = 0;
  items.forEach(it => { if (have(it.name) || q.some(x => x.name.toLowerCase() === it.name.toLowerCase())) { skipped++; return; } q.push(Object.assign({ key: 'i-' + uid() }, it)); added++; });
  setImportQ(q); ui.importMsg = added ? `Found ${added} ${added === 1 ? 'place' : 'places'} to add${skipped ? ` · ${skipped} already in Sitio, skipped` : ''}.` : (items.length ? 'Everything in those files is already in Sitio.' : 'No places found in that file. Pick the CSV files from the Saved folder.');
  render();
}
function importPage() {
  const q = importQ(); const lists = [...new Set(q.map(x => x.list))];
  return `<div class="page" style="z-index:15">
    <div class="page-head" style="justify-content:flex-start"><button class="round sec-btn" style="width:44px;height:44px;flex:none" data-act="closepage" aria-label="Back">${ICON.back}</button><span style="font-size:22px;font-weight:800">Import from Google Maps</span></div>
    ${q.length ? '' : `<div class="card note" style="margin-top:0;line-height:1.55"><b>1.</b> Go to <b>takeout.google.com</b> and tap <b>Deselect all</b><br><b>2.</b> Tick <b>Saved</b> (your Google Maps lists). Optional: <b>Maps (your places)</b> for starred places<br><b>3.</b> Create the export and download the zip from Google’s email<br><b>4.</b> Open the zip (in Files, tap it to unzip), then choose the files below</div>`}
    <label class="big-btn primary-btn" style="width:100%;margin:12px 0;cursor:pointer">${ICON.plus}Choose Google Maps files<input type="file" accept=".csv,.json,text/csv,application/json" multiple hidden data-import="1"></label>
    ${ui.importMsg ? `<p class="page-sub" style="margin:0 0 10px">${esc(ui.importMsg)}</p>` : ''}
    ${q.length ? `<div class="section-label" style="margin:6px 0 4px">${q.length} to go</div><p class="page-sub" style="font-size:12px;margin:0 0 10px">Tap Add: the place opens in the usual Add screen so you can pick the right match and set its category. Imported places are never added automatically.</p>
      ${lists.map(ln => `<div class="section-label" style="margin:12px 0 6px">${esc(ln)}</div><div class="settings card">${q.filter(x => x.list === ln).map(x => `<div class="set-row" style="min-height:54px"><span style="display:flex;flex-direction:column;gap:1px;min-width:0"><span style="font-weight:800;overflow:hidden;text-overflow:ellipsis">${esc(x.name)}</span>${x.note ? `<span style="font-size:11px;font-weight:600;color:var(--text-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(x.note)}</span>` : ''}</span><span style="display:flex;gap:6px;flex:none"><button class="pill primary-btn" style="height:36px;padding:0 14px" data-act="importadd" data-id="${x.key}">Add</button><button class="round sec-btn" style="width:36px;height:36px" data-act="importskip" data-id="${x.key}" aria-label="Skip">${ICON.close}</button></span></div>`).join('')}</div>`).join('')}
      <button class="link-btn" style="margin:14px auto 0;color:var(--text-2)" data-act="importclear">Clear the rest</button>` : ''}
  </div>`;
}
function listLink(l) {
  const ps = l.ids.map(byId).filter(Boolean).slice(0, 40);
  const data = { n: l.name, e: l.emoji, f: db.user.name || '', p: ps.map(p => { const c = db.cities.find(x => x.id === p.cityId) || {}; return { n: p.name, c: p.cat, cs: catsOf(p), q: p.cuisine || '', a: p.area || '', la: +p.lat.toFixed(5), ln: +p.lng.toFixed(5), o: p.note || '', g: p.googleId || '', ci: { n: c.name || '', cc: c.cc || '', cu: c.currency || '€', la: c.lat != null ? +c.lat.toFixed(3) : null, ln: c.lng != null ? +c.lng.toFixed(3) : null } }; }) };
  return location.origin + location.pathname + '#list=' + b64enc(data);
}
function listData(l) {
  const ps = l.ids.map(byId).filter(Boolean).slice(0, 60);
  return { n: l.name, e: l.emoji, f: db.user.name || '', p: ps.map(p => { const c = db.cities.find(x => x.id === p.cityId) || {}; return { n: p.name, c: p.cat, cs: catsOf(p), q: p.cuisine || '', a: p.area || '', la: +p.lat.toFixed(5), ln: +p.lng.toFixed(5), o: p.note || '', g: p.googleId || '', ci: { n: c.name || '', cc: c.cc || '', cu: c.currency || '€', la: c.lat != null ? +c.lat.toFixed(3) : null, ln: c.lng != null ? +c.lng.toFixed(3) : null } }; }) };
}
async function shortListLink(l) {
  if (!auth || !cloudOn()) return null;
  const id = Array.from(crypto.getRandomValues(new Uint8Array(8)), b => 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 56]).join('');
  await sbFetch('/rest/v1/sitio_shares', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ id, owner: auth.user.id, data: listData(l) }) }, true);
  return location.origin + location.pathname + '#l=' + id;
}
async function shareList(l) {
  if (!auth) { flash('Log in to share lists. Your account keeps the link working.'); return; }
  let short; try { short = await shortListLink(l); } catch (e) { flash('Couldn’t create the link: ' + friendly(e)); return; }
  const url = short, n = l.ids.filter(id => byId(id)).length, text = `${l.emoji} ${l.name} · ${n} ${n === 1 ? 'place' : 'places'} on Sitio`;
  try { if (navigator.share) { await navigator.share({ title: l.name, text, url }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(text + '\n' + url); toast('List link copied', null); } catch (e) { flash(url); }
}
// One-off: send a recap (with 14-day photo links) to friends as a short link
async function sendRecap(d, demoId) {
  if (!auth) { flash('Log in to share recaps. Your account keeps the photos online.'); return; }
  const ms = recapItems(d.per, d.loc).filter(x => x.m.cloud);
  if (!ms.length) { flash('These photos aren’t online yet. Try again in a minute.'); return; }
  toast('Making the link…', null);
  try {
    await ensureFresh();
    const items = [];
    for (const x of ms.slice(0, 40)) {
      const r = await fetch(SBURL + '/storage/v1/object/sign/' + memPath(x.m.id), { method: 'POST', headers: { apikey: SBKEY, Authorization: 'Bearer ' + auth.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: 14 * 86400 }) });
      const j = r.ok ? await r.json() : null; if (!j || !j.signedURL) continue;
      items.push({ u: SBURL + '/storage/v1' + j.signedURL, n: x.p.name, w: [x.p.area, cityOf(x.p) && cityOf(x.p).name].filter(Boolean).join(', '), at: x.m.at });
    }
    if (!items.length) { flash('Couldn’t prepare the photos.'); return; }
    const id = demoId || Array.from(crypto.getRandomValues(new Uint8Array(8)), b => 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 56]).join('');
    await sbFetch('/rest/v1/sitio_shares', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ id, owner: auth.user.id, data: { t: 'recap', y: d.per.y, k: d.per.k, f: db.user.name || '', o: auth.user.id, items } }) }, true);
    if (demoId) { toast('Done. Everyone else sees it next time they open Sitio', null); return; }
    const url = location.origin + location.pathname + '#r=' + id, text = 'My ' + (d.per.year ? d.per.y : d.per.label) + ' on Sitio ✨';
    try { if (navigator.share) { await navigator.share({ title: 'Sitio recap', text, url }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(text + '\n' + url); toast('Recap link copied', null); } catch (e) { flash(url); }
  } catch (e) { flash('Couldn’t create the link: ' + friendly(e)); }
}
// One-off demo: the admin's recap pops up once for everyone else the next time they open Sitio
const DEMO_RECAP = 'demoND2026', DEMO_CUTOFF = Date.parse('2026-11-04T00:15:00Z');
function checkDemoRecap(tries = 0) {
  if (!cloudOn() || Date.now() > DEMO_CUTOFF + 14 * 864e5) return;
  if (!auth) { if (tries < 40) setTimeout(() => checkDemoRecap(tries + 1), 500); return; }
  try { if (localStorage.getItem('sitio.seen.' + DEMO_RECAP)) return; } catch (e) { }
  if (ui.dialog || ui.install || ui.sheet || ui.page || ui.tour != null) { if (tries < 240) setTimeout(() => checkDemoRecap(tries + 1), 500); return; }
  if (!auth.user.created_at) { sbFetch('/auth/v1/user', {}, true).then(u => { if (u && u.created_at && auth) { auth.user.created_at = u.created_at; try { localStorage.setItem('sitio.auth', JSON.stringify(auth)); } catch (e) { } checkDemoRecap(tries + 1); } }).catch(() => { }); return; }
  sbFetch('/rest/v1/rpc/sitio_get_share', { method: 'POST', body: JSON.stringify({ sid: DEMO_RECAP }) }).then(d => {
    // only accounts that existed before the demo was made (Lola and Marta), never new sign-ups or logged-out phones
    const made = auth && auth.user && Date.parse(auth.user.created_at || '');
    if (!d || d.t !== 'recap' || isAdmin || !auth || d.o === auth.user.id || !made || made > DEMO_CUTOFF) return;
    if (ui.dialog || ui.install || ui.sheet || ui.page || ui.tour != null) { setTimeout(() => checkDemoRecap(tries + 1), 1000); return; }
    if (openSharedRecap(d)) { try { localStorage.setItem('sitio.seen.' + DEMO_RECAP, '1'); } catch (e) { } ui.tab = 'home'; render(); }
  }).catch(() => { });
}
setTimeout(checkDemoRecap, 1500);
function openSharedRecap(s) {
  if (!s || s.t !== 'recap' || !Array.isArray(s.items)) return false;
  const str = (v, n) => typeof v === 'string' ? v.slice(0, n) : '';
  const items = s.items.slice(0, 40).filter(x => typeof x.u === 'string' && x.u.startsWith(SBURL + '/storage/v1/object/sign/') && typeof x.at === 'number').map(x => ({ src: x.u, name: str(x.n, 80), where: str(x.w, 80), at: x.at }));
  if (!items.length) return false;
  const y = +s.y || new Date().getFullYear(), per = s.k === 'y' ? recapYear(y) : recapPer(y, Math.max(0, Math.min(5, +s.k || 0)));
  ui.install = false; ui.dialog = { type: 'recap', per, shared: { f: str(s.f, 20), items }, open: false, intro: true, introAt: Date.now() };
  return true;
}
// A recap notification opens Sitio with #recap=YEAR-K (K is 0-5, or y for the year)
function recapFromHash(hash, tries = 0) {
  const m = (hash || '').match(/recap=(\d{4})-(y|[0-5])/); if (!m) return false;
  if (location.hash) history.replaceState(null, '', location.pathname);
  const per = m[2] === 'y' ? recapYear(+m[1]) : recapPer(+m[1], +m[2]);
  const go = (t = 0) => {
    if ((releaseAt(per) > Date.now() && !isAdmin) || !recapItems(per).some(x => photoUrl(x.m.id))) { if (t < 30) setTimeout(() => go(t + 1), 500); return; }
    if (ui.dialog && ui.dialog.type === 'recap') return;
    ui.sheet = null; ui.page = null; ui.tab = 'home'; ui.dialog = { type: 'recap', per, open: false, intro: true, introAt: Date.now() }; render();
  };
  go(); return true;
}
function readSharedList() {
  if (recapFromHash(location.hash)) return true;
  const rm = location.hash.match(/(?:^#|&)r=([A-Za-z0-9]{6,16})/);
  if (rm) { history.replaceState(null, '', location.pathname);
    sbFetch('/rest/v1/rpc/sitio_get_share', { method: 'POST', body: JSON.stringify({ sid: rm[1] }) }).then(d => { if (openSharedRecap(d)) render(); else flash('That recap isn’t available any more.'); }).catch(() => flash('Couldn’t open that recap. Check your connection.'));
    return true; }
  const sm = location.hash.match(/(?:^#|&)l=([A-Za-z0-9]{6,16})/);
  if (sm) { history.replaceState(null, '', location.pathname);
    sbFetch('/rest/v1/rpc/sitio_get_share', { method: 'POST', body: JSON.stringify({ sid: sm[1] }) }).then(d => { if (d) { applySharedList(d); render(); } else flash('That shared list isn’t available any more.'); }).catch(() => flash('Couldn’t open that shared list. Check your connection.'));
    return true; }
  const m = location.hash.match(/list=([A-Za-z0-9_-]+)/); if (!m) return false;
  try { applySharedList(b64dec(m[1])); } catch (e) { }
  history.replaceState(null, '', location.pathname); return true;
}
function applySharedList(s) {
  try {
    const str = (v, n) => typeof v === 'string' ? v.slice(0, n) : '';
    const num = (v, lo, hi) => typeof v === 'number' && isFinite(v) && v >= lo && v <= hi ? v : null;
    const ps = (Array.isArray(s.p) ? s.p : []).slice(0, 60).map(x => ({ n: str(x.n, 80), c: CATS.some(c => c.id === x.c) ? x.c : 'restaurant', cs: Array.isArray(x.cs) ? x.cs.filter(y => CATS.some(c => c.id === y)).slice(0, 6) : [], q: cuisList({ cuisine: str(x.q, 120) }).filter(q => CUISINES.includes(q)).join(', '), a: str(x.a, 60), la: num(x.la, -90, 90), ln: num(x.ln, -180, 180), o: str(x.o, 500), g: /^[A-Za-z0-9_-]{0,300}$/.test(x.g || '') ? (x.g || '') : '',
      ci: { n: str(x.ci && x.ci.n, 40), cc: /^[A-Z]{2}$/.test(x.ci && x.ci.cc || '') ? x.ci.cc : '', cu: str(x.ci && x.ci.cu, 4) || '€', la: num(x.ci && x.ci.la, -90, 90), ln: num(x.ci && x.ci.ln, -180, 180) } })).filter(x => x.n && x.la !== null && x.ln !== null);
    if (ps.length) ui.dialog = { type: 'sharedlist', data: { n: str(s.n, 40) || 'Shared list', e: LIST_EMOJI.includes(s.e) ? s.e : '📍', f: str(s.f, 20), p: ps } };
  } catch (e) { /* bad data */ }
}
function saveSharedList(s) {
  const near = (x, p) => { const R = 6371000, r = Math.PI / 180, dLat = (x.la - p.lat) * r, dLng = (x.ln - p.lng) * r; const h = Math.sin(dLat / 2) ** 2 + Math.cos(p.lat * r) * Math.cos(x.la * r) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)) < 150; };
  const ids = []; let added = 0;
  s.p.forEach(x => {
    let p = db.places.find(q => (x.g && q.googleId === x.g) || (q.name.toLowerCase() === x.n.toLowerCase() && near(x, q)));
    if (!p) {
      let c = db.cities.find(k => x.ci.n && k.name.toLowerCase() === x.ci.n.toLowerCase() && (!x.ci.cc || !k.cc || k.cc === x.ci.cc));
      if (!c && x.ci.n) { c = { id: 'c-' + uid(), name: x.ci.n, country: '', cc: x.ci.cc, currency: x.ci.cu, lat: x.ci.la, lng: x.ci.ln }; db.cities.push(c); }
      p = { id: uid(), cityId: c ? c.id : db.currentCityId, name: x.n, area: x.a, cat: x.c, cats: x.cs.length ? x.cs : [x.c], cuisine: x.q, status: 'totry', price: 0, note: x.o ? (s.f || 'Friend') + ': ' + x.o : '', photos: [], lat: x.la, lng: x.ln, googleId: x.g || null, hours: null, hoursSrc: null, addedAt: Date.now() };
      db.places.push(p); added++;
    }
    ids.push(p.id);
  });
  const l = { id: 'l-' + uid(), name: s.n, emoji: s.e, ids: [...new Set(ids)], createdAt: Date.now() }; myLists().push(l); touchList(l);
  return { l, added };
}
function readShared() {
  if (readSharedList()) return;
  const m = location.hash.match(/share=([A-Za-z0-9_-]+)/); if (!m) return;
  try {
    const s = JSON.parse(decodeURIComponent(escape(atob(m[1].replace(/-/g, '+').replace(/_/g, '/')))));
    const str = (v, n) => typeof v === 'string' ? v.slice(0, n) : '';
    const num = (v, lo, hi) => typeof v === 'number' && isFinite(v) && v >= lo && v <= hi ? v : null;
    const clean = { n: str(s.n, 80), c: CATS.some(c => c.id === s.c) ? s.c : 'restaurant', cs: Array.isArray(s.cs) ? s.cs.filter(x => CATS.some(c => c.id === x)).slice(0, 6) : [], q: cuisList({ cuisine: str(s.q, 120) }).filter(q => CUISINES.includes(q)).join(', '), a: str(s.a, 60), la: num(s.la, -90, 90), ln: num(s.ln, -180, 180), p: [0, 1, 2, 3].includes(s.p) ? s.p : 0, o: str(s.o, 500), g: /^[A-Za-z0-9_-]{0,300}$/.test(s.g || '') ? (s.g || '') : '', f: str(s.f, 20), cu: str(s.cu, 4) };
    if (clean.n && clean.la !== null && clean.ln !== null) ui.dialog = { type: 'shared', data: clean };
  } catch (e) { /* bad link */ }
  history.replaceState(null, '', location.pathname);
}
function sharedToPlace(s, status, price) { return { id: uid(), cityId: db.currentCityId, name: s.n, area: s.a, cat: s.c, cats: s.cs && s.cs.length ? s.cs : [s.c], cuisine: s.q, status, price: status === 'spot' ? price : 0, note: '', photos: [], lat: s.la, lng: s.ln, googleId: s.g || null, hours: null, hoursSrc: null, addedAt: Date.now(), coordsAt: Date.now() }; }

function backup() {
  Promise.all(db.places.flatMap(p => (p.photos || []).map(id => idb.get(id).then(b => b ? new Promise(r => { const fr = new FileReader(); fr.onload = () => r([id, fr.result]); fr.readAsDataURL(b); }) : null)))).then(pairs => {
    const out = { app: 'sitio', version: 1, savedAt: new Date().toISOString(), db, photos: Object.fromEntries(pairs.filter(Boolean)) };
    const blob = new Blob([JSON.stringify(out)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'sitio-backup-' + new Date().toISOString().slice(0, 10) + '.json'; document.body.appendChild(a); a.click(); a.remove();
    toast('Backup saved', null);
  });
}
function restore(file) {
  const fr = new FileReader();
  fr.onload = async () => {
    try {
      const data = JSON.parse(fr.result); if (data.app !== 'sitio' || !data.db) throw new Error('not a backup');
      for (const [id, url] of Object.entries(data.photos || {})) { const b = await (await fetch(url)).blob(); await idb.put(id, b); }
      db = data.db; save(); ui.page = null; ui.tab = 'home'; toast('Restored ' + db.places.length + ' places', null);
    } catch (e) { flash('That file isn’t a Sitio backup.'); }
  };
  fr.readAsText(file);
}

// Opening hours from OpenStreetMap (free, allowed to store). Refreshed every 14 days.
async function fetchOsmHours(p) {
  if (!p || p.hoursSrc === 'manual') return;
  try {
    const q = `[out:json][timeout:15];nwr(around:150,${p.lat},${p.lng})["name"]["opening_hours"];out tags center 40;`;
    const r = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: 'data=' + encodeURIComponent(q) });
    if (!r.ok) return;
    const j = await r.json(); const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
    const n = norm(p.name); const words = p.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z0-9]+/).filter(w => w.length >= 4 && !['restaurante', 'restaurant', 'cafe', 'cafeteria', 'taberna', 'casa', 'madrid'].includes(w));
    const els = j.elements || [];
    const hit = els.find(e => { const m = norm(e.tags.name || ''); return m && (m.includes(n) || n.includes(m)); })
      || els.find(e => { const m = norm((e.tags.name || '') + ' ' + (e.tags.brand || '')); return words.length && words.every(w => m.includes(w)); })
      || els.find(e => { const m = norm(e.tags.name || ''); return words.some(w => w.length >= 5 && m.includes(w)); });
    const week = hit && parseOH(hit.tags.opening_hours);
    const live = byId(p.id); if (!live) return;
    if (week) { live.hours = week; live.hoursSrc = 'osm'; live.hoursAt = Date.now(); save(); render(); } else { live.hoursTry = Date.now(); save(); }
  } catch (e) { /* offline or blocked: try again later */ }
}
function refreshHours() { const due = Date.now() - 14 * 864e5, retry = Date.now() - 3 * 864e5; db.places.filter(p => p.hoursSrc !== 'manual' && ((p.hoursSrc === 'osm' && p.hours && (p.hoursAt || 0) < due) || (!p.hours && (p.hoursTry || 0) < retry))).slice(0, 10).forEach((p, i) => setTimeout(() => fetchOsmHours(p), i * 1500)); }

// Google place search (only when a Google key is set). Only the place ID and coordinates are kept.
let gToken = null, gTimer = null;
async function googleSuggest(text) {
  const box = $('#suggest'); if (!box || !mapApi.google || !text || text.length < 2) { if (box) box.innerHTML = ''; return; }
  try {
    const { AutocompleteSuggestion, AutocompleteSessionToken } = await google.maps.importLibrary('places');
    gToken = gToken || new AutocompleteSessionToken();
    // Keep results inside the current city or town (~25 km around its centre, or around you if you're there)
    let c = cityCentre();
    if (!c && haveLocation) c = me;
    if (c && haveLocation && dist(c) < 40000) c = me;
    const req = { input: text, sessionToken: gToken };
    if (city().cc) req.includedRegionCodes = [city().cc.toLowerCase()];
    if (haveLocation) req.origin = me;
    let suggestions = [];
    if (c) {
      const dLat = 0.23, dLng = 0.23 / Math.cos(c.lat * Math.PI / 180);
      ({ suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({ ...req, locationRestriction: { south: c.lat - dLat, north: c.lat + dLat, west: c.lng - dLng, east: c.lng + dLng } }));
    }
    if (!suggestions.length) ({ suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({ ...req, locationBias: { center: c || me, radius: 20000 } }));
    box.innerHTML = `<div class="menu" style="position:absolute;top:52px;left:0;right:0;width:auto;z-index:5">${suggestions.slice(0, 5).map((s, i) => `<button data-act="gpick" data-i="${i}" style="height:auto;padding:10px 12px;flex-direction:column;align-items:flex-start;gap:2px"><span style="font-weight:800">${esc(s.placePrediction.mainText.text)}</span><span class="sub">${esc(s.placePrediction.secondaryText ? s.placePrediction.secondaryText.text : '')}</span></button>`).join('')}</div>`;
    googleSuggest.last = suggestions;
  } catch (e) { box.innerHTML = ''; }
}
// If you're far from the city Sitio is showing, offer to switch to where you are
let herePrompt = null;
function whereAmI() {
  if (nearCity()) return;
  const near = db.cities.find(c => c.lat != null && dist(c) < 50000);
  if (near) { herePrompt = { city: near }; return tryHerePrompt(); }
  const key = 'sitio.hereSkip.' + me.lat.toFixed(1) + ',' + me.lng.toFixed(1);
  try { if (+localStorage.getItem(key) > Date.now()) return; } catch (e) { }
  const osm = () => fetch('https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&accept-language=en&lat=' + me.lat + '&lon=' + me.lng)
    .then(r => r.json()).then(j => {
      const ad = j.address || {}; const greater = /^Greater (.+)$/.exec(ad.state_district || ad.county || '');
      const name = greater ? greater[1] : (ad.city || ad.town || ad.village || ad.municipality || ad.county); if (!name) return;
      const cc = (ad.country_code || '').toUpperCase();
      herePrompt = { name, country: ad.country || '', cc, lat: me.lat, lng: me.lng, key }; tryHerePrompt();
    }).catch(() => { });
  // Google knows the proper town/city (e.g. "London", not a borough); fall back to OpenStreetMap
  if (!mapApi.google) return osm();
  google.maps.importLibrary('places').then(({ Place, SearchNearbyRankPreference }) => Place.searchNearby({ fields: ['displayName', 'location', 'addressComponents'], locationRestriction: { center: me, radius: 25000 }, includedPrimaryTypes: ['locality'], maxResultCount: 1, rankPreference: SearchNearbyRankPreference.DISTANCE }))
    .then(({ places }) => {
      const pl = places && places[0]; if (!pl) return osm();
      const country = (pl.addressComponents || []).find(c => c.types.includes('country'));
      herePrompt = { name: pl.displayName, country: country ? country.longText : '', cc: country ? country.shortText : '', lat: pl.location.lat(), lng: pl.location.lng(), key }; tryHerePrompt();
    }).catch(osm);
}
function tryHerePrompt() {
  if (!herePrompt) return;
  if (ui.dialog || ui.install || ui.sheet || ui.page === 'auth' || ui.tour != null || ui.globe) { setTimeout(tryHerePrompt, 1500); return; }
  ui.dialog = { type: 'here', h: herePrompt }; herePrompt = null; render();
}
let cityTimer = null, cityToken = null;
async function citySuggest(text) {
  const box = $('#citysug'); if (!box) return;
  if (!mapApi.google || !text || text.trim().length < 2) { box.innerHTML = ''; return; }
  try {
    const { AutocompleteSuggestion, AutocompleteSessionToken } = await google.maps.importLibrary('places');
    cityToken = cityToken || new AutocompleteSessionToken();
    const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({ input: text, sessionToken: cityToken, includedPrimaryTypes: ['(cities)'] });
    citySuggest.last = suggestions;
    box.innerHTML = suggestions.length ? `<div class="settings card">${suggestions.slice(0, 5).map((s, i) => `<button class="set-row" data-act="citypick" data-i="${i}" style="min-height:56px"><span style="display:flex;flex-direction:column;gap:2px;text-align:left"><span style="font-weight:800">${esc(s.placePrediction.mainText.text)}</span><span style="font-size:12px;font-weight:600;color:var(--text-2)">${esc(s.placePrediction.secondaryText ? s.placePrediction.secondaryText.text : '')}</span></span></button>`).join('')}</div>` : '<p class="page-sub" style="font-size:13px">No matches. Try another spelling.</p>';
  } catch (e) { box.innerHTML = '<p class="page-sub" style="font-size:13px">Search isn’t working right now. Try again in a moment.</p>'; }
}
async function cityPick(i) {
  const s = citySuggest.last && citySuggest.last[i]; if (!s) return;
  try {
    const place = s.placePrediction.toPlace();
    await place.fetchFields({ fields: ['displayName', 'location', 'addressComponents'] });
    const country = (place.addressComponents || []).find(c => c.types.includes('country'));
    const cc = country ? country.shortText : '';
    const name = (place.displayName || s.placePrediction.mainText.text).slice(0, 40);
    const existing = db.cities.find(c => c.name.toLowerCase() === name.toLowerCase() && (c.cc || '') === cc);
    let c = existing;
    if (!c) { c = { id: 'c-' + uid(), name, country: country ? country.longText : '', cc, currency: currencyFor(cc), lat: place.location.lat(), lng: place.location.lng() }; db.cities.push(c); }
    db.currentCityId = c.id; c.usedAt = Date.now(); ui.globe = false; cityToken = null; save();
    ui.dialog = null; ui.page = null; ui.tab = 'home'; ui.filter = []; ui.selected = null; lastMapKey = '';
    mapApi.view({ lat: c.lat, lng: c.lng }, 13);
    toast(existing ? 'Switched to ' + c.name : c.name + ' added · prices in ' + c.currency, null);
    render();
  } catch (e) { flash('Couldn’t add that place. Try again.'); }
}
async function googlePick(i) {
  const s = googleSuggest.last && googleSuggest.last[i]; if (!s) return;
  const place = s.placePrediction.toPlace();
  await place.fetchFields({ fields: ['displayName', 'location', 'addressComponents'] });
  const comp = (place.addressComponents || []).find(c => c.types.includes('neighborhood') || c.types.includes('sublocality'));
  Object.assign(ui.add, { name: place.displayName, googleId: place.id, lat: place.location.lat(), lng: place.location.lng(), area: comp ? comp.longText : ui.add.area });
  gToken = null; render();
}

/* ---------- events ---------- */
uiEl.addEventListener('click', e => {
  const t = e.target.closest('[data-act]'); if (!t) { if (ui.menu && !e.target.closest('.menu')) { ui.menu = null; render(); } return; }
  const act = t.dataset.act, id = t.dataset.id, p = id ? byId(id) : null;
  if (ui.menu && !t.closest('.menu') && act !== 'menu') ui.menu = null;
  switch (act) {
    case 'tab': if (t.dataset.tab === 'account') setTimeout(uploadMemories, 200); ui.tab = t.dataset.tab; ui.page = null; ui.sheet = null; ui.selected = null; ui.menu = null; break;
    case 'pin': ui.selected = id; ui.sheet = 'spot'; break;
    case 'menu': ui.menu = ui.menu === t.dataset.menu ? null : t.dataset.menu; break;
    case 'filt': toggleFilter(t.dataset.f); if (t.dataset.f === 'all') ui.menu = null; break;
    case 'cuisines': e.stopPropagation(); ui.cuisineOpen = !ui.cuisineOpen; break;
    case 'cities': ui.page = 'cities'; ui.cityQ = ''; break;
    case 'closepage': ui.adminSheet = null; if (ui.page && ui.page.adminUser) { ui.page = ui.page.place ? { adminUser: ui.page.adminUser, city: ui.page.city } : ui.page.city ? { adminUser: ui.page.adminUser } : 'admin'; break; } ui.page = ui.prevPage || null; ui.prevPage = null; break;
    case 'pickworld': ui.globe = true; ui.page = null; ui.filter = []; ui.selected = null; ui.sheet = null; ui.tab = 'home'; lastMapKey = ''; render(); setTimeout(() => mapApi.flyOut({ lat: 25, lng: 10 }, 2), 60); return;
    case 'pickcity': { ui.globe = false; db.currentCityId = id; { const pc = db.cities.find(x => x.id === id); if (pc) pc.usedAt = Date.now(); } save(); ui.page = null; ui.filter = []; ui.selected = null; ui.tab = 'home'; const cc = cityCentre(); if (cc) { if (haveLocation && dist(cc) < 50000) mapApi.view(me, 15); else mapApi.view(cc, 13); } lastMapKey = ''; break; }
    case 'addcity': ui.dialog = { type: 'addcity' }; render(); setTimeout(() => { const i = uiEl.querySelector('[data-input="cityQ"]'); if (i) i.focus(); }, 60); return;
    case 'citypick': cityPick(+t.dataset.i); return;
    case 'citymanual': { const v = (uiEl.querySelector('[data-input="cityQ"]') || {}).value || ''; const name = v.trim().slice(0, 40); if (!name) { flash('Type the name first.'); return; } const c = { id: 'c-' + uid(), name, country: '', currency: '€' }; db.cities.push(c); db.currentCityId = c.id; c.usedAt = Date.now(); ui.globe = false; save(); ui.page = null; ui.tab = 'home'; ui.dialog = { type: 'currency', cityId: c.id }; break; }
    case 'search': ui.tab = 'spots'; ui.spotsOpenNow = false; render(); setTimeout(() => { const i = uiEl.querySelector('[data-input="spotsSearch"]'); if (i) i.focus(); }, 50); return;
    case 'add': ui.add = newAdd(); ui.sheet = 'add'; ui.selected = null; break;
    case 'closesheet': ui.sheet = null; ui.selected = null; ui.add = null; ui.pinMode = false; break;
    case 'locate': locate(true); return;
    case 'droppin': {
      ui.pinMode = true; ui.tab = 'home'; mapApi.el.style.visibility = 'visible';
      const start = ui.add.lat != null ? { lat: ui.add.lat, lng: ui.add.lng } : (haveLocation && nearCity() ? me : (cityCentre() || me));
      mapApi.view(start, 17); break;
    }
    case 'pincancel': ui.pinMode = false; break;
    case 'unpin': Object.assign(ui.add, { custom: false, lat: null, lng: null, name: '' }); break;
    case 'pinok': { const c = mapApi.getCenter(); const wasGoogle = !!ui.add.googleId; Object.assign(ui.add, { lat: c.lat, lng: c.lng, googleId: null, custom: true }); if (!wasGoogle) ui.add.name = ui.add.name || ''; ui.pinMode = false; render(); setTimeout(() => { const i = uiEl.querySelector('[data-input="addName"]'); if (i && !ui.add.name) i.focus(); }, 60); return; }
    case 'addcat': { const l = catsOf(ui.add), v = t.dataset.v; const n = l.includes(v) ? (l.length > 1 ? l.filter(x => x !== v) : l) : l.concat(v); ui.add.cats = n; ui.add.cat = n[0]; break; }
    case 'addcuisine': { const l = cuisList(ui.add), v = t.dataset.v; ui.add.cuisine = (l.includes(v) ? l.filter(x => x !== v) : l.concat(v)).join(', '); break; }
    case 'addrmphoto': ui.add.photos.splice(+t.dataset.i, 1); break;
    case 'addsave': if (!ui.add.name.trim()) { flash('Add the place name first.'); return; } openPrice({ name: ui.add.name.trim() }, { mode: 'new' }); return;
    case 'addtry': { if (!ui.add.name.trim()) { flash('Add the place name first.'); return; } const np = placeFromAdd('totry', 0); db.places.push(np); save(); ui.sheet = null; ui.add = null; toast(np.name + ' added to To try', () => { db.places = db.places.filter(x => x.id !== np.id); save(); }); afterSave(np); return; }
    case 'gpick': googlePick(+t.dataset.i); return;
    case 'setprice': ui.dialog.value = +t.dataset.v; ui.dialog.free = false; break;
    case 'setfree': ui.dialog.free = !ui.dialog.free; if (ui.dialog.free) ui.dialog.value = 0; break;
    case 'pricesave': confirmPrice(); return;
    case 'editprice': openPrice(p, { edit: true }); return;
    case 'savetry': openPrice(p, { mode: 'totry' }); return;
    case 'del': ui.dialog = { type: 'confirm', place: p }; break;
    case 'confirmdel': delPlace(ui.dialog.place); return;
    case 'closedialog': if (t.tagName === 'A') { setTimeout(() => { ui.dialog = null; render(); }, 50); return; } ui.dialog = null; break;
    case 'dirs': ui.dialog = { type: 'dirs', place: p }; break;
    case 'share': if (ui.dialog && ui.dialog.type === 'more') { ui.dialog = null; render(); } share(p); return;
    case 'open': ui.selected = id; ui.sheet = 'spot'; break;
    case 'showtry': ui.selected = id; ui.sheet = 'spot'; break;
    case 'trymap': ui.tab = 'home'; ui.filter = ['totry']; break;
    case 'trysort': ui.tryNewest = !ui.tryNewest; break;
    case 'opennow': ui.spotsOpenNow = !ui.spotsOpenNow; break;
    case 'favfilter': ui.spotsFav = !ui.spotsFav; break;
    case 'fav': if (p) { p.fav = !p.fav; save(); } break;
    case 'expand': ui.expand[t.dataset.cat] = !ui.expand[t.dataset.cat]; break;
    case 'undo': if (ui.toast && ui.toast.undo) ui.toast.undo(); ui.toast = null; break;
    case 'toggle': db.settings[t.dataset.key] = !db.settings[t.dataset.key]; save(); if (t.dataset.key === 'darkMap') mapApi.setStyle(); lastMapKey = ''; break;
    case 'dirapp': db.settings.dirApp = db.settings.dirApp === 'apple' ? 'google' : 'apple'; save(); break;
    case 'currency': ui.dialog = { type: 'currency', cityId: city().id }; break;
    case 'pickcur': { const c = db.cities.find(x => x.id === ui.dialog.cityId); if (c) { c.currency = t.dataset.v; save(); } ui.dialog = null; break; }
    case 'backup': backup(); return;
    case 'clearsample': db.places = db.places.filter(x => !x.sample); db.sample = false; save(); toast('Starter spots removed', null); return;
    case 'profile': ui.page = 'profile'; break;
    case 'nudgeyes': ui.dialog = null; ui.page = 'auth'; ui.authMode = 'signup'; ui.authMsg = null; break;
    case 'nudgelogin': ui.dialog = null; ui.page = 'auth'; ui.authMode = 'login'; ui.authMsg = null; break;
    case 'saveuname': saveUsername((ui.unameDraft != null ? ui.unameDraft : db.user.name || '').trim()); return;
    case 'unamedlg': saveUsername(((uiEl.querySelector('[data-input="unameDraft"]') || {}).value || '').trim(), true); return;
    case 'spview': ui.spotsView = t.dataset.v; ui.menu = null; break;
    case 'openlist': ui.page = { list: id }; break;
    case 'listpick': if (p) ui.dialog = { type: 'listpick', id: p.id }; break; // replaces the More sheet
    case 'listtoggle': { const l = listOf(id), pid = ui.dialog.id; if (l) { l.ids = l.ids.includes(pid) ? l.ids.filter(x => x !== pid) : l.ids.concat(pid); touchList(l); } break; }
    case 'newlist': ui.dialog = { type: 'listedit', name: '', emoji: LIST_EMOJI[0], forPlace: (ui.dialog && ui.dialog.type === 'listpick') ? ui.dialog.id : null }; render(); setTimeout(() => { const i = uiEl.querySelector('[data-input="listName"]'); if (i) i.focus(); }, 60); return;
    case 'editlist': { ui.dialog = null; const l = listOf(id); if (l) ui.dialog = { type: 'listedit', listId: l.id, name: l.name, emoji: l.emoji }; break; }
    case 'listemoji': ui.dialog.name = (uiEl.querySelector('[data-input="listName"]') || {}).value || ui.dialog.name; ui.dialog.emoji = t.dataset.v; break;
    case 'listsave': { const dd = ui.dialog, name = ((uiEl.querySelector('[data-input="listName"]') || {}).value || '').trim().slice(0, 40); if (!name) { flash('Give the list a name.'); return; }
      if (dd.listId) { const l = listOf(dd.listId); if (l) { l.name = name; l.emoji = dd.emoji; touchList(l); } ui.dialog = null; }
      else { const l = { id: 'l-' + uid(), name, emoji: dd.emoji, ids: dd.forPlace ? [dd.forPlace] : [], createdAt: Date.now() }; myLists().push(l); touchList(l); ui.dialog = dd.forPlace ? { type: 'listpick', id: dd.forPlace } : null; toast(l.emoji + ' ' + l.name + ' created', null); }
      break; }
    case 'sharelist': { const l = listOf(id); if (ui.dialog) { ui.dialog = null; render(); } if (l) shareList(l); return; }
    case 'sharedlistsave': { const r = saveSharedList(ui.dialog.data); ui.dialog = null; ui.tab = 'spots'; ui.spotsView = 'lists'; ui.page = { list: r.l.id }; toast(r.l.emoji + ' ' + r.l.name + ' saved' + (r.added ? ' · ' + r.added + ' added to To try' : ''), null); lastMapKey = ''; break; }
    case 'openimport': ui.page = 'import'; ui.importMsg = ''; break;
    case 'importskip': setImportQ(importQ().filter(x => x.key !== id)); break;
    case 'importclear': setImportQ([]); ui.importMsg = ''; break;
    case 'importadd': { const it = importQ().find(x => x.key === id); if (!it) break; ui.add = newAdd(); ui.add.name = it.name; ui.add.note = it.note || ''; ui.add.importKey = it.key;
      if (it.lat && it.lng) Object.assign(ui.add, { lat: it.lat, lng: it.lng, custom: true });
      ui.sheet = 'add'; ui.selected = null; render(); if (!it.lat) setTimeout(() => googleSuggest(it.name), 120); return; }
    case 'dellist': ui.dialog = { type: 'dellist', listId: id }; break;
    case 'listadd': ui.dialog = { type: 'listadd', listId: id, q: '' }; break;
    case 'listaddtoggle': { const l = listOf(ui.dialog.listId); if (l) { l.ids = l.ids.includes(id) ? l.ids.filter(x => x !== id) : l.ids.concat(id); touchList(l); const box = $('#listaddres'); if (box) { const sc = box.firstElementChild ? box.firstElementChild.scrollTop : 0; box.innerHTML = listAddRows(l, (ui.dialog.q || '').trim().toLowerCase()); if (box.firstElementChild) box.firstElementChild.scrollTop = sc; } } return; }
    case 'dellistok': { const lid = ui.dialog.listId; db.lists = myLists().filter(l => l.id !== lid); db.deleted = db.deleted || {}; db.deleted[lid] = Date.now(); ui.filter = ui.filter.filter(f => f !== 'list:' + lid); save(); ui.dialog = null; ui.page = null; toast('List deleted', null); break; }
    case 'listmap': ui.filter = ['list:' + id]; ui.page = null; ui.tab = 'home'; ui.selected = null; ui.sheet = null; lastMapKey = ''; break;
    case 'trymapone': ui.dialog = null; ui.tab = 'home'; ui.filter = ['totry']; ui.selected = id; ui.sheet = 'spot'; if (p) mapApi.focus(p); break;
    case 'notetoggle': ui.noteOpen = ui.noteOpen === id ? null : id; break;
    case 'memdatesave': { const q = byId(ui.dialog.id); if (q) { uiEl.querySelectorAll('[data-memdate]').forEach(inp => { const m = (q.memories || []).find(x => x.id === inp.dataset.memdate); const t = fromLocalInput(inp.value); if (m && t) m.at = t; }); save(); lastMapKey = ''; const n = ui.dialog.ms.length, last = q.memories.find(m => m.id === ui.dialog.ms[0]); toast(n === 1 && last ? 'Memory saved · ' + fmtWhen(last.at) : n + ' memories saved', null); } ui.dialog = null; setTimeout(memoryPushAsk, 1200); break; }
    case 'memredate': ui.dialog = { type: 'memdate', id: ui.dialog.id, ms: [ui.dialog.m] }; break;
    case 'memview': ui.dialog = { type: 'memory', id, m: t.dataset.m }; break;
    case 'memdel': ui.dialog = { type: 'memconfirm', id: ui.dialog.id, m: ui.dialog.m }; break;
    case 'recapshow': { const y = +t.dataset.y, k = t.dataset.k; ui.dialog = { type: 'recap', per: k === 'y' ? recapYear(y) : recapPer(y, +k), loc: t.dataset.loc || '', open: false, intro: true, introAt: Date.now() }; break; }
    case 'allrecaps': ui.dialog = null; ui.prevPage = ui.page; ui.page = 'recaps'; break;
    case 'recapsend': if (ui.dialog && ui.dialog.type === 'recap') sendRecap(ui.dialog); return;
    case 'recapdemo': if (ui.dialog && ui.dialog.type === 'recap') sendRecap(ui.dialog, DEMO_RECAP); return;
    case 'pushon': ui.dialog = null; db.settings.nRecaps = true; save(); enablePush(); break;
    case 'pushtoggle': if (pushOn) disablePush(); else enablePush(); return;
    case 'recapopen': if (ui.dialog && ui.dialog.type === 'recap') { ui.dialog.open = true; ui.dialog.intro = false; } break;
    case 'memcover': { const q = byId(ui.dialog.id); if (q && coverOf(q) !== ui.dialog.m) { q.thumb = { id: ui.dialog.m, set: Date.now() }; save(); lastMapKey = ''; toast('Thumbnail updated', null); } break; }
    case 'memdelno': ui.dialog = { type: 'memory', id: ui.dialog.id, m: ui.dialog.m }; break;
    case 'memdelok': { const q = byId(ui.dialog.id); if (q) { q.memories = (q.memories || []).filter(m => m.id !== ui.dialog.m); q.photos = (q.photos || []).filter(x => x !== ui.dialog.m); deleteCloudMemory(ui.dialog.m); idb.del(ui.dialog.m).catch(() => {}); save(); lastMapKey = ''; } ui.dialog = null; toast('Memory deleted', null); break; }
    case 'memchipx': try { localStorage.setItem('sitio.memAsk.' + id + '.' + new Date().toDateString(), '1'); } catch (e2) { } break;
    case 'tournext': if (ui.tour >= TOUR.length - 1) { endTour(); return; } ui.tour++; tourSetup(); break;
    case 'tourskip': endTour(); return;
    case 'tourreplay': ui.page = null; startTour(); return;
    case 'more': {
      const r = t.getBoundingClientRect(), rr = root.getBoundingClientRect(), up = r.top - rr.top > rr.height * 0.55;
      ui.dialog = { type: 'more', id: p ? p.id : null, list: t.dataset.list || null, x: Math.max(12, rr.right - r.right), y: up ? rr.bottom - r.top + 8 : r.bottom - rr.top + 8, up };
      break;
    }
    case 'levels': ui.page = 'levels'; break;
    case 'seelevels': ui.dialog = null; ui.tab = 'account'; ui.page = 'levels'; ui.sheet = null; ui.selected = null; break;
    case 'editcat': if (p) ui.dialog = { type: 'editcat', id: p.id, cats: catsOf(p).slice(), cuisine: p.cuisine || '' }; break;
    case 'ecat': { const l = ui.dialog.cats, v = t.dataset.v; ui.dialog.cats = l.includes(v) ? (l.length > 1 ? l.filter(x => x !== v) : l) : l.concat(v); break; }
    case 'ecuis': { const l = cuisList(ui.dialog), v = t.dataset.v; ui.dialog.cuisine = (l.includes(v) ? l.filter(x => x !== v) : l.concat(v)).join(', '); break; }
    case 'ecatsave': { const q = byId(ui.dialog.id); if (q) { q.cats = ui.dialog.cats.slice(); q.cat = q.cats[0]; q.cuisine = ui.dialog.cuisine || ''; save(); lastMapKey = ''; toast('Updated', null); } ui.dialog = null; break; }
    case 'hereyes': { const h = ui.dialog.h; let c = h.city || db.cities.find(x => x.name.toLowerCase() === h.name.toLowerCase());
      if (!c) { c = { id: 'c-' + uid(), name: h.name.slice(0, 40), country: h.country, cc: h.cc, currency: currencyFor(h.cc), lat: h.lat, lng: h.lng }; db.cities.push(c); }
      db.currentCityId = c.id; c.usedAt = Date.now(); ui.globe = false; save(); ui.dialog = null; ui.tab = 'home'; ui.filter = []; ui.selected = null; lastMapKey = ''; mapApi.view(me, 15);
      toast('Switched to ' + c.name + ' · prices in ' + c.currency, null); break; }
    case 'hereno': { const h = ui.dialog.h; if (h.key) try { localStorage.setItem(h.key, String(Date.now() + 7 * 864e5)); } catch (e) { } ui.dialog = null; break; }
    case 'privacy': ui.prevPage = ui.page; ui.page = 'privacy'; break;
    case 'notifs': ui.prevPage = ui.page; ui.page = 'notifs'; refreshPushState(); break;
    case 'admin': ui.page = 'admin'; ui.adminData = null; ui.adminErr = null; loadAdmin(); break;
    case 'adminuser': ui.page = { adminUser: id }; ui.adminCityQ = ''; break;
    case 'closeadmin': ui.adminSheet = null; ui.wSel = null; break;
    case 'worldmap': ui.world = true; ui.savedFilter = ui.filter; ui.filter = []; ui.menu = null; ui.wSel = null; lastMapKey = ''; render(); setTimeout(() => mapApi.fit(worldList().filter(p => matches(p, ui.filter))), 80); return;
    case 'worldfit': mapApi.fit(worldList().filter(p => matches(p, ui.filter))); return;
    case 'worldexit': { ui.world = false; ui.wSel = null; ui.filter = ui.savedFilter || []; ui.menu = null; lastMapKey = ''; const cc = cityCentre(); if (cc) mapApi.view(haveLocation && nearCity() ? me : cc, haveLocation && nearCity() ? 15 : 13); break; }
    case 'copyspot': case 'copytry': {
      let src, sc; if (ui.world) { const wp = worldList().find(x => x.id === ui.wSel); src = wp && wp._src; sc = wp && wp._city; } else { const au = (ui.adminData || []).find(x => x.user_id === ui.page.adminUser); src = au && au.data && (au.data.places || []).find(x => x.id === ui.adminSheet); sc = au && au.data && (au.data.cities || []).find(x => x.id === ui.page.city); } if (!src) return;
      if (act === 'copytry') { const np = copyPlace(src, sc, 'totry', 0); toast(np.name + ' added to your To try', () => { db.places = db.places.filter(x => x.id !== np.id); save(); }); afterSave(np); break; }
      openPrice({ name: src.name }, { mode: 'copy', src, srcCity: sc, value: src.price || 0 }); return;
    }
    case 'adminplace': ui.adminSheet = t.dataset.place; break;
    case 'admincity': ui.page = { adminUser: id, city: t.dataset.city }; break;
    case 'delacct': ui.dialog = { type: 'delacct' }; break;
    case 'dodelacct': { const v = ((uiEl.querySelector('[data-input="delConfirm"]') || {}).value || '').trim().toLowerCase(); if (v !== delWord().toLowerCase()) { flash('Type ' + delWord() + ' exactly to confirm.'); return; } ui.dialog = null; deleteAccount(); return; }
    case 'openauth': ui.page = 'auth'; ui.authMode = ui.authMode || 'signup'; ui.authMsg = null; break;
    case 'authmode': ui.authMode = t.dataset.v; ui.authMsg = null; break;
    case 'authgo': doAuth(); return;
    case 'chpass': ui.dialog = { type: 'chpass' }; break;
    case 'chpassgo': { const f = [...uiEl.querySelectorAll('[data-dlgfield]')].map(i => i.value); ui.dialog.v = f; changePasswordChecked(f[0], f[1]); return; }
    case 'resetmail': sendResetEmail(); return;
    case 'logout': ui.dialog = { type: 'logout' }; break;
    case 'dologout': ui.dialog = null; logout(); return;
    case 'installnow': if (installPrompt) { installPrompt.prompt(); installPrompt.userChoice.then(c => { if (c.outcome === 'accepted') ui.installed = true; installPrompt = null; render(); }); } return;
    case 'skipinstall': ui.install = false; try { sessionStorage.setItem('sitio.skipInstall', '1'); } catch (e2) { } setTimeout(() => { if (tourForced) startTour(); else maybeNudge('open'); }, 600); break;
    case 'openinstall': ui.install = true; ui.installed = false; break;
    case 'copylink': navigator.clipboard.writeText(appUrl()).then(() => toast('Link copied', null)).catch(() => flash(appUrl())); return;
    case 'invite': { const text = 'This is Sitio, my map of the best spots. Add it to your home screen:'; (navigator.share ? navigator.share({ title: 'Sitio', text, url: appUrl() }) : Promise.reject()).catch(err => { if (err && err.name === 'AbortError') return; navigator.clipboard.writeText(text + ' ' + appUrl()).then(() => toast('Invite link copied', null)).catch(() => flash(appUrl())); }); return; }
    case 'hours': ui.dialog = { type: 'text', title: 'Opening hours for ' + p.name, text: 'Same every day, e.g. 13:00-23:30. Or per day, e.g. Mo-Fr 09:00-20:00; Sa,Su 10:00-01:00.', fields: [{ ph: '13:00-23:30' }], ok: v => { const w = parseOH(v[0]); if (!w) { flash('Couldn’t read those hours.'); return; } p.hours = w; p.hoursSrc = 'manual'; save(); lastMapKey = ''; } }; break;
    case 'dlgok': { const vals = [...uiEl.querySelectorAll('[data-dlgfield]')].map(i => i.value); const fn = ui.dialog.ok; ui.dialog = null; fn(vals); break; }
    case 'sharedspot': { const s = ui.dialog.data; openPrice({ name: s.n }, { mode: 'shared', data: s, value: s.p || 0, hint: s.p ? (s.f || 'Your friend') + ' says ' + PRICE_WORDS[s.p] + '. Change it if you disagree.' : '' }); return; }
    case 'sharedtry': { const s = ui.dialog.data; const np = sharedToPlace(s, 'totry', 0); np.note = s.o ? (s.f || 'Friend') + ': ' + s.o : ''; db.places.push(np); save(); ui.dialog = null; toast(np.name + ' added to To try', () => { db.places = db.places.filter(x => x.id !== np.id); save(); }); afterSave(np); return; }
  }
  render();
});
uiEl.addEventListener('input', e => {
  const k = e.target.dataset.input; if (!k) return; const v = e.target.value;
  if (k === 'spotsSearch') { ui.spotsSearch = v; render(); }
  if (k === 'addName') { ui.add.name = v; if (ui.add.custom) return; if (ui.add.googleId) { ui.add.googleId = null; ui.add.lat = null; ui.add.lng = null; } clearTimeout(gTimer); gTimer = setTimeout(() => googleSuggest(v), 250); }
  if (k === 'addArea') ui.add.area = v;
  if (k === 'addNote') ui.add.note = v;
  if (k === 'userName') { db.user.name = v; save(); }
  if (k === 'unameDraft') ui.unameDraft = v;
  if (k === 'curQ' && ui.dialog && ui.dialog.type === 'currency') { ui.dialog.q = v; const box = $('#curres'); if (box) box.innerHTML = curResults(ui.dialog, db.cities.find(x => x.id === ui.dialog.cityId) || city()); }
  if (k === 'listAddQ' && ui.dialog && ui.dialog.type === 'listadd') { ui.dialog.q = v; const box = $('#listaddres'), l = listOf(ui.dialog.listId); if (box && l) box.innerHTML = listAddRows(l, v.trim().toLowerCase()); }
  if (k === 'cityQf') { ui.cityQ = v; render(); }
  if (k === 'recapY' || k === 'recapLoc') { ui.recapF = ui.recapF || { y: '', loc: '' }; ui.recapF[k === 'recapY' ? 'y' : 'loc'] = v; render(); }
  if (k === 'adminCityQ') { ui.adminCityQ = v; render(); }
  if (k === 'cityQ') { clearTimeout(cityTimer); cityTimer = setTimeout(() => citySuggest(v), 250); }
  if (k === 'authName' || k === 'authEmail' || k === 'authPass') { ui.authF = ui.authF || {}; ui.authF[{ authName: 'name', authEmail: 'email', authPass: 'pass' }[k]] = v; }
});
// File pickers: the screen can redraw while the photo picker is open (sync, timers), which used to
// throw away the hidden input and lose the photos. One permanent picker outside the screen fixes that.
const picker = document.createElement('input'); picker.type = 'file'; picker.hidden = true; picker.style.display = 'none'; document.body.appendChild(picker);
uiEl.addEventListener('click', e => {
  const lab = e.target.closest('label'); const inp = lab ? lab.querySelector('input[type=file]') : null; if (!inp) return;
  e.preventDefault(); e.stopPropagation();
  Object.keys(picker.dataset).forEach(k => delete picker.dataset[k]); Object.assign(picker.dataset, inp.dataset);
  picker.accept = inp.accept || ''; picker.multiple = inp.multiple; picker.value = ''; picker.click();
}, true);
picker.addEventListener('change', () => handleFile(picker));
uiEl.addEventListener('change', e => handleFile(e.target));
async function handleFile(el) {
  const f = el.files && el.files[0]; if (!f) return;
  try {
    if (el.dataset.import) { await importFiles([...el.files]); el.value = ''; return; }
    if (el.dataset.restore) { restore(f); return; }
    if (el.dataset.memory) {
      const p = byId(el.dataset.memory); if (!p) return; let n = 0;
      if (p.thumb && new Date(p.thumb.set).toDateString() !== new Date().toDateString()) delete p.thumb;
      for (const file of [...el.files].slice(0, 10)) { const at = await photoDate(file); const b = await compress(file, 800); const mid = 'ph-' + uid(); await idb.put(mid, b); photoUrls[mid] = URL.createObjectURL(b); p.memories = (p.memories || []).concat({ id: mid, at }); n++; }
      try { localStorage.setItem('sitio.memAsk.' + p.id + '.' + new Date().toDateString(), '1'); } catch (e2) { }
      save(); setTimeout(uploadMemories, 300); lastMapKey = ''; ui.dialog = { type: 'memdate', id: p.id, ms: p.memories.slice(-n).map(m => m.id) }; render(); return;
    }
    const blob = await compress(f); const id = 'ph-' + uid(); await idb.put(id, blob); photoUrls[id] = URL.createObjectURL(blob);
    if (el.dataset.addphoto) ui.add.photos.push(id);
    else if (el.dataset.photo) { const p = byId(el.dataset.photo); p.photos = (p.photos || []).concat(id); save(); lastMapKey = ''; }
    else if (el.dataset.userphoto) { db.user.photo = id; db.user.avatar = await thumbUrl(blob); save(); }
    render();
  } catch (err) { flash('Couldn’t add that photo.'); }
}

// Swipe rows: left = delete (asks first), right = save a To try place (asks price)
let sw = null;
uiEl.addEventListener('pointerdown', e => { const fg = e.target.closest('.swipe .fg'); if (!fg || e.target.closest('button,a,input')) return; sw = { fg, x: e.clientX, y: e.clientY, dx: 0, row: fg.parentElement, active: false }; });
uiEl.addEventListener('pointermove', e => {
  if (!sw) return; const dx = e.clientX - sw.x, dy = e.clientY - sw.y;
  if (!sw.active) { if (Math.abs(dy) > 10) { sw = null; return; } if (Math.abs(dx) < 10) return; sw.active = true; sw.fg.classList.add('dragging'); }
  const canRight = !!sw.row.dataset.try; sw.dx = Math.max(-140, Math.min(canRight ? 140 : 0, dx)); sw.fg.style.transform = `translateX(${sw.dx}px)`;
});
const swEnd = () => {
  if (!sw) return; const { fg, dx, row, active } = sw; sw = null; fg.classList.remove('dragging'); fg.style.transform = '';
  if (!active) return; const p = byId(row.dataset.swipe); if (!p) return;
  const block = (ev) => { ev.stopPropagation(); ev.preventDefault(); uiEl.removeEventListener('click', block, true); }; uiEl.addEventListener('click', block, true); setTimeout(() => uiEl.removeEventListener('click', block, true), 50);
  if (dx < -90) { ui.dialog = { type: 'confirm', place: p }; render(); }
  else if (dx > 90 && row.dataset.try) openPrice(p, { mode: 'totry' });
};
uiEl.addEventListener('pointerup', swEnd); uiEl.addEventListener('pointercancel', swEnd);

/* ---------- accounts and syncing (Supabase) ---------- */
// One row per person in table sitio_data holding their whole list. Photos stay on the phone for now.
const SBURL = ((window.SITIO_CONFIG || {}).supabaseUrl || '').replace(/\/$/, ''), SBKEY = (window.SITIO_CONFIG || {}).supabaseAnonKey || '';
function cloudOn() { return !!(SBURL && SBKEY); }
var auth = null; try { auth = JSON.parse(localStorage.getItem('sitio.auth')); } catch (e) { auth = null; }
var syncState = '', pushTimer = null, syncing = null, syncAgain = false;
function setAuth(s) {
  auth = s ? { access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at || Math.floor(Date.now() / 1000) + (s.expires_in || 3600), user: { id: s.user.id, email: s.user.email, created_at: s.user.created_at || (auth && auth.user && auth.user.id === s.user.id ? auth.user.created_at : undefined) } } : null;
  try { if (auth) localStorage.setItem('sitio.auth', JSON.stringify(auth)); else localStorage.removeItem('sitio.auth'); } catch (e) { }
}
async function sbFetch(path, opts = {}, needUser) {
  const headers = Object.assign({ apikey: SBKEY, 'Content-Type': 'application/json' }, opts.headers || {});
  if (needUser) { await ensureFresh(); if (!auth) { const e = new Error('Please log in again.'); e.status = 401; throw e; } headers.Authorization = 'Bearer ' + auth.access_token; }
  const r = await fetch(SBURL + path, Object.assign({}, opts, { headers }));
  const text = await r.text(); let j = null; try { j = text ? JSON.parse(text) : null; } catch (e) { }
  if (!r.ok) { const e = new Error((j && (j.msg || j.error_description || j.message || j.error)) || ('Error ' + r.status)); e.status = r.status; e.code = j && (j.error_code || j.code); throw e; }
  return j;
}
async function ensureFresh() {
  if (!auth || auth.expires_at * 1000 - Date.now() > 60000) return;
  try { setAuth(await sbFetch('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: JSON.stringify({ refresh_token: auth.refresh_token }) })); }
  catch (e) { if (e.status === 400 || e.status === 401 || e.status === 403) { setAuth(null); render(); } throw e; }
}
function friendly(e) {
  const m = (e && e.message) || '';
  if (e && e.status === 429) return 'Too many tries. Wait a minute and try again.';
  if (/invalid login credentials/i.test(m)) return 'Wrong email or password.';
  if (/already registered|already exists/i.test(m)) return 'There’s already an account with that email. Log in instead.';
  if (/not confirmed/i.test(m)) return 'Confirm your email first (check your inbox), then log in.';
  if (/failed to fetch|network|load failed/i.test(m)) return 'No connection. Check your internet and try again.';
  return m || 'Something went wrong. Try again.';
}
const tAt = p => p.updatedAt || p.addedAt || 0;
function mergeData(local, remote) {
  const del = Object.assign({}, local.deleted || {});
  Object.entries(remote.deleted || {}).forEach(([k, v]) => { del[k] = Math.max(del[k] || 0, v); });
  const rPlaces = remote.places || [];
  const lPlaces = rPlaces.some(p => !p.sample) ? local.places.filter(p => !p.sample || tAt(p) > 1) : local.places;
  const map = {}; rPlaces.forEach(p => { map[p.id] = p; });
  lPlaces.forEach(p => { const r = map[p.id]; if (!r || tAt(p) >= tAt(r)) map[p.id] = p; });
  const places = Object.values(map).filter(p => !(del[p.id] && del[p.id] >= tAt(p)));
  const lm = local.metaAt || 0, rm = remote.metaAt || 0, win = lm >= rm ? local : remote, lose = win === local ? remote : local;
  const cities = (win.cities || []).slice(); (lose.cities || []).forEach(c => { if (!cities.some(x => x.id === c.id)) cities.push(c); });
  const user = Object.assign({}, lose.user || {}, win.user || {}); if (!user.name && lose.user && lose.user.name) user.name = lose.user.name;
  const lmap = {}; (remote.lists || []).forEach(l => { lmap[l.id] = l; }); (local.lists || []).forEach(l => { const r = lmap[l.id]; if (!r || (l.updatedAt || 0) >= (r.updatedAt || 0)) lmap[l.id] = l; });
  const lists = Object.values(lmap).filter(l => !(del[l.id] && del[l.id] >= (l.updatedAt || 0)));
  return Object.assign({}, local, { lists, user, settings: Object.assign({}, local.settings, win.settings || {}), cities, currentCityId: cities.some(c => c.id === win.currentCityId) ? win.currentCityId : cities[0].id, places, deleted: del, metaAt: Math.max(lm, rm) });
}
function queuePush() { if (!auth || !cloudOn()) return; clearTimeout(pushTimer); pushTimer = setTimeout(sync, 1500); }
function sync() {
  if (!auth || !cloudOn()) return Promise.resolve();
  if (!isAdmin) { adminChecked = false; checkAdmin(); }
  if (syncing) { syncAgain = true; return syncing; }
  syncing = (async () => {
    try {
      const rows = await sbFetch('/rest/v1/sitio_data?select=data&user_id=eq.' + auth.user.id, {}, true);
      const remote = rows && rows[0] && rows[0].data;
      const before = JSON.stringify(db);
      if (remote && remote.places) { db = mergeData(db, remote); resnap(); try { localStorage.setItem(STORE_KEY, JSON.stringify(db)); } catch (e) { } }
      await sbFetch('/rest/v1/sitio_data?on_conflict=user_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ user_id: auth.user.id, data: db, updated_at: new Date().toISOString() }) }, true);
      const changed = JSON.stringify(db) !== before;
      const was = syncState; syncState = 'ok'; ensureUsername(); setTimeout(uploadMemories, 500);
      if (changed || was !== 'ok') { lastMapKey = ''; render(); }
    } catch (e) { syncState = 'error: ' + (e.status || '') + ' ' + (e.message || '').slice(0, 60); if (e.status === 401) setAuth(null); if (ui.tab === 'account') render(); }
    finally { syncing = null; if (syncAgain) { syncAgain = false; queuePush(); } }
  })();
  return syncing;
}
async function doAuth() {
  const f = ui.authF || {}, m = ui.authMode || 'signup', email = (f.email || '').trim().toLowerCase();
  const msg = (text, ok) => { ui.authMsg = { text, ok }; render(); };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return msg('Enter a valid email.');
  if (m !== 'reset' && (f.pass || '').length < 6) return msg('Your password needs at least 6 characters.');
  if (m === 'signup' && !USER_RE.test((f.name || '').trim())) return msg('Pick a username: ' + USER_HINT);
  if (m === 'signup') { try { const ok = await sbFetch('/rest/v1/rpc/sitio_username_available', { method: 'POST', body: JSON.stringify({ name: f.name.trim() }) }); if (ok === false) return msg('That username is taken. Try another.'); } catch (e) { if (e.status !== 404) return msg(friendly(e)); } }
  ui.authBusy = true; ui.authMsg = null; render();
  try {
    if (m === 'reset') {
      await sbFetch('/auth/v1/recover?redirect_to=' + encodeURIComponent(appUrl()), { method: 'POST', body: JSON.stringify({ email }) });
      ui.authMsg = { ok: true, text: 'If there’s an account for that email, a reset link is on its way. Open it, choose a new password, then log in here.' };
    } else {
      const name = (f.name || '').trim();
      const s = m === 'signup'
        ? await sbFetch('/auth/v1/signup', { method: 'POST', body: JSON.stringify({ email, password: f.pass, data: { name } }) })
        : await sbFetch('/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email, password: f.pass }) });
      if (m === 'signup' && name) db.user.name = name;
      if (!s || !s.access_token) { save(); ui.authMode = 'login'; ui.authMsg = { ok: true, text: 'Almost there: check your email and tap the link to confirm, then log in here.' }; }
      else {
        if (!db.user.name && s.user && s.user.user_metadata && s.user.user_metadata.name) db.user.name = s.user.user_metadata.name;
        setAuth(s); try { if (!+localStorage.getItem('sitio.opens')) localStorage.setItem('sitio.opens', '1'); } catch (e2) { } if (m === 'signup' && name) db.usernameOk = ''; save(); ui.page = null; ui.authF = {}; ui.authMsg = null;
        toast(m === 'signup' ? 'Account created. Your spots are saved.' : 'Logged in', null);
        if (m === 'signup' && !db.tourDone) setTimeout(startTour, 900);
        sync();
      }
    }
  } catch (e) { ui.authMsg = { text: friendly(e) }; }
  ui.authBusy = false; render();
}
var isAdmin = false, adminChecked = false, adminErr = '', adminKnown = false;
var unameAsked = false;
async function claimUsername(name) {
  try { return await sbFetch('/rest/v1/rpc/sitio_claim_username', { method: 'POST', body: JSON.stringify({ name }) }, true) === true; }
  catch (e) { if (e.status === 404) return null; throw e; }
}
// Every account needs a unique username; claim it, or ask for one if it's missing or taken
async function ensureUsername() {
  if (!auth || db.usernameOk === db.user.name && db.user.name) return;
  const n = (db.user.name || '').trim();
  if (USER_RE.test(n)) { const ok = await claimUsername(n).catch(() => undefined); if (ok === true) { db.usernameOk = n; save(); return; } if (ok === null || ok === undefined) return; }
  if (unameAsked || ui.dialog) return; unameAsked = true;
  ui.dialog = { type: 'uname', taken: USER_RE.test(n), cur: n }; render();
}
async function saveUsername(n, fromDialog) {
  if (!USER_RE.test(n)) { flash('Username: ' + USER_HINT); return; }
  if (!auth) { db.user.name = n; save(); ui.unameDraft = null; render(); return; }
  try {
    const ok = await claimUsername(n);
    if (ok === false) { flash('That username is taken. Try another.'); return; }
    db.user.name = n; db.usernameOk = ok ? n : db.usernameOk; save(); ui.unameDraft = null; if (fromDialog) ui.dialog = null;
    toast('Username saved', null); render();
  } catch (e) { flash(friendly(e)); }
}
function checkAdmin() {
  if (!auth || adminChecked) return; adminChecked = true;
  sbFetch('/rest/v1/rpc/sitio_is_admin', { method: 'POST', body: '{}' }, true).then(v => { isAdmin = v === true; adminKnown = true; adminErr = isAdmin ? '' : 'not admin'; if (ui.tab === 'account') render(); }).catch(e => { adminKnown = true; adminErr = (e && (e.status + ' ' + e.message)) || 'error'; if (ui.tab === 'account') render(); });
}
async function loadAdmin() {
  try { ui.adminData = await sbFetch('/rest/v1/rpc/sitio_admin_users', { method: 'POST', body: '{}' }, true) || []; }
  catch (e) { ui.adminErr = 'Couldn’t load users: ' + friendly(e); }
  render();
}
// Memory photos online (Supabase Storage, private bucket "memories", one folder per person)
const memPath = id => 'memories/' + auth.user.id + '/' + id + '.jpg';
let uploading = false, upErr = ''; const cloudTried = {};
function cloudPhoto(id) {
  if (!auth || !cloudOn() || cloudTried[id]) return; cloudTried[id] = 1;
  const isMine = db.places.some(p => (p.memories || []).some(m => m.id === id && m.cloud)); if (!isMine) return;
  ensureFresh().then(() => fetch(SBURL + '/storage/v1/object/authenticated/' + memPath(id), { headers: { apikey: SBKEY, Authorization: 'Bearer ' + auth.access_token } }))
    .then(r => r.ok ? r.blob() : null).then(b => { if (b && b.size) { idb.put(id, b).catch(() => {}); photoUrls[id] = URL.createObjectURL(b); render(); } }).catch(() => { delete cloudTried[id]; });
}
async function uploadMemories() {
  if (!auth || !cloudOn() || uploading) return; uploading = true;
  try {
    for (const p of db.places) for (const m of (p.memories || [])) {
      if (m.cloud) continue; const b = await idb.get(m.id).catch(() => null); if (!b) continue;
      await ensureFresh();
      const r = await fetch(SBURL + '/storage/v1/object/' + memPath(m.id), { method: 'POST', headers: { apikey: SBKEY, Authorization: 'Bearer ' + auth.access_token, 'Content-Type': 'image/jpeg', 'x-upsert': 'true' }, body: b });
      if (r.ok) { m.cloud = true; upErr = ''; save(); } else { upErr = r.status + ' ' + (await r.text().catch(() => '')).slice(0, 80); if (ui.tab === 'account') render(); break; }
    }
  } catch (e) { upErr = 'network: ' + (e && e.message || e); } finally { uploading = false; if (ui.tab === 'account') render(); }
}
function deleteCloudMemory(id) {
  if (!auth || !cloudOn()) return;
  ensureFresh().then(() => fetch(SBURL + '/storage/v1/object/memories', { method: 'DELETE', headers: { apikey: SBKEY, Authorization: 'Bearer ' + auth.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: [auth.user.id + '/' + id + '.jpg'] }) })).catch(() => {});
}
async function deleteAllCloudMemories() {
  try {
    await ensureFresh(); const h = { apikey: SBKEY, Authorization: 'Bearer ' + auth.access_token, 'Content-Type': 'application/json' };
    for (let round = 0; round < 20; round++) {
      const list = await (await fetch(SBURL + '/storage/v1/object/list/memories', { method: 'POST', headers: h, body: JSON.stringify({ prefix: auth.user.id, limit: 100 }) })).json();
      if (!Array.isArray(list) || !list.length) break;
      await fetch(SBURL + '/storage/v1/object/memories', { method: 'DELETE', headers: h, body: JSON.stringify({ prefixes: list.map(f => auth.user.id + '/' + f.name) }) });
    }
  } catch (e) { }
}
async function deleteAccount() {
  await deleteAllCloudMemories();
  try { await sbFetch('/rest/v1/rpc/sitio_delete_me', { method: 'POST', body: '{}' }, true); }
  catch (e) { flash('Couldn’t delete your account: ' + friendly(e)); return; }
  setAuth(null); syncState = ''; isAdmin = false; adminChecked = false;
  try { localStorage.removeItem(STORE_KEY); } catch (e) { }
  db = loadDb(); resnap(); save(); ui.page = null; lastMapKey = '';
  toast('Account deleted', null); render();
}
// Changing the password from Account needs the current one first, so a borrowed phone can't take over the account
async function changePasswordChecked(cur, pw) {
  const d = ui.dialog; if (!d || d.type !== 'chpass' || !auth) return;
  const err = m => { d.err = m; d.busy = false; render(); };
  if (!cur) return err('Enter your current password.');
  if (!pw || pw.length < 6) return err('Your new password needs at least 6 characters.');
  if (pw === cur) return err('Choose a password different from your current one.');
  d.busy = true; d.err = null; render();
  try { setAuth(await sbFetch('/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email: auth.user.email, password: cur }) })); }
  catch (e) { return err(/invalid login credentials/i.test(e.message) ? 'Your current password isn’t right.' : friendly(e)); }
  try { await sbFetch('/auth/v1/user', { method: 'PUT', body: JSON.stringify({ password: pw }) }, true); ui.dialog = null; toast('Password changed', null); render(); }
  catch (e) { err(friendly(e)); }
}
async function sendResetEmail() {
  if (!auth) return;
  try { await sbFetch('/auth/v1/recover?redirect_to=' + encodeURIComponent(appUrl()), { method: 'POST', body: JSON.stringify({ email: auth.user.email }) }); ui.dialog = null; toast('Reset link sent to ' + auth.user.email, null); render(); }
  catch (e) { flash(friendly(e)); }
}
async function changePassword(pw) {
  if (!pw || pw.length < 6) { flash('Your password needs at least 6 characters.'); return; }
  try { await sbFetch('/auth/v1/user', { method: 'PUT', body: JSON.stringify({ password: pw }) }, true); toast('Password changed', null); }
  catch (e) { flash(friendly(e)); }
}
async function logout() {
  try { await sbFetch('/auth/v1/logout', { method: 'POST' }, true); } catch (e) { }
  setAuth(null); syncState = ''; isAdmin = false; adminChecked = false;
  try { localStorage.removeItem(STORE_KEY); } catch (e) { }
  db = loadDb(); resnap(); save(); ui.page = null; ui.selected = null; ui.sheet = null; lastMapKey = '';
  toast('Logged out', null); render();
}
// Links from emails (confirm sign-up, reset password) arrive with the login in the address
function readAuthHash() {
  const h = location.hash; if (!/access_token=|error_description=/.test(h)) return;
  const q = new URLSearchParams(h.slice(1)); history.replaceState(null, '', location.pathname);
  if (q.get('error_description')) { flash(q.get('error_description')); return; }
  const s = { access_token: q.get('access_token'), refresh_token: q.get('refresh_token'), expires_in: +q.get('expires_in') || 3600, expires_at: +q.get('expires_at') || 0 };
  sbFetch('/auth/v1/user', { headers: { Authorization: 'Bearer ' + s.access_token } }).then(u => {
    s.user = u; setAuth(s);
    if (q.get('type') === 'recovery') ui.dialog = { type: 'text', title: 'Choose a new password', text: 'At least 6 characters.', fields: [{ ph: 'New password', type: 'password' }], ok: v => changePassword(v[0]) };
    else toast('Email confirmed. You’re logged in.', null);
    sync(); render();
  }).catch(e => flash(friendly(e)));
}

// Sheets: drag the top part down to close
let sd = null;
uiEl.addEventListener('pointerdown', e => {
  const sh = e.target.closest('.sheet'); if (!sh || e.target.closest('input,textarea,button,a,label')) return;
  if (sh.scrollTop > 0 && !e.target.closest('.grab')) return;
  sd = { sh, y: e.clientY, dy: 0, id: e.pointerId };
});
uiEl.addEventListener('pointermove', e => {
  if (!sd || e.pointerId !== sd.id) return; const dy = e.clientY - sd.y;
  if (dy <= 0 && !sd.on) return; if (!sd.on && dy < 8) return;
  sd.on = true; sd.dy = Math.max(0, dy); sd.sh.style.transition = 'none'; sd.sh.style.transform = `translateY(${sd.dy}px)`;
});
const sdEnd = () => {
  if (!sd) return; const { sh, dy, on } = sd; sd = null; if (!on) return;
  if (dy > 90) {
    sh.style.transition = 'transform .2s ease'; sh.style.transform = 'translateY(100%)';
    const close = sh.dataset.swipeclose;
    setTimeout(() => { if (close === 'closeadmin') { ui.adminSheet = null; ui.wSel = null; } else { ui.sheet = null; ui.selected = null; ui.add = null; ui.pinMode = false; } render(); }, 180);
  } else { sh.style.transition = 'transform .2s ease'; sh.style.transform = ''; }
  const block = ev => { ev.stopPropagation(); ev.preventDefault(); uiEl.removeEventListener('click', block, true); }; uiEl.addEventListener('click', block, true); setTimeout(() => uiEl.removeEventListener('click', block, true), 50);
};
uiEl.addEventListener('pointerup', sdEnd); uiEl.addEventListener('pointercancel', sdEnd);

/* ---------- start ---------- */
root.appendChild(mapApi.el); root.appendChild(uiEl);
mapApi.init();
resnap();
checkLevel();
/* ---------- Recap notifications ---------- */
const PUSHKEY = (window.SITIO_CONFIG || {}).pushKey || '';
const pushSupported = () => !!PUSHKEY && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && (STANDALONE || !IS_IOS);
let pushOn = false, pushBusy = false;
function b64urlToBytes(s) { const p = '='.repeat((4 - s.length % 4) % 4), b = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(b, c => c.charCodeAt(0)); }
async function pushSub() { try { const r = await navigator.serviceWorker.ready; return await r.pushManager.getSubscription(); } catch (e) { return null; } }
async function refreshPushState() { if (!pushSupported()) return; const s = await pushSub(); const on = !!s && Notification.permission === 'granted'; if (on !== pushOn) { pushOn = on; render(); } }
async function enablePush() {
  if (!auth) { flash('Log in first so we know where to send it.'); return; }
  if (pushBusy) return; pushBusy = true;
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { flash(perm === 'denied' ? 'Notifications are blocked. Turn them on for Sitio in your phone’s Settings → Notifications.' : 'No problem, you can turn them on later in Memory recaps.'); return; }
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64urlToBytes(PUSHKEY) });
    await sbFetch('/rest/v1/sitio_push?on_conflict=endpoint', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ endpoint: sub.endpoint, user_id: auth.user.id, sub: sub.toJSON() }) }, true);
    pushOn = true; toast('Recap notifications on', null);
    sbFetch('/functions/v1/sitio-push', { method: 'POST', body: JSON.stringify({ test: true }) }, true).catch(() => { });
  } catch (e) { flash('Couldn’t turn on notifications: ' + friendly(e)); }
  finally { pushBusy = false; render(); }
}
async function disablePush() {
  const s = await pushSub();
  if (s) { try { if (auth) await sbFetch('/rest/v1/sitio_push?endpoint=eq.' + encodeURIComponent(s.endpoint), { method: 'DELETE' }, true); } catch (e) { } try { await s.unsubscribe(); } catch (e) { } }
  pushOn = false; toast('Recap notifications off', null); render();
}
const pushIdle = () => !ui.dialog && !ui.install && !ui.sheet && !ui.page && ui.tour == null;
function askPush(key, force, tries = 0) {
  if (!pushSupported() || !auth || Notification.permission === 'denied') return;
  try { if (localStorage.getItem(key)) return; } catch (e) { }
  if (pushOn && !force) return;
  if (!pushIdle()) { if (tries < 240) setTimeout(() => askPush(key, force, tries + 1), 600); return; }
  // only ask once the notification setup exists online, so nobody is asked before it can work
  pushReady().then(ok => { if (!ok || !pushIdle()) return; try { localStorage.setItem(key, '1'); } catch (e) { } ui.dialog = { type: 'pushask' }; render(); });
}
let pushReadyP = null;
function pushReady() { return pushReadyP || (pushReadyP = sbFetch('/rest/v1/sitio_push?select=endpoint&limit=1', {}, true).then(() => true, () => { pushReadyP = null; return false; })); }
// The ask on opening: 2nd logged-in open; 3rd for the two accounts that get the demo recap first; next open for the admin (test)
function openPushAsk() {
  if (!pushSupported() || !auth) return;
  let n = 0; try { n = (+localStorage.getItem('sitio.opens') || 0) + 1; localStorage.setItem('sitio.opens', String(n)); } catch (e) { }
  const decide = (tries = 0) => {
    if (!auth) return;
    if (!adminKnown && tries < 30) return setTimeout(() => decide(tries + 1), 500);
    if (isAdmin) return askPush('sitio.pushAsk.adminOpen4', true);
    if (!auth.user.created_at && tries < 30) {
      if (tries === 0) sbFetch('/auth/v1/user', {}, true).then(u => { if (u && u.created_at && auth) { auth.user.created_at = u.created_at; try { localStorage.setItem('sitio.auth', JSON.stringify(auth)); } catch (e) { } } }).catch(() => { });
      return setTimeout(() => decide(tries + 1), 500);
    }
    const made = Date.parse(auth.user.created_at || '');
    const need = made && made < DEMO_CUTOFF ? 3 : 2;
    if (n >= need) askPush('sitio.pushAsk.open');
  };
  setTimeout(decide, 1200);
}
function memoryPushAsk() { if (isAdmin) askPush('sitio.pushAsk.adminMem1', true); else askPush('sitio.pushAsk.mem'); }
setTimeout(() => { refreshPushState(); openPushAsk(); }, 400);
function adminPushPreview(tries = 0) {
  try { if (localStorage.getItem('sitio.pushPreviewND5')) return; } catch (e) { }
  if (!auth || !pushSupported()) return;
  if ((!adminKnown || !pushOn) && tries < 40) return setTimeout(() => adminPushPreview(tries + 1), 500);
  if (!isAdmin || !pushOn) return;
  try { localStorage.setItem('sitio.pushPreviewND5', '1'); } catch (e) { }
  sbFetch('/functions/v1/sitio-push', { method: 'POST', body: JSON.stringify({ test: true, preview: { y: 2026, k: 5 }, delay: 20 }) }, true)
    .then(r => flash(r && r.sent ? 'Preview notification sent to ' + r.sent + ' phone' + (r.sent === 1 ? '' : 's') + '.' : 'Preview didn’t send: ' + JSON.stringify(r), 60000))
    .catch(e => flash('Preview failed: ' + friendly(e) + (e.status ? ' (' + e.status + ')' : ''), 60000));
  toast('Lock your phone: the Nov / Dec notification arrives in about 20 seconds', null);
}
setTimeout(adminPushPreview, 1500);
if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', e => { if (e.data && e.data.type === 'recap') setTimeout(() => { if (!recapFromHash(e.data.url)) tryRecap(); }, 300); });

// One-off showcase for the admin account: the 2025 year recap on Home (or the latest past year with memories)
function adminShowcase(tries = 0) {
  try { if (localStorage.getItem('sitio.previewDemo2')) return; } catch (e) { }
  if (!isAdmin) { if (tries < 120) setTimeout(() => adminShowcase(tries + 1), 500); return; }
  if (ui.dialog || ui.install || ui.sheet || ui.page || ui.tour != null) { if (tries < 240) setTimeout(() => adminShowcase(tries + 1), 500); return; }
  const show = s => { if (!openSharedRecap(s)) return false; try { localStorage.setItem('sitio.previewDemo2', '1'); } catch (e) { } ui.tab = 'home'; render(); return true; };
  // the real demo if it has been sent, otherwise the same recap built from this phone
  sbFetch('/rest/v1/rpc/sitio_get_share', { method: 'POST', body: JSON.stringify({ sid: DEMO_RECAP }) }).catch(() => null).then(d => {
    if (ui.dialog || ui.install || ui.sheet || ui.page || ui.tour != null) { setTimeout(() => adminShowcase(tries + 1), 1000); return; }
    if (d && d.t === 'recap' && show(d)) return;
    const per = recapPer(2026, 5), its = recapItems(per).filter(x => photoUrl(x.m.id));
    if (!its.length) { if (tries < 120) setTimeout(() => adminShowcase(tries + 1), 500); return; }
    try { localStorage.setItem('sitio.previewDemo2', '1'); } catch (e) { }
    ui.tab = 'home'; ui.dialog = { type: 'recap', per, shared: { f: db.user.name || '', items: its.map(x => ({ src: photoUrl(x.m.id), name: x.p.name, where: [x.p.area, cityOf(x.p) && cityOf(x.p).name].filter(Boolean).join(', '), at: x.m.at })) }, open: false, intro: true, introAt: Date.now() }; render();
  });
}
setTimeout(adminShowcase, 900);
setTimeout(() => tryRecap(/[?&]demo=year/.test(location.search) ? 'year' : /[?&]demo=recap/.test(location.search)), 1000);
if (/[?&]demo=levelup/.test(location.search)) setTimeout(() => { ui.install = false; showLevelUp(Math.max(1, levelOf(spotCount()) + 1) % LEVELS.length || 1, true); }, 400);
readAuthHash();
readShared();
render();
sync();
setTimeout(() => { if (tourForced && !ui.install) startTour(); else maybeNudge('open'); }, 1500);
var hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { hiddenAt = Date.now(); return; }
  sync();
  if (hiddenAt && Date.now() - hiddenAt > 10 * 60000) setTimeout(() => maybeNudge('open'), 800);
});
locate(false);
refreshHours();
setInterval(() => { lastMapKey = ''; render(); }, 60000);
window.addEventListener('resize', () => { if (ui.tour != null) placeTour(); });
window.addEventListener('hashchange', () => { readShared(); render(); });
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
