'use strict';
/*
 * Customer site profiles.
 *
 * Before/after delivering a generator to a company, the office records what the
 * site is actually like: where it is (map pin), how dusty/harsh it is (which
 * drives normal vs premium rate), whether a gate pass is needed to get in, which
 * generators are deployed there, plus a post-delivery review. Stored in a small
 * JSON file next to the database so it lives on the persistent disk and survives
 * restarts and deploys.
 */

const fs = require('fs');
const path = require('path');

// Store next to the database so the data lives on the same persistent disk
// (a plain app-folder path is wiped on every Render deploy).
const DIR = path.dirname(process.env.DB_PATH || path.join(__dirname, '..', 'data', 'deluxe.db'));
const FILE = path.join(DIR, 'sites.json');

const DUST_LEVELS = ['Low', 'Medium', 'High'];
const RATES = ['Normal', 'Premium'];

let items = [];
try {
  if (fs.existsSync(FILE)) {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    items = Array.isArray(raw) ? raw : (raw && raw.items) || [];
  }
} catch (_) { items = []; }

function persist() {
  try {
    if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(items, null, 2));
  } catch (_) { /* best-effort */ }
}

function num(v) {
  const n = Number(v);
  return isFinite(n) ? n : null;
}

// Normalise an incoming record into a clean stored site. Used for both add and
// edit; when `rec.id` matches an existing site it's updated in place.
function clean(rec, existing) {
  const company = String((rec && rec.company) || '').trim();
  if (!company) throw new Error('Company / site name is required');

  const lat = num(rec.lat);
  const lng = num(rec.lng);
  const dust = DUST_LEVELS.indexOf(rec.dust) >= 0 ? rec.dust : 'Low';
  // A high-dust / harsh site defaults to the premium rate unless told otherwise.
  let rate = RATES.indexOf(rec.rate) >= 0 ? rec.rate : (dust === 'High' ? 'Premium' : 'Normal');

  const rating = Math.max(0, Math.min(5, Math.round(num(rec.rating) || 0)));

  const photo = (typeof rec.photo === 'string' && rec.photo.slice(0, 11) === 'data:image/' && rec.photo.length < 3000000)
    ? rec.photo
    : (existing ? existing.photo : null);

  return {
    id: (existing && existing.id) || ('SITE' + Date.now().toString(36) + Math.floor(Math.random() * 1000)),
    company,
    contact: String(rec.contact || '').trim(),
    phone: String(rec.phone || '').trim(),
    lat: lat != null && lng != null ? lat : null,
    lng: lat != null && lng != null ? lng : null,
    dust,
    rate,
    gatePass: !!rec.gatePass,
    gatePassNotes: String(rec.gatePassNotes || '').trim(),
    generators: String(rec.generators || '').trim(),
    access: String(rec.access || '').trim(),
    rating,
    reviewNotes: String(rec.reviewNotes || '').trim(),
    photo: photo || null,
    createdAt: (existing && existing.createdAt) || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// Add a new site or update an existing one (when rec.id is given).
function save(rec) {
  const id = rec && rec.id ? String(rec.id) : '';
  const idx = id ? items.findIndex((x) => x.id === id) : -1;
  const entry = clean(rec, idx >= 0 ? items[idx] : null);
  if (idx >= 0) items[idx] = entry; else items.unshift(entry);
  persist();
  return entry;
}

function remove(id) {
  items = items.filter((x) => x.id !== String(id));
  persist();
}

// List sites, most-recently-updated first. Photos are stripped to keep the list
// light (fetched separately via getPhoto); a hasPhoto flag tells the UI.
function getAll() {
  return items
    .map((it) => {
      const copy = Object.assign({}, it);
      copy.hasPhoto = !!copy.photo;
      delete copy.photo;
      return copy;
    })
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
}

function getPhoto(id) {
  const it = items.find((x) => x.id === String(id));
  return it && it.photo ? it.photo : null;
}

module.exports = { save, remove, getAll, getPhoto, DUST_LEVELS, RATES };
