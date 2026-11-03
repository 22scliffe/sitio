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
function loadDb() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* storage unavailable */ }
  return {
    user: { name: 'Sitio', photo: null },
    settings: { hours: true, darkMap: true, dirApp: 'google' },
    cities: SAMPLE.cities.slice(),
    currentCityId: SAMPLE.cities[0].id,
    places: SAMPLE.places.map(p => Object.assign({}, p, { sample: true, hours: p.hours ? weekFrom(p.hours.open, p.hours.close) : null, hoursSrc: p.hours ? 'sample' : null })),
    sample: true
  };
}
let db = loadDb();
function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(db)); } catch (e) { flash('Couldn’t save on this device. Storage may be full.'); } }

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
  idb.get(id).then(b => { if (b) { photoUrls[id] = URL.createObjectURL(b); render(); } }).catch(() => {});
  return '';
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
function locate(center) {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(pos => {
    me = { lat: pos.coords.latitude, lng: pos.coords.longitude }; haveLocation = true;
    if (center) mapApi.center(me);
    render();
  }, () => { if (center) flash('Location is off. Allow it in Settings to see spots near you.'); }, { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 });
}

/* ---------- install (add to home screen) ---------- */
const UA = navigator.userAgent || '';
const IS_IOS = /iPhone|iPad|iPod/.test(UA) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const IS_ANDROID = /Android/i.test(UA);
const IN_APP = /FBAN|FBAV|Instagram|Line\/|Snapchat|TikTok|LinkedInApp|GSA\//.test(UA);
const IOS_OTHER = IS_IOS && /CriOS|FxiOS|EdgiOS/.test(UA);
let STANDALONE = false; try { STANDALONE = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch (e) { }
let installPrompt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; render(); });
window.addEventListener('appinstalled', () => { ui.installed = true; installPrompt = null; render(); });
const appUrl = () => location.origin + location.pathname;
function skipInstallStored() { try { return sessionStorage.getItem('sitio.skipInstall') === '1'; } catch (e) { return false; } }

/* ---------- UI state ---------- */
const ui = {
  tab: 'home', filter: [], menu: null, cuisineOpen: false, selected: null,
  sheet: null, page: null, dialog: null, toast: null,
  spotsOpenNow: true, spotsSearch: '', tryNewest: false, expand: {}, add: null,
  install: !STANDALONE && !skipInstallStored(), installed: false
};
const city = () => db.cities.find(c => c.id === db.currentCityId) || db.cities[0];
const cur = () => (city() && city().currency) || '€';
const cityPlaces = () => db.places.filter(p => p.cityId === db.currentCityId);
const byId = (id) => db.places.find(p => p.id === id);

function matches(p, filter) {
  if (!filter.length) return p.status === 'spot';
  if (p.status === 'totry') return filter.includes('totry');
  const cats = filter.filter(f => !f.startsWith('cuisine:') && f !== 'totry');
  const cuis = filter.filter(f => f.startsWith('cuisine:')).map(f => f.slice(8));
  if (p.cat === 'restaurant' && cuis.length) return cuis.includes(p.cuisine);
  return cats.includes(p.cat);
}
function filterLabel(filter) {
  if (!filter.length) return 'All places';
  const cuis = filter.filter(f => f.startsWith('cuisine:')).map(f => f.slice(8));
  const parts = [];
  CATS.forEach(c => {
    if (c.id === 'restaurant' && cuis.length) parts.push(cuis.length === 1 ? 'Restaurants · ' + cuis[0] : 'Restaurants · ' + cuis.length + ' cuisines');
    else if (filter.includes(c.id)) parts.push(c.plural);
  });
  if (filter.includes('totry')) parts.push('To try');
  return parts.join(', ');
}
function toggleFilter(token) {
  let f = ui.filter.slice();
  if (token === 'all') f = [];
  else if (f.includes(token)) f = f.filter(x => x !== token);
  else f.push(token);
  if (token.startsWith('cuisine:')) f = f.filter(x => x !== 'restaurant');
  if (token === 'restaurant') f = f.filter(x => !x.startsWith('cuisine:'));
  ui.filter = f;
}

/* ---------- small renderers ---------- */
const art = (p) => {
  const id = p.photos && p.photos[0];
  if (id) { const u = photoUrl(id); if (u) return `<img src="${u}" alt="">`; }
  return ART[p.cat] || ART.restaurant;
};
const priceHtml = (n) => `<span class="price"><span class="on">${cur().repeat(n)}</span><span class="off">${cur().repeat(3 - n)}</span></span>`;
const metaLine = (p, withDist = true) => [catOf(p.cat).name, p.cat === 'restaurant' && p.cuisine ? p.cuisine : '', p.area, withDist ? fmtDist(dist(p)) : ''].filter(Boolean).join(' · ');
const gLink = (p) => p.googleId ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.name)}&query_place_id=${encodeURIComponent(p.googleId)}` : `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`;
const aLink = (p) => `https://maps.apple.com/?daddr=${p.lat},${p.lng}&q=${encodeURIComponent(p.name)}`;
const dirButtons = (p) => {
  const g = `<a class="big-btn ${db.settings.dirApp === 'google' ? 'primary-btn' : 'sec-btn'}" href="${gLink(p)}" target="_blank" rel="noopener">${ICON.pin}Google Maps</a>`;
  const a = `<a class="big-btn ${db.settings.dirApp === 'apple' ? 'primary-btn' : 'sec-btn'}" href="${aLink(p)}" target="_blank" rel="noopener">${ICON.nav}Apple Maps</a>`;
  return `<div class="btn-grid">${db.settings.dirApp === 'apple' ? a + g : g + a}</div>`;
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
  let mode = 'mock', gmap = null, overlay = null, center = Object.assign({}, DEFAULT_ME), k = 0.13; // px per metre
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
  function placePins(list, selected) {
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
      pinsEl.querySelectorAll('.pin').forEach(n => { const p = byId(n.dataset.pin); if (!p) return; const [x, y] = proj(p.lat, p.lng); n.style.left = x + 'px'; n.style.top = y + 'px'; });
      const [mx, my] = proj(me.lat, me.lng); meEl.style.left = mx + 'px'; meEl.style.top = my + 'px';
    } else if (overlay && overlay.getProjection()) {
      const pr = overlay.getProjection();
      pinsEl.querySelectorAll('.pin').forEach(n => { const p = byId(n.dataset.pin); if (!p) return; const pt = pr.fromLatLngToDivPixel(new google.maps.LatLng(p.lat, p.lng)); n.style.left = pt.x + 'px'; n.style.top = pt.y + 'px'; });
      const m = pr.fromLatLngToDivPixel(new google.maps.LatLng(me.lat, me.lng)); meEl.style.left = m.x + 'px'; meEl.style.top = m.y + 'px';
    }
  }
  let pinClickAt = 0;
  pinsEl.addEventListener('click', e => {
    const r = e.target.closest('.ring'); if (!r) return;
    e.stopPropagation(); pinClickAt = Date.now();
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
  const DARK = [{ elementType: 'geometry', stylers: [{ color: '#141418' }] }, { elementType: 'labels.text.fill', stylers: [{ color: '#8A8A94' }] }, { elementType: 'labels.text.stroke', stylers: [{ color: '#141418' }] }, { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#24242B' }] }, { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#2A2A33' }] }, { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#33333C' }] }, { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#182434' }] }, { featureType: 'poi', stylers: [{ visibility: 'off' }] }, { featureType: 'poi.park', elementType: 'geometry', stylers: [{ visibility: 'on' }, { color: '#1A2620' }] }, { featureType: 'transit', stylers: [{ visibility: 'off' }] }, { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] }];
  function initGoogle() {
    window.__sitioGmapsReady = () => {
      mode = 'google';
      const gEl = document.createElement('div'); gEl.style.cssText = 'position:absolute;inset:0'; el.appendChild(gEl);
      gmap = new google.maps.Map(gEl, { center, zoom: 15, disableDefaultUI: true, clickableIcons: false, gestureHandling: 'greedy', styles: db.settings.darkMap ? DARK : null, backgroundColor: '#141418' });
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
    center(c) { center = { lat: c.lat, lng: c.lng }; if (gmap) gmap.panTo(center); else redraw(); },
    // Puts a place in the upper part of the screen so it stays visible above a bottom sheet
    focus(c) { const h = el.clientHeight || 844; if (gmap) { gmap.panTo(c); gmap.panBy(0, h * 0.22); } else { center = { lat: c.lat - (h * 0.22) / (110540 * k), lng: c.lng }; redraw(); } },
    setStyle() { if (gmap) gmap.setOptions({ styles: db.settings.darkMap ? DARK : null }); },
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
    <button class="city-title" data-act="cities" aria-label="Change city"><span>${esc(city().name)}</span>${ICON.chevDown}</button>
    <button class="filter-pill ${pillCls} ${pillCls ? '' : 'glass'}" data-act="menu" data-menu="home">${ICON.filter}<span class="txt">${esc(filterLabel(ui.filter))}</span>${ICON.chevDown}</button>
    <div class="top-right">
      <button class="round glass" data-act="search" aria-label="Search your spots">${ICON.search}</button>
      <button class="round primary-btn" data-act="add" aria-label="Add a spot" style="box-shadow:0 8px 24px rgba(0,0,0,.5)">${ICON.plus}</button>
    </div>
  </div>
  <div class="map-bottom">
    ${onlyTry ? `<div class="open-chip glass"><span class="dot" style="background:var(--coral)"></span>${list.length} to try</div>` : (spots.length ? `<div class="open-chip glass"><span class="dot"></span>${openN} of ${spots.length} open now</div>` : '<span></span>')}
    <button class="locate round glass" data-act="locate" aria-label="Centre on my location" style="color:var(--blue)">${ICON.nav}</button>
  </div>
  ${ui.menu === 'home' ? filterMenu() : ''}`;
}

function filterMenu() {
  const f = ui.filter; const cuis = f.filter(x => x.startsWith('cuisine:')).map(x => x.slice(8));
  const used = [...new Set(cityPlaces().filter(p => p.cat === 'restaurant' && p.cuisine).map(p => p.cuisine))].sort();
  let h = `<div class="menu" role="menu" aria-label="Show on map">`;
  h += `<button class="${!f.length ? 'on' : ''}" data-act="filt" data-f="all">All places${!f.length ? ICON.check : ''}</button>`;
  CATS.forEach(c => {
    const on = f.includes(c.id) || (c.id === 'restaurant' && cuis.length);
    if (c.id === 'restaurant') {
      h += `<button class="${on ? 'on' : ''}" data-act="filt" data-f="restaurant">Restaurants<span style="display:flex;align-items:center;gap:6px">${cuis.length ? `<span class="sub">${cuis.length === 1 ? esc(cuis[0]) : cuis.length + ' cuisines'}</span>` : ''}${f.includes('restaurant') ? ICON.check : ''}<span data-act="cuisines" style="display:flex;padding:8px;margin:-8px">${ui.cuisineOpen ? ICON.chevDown : ICON.chevRight}</span></span></button>`;
      if (ui.cuisineOpen) used.forEach(q => { const o = cuis.includes(q); h += `<button class="indent ${o ? 'on' : ''}" data-act="filt" data-f="cuisine:${esc(q)}">${esc(q)}${o ? ICON.check : ''}</button>`; });
      if (ui.cuisineOpen && !used.length) h += `<button class="indent" disabled><span class="sub">No cuisines saved yet</span></button>`;
    } else h += `<button class="${on ? 'on' : ''}" data-act="filt" data-f="${c.id}">${c.plural}${on ? ICON.check : ''}</button>`;
  });
  if (ui.menu === 'home') h += `<div class="sep"></div><button class="${f.includes('totry') ? 'on' : ''}" data-act="filt" data-f="totry" style="color:var(--coral-soft)"><span style="display:flex;align-items:center;gap:8px"><span class="dot" style="background:var(--coral)"></span>To try</span>${f.includes('totry') ? ICON.check : ''}</button>`;
  return h + `</div>`;
}

function spotSheet(p) {
  const isTry = p.status === 'totry';
  const photos = (p.photos || []).slice(0, 3).map(id => { const u = photoUrl(id); return `<div>${u ? `<img src="${u}" alt="">` : ART[p.cat]}</div>`; });
  while (photos.length < 3) photos.push(photos.length === 0 ? `<div>${ART[p.cat]}</div>` : `<label class="add-photo">${ICON.camera}Add photo<input type="file" accept="image/*" hidden data-photo="${p.id}"></label>`);
  return `<div class="sheet" role="dialog" aria-label="${esc(p.name)}">
    <div class="grab"></div>
    <div class="sheet-photos">${photos.slice(0, 3).join('')}</div>
    <div class="name-row"><div style="display:flex;align-items:center;gap:10px;min-width:0"><h2 class="big-name">${esc(p.name)}</h2>${isTry ? '<span class="tag">TO TRY</span>' : ''}</div>
      <div class="mini-btns"><button class="round sec-btn mini" data-act="share" data-id="${p.id}" aria-label="Share">${ICON.share}</button>${isTry ? '' : `<button class="round sec-btn mini" data-act="del" data-id="${p.id}" aria-label="Delete" style="color:var(--coral-soft)">${ICON.bin}</button>`}</div></div>
    <div class="meta">${esc(metaLine(p))}</div>
    ${hoursLine(p)}
    ${isTry ? '' : `<div class="price-line">${priceHtml(p.price)}${PRICE_WORDS[p.price] || ''}<button class="pen" data-act="editprice" data-id="${p.id}" aria-label="Edit price">${ICON.pen}</button></div>`}
    ${p.note ? `<div class="note card">${esc(p.note)}</div>` : '<div style="height:14px"></div>'}
    ${dirButtons(p)}
    ${isTry ? `<div style="display:flex;gap:8px;margin-top:8px"><button class="big-btn sec-btn" style="flex:1;height:46px" data-act="savetry" data-id="${p.id}">${ICON.check}Save to Spots</button><button class="round x-btn" style="width:46px;height:46px;border-radius:16px;color:var(--coral-soft)" data-act="del" data-id="${p.id}" aria-label="Remove">${ICON.close}</button></div>` : ''}
  </div>`;
}

function spotsView() {
  const q = ui.spotsSearch.trim().toLowerCase();
  const cats = ui.filter.filter(f => f !== 'totry');
  let list = cityPlaces().filter(p => p.status === 'spot' && (cats.length ? matches(p, cats) : true));
  if (q) list = list.filter(p => (p.name + ' ' + p.area + ' ' + p.cuisine + ' ' + p.note).toLowerCase().includes(q));
  if (ui.spotsOpenNow) list = list.filter(p => { const s = status(p); return !s || s.open; });
  list.sort((a, b) => dist(a) - dist(b));
  let body = '';
  if (!list.length) body = `<div class="empty card" style="border-radius:20px">${cityPlaces().some(p => p.status === 'spot') ? 'Nothing matches right now.' + (ui.spotsOpenNow ? '<br>Try turning off Open now.' : '') : 'No spots in ' + esc(city().name) + ' yet.<br>Tap + to add your first.'}</div>`;
  else if (!cats.length) {
    CATS.forEach(c => {
      const g = list.filter(p => p.cat === c.id); if (!g.length) return;
      const open = ui.expand[c.id]; const shown = open ? g : g.slice(0, 3);
      body += `<div class="group"><div class="group-head"><span class="section-label">${c.plural} · ${g.length > 3 && !open ? '3 nearest' : g.length}</span>${g.length > 3 ? `<button class="link-btn" data-act="expand" data-cat="${c.id}">${open ? 'Show less' : 'All ' + g.length}${open ? '' : ICON.chevRight}</button>` : ''}</div><div class="list card">${shown.map(rowSpot).join('')}</div></div>`;
    });
  } else {
    body = `<div class="group"><div class="group-head"><span class="section-label">${list.length} ${esc(filterLabel(cats).toLowerCase())} · nearest first</span></div><div class="list card">${list.map(rowSpot).join('')}</div></div>`;
  }
  return `<div class="page">
    <div class="page-head"><h1 class="page-title">Spots</h1><div style="display:flex;gap:8px"><button class="pill sec-btn" data-act="cities">${esc(city().name)}${ICON.chevDown}</button><button class="round primary-btn" style="width:44px;height:44px" data-act="add" aria-label="Add a spot">${ICON.plus}</button></div></div>
    <label class="search card">${ICON.search}<input type="search" placeholder="Search your spots" aria-label="Search your spots" value="${esc(ui.spotsSearch)}" data-input="spotsSearch"></label>
    <div class="row-btns" style="position:relative"><button class="pill sec-btn" data-act="menu" data-menu="spots">${ICON.filter}${esc(filterLabel(cats))}${ICON.chevDown}</button><button class="pill ${ui.spotsOpenNow ? 'green-on' : 'sec-btn'}" data-act="opennow" aria-pressed="${ui.spotsOpenNow}">${ui.spotsOpenNow ? ICON.check : ''}Open now</button></div>
    ${body}
  </div>${ui.menu === 'spots' ? filterMenu() : ''}`;
}
function rowSpot(p) {
  const s = status(p);
  return `<div class="swipe" data-swipe="${p.id}"><div class="acts"><div class="save"></div><div class="del">Delete${ICON.bin}</div></div>
    <div class="fg"><div class="thumb">${art(p)}</div>
      <div class="row-main" data-act="open" data-id="${p.id}"><span class="row-name">${esc(p.name)}</span><span class="row-meta">${esc([p.cat === 'restaurant' ? p.cuisine : '', p.area, fmtDist(dist(p))].filter(Boolean).join(' · '))}</span>
        <span class="row-line ${s && !s.open ? 'closed' : ''}">${s ? `<span class="dot"></span>${esc(s.text.replace('Open · until', 'Until').replace('Closed · opens', 'Opens'))}<span style="color:#6A6A72">·</span>` : ''}${priceHtml(p.price)}</span></div>
      <div class="mini-btns"><button class="round sec-btn mini" data-act="dirs" data-id="${p.id}" aria-label="Directions to ${esc(p.name)}">${ICON.nav}</button></div></div></div>`;
}

function tryView() {
  let list = cityPlaces().filter(p => p.status === 'totry');
  list.sort(ui.tryNewest ? (a, b) => b.addedAt - a.addedAt : (a, b) => dist(a) - dist(b));
  const rows = list.map(p => `<div class="swipe" data-swipe="${p.id}" data-try="1"><div class="acts"><div class="save">${ICON.check}Save</div><div class="del">Delete${ICON.bin}</div></div>
    <div class="fg"><div class="thumb" style="width:58px;height:58px">${p.photos && p.photos.length ? art(p) : ART.totry}</div>
      <div class="row-main" data-act="showtry" data-id="${p.id}"><span class="row-name">${esc(p.name)}</span><span class="row-meta">${esc(metaLine(p))}</span>${p.note ? `<span class="row-note">${esc(p.note)}</span>` : ''}</div>
      <div class="mini-btns"><button class="round sec-btn mini" data-act="dirs" data-id="${p.id}" aria-label="Directions to ${esc(p.name)}">${ICON.nav}</button><button class="round x-btn mini" data-act="del" data-id="${p.id}" aria-label="Remove ${esc(p.name)}" style="color:var(--coral-soft)">${ICON.close}</button></div></div></div>`).join('');
  return `<div class="page">
    <div class="page-head" style="align-items:flex-end"><div><h1 class="page-title">To try</h1><div class="page-sub">${list.length} place${list.length === 1 ? '' : 's'} in ${esc(city().name)}</div></div>
      <button class="pill coral-btn" style="height:44px;font-weight:800" data-act="add">${ICON.plus}Add</button></div>
    <div class="row-btns"><button class="pill sec-btn" data-act="trysort">${ui.tryNewest ? 'Newest first' : 'Nearest first'}${ICON.chevDown}</button><button class="pill sec-btn" data-act="trymap">${ICON.map}Show on map</button></div>
    ${list.length ? `<div class="list card">${rows}</div>` : `<div class="empty card" style="border-radius:20px">Nothing to try yet.<br>Found somewhere that looks good? Tap Add.</div>`}
  </div>`;
}

function accountView() {
  const all = db.places; const u = db.user;
  const av = u.photo && photoUrl(u.photo) ? `<img src="${photoUrl(u.photo)}" alt="">` : esc((u.name || 'S')[0].toUpperCase());
  const row = (label, val, act) => `<button class="set-row" data-act="${act}"><span>${label}</span><span class="val">${val}${ICON.chevRight}</span></button>`;
  const tog = (label, sub, key) => `<div class="set-row"><span style="display:flex;flex-direction:column;gap:2px"><span>${label}</span>${sub ? `<span style="font-size:12px;font-weight:600;color:var(--text-2)">${sub}</span>` : ''}</span><button class="toggle ${db.settings[key] ? 'on' : ''}" data-act="toggle" data-key="${key}" aria-pressed="${!!db.settings[key]}" aria-label="${label}"></button></div>`;
  return `<div class="page">
    <div style="display:flex;align-items:center;gap:14px"><button class="avatar" data-act="profile" aria-label="Account details" style="padding:0;color:var(--text)">${av}</button><div><div style="font-size:24px;font-weight:800">${esc(u.name || 'You')}</div><div class="page-sub">${db.sample ? 'Showing sample spots' : 'Your places, your way'}</div></div></div>
    <div class="stats"><div class="stat card"><b>${all.filter(p => p.status === 'spot').length}</b><span>Spots</span></div><div class="stat card"><b style="color:var(--coral-soft)">${all.filter(p => p.status === 'totry').length}</b><span>To try</span></div><div class="stat card"><b>${db.cities.length}</b><span>${db.cities.length === 1 ? 'City' : 'Cities'}</span></div></div>
    <div class="section-label" style="margin-bottom:8px">Current city</div>
    <div class="settings card" style="margin-bottom:18px">${row(`<span style="display:flex;align-items:center;gap:10px"><span class="dot"></span>${esc(city().name)}</span>`, `${cityPlaces().filter(p => p.status === 'spot').length} spots · ${cityPlaces().filter(p => p.status === 'totry').length} to try`, 'cities')}</div>
    <div class="section-label" style="margin-bottom:8px">Settings</div>
    <div class="settings card">
      ${tog('Opening hours', 'Greys out closed spots on the map', 'hours')}
      ${tog('Dark map', '', 'darkMap')}
      ${row('Directions open in', db.settings.dirApp === 'apple' ? 'Apple Maps' : 'Google Maps', 'dirapp')}
      ${row('Currency', esc(city().currency) + ' (' + esc(city().name) + ')', 'currency')}
      ${row('Back up my spots', 'Save a file', 'backup')}
      <label class="set-row" style="cursor:pointer"><span>Restore from backup</span><span class="val">${ICON.chevRight}</span><input type="file" accept="application/json,.json" hidden data-restore="1"></label>
      ${db.sample ? row('Clear sample spots', 'Start fresh', 'clearsample') : ''}
      ${row('Invite friends', 'Send the app link', 'invite')}
      ${STANDALONE ? '' : row('Add Sitio to your home screen', '', 'openinstall')}
      ${row('Account details', 'Name, photo', 'profile')}
    </div>
    <p class="page-sub" style="font-size:11px;margin-top:16px;opacity:.6" id="diag">${diag()}</p>
    <p class="page-sub" style="font-size:12px;margin-top:8px;line-height:1.5">Your spots are saved on this device for now. Once accounts are switched on, they move to your account and appear on any device you log in to.</p>
  </div>`;
}

function diag() {
  let safe = 0; try { const p = document.createElement('div'); p.style.cssText = 'position:fixed;bottom:0;height:env(safe-area-inset-bottom);'; document.body.appendChild(p); safe = Math.round(p.getBoundingClientRect().height); p.remove(); } catch (e) { }
  return `v0.2 \u00b7 ${STANDALONE ? 'app' : 'browser'} \u00b7 window ${innerWidth}\u00d7${innerHeight} \u00b7 screen ${screen.width}\u00d7${screen.height} \u00b7 frame ${Math.round(root.getBoundingClientRect().height)} \u00b7 safe ${safe}`;
}
function citiesPage() {
  return `<div class="page" style="z-index:15">
    <div class="page-head"><h1 class="page-title">Cities</h1><button class="round sec-btn" style="width:44px;height:44px" data-act="closepage" aria-label="Close">${ICON.close}</button></div>
    <div class="section-label" style="margin-bottom:8px">Your cities</div>
    <div class="settings card">${db.cities.map(c => { const n = db.places.filter(p => p.cityId === c.id); const curr = c.id === db.currentCityId;
      return `<button class="set-row" data-act="pickcity" data-id="${c.id}" style="min-height:72px;${curr ? 'background:rgba(255,255,255,0.05)' : ''}"><span style="display:flex;align-items:center;gap:14px"><span class="avatar" style="width:48px;height:48px;border-radius:14px;font-size:18px">${esc(c.name[0])}</span><span style="display:flex;flex-direction:column;gap:3px"><span style="font-size:17px;font-weight:800">${esc(c.name)}</span><span style="font-size:13px;font-weight:600;color:var(--text-2)">${esc(c.country || '')} · ${n.filter(p => p.status === 'spot').length} spots · ${n.filter(p => p.status === 'totry').length} to try · ${esc(c.currency)}</span></span></span>${curr ? `<span style="color:var(--green);display:flex;align-items:center;gap:6px;font-size:12px;font-weight:800">Current${ICON.check}</span>` : ''}</button>`; }).join('')}
      <button class="set-row" data-act="addcity" style="min-height:64px"><span style="display:flex;align-items:center;gap:14px"><span class="avatar" style="width:48px;height:48px;border-radius:14px;background:transparent;border:1.5px dashed rgba(255,255,255,0.28)">${ICON.plus}</span><span style="font-size:16px;font-weight:800">Add a city</span></span></button></div>
    <p class="page-sub" style="font-size:13px;line-height:1.45;margin-top:10px">Each city keeps its own Spots and To try lists. Prices use that city's currency.</p>
  </div>`;
}

function profilePage() {
  const u = db.user; const av = u.photo && photoUrl(u.photo) ? `<img src="${photoUrl(u.photo)}" alt="">` : esc((u.name || 'S')[0].toUpperCase());
  return `<div class="page" style="z-index:15">
    <div class="page-head" style="justify-content:flex-start"><button class="round sec-btn" style="width:44px;height:44px" data-act="closepage" aria-label="Back">${ICON.back}</button><span style="font-size:22px;font-weight:800">Account details</span></div>
    <div style="display:flex;flex-direction:column;align-items:center;gap:10px;margin:18px 0 22px"><div class="avatar" style="width:104px;height:104px;border-radius:52px;font-size:42px">${av}</div>
      <label class="link-btn" style="text-decoration:underline;cursor:pointer">Change photo<input type="file" accept="image/*" hidden data-userphoto="1"></label></div>
    <label class="field-label" for="nm">Name</label><input id="nm" class="input card" value="${esc(u.name || '')}" data-input="userName" maxlength="40">
    <label class="field-label">Email and password</label>
    <div class="card note" style="margin:0">Available once accounts are switched on. Your spots will move into your account, and you'll log in with email, Google or Apple.</div>
  </div>`;
}

function spotPage(p) {
  const photos = (p.photos || []);
  const strip = photos.map((id, i) => { const u = photoUrl(id); return `<div style="height:72px;border-radius:12px;overflow:hidden;background:#2A2A31">${u ? `<img src="${u}" alt="" style="width:100%;height:100%;object-fit:cover">` : ''}</div>`; }).join('');
  return `<div class="page" style="z-index:15;padding-bottom:calc(var(--safe-bottom) + 30px)">
    <div class="hero">${art(p)}<div class="hero-btns"><button class="round glass" data-act="closepage" aria-label="Back">${ICON.back}</button><div><button class="round glass" data-act="share" data-id="${p.id}" aria-label="Share">${ICON.share}</button><button class="round glass" data-act="del" data-id="${p.id}" aria-label="Delete" style="color:var(--coral-soft)">${ICON.bin}</button></div></div></div>
    <div class="spot-body">
      <h1 class="big-name" style="font-size:30px">${esc(p.name)}</h1>
      <div class="meta">${esc(metaLine(p))}</div>
      ${hoursLine(p)}
      <div class="price-line">${priceHtml(p.price)}${PRICE_WORDS[p.price] || ''}<button class="pen" data-act="editprice" data-id="${p.id}" aria-label="Edit price">${ICON.pen}</button></div>
      ${p.note ? `<div class="note card">${esc(p.note)}</div>` : '<div style="height:16px"></div>'}
      <div class="section-label" style="margin-bottom:8px">Photos</div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:18px">${strip}<label class="add-photo" style="height:72px;border-radius:12px;cursor:pointer">${ICON.plus}<input type="file" accept="image/*" hidden data-photo="${p.id}"></label></div>
      ${dirButtons(p)}
    </div></div>`;
}

function addSheet() {
  const a = ui.add;
  const cuisineChips = a.cat === 'restaurant' ? `<label class="field-label">Cuisine</label><div class="chips">${CUISINES.map(c => `<button class="chip ${a.cuisine === c ? 'on' : ''}" data-act="addcuisine" data-v="${esc(c)}">${esc(c)}</button>`).join('')}</div>` : '';
  const pics = a.photos.map((id, i) => `<div style="height:76px;border-radius:14px;overflow:hidden;position:relative"><img src="${photoUrl(id)}" alt="" style="width:100%;height:100%;object-fit:cover"><button class="round" data-act="addrmphoto" data-i="${i}" aria-label="Remove photo" style="position:absolute;top:4px;right:4px;width:28px;height:28px;background:rgba(0,0,0,.6);border:0">${ICON.close}</button></div>`).join('');
  return `<div class="sheet" role="dialog" aria-label="Add a spot" style="max-height:94%">
    <div class="grab"></div>
    <div class="name-row"><div><div class="muted" style="font-size:13px;font-weight:700">Add a spot</div><div style="font-size:22px;font-weight:800">${esc(a.name || 'New place')}</div></div><button class="round sec-btn" style="width:44px;height:44px" data-act="closesheet" aria-label="Close">${ICON.close}</button></div>
    <label class="field-label" for="a-name">Place</label>
    <div style="position:relative"><input id="a-name" class="input card" placeholder="${mapApi.google ? 'Search for a place' : 'Name of the place'}" value="${esc(a.name)}" data-input="addName" autocomplete="off">
      <div id="suggest"></div></div>
    <input class="input card" style="margin-top:8px" placeholder="Area (e.g. Malasaña)" value="${esc(a.area)}" data-input="addArea">
    <div class="muted" style="font-size:12px;font-weight:600;margin-top:6px">${a.googleId ? 'Location from Google' : (a.lat ? 'Location set' : 'Uses your current location')}</div>
    <label class="field-label">Category</label>
    <div class="cat-grid">${CATS.map(c => `<button class="sec-btn ${a.cat === c.id ? 'on' : ''}" data-act="addcat" data-v="${c.id}" aria-pressed="${a.cat === c.id}">${ICON.cat[c.id]}${c.name}</button>`).join('')}</div>
    ${cuisineChips}
    <label class="field-label">Photos</label>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">${pics}<label class="add-photo" style="height:76px;border-radius:14px;cursor:pointer">${ICON.plus}Add yours<input type="file" accept="image/*" hidden data-addphoto="1"></label></div>
    <label class="field-label" for="a-note">Your note</label>
    <textarea id="a-note" class="input card" rows="2" placeholder="What to order, when to go…" data-input="addNote">${esc(a.note)}</textarea>
    <div class="stack" style="margin-top:18px"><button class="big-btn primary-btn" data-act="addsave">Save to Spots</button><button class="big-btn coral-btn" data-act="addtry">Add to To try</button></div>
  </div>`;
}

function dialogView() {
  const d = ui.dialog; if (!d) return '';
  if (d.type === 'price') {
    const p = d.place; const n = d.value || 0;
    return `<div class="dialog-scrim" data-act="closedialog"></div><div class="dialog" role="dialog" aria-labelledby="dlg-t">
      <h3 id="dlg-t">${d.edit ? 'Edit price for ' + esc(p.name) : 'How expensive is ' + esc(p.name) + '?'}</h3><p>${d.edit ? 'Currently ' + (PRICE_WORDS[p.price] || 'not set') : (d.hint ? esc(d.hint) : 'Tap to rate the price')}</p>
      <div class="euro-bar" role="radiogroup" aria-label="Price">${[1, 2, 3].map(i => `<button class="${i <= n ? 'on' : ''}" role="radio" aria-checked="${i === n}" aria-label="${PRICE_WORDS[i]}" data-act="setprice" data-v="${i}">${esc(cur())}</button>`).join('')}</div>
      <span class="price-word">${PRICE_WORDS[n] || ''}</span>
      <div class="stack"><button class="big-btn primary-btn" data-act="pricesave" ${n ? '' : 'style="opacity:.45"'}>${d.edit ? 'Save' : 'Save to Spots'}</button><button class="big-btn" style="background:none;border:0;height:44px;color:#D8D5D0" data-act="closedialog">Cancel</button></div></div>`;
  }
  if (d.type === 'confirm') {
    const p = d.place; const isTry = p.status === 'totry';
    return `<div class="dialog-scrim" data-act="closedialog"></div><div class="dialog" role="alertdialog" aria-labelledby="dlg-t">
      <h3 id="dlg-t">${isTry ? 'Remove ' + esc(p.name) + '?' : 'Delete ' + esc(p.name) + ' from Spots?'}</h3><p>${isTry ? 'It’ll be deleted from To try.' : 'It’ll come off your map and list, with its photos and note.'} You can’t undo this.</p>
      <div class="btn-grid"><button class="big-btn sec-btn" data-act="closedialog">Cancel</button><button class="big-btn coral-btn" data-act="confirmdel">${isTry ? 'Remove' : 'Delete'}</button></div></div>`;
  }
  if (d.type === 'dirs') {
    const p = d.place;
    return `<div class="dialog-scrim" data-act="closedialog"></div><div class="action-sheet" role="dialog" aria-label="Directions"><div class="group-box"><div class="head"><div style="font-size:15px;font-weight:800">Directions to ${esc(p.name)}</div><div class="muted" style="font-size:13px;font-weight:600">${esc([p.area, fmtDist(dist(p))].filter(Boolean).join(' · '))}</div></div>
      <a class="big-btn" style="height:58px;border-radius:0;font-size:17px" href="${gLink(p)}" target="_blank" rel="noopener" data-act="closedialog">${ICON.pin}Google Maps</a><a class="big-btn" style="height:58px;border-radius:0;font-size:17px;border-top:1px solid rgba(255,255,255,.1)" href="${aLink(p)}" target="_blank" rel="noopener" data-act="closedialog">${ICON.nav}Apple Maps</a></div>
      <button class="group-box" data-act="closedialog" style="border-radius:20px;font-weight:700">Cancel</button></div>`;
  }
  if (d.type === 'text') {
    return `<div class="dialog-scrim" data-act="closedialog"></div><div class="dialog" role="dialog" aria-labelledby="dlg-t" style="text-align:left">
      <h3 id="dlg-t">${esc(d.title)}</h3><p>${esc(d.text)}</p>${d.fields.map((f, i) => `<input class="input card" style="margin-bottom:8px" placeholder="${esc(f.ph)}" value="${esc(f.value || '')}" data-dlgfield="${i}">`).join('')}
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
      <div class="stack" style="margin-top:10px"><button class="big-btn primary-btn" data-act="sharedspot">Add to Spots</button><button class="big-btn coral-btn" data-act="sharedtry">Add to To try</button><button class="big-btn" style="background:none;border:0;height:40px;color:#D8D5D0" data-act="closedialog">Not now</button></div></div></div>`;
  }
  return '';
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
  } else if (IS_IOS) {
    body = `<div class="i-card card"><div class="i-h">Add Sitio to your home screen</div><ol class="i-steps">
      ${step(1, `Tap the Share button ${shareIc} ${/CriOS/.test(UA) ? 'next to the address bar' : 'in the bar at the bottom'}. <span class="muted">On newer iPhones, tap ${dots} first.</span>`)}
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
    <div class="i-top"><img src="icons/icon-192.png" alt="" class="i-logo"><h1 class="i-title">Sitio</h1><p class="i-tag">Your own map of the places you vouch for: restaurants, bars, cafés and more, with what's open right now.</p></div>
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
  // Map pins
  const list = cityPlaces().filter(p => matches(p, ui.filter));
  const key = JSON.stringify([list.map(p => p.id + p.status + p.price + (p.photos || []).join() + (photoUrls[(p.photos || [])[0]] ? 1 : 0)), ui.selected, db.settings.hours, Math.floor(Date.now() / 60000)]);
  if (key !== lastMapKey) { mapApi.update(list, ui.selected); lastMapKey = key; }
  mapApi.el.style.visibility = ui.tab === 'home' ? 'visible' : 'hidden';

  const focus = document.activeElement && document.activeElement.dataset && document.activeElement.dataset.input;
  const selStart = focus ? document.activeElement.selectionStart : null;
  let h = '';
  if (ui.tab === 'home') h += homeView();
  if (ui.tab === 'spots') h += spotsView();
  if (ui.tab === 'totry') h += tryView();
  if (ui.tab === 'account') h += accountView();
  if (ui.page === 'cities') h += citiesPage();
  else if (ui.page === 'profile') h += profilePage();
  else if (ui.page && ui.page.spot) { const p = byId(ui.page.spot); if (p) h += spotPage(p); else ui.page = null; }
  if ((!ui.page || ui.page === 'cities') && !ui.sheet) h += tabbar();
  if (ui.sheet === 'spot' && ui.selected && byId(ui.selected)) h += (ui.tab === 'home' ? '' : '<div class="scrim" data-act="closesheet"></div>') + spotSheet(byId(ui.selected));
  if (ui.sheet === 'add' && ui.add) h += '<div class="scrim" data-act="closesheet"></div>' + addSheet();
  if (ui.toast) h += `<div class="toast" role="status"><span>${ui.toast.ok ? `<span style="color:var(--green);display:flex">${ICON.check}</span>` : ''}${esc(ui.toast.text)}</span>${ui.toast.undo ? '<button data-act="undo">Undo</button>' : ''}</div>`;
  h += dialogView();
  if (ui.install) h += installView();
  if (ui.flash) h += `<div class="banner glass">${esc(ui.flash)}</div>`;
  uiEl.innerHTML = h;
  if (focus) { const el = uiEl.querySelector(`[data-input="${focus}"]`); if (el) { el.focus(); try { el.setSelectionRange(selStart, selStart); } catch (e) { } } }
}
function flash(text) { ui.flash = text; render(); clearTimeout(flash.t); flash.t = setTimeout(() => { ui.flash = null; render(); }, 3500); }
function toast(text, undo, ok = true) { ui.toast = { text, undo, ok }; render(); clearTimeout(toast.t); toast.t = setTimeout(() => { ui.toast = null; render(); }, 5000); }

/* ---------- actions ---------- */
function newAdd() { return { name: '', area: '', cat: 'restaurant', cuisine: '', note: '', photos: [], lat: null, lng: null, googleId: null }; }
function placeFromAdd(status, price) {
  const a = ui.add;
  const jitter = () => (Math.random() - 0.5) * 0.0006;
  return { id: uid(), cityId: db.currentCityId, name: a.name.trim(), area: a.area.trim(), cat: a.cat, cuisine: a.cat === 'restaurant' ? a.cuisine : '', status, price: status === 'spot' ? price : 0, note: a.note.trim(), photos: a.photos.slice(), lat: a.lat != null ? a.lat : me.lat + jitter(), lng: a.lng != null ? a.lng : me.lng + jitter(), googleId: a.googleId, hours: null, hoursSrc: null, addedAt: Date.now(), coordsAt: Date.now() };
}
function afterSave(p) { if (!p.hours) fetchOsmHours(p); }

function openPrice(place, opts = {}) { ui.dialog = Object.assign({ type: 'price', place, value: opts.edit ? place.price : (opts.value || 0) }, opts); render(); }
function confirmPrice() {
  const d = ui.dialog; if (!d.value) return;
  if (d.edit) { d.place.price = d.value; save(); ui.dialog = null; render(); return; }
  if (d.mode === 'new') {
    const p = placeFromAdd('spot', d.value); db.places.push(p); save();
    ui.dialog = null; ui.sheet = null; ui.add = null; ui.selected = null; ui.tab = 'home';
    toast(p.name + ' saved to Spots', () => { db.places = db.places.filter(x => x.id !== p.id); save(); });
    afterSave(p);
  } else if (d.mode === 'totry') {
    const p = d.place; p.status = 'spot'; p.price = d.value; save();
    ui.dialog = null; if (ui.sheet === 'spot') ui.sheet = null; ui.selected = null;
    toast(p.name + ' saved to Spots', () => { p.status = 'totry'; p.price = 0; save(); });
  } else if (d.mode === 'shared') {
    const p = sharedToPlace(d.data, 'spot', d.value); db.places.push(p); save(); ui.dialog = null;
    toast(p.name + ' saved to Spots', () => { db.places = db.places.filter(x => x.id !== p.id); save(); }); afterSave(p);
  }
  render();
}
function delPlace(p) { db.places = db.places.filter(x => x.id !== p.id); (p.photos || []).forEach(id => idb.del(id).catch(() => {})); save(); if (ui.selected === p.id) { ui.selected = null; ui.sheet = null; } if (ui.page && ui.page.spot === p.id) ui.page = null; ui.dialog = null; render(); }

function shareLink(p) {
  const data = { n: p.name, c: p.cat, q: p.cuisine || '', a: p.area || '', la: +p.lat.toFixed(5), ln: +p.lng.toFixed(5), p: p.status === 'spot' ? p.price : 0, o: p.note || '', g: p.googleId || '', f: db.user.name || '', cu: cur() };
  const b = btoa(unescape(encodeURIComponent(JSON.stringify(data)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return location.origin + location.pathname + '#share=' + b;
}
async function share(p) {
  const url = shareLink(p); const text = `${p.name} · ${[catOf(p.cat).name, p.area].filter(Boolean).join(', ')}${p.note ? ' — "' + p.note + '"' : ''}`;
  try { if (navigator.share) { await navigator.share({ title: p.name, text, url }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(text + '\n' + url); toast('Link copied', null); } catch (e) { flash('Couldn’t open sharing here.'); }
}
function readShared() {
  const m = location.hash.match(/share=([A-Za-z0-9_-]+)/); if (!m) return;
  try { const s = JSON.parse(decodeURIComponent(escape(atob(m[1].replace(/-/g, '+').replace(/_/g, '/'))))); ui.dialog = { type: 'shared', data: s }; } catch (e) { /* bad link */ }
  history.replaceState(null, '', location.pathname);
}
function sharedToPlace(s, status, price) { return { id: uid(), cityId: db.currentCityId, name: s.n, area: s.a, cat: s.c, cuisine: s.q, status, price: status === 'spot' ? price : 0, note: '', photos: [], lat: s.la, lng: s.ln, googleId: s.g || null, hours: null, hoursSrc: null, addedAt: Date.now(), coordsAt: Date.now() }; }

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
    const q = `[out:json][timeout:15];nwr(around:80,${p.lat},${p.lng})["name"]["opening_hours"];out tags center 20;`;
    const r = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: 'data=' + encodeURIComponent(q) });
    if (!r.ok) return;
    const j = await r.json(); const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
    const n = norm(p.name); const hit = (j.elements || []).find(e => { const m = norm(e.tags.name || ''); return m && (m.includes(n) || n.includes(m)); });
    const week = hit && parseOH(hit.tags.opening_hours);
    if (week) { const live = byId(p.id); if (live) { live.hours = week; live.hoursSrc = 'osm'; live.hoursAt = Date.now(); save(); render(); } }
  } catch (e) { /* offline or blocked: try again later */ }
}
function refreshHours() { const due = Date.now() - 14 * 864e5; db.places.filter(p => p.hoursSrc === 'osm' && (p.hoursAt || 0) < due).slice(0, 10).forEach((p, i) => setTimeout(() => fetchOsmHours(p), i * 1500)); }

// Google place search (only when a Google key is set). Only the place ID and coordinates are kept.
let gToken = null, gTimer = null;
async function googleSuggest(text) {
  const box = $('#suggest'); if (!box || !mapApi.google || !text || text.length < 2) { if (box) box.innerHTML = ''; return; }
  try {
    const { AutocompleteSuggestion, AutocompleteSessionToken } = await google.maps.importLibrary('places');
    gToken = gToken || new AutocompleteSessionToken();
    const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({ input: text, sessionToken: gToken, locationBias: { center: me, radius: 8000 }, includedPrimaryTypes: undefined });
    box.innerHTML = `<div class="menu" style="position:absolute;top:52px;left:0;right:0;width:auto;z-index:5">${suggestions.slice(0, 5).map((s, i) => `<button data-act="gpick" data-i="${i}" style="height:auto;padding:10px 12px;flex-direction:column;align-items:flex-start;gap:2px"><span style="font-weight:800">${esc(s.placePrediction.mainText.text)}</span><span class="sub">${esc(s.placePrediction.secondaryText ? s.placePrediction.secondaryText.text : '')}</span></button>`).join('')}</div>`;
    googleSuggest.last = suggestions;
  } catch (e) { box.innerHTML = ''; }
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
    case 'tab': ui.tab = t.dataset.tab; ui.page = null; ui.sheet = null; ui.selected = null; ui.menu = null; break;
    case 'pin': ui.selected = id; ui.sheet = 'spot'; break;
    case 'menu': ui.menu = ui.menu === t.dataset.menu ? null : t.dataset.menu; break;
    case 'filt': toggleFilter(t.dataset.f); if (t.dataset.f === 'all') ui.menu = null; break;
    case 'cuisines': e.stopPropagation(); ui.cuisineOpen = !ui.cuisineOpen; break;
    case 'cities': ui.page = 'cities'; break;
    case 'closepage': ui.page = null; break;
    case 'pickcity': db.currentCityId = id; save(); ui.page = null; ui.filter = []; ui.selected = null; { const c = cityPlaces(); if (c.length) mapApi.center({ lat: c.reduce((s, x) => s + x.lat, 0) / c.length, lng: c.reduce((s, x) => s + x.lng, 0) / c.length }); } break;
    case 'addcity': ui.dialog = { type: 'text', title: 'Add a city', text: 'Its spots and To try list stay separate from other cities.', fields: [{ ph: 'City (e.g. Lisbon)' }, { ph: 'Country (e.g. Portugal)' }, { ph: 'Currency symbol (e.g. €, £, $)', value: '€' }], ok: v => { if (!v[0].trim()) return; const c = { id: 'c-' + uid(), name: v[0].trim(), country: v[1].trim(), currency: (v[2].trim() || '€').slice(0, 3) }; db.cities.push(c); db.currentCityId = c.id; save(); ui.page = null; ui.tab = 'home'; } }; break;
    case 'search': ui.tab = 'spots'; ui.spotsOpenNow = false; render(); setTimeout(() => { const i = uiEl.querySelector('[data-input="spotsSearch"]'); if (i) i.focus(); }, 50); return;
    case 'add': ui.add = newAdd(); ui.sheet = 'add'; ui.selected = null; break;
    case 'closesheet': ui.sheet = null; ui.selected = null; ui.add = null; break;
    case 'locate': locate(true); return;
    case 'addcat': ui.add.cat = t.dataset.v; break;
    case 'addcuisine': ui.add.cuisine = ui.add.cuisine === t.dataset.v ? '' : t.dataset.v; break;
    case 'addrmphoto': ui.add.photos.splice(+t.dataset.i, 1); break;
    case 'addsave': if (!ui.add.name.trim()) { flash('Add the place name first.'); return; } openPrice({ name: ui.add.name.trim() }, { mode: 'new' }); return;
    case 'addtry': { if (!ui.add.name.trim()) { flash('Add the place name first.'); return; } const np = placeFromAdd('totry', 0); db.places.push(np); save(); ui.sheet = null; ui.add = null; toast(np.name + ' added to To try', () => { db.places = db.places.filter(x => x.id !== np.id); save(); }); afterSave(np); return; }
    case 'gpick': googlePick(+t.dataset.i); return;
    case 'setprice': ui.dialog.value = +t.dataset.v; break;
    case 'pricesave': confirmPrice(); return;
    case 'editprice': openPrice(p, { edit: true }); return;
    case 'savetry': openPrice(p, { mode: 'totry' }); return;
    case 'del': ui.dialog = { type: 'confirm', place: p }; break;
    case 'confirmdel': delPlace(ui.dialog.place); return;
    case 'closedialog': if (t.tagName === 'A') { setTimeout(() => { ui.dialog = null; render(); }, 50); return; } ui.dialog = null; break;
    case 'dirs': ui.dialog = { type: 'dirs', place: p }; break;
    case 'share': share(p); return;
    case 'open': ui.page = { spot: id }; break;
    case 'showtry': ui.tab = 'home'; ui.filter = ['totry']; ui.selected = id; ui.sheet = 'spot'; mapApi.focus(p); break;
    case 'trymap': ui.tab = 'home'; ui.filter = ['totry']; break;
    case 'trysort': ui.tryNewest = !ui.tryNewest; break;
    case 'opennow': ui.spotsOpenNow = !ui.spotsOpenNow; break;
    case 'expand': ui.expand[t.dataset.cat] = !ui.expand[t.dataset.cat]; break;
    case 'undo': if (ui.toast && ui.toast.undo) ui.toast.undo(); ui.toast = null; break;
    case 'toggle': db.settings[t.dataset.key] = !db.settings[t.dataset.key]; save(); if (t.dataset.key === 'darkMap') mapApi.setStyle(); lastMapKey = ''; break;
    case 'dirapp': db.settings.dirApp = db.settings.dirApp === 'apple' ? 'google' : 'apple'; save(); break;
    case 'currency': ui.dialog = { type: 'text', title: 'Currency for ' + city().name, text: 'Used for prices in this city.', fields: [{ ph: '€, £, $…', value: city().currency }], ok: v => { city().currency = (v[0].trim() || '€').slice(0, 3); save(); } }; break;
    case 'backup': backup(); return;
    case 'clearsample': db.places = db.places.filter(x => !x.sample); db.sample = false; save(); toast('Sample spots cleared', null); return;
    case 'profile': ui.page = 'profile'; break;
    case 'installnow': if (installPrompt) { installPrompt.prompt(); installPrompt.userChoice.then(c => { if (c.outcome === 'accepted') ui.installed = true; installPrompt = null; render(); }); } return;
    case 'skipinstall': ui.install = false; try { sessionStorage.setItem('sitio.skipInstall', '1'); } catch (e2) { } break;
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
  if (k === 'addName') { ui.add.name = v; if (ui.add.googleId) { ui.add.googleId = null; ui.add.lat = null; ui.add.lng = null; } clearTimeout(gTimer); gTimer = setTimeout(() => googleSuggest(v), 250); }
  if (k === 'addArea') ui.add.area = v;
  if (k === 'addNote') ui.add.note = v;
  if (k === 'userName') { db.user.name = v; save(); }
});
uiEl.addEventListener('change', async e => {
  const el = e.target; const f = el.files && el.files[0]; if (!f) return;
  try {
    if (el.dataset.restore) { restore(f); return; }
    const blob = await compress(f); const id = 'ph-' + uid(); await idb.put(id, blob); photoUrls[id] = URL.createObjectURL(blob);
    if (el.dataset.addphoto) ui.add.photos.push(id);
    else if (el.dataset.photo) { const p = byId(el.dataset.photo); p.photos = (p.photos || []).concat(id); save(); lastMapKey = ''; }
    else if (el.dataset.userphoto) { db.user.photo = id; save(); }
    render();
  } catch (err) { flash('Couldn’t add that photo.'); }
});

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

/* ---------- start ---------- */
root.appendChild(mapApi.el); root.appendChild(uiEl);
mapApi.init();
readShared();
render();
locate(false);
refreshHours();
setInterval(() => { lastMapKey = ''; render(); }, 60000);
window.addEventListener('hashchange', () => { readShared(); render(); });
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
