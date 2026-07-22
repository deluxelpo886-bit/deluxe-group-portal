import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import Login from './pages/Login';
import Layout from './components/Layout';
import Requests from './pages/Requests';
import RequestDetail from './pages/RequestDetail';
import Zones from './pages/Zones';
import Customers from './pages/Customers';

function FullScreen({ children }) {
  return <div style={{ minHeight: '100%', display: 'grid', placeItems: 'center' }}>{children}</div>;
}

function AccessDenied() {
  const { user, logout } = useAuth();
  return (
    <div className="login-wrap">
      <div className="login-card" style={{ textAlign: 'center' }}>
        <div className="brand-mark">D</div>
        <h2>Staff access only</h2>
        <p className="muted" style={{ marginTop: 10 }}>
          <strong>{user?.email}</strong> is not registered as a staff member, so this portal
          isn't available for this account.
        </p>
        <p className="muted small">
          Ask an administrator to add your email to the <code>staff</code> collection in Firebase.
        </p>
        <button className="btn btn-navy btn-block mt-3" onClick={logout}>
          Sign out
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const { user, staff, initializing } = useAuth();

  if (initializing) {
    return <FullScreen><p className="muted">Loading…</p></FullScreen>;
  }

  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  if (!staff) {
    return <AccessDenied />;
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/requests" element={<Requests />} />
        <Route path="/requests/:id" element={<RequestDetail />} />
        <Route path="/zones" element={<Zones />} />
        <Route path="/customers" element={<Customers />} />
        <Route path="*" element={<Navigate to="/requests" replace />} />
      </Route>
    </Routes>
  );
}
