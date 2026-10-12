import { useEffect, useState } from 'react';
import { userService, proposalService, projectService } from '../services/api';

const SOURCES = [
  { value: 'company imprest',   label: 'Company Imprest' },
  { value: 'directors advance', label: 'Directors Advance' },
  { value: 'loan',              label: 'Loan' },
];

// Only proposals that were (at least partly) approved can sensibly fund an imprest.
const LINKABLE_STATUSES = 'approved,partial';

const fmtCur = (n) =>
  new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(n || 0);

/**
 * Create an imprest under `project`. Requires the create_imprests permission
 * (the backend enforces it; the caller only decides whether to show the button).
 */
const CreateImprestModal = ({ project, currentUserId, onClose, onCreated }) => {
  const [form, setForm] = useState({ name: '', amount: '', source: 'company imprest', proposalId: '' });
  const [assigneeIds, setAssigneeIds] = useState([]);
  const [userSearch, setUserSearch] = useState('');
  const [users, setUsers] = useState([]);
  const [proposals, setProposals] = useState([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      userService.getUsers(currentUserId),
      proposalService.getAll({ project_id: project.id, status: LINKABLE_STATUSES, limit: 100 }),
    ]).then(([u, p]) => {
      if (cancelled) return;
      if (u.status === 'fulfilled') {
        setUsers((u.value.data.response || [])
          .map(x => ({ id: x.id, name: x.name, phone: x.phone }))
          .sort((a, b) => a.name.localeCompare(b.name)));
      } else {
        setError('Could not load users. Close and try again.');
      }
      if (p.status === 'fulfilled') setProposals(p.value.data.proposals || []);
      setLoadingOptions(false);
    });
    return () => { cancelled = true; };
  }, [project.id, currentUserId]);

  const toggleAssignee = (id) =>
    setAssigneeIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));

  const q = userSearch.trim().toLowerCase();
  const shownUsers = q ? users.filter(u => u.name.toLowerCase().includes(q) || (u.phone || '').includes(q)) : users;
  const selectedUsers = users.filter(u => assigneeIds.includes(u.id));

  const submit = async () => {
    const name = form.name.trim();
    const amount = parseFloat(form.amount);
    if (!name) { setError('Imprest name is required.'); return; }
    if (name.toLowerCase() === 'expenses') { setError('"Expenses" is reserved for the project expense account.'); return; }
    if (!(amount > 0)) { setError('Enter an amount greater than zero.'); return; }
    if (assigneeIds.length === 0) { setError('Assign at least one user.'); return; }

    setSaving(true);
    setError('');
    try {
      const { data } = await projectService.createImprest(project.id, {
        name,
        amount,
        source: form.source,
        assigneeIds,
        proposalId: form.proposalId || null,
      });
      onCreated(data.imprest);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create imprest.');
      setSaving(false);
    }
  };

  const close = () => { if (!saving) onClose(); };

  return (
    <div className="modal-overlay" onClick={close}>
      <div className="modal-box ci-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>New Imprest</h3>
          <button className="modal-close-btn" onClick={close} disabled={saving}>×</button>
        </div>
        <p className="modal-sub">Project: <strong>{project.name}</strong></p>

        <div className="modal-form">
          <div className="modal-field">
            <label>Name</label>
            <input
              type="text"
              value={form.name}
              maxLength={255}
              autoFocus
              placeholder="e.g. Borehole drilling — Phase 1"
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            />
          </div>

          <div className="ci-row">
            <div className="modal-field">
              <label>Allocated Amount (KES)</label>
              <input
                type="number" min="0" step="0.01" placeholder="0.00"
                value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              />
            </div>
            <div className="modal-field">
              <label>Source</label>
              <select value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))}>
                {SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>

          <div className="modal-field">
            <label>Assign To {assigneeIds.length > 0 && <span className="ci-count">({assigneeIds.length} selected)</span>}</label>
            {selectedUsers.length > 0 && (
              <div className="ci-chips">
                {selectedUsers.map(u => (
                  <button key={u.id} type="button" className="ci-chip" onClick={() => toggleAssignee(u.id)} title="Remove">
                    {u.name} ×
                  </button>
                ))}
              </div>
            )}
            <input
              type="text"
              placeholder="Search users by name or phone…"
              value={userSearch}
              onChange={e => setUserSearch(e.target.value)}
              disabled={loadingOptions}
            />
            <div className="ci-user-list">
              {loadingOptions ? (
                <p className="ci-muted">Loading users…</p>
              ) : shownUsers.length === 0 ? (
                <p className="ci-muted">No users match.</p>
              ) : shownUsers.map(u => (
                <label key={u.id} className="ci-user">
                  <input type="checkbox" checked={assigneeIds.includes(u.id)} onChange={() => toggleAssignee(u.id)} />
                  <span className="ci-user-name">{u.name}</span>
                  <span className="ci-user-phone">{u.phone}</span>
                </label>
              ))}
            </div>
            <p className="ci-muted">Each assignee with a valid phone number gets an SMS.</p>
          </div>

          <div className="modal-field">
            <label>Linked Proposal <span className="ci-muted">(optional)</span></label>
            <select
              value={form.proposalId}
              onChange={e => setForm(f => ({ ...f, proposalId: e.target.value }))}
              disabled={loadingOptions}
            >
              <option value="">— None —</option>
              {proposals.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} · {fmtCur(p.total)} · {p.status}
                </option>
              ))}
            </select>
            {!loadingOptions && proposals.length === 0 && (
              <p className="ci-muted">No approved proposals in this project.</p>
            )}
          </div>

          {error && <p className="modal-error">{error}</p>}
        </div>

        <div className="modal-footer">
          <button className="modal-cancel-btn" onClick={close} disabled={saving}>Cancel</button>
          <button className="modal-save-btn" onClick={submit} disabled={saving || loadingOptions}>
            {saving ? 'Creating…' : 'Create Imprest'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateImprestModal;
