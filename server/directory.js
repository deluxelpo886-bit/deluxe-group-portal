'use strict';
/*
 * Fleet location directory.
 *
 * The morning route plan (and any future map-aware view) needs each
 * generator's location, GPS pin and customer. That reference data lives in the
 * fleet map page (fleet.html) as an embedded `let DATA = [...]` array, which is
 * the single source of truth the office already maintains. Rather than keep a
 * second copy that could drift, we parse that array once at startup and cache a
 * compact DG -> { location, area, zone, lat, lon, customer, kva, brand } lookup.
 *
 * Parsing is defensive: if the page format ever changes we fall back to an
 * empty directory so the rest of the portal keeps working.
 */

const fs = require('fs');
const path = require('path');

const FLEET_HTML = path.join(__dirname, 'fleet.html');

// Normalise the many free-text spellings of an area into one zone label, so
// units at the same place group together on the plan (e.g. "RUWAISH" ->
// "Ruwais", "SAKHBUTH CITY" -> "Shakhbout City").
const ZONE_ALIASES = {
  'RUWAISH': 'Ruwais',
  'RUWAIS': 'Ruwais',
  'SAKHBUTH CITY': 'Shakhbout City',
  'SAKHBOUT CITY': 'Shakhbout City',
  'SHAKHBUTH CITY': 'Shakhbout City',
  'MUSSAFAH (NEAR MUFRAQ IND. AREA)': 'Mussafah',
  'MUSSAFAH': 'Mussafah',
  'MASDER CITY': 'Masdar City',
  'MASDAR CITY': 'Masdar City',
  'ABU DHABI (SPORTS HOTEL)': 'Abu Dhabi',
};

function titleCase(s) {
  return String(s || '').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function zoneOf(location) {
  const raw = String(location || '').trim();
  if (!raw) return 'Unknown';
  const up = raw.toUpperCase();
  if (ZONE_ALIASES[up]) return ZONE_ALIASES[up];
  return titleCase(raw);
}

let cache = null; // DG(upper) -> record

function load() {
  if (cache) return cache;
  cache = {};
  try {
    const html = fs.readFileSync(FLEET_HTML, 'utf8');
    const m = html.match(/let DATA = (\[[\s\S]*?\]);/);
    if (!m) return cache;
    const data = JSON.parse(m[1]);
    data.forEach((g) => {
      const dg = String((g && g.dg) || '').trim().toUpperCase();
      if (!dg || dg === 'DG-NO') return;
      cache[dg] = {
        dg,
        location: g.location || '',
        zone: zoneOf(g.location),
        lat: (typeof g.lat === 'number') ? g.lat : null,
        lon: (typeof g.lon === 'number') ? g.lon : null,
        customer: g.customer || '',
        kva: g.kva || null,
        brand: g.brand || '',
        maps_link: g.maps_link || null,
      };
    });
  } catch (_) {
    cache = cache || {};
  }
  return cache;
}

function getMap() { return Object.assign({}, load()); }
function get(dg) { return load()[String(dg || '').trim().toUpperCase()] || null; }

module.exports = { getMap, get, zoneOf };
