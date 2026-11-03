// Sitio – static data: categories, icons, placeholder art and sample spots.
window.SITIO = window.SITIO || {};

SITIO.CATS = [
  { id: 'restaurant', name: 'Restaurant', plural: 'Restaurants' },
  { id: 'bar', name: 'Bar', plural: 'Bars' },
  { id: 'cafe', name: 'Café', plural: 'Cafés' },
  { id: 'club', name: 'Club', plural: 'Clubs' },
  { id: 'chill', name: 'Chill', plural: 'Chill' },
  { id: 'padel', name: 'Padel', plural: 'Padel' }
];

SITIO.CUISINES = ['Indian', 'Japanese', 'Spanish', 'Italian', 'Mexican', 'Peruvian', 'Vietnamese', 'Lebanese', 'Chinese', 'Korean', 'Thai', 'Other'];

SITIO.PRICE_WORDS = ['', 'Budget', 'Medium', 'Pricey'];

const S = (d, extra) => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra || ''}>${d}</svg>`;
SITIO.ICON = {
  chevDown: S('<path d="M6 9l6 6 6-6"/>', 'style="width:16px;height:16px"'),
  chevRight: S('<path d="M9 6l6 6-6 6"/>', 'style="width:14px;height:14px"'),
  back: S('<path d="M15 18l-6-6 6-6"/>'),
  search: S('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>'),
  plus: S('<path d="M12 5v14M5 12h14"/>', 'stroke-width="2.8"'),
  filter: S('<path d="M4 7h16M7 12h10M10 17h4"/>', 'style="width:16px;height:16px"'),
  close: S('<path d="M6 6l12 12M18 6L6 18"/>', 'stroke-width="2.6"'),
  check: S('<path d="M5 12l5 5L20 7"/>', 'stroke-width="2.8"'),
  nav: S('<path d="M3 11l18-8-8 18-2-8-8-2z"/>'),
  pin: S('<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>'),
  share: S('<path d="M12 3v12M8 7l4-4 4 4M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7"/>'),
  bin: S('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
  pen: S('<path d="M4 20h4L19 9l-4-4L4 16z"/>', 'style="width:14px;height:14px"'),
  map: S('<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14"/>', 'style="width:16px;height:16px"'),
  camera: S('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
  home: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" style="width:22px;height:22px"><path d="M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" fill="FILL" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  spots: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" style="width:22px;height:22px"><rect x="3" y="4" width="18" height="7" rx="2" fill="FILL" stroke="currentColor" stroke-width="2"/><rect x="3" y="13" width="18" height="7" rx="2" fill="FILL" stroke="currentColor" stroke-width="2"/></svg>',
  totry: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" style="width:22px;height:22px"><path d="M6 3h12v18l-6-4-6 4z" fill="FILL" stroke="STROKE" stroke-width="2" stroke-linejoin="round"/></svg>',
  account: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" style="width:22px;height:22px"><circle cx="12" cy="8" r="4" fill="FILL" stroke="currentColor" stroke-width="2"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6" fill="FILL" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  cat: {
    restaurant: S('<path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 3c-2 0-3 2-3 6h3v12"/>'),
    bar: S('<path d="M5 4h14l-7 8zM12 12v8M8 20h8"/>'),
    cafe: S('<path d="M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM16 10h2a2 2 0 0 1 0 4h-2M8 3v3M12 3v3"/>'),
    club: S('<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>'),
    chill: S('<path d="M3 20h18M5 20l5-8 4 5 2-3 3 6"/><circle cx="17" cy="6" r="2.5"/>'),
    padel: S('<ellipse cx="10" cy="9" rx="6" ry="6.5"/><path d="M14 14l6 6"/><circle cx="19" cy="6" r="1.6"/>')
  }
};

// Placeholder "photos" until real ones are added (interior-style drawings per category).
SITIO.ART = {
  restaurant: '<svg viewBox="0 0 120 80" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="120" height="80" fill="#3A2418"/><rect width="120" height="46" fill="#4A2E1E"/><rect x="48" y="10" width="24" height="18" fill="#8A5A35"/><rect x="50" y="12" width="20" height="14" fill="#C8742B"/><path d="M14 12 h12 l-3 6 h-6z M94 12 h12 l-3 6 h-6z" fill="#F3C87A"/><circle cx="20" cy="26" r="14" fill="#F3C87A" opacity="0.15"/><circle cx="100" cy="26" r="14" fill="#F3C87A" opacity="0.15"/><rect y="52" width="120" height="28" fill="#2A190F"/><rect x="8" y="46" width="40" height="10" rx="2" fill="#EDE6DA"/><rect x="72" y="46" width="40" height="10" rx="2" fill="#EDE6DA"/><circle cx="20" cy="48" r="3" fill="#C8742B"/><circle cx="36" cy="48" r="3" fill="#C8742B"/><circle cx="86" cy="48" r="3" fill="#C8742B"/><circle cx="100" cy="48" r="3" fill="#C8742B"/></svg>',
  bar: '<svg viewBox="0 0 120 80" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="120" height="80" fill="#24160F"/><rect width="120" height="44" fill="#2E1D13"/><rect x="8" y="14" width="104" height="2" fill="#5A3A22"/><rect x="8" y="30" width="104" height="2" fill="#5A3A22"/><rect x="12" y="5" width="4" height="9" fill="#7FB069"/><rect x="26" y="4" width="4" height="10" fill="#B5531F"/><rect x="52" y="5" width="4" height="9" fill="#E8A54B"/><rect x="59" y="4" width="4" height="10" fill="#7FB069"/><rect x="85" y="5" width="4" height="9" fill="#D9C6A5"/><rect x="98" y="4" width="4" height="10" fill="#E8A54B"/><rect x="30" y="22" width="4" height="8" fill="#7FB069"/><rect x="46" y="21" width="4" height="9" fill="#B5531F"/><rect x="70" y="22" width="4" height="8" fill="#E8A54B"/><circle cx="30" cy="40" r="14" fill="#F5C77E" opacity="0.2"/><circle cx="90" cy="40" r="14" fill="#F5C77E" opacity="0.2"/><circle cx="30" cy="38" r="3" fill="#F5C77E"/><circle cx="90" cy="38" r="3" fill="#F5C77E"/><rect y="50" width="120" height="30" fill="#4A2C19"/><rect y="48" width="120" height="4" fill="#8A5A35"/><circle cx="22" cy="68" r="6" fill="#1A100A"/><circle cx="52" cy="68" r="6" fill="#1A100A"/><circle cx="82" cy="68" r="6" fill="#1A100A"/></svg>',
  cafe: '<svg viewBox="0 0 120 80" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="120" height="80" fill="#D9C7AE"/><rect x="14" y="8" width="56" height="40" fill="#A9CCD9"/><path d="M42 8 V48 M14 28 H70" stroke="#6B4F3A" stroke-width="2"/><rect x="14" y="8" width="56" height="40" fill="none" stroke="#6B4F3A" stroke-width="3"/><circle cx="90" cy="30" r="10" fill="#5E8C3A"/><circle cx="98" cy="22" r="7" fill="#7FB069"/><rect x="88" y="36" width="10" height="12" fill="#B5531F"/><rect y="54" width="120" height="26" fill="#8A6A4E"/><ellipse cx="36" cy="56" rx="18" ry="4" fill="#5A3E2B"/><rect x="34" y="56" width="4" height="16" fill="#5A3E2B"/><rect x="28" y="48" width="7" height="8" rx="1" fill="#F8F4EC"/><ellipse cx="88" cy="58" rx="16" ry="4" fill="#5A3E2B"/><rect x="86" y="58" width="4" height="14" fill="#5A3E2B"/></svg>',
  club: '<svg viewBox="0 0 120 80" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="120" height="80" fill="#0E0819"/><path d="M30 0 L10 80 H40 Z" fill="#B05BFF" opacity="0.35"/><path d="M90 0 L80 80 H112 Z" fill="#3FB6FF" opacity="0.35"/><path d="M60 0 L45 80 H75 Z" fill="#FF5AA8" opacity="0.25"/><circle cx="60" cy="10" r="5" fill="#E6E6F0"/><path d="M0 80 L6 62 L12 68 L18 58 L26 66 L32 56 L40 66 L48 58 L56 67 L64 57 L72 66 L80 58 L88 67 L96 59 L104 66 L112 58 L120 64 V80 Z" fill="#05030A"/></svg>',
  chill: '<svg viewBox="0 0 120 80" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="120" height="80" fill="#E9945A"/><circle cx="80" cy="34" r="12" fill="#FFE1A8"/><path d="M0 46 Q30 34 60 46 T120 42 V80 H0Z" fill="#3E5A3A"/><path d="M0 58 Q40 48 70 58 T120 54 V80 H0Z" fill="#2B4229"/><rect y="66" width="120" height="14" fill="#5A3E2B"/></svg>',
  padel: '<svg viewBox="0 0 120 80" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="120" height="80" fill="#1E4E86"/><rect x="10" y="10" width="100" height="60" fill="#2C6FB8"/><rect x="10" y="10" width="100" height="60" fill="none" stroke="#F2EFEA" stroke-width="1.5"/><path d="M60 10 V70" stroke="#F2EFEA" stroke-width="2"/><path d="M30 10 V70 M90 10 V70 M30 40 H90" stroke="#F2EFEA" stroke-width="1"/><circle cx="78" cy="28" r="3" fill="#E3F04A"/></svg>',
  totry: '<svg viewBox="0 0 40 40" aria-hidden="true"><rect width="40" height="40" fill="#2E1C1C"/><path d="M20 31s-8-7-8-13a8 8 0 0 1 16 0c0 6-8 13-8 13z" fill="none" stroke="#FF8A80" stroke-width="2.4" stroke-linejoin="round"/><circle cx="20" cy="18" r="2.8" fill="#FF8A80"/></svg>'
};

// Sample Madrid data (invented places) so the app can be tried before real data is added.
SITIO.SAMPLE = (() => {
  const city = { id: 'c-madrid', name: 'Madrid', country: 'Spain', currency: '€' };
  const h = (o, c) => ({ open: o, close: c });
  const p = (name, cat, lat, lng, area, status, extra) => Object.assign({
    id: 'p-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    cityId: city.id, name, cat, lat, lng, area, status,
    cuisine: '', price: 0, note: '', photos: [], hours: null, addedAt: Date.now()
  }, extra || {});
  // One example spot so a first-time user sees how it works. Everything else starts empty.
  const places = [
    p('Example spot', 'restaurant', 40.4168, -3.7038, 'Sol', 'spot', { cuisine: 'Spanish', price: 2, note: 'This is just an example so you can see how Sitio works. Delete it whenever you like and add your own with +.', hours: h('00:00', '23:59') })
  ];
  return { cities: [city], places };
})();
