import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { DashboardLayout } from './components/layout/DashboardLayout';
import { EndpointsPage } from './pages/EndpointsPage';
import { LogsPage } from './pages/LogsPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<DashboardLayout />}>
          <Route index element={<Navigate to="/endpoints" replace />} />
          <Route path="/endpoints" element={<EndpointsPage />} />
          <Route path="/logs" element={<LogsPage />} />
          <Route path="*" element={<Navigate to="/endpoints" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
