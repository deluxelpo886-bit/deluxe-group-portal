import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  doc, onSnapshot, updateDoc, collection, serverTimestamp, arrayUnion,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../auth/AuthContext';
import StatusBadge from '../components/StatusBadge';
import {
  serviceName, formatDate, shortId, money, computeQuoteTotals, VAT_RATE, STATUS_ALL,
} from '../lib/catalogue';

const blankItem = () => ({ description: '', qty: 1, unitPrice: 0 });

export default function RequestDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { staff } = useAuth();

  const [req, setReq] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [zones, setZones] = useState([]);
  const [busy, setBusy] = useState('');

  // local editable state
  const [items, setItems] = useState([blankItem()]);
  const [status, setStatus] = useState('New');
  const [zoneId, setZoneId] = useState('');

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'serviceRequests', id), (snap) => {
      if (!snap.exists()) { setNotFound(true); return; }
      const data = { id: snap.id, ...snap.data() };
      setReq(data);
      setStatus(data.status || 'New');
      if (data.quote?.items?.length) setItems(data.quote.items.map((i) => ({ ...i })));
      if (data.inspection?.zoneId) setZoneId(data.inspection.zoneId);
    });
    return unsub;
  }, [id]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'zones'), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setZones(list);
      setZoneId((z) => z || (list[0] ? list[0].id : ''));
    });
    return unsub;
  }, []);

  const totals = useMemo(() => computeQuoteTotals(items), [items]);
  const selectedZone = zones.find((z) => z.id === zoneId);

  if (notFound) {
    return (
      <div>
        <button className="backlink" onClick={() => navigate('/requests')}>← Back to requests</button>
        <div className="empty">That request no longer exists.</div>
      </div>
    );
  }
  if (!req) return <div className="empty">Loading…</div>;

  const by = staff?.name || staff?.id || 'staff';

  async function patch(fields, label) {
    setBusy(label);
    try {
      await updateDoc(doc(db, 'serviceRequests', id), {
        ...fields,
        updatedAt: serverTimestamp(),
        updatedBy: by,
      });
    } catch (e) {
      alert('Could not save: ' + (e?.message || e));
    } finally {
      setBusy('');
    }
  }

  const changeStatus = (newStatus) =>
    patch(
      {
        status: newStatus,
        statusHistory: arrayUnion({ status: newStatus, at: new Date().toISOString(), by }),
      },
      'status:' + newStatus
    );

  const sendQuote = () => {
    const clean = items
      .filter((i) => (i.description || '').trim() || Number(i.unitPrice) > 0)
      .map((i) => ({
        description: (i.description || '').trim(),
        qty: Number(i.qty) || 0,
        unitPrice: Number(i.unitPrice) || 0,
        amount: (Number(i.qty) || 0) * (Number(i.unitPrice) || 0),
      }));
    if (clean.length === 0) return alert('Add at least one line item first.');
    const t = computeQuoteTotals(clean);
    patch(
      {
        quote: { items: clean, ...t, sentAt: new Date().toISOString(), sentBy: by },
        status: 'Quoted',
        statusHistory: arrayUnion({ status: 'Quoted', at: new Date().toISOString(), by }),
      },
      'quote'
    );
  };

  const markInspection = () => {
    if (!selectedZone) return alert('Add a zone first (Zones screen).');
    patch(
      {
        inspection: {
          required: true,
          zoneId: selectedZone.id,
          zoneName: selectedZone.name,
          fee: Number(selectedZone.inspectionFee) || 0,
          sentAt: new Date().toISOString(),
          sentBy: by,
        },
        status: 'Inspection',
        statusHistory: arrayUnion({ status: 'Inspection', at: new Date().toISOString(), by }),
      },
      'inspection'
    );
  };

  // line-item helpers
  const setItem = (idx, key, val) =>
    setItems((arr) => arr.map((it, i) => (i === idx ? { ...it, [key]: val } : it)));
  const addItem = () => setItems((arr) => [...arr, blankItem()]);
  const removeItem = (idx) => setItems((arr) => (arr.length > 1 ? arr.filter((_, i) => i !== idx) : arr));

  return (
    <div>
      <button className="backlink" onClick={() => navigate('/requests')}>← Back to requests</button>

      <div className="page-head">
        <div>
          <h1>{serviceName(req.service)}</h1>
          <p className="muted small">
            Ticket <strong style={{ fontFamily: 'monospace' }}>#{shortId(req.id)}</strong> ·
            submitted {formatDate(req.createdAt)}
          </p>
        </div>
        <StatusBadge status={req.status} />
      </div>

      <div className="grid-2">
        {/* LEFT: details */}
        <div className="card">
          <h3 className="mb-3">Request details</h3>
          <dl className="def-list">
            <dt>Customer</dt><dd>{req.userEmail || '—'}</dd>
            <dt>Contact</dt><dd>{req.contactPhone || req.userPhone || '—'}</dd>
            <dt>Equipment</dt><dd>{req.equipmentType || '—'}</dd>
            <dt>Model</dt><dd>{req.model || '—'}</dd>
            <dt>Serial</dt><dd>{req.serial || '—'}</dd>
            <dt>Site / location</dt><dd>{req.siteLocation || '—'}</dd>
            <dt>Preferred date</dt><dd>{req.preferredDate || '—'}</dd>
            <dt>Urgency</dt><dd>{req.urgency || 'Normal'}</dd>
            <dt>Description</dt><dd>{req.description || '—'}</dd>
          </dl>

          {req.inspection?.required ? (
            <div className="card mt-3" style={{ background: 'var(--panel-2)', boxShadow: 'none' }}>
              <strong>Inspection</strong>
              <div className="small mt-2">
                Zone: {req.inspection.zoneName} · Fee: {money(req.inspection.fee)}
              </div>
            </div>
          ) : null}
        </div>

        {/* RIGHT: status + actions */}
        <div className="card">
          <h3 className="mb-3">Status</h3>
          <div className="row items-center wrap" style={{ gap: 10 }}>
            <select className="input" style={{ width: 'auto' }} value={status}
              onChange={(e) => setStatus(e.target.value)}>
              {STATUS_ALL.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <button className="btn btn-navy btn-sm" disabled={busy.startsWith('status')}
              onClick={() => changeStatus(status)}>
              Update status
            </button>
          </div>

          <div className="row wrap mt-3" style={{ gap: 8 }}>
            <button className="btn btn-sm" onClick={() => changeStatus('Approved')}>Approve</button>
            <button className="btn btn-sm" onClick={() => changeStatus('Technician En Route')}>En route</button>
            <button className="btn btn-sm" onClick={() => changeStatus('In Progress')}>In progress</button>
            <button className="btn btn-sm btn-green" onClick={() => changeStatus('Completed')}>Complete</button>
            <button className="btn btn-sm btn-danger" onClick={() => changeStatus('Declined')}>Decline</button>
          </div>

          <h3 className="mt-4 mb-3">Mark for inspection</h3>
          {zones.length === 0 ? (
            <p className="muted small">No zones yet — add zones on the Zones screen to set an inspection fee.</p>
          ) : (
            <div className="row items-center wrap" style={{ gap: 10 }}>
              <select className="input" style={{ width: 'auto' }} value={zoneId}
                onChange={(e) => setZoneId(e.target.value)}>
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>{z.name} — {money(z.inspectionFee)}</option>
                ))}
              </select>
              <button className="btn btn-sm" disabled={busy === 'inspection'} onClick={markInspection}>
                Send inspection fee
              </button>
            </div>
          )}
        </div>
      </div>

      {/* QUOTE BUILDER */}
      <div className="card mt-3">
        <div className="row between items-center mb-3 wrap">
          <h3>Quote</h3>
          {req.quote?.sentAt ? (
            <span className="muted small">Last sent {formatDate({ seconds: Date.parse(req.quote.sentAt) / 1000 })} by {req.quote.sentBy}</span>
          ) : null}
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="table li-table" style={{ minWidth: 560 }}>
            <thead>
              <tr>
                <th style={{ width: '48%' }}>Description</th>
                <th>Qty</th>
                <th>Unit price (AED)</th>
                <th>Amount</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => (
                <tr key={idx} className="row-static">
                  <td>
                    <input className="input" value={it.description}
                      placeholder="e.g. Rewinding labour"
                      onChange={(e) => setItem(idx, 'description', e.target.value)} />
                  </td>
                  <td>
                    <input className="input" type="number" min="0" value={it.qty}
                      style={{ width: 70 }}
                      onChange={(e) => setItem(idx, 'qty', e.target.value)} />
                  </td>
                  <td>
                    <input className="input" type="number" min="0" step="0.01" value={it.unitPrice}
                      style={{ width: 120 }}
                      onChange={(e) => setItem(idx, 'unitPrice', e.target.value)} />
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {money((Number(it.qty) || 0) * (Number(it.unitPrice) || 0))}
                  </td>
                  <td>
                    <button className="btn btn-sm btn-danger" onClick={() => removeItem(idx)}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button className="btn btn-sm mt-2" onClick={addItem}>+ Add line item</button>

        <div className="totals mt-3">
          <div className="row"><span className="muted">Subtotal</span><span>{money(totals.subtotal)}</span></div>
          <div className="row"><span className="muted">VAT ({(VAT_RATE * 100).toFixed(0)}%)</span><span>{money(totals.vat)}</span></div>
          <div className="row grand"><span>Total</span><span>{money(totals.total)}</span></div>
        </div>

        <div className="row mt-3">
          <button className="btn btn-primary" disabled={busy === 'quote'} onClick={sendQuote}>
            {busy === 'quote' ? 'Sending…' : req.quote ? 'Re-send quote' : 'Send quote'}
          </button>
        </div>
      </div>
    </div>
  );
}
