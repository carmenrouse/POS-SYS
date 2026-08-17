import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import RegisterBusinessPage from './pages/RegisterBusinessPage';
import DashboardPage from './pages/DashboardPage';
import SuppliersPage from './pages/SuppliersPage';
import SupplierDetailPage from './pages/SupplierDetailPage';
import ProductsPage from './pages/ProductsPage';
import POSConnectionsPage from './pages/POSConnectionsPage';
import ImportJobsPage from './pages/ImportJobsPage';
import UploadPage from './pages/UploadPage';
import ScanUploadPage from './pages/ScanUploadPage';
import ImportReviewPage from './pages/ImportReviewPage';

function RequireAuth({ children }) {
  const { user, booting } = useAuth();
  if (booting) return null;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterBusinessPage />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<DashboardPage />} />
        <Route path="/import-jobs" element={<ImportJobsPage />} />
        <Route path="/import-jobs/:id" element={<ImportReviewPage />} />
        <Route path="/upload" element={<UploadPage />} />
        <Route path="/scan" element={<ScanUploadPage />} />
        <Route path="/suppliers" element={<SuppliersPage />} />
        <Route path="/suppliers/:id" element={<SupplierDetailPage />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/pos-connections" element={<POSConnectionsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
