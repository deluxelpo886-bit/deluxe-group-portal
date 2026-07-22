import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

const NAV = [
  { to: '/requests', label: 'Requests', icon: '📋' },
  { to: '/zones', label: 'Zones', icon: '🗺️' },
  { to: '/customers', label: 'Customers', icon: '👥' },
];

export default function Layout() {
  const { staff, user, logout } = useAuth();
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="logo">
          <div className="logo-mark">D</div>
          <div>
            <div style={{ fontWeight: 800, color: '#fff' }}>Deluxe Admin</div>
            <div style={{ fontSize: 11, color: '#9fb0bf' }}>Staff Portal</div>
          </div>
        </div>
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}
          >
            <span>{n.icon}</span>
            <span>{n.label}</span>
          </NavLink>
        ))}
        <div className="sidebar-foot">
          <div style={{ color: '#cdd7e0', fontWeight: 700 }}>
            {staff?.name || user?.email}
          </div>
          <div>{staff?.role || 'staff'}</div>
          <button className="btn btn-sm mt-2 btn-block" onClick={logout}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
