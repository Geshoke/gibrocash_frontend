import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { userService } from '../services/api';
import { useTabRefresh } from '../hooks/useTabRefresh';
import './Users.css';

// ── Permission groups ─────────────────────────────────────────
// Each switch is a boolean column on the user, saved through its own
// userService toggle. To add a permission later, add one line to its group
// (or a new group). `impliedBy` (one field or a list) shows the switch as on
// and locked while any of those stronger permissions is on (the backend
// treats it as implied).
const PERMISSION_GROUPS = [
  {
    label: 'Imprests',
    perms: [
      { field: 'view_all_imprests', label: 'View all', save: userService.toggleViewAllImprests },
      { field: 'create_imprests', label: 'Create', save: userService.toggleCreateImprests },
    ],
  },
  {
    label: 'Transactions',
    perms: [
      { field: 'create_transactions', label: 'Add', save: userService.toggleCreateTransactions },
      { field: 'edit_transactions', label: 'Edit', save: userService.toggleEditTransactions },
      { field: 'move_transactions', label: 'Move', save: userService.toggleMoveTransactions },
      { field: 'delete_receipts', label: 'Delete receipts', save: userService.toggleDeleteReceipts },
    ],
  },
  {
    label: 'Payouts',
    perms: [
      { field: 'payout', label: 'Payout', save: userService.togglePayout },
      { field: 'delete_saved_payouts', label: 'Delete saved', save: userService.toggleDeleteSavedPayouts },
    ],
  },
  {
    label: 'Contact list',
    perms: [
      { field: 'edit_contacts', label: 'Edit', save: userService.toggleEditContacts },
    ],
  },
  {
    label: 'Projects',
    perms: [
      { field: 'manage_projects', label: 'Manage', save: userService.toggleManageProjects },
      { field: 'project_comments', label: 'Comments', save: userService.toggleProjectComments },
    ],
  },
  {
    label: 'Client payments',
    perms: [
      { field: 'view_client_payments', label: 'View', save: userService.toggleViewClientPayments, impliedBy: ['record_client_payments', 'delete_client_payments'] },
      { field: 'record_client_payments', label: 'Add', save: userService.toggleRecordClientPayments },
      { field: 'delete_client_payments', label: 'Delete', save: userService.toggleDeleteClientPayments },
    ],
  },
  {
    label: 'Invoices',
    perms: [
      { field: 'create_invoices', label: 'Create', save: userService.toggleCreateInvoices },
    ],
  },
  {
    label: 'Supplier invoices',
    perms: [
      { field: 'view_supplier_invoices', label: 'View', save: userService.toggleViewSupplierInvoices, impliedBy: 'manage_supplier_invoices' },
      { field: 'manage_supplier_invoices', label: 'Manage', save: userService.toggleManageSupplierInvoices },
    ],
  },
  {
    label: 'Store',
    perms: [
      { field: 'view_store', label: 'View', save: userService.toggleViewStore },
      { field: 'edit_store', label: 'Edit', save: userService.toggleEditStore },
    ],
  },
  {
    label: 'Proposals',
    perms: [
      { field: 'view_proposals', label: 'View', save: userService.toggleViewProposals, impliedBy: 'edit_proposal_status' },
      { field: 'edit_proposal_status', label: 'Edit status', save: userService.toggleEditProposalStatus },
    ],
  },
];

const labelFor = (field) => {
  for (const g of PERMISSION_GROUPS) {
    const p = g.perms.find(x => x.field === field);
    if (p) return `${g.label}: ${p.label}`;
  }
  return field;
};

const Users = () => {
  const { user, isSuperAdmin } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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

  // Flip the switch straight away, save it, and flip it back if saving fails.
  const toggle = async (targetUser, field, save, value) => {
    setUsers(prev => prev.map(u => u.id === targetUser.id ? { ...u, [field]: value } : u));
    try {
      await save(targetUser.id, value);
    } catch (err) {
      console.error(`Failed to update ${field}:`, err);
      setUsers(prev => prev.map(u => u.id === targetUser.id ? { ...u, [field]: !value } : u));
      setError(`Couldn't save "${labelFor(field)}" for ${targetUser.name}. Please try again.`);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleDateString('en-KE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Loading...</p>
      </div>
    );
  }

  const canEdit = isSuperAdmin();

  return (
      <div className="users-page">
        <div className="page-header">
          <div>
            <h1>User Management</h1>
            <p>View system users and their roles</p>
          </div>
        </div>

        {error && <div className="error-banner">{error}</div>}

        <div className="users-container">
          {users.length === 0 ? (
            <div className="no-data">
              <p>No users found.</p>
            </div>
          ) : (
            <table className="users-table grouped">
              <thead>
                <tr className="group-row">
                  <th className="group-spacer sticky-col" />
                  <th colSpan={4} className="group-spacer" />
                  {PERMISSION_GROUPS.map(g => (
                    <th key={g.label} colSpan={g.perms.length} className="group-head group-start">
                      {g.label}
                    </th>
                  ))}
                </tr>
                <tr>
                  <th className="sticky-col">Name</th>
                  <th>Phone</th>
                  <th>Role</th>
                  <th>Created</th>
                  <th>
                    Super Admin
                    <span className="super-admin-hint"> — category management</span>
                  </th>
                  {PERMISSION_GROUPS.map(g => g.perms.map((p, i) => (
                    <th key={p.field} className={i === 0 ? 'group-start' : undefined}>{p.label}</th>
                  )))}
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="sticky-col">
                      <div className="user-cell">
                        <div className="user-avatar">
                          {u.name?.charAt(0).toUpperCase()}
                        </div>
                        <span>{u.name}</span>
                      </div>
                    </td>
                    <td>{u.phone}</td>
                    <td>
                      <span className={`role-badge ${u.designation?.name?.toLowerCase()}`}>
                        {u.designation?.name || 'N/A'}
                      </span>
                    </td>
                    <td>{formatDate(u.createdAt)}</td>
                    <td>
                      <label className="toggle-switch">
                        <input
                          type="checkbox"
                          checked={u.super_admin ?? false}
                          onChange={e => toggle(u, 'super_admin', userService.toggleSuperAdmin, e.target.checked)}
                          disabled={!canEdit}
                        />
                        <span className="toggle-slider" />
                      </label>
                    </td>
                    {PERMISSION_GROUPS.map(g => g.perms.map((p, i) => {
                      const impliedField = [].concat(p.impliedBy || []).find(f => u[f]);
                      const implied = Boolean(impliedField);
                      return (
                        <td key={p.field} className={i === 0 ? 'group-start' : undefined}>
                          <label className="toggle-switch" title={`${g.label}: ${p.label}`}>
                            <input
                              type="checkbox"
                              checked={Boolean(u[p.field] || implied)}
                              onChange={e => toggle(u, p.field, p.save, e.target.checked)}
                              disabled={!canEdit || implied}
                              title={implied ? `Implied by ${labelFor(impliedField)}` : undefined}
                            />
                            <span className="toggle-slider" />
                          </label>
                        </td>
                      );
                    }))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
  );
};

export default Users;
