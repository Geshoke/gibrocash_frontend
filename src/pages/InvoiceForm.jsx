import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { invoiceService, catalogService, projectService } from '../services/api';
import './InvoiceForm.css';

const TAX_TYPES = ['VAT-16', 'VAT-0', 'Exempt'];

const emptyItem = () => ({
  _key: Math.random(),
  item_name: '',
  description: '',
  tax_type: 'VAT-16',
  tax_rate: 16,
  quantity: '',
  rate: '',
  amount: 0,
});

const todayStr = () => new Date().toISOString().split('T')[0];

const InvoiceForm = () => {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const { user } = useAuth();

  const [form, setForm] = useState({
    client_name: '',
    client_agent: '',
    client_pin: '',
    date: todayStr(),
    due_date: todayStr(),
    terms: 'Due on receipt',
    project_id: '',
    notes: '',
  });
  const [items, setItems] = useState([emptyItem()]);
  const [catalog, setCatalog] = useState([]);
  const [projects, setProjects] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showCatalog, setShowCatalog] = useState(null); // index of row that opened catalog

  // Catalog management state
  const [showCatalogManager, setShowCatalogManager] = useState(false);
  const [newCatalogItem, setNewCatalogItem] = useState({ item_name: '', description: '', default_rate: '', tax_type: 'VAT-16' });
  const [catalogSaving, setCatalogSaving] = useState(false);

  useEffect(() => {
    loadCatalogAndProjects();
    if (isEdit) loadInvoice();
  }, [id]);

  const loadCatalogAndProjects = async () => {
    try {
      const [catRes, projRes] = await Promise.all([
        catalogService.getAll(),
        projectService.getAll(),
      ]);
      setCatalog(catRes.data.catalog || []);
      setProjects(projRes.data.projects || []);
    } catch (err) {
      console.error(err);
    }
  };

  const loadInvoice = async () => {
    try {
      const res = await invoiceService.getById(id);
      const inv = res.data.invoice;
      setForm({
        client_name: inv.client_name || '',
        client_agent: inv.client_agent || '',
        client_pin: inv.client_pin || '',
        date: inv.date || todayStr(),
        due_date: inv.due_date || todayStr(),
        terms: inv.terms || 'Due on receipt',
        project_id: inv.project_id || '',
        notes: inv.notes || '',
      });
      const loadedItems = (inv.invoice_items || []).map(i => ({
        _key: Math.random(),
        item_name: i.item_name,
        description: i.description || '',
        tax_type: i.tax_type,
        tax_rate: i.tax_rate,
        quantity: i.quantity,
        rate: i.rate,
        amount: i.amount,
      }));
      setItems(loadedItems.length > 0 ? loadedItems : [emptyItem()]);
    } catch (err) {
      setError('Failed to load invoice.');
      console.error(err);
    }
  };

  const setField = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const setItemField = (index, field, value) => {
    setItems(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      const qty = parseFloat(field === 'quantity' ? value : updated[index].quantity) || 0;
      const rate = parseFloat(field === 'rate' ? value : updated[index].rate) || 0;
      updated[index].amount = parseFloat((qty * rate).toFixed(2));
      return updated;
    });
  };

  const addItem = () => setItems(prev => [...prev, emptyItem()]);

  const removeItem = (index) => {
    if (items.length === 1) return;
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const pickFromCatalog = (index, catItem) => {
    setItems(prev => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        item_name: catItem.item_name,
        description: catItem.description || '',
        tax_type: catItem.tax_type,
        tax_rate: catItem.tax_type === 'VAT-16' ? 16 : 0,
        rate: catItem.default_rate || updated[index].rate,
        amount: parseFloat(((updated[index].quantity || 0) * (catItem.default_rate || 0)).toFixed(2)),
      };
      return updated;
    });
    setShowCatalog(null);
  };

  const subtotal = items.reduce((s, i) => s + (i.amount || 0), 0);
  const taxRate = 16;
  const taxAmount = parseFloat((subtotal * taxRate / (100 + taxRate)).toFixed(2));
  const total = subtotal;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    for (const item of items) {
      if (!item.item_name.trim()) { setError('All line items must have an item name.'); return; }
      if (!item.quantity || !item.rate) { setError('All line items must have quantity and rate.'); return; }
    }

    const payload = {
      ...form,
      project_id: form.project_id || null,
      created_by: user.id,
      items: items.map((item, i) => ({
        item_name: item.item_name,
        description: item.description,
        tax_type: item.tax_type,
        tax_rate: item.tax_rate,
        quantity: parseFloat(item.quantity),
        rate: parseFloat(item.rate),
        sort_order: i,
      })),
    };

    setSaving(true);
    try {
      if (isEdit) {
        await invoiceService.update(id, payload);
        navigate(`/invoices/${id}`);
      } else {
        const res = await invoiceService.create(payload);
        navigate(`/invoices/${res.data.invoice.id}`);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save invoice.');
    } finally {
      setSaving(false);
    }
  };

  const handleAddCatalogItem = async (e) => {
    e.preventDefault();
    if (!newCatalogItem.item_name.trim()) return;
    setCatalogSaving(true);
    try {
      const res = await catalogService.create({
        ...newCatalogItem,
        default_rate: newCatalogItem.default_rate ? parseFloat(newCatalogItem.default_rate) : null,
      });
      setCatalog(prev => [...prev, res.data.item]);
      setNewCatalogItem({ item_name: '', description: '', default_rate: '', tax_type: 'VAT-16' });
    } catch (err) {
      console.error(err);
    } finally {
      setCatalogSaving(false);
    }
  };

  const handleDeleteCatalogItem = async (catId) => {
    if (!window.confirm('Remove this item from the catalog?')) return;
    try {
      await catalogService.delete(catId);
      setCatalog(prev => prev.filter(c => c.id !== catId));
    } catch (err) {
      console.error(err);
    }
  };

  const fmt = (n) =>
    new Intl.NumberFormat('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

  return (
      <div className="invoice-form-page">
        <div className="form-header">
          <div>
            <h1>{isEdit ? 'Edit Invoice' : 'New Invoice'}</h1>
            <p>{isEdit ? 'Update draft invoice details' : 'Create a new tax invoice'}</p>
          </div>
          <div className="form-header-actions">
            <button
              type="button"
              className="btn-outline"
              onClick={() => setShowCatalogManager(v => !v)}
            >
              {showCatalogManager ? 'Hide Catalog' : 'Manage Catalog'}
            </button>
            <button type="button" className="btn-ghost" onClick={() => navigate('/invoices')}>
              Cancel
            </button>
          </div>
        </div>

        {/* Catalog Manager */}
        {showCatalogManager && (
          <div className="catalog-manager">
            <h3>Item Catalog</h3>
            <form className="catalog-add-form" onSubmit={handleAddCatalogItem}>
              <input
                type="text"
                placeholder="Item name *"
                value={newCatalogItem.item_name}
                onChange={e => setNewCatalogItem(c => ({ ...c, item_name: e.target.value }))}
                className="catalog-input"
                required
              />
              <input
                type="text"
                placeholder="Description"
                value={newCatalogItem.description}
                onChange={e => setNewCatalogItem(c => ({ ...c, description: e.target.value }))}
                className="catalog-input"
              />
              <input
                type="number"
                placeholder="Default rate"
                value={newCatalogItem.default_rate}
                onChange={e => setNewCatalogItem(c => ({ ...c, default_rate: e.target.value }))}
                className="catalog-input catalog-input-sm"
              />
              <select
                value={newCatalogItem.tax_type}
                onChange={e => setNewCatalogItem(c => ({ ...c, tax_type: e.target.value }))}
                className="catalog-select"
              >
                {TAX_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <button type="submit" className="btn-primary" disabled={catalogSaving}>
                {catalogSaving ? '...' : '+ Add'}
              </button>
            </form>

            {catalog.length > 0 ? (
              <table className="catalog-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Description</th>
                    <th>Default Rate</th>
                    <th>Tax</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {catalog.map(c => (
                    <tr key={c.id}>
                      <td>{c.item_name}</td>
                      <td className="muted">{c.description || '—'}</td>
                      <td>{c.default_rate != null ? fmt(c.default_rate) : '—'}</td>
                      <td>{c.tax_type}</td>
                      <td>
                        <button className="btn-icon btn-danger" onClick={() => handleDeleteCatalogItem(c.id)}>🗑</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="muted" style={{ padding: '8px 0' }}>No catalog items yet.</p>
            )}
          </div>
        )}

        {error && <div className="error-banner">{error}</div>}

        <form onSubmit={handleSubmit} className="invoice-form">
          {/* Two-column layout: Bill To + Invoice Meta */}
          <div className="form-cols">
            <div className="form-col">
              <div className="form-section">
                <h3>Bill To</h3>
                <div className="form-group">
                  <label>Client Name *</label>
                  <input
                    type="text"
                    value={form.client_name}
                    onChange={e => setField('client_name', e.target.value)}
                    placeholder="e.g. Mt. Kenya University"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Agent / Sub-contractor</label>
                  <input
                    type="text"
                    value={form.client_agent}
                    onChange={e => setField('client_agent', e.target.value)}
                    placeholder="e.g. Wakiinama Enterprises Ltd"
                  />
                </div>
                <div className="form-group">
                  <label>Client PIN</label>
                  <input
                    type="text"
                    value={form.client_pin}
                    onChange={e => setField('client_pin', e.target.value)}
                    placeholder="e.g. P052148991Q"
                  />
                </div>
                <div className="form-group">
                  <label>Link to Project</label>
                  <select value={form.project_id} onChange={e => setField('project_id', e.target.value)}>
                    <option value="">— No project —</option>
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="form-col">
              <div className="form-section">
                <h3>Invoice Details</h3>
                <div className="form-group">
                  <label>Invoice Date *</label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={e => setField('date', e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Due Date *</label>
                  <input
                    type="date"
                    value={form.due_date}
                    onChange={e => setField('due_date', e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Terms</label>
                  <input
                    type="text"
                    value={form.terms}
                    onChange={e => setField('terms', e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Notes</label>
                  <textarea
                    value={form.notes}
                    onChange={e => setField('notes', e.target.value)}
                    rows={3}
                    placeholder="Optional notes for the client..."
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Line Items */}
          <div className="form-section items-section">
            <div className="items-header">
              <h3>Line Items</h3>
              {catalog.length > 0 && (
                <span className="catalog-hint">Click "Catalog" on a row to pick a saved item</span>
              )}
            </div>

            <div className="items-table-wrapper">
              <table className="items-table">
                <thead>
                  <tr>
                    <th>Item *</th>
                    <th>Description</th>
                    <th>Tax</th>
                    <th>Qty *</th>
                    <th>Rate (excl. VAT) *</th>
                    <th>Amount</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => (
                    <tr key={item._key} className="item-row">
                      <td className="td-item">
                        <input
                          type="text"
                          value={item.item_name}
                          onChange={e => setItemField(index, 'item_name', e.target.value)}
                          placeholder="Item name"
                          required
                        />
                        {catalog.length > 0 && (
                          <button
                            type="button"
                            className="btn-catalog"
                            onClick={() => setShowCatalog(showCatalog === index ? null : index)}
                          >
                            Catalog
                          </button>
                        )}
                        {showCatalog === index && (
                          <div className="catalog-dropdown">
                            {catalog.map(c => (
                              <div
                                key={c.id}
                                className="catalog-option"
                                onClick={() => pickFromCatalog(index, c)}
                              >
                                <span className="catalog-option-name">{c.item_name}</span>
                                {c.default_rate != null && (
                                  <span className="catalog-option-rate">
                                    {fmt(c.default_rate)}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                      <td>
                        <input
                          type="text"
                          value={item.description}
                          onChange={e => setItemField(index, 'description', e.target.value)}
                          placeholder="Optional description"
                        />
                      </td>
                      <td>
                        <select
                          value={item.tax_type}
                          onChange={e => {
                            const tt = e.target.value;
                            setItemField(index, 'tax_type', tt);
                            setItemField(index, 'tax_rate', tt === 'VAT-16' ? 16 : 0);
                          }}
                        >
                          {TAX_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </td>
                      <td>
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={e => setItemField(index, 'quantity', e.target.value)}
                          placeholder="0"
                          min="0"
                          step="any"
                          required
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          value={item.rate}
                          onChange={e => setItemField(index, 'rate', e.target.value)}
                          placeholder="0.00"
                          min="0"
                          step="any"
                          required
                        />
                      </td>
                      <td className="amount-cell">
                        {fmt(item.amount)}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn-icon btn-danger"
                          onClick={() => removeItem(index)}
                          disabled={items.length === 1}
                          title="Remove row"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button type="button" className="btn-add-row" onClick={addItem}>
              + Add Line Item
            </button>
          </div>

          {/* Totals */}
          <div className="totals-section">
            <div className="totals-box">
              <div className="total-row">
                <span className="total-label">Subtotal (excl. VAT)</span>
                <span className="total-value">Ksh {fmt(subtotal - taxAmount)}</span>
              </div>
              <div className="total-row">
                <span className="total-label">VAT ({taxRate}%)</span>
                <span className="total-value">Ksh {fmt(taxAmount)}</span>
              </div>
              <div className="total-row">
                <span className="total-label">Total</span>
                <span className="total-value">Ksh {fmt(total)}</span>
              </div>
              <div className="balance-row">
                <span className="balance-label">Balance Due</span>
                <span className="balance-value">Ksh {fmt(total)}</span>
              </div>
            </div>
          </div>

          <div className="form-actions">
            <button type="button" className="btn-ghost" onClick={() => navigate('/invoices')}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving...' : isEdit ? 'Update Invoice' : 'Create Invoice'}
            </button>
          </div>
        </form>
      </div>
  );
};

export default InvoiceForm;
