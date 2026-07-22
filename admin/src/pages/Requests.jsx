import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import StatusBadge from '../components/StatusBadge';
import { serviceName, formatDate, shortId, money, STATUS_ALL } from '../lib/catalogue';

export default function Requests() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'serviceRequests'),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setRows(list);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== 'All' && (r.status || 'New') !== statusFilter) return false;
      if (!q) return true;
      const hay = [
        shortId(r.id),
        serviceName(r.service),
        r.equipmentType,
        r.userEmail,
        r.contactPhone || r.userPhone,
        r.siteLocation,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search, statusFilter]);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Service Requests</h1>
          <p className="muted small">{rows.length} total · {filtered.length} shown</p>
        </div>
      </div>

      <div className="toolbar">
        <input
          className="input grow"
          placeholder="Search ticket, service, equipment, customer, location…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="input"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="All">All statuses</option>
          {STATUS_ALL.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div className="empty">Loading requests…</div>
        ) : filtered.length === 0 ? (
          <div className="empty">No matching requests.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Ticket</th>
                  <th>Service</th>
                  <th>Customer</th>
                  <th>Urgency</th>
                  <th>Status</th>
                  <th>Total</th>
                  <th>Submitted</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} onClick={() => navigate('/requests/' + r.id)}>
                    <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>#{shortId(r.id)}</td>
                    <td>
                      <div style={{ fontWeight: 700 }}>{serviceName(r.service)}</div>
                      <div className="muted small">{r.equipmentType || '—'}</div>
                    </td>
                    <td>
                      <div>{r.userEmail || '—'}</div>
                      <div className="muted small">{r.contactPhone || r.userPhone || ''}</div>
                    </td>
                    <td>{r.urgency || 'Normal'}</td>
                    <td><StatusBadge status={r.status} /></td>
                    <td>{r.quote?.total ? money(r.quote.total) : '—'}</td>
                    <td className="muted small">{formatDate(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
