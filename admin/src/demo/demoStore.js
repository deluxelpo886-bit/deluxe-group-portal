import { useEffect, useReducer } from 'react';

// The demo account (created in Firebase Auth) that gets sample-data mode.
export const DEMO_EMAIL = 'demo@deluxego.app';

// In-memory sample data so the portal is fully explorable without touching
// real customer records. Edits persist for the session and sync across screens.
let state = {
  requests: [
    {
      id: 'a1b2c3', service: 'gen-repair', equipmentType: 'Diesel Generator', model: 'G-455',
      uid: 'demo-u1', userEmail: 'ahmed@example.com', contactPhone: '+971 50 123 4567',
      siteLocation: 'Musaffah M12', urgency: 'Emergency', status: 'New', letterhead: 'heavy',
      description: 'Generator not starting, needs full overhaul.', createdAt: { seconds: 1785000000 },
      quote: null,
    },
    {
      id: 'd4e5f6', service: 'lv-motor', equipmentType: '3-Phase Motor', model: 'ABB M2000',
      uid: 'demo-u2', userEmail: 'sara@blueports.ae', contactPhone: '+971 55 998 1200',
      siteLocation: 'ICAD II', urgency: 'Urgent', status: 'Quoted', letterhead: 'heavy',
      description: 'Winding burnt, rewinding required.', createdAt: { seconds: 1784900000 },
      quote: {
        items: [
          { description: 'Rewinding labour', qty: 1, unitPrice: 1500, amount: 1500 },
          { description: 'Copper & materials', qty: 1, unitPrice: 2200, amount: 2200 },
        ],
        subtotal: 3700, vat: 185, total: 3885, vatRate: 0.05,
      },
    },
    {
      id: 'g7h8i9', service: 'engine-repair', equipmentType: 'Marine Engine', model: 'CAT 3406',
      uid: 'demo-u3', userEmail: 'ops@gulfmarine.ae', contactPhone: '+971 2 554 0090',
      siteLocation: 'Mina Zayed', urgency: 'Normal', status: 'Completed', letterhead: 'energy',
      description: 'Scheduled overhaul & load test.', createdAt: { seconds: 1784700000 },
      quote: {
        items: [
          { description: 'Overhaul labour', qty: 1, unitPrice: 6800, amount: 6800 },
          { description: 'Gasket & filter kit', qty: 1, unitPrice: 1450, amount: 1450 },
        ],
        subtotal: 8250, vat: 412.5, total: 8662.5, vatRate: 0.05,
      },
    },
    {
      id: 'j1k2l3', service: 'forklift', equipmentType: 'Forklift 3T', model: 'Toyota 8FG',
      uid: 'demo-u4', userEmail: 'yard@deltalog.ae', contactPhone: '+971 52 771 3345',
      siteLocation: 'KIZAD', urgency: 'Normal', status: 'Approved', letterhead: 'heavy',
      description: 'Hydraulic leak and brake service.', createdAt: { seconds: 1784600000 },
      quote: null,
    },
  ],
  zones: [
    { id: 'z1', name: 'Musaffah', inspectionFee: 250 },
    { id: 'z2', name: 'ICAD', inspectionFee: 300 },
    { id: 'z3', name: 'KIZAD', inspectionFee: 450 },
  ],
  customers: [
    { id: 'demo-u2', email: 'sara@blueports.ae', phone: '+971 55 998 1200', type: 'company',
      companyName: 'Blue Ports Marine LLC', vatNo: '100234567800003', verified: true },
    { id: 'demo-u3', email: 'ops@gulfmarine.ae', phone: '+971 2 554 0090', type: 'company',
      companyName: 'Gulf Marine Services', vatNo: '', verified: false },
  ],
};

const subscribers = new Set();

export function getDemoState() {
  return state;
}

// Apply a mutation and notify subscribers. `mutator` receives the (mutable)
// state object; changes are shallow-copied so React sees new references.
export function updateDemo(mutator) {
  mutator(state);
  state = { requests: [...state.requests], zones: [...state.zones], customers: [...state.customers] };
  subscribers.forEach((fn) => fn());
}

// Hook: re-renders the caller whenever demo state changes.
export function useDemoStore() {
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => {
    subscribers.add(force);
    return () => subscribers.delete(force);
  }, []);
  return state;
}
