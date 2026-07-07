import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PDFDownloadLink } from '@react-pdf/renderer';
import { invoiceService } from '../services/api';
import InvoicePDF from '../components/InvoicePDF';
import './InvoiceView.css';

const STATUS_OPTIONS = ['draft', 'sent', 'paid'];

const InvoiceView = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusUpdating, setStatusUpdating] = useState(false);

  useEffect(() => {
    fetchInvoice();
  }, [id]);

  const fetchInvoice = async () => {
    try {
      setLoading(true);
      const res = await invoiceService.getById(id);
      setInvoice(res.data.invoice);
    } catch (err) {
      setError('Failed to load invoice.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (newStatus) => {
    if (newStatus === invoice.status) return;
    setStatusUpdating(true);
    try {
      await invoiceService.updateStatus(id, newStatus);
      setInvoice(prev => ({ ...prev, status: newStatus }));
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update status.');
    } finally {
      setStatusUpdating(false);
    }
  };

  const fmt = (n) =>
    new Intl.NumberFormat('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

  const fmtDate = (d) => {
    if (!d) return '';
    return new Date(d).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner" />
        <p>Loading...</p>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="error-banner" style={{ margin: 24 }}>{error || 'Invoice not found.'}</div>
    );
  }

  const items = invoice.invoice_items || [];
  const subtotal = items.reduce((s, i) => s + i.amount, 0);
  const taxRate = items[0]?.tax_rate ?? 16;
  const taxAmount = parseFloat((subtotal * taxRate / (100 + taxRate)).toFixed(2));
  const net = subtotal - taxAmount;

  return (
      <div className="invoice-view-page">
        {/* Top bar */}
        <div className="view-header">
          <div className="view-header-left">
            <button className="btn-ghost" onClick={() => navigate('/invoices')}>← Back</button>
            <div>
              <h1>{invoice.invoice_number}</h1>
              <p className="view-subtitle">
                {invoice.client_name}
                {invoice.client_agent && ` · ${invoice.client_agent}`}
              </p>
            </div>
          </div>
          <div className="view-header-actions">
            {/* Status selector */}
            <div className="status-selector">
              {STATUS_OPTIONS.map(s => (
                <button
                  key={s}
                  className={`status-btn ${invoice.status === s ? 'active status-' + s : ''}`}
                  onClick={() => handleStatusChange(s)}
                  disabled={statusUpdating}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>

            {invoice.status === 'draft' && (
              <button className="btn-outline" onClick={() => navigate(`/invoices/${id}/edit`)}>
                Edit
              </button>
            )}

            <PDFDownloadLink
              document={<InvoicePDF invoice={invoice} />}
              fileName={`${invoice.invoice_number}.pdf`}
            >
              {({ loading: pdfLoading }) => (
                <button className="btn-primary" disabled={pdfLoading}>
                  {pdfLoading ? 'Preparing...' : '⬇ Download PDF'}
                </button>
              )}
            </PDFDownloadLink>
          </div>
        </div>

        {/* Invoice preview card */}
        <div className="invoice-preview">
          {/* Company header */}
          <div className="inv-header">
            <div className="inv-company">
              <div className="company-name">GIBRO Enterprise LTD</div>
              <div className="company-meta">
                Likoni Road, NAIROBI, NAIROBI 00100 KE<br />
                +254710341246 · info@gibroenterprise.co.ke<br />
                PIN P051595908Z
              </div>
            </div>
            <div className="inv-logo-placeholder">
              <span className="logo-text">GIBRO</span>
              <span className="logo-sub">ENTERPRISE LTD</span>
            </div>
          </div>

          <div className="inv-title">Tax Invoice</div>

          {/* Meta row */}
          <div className="inv-meta-row">
            <div className="inv-bill-to">
              <div className="meta-label">Bill To</div>
              <div className="bill-name">{invoice.client_name}</div>
              {invoice.client_agent && <div className="bill-detail">{invoice.client_agent}</div>}
              {invoice.client_pin && <div className="bill-detail">{invoice.client_pin}</div>}
              {invoice.project && <div className="bill-detail">Project: {invoice.project.name}</div>}
            </div>
            <div className="inv-meta-details">
              <div className="meta-row-item">
                <span className="meta-label">Invoice</span>
                <span className="meta-value">{invoice.invoice_number}</span>
              </div>
              <div className="meta-row-item">
                <span className="meta-label">Date</span>
                <span className="meta-value">{fmtDate(invoice.date)}</span>
              </div>
              <div className="meta-row-item">
                <span className="meta-label">Terms</span>
                <span className="meta-value">{invoice.terms}</span>
              </div>
              <div className="meta-row-item">
                <span className="meta-label">Due Date</span>
                <span className="meta-value">{fmtDate(invoice.due_date)}</span>
              </div>
            </div>
          </div>

          {/* Line items table */}
          <table className="inv-items-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Description</th>
                <th>Tax</th>
                <th className="right">Qty</th>
                <th className="right">Rate</th>
                <th className="right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={i}>
                  <td className="item-name-cell">{item.item_name}</td>
                  <td className="item-desc-cell">{item.description}</td>
                  <td>{item.tax_type}</td>
                  <td className="right">{item.quantity}</td>
                  <td className="right tabular">{fmt(item.rate)}</td>
                  <td className="right tabular">{fmt(item.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div className="inv-totals-row">
            <div className="inv-totals-box">
              <div className="inv-total-line">
                <span className="itl-label">Subtotal</span>
                <span className="itl-value tabular">{fmt(net)}</span>
              </div>
              <div className="inv-total-line">
                <span className="itl-label">Tax ({taxRate}%)</span>
                <span className="itl-value tabular">{fmt(taxAmount)}</span>
              </div>
              <div className="inv-total-line">
                <span className="itl-label">Total</span>
                <span className="itl-value tabular">{fmt(subtotal)}</span>
              </div>
              <div className="inv-balance-line">
                <span className="ibl-label">Balance Due</span>
                <span className="ibl-value">Ksh {fmt(subtotal)}</span>
              </div>
            </div>
          </div>

          {/* Tax summary */}
          <div className="inv-tax-summary">
            <div className="ts-title">Tax Summary</div>
            <table className="ts-table">
              <thead>
                <tr>
                  <th>Rate</th>
                  <th className="right">Tax</th>
                  <th className="right">Net</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>KRA @ {taxRate}%</td>
                  <td className="right tabular">{fmt(taxAmount)}</td>
                  <td className="right tabular">{fmt(net)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {invoice.notes && (
            <div className="inv-notes">
              <div className="meta-label">Notes</div>
              <p>{invoice.notes}</p>
            </div>
          )}
        </div>
      </div>
  );
};

export default InvoiceView;
