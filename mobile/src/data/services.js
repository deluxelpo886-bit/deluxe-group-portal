// Service catalogue — kept in sync with the Deluxe Service Portal web app.

export const CATEGORIES = [
  { id: 'repair', name: 'Repair & Rewinding', icon: '🔧' },
  { id: 'marine', name: 'Marine', icon: '⚓' },
  { id: 'testing', name: 'Testing', icon: '📊' },
  { id: 'rental', name: 'Rental', icon: '🚜' },
  { id: 'fleet', name: 'Fleet Services', icon: '🚛' },
];

export const SERVICES = [
  { id: 'lv-motor', category: 'repair', name: 'LV Motor Repair & Rewinding' },
  { id: 'hv-motor', category: 'repair', name: 'HV Motor Repair & Services' },
  { id: 'gen-repair', category: 'repair', name: 'Generator Repair & Overhaul' },
  { id: 'engine-repair', category: 'repair', name: 'Engine Repair & Overhaul' },
  { id: 'pump-compressor', category: 'repair', name: 'Pump & Compressor Repair' },
  { id: 'marine-workshop', category: 'marine', name: 'Marine Services & Workshop' },
  { id: 'dyno-load', category: 'testing', name: 'Engine Dyno & Load Bank Testing' },
  { id: 'motor-offline', category: 'testing', name: 'Motor Offline Test' },
  { id: 'motor-online', category: 'testing', name: 'Motor Online Test' },
  { id: 'balancing', category: 'testing', name: 'Precision Balancing' },
  { id: 'rental', category: 'rental', name: 'Heavy Equipment Rental' },
  { id: 'forklift', category: 'fleet', name: 'Forklift Services' },
];

export const URGENCY = ['Normal', 'Urgent', 'Emergency'];

export function servicesForCategory(categoryId) {
  return SERVICES.filter((s) => s.category === categoryId);
}

export function serviceName(id) {
  const s = SERVICES.find((x) => x.id === id);
  return s ? s.name : id;
}

export function categoryName(id) {
  const c = CATEGORIES.find((x) => x.id === id);
  return c ? c.name : id;
}
