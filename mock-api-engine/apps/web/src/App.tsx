import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { DashboardLayout } from './components/layout/DashboardLayout';
import { EndpointsPage } from './pages/EndpointsPage';
import { LogsPage } from './pages/LogsPage';
import { ApiGatewayDashboard } from './components/ApiGatewayDashboard';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<DashboardLayout />}>
          <Route index element={<Navigate to="/endpoints" replace />} />
          <Route path="/endpoints" element={<EndpointsPage />} />
          <Route path="/logs" element={<LogsPage />} />
          
          {/* Add the Gateway route here */}
          <Route path="/gateway" element={<ApiGatewayDashboard />} />
          
          <Route path="*" element={<Navigate to="/endpoints" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}