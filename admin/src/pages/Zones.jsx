import React, { useEffect, useState } from 'react';
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { money } from '../lib/catalogue';

export default function Zones() {
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [fee, setFee] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'zones'),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        setZones(list);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
  }, []);

  const addZone = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'zones'), {
        name: name.trim(),
        inspectionFee: Number(fee) || 0,
        createdAt: serverTimestamp(),
      });
      setName('');
      setFee('');
    } catch (err) {
      alert('Could not add zone: ' + (err?.message || err));
    } finally {
      setSaving(false);
    }
  };

  const saveFee = async (id, value) => {
    await updateDoc(doc(db, 'zones', id), { inspectionFee: Number(value) || 0 });
  };
  const rename = async (id, value) => {
    await updateDoc(doc(db, 'zones', id), { name: value });
  };
  const remove = async (id, zoneName) => {
    if (!window.confirm(`Delete zone "${zoneName}"?`)) return;
    await deleteDoc(doc(db, 'zones', id));
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Zones</h1>
          <p className="muted small">Service zones and their inspection fees</p>
        </div>
      </div>

      <div className="card mb-3">
        <h3 className="mb-3">Add a zone</h3>
        <form className="row wrap items-center" style={{ gap: 10 }} onSubmit={addZone}>
          <input className="input grow" placeholder="Zone name (e.g. Jebel Ali)"
            value={name} onChange={(e) => setName(e.target.value)} />
          <input className="input" style={{ width: 180 }} type="number" min="0" step="0.01"
            placeholder="Inspection fee (AED)" value={fee} onChange={(e) => setFee(e.target.value)} />
          <button className="btn btn-primary" disabled={saving} type="submit">
            {saving ? 'Adding…' : 'Add zone'}
          </button>
        </form>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div className="empty">Loading zones…</div>
        ) : zones.length === 0 ? (
          <div className="empty">No zones yet. Add your first zone above.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: '55%' }}>Zone</th>
                <th>Inspection fee (AED)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {zones.map((z) => (
                <tr key={z.id} className="row-static">
                  <td>
                    <input className="input" defaultValue={z.name}
                      onBlur={(e) => e.target.value !== z.name && rename(z.id, e.target.value)} />
                  </td>
                  <td>
                    <input className="input" type="number" min="0" step="0.01" style={{ width: 160 }}
                      defaultValue={z.inspectionFee ?? 0}
                      onBlur={(e) => saveFee(z.id, e.target.value)} />
                    <div className="muted small mt-2">{money(z.inspectionFee)}</div>
                  </td>
                  <td>
                    <button className="btn btn-sm btn-danger" onClick={() => remove(z.id, z.name)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="muted small mt-2">Edits save when you click out of a field.</p>
    </div>
  );
}
