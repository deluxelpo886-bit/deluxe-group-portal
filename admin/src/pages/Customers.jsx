import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../auth/AuthContext';
import { formatDate } from '../lib/catalogue';

export default function Customers() {
  const { staff } = useAuth();
  const [requests, setRequests] = useState([]);
  const [profiles, setProfiles] = useState({}); // uid -> customers doc
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    const u1 = onSnapshot(collection(db, 'serviceRequests'), (snap) =>
      setRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const u2 = onSnapshot(collection(db, 'customers'), (snap) => {
      const map = {};
      snap.docs.forEach((d) => { map[d.id] = { id: d.id, ...d.data() }; });
      setProfiles(map);
    });
    return () => { u1(); u2(); };
  }, []);

  // Merge: one row per customer (keyed by uid), aggregating their requests and
  // overlaying any saved profile (company details + verification).
  const customers = useMemo(() => {
    const map = {};
    requests.forEach((r) => {
      const key = r.uid || (r.userEmail ? 'email:' + r.userEmail : null);
      if (!key) return;
      if (!map[key]) {
        map[key] = {
          uid: r.uid || null,
          key,
          email: r.userEmail || '',
          phone: r.contactPhone || r.userPhone || '',
          count: 0,
          lastAt: 0,
        };
      }
      map[key].count += 1;
      map[key].lastAt = Math.max(map[key].lastAt, r.createdAt?.seconds || 0);
      if (!map[key].phone) map[key].phone = r.contactPhone || r.userPhone || '';
    });
    // include profiles that may not have any requests yet
    Object.values(profiles).forEach((p) => {
      const key = p.id;
      if (!map[key]) {
        map[key] = { uid: p.id, key, email: p.email || '', phone: p.phone || '', count: 0, lastAt: 0 };
      }
    });
    const rows = Object.values(map).map((c) => ({ ...c, profile: c.uid ? profiles[c.uid] : null }));
    rows.sort((a, b) => b.lastAt - a.lastAt);
    return rows;
  }, [requests, profiles]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) =>
      [c.email, c.phone, c.profile?.companyName].filter(Boolean).join(' ').toLowerCase().includes(q)
    );
  }, [customers, search]);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Customers</h1>
          <p className="muted small">{customers.length} customers</p>
        </div>
      </div>

      <div className="toolbar">
        <input className="input grow" placeholder="Search email, phone, company…"
          value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {filtered.length === 0 ? (
          <div className="empty">No customers yet. They appear here after signing up and submitting a request.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Type</th>
                  <th>Requests</th>
                  <th>Verification</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const p = c.profile;
                  const isCompany = p?.type === 'company';
                  return (
                    <tr key={c.key} className="row-static">
                      <td>
                        <div style={{ fontWeight: 700 }}>{p?.companyName || c.email || '—'}</div>
                        <div className="muted small">{c.email}{c.phone ? ' · ' + c.phone : ''}</div>
                      </td>
                      <td>{isCompany ? 'Company' : 'Individual'}</td>
                      <td>{c.count}</td>
                      <td>
                        {isCompany ? (
                          p?.verified ? (
                            <span className="badge" style={{ background: 'var(--green)' }}>Verified</span>
                          ) : (
                            <span className="badge" style={{ background: 'var(--orange)' }}>Unverified</span>
                          )
                        ) : (
                          <span className="badge badge-outline">N/A</span>
                        )}
                      </td>
                      <td>
                        <button className="btn btn-sm" disabled={!c.uid} onClick={() => setEditing(c)}>
                          {c.uid ? 'Review' : 'No profile'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing ? (
        <CustomerModal
          customer={editing}
          staff={staff}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

function CustomerModal({ customer, staff, onClose }) {
  const p = customer.profile || {};
  const [type, setType] = useState(p.type || 'individual');
  const [companyName, setCompanyName] = useState(p.companyName || '');
  const [tradeLicenseNo, setTradeLicenseNo] = useState(p.tradeLicenseNo || '');
  const [vatNo, setVatNo] = useState(p.vatNo || '');
  const [verified, setVerified] = useState(!!p.verified);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const by = staff?.name || staff?.id || 'staff';
      const data = {
        email: customer.email || p.email || '',
        phone: customer.phone || p.phone || '',
        type,
        companyName: type === 'company' ? companyName.trim() : '',
        tradeLicenseNo: type === 'company' ? tradeLicenseNo.trim() : '',
        vatNo: type === 'company' ? vatNo.trim() : '',
        verified: type === 'company' ? verified : false,
        updatedAt: serverTimestamp(),
        updatedBy: by,
      };
      if (type === 'company' && verified && !p.verified) {
        data.verifiedAt = serverTimestamp();
        data.verifiedBy = by;
      }
      await setDoc(doc(db, 'customers', customer.uid), data, { merge: true });
      onClose();
    } catch (e) {
      alert('Could not save: ' + (e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="card modal" onClick={(e) => e.stopPropagation()}>
        <div className="row between items-center mb-3">
          <h3>Customer</h3>
          <button className="btn btn-sm" onClick={onClose}>✕</button>
        </div>

        <dl className="def-list mb-3">
          <dt>Email</dt><dd>{customer.email || '—'}</dd>
          <dt>Phone</dt><dd>{customer.phone || '—'}</dd>
          <dt>Requests</dt><dd>{customer.count}</dd>
          {p.verifiedAt ? (<><dt>Verified</dt><dd>{formatDate(p.verifiedAt)} by {p.verifiedBy}</dd></>) : null}
        </dl>

        <div className="field">
          <label className="label">Account type</label>
          <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="individual">Individual</option>
            <option value="company">Company</option>
          </select>
        </div>

        {type === 'company' ? (
          <>
            <div className="field">
              <label className="label">Company name</label>
              <input className="input" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
            </div>
            <div className="field">
              <label className="label">Trade License No.</label>
              <input className="input" value={tradeLicenseNo}
                onChange={(e) => setTradeLicenseNo(e.target.value)}
                placeholder="From the Trade License you checked" />
            </div>
            <div className="field">
              <label className="label">VAT Certificate / TRN</label>
              <input className="input" value={vatNo}
                onChange={(e) => setVatNo(e.target.value)}
                placeholder="From the VAT Certificate you checked" />
            </div>
            <label className="row items-center" style={{ gap: 10, cursor: 'pointer' }}>
              <input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} />
              <span>Mark as <strong>Verified</strong> (Trade License &amp; VAT Certificate checked)</span>
            </label>
          </>
        ) : (
          <p className="muted small">Switch to “Company” to record Trade License / VAT details and verify.</p>
        )}

        <div className="row mt-3">
          <button className="btn btn-primary" disabled={saving} onClick={save}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button className="btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
