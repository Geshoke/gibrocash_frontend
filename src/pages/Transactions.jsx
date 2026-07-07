import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { transactionService, imageService, categoryService, imprestService, projectService } from '../services/api';
import './Transactions.css';

const LIMIT = 50;
const EMPTY_FILTERS = { search: '', from_date: '', to_date: '', category_id: '' };

const Transactions = () => {
  const { user, canViewAllImprests, canEditTransactions, canMoveTransactions } = useAuth();

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
  const [loadingImage, setLoadingImage]   = useState(false);
  const [imageError, setImageError]       = useState('');
  const [hasNoReceipt, setHasNoReceipt]   = useState(false);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [receiptUploadError, setReceiptUploadError] = useState('');

  // ── Categories ────────────────────────────────────────────────
  const [categories, setCategories]                   = useState([]);
  const [categoryPopoverOpen, setCategoryPopoverOpen] = useState(false);

  // ── Edit ──────────────────────────────────────────────────────
  const [editMode, setEditMode]     = useState(false);
  const [editForm, setEditForm]     = useState({ item: '', quantity: '', unitPrice: '', vat_charged: '' });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError]   = useState('');

  // ── Split transaction ─────────────────────────────────────────
  const [splitMode, setSplitMode]   = useState(false);
  const [splitParts, setSplitParts] = useState([]);
  const [splitSaving, setSplitSaving] = useState(false);
  const [splitError, setSplitError]   = useState('');

  // ── Move to imprest ───────────────────────────────────────────
  const [allImprests, setAllImprests]           = useState([]);
  const [allProjects, setAllProjects]           = useState([]);
  const [moveProjectId, setMoveProjectId]       = useState('');
  const [moveProjectSearch, setMoveProjectSearch] = useState('');
  const [moveProjectDropdownOpen, setMoveProjectDropdownOpen] = useState(false);
  const moveProjectComboRef = useRef(null);
  const [moveImprestId, setMoveImprestId]       = useState('');
  const [moveSearch, setMoveSearch]             = useState('');
  const [moveDropdownOpen, setMoveDropdownOpen] = useState(false);
  const [moveSaving, setMoveSaving]             = useState(false);
  const [moveError, setMoveError]               = useState('');
  const [moveSuccess, setMoveSuccess]           = useState('');
  const moveComboRef = useRef(null);

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

  useEffect(() => {
    if (!moveProjectDropdownOpen) return;
    const close = (e) => {
      if (moveProjectComboRef.current && !moveProjectComboRef.current.contains(e.target)) {
        setMoveProjectDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [moveProjectDropdownOpen]);

  useEffect(() => {
    if (!moveDropdownOpen) return;
    const close = (e) => {
      if (moveComboRef.current && !moveComboRef.current.contains(e.target)) {
        setMoveDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [moveDropdownOpen]);


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

  const loadTransactionImage = async (txn) => {
    setTransactionImageUrl(null);
    setImageError('');
    setHasNoReceipt(false);

    if (!txn.images_id) { setHasNoReceipt(true); return; }
    try {
      setLoadingImage(true);
      const response = await imageService.getTransactionImage(txn.images_id);
      const imagePath = response.data?.path;
      if (imagePath) {
        setTransactionImageUrl(imageService.getImageUrl(imagePath));
      } else {
        setHasNoReceipt(true);
      }
    } catch (err) {
      console.error('Failed to load transaction image:', err);
      setImageError('Failed to load image: ' + (err.response?.data?.message || err.message));
    } finally {
      setLoadingImage(false);
    }
  };

  const handleTransactionClick = async (txn) => {
    if (selectedTransaction?.id === txn.id) return;
    setSelectedTransaction(txn);
    setReceiptUploadError('');
    setCategoryPopoverOpen(false);
    setEditMode(false);
    loadTransactionImage(txn);
  };

  const handleReceiptUpload = async (file) => {
    if (!file || !selectedTransaction) return;
    setUploadingReceipt(true);
    setReceiptUploadError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      await transactionService.uploadReceipt(selectedTransaction.id, fd);
      // Refresh the image after successful upload
      await loadTransactionImage(selectedTransaction);
    } catch (err) {
      console.error('Receipt upload failed:', err);
      setReceiptUploadError('Upload failed. Please try again.');
    } finally {
      setUploadingReceipt(false);
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

  const openEdit = async () => {
    setEditForm({
      item:        selectedTransaction.item || '',
      quantity:    String(selectedTransaction.quantity ?? ''),
      unitPrice:   String(selectedTransaction.unitPrice ?? ''),
      vat_charged: String(selectedTransaction.vat_charged ?? ''),
    });
    setEditError('');
    setMoveImprestId('');
    setMoveSearch('');
    setMoveDropdownOpen(false);
    setMoveError('');
    setMoveSuccess('');
    setMoveProjectId('');
    setMoveProjectSearch('');
    setMoveProjectDropdownOpen(false);
    setEditMode(true);
    if (canMoveTransactions()) {
      try {
        const fetches = [];
        if (allImprests.length === 0) fetches.push(
          imprestService.getAllNames().then(r => setAllImprests(r.data?.response || []))
        );
        if (allProjects.length === 0) fetches.push(
          projectService.getAll().then(r => {
            const data = r.data?.projects;
            setAllProjects(Array.isArray(data) ? data : []);
          })
        );
        if (fetches.length > 0) await Promise.all(fetches);
      } catch {
        // non-fatal — move section just won't have options
      }
    }
  };

  const cancelEdit = () => {
    setEditMode(false);
    setEditError('');
    setMoveProjectId('');
    setMoveProjectSearch('');
    setMoveProjectDropdownOpen(false);
    setMoveImprestId('');
    setMoveSearch('');
    setMoveDropdownOpen(false);
    setMoveError('');
    setMoveSuccess('');
  };

  // ── Split handlers ────────────────────────────────────────────

  const openSplit = () => {
    const total = selectedTransaction.price || 0;
    const half  = parseFloat((total / 2).toFixed(2));
    const other = parseFloat((total - half).toFixed(2));
    setSplitParts([
      { item: selectedTransaction.item, amount: String(half) },
      { item: selectedTransaction.item, amount: String(other) },
    ]);
    setSplitError('');
    setSplitMode(true);
  };

  const updateSplitPart = (i, field, value) => {
    setSplitParts(prev => prev.map((p, idx) => idx === i ? { ...p, [field]: value } : p));
  };

  const addSplitPart = () => {
    setSplitParts(prev => [...prev, { item: selectedTransaction.item, amount: '' }]);
  };

  const removeSplitPart = (i) => {
    setSplitParts(prev => prev.filter((_, idx) => idx !== i));
  };

  const confirmSplit = async () => {
    for (const p of splitParts) {
      if (!p.item.trim()) { setSplitError('Every part needs an item description.'); return; }
      if (!p.amount || parseFloat(p.amount) <= 0) { setSplitError('Every part needs a positive amount.'); return; }
    }
    const total     = selectedTransaction.price;
    const allocated = splitParts.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
    if (Math.abs(total - allocated) > 0.005) {
      setSplitError(`Amounts must sum to ${formatCurrency(total)}.`);
      return;
    }
    setSplitSaving(true);
    setSplitError('');
    try {
      const parts = splitParts.map(p => ({
        item:  p.item.trim(),
        price: parseFloat(parseFloat(p.amount).toFixed(2)),
      }));
      const res     = await transactionService.split(selectedTransaction.id, parts);
      const newTxns = res.data?.transactions || [];
      setTransactions(prev => {
        const without = prev.filter(t => t.id !== selectedTransaction.id);
        return [...newTxns, ...without];
      });
      setTotalCount(prev => prev - 1 + newTxns.length);
      setSplitMode(false);
      setSelectedTransaction(null);
      setTransactionImageUrl(null);
    } catch {
      setSplitError('Failed to split transaction. Please try again.');
    } finally {
      setSplitSaving(false);
    }
  };

  const moveTransaction = async () => {
    if (!moveImprestId) { setMoveError('Please select a destination imprest.'); return; }
    if (moveImprestId === selectedTransaction.imprest_id) { setMoveError('Transaction is already in this imprest.'); return; }
    setMoveSaving(true);
    setMoveError('');
    setMoveSuccess('');
    try {
      await transactionService.move(selectedTransaction.id, moveImprestId);
      const destImprest = allImprests.find(i => i.id === moveImprestId);
      const updated = { ...selectedTransaction, imprest_id: moveImprestId, imprest: { ...selectedTransaction.imprest, id: moveImprestId, name: destImprest?.name || '' } };
      setSelectedTransaction(updated);
      setTransactions(prev => prev.map(t => t.id === updated.id ? { ...t, imprest_id: moveImprestId, imprest: updated.imprest } : t));
      setMoveSuccess(`Moved to ${destImprest?.name || 'new imprest'}.`);
      setMoveImprestId('');
    } catch {
      setMoveError('Failed to move transaction. Please try again.');
    } finally {
      setMoveSaving(false);
    }
  };

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

  const splitAllocated  = splitParts.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
  const splitRemainder  = parseFloat(((selectedTransaction?.price || 0) - splitAllocated).toFixed(2));
  const splitBalanced   = Math.abs(splitRemainder) < 0.005;

  const filteredImprests = moveProjectId
    ? allImprests.filter(i => i.project_id === moveProjectId)
    : allImprests;

  const unassignedCategories = categories.filter(
    c => !(selectedTransaction?.categories || []).some(tc => tc.id === c.id)
  );

  // ── Render ────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Loading transactions...</p>
      </div>
    );
  }

  return (
    <>
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
                      <>
                        <button className="txn-split-btn" onClick={openSplit}>Split</button>
                        <button className="txn-edit-btn" onClick={openEdit}>Edit</button>
                      </>
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

                      {canMoveTransactions() && (
                        <div className="txn-move-section">
                          <span className="txn-detail-label">Move to Imprest</span>

                          {/* Step 1 — project filter */}
                          <div className="txn-move-combo" ref={moveProjectComboRef}>
                            <input
                              className="txn-edit-input txn-move-search"
                              type="text"
                              placeholder="Filter by project (optional)…"
                              value={moveProjectSearch}
                              onFocus={() => setMoveProjectDropdownOpen(true)}
                              onChange={e => {
                                setMoveProjectSearch(e.target.value);
                                setMoveProjectId('');
                                setMoveProjectDropdownOpen(true);
                                setMoveImprestId('');
                                setMoveSearch('');
                                setMoveError('');
                                setMoveSuccess('');
                              }}
                            />
                            {moveProjectDropdownOpen && (
                              <div className="txn-move-dropdown">
                                <button
                                  className={`txn-move-dropdown-item${!moveProjectId ? ' selected' : ''}`}
                                  onMouseDown={e => {
                                    e.preventDefault();
                                    setMoveProjectId('');
                                    setMoveProjectSearch('');
                                    setMoveProjectDropdownOpen(false);
                                    setMoveImprestId('');
                                    setMoveSearch('');
                                  }}
                                >
                                  All projects
                                </button>
                                {allProjects
                                  .filter(p => p.name.toLowerCase().includes(moveProjectSearch.toLowerCase()))
                                  .map(p => (
                                    <button
                                      key={p.id}
                                      className={`txn-move-dropdown-item${moveProjectId === p.id ? ' selected' : ''}`}
                                      onMouseDown={e => {
                                        e.preventDefault();
                                        setMoveProjectId(p.id);
                                        setMoveProjectSearch(p.name);
                                        setMoveProjectDropdownOpen(false);
                                        setMoveImprestId('');
                                        setMoveSearch('');
                                        setMoveError('');
                                        setMoveSuccess('');
                                      }}
                                    >
                                      {p.name}
                                    </button>
                                  ))
                                }
                                {allProjects.filter(p => p.name.toLowerCase().includes(moveProjectSearch.toLowerCase())).length === 0 && (
                                  <span className="txn-move-dropdown-empty">No projects match</span>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Step 2 — imprest (filtered by selected project) */}
                          <div className="txn-move-row">
                            <div className="txn-move-combo" ref={moveComboRef}>
                              <input
                                className="txn-edit-input txn-move-search"
                                type="text"
                                placeholder="Search imprest…"
                                value={moveSearch}
                                onFocus={() => setMoveDropdownOpen(true)}
                                onChange={e => {
                                  setMoveSearch(e.target.value);
                                  setMoveImprestId('');
                                  setMoveDropdownOpen(true);
                                  setMoveError('');
                                  setMoveSuccess('');
                                }}
                              />
                              {moveDropdownOpen && (
                                <div className="txn-move-dropdown">
                                  {filteredImprests.filter(i =>
                                    i.name.toLowerCase().includes(moveSearch.toLowerCase())
                                  ).length === 0 ? (
                                    <span className="txn-move-dropdown-empty">No imprests match</span>
                                  ) : (
                                    filteredImprests
                                      .filter(i => i.name.toLowerCase().includes(moveSearch.toLowerCase()))
                                      .map(i => (
                                        <button
                                          key={i.id}
                                          className={`txn-move-dropdown-item${moveImprestId === i.id ? ' selected' : ''}`}
                                          onMouseDown={e => {
                                            e.preventDefault();
                                            setMoveImprestId(i.id);
                                            setMoveSearch(i.name);
                                            setMoveDropdownOpen(false);
                                            setMoveError('');
                                            setMoveSuccess('');
                                          }}
                                        >
                                          <span>{i.name}</span>
                                          {i.project?.name && (
                                            <span className="txn-move-imprest-project">{i.project.name}</span>
                                          )}
                                        </button>
                                      ))
                                  )}
                                </div>
                              )}
                            </div>
                            <button className="txn-move-btn" onClick={moveTransaction} disabled={moveSaving || !moveImprestId}>
                              {moveSaving ? 'Moving…' : 'Move'}
                            </button>
                          </div>

                          {moveError   && <p className="txn-edit-error">{moveError}</p>}
                          {moveSuccess && <p className="txn-move-success">{moveSuccess}</p>}
                        </div>
                      )}
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
                      ) : imageError ? (
                        <p className="image-error-message">{imageError}</p>
                      ) : hasNoReceipt ? (
                        <div className="txn-receipt-upload">
                          <label className={`txn-receipt-dropzone${uploadingReceipt ? ' uploading' : ''}`}>
                            <span className="txn-receipt-dz-icon">{uploadingReceipt ? '⏳' : '🧾'}</span>
                            <span className="txn-receipt-dz-main">
                              {uploadingReceipt ? 'Uploading…' : 'No receipt — click to upload'}
                            </span>
                            <span className="txn-receipt-dz-hint">PNG or PDF accepted</span>
                            <input
                              type="file"
                              accept="image/png,.pdf,application/pdf"
                              disabled={uploadingReceipt}
                              onChange={e => handleReceiptUpload(e.target.files[0] || null)}
                            />
                          </label>
                          {receiptUploadError && (
                            <p className="image-error-message">{receiptUploadError}</p>
                          )}
                        </div>
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

      {/* Split modal */}
      {splitMode && selectedTransaction && (
        <div className="split-modal-overlay" onClick={() => !splitSaving && setSplitMode(false)}>
          <div className="split-modal" onClick={e => e.stopPropagation()}>
            <div className="split-modal-header">
              <div>
                <h3>Split Transaction</h3>
                <p className="split-modal-subtitle">
                  {selectedTransaction.item} &middot; {formatCurrency(selectedTransaction.price)}
                </p>
              </div>
              <button className="close-preview-btn" onClick={() => setSplitMode(false)}>&times;</button>
            </div>

            <div className="split-parts-list">
              {splitParts.map((part, i) => (
                <div key={i} className="split-part-row">
                  <div className="split-part-header">
                    <span className="split-part-label">Part {i + 1}</span>
                    {splitParts.length > 2 && (
                      <button className="split-remove-btn" onClick={() => removeSplitPart(i)}>&times;</button>
                    )}
                  </div>
                  <div className="split-part-fields">
                    <input
                      className="txn-edit-input"
                      type="text"
                      placeholder="Item description"
                      value={part.item}
                      onChange={e => updateSplitPart(i, 'item', e.target.value)}
                    />
                    <input
                      className="txn-edit-input split-amount-input"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Amount (KES)"
                      value={part.amount}
                      onChange={e => updateSplitPart(i, 'amount', e.target.value)}
                    />
                  </div>
                </div>
              ))}
            </div>

            <button className="split-add-btn" onClick={addSplitPart}>+ Add Part</button>

            <div className={`split-remainder${splitBalanced ? ' balanced' : ''}`}>
              {splitBalanced
                ? 'Balanced ✓'
                : `Remaining: ${formatCurrency(splitRemainder)}`}
            </div>

            {splitError && <p className="txn-edit-error">{splitError}</p>}

            <div className="txn-edit-actions">
              <button className="txn-edit-cancel-btn" onClick={() => setSplitMode(false)} disabled={splitSaving}>
                Cancel
              </button>
              <button
                className="txn-edit-save-btn"
                onClick={confirmSplit}
                disabled={splitSaving || !splitBalanced}
              >
                {splitSaving ? 'Splitting…' : 'Confirm Split'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Transactions;
