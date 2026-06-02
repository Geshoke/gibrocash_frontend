import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { transactionService, imageService, categoryService } from '../services/api';
import Layout from '../components/Layout';
import './Transactions.css';

const LIMIT = 50;
const EMPTY_FILTERS = { search: '', from_date: '', to_date: '', category_id: '' };

const Transactions = () => {
  const { user, canViewAllImprests, canEditTransactions } = useAuth();

  // ── Data ──────────────────────────────────────────────────────
  const [transactions, setTransactions] = useState([]);
  const [totalCount, setTotalCount]     = useState(0);
  const [loading, setLoading]           = useState(true);
  const [page, setPage]                 = useState(1);
  const [hasMore, setHasMore]           = useState(false);
  const [loadingMore, setLoadingMore]   = useState(false);

  // ── Detail panel ──────────────────────────────────────────────
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [transactionImageUrl, setTransactionImageUrl] = useState(null);
  const [loadingImage, setLoadingImage] = useState(false);
  const [imageError, setImageError]     = useState('');

  // ── Categories ────────────────────────────────────────────────
  const [categories, setCategories]                   = useState([]);
  const [categoryPopoverOpen, setCategoryPopoverOpen] = useState(false);

  // ── Edit ──────────────────────────────────────────────────────
  const [editMode, setEditMode]     = useState(false);
  const [editForm, setEditForm]     = useState({ item: '', quantity: '', unitPrice: '', vat_charged: '' });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError]   = useState('');

  // ── Filters ───────────────────────────────────────────────────
  // inputValues: what's currently in the inputs (not yet applied)
  // appliedFilters: what was last sent to the DB (only changes on Search / Clear)
  const [inputValues, setInputValues]       = useState(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(EMPTY_FILTERS);

  // ── Filter panel visibility on scroll ────────────────────────
  const [filtersVisible, setFiltersVisible] = useState(true);

  const isFiltered = !!(
    appliedFilters.search || appliedFilters.from_date ||
    appliedFilters.to_date || appliedFilters.category_id
  );

  // ── Effects ───────────────────────────────────────────────────

  useEffect(() => { fetchCategories(); }, []); // eslint-disable-line

  useEffect(() => {
    if (user) fetchTransactions();
  }, [user, appliedFilters]); // eslint-disable-line

  useEffect(() => {
    if (!categoryPopoverOpen) return;
    const close = () => setCategoryPopoverOpen(false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [categoryPopoverOpen]);


  // ── Data fetchers ─────────────────────────────────────────────

  const fetchTransactions = async () => {
    try {
      setLoading(true);
      setSelectedTransaction(null);
      const userId = canViewAllImprests() ? undefined : user.id;
      const response = await transactionService.getAll(userId, 1, LIMIT, appliedFilters);
      const rows  = response.data?.transactions?.rows  || [];
      const count = response.data?.transactions?.count || 0;
      setTransactions(rows);
      setTotalCount(count);
      setPage(1);
      setHasMore(rows.length < count);
    } catch (err) {
      console.error('Failed to load transactions:', err);
      setTransactions([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  };

  const loadMore = async () => {
    try {
      setLoadingMore(true);
      const nextPage = page + 1;
      const userId = canViewAllImprests() ? undefined : user.id;
      const response = await transactionService.getAll(userId, nextPage, LIMIT, appliedFilters);
      const rows  = response.data?.transactions?.rows  || [];
      const count = response.data?.transactions?.count || 0;
      setTransactions(prev => {
        const updated = [...prev, ...rows];
        setHasMore(updated.length < count);
        setTotalCount(count);
        return updated;
      });
      setPage(nextPage);
    } catch (err) {
      console.error('Failed to load more transactions:', err);
    } finally {
      setLoadingMore(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const response = await categoryService.getAll();
      setCategories(response.data.categories || []);
    } catch (err) {
      console.error('Failed to load categories:', err);
    }
  };

  // ── Filter handlers ───────────────────────────────────────────

  const applyFilters = () => {
    setAppliedFilters({ ...inputValues, search: inputValues.search.trim() });
  };

  const clearFilters = () => {
    setInputValues(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
  };

  // ── Transaction detail ────────────────────────────────────────

  const handleTransactionClick = async (txn) => {
    if (selectedTransaction?.id === txn.id) return;
    setSelectedTransaction(txn);
    setTransactionImageUrl(null);
    setImageError('');
    setCategoryPopoverOpen(false);
    setEditMode(false);

    if (!txn.images_id) return;
    try {
      setLoadingImage(true);
      const response = await imageService.getTransactionImage(txn.images_id);
      const imagePath = response.data?.path;
      if (imagePath) {
        setTransactionImageUrl(imageService.getImageUrl(imagePath));
      } else {
        setImageError('No image path returned from server');
      }
    } catch (err) {
      console.error('Failed to load transaction image:', err);
      setImageError('Failed to load image: ' + (err.response?.data?.message || err.message));
    } finally {
      setLoadingImage(false);
    }
  };

  // ── Category handlers ─────────────────────────────────────────

  const handleAssignCategory = async (e, catId) => {
    e.stopPropagation();
    const txnId = selectedTransaction.id;
    try {
      await categoryService.assignToTransaction(txnId, catId);
      const cat     = categories.find(c => c.id === catId);
      const updated = { ...selectedTransaction, categories: [...(selectedTransaction.categories || []), cat] };
      setSelectedTransaction(updated);
      setTransactions(prev => prev.map(t => t.id === txnId ? updated : t));
      setCategoryPopoverOpen(false);
    } catch (err) {
      console.error('Failed to assign category:', err);
    }
  };

  const handleRemoveCategory = async (e, catId) => {
    e.stopPropagation();
    const txnId = selectedTransaction.id;
    try {
      await categoryService.removeFromTransaction(txnId, catId);
      const updated = { ...selectedTransaction, categories: (selectedTransaction.categories || []).filter(c => c.id !== catId) };
      setSelectedTransaction(updated);
      setTransactions(prev => prev.map(t => t.id === txnId ? updated : t));
    } catch (err) {
      console.error('Failed to remove category:', err);
    }
  };

  // ── Edit handlers ─────────────────────────────────────────────

  const openEdit = () => {
    setEditForm({
      item:        selectedTransaction.item || '',
      quantity:    String(selectedTransaction.quantity ?? ''),
      unitPrice:   String(selectedTransaction.unitPrice ?? ''),
      vat_charged: String(selectedTransaction.vat_charged ?? ''),
    });
    setEditError('');
    setEditMode(true);
  };

  const cancelEdit = () => { setEditMode(false); setEditError(''); };

  const saveEdit = async () => {
    const { item, quantity, unitPrice, vat_charged } = editForm;
    if (!item.trim() || !quantity || !unitPrice) {
      setEditError('Item, quantity and unit price are required.');
      return;
    }
    const qty   = parseFloat(quantity);
    const up    = parseFloat(unitPrice);
    const vat   = parseFloat(vat_charged) || 0;
    const price = parseFloat((qty * up + vat).toFixed(2));

    setEditSaving(true);
    setEditError('');
    try {
      await transactionService.update(selectedTransaction.id, { item: item.trim(), quantity: qty, unitPrice: up, vat_charged: vat, price });
      const updated = { ...selectedTransaction, item: item.trim(), quantity: qty, unitPrice: up, vat_charged: vat, price };
      setSelectedTransaction(updated);
      setTransactions(prev => prev.map(t => t.id === updated.id
        ? { ...t, item: updated.item, quantity: updated.quantity, unitPrice: updated.unitPrice, vat_charged: updated.vat_charged, price: updated.price }
        : t
      ));
      setEditMode(false);
    } catch {
      setEditError('Failed to save changes. Please try again.');
    } finally {
      setEditSaving(false);
    }
  };

  // ── Formatters ────────────────────────────────────────────────

  const formatCurrency = (amount) =>
    new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(amount || 0);

  const formatDate = (dateString) =>
    new Date(dateString).toLocaleDateString('en-KE', { month: 'short', day: 'numeric', year: 'numeric' });

  const formatTime = (dateString) =>
    new Date(dateString).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' });

  const unassignedCategories = categories.filter(
    c => !(selectedTransaction?.categories || []).some(tc => tc.id === c.id)
  );

  // ── Render ────────────────────────────────────────────────────

  if (loading) {
    return (
      <Layout>
        <div className="loading-container">
          <div className="spinner"></div>
          <p>Loading transactions...</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="transactions-page">

        {/* Header */}
        <div className="page-header">
          <div>
            <h1>Transactions</h1>
            <p>
              {isFiltered
                ? `${totalCount} result${totalCount !== 1 ? 's' : ''} · ${transactions.length} loaded`
                : `${totalCount} expense${totalCount !== 1 ? 's' : ''} recorded`}
            </p>
          </div>
        </div>

        {/* Split layout */}
        <div className="txn-split-layout">

          {/* LEFT — filters + list */}
          <div className="txn-left-col">

            {/* Filter panel */}
            <div className={`txn-filters-section${filtersVisible ? '' : ' filters-hidden'}`}>
              <div className="txn-filter-field">
                <label className="txn-filter-label">Keyword</label>
                <input
                  className="txn-filter-input"
                  type="text"
                  placeholder="Search by item name…"
                  value={inputValues.search}
                  onChange={e => setInputValues(v => ({ ...v, search: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && applyFilters()}
                />
              </div>

              <div className="txn-filter-field">
                <label className="txn-filter-label">From</label>
                <input
                  className="txn-filter-input"
                  type="date"
                  value={inputValues.from_date}
                  onChange={e => setInputValues(v => ({ ...v, from_date: e.target.value }))}
                />
              </div>

              <div className="txn-filter-field">
                <label className="txn-filter-label">To</label>
                <input
                  className="txn-filter-input"
                  type="date"
                  value={inputValues.to_date}
                  onChange={e => setInputValues(v => ({ ...v, to_date: e.target.value }))}
                />
              </div>

              <div className="txn-filter-field">
                <label className="txn-filter-label">Category</label>
                <select
                  className="txn-filter-input txn-filter-select"
                  value={inputValues.category_id}
                  onChange={e => setInputValues(v => ({ ...v, category_id: e.target.value }))}
                >
                  <option value="">All categories</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.cat_name}</option>
                  ))}
                </select>
              </div>

              <div className="txn-filter-actions">
                <button className="txn-filter-search-btn" onClick={applyFilters}>
                  Search
                </button>
                {isFiltered && (
                  <button className="txn-filter-clear-btn" onClick={clearFilters}>
                    ✕ Clear
                  </button>
                )}
              </div>
            </div>

            {/* Transaction list */}
            <div
              className="txn-list-panel"
              onScroll={e => setFiltersVisible(e.currentTarget.scrollTop === 0)}
            >
              {transactions.length === 0 ? (
                <div className="no-data">
                  <p>{isFiltered ? 'No transactions match your filters.' : 'No transactions recorded yet.'}</p>
                </div>
              ) : (
                <>
                  {transactions.map(txn => (
                    <div
                      key={txn.id}
                      className={`txn-list-item${selectedTransaction?.id === txn.id ? ' active' : ''}`}
                      onClick={() => handleTransactionClick(txn)}
                    >
                      <div className="txn-list-meta">
                        <span className="txn-list-date">{formatDate(txn.createdAt)}</span>
                        <span className="txn-list-time">{formatTime(txn.createdAt)}</span>
                      </div>
                      <div className="txn-list-main">
                        <span className="txn-list-item-name">{txn.item}</span>
                        {txn.images_id && <span className="txn-list-receipt-dot" title="Has receipt" />}
                      </div>
                      <div className="txn-list-footer">
                        <span className="txn-list-imprest">{txn.imprest?.name || '—'}</span>
                        <span className="txn-list-amount">{formatCurrency(txn.price)}</span>
                      </div>
                      {txn.User?.name && (
                        <div className="txn-list-uploader">by {txn.User.name}</div>
                      )}
                    </div>
                  ))}
                  {hasMore && (
                    <button className="load-more-btn" onClick={loadMore} disabled={loadingMore}>
                      {loadingMore ? 'Loading...' : `Load more · ${totalCount - transactions.length} remaining`}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* RIGHT — detail */}
          <div className={`txn-detail-panel${selectedTransaction ? ' visible' : ''}`}>
            {!selectedTransaction ? (
              <div className="txn-detail-empty">
                <p>Select a transaction to view details</p>
              </div>
            ) : (
              <>
                <div className="txn-detail-header">
                  <div>
                    <h2>{selectedTransaction.item}</h2>
                    <div className="txn-detail-badges">
                      <span className="txn-detail-badge">
                        <span className="txn-badge-label">Imprest</span>
                        <span className="txn-badge-value">{selectedTransaction.imprest?.name || '—'}</span>
                      </span>
                      <span className="txn-detail-badge project">
                        <span className="txn-badge-label">Project</span>
                        <span className="txn-badge-value">{selectedTransaction.imprest?.project?.name || '—'}</span>
                      </span>
                    </div>
                  </div>
                  <div className="txn-detail-header-actions">
                    {canEditTransactions() && !editMode && (
                      <button className="txn-edit-btn" onClick={openEdit}>Edit</button>
                    )}
                    <button
                      className="close-preview-btn"
                      onClick={() => {
                        setSelectedTransaction(null);
                        setTransactionImageUrl(null);
                        setImageError('');
                        setEditMode(false);
                      }}
                    >
                      &times;
                    </button>
                  </div>
                </div>

                <div className="txn-detail-body">
                  {editMode ? (
                    <div className="txn-edit-form">
                      <div className="txn-detail-field">
                        <span className="txn-detail-label">Item / Description</span>
                        <input className="txn-edit-input" type="text" value={editForm.item}
                          onChange={e => setEditForm(p => ({ ...p, item: e.target.value }))} />
                      </div>
                      <div className="txn-detail-field">
                        <span className="txn-detail-label">Quantity</span>
                        <input className="txn-edit-input" type="number" min="1" step="1" value={editForm.quantity}
                          onChange={e => setEditForm(p => ({ ...p, quantity: e.target.value }))} />
                      </div>
                      <div className="txn-detail-field">
                        <span className="txn-detail-label">Unit Price (KES)</span>
                        <input className="txn-edit-input" type="number" min="0" step="0.01" value={editForm.unitPrice}
                          onChange={e => setEditForm(p => ({ ...p, unitPrice: e.target.value }))} />
                      </div>
                      <div className="txn-detail-field">
                        <span className="txn-detail-label">VAT (KES)</span>
                        <input className="txn-edit-input" type="number" min="0" step="0.01" value={editForm.vat_charged}
                          onChange={e => setEditForm(p => ({ ...p, vat_charged: e.target.value }))} />
                      </div>
                      {editError && <p className="txn-edit-error">{editError}</p>}
                      <div className="txn-edit-actions">
                        <button className="txn-edit-cancel-btn" onClick={cancelEdit} disabled={editSaving}>Cancel</button>
                        <button className="txn-edit-save-btn" onClick={saveEdit} disabled={editSaving}>
                          {editSaving ? 'Saving…' : 'Save Changes'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="txn-detail-grid">
                      <div className="txn-detail-field">
                        <span className="txn-detail-label">Date</span>
                        <span className="txn-detail-value">{formatDate(selectedTransaction.createdAt)} {formatTime(selectedTransaction.createdAt)}</span>
                      </div>
                      {selectedTransaction.User?.name && (
                        <div className="txn-detail-field">
                          <span className="txn-detail-label">Uploaded by</span>
                          <span className="txn-detail-value">{selectedTransaction.User.name}</span>
                        </div>
                      )}
                      <div className="txn-detail-field">
                        <span className="txn-detail-label">Quantity</span>
                        <span className="txn-detail-value">{selectedTransaction.quantity}</span>
                      </div>
                      <div className="txn-detail-field">
                        <span className="txn-detail-label">Unit Price</span>
                        <span className="txn-detail-value">{formatCurrency(selectedTransaction.unitPrice)}</span>
                      </div>
                      <div className="txn-detail-field">
                        <span className="txn-detail-label">VAT</span>
                        <span className="txn-detail-value">{formatCurrency(selectedTransaction.vat_charged)}</span>
                      </div>
                      <div className="txn-detail-field txn-detail-total">
                        <span className="txn-detail-label">Total</span>
                        <span className="txn-detail-value debit">{formatCurrency(selectedTransaction.price)}</span>
                      </div>
                    </div>
                  )}

                  {/* Categories */}
                  <div className="txn-detail-section">
                    <div className="txn-detail-section-header">
                      <span className="txn-detail-section-title">Categories</span>
                      <div className="category-add-wrapper" onClick={e => e.stopPropagation()}>
                        <button className="add-category-btn" onClick={e => { e.stopPropagation(); setCategoryPopoverOpen(v => !v); }}>+</button>
                        {categoryPopoverOpen && (
                          <div className="category-popover" onClick={e => e.stopPropagation()}>
                            {unassignedCategories.length === 0 ? (
                              <span className="category-popover-empty">All categories assigned</span>
                            ) : (
                              unassignedCategories.map(cat => (
                                <button key={cat.id} className="category-popover-item"
                                  onClick={e => handleAssignCategory(e, cat.id)}>
                                  {cat.cat_name}
                                </button>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="categories-in-row">
                      {(selectedTransaction.categories || []).length === 0 ? (
                        <span className="no-categories">None</span>
                      ) : (
                        (selectedTransaction.categories || []).map(cat => (
                          <span key={cat.id} className="category-tag">
                            {cat.cat_name}
                            <button className="remove-tag-btn" onClick={e => handleRemoveCategory(e, cat.id)}>×</button>
                          </span>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Receipt */}
                  <div className="txn-detail-section">
                    <span className="txn-detail-section-title">Receipt</span>
                    <div className="txn-receipt-area">
                      {loadingImage ? (
                        <div className="loading-container small">
                          <div className="spinner"></div>
                          <p>Loading receipt...</p>
                        </div>
                      ) : !selectedTransaction.images_id ? (
                        <p className="no-image-message">No receipt attached.</p>
                      ) : imageError ? (
                        <p className="image-error-message">{imageError}</p>
                      ) : transactionImageUrl ? (
                        transactionImageUrl.toLowerCase().endsWith('.pdf') ? (
                          <iframe src={transactionImageUrl} title="Receipt" className="pdf-preview" />
                        ) : (
                          <img src={transactionImageUrl} alt="Receipt"
                            onClick={() => window.open(transactionImageUrl, '_blank')} />
                        )
                      ) : null}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Transactions;
