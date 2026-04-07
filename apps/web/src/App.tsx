import { Routes, Route, Navigate } from 'react-router-dom';

// Pages (create these as you go)
// import LoginPage from '@/pages/LoginPage';
// import DashboardPage from '@/pages/DashboardPage';

function App() {
  return (
    <div className="min-vh-100 bg-light">
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        {/* <Route path="/login" element={<LoginPage />} /> */}
        {/* <Route path="/dashboard" element={<DashboardPage />} /> */}
        <Route
          path="*"
          element={
            <div className="container py-5 text-center">
              <h1 className="display-4 text-primary">STAP Security</h1>
              <p className="lead text-muted">Web Management Platform</p>
              <span className="badge bg-success fs-6">Setup Complete ✓</span>
            </div>
          }
        />
      </Routes>
    </div>
  );
}

export default App;