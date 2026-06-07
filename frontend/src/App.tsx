import { BrowserRouter, Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import ProxyUrls from './pages/ProxyUrls';
import Proxies from './pages/Proxies';
import Rulesets from './pages/Rulesets';

const navItems = [
  { path: '/', label: '总览' },
  { path: '/proxy-urls', label: '订阅管理' },
  { path: '/proxies', label: '代理节点' },
  { path: '/rulesets', label: '规则集' },
];

function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <nav
        style={{
          width: 200,
          background: '#1a1a2e',
          color: '#e0e0e0',
          padding: '1rem',
          flexShrink: 0,
        }}
      >
        <h2 style={{ fontSize: '1.1rem', marginBottom: '1.5rem' }}>Mihomo Config</h2>
        {navItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            style={{
              display: 'block',
              padding: '0.5rem 0.75rem',
              color: location.pathname === item.path ? '#fff' : '#999',
              background: location.pathname === item.path ? '#16213e' : 'transparent',
              borderRadius: 6,
              textDecoration: 'none',
              marginBottom: '0.25rem',
            }}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <main style={{ flex: 1, padding: '2rem' }}>{children}</main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/admin/*"
          element={
            <Layout>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/proxy-urls" element={<ProxyUrls />} />
                <Route path="/proxies" element={<Proxies />} />
                <Route path="/rulesets" element={<Rulesets />} />
              </Routes>
            </Layout>
          }
        />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
