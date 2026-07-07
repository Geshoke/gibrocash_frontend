import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTabs, NAV_ITEMS } from '../context/TabsContext';
import logo from '../assets/logo.png';
import APP_VERSION from '../version';
import './Layout.css';

const PERMISSION_CHECKS = {
  invoice: (auth) => auth.canCreateInvoices(),
  payout: (auth) => auth.canPayout(),
  admin: (auth) => auth.isSuperAdmin(),
};

const TabBar = () => {
  const { tabs, activeTabId, activateTab, closeTab } = useTabs();

  if (tabs.length === 0) return null;

  return (
    <div className="tab-bar">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={`tab-item ${tab.id === activeTabId ? 'active' : ''}`}
          onClick={() => activateTab(tab.id)}
        >
          <span className="tab-icon">{tab.icon}</span>
          <span className="tab-label">{tab.label}</span>
          <button
            type="button"
            className="tab-close"
            onClick={(e) => {
              e.stopPropagation();
              closeTab(tab.id);
            }}
            aria-label={`Close ${tab.label}`}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
};

const Layout = ({ children }) => {
  const auth = useAuth();
  const { user, logout } = auth;
  const location = useLocation();

  const navItems = NAV_ITEMS.filter((item) => {
    if (!item.requires) return true;
    return PERMISSION_CHECKS[item.requires]?.(auth);
  });

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <img src={logo} alt="Gibro Enterprise Ltd" className="sidebar-logo" />
        </div>

        <nav className="sidebar-nav">
          {navItems
            .filter((item) => item.path !== '/settings')
            .map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
              >
                <span className="nav-icon">{item.icon}</span>
                <span className="nav-label">{item.label}</span>
              </Link>
            ))}
        </nav>

        <Link
          to="/settings"
          className={`nav-item settings-nav-item ${location.pathname === '/settings' ? 'active' : ''}`}
        >
          <span className="nav-icon">⚙️</span>
          <span className="nav-label">Settings</span>
        </Link>

        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar">{user?.name?.charAt(0).toUpperCase()}</div>
            <div className="user-details">
              <span className="user-name">{user?.name}</span>
              <span className="user-role">{user?.designation}</span>
            </div>
          </div>
          <button onClick={logout} className="logout-button">
            Logout
          </button>
          <span className="app-version">v{APP_VERSION}</span>
        </div>
      </aside>

      <main className="main-content">
        <TabBar />
        <div className="tab-content">
          {children}
        </div>
      </main>
    </div>
  );
};

export default Layout;
