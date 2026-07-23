import { colors } from '../theme';

export function money(n) {
  const v = Number(n) || 0;
  return 'AED ' + v.toLocaleString('en-AE', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function toDate(ts) {
  if (!ts) return null;
  if (ts.toDate) return ts.toDate();
  if (ts.seconds) return new Date(ts.seconds * 1000);
  const d = new Date(ts);
  return isNaN(d.getTime()) ? null : d;
}

// Human-friendly ticket number derived deterministically from the request,
// e.g. DLX-260721-9F3A. Stable for a given document.
export function ticketNo(req) {
  const d = toDate(req?.createdAt) || new Date();
  const yy = String(d.getFullYear()).slice(2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const tail = (req?.id || '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(-4)
    .toUpperCase()
    .padStart(4, '0');
  return `DLX-${yy}${mm}${dd}-${tail}`;
}

// Customer-facing job lifecycle.
export const CUSTOMER_STEPS = [
  'Submitted',
  'Quoted',
  'Approved',
  'Technician En Route',
  'In Progress',
  'Completed',
];

// Map an internal status to the current step index (or -1 for terminal-negative).
export function statusStep(status) {
  const map = {
    New: 0,
    Quoted: 1,
    Inspection: 1,
    Approved: 2,
    'Technician En Route': 3,
    'In Progress': 4,
    Completed: 5,
  };
  if (status in map) return map[status];
  if (status === 'Declined' || status === 'Cancelled') return -1;
  return 0;
}

const STATUS_BADGE = {
  New: { label: 'NEW', color: colors.blue },
  Quoted: { label: 'QUOTED', color: colors.orange },
  Inspection: { label: 'INSPECTION', color: colors.orange },
  Approved: { label: 'APPROVED', color: colors.green },
  'Technician En Route': { label: 'EN ROUTE', color: colors.blue },
  'In Progress': { label: 'IN PROGRESS', color: colors.navy2 },
  Completed: { label: 'COMPLETED', color: colors.green },
  Declined: { label: 'DECLINED', color: colors.red },
  Cancelled: { label: 'CANCELLED', color: colors.gray },
};

export function statusBadge(status) {
  return STATUS_BADGE[status] || { label: (status || 'NEW').toUpperCase(), color: colors.gray };
}

export function urgencyBadge(urgency) {
  if (!urgency || urgency === 'Normal') return null;
  if (urgency === 'Emergency') return { label: 'EMERGENCY', color: colors.red };
  return { label: 'URGENT', color: colors.orange };
}

export function formatDay(ts) {
  const d = toDate(ts);
  if (!d) return '—';
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export function nameFromEmail(email) {
  if (!email) return 'there';
  const part = email.split('@')[0].replace(/[._-]+/g, ' ').trim();
  return part.replace(/\b\w/g, (c) => c.toUpperCase());
}
