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
const overrides = require('./overrides');

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
  'SHAKHBOUT CITY - MSH29': 'Shakhbout City',
  'SHAKHBOUT CITY - MSH27': 'Shakhbout City',
  'MUSSAFAH (NEAR MUFRAQ IND. AREA)': 'Mussafah',
  'MUSSAFAH': 'Mussafah',
  'MUSSAFAH M-33': 'Mussafah',
  'MUSSAFAH-37': 'Mussafah',
  'MUSSAFAH-38': 'Mussafah',
  'MUSSAFAH M33': 'Mussafah',
  'MUSSAFAH-33': 'Mussafah',
  'MUSSAFAH M37': 'Mussafah',
  'MASDER CITY': 'Masdar City',
  'MASDAR CITY': 'Masdar City',
  'AL REEM ISLAND - RS3': 'Al Reem',
  'AL REEM ISLAND - RR8': 'Al Reem',
  'AL REEM ISLAND': 'Al Reem',
  'AL REEM': 'Al Reem',
  'ABU DHABI (SPORTS HOTEL)': 'Abu Dhabi',
  'ABU DHABI (AL HISN W6)': 'Abu Dhabi',
  'AL BAHIA': 'Al Bahia',
  'AL BAHIA (LANE 212)': 'Al Bahia',
  'AL BAHYAH (AL SAFARJAL ST)': 'Al Bahia',
  'AL BAHYAH': 'Al Bahia',
  'AL BAHYAH FARMS (LANE 601)': 'Al Bahia',
  'MOHAMED BIN ZAYED CITY - Z27': 'MBZ City',
  'MOHAMED BIN ZAYED CITY - ME15': 'MBZ City',
  'AL FAYA NORTH (AL ASHEESH)': 'Al Faya',
  'AL FAYA': 'Al Faya',
  'BANIYAS': 'Baniyas',
  'BANIYAS EAST': 'Baniyas',
  'BANIYAS WEST': 'Baniyas',
  'BANIYAS (AL NAHDHAH SCHOOL)': 'Baniyas',
  'BANIYAS WEST (JARN YAFOUR)': 'Baniyas',
  'AL SHAWAMEKH - SHM11': 'Baniyas',
  'AL AIN (AIN AL FAYDA)': 'Al Ain',
  'ABU DHABI UNIVERSITY': 'MBZ City',
  'MAFRAQ (JARN YAFOUR)': 'Mafraq',
  'MAFRAQ INDUSTRIAL AREA': 'Mafraq',
  'DUBAI (JVC)': 'Dubai',
  'DUBAI (BUSINESS BAY)': 'Dubai',
  'AL JUBAIL ISLAND - JS': 'Jubail Island',
  'JUBAIL ISLAND': 'Jubail Island',
  'JUMEIRAH VILLAGE CIRCLE - DUBAI': 'Dubai',
  'KHALIFA INDUSTRIAL CITY B': 'KIZAD',
  'KHALIFA INDUSTRIAL CITY': 'KIZAD',
  'KIZAD': 'KIZAD',
  'DUBAI (HESSYAN FIRST)': 'Dubai',
  'ICAD': 'Icad',
  'ICAD I': 'Icad',
  'ICAD II': 'Icad',
  'ICAD III': 'Icad',
  'HUDRIYAT': 'Hudriyat',
  'HUDAYRIYAT': 'Hudriyat',
  'ICAD-1': 'Icad',
  'ICAD 1': 'Icad',
  'ICAD II ABU DHABI': 'Icad',
  'RAZEEM -AL FAYA': 'Al Faya',
  'JUMEIRAH ISLANDS - DUBAI': 'Dubai',
  'AL NAHYAN - ABU DHABI': 'Al Nahyan',
};

function titleCase(s) {
  return String(s || '').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function zoneOf(location) {
  const raw = String(location || '').trim();
  if (!raw) return 'Unknown';
  const up = raw.toUpperCase();
  if (ZONE_ALIASES[up]) return ZONE_ALIASES[up];
  // Any Dubai sub-area (Business Bay, JVC, Jumeirah, Hessyan, …) plans as one
  // "Dubai" zone — it's far and gets its own team for the day.
  if (/\bDUBAI\b/.test(up)) return 'Dubai';
  return titleCase(raw);
}

let base = null; // DG(upper) -> record parsed from fleet.html (cached)

function loadBase() {
  if (base) return base;
  base = {};
  try {
    const html = fs.readFileSync(FLEET_HTML, 'utf8');
    const m = html.match(/let DATA = (\[[\s\S]*?\]);/);
    if (!m) return base;
    const data = JSON.parse(m[1]);
    data.forEach((g) => {
      const dg = String((g && g.dg) || '').trim().toUpperCase();
      if (!dg || dg === 'DG-NO') return;
      base[dg] = {
        dg,
        location: g.location || '',
        zone: zoneOf(g.location),
        lat: (typeof g.lat === 'number') ? g.lat : null,
        lon: (typeof g.lon === 'number') ? g.lon : null,
        customer: g.customer || '',
        contact: g.contact || '',
        kva: g.kva || null,
        brand: g.brand || '',
        company: g.company || '',
        maps_link: g.maps_link || null,
        gatePass: !!g.gatePass,
      };
    });
  } catch (_) {
    base = base || {};
  }
  return base;
}

// Layer the office's manual overrides on top of the parsed base list. Applied
// fresh on every read (the base HTML parse stays cached) so a manual entry
// takes effect immediately, without a restart. A unit marked `removed` is
// dropped entirely, so it disappears from the plan, the morning route and the
// service directory at once.
function load() {
  const b = loadBase();
  const ov = overrides.getAll();
  const out = {};
  Object.keys(b).forEach((dg) => {
    const o = ov[dg];
    if (o && o.removed) return; // hidden by the office
    const rec = Object.assign({}, b[dg]);
    if (o) {
      if (typeof o.lat === 'number') rec.lat = o.lat;
      if (typeof o.lon === 'number') rec.lon = o.lon;
      if (o.coordsLocked) rec.coordsLocked = true;
      if (o.location) { rec.location = o.location; rec.zone = zoneOf(o.location); }
      if (o.customer) rec.customer = o.customer;
    }
    out[dg] = rec;
  });
  return out;
}

function getMap() { return load(); }
function get(dg) { return load()[String(dg || '').trim().toUpperCase()] || null; }

module.exports = { getMap, get, zoneOf };
