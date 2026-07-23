// Real service/equipment photos, wired to each service id.
// (Bundled from mobile/assets/services/.)
export const SERVICE_IMAGES = {
  'lv-motor': require('../../assets/services/lv-motor.jpg'),
  'hv-motor': require('../../assets/services/hv-motor.jpg'),
  'gen-repair': require('../../assets/services/gen-repair.jpg'),
  'engine-repair': require('../../assets/services/engine-repair.jpg'),
  'pump-compressor': require('../../assets/services/pump-compressor.jpg'),
  'marine-workshop': require('../../assets/services/marine-workshop.jpg'),
  'dyno-load': require('../../assets/services/dyno-load.jpg'),
  'motor-offline': require('../../assets/services/motor-offline.jpg'),
  'motor-online': require('../../assets/services/motor-online.jpg'),
  balancing: require('../../assets/services/balancing.jpg'),
  rental: require('../../assets/services/rental.jpg'),
  forklift: require('../../assets/services/forklift.jpg'),
};

// A representative photo for each category (used when only a category is known).
export const CATEGORY_IMAGES = {
  repair: SERVICE_IMAGES['gen-repair'],
  marine: SERVICE_IMAGES['marine-workshop'],
  testing: SERVICE_IMAGES['dyno-load'],
  rental: SERVICE_IMAGES['rental'],
  fleet: SERVICE_IMAGES['forklift'],
};

// Resolve the best photo for a request/service. Falls back to the category
// image, then a generic one.
export function imageFor({ service, category } = {}) {
  return (
    (service && SERVICE_IMAGES[service]) ||
    (category && CATEGORY_IMAGES[category]) ||
    SERVICE_IMAGES['gen-repair']
  );
}
