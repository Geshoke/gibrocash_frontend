import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { TabsProvider, useTabs } from './context/TabsContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Imprests from './pages/Imprests';
import Transactions from './pages/Transactions';
import Proposals from './pages/Proposals';
import Projects from './pages/Projects';
import Payouts from './pages/Payouts';
import Users from './pages/Users';
import Settings from './pages/Settings';
import Invoices from './pages/Invoices';
import InvoiceForm from './pages/InvoiceForm';
import InvoiceView from './pages/InvoiceView';
import './App.css';

const routeElements = [
  { path: '/dashboard', element: <ProtectedRoute><Dashboard /></ProtectedRoute> },
  { path: '/imprests', element: <ProtectedRoute><Imprests /></ProtectedRoute> },
  { path: '/transactions', element: <ProtectedRoute><Transactions /></ProtectedRoute> },
  { path: '/proposals', element: <ProtectedRoute><Proposals /></ProtectedRoute> },
  { path: '/projects', element: <ProtectedRoute><Projects /></ProtectedRoute> },
  { path: '/payouts', element: <ProtectedRoute require="payout"><Payouts /></ProtectedRoute> },
  { path: '/users', element: <ProtectedRoute require="admin"><Users /></ProtectedRoute> },
  { path: '/settings', element: <ProtectedRoute><Settings /></ProtectedRoute> },
  { path: '/invoices', element: <ProtectedRoute require="invoice"><Invoices /></ProtectedRoute> },
  { path: '/invoices/new', element: <ProtectedRoute require="invoice"><InvoiceForm /></ProtectedRoute> },
  { path: '/invoices/:id/edit', element: <ProtectedRoute require="invoice"><InvoiceForm /></ProtectedRoute> },
  { path: '/invoices/:id', element: <ProtectedRoute require="invoice"><InvoiceView /></ProtectedRoute> },
];

const TabsHost = () => {
  const { tabs, activeTabId } = useTabs();

  return (
    <>
      {tabs.map((tab) => (
        <div key={tab.id} style={{ display: tab.id === activeTabId ? 'contents' : 'none' }}>
          <Routes location={{ pathname: tab.path }}>
            {routeElements.map((route) => (
              <Route key={route.path} path={route.path} element={route.element} />
            ))}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </div>
      ))}
    </>
  );
};

const AuthenticatedShell = () => (
  <TabsProvider>
    <Layout>
      <TabsHost />
    </Layout>
  </TabsProvider>
);

function App() {
  return (
    <ThemeProvider>
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/*" element={<AuthenticatedShell />} />
        </Routes>
      </Router>
    </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
