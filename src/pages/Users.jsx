import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { userService } from '../services/api';
import { useTabRefresh } from '../hooks/useTabRefresh';
import './Users.css';

// ── Access areas ──────────────────────────────────────────────
// Each area either has stacked `levels` (each level includes the ones before
// it) and/or independent `extras`. Levels are stored as the same boolean
// columns as before — picking a level just sets those columns.
//
// `normalize` maps a user's raw columns to what they effectively grant, so a
// user with e.g. edit_store but not view_store still reads as "Edit" (the
// backend treats edit as implying view).
const AREAS = [
  {
    key: 'transactions',
    label: 'Transactions',
    fields: ['create_transactions', 'edit_transactions', 'move_transactions'],
    levels: [
      { label: 'None', on: [] },
      { label: 'Add', on: ['create_transactions'] },
      { label: 'Edit', on: ['create_transactions', 'edit_transactions'] },
      { label: 'Move', on: ['create_transactions', 'edit_transactions', 'move_transactions'] },
    ],
    extras: [{ field: 'delete_receipts', label: 'Can delete receipts', short: 'Delete receipts' }],
  },
  {
    key: 'imprests',
    label: 'Imprests',
    fields: ['view_all_imprests', 'create_imprests'],
    levels: [
      { label: 'Own only', on: [] },
      { label: 'View all', on: ['view_all_imprests'] },
      { label: 'Create', on: ['view_all_imprests', 'create_imprests'] },
    ],
  },
  {
    key: 'proposals',
    label: 'Proposals',
    fields: ['view_proposals', 'edit_proposal_status'],
    normalize: (v) => ({ ...v, view_proposals: v.view_proposals || v.edit_proposal_status }),
    levels: [
      { label: 'None', on: [] },
      { label: 'View', on: ['view_proposals'] },
      { label: 'Edit status', on: ['view_proposals', 'edit_proposal_status'] },
    ],
  },
  {
    key: 'supplier',
    label: 'Supplier invoices',
    fields: ['view_supplier_invoices', 'manage_supplier_invoices'],
    normalize: (v) => ({ ...v, view_supplier_invoices: v.view_supplier_invoices || v.manage_supplier_invoices }),
    levels: [
      { label: 'None', on: [] },
      { label: 'View', on: ['view_supplier_invoices'] },
      { label: 'Manage', on: ['view_supplier_invoices', 'manage_supplier_invoices'] },
    ],
  },
  {
    key: 'store',
    label: 'Store',
    fields: ['view_store', 'edit_store'],
    normalize: (v) => ({ ...v, view_store: v.view_store || v.edit_store }),
    levels: [
      { label: 'None', on: [] },
      { label: 'View', on: ['view_store'] },
      { label: 'Edit', on: ['view_store', 'edit_store'] },
    ],
  },
  {
    key: 'projects',
    label: 'Projects',
    extras: [
      { field: 'manage_projects', label: 'Manage', short: 'Manage projects' },
      { field: 'project_comments', label: 'Comments', short: 'Project comments' },
      { field: 'record_client_payments', label: 'Client payments', short: 'Client payments' },
    ],
  },
  {
    key: 'invoices',
    label: 'Invoices',
    extras: [{ field: 'create_invoices', label: 'Create invoices', short: 'Create invoices' }],
  },
  {
    key: 'payouts',
    label: 'Payouts',
    fields: ['payout', 'delete_saved_payouts'],
    // Deleting saved payouts only works together with payout.
    normalize: (v) => ({ ...v, delete_saved_payouts: v.payout && v.delete_saved_payouts }),
    levels: [
      { label: 'None', on: [] },
      { label: 'Pay out', on: ['payout'] },
      { label: '+ Delete saved', summary: 'Pay out + delete saved', on: ['payout', 'delete_saved_payouts'] },
    ],
    extras: [{ field: 'edit_contacts', label: 'Edit contacts', short: 'Edit contacts' }],
  },
];

const PERMISSION_FIELDS = AREAS.flatMap((a) => [
  ...(a.fields || []),
  ...(a.extras || []).map((e) => e.field),
]);

const pickPermissions = (u) =>
  Object.fromEntries(PERMISSION_FIELDS.map((f) => [f, u?.[f] === true]));

// Index of the level matching the user's effective columns, or -1 (custom).
const levelIndex = (area, perms) => {
  const v = area.normalize ? area.normalize(perms) : perms;
  return area.levels.findIndex((lvl) => area.fields.every((f) => !!v[f] === lvl.on.includes(f)));
};

// Short text pieces for the table's Access column.
const accessSummary = (u) => {
  const perms = pickPermissions(u);
  const parts = [];
  for (const area of AREAS) {
    if (area.levels) {
      const idx = levelIndex(area, perms);
      if (idx === -1) parts.push({ text: `${area.label}: Custom`, custom: true });
      else if (idx > 0) parts.push({ text: `${area.label}: ${area.levels[idx].summary || area.levels[idx].label}` });
    }
    for (const extra of area.extras || []) {
      if (perms[extra.field]) parts.push({ text: extra.short });
    }
  }
  return parts;
};

const Users = () => {
  const { user, isSuperAdmin } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Edit access panel
  const [editingUser, setEditingUser] = useState(null);
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    fetchUsers();
  }, [user]);

  useTabRefresh('/users', () => fetchUsers(true));

  const fetchUsers = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setError('');
      const response = await userService.getUsers(user.id);
      setUsers(response.data.response || []);
    } catch (err) {
      setError('Failed to load users.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSuperAdmin = async (targetUser, value) => {
    setUsers(prev => prev.map(u => u.id === targetUser.id ? { ...u, super_admin: value } : u));
    try {
      await userService.toggleSuperAdmin(targetUser.id, value);
    } catch (err) {
      console.error('Failed to update super admin:', err);
      setUsers(prev => prev.map(u => u.id === targetUser.id ? { ...u, super_admin: !value } : u));
    }
  };

  const openEditor = (u) => {
    setEditingUser(u);
    setDraft(pickPermissions(u));
    setSaveError('');
  };

  const closeEditor = () => {
    if (saving) return;
    setEditingUser(null);
    setDraft({});
    setSaveError('');
  };

  const setLevel = (area, level) => {
    setDraft(prev => {
      const next = { ...prev };
      for (const f of area.fields) next[f] = level.on.includes(f);
      return next;
    });
  };

  const setExtra = (field, value) => setDraft(prev => ({ ...prev, [field]: value }));

  const original = editingUser ? pickPermissions(editingUser) : {};
  const changed = PERMISSION_FIELDS.filter(f => draft[f] !== original[f]);

  const handleSave = async () => {
    if (!editingUser || changed.length === 0) return;
    setSaving(true);
    setSaveError('');
    try {
      const updates = Object.fromEntries(changed.map(f => [f, draft[f]]));
      await userService.updatePermissions(editingUser.id, updates);
      setUsers(prev => prev.map(u => u.id === editingUser.id ? { ...u, ...updates } : u));
      setEditingUser(null);
      setDraft({});
    } catch (err) {
      console.error('Failed to save permissions:', err);
      setSaveError(err.response?.data?.response || 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Loading...</p>
      </div>
    );
  }

  return (
      <div className="users-page">
        <div className="page-header">
          <div>
            <h1>User Management</h1>
            <p>View system users and manage their access</p>
          </div>
        </div>

        {error && <div className="error-banner">{error}</div>}

        <div className="users-container">
          {users.length === 0 ? (
            <div className="no-data">
              <p>No users found.</p>
            </div>
          ) : (
            <table className="users-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Role</th>
                  <th>
                    Super Admin
                    <span className="super-admin-hint"> — category management</span>
                  </th>
                  <th>Access</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const summary = accessSummary(u);
                  return (
                    <tr key={u.id}>
                      <td>
                        <div className="user-cell">
                          <div className="user-avatar">
                            {u.name?.charAt(0).toUpperCase()}
                          </div>
                          <span>{u.name}</span>
                        </div>
                      </td>
                      <td>{u.phone}</td>
                      <td>
                        <span className={`role-badge ${u.designation_tbl?.name?.toLowerCase()}`}>
                          {u.designation_tbl?.name || 'N/A'}
                        </span>
                      </td>
                      <td>
                        <label className="toggle-switch">
                          <input
                            type="checkbox"
                            checked={u.super_admin ?? false}
                            onChange={e => handleToggleSuperAdmin(u, e.target.checked)}
                            disabled={!isSuperAdmin()}
                          />
                          <span className="toggle-slider" />
                        </label>
                      </td>
                      <td className="access-cell">
                        {summary.length === 0 ? (
                          <span className="access-none">Basic access</span>
                        ) : (
                          <div className="access-chips">
                            {summary.map((p) => (
                              <span key={p.text} className={`access-chip ${p.custom ? 'custom' : ''}`}>{p.text}</span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td>
                        {isSuperAdmin() && (
                          <button className="edit-access-btn" onClick={() => openEditor(u)}>
                            Edit access
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Edit access panel ── */}
        {editingUser && <div className="access-panel-overlay" onClick={closeEditor} />}
        <div className={`access-panel ${editingUser ? 'open' : ''}`} role="dialog" aria-label="Edit access">
          {editingUser && (
            <>
              <div className="ap-header">
                <div>
                  <h3>Edit access</h3>
                  <span className="ap-sub">{editingUser.name}</span>
                </div>
                <button className="ap-close-btn" onClick={closeEditor} aria-label="Close">×</button>
              </div>

              <div className="ap-body">
                {AREAS.map((area) => {
                  const idx = area.levels ? levelIndex(area, draft) : null;
                  return (
                    <div key={area.key} className="ap-area">
                      <div className="ap-area-label">
                        {area.label}
                        {idx === -1 && <span className="ap-custom-tag" title="This user's switches don't match a level. Pick a level to replace them.">Custom</span>}
                      </div>
                      {area.levels && (
                        <div className="ap-levels" role="radiogroup" aria-label={area.label}>
                          {area.levels.map((lvl, i) => (
                            <button
                              key={lvl.label}
                              type="button"
                              role="radio"
                              aria-checked={idx === i}
                              className={`ap-level ${idx === i ? 'active' : ''}`}
                              onClick={() => setLevel(area, lvl)}
                            >
                              {lvl.label}
                            </button>
                          ))}
                        </div>
                      )}
                      {idx === -1 && (
                        <p className="ap-custom-note">
                          Currently on: {area.fields.filter(f => draft[f]).map(f => f.replace(/_/g, ' ')).join(', ') || 'none'}
                        </p>
                      )}
                      {area.extras && (
                        <div className="ap-extras">
                          {area.extras.map((extra) => (
                            <label key={extra.field} className="ap-extra">
                              <input
                                type="checkbox"
                                checked={draft[extra.field] ?? false}
                                onChange={e => setExtra(extra.field, e.target.checked)}
                              />
                              {extra.label}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="ap-footer">
                {saveError && <p className="ap-error">{saveError}</p>}
                <div className="ap-actions">
                  <button className="ap-cancel-btn" onClick={closeEditor} disabled={saving}>Cancel</button>
                  <button className="ap-save-btn" onClick={handleSave} disabled={saving || changed.length === 0}>
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
  );
};

export default Users;
