// Service catalogue — kept in sync with the mobile app.
export const CATEGORIES = [
  { id: 'repair', name: 'Repair & Rewinding' },
  { id: 'marine', name: 'Marine' },
  { id: 'testing', name: 'Testing' },
  { id: 'rental', name: 'Rental' },
  { id: 'fleet', name: 'Fleet Services' },
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

export function serviceName(id) {
  const s = SERVICES.find((x) => x.id === id);
  return s ? s.name : id || '—';
}

// Job lifecycle. The main flow the user asked for, plus two terminal states.
export const STATUS_FLOW = [
  'New',
  'Quoted',
  'Inspection',
  'Approved',
  'Technician En Route',
  'In Progress',
  'Completed',
];
export const STATUS_ALL = [...STATUS_FLOW, 'Declined', 'Cancelled'];

export const STATUS_COLORS = {
  New: 'var(--blue)',
  Quoted: 'var(--gold-dim)',
  Inspection: 'var(--orange)',
  Approved: 'var(--green)',
  'Technician En Route': 'var(--blue)',
  'In Progress': 'var(--navy-2)',
  Completed: 'var(--green)',
  Declined: 'var(--red)',
  Cancelled: 'var(--gray)',
};

export const VAT_RATE = 0.05; // UAE VAT 5%

export function money(n) {
  const v = Number(n) || 0;
  return 'AED ' + v.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function computeQuoteTotals(items) {
  const subtotal = items.reduce(
    (sum, it) => sum + (Number(it.qty) || 0) * (Number(it.unitPrice) || 0),
    0
  );
  const vat = subtotal * VAT_RATE;
  return { subtotal, vat, total: subtotal + vat, vatRate: VAT_RATE };
}

export function formatDate(ts) {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts.seconds ? ts.seconds * 1000 : ts);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ', ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export function shortId(id) {
  return (id || '').slice(0, 6).toUpperCase();
}
