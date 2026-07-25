'use strict';

// Server-side alert computation. Mirrors the thresholds in public/index.html
// (buildAlertMsg / gStatus / lStatus / ageDays / pStatus) so alerts can be
// evaluated from the stored state blob without a browser open. Keep these rules
// in sync with the frontend if the thresholds change there.

function num(v) { return Number(v) || 0; }

function daysUntil(dateStr) {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return Math.round((new Date(dateStr) - t) / 86400000);
}

function ageDays(dateStr) {
  if (!dateStr) return 0;
  return Math.floor((new Date() - new Date(dateStr)) / 86400000);
}

// Returns { items: [{ level, text }], count }.
function computeAlerts(state) {
  const S = state || {};
  const settings = S.settings || {};
  const interval = num(settings.interval) || 350;
  const warnHrs = num(settings.warnHrs) || 100;
  const lpoWarn = num(settings.lpoWarn) || 30;
  const items = [];

  (S.gens || []).forEach(function (g) {
    const used = num(g.chrs) - num(g.phrs);
    const rem = (num(g.interval) || interval) - used;
    if (rem <= 0) items.push({ level: 'danger', text: 'RED OVERDUE: Generator ' + g.id + ' - ' + (g.brand || '') + ' ' + (g.cap || '') + 'KVA - Service required immediately' });
    else if (rem <= warnHrs / 2) items.push({ level: 'urgent', text: 'ORANGE URGENT: Generator ' + g.id + ' - ' + (g.brand || '') + ' - Only ' + rem + ' hrs remaining' });
    else if (rem <= warnHrs) items.push({ level: 'warn', text: 'WARN: Generator ' + g.id + ' - ' + rem + ' hrs remaining' });
  });

  (S.lpos || []).forEach(function (l) {
    const d = daysUntil(l.exp);
    if (d <= 0) items.push({ level: 'danger', text: 'RED EXPIRED: LPO ' + l.num + ' - ' + (l.sup || '') + ' - Expired' });
    else if (d <= 7) items.push({ level: 'urgent', text: 'ORANGE URGENT: LPO ' + l.num + ' - ' + (l.sup || '') + ' - Expires in ' + d + ' days' });
    else if (d <= lpoWarn) items.push({ level: 'warn', text: 'WARN: LPO ' + l.num + ' - ' + (l.sup || '') + ' - Expires in ' + d + ' days' });
  });

  (S.invs || []).forEach(function (i) {
    if (i.status === 'Paid') return;
    const age = ageDays(i.date);
    const lpoRef = i.lpo ? (' (LPO ' + i.lpo + ')') : '';
    if (age >= 60) items.push({ level: 'danger', text: 'RED OVERDUE: Invoice ' + i.num + ' - ' + (i.client || '') + ' - ' + age + ' days unapproved' + lpoRef });
    else if (age >= 30) items.push({ level: 'urgent', text: 'ORANGE URGENT: Invoice ' + i.num + ' - ' + (i.client || '') + ' - ' + age + ' days unapproved' + lpoRef });
  });

  (S.parts || []).forEach(function (p) {
    const qty = num(p.qty);
    const reorder = num(p.reorder);
    if (qty <= 0) items.push({ level: 'danger', text: 'RED OUT OF STOCK: ' + p.name + (p.gen ? (' - ' + p.gen) : '') });
    else if (reorder > 0 && qty <= reorder) items.push({ level: 'urgent', text: 'ORANGE LOW STOCK: ' + p.name + ' - ' + qty + ' left' });
  });

  return { items: items, count: items.length };
}

function buildMessage(companyName, result) {
  const lines = [companyName + ' - Alert Summary', ''];
  if (result.count === 0) lines.push('All systems normal - No alerts');
  else result.items.forEach(function (it) { lines.push(it.text); });
  lines.push('');
  lines.push('Total alerts: ' + result.count);
  lines.push(companyName);
  return lines.join('\n');
}

module.exports = { computeAlerts, buildMessage };
