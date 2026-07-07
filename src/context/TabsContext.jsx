import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

const TabsContext = createContext(null);

export const useTabs = () => {
  const context = useContext(TabsContext);
  if (!context) {
    throw new Error('useTabs must be used within a TabsProvider');
  }
  return context;
};

export const NAV_ITEMS = [
  { path: '/dashboard', label: 'Dashboard', icon: '📊' },
  { path: '/projects', label: 'Projects', icon: '🗂️' },
  { path: '/imprests', label: 'Imprests', icon: '💰' },
  { path: '/transactions', label: 'Transactions', icon: '📝' },
  { path: '/proposals', label: 'Proposals', icon: '📋' },
  { path: '/invoices', label: 'Invoices', icon: '🧾', requires: 'invoice' },
  { path: '/payouts', label: 'Payouts', icon: '💸', requires: 'payout' },
  { path: '/users', label: 'Users', icon: '👥', requires: 'admin' },
  { path: '/settings', label: 'Settings', icon: '⚙️' },
];

const FALLBACK_PATH = '/dashboard';

const deriveSubLabel = (pathname, parent) => {
  if (pathname === '/invoices/new') return 'New Invoice';
  if (/^\/invoices\/[^/]+\/edit$/.test(pathname)) return 'Edit Invoice';
  const invoiceMatch = pathname.match(/^\/invoices\/([^/]+)$/);
  if (invoiceMatch) return `Invoice #${invoiceMatch[1]}`;
  return parent?.label ?? pathname;
};

const resolveTab = (pathname) => {
  const exact = NAV_ITEMS.find((item) => item.path === pathname);
  if (exact) {
    return { id: exact.path, path: exact.path, label: exact.label, icon: exact.icon };
  }

  const parent = NAV_ITEMS.find((item) => pathname.startsWith(`${item.path}/`));
  return {
    id: pathname,
    path: pathname,
    label: deriveSubLabel(pathname, parent),
    icon: parent?.icon ?? '📄',
  };
};

export const TabsProvider = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [tabs, setTabs] = useState([]);
  const [activeTabId, setActiveTabId] = useState(null);

  useEffect(() => {
    const pathname = location.pathname;
    const tab = resolveTab(pathname);

    setTabs((prev) => {
      if (prev.some((t) => t.id === tab.id)) return prev;
      return [...prev, tab];
    });
    setActiveTabId(tab.id);
  }, [location.pathname]);

  useEffect(() => {
    if (!isAuthenticated) {
      setTabs([]);
      setActiveTabId(null);
    }
  }, [isAuthenticated]);

  const activateTab = useCallback((id) => {
    const tab = tabs.find((t) => t.id === id);
    if (!tab) return;
    setActiveTabId(id);
    navigate(tab.path);
  }, [tabs, navigate]);

  const closeTab = useCallback((id) => {
    setTabs((prev) => {
      const index = prev.findIndex((t) => t.id === id);
      if (index === -1) return prev;

      const next = prev.filter((t) => t.id !== id);

      if (activeTabId === id) {
        const fallback = next[index - 1] || next[index] || null;
        if (fallback) {
          setActiveTabId(fallback.id);
          navigate(fallback.path);
        } else {
          navigate(FALLBACK_PATH);
        }
      }

      return next;
    });
  }, [activeTabId, navigate]);

  const value = {
    tabs,
    activeTabId,
    activateTab,
    closeTab,
  };

  return (
    <TabsContext.Provider value={value}>
      {children}
    </TabsContext.Provider>
  );
};
