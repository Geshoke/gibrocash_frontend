import { useState, useEffect, useRef } from 'react';
import { supplierInvoiceService, proposalService, imageService } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useTabRefresh } from '../hooks/useTabRefresh';
import './SupplierInvoices.css';

const PAGE_LIMIT = 10;

const emptyForm = { id: null, proposal_id: '', supplier_name: '', amount: '', invoice_number: '', notes: '', file: null };

const SupplierInvoices = () => {
  const { user, canManageSupplierInvoices } = useAuth();
  const canManage = canManageSupplierInvoices();

  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({ status: '', search: '', dateFrom: '', dateTo: '' });
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const [proposals, setProposals] = useState([]);
  const [proposalsLoaded, setProposalsLoaded] = useState(false);
  const [proposalSearch, setProposalSearch] = useState('');
  const [proposalDropdownOpen, setProposalDropdownOpen] = useState(false);
  const proposalPickerRef = useRef(null);

  const [modalMode, setModalMode] = useState(null); // null | 'create' | 'edit'
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onClickOutside = (e) => {
      if (proposalPickerRef.current && !proposalPickerRef.current.contains(e.target)) {
        setProposalDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  useEffect(() => {
    fetchInvoices(1, filters);
  }, [filters]);

  useTabRefresh('/supplier-invoices', () => fetchInvoices(page, filters, true));

  const fetchInvoices = async (targetPage, filterState, silent = false) => {
    try {
      if (!silent) setLoading(true);
      setError('');
      const params = { page: targetPage, limit: PAGE_LIMIT };
      if (filterState.status) params.status = filterState.status;
      if (filterState.search) params.supplier_name = filterState.search;
      if (filterState.dateFrom) params.dateFrom = filterState.dateFrom;
      if (filterState.dateTo) params.dateTo = filterState.dateTo;

      const res = await supplierInvoiceService.getAll(params);
      setInvoices(res.data.supplierInvoices || []);
      setTotal(res.data.total || 0);
      setPage(targetPage);
    } catch (err) {
      setError('Failed to load supplier invoices.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadProposals = async () => {
    if (proposalsLoaded) return;
    try {
      const limit = 100;
      let page = 1;
      let all = [];
      let total = Infinity;
      while (all.length < total) {
        const res = await proposalService.getAll({ page, limit });
        const rows = res.data.proposals || [];
        total = res.data.total ?? rows.length;
        all = all.concat(rows);
        if (rows.length < limit) break;
        page += 1;
      }
      setProposals(all);
      setProposalsLoaded(true);
    } catch (err) {
      console.error('Failed to load proposals:', err);
    }
  };

  const openCreateModal = () => {
    setForm(emptyForm);
    setFormError('');
    setProposalSearch('');
    setProposalDropdownOpen(false);
    setModalMode('create');
    loadProposals();
  };

  const proposalLabel = (p) => `${p.name}${p.project?.name ? ` — ${p.project.name}` : ''}`;

  const proposalStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'approved': return 'approved';
      case 'rejected': return 'rejected';
      case 'partial': return 'partial';
      default: return 'pending';
    }
  };

  const filteredProposals = proposals.filter((p) => {
    const q = proposalSearch.trim().toLowerCase();
    if (!q) return true;
    return p.name.toLowerCase().includes(q) || (p.project?.name || '').toLowerCase().includes(q);
  });

  const selectProposal = (p) => {
    setForm((f) => ({ ...f, proposal_id: p.id }));
    setProposalSearch(proposalLabel(p));
    setProposalDropdownOpen(false);
  };

  const handleProposalSearchChange = (e) => {
    setProposalSearch(e.target.value);
    setForm((f) => ({ ...f, proposal_id: '' }));
    setProposalDropdownOpen(true);
  };

  const openEditModal = (inv) => {
    setForm({
      id: inv.id,
      proposal_id: inv.proposal_id,
      supplier_name: inv.supplier_name,
      amount: inv.amount,
      invoice_number: inv.invoice_number || '',
      notes: inv.notes || '',
      file: null,
    });
    setFormError('');
    setModalMode('edit');
  };

  const closeModal = () => {
    setModalMode(null);
    setForm(emptyForm);
    setFormError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!form.supplier_name || !form.amount) {
      setFormError('Supplier name and amount are required.');
      return;
    }
    if (modalMode === 'create' && (!form.proposal_id || !form.file)) {
      setFormError('Proposal and an attachment file are required.');
      return;
    }

    setSaving(true);
    try {
      if (modalMode === 'create') {
        const fd = new FormData();
        fd.append('proposal_id', form.proposal_id);
        fd.append('supplier_name', form.supplier_name);
        fd.append('amount', form.amount);
        fd.append('invoice_number', form.invoice_number);
        fd.append('notes', form.notes);
        fd.append('createdBy', user.id);
        fd.append('file', form.file);
        await supplierInvoiceService.create(fd);
      } else {
        await supplierInvoiceService.update(form.id, {
          supplier_name: form.supplier_name,
          amount: form.amount,
          invoice_number: form.invoice_number,
          notes: form.notes,
        });
      }
      closeModal();
      fetchInvoices(modalMode === 'create' ? 1 : page, filters, true);
    } catch (err) {
      setFormError(err.response?.data?.response || 'Failed to save supplier invoice.');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (inv) => {
    const nextStatus = inv.status === 'paid' ? 'unpaid' : 'paid';
    setInvoices(prev => prev.map(i => i.id === inv.id ? { ...i, status: nextStatus } : i));
    try {
      await supplierInvoiceService.updateStatus(inv.id, nextStatus);
    } catch (err) {
      console.error('Failed to update status:', err);
      setInvoices(prev => prev.map(i => i.id === inv.id ? { ...i, status: inv.status } : i));
    }
  };

  const handleDelete = async (inv) => {
    if (!window.confirm(`Delete the supplier invoice for "${inv.supplier_name}"? This cannot be undone.`)) return;
    try {
      await supplierInvoiceService.delete(inv.id);
      setInvoices(prev => prev.filter(i => i.id !== inv.id));
    } catch (err) {
      alert(err.response?.data?.response || 'Failed to delete supplier invoice.');
    }
  };

  const fmt = (n) =>
    new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(n || 0);

  const fmtDate = (d) =>
    new Date(d).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' });

  const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT));

  return (
    <div className="supplier-invoices-page">
      <div className="page-header">
        <div>
          <h1>Supplier Invoices</h1>
          <p>Invoices from suppliers attached to proposals</p>
        </div>
        {canManage && (
          <button className="btn-primary" onClick={openCreateModal}>
            + New Supplier Invoice
          </button>
        )}
      </div>

      <div className="si-filters">
        <input
          type="text"
          placeholder="Search supplier name..."
          value={filters.search}
          onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
          className="filter-input"
        />
        <select
          value={filters.status}
          onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
          className="filter-select"
        >
          <option value="">All statuses</option>
          <option value="unpaid">Unpaid</option>
          <option value="paid">Paid</option>
        </select>
        <input
          type="date"
          value={filters.dateFrom}
          onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value }))}
          className="filter-date"
        />
        <input
          type="date"
          value={filters.dateTo}
          onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value }))}
          className="filter-date"
        />
      </div>

      {error && <div className="error-banner">{error}</div>}

      {loading ? (
        <div className="loading-container">
          <div className="spinner" />
          <p>Loading...</p>
        </div>
      ) : invoices.length === 0 ? (
        <div className="no-data">
          <p>No supplier invoices found.</p>
        </div>
      ) : (
        <>
          <div className="si-table-wrapper">
            <table className="si-table">
              <thead>
                <tr>
                  <th>Supplier</th>
                  <th>Invoice #</th>
                  <th>Proposal</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Created By</th>
                  <th>Date</th>
                  <th>File</th>
                  {canManage && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {invoices.map(inv => (
                  <tr key={inv.id}>
                    <td className="si-supplier">{inv.supplier_name}</td>
                    <td>{inv.invoice_number || <span className="muted">—</span>}</td>
                    <td>
                      <div className="proposal-cell">
                        <span>{inv.title_proposed?.name || <span className="muted">—</span>}</span>
                        {inv.title_proposed?.project && (
                          <span className="proposal-project">{inv.title_proposed.project.name}</span>
                        )}
                      </div>
                    </td>
                    <td className="amount">{fmt(inv.amount)}</td>
                    <td>
                      <button
                        type="button"
                        className={`status-badge status-${inv.status} ${canManage ? 'clickable' : ''}`}
                        onClick={() => canManage && handleToggleStatus(inv)}
                        disabled={!canManage}
                        title={canManage ? 'Click to toggle paid/unpaid' : undefined}
                      >
                        {inv.status === 'paid' ? 'Paid' : 'Unpaid'}
                      </button>
                    </td>
                    <td>{inv.user?.name || <span className="muted">—</span>}</td>
                    <td>{fmtDate(inv.createdAt)}</td>
                    <td>
                      {inv.file_url ? (
                        <a
                          href={imageService.getImageUrl(inv.file_url)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="file-link"
                        >
                          View
                        </a>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    {canManage && (
                      <td>
                        <div className="action-btns">
                          <button className="btn-icon" title="Edit" onClick={() => openEditModal(inv)}>
                            ✏️
                          </button>
                          <button className="btn-icon btn-danger" title="Delete" onClick={() => handleDelete(inv)}>
                            🗑
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="pagination">
              <button className="page-btn" disabled={page === 1} onClick={() => fetchInvoices(page - 1, filters)}>
                Prev
              </button>
              <span className="page-info">Page {page} of {totalPages}</span>
              <button className="page-btn" disabled={page >= totalPages} onClick={() => fetchInvoices(page + 1, filters)}>
                Next
              </button>
            </div>
          )}
        </>
      )}

      {modalMode && (
        <div className="si-modal-overlay" onClick={() => !saving && closeModal()}>
          <div className="si-modal" onClick={e => e.stopPropagation()}>
            <div className="si-modal-header">
              <h3>{modalMode === 'create' ? 'New Supplier Invoice' : 'Edit Supplier Invoice'}</h3>
              <button type="button" className="si-modal-close" onClick={closeModal} disabled={saving}>×</button>
            </div>

            <form onSubmit={handleSubmit} className="si-form">
              {formError && <div className="error-banner">{formError}</div>}

              {modalMode === 'create' && (
                <div className="form-group">
                  <label>Proposal</label>
                  <div className="si-proposal-picker" ref={proposalPickerRef}>
                    <input
                      type="text"
                      placeholder="Type to search proposals..."
                      value={proposalSearch}
                      onChange={handleProposalSearchChange}
                      onFocus={() => {
                        setProposalDropdownOpen(true);
                        if (form.proposal_id) setProposalSearch('');
                      }}
                      autoComplete="off"
                    />

                    {proposalDropdownOpen && (
                      <div className="si-proposal-dropdown">
                        {filteredProposals.length === 0 ? (
                          <div className="si-proposal-no-results">
                            {proposals.length === 0 ? 'Loading proposals...' : 'No proposals match'}
                          </div>
                        ) : (
                          filteredProposals.map(p => (
                            <div
                              key={p.id}
                              className="si-proposal-option"
                              onMouseDown={() => selectProposal(p)}
                            >
                              <div className="si-po-text">
                                <span className="si-po-name">{p.name}</span>
                                {p.project?.name && <span className="si-po-project">{p.project.name}</span>}
                              </div>
                              <span className={`si-po-status ${proposalStatusColor(p.status)}`}>
                                {p.status || 'pending'}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="form-group">
                <label>Supplier Name</label>
                <input
                  type="text"
                  value={form.supplier_name}
                  onChange={e => setForm(f => ({ ...f, supplier_name: e.target.value }))}
                  required
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Amount (KES)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.amount}
                    onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Invoice Number</label>
                  <input
                    type="text"
                    value={form.invoice_number}
                    onChange={e => setForm(f => ({ ...f, invoice_number: e.target.value }))}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Notes</label>
                <textarea
                  rows="3"
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                />
              </div>

              {modalMode === 'create' && (
                <div className="form-group">
                  <label>Attachment</label>
                  <input
                    type="file"
                    onChange={e => setForm(f => ({ ...f, file: e.target.files[0] || null }))}
                    required
                  />
                </div>
              )}

              <div className="si-modal-footer">
                <button type="button" className="btn-secondary" onClick={closeModal} disabled={saving}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? 'Saving...' : modalMode === 'create' ? 'Create' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SupplierInvoices;
