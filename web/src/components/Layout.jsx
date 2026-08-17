import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';

import { useAuth } from '../context/AuthContext';

export default function Layout() {
  const { user, logout, hasRole } = useAuth();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h1>PO/Inventory Sync</h1>
        <nav>
          <NavLink to="/" end>
            Dashboard
          </NavLink>
          <NavLink to="/import-jobs">Imports</NavLink>
          <NavLink to="/upload">Upload File</NavLink>
          <NavLink to="/scan">Scan Document</NavLink>
          <NavLink to="/suppliers">Suppliers</NavLink>
          {hasRole('MANAGER') && <NavLink to="/products">Products</NavLink>}
          {hasRole('OWNER') && <NavLink to="/pos-connections">POS Connections</NavLink>}
        </nav>
        <div className="user-info">
          {user?.name} · {user?.role}
          <div style={{ marginTop: 8 }}>
            <button className="btn small sidebar-logout" onClick={logout}>
              Log out
            </button>
          </div>
        </div>
      </aside>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
