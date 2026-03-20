import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { categoryService } from '../services/api';
import Layout from '../components/Layout';
import './Settings.css';

const SECTIONS = [
  { key: 'appearance', label: 'Appearance', icon: '🎨' },
  { key: 'categories', label: 'Categories', icon: '🏷️' },
];

const Settings = () => {
  const { isSuperAdmin } = useAuth();
  const { dark, toggleTheme } = useTheme();
  const [activeSection, setActiveSection] = useState('appearance');

  const [categories, setCategories] = useState([]);
  const [loadingCats, setLoadingCats] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [categoryError, setCategoryError] = useState('');
  const [savingCategory, setSavingCategory] = useState(false);

  useEffect(() => {
    if (activeSection === 'categories') {
      fetchCategories();
    }
  }, [activeSection]);

  const fetchCategories = async () => {
    setLoadingCats(true);
    try {
      const response = await categoryService.getAll();
      setCategories(response.data.categories || []);
    } catch (err) {
      console.error('Failed to load categories:', err);
    } finally {
      setLoadingCats(false);
    }
  };

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) return;
    setSavingCategory(true);
    setCategoryError('');
    try {
      const response = await categoryService.create(newCategoryName.trim());
      setCategories(prev => [...prev, response.data.category]);
      setNewCategoryName('');
    } catch (err) {
      setCategoryError(err.response?.data?.message || 'Failed to create category');
    } finally {
      setSavingCategory(false);
    }
  };

  const handleDeleteCategory = async (catId) => {
    setCategoryError('');
    try {
      await categoryService.delete(catId);
      setCategories(prev => prev.filter(c => c.id !== catId));
    } catch (err) {
      setCategoryError(err.response?.data?.message || 'Cannot delete: category is in use');
    }
  };

  return (
    <Layout>
      <div className="settings-page">
        <div className="settings-page-header">
          <h1>Settings</h1>
          <p>Manage your application preferences</p>
        </div>

        <div className="settings-body">
          {/* Left nav */}
          <nav className="settings-nav">
            {SECTIONS.map(s => (
              <button
                key={s.key}
                className={`settings-nav-item ${activeSection === s.key ? 'active' : ''}`}
                onClick={() => setActiveSection(s.key)}
              >
                <span className="settings-nav-icon">{s.icon}</span>
                {s.label}
              </button>
            ))}
          </nav>

          {/* Right content */}
          <div className="settings-content">

            {activeSection === 'appearance' && (
              <section className="settings-section">
                <h2 className="settings-section-title">Appearance</h2>
                <div className="settings-card">
                  <div className="settings-row">
                    <div>
                      <div className="settings-row-label">Theme</div>
                      <div className="settings-row-hint">
                        {dark ? 'Currently using dark mode' : 'Currently using light mode'}
                      </div>
                    </div>
                    <button className="theme-toggle-pill" onClick={toggleTheme}>
                      {dark ? '☀️ Light Mode' : '🌙 Dark Mode'}
                    </button>
                  </div>
                </div>
              </section>
            )}

            {activeSection === 'categories' && (
              <section className="settings-section">
                <h2 className="settings-section-title">Transaction Categories</h2>
                <p className="settings-section-desc">
                  Categories are shared across all transactions. A category cannot be removed while it is assigned to a transaction.
                </p>

                {isSuperAdmin() ? (
                  <div className="settings-card">
                    <div className="cat-add-row">
                      <input
                        className="cat-input"
                        type="text"
                        value={newCategoryName}
                        onChange={e => setNewCategoryName(e.target.value)}
                        placeholder="New category name, e.g. Fuel"
                        onKeyDown={e => e.key === 'Enter' && handleCreateCategory()}
                      />
                      <button
                        className="cat-add-btn"
                        onClick={handleCreateCategory}
                        disabled={savingCategory || !newCategoryName.trim()}
                      >
                        {savingCategory ? 'Adding...' : 'Add Category'}
                      </button>
                    </div>
                    {categoryError && <p className="cat-error">{categoryError}</p>}
                  </div>
                ) : (
                  <div className="cat-locked-notice">
                    🔒 Only super admins can add or remove categories.
                  </div>
                )}

                <div className="settings-card">
                  {loadingCats ? (
                    <p className="cat-loading">Loading...</p>
                  ) : categories.length === 0 ? (
                    <p className="cat-empty">No categories yet.</p>
                  ) : (
                    <ul className="cat-list">
                      {categories.map(cat => (
                        <li key={cat.id} className="cat-item">
                          <span className="cat-name">{cat.cat_name}</span>
                          {isSuperAdmin() && (
                            <button
                              className="cat-remove-btn"
                              onClick={() => handleDeleteCategory(cat.id)}
                            >
                              Remove
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            )}

          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Settings;
