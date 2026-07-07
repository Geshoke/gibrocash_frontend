import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { invoiceService } from '../services/api';
import './Invoices.css';

const STATUS_COLORS = { draft: 'gray', sent: 'blue', paid: 'green' };

const Invoices = () => {
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({ status: '', search: '' });

  useEffect(() => {
    fetchInvoices();
  }, [filters]);

  const fetchInvoices = async () => {
    try {
      setLoading(true);
      setError('');
      const params = {};
      if (filters.status) params.status = filters.status;
      if (filters.search) params.search = filters.search;
      const res = await invoiceService.getAll(params);
      setInvoices(res.data.invoices || []);
    } catch (err) {
      setError('Failed to load invoices.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (invoice) => {
    if (!window.confirm(`Delete invoice ${invoice.invoice_number}? This cannot be undone.`)) return;
    try {
      await invoiceService.delete(invoice.id);
      setInvoices(prev => prev.filter(i => i.id !== invoice.id));
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete invoice.');
    }
  };

  const fmt = (n) =>
    new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(n);

  const fmtDate = (d) =>
    new Date(d).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' });

  const getTotal = (invoice) => {
    const items = invoice.invoice_items || [];
    return items.reduce((s, i) => s + i.amount, 0);
  };

  return (
      <div className="invoices-page">
        <div className="page-header">
          <div>
            <h1>Invoices</h1>
            <p>Manage and download tax invoices</p>
          </div>
          <button className="btn-primary" onClick={() => navigate('/invoices/new')}>
            + New Invoice
          </button>
        </div>

        {/* Filters */}
        <div className="invoice-filters">
          <input
            type="text"
            placeholder="Search client or invoice number..."
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
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="paid">Paid</option>
          </select>
        </div>

        {error && <div className="error-banner">{error}</div>}

        {loading ? (
          <div className="loading-container">
            <div className="spinner" />
            <p>Loading...</p>
          </div>
        ) : invoices.length === 0 ? (
          <div className="no-data">
            <p>No invoices found.</p>
          </div>
        ) : (
          <div className="invoice-table-wrapper">
            <table className="invoice-table">
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Client</th>
                  <th>Date</th>
                  <th>Due Date</th>
                  <th>Project</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map(inv => (
                  <tr key={inv.id} onClick={() => navigate(`/invoices/${inv.id}`)} className="invoice-row">
                    <td className="inv-number">{inv.invoice_number}</td>
                    <td>
                      <div className="client-cell">
                        <span className="client-name">{inv.client_name}</span>
                        {inv.client_agent && <span className="client-agent">{inv.client_agent}</span>}
                      </div>
                    </td>
                    <td>{fmtDate(inv.date)}</td>
                    <td>{fmtDate(inv.due_date)}</td>
                    <td>{inv.project?.name || <span className="muted">—</span>}</td>
                    <td className="amount">{fmt(getTotal(inv))}</td>
                    <td>
                      <span className={`status-badge status-${inv.status}`}>
                        {inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
                      </span>
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      <div className="action-btns">
                        <button
                          className="btn-icon"
                          title="View / Download"
                          onClick={() => navigate(`/invoices/${inv.id}`)}
                        >
                          👁
                        </button>
                        {inv.status === 'draft' && (
                          <button
                            className="btn-icon"
                            title="Edit"
                            onClick={() => navigate(`/invoices/${inv.id}/edit`)}
                          >
                            ✏️
                          </button>
                        )}
                        {inv.status === 'draft' && (
                          <button
                            className="btn-icon btn-danger"
                            title="Delete"
                            onClick={() => handleDelete(inv)}
                          >
                            🗑
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
  );
};

export default Invoices;
