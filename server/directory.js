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
  'SHAKHBOUT CITY - MSH29': 'Shakhbout City',
  'SHAKHBOUT CITY - MSH27': 'Shakhbout City',
  'MUSSAFAH (NEAR MUFRAQ IND. AREA)': 'Mussafah',
  'MUSSAFAH': 'Mussafah',
  'MUSSAFAH M-33': 'Mussafah',
  'MUSSAFAH-37': 'Mussafah',
  'MUSSAFAH-38': 'Mussafah',
  'MUSSAFAH M33': 'Mussafah',
  'MUSSAFAH-33': 'Mussafah',
  'MASDER CITY': 'Masdar City',
  'MASDAR CITY': 'Masdar City',
  'AL REEM ISLAND - RS3': 'Al Reem',
  'AL REEM ISLAND - RR8': 'Al Reem',
  'AL REEM ISLAND': 'Al Reem',
  'AL REEM': 'Al Reem',
  'ABU DHABI (SPORTS HOTEL)': 'Abu Dhabi',
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
