import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { transactionService, imageService, categoryService } from '../services/api';
import Layout from '../components/Layout';
import './Transactions.css';

const Transactions = () => {
  const { user, isAdmin } = useAuth();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [transactionImageUrl, setTransactionImageUrl] = useState(null);
  const [loadingImage, setLoadingImage] = useState(false);
  const [imageError, setImageError] = useState('');
  const [categories, setCategories] = useState([]);
  const [categoryPopoverOpen, setCategoryPopoverOpen] = useState(false);

  useEffect(() => {
    fetchTransactions();
    fetchCategories();
  }, [user]);

  useEffect(() => {
    if (!categoryPopoverOpen) return;
    const close = () => setCategoryPopoverOpen(false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [categoryPopoverOpen]);

  const LIMIT = 50;

  const fetchTransactions = async () => {
    try {
      setLoading(true);
      const userId = isAdmin() ? undefined : user.id;
      const response = await transactionService.getAll(userId, 1, LIMIT);
      const rows = response.data?.transactions?.rows || [];
      const count = response.data?.transactions?.count || 0;
      setTransactions(rows);
      setPage(1);
      setHasMore(rows.length < count);
    } catch (err) {
      console.error('Failed to load transactions:', err);
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  };

  const loadMore = async () => {
    try {
      setLoadingMore(true);
      const nextPage = page + 1;
      const userId = isAdmin() ? undefined : user.id;
      const response = await transactionService.getAll(userId, nextPage, LIMIT);
      const rows = response.data?.transactions?.rows || [];
      const count = response.data?.transactions?.count || 0;
      setTransactions(prev => {
        const updated = [...prev, ...rows];
        setHasMore(updated.length < count);
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

  const handleTransactionClick = async (txn) => {
    if (selectedTransaction?.id === txn.id) return;

    setSelectedTransaction(txn);
    setTransactionImageUrl(null);
    setImageError('');
    setCategoryPopoverOpen(false);

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

  const handleAssignCategory = async (e, catId) => {
    e.stopPropagation();
    const txnId = selectedTransaction.id;
    try {
      await categoryService.assignToTransaction(txnId, catId);
      const cat = categories.find(c => c.id === catId);
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

  const formatCurrency = (amount) =>
    new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(amount || 0);

  const formatDate = (dateString) =>
    new Date(dateString).toLocaleDateString('en-KE', {
      month: 'short', day: 'numeric', year: 'numeric',
    });

  const formatTime = (dateString) =>
    new Date(dateString).toLocaleTimeString('en-KE', {
      hour: '2-digit', minute: '2-digit',
    });

  const unassignedCategories = categories.filter(
    c => !(selectedTransaction?.categories || []).some(tc => tc.id === c.id)
  );

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
        <div className="page-header">
          <div>
            <h1>Transactions</h1>
            <p>{transactions.length} expense{transactions.length !== 1 ? 's' : ''} recorded</p>
          </div>
        </div>

        <div className="txn-split-layout">
          {/* LEFT — transaction list */}
          <div className="txn-list-panel">
            {transactions.length === 0 ? (
              <div className="no-data"><p>No transactions recorded yet.</p></div>
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
                  </div>
                ))}
                {hasMore && (
                  <button
                    className="load-more-btn"
                    onClick={loadMore}
                    disabled={loadingMore}
                  >
                    {loadingMore ? 'Loading...' : 'Load more'}
                  </button>
                )}
              </>
            )}
          </div>

          {/* RIGHT — detail panel */}
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
                    <span className="txn-detail-imprest-badge">{selectedTransaction.imprest?.name || '—'}</span>
                  </div>
                  <button
                    className="close-preview-btn"
                    onClick={() => {
                      setSelectedTransaction(null);
                      setTransactionImageUrl(null);
                      setImageError('');
                    }}
                  >
                    &times;
                  </button>
                </div>

                <div className="txn-detail-body">
                  <div className="txn-detail-grid">
                    <div className="txn-detail-field">
                      <span className="txn-detail-label">Date</span>
                      <span className="txn-detail-value">{formatDate(selectedTransaction.createdAt)} {formatTime(selectedTransaction.createdAt)}</span>
                    </div>
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

                  {/* Categories */}
                  <div className="txn-detail-section">
                    <div className="txn-detail-section-header">
                      <span className="txn-detail-section-title">Categories</span>
                      <div className="category-add-wrapper" onClick={e => e.stopPropagation()}>
                        <button
                          className="add-category-btn"
                          onClick={e => {
                            e.stopPropagation();
                            setCategoryPopoverOpen(v => !v);
                          }}
                        >+</button>
                        {categoryPopoverOpen && (
                          <div className="category-popover" onClick={e => e.stopPropagation()}>
                            {unassignedCategories.length === 0 ? (
                              <span className="category-popover-empty">All categories assigned</span>
                            ) : (
                              unassignedCategories.map(cat => (
                                <button
                                  key={cat.id}
                                  className="category-popover-item"
                                  onClick={e => handleAssignCategory(e, cat.id)}
                                >
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
                            <button
                              className="remove-tag-btn"
                              onClick={e => handleRemoveCategory(e, cat.id)}
                            >×</button>
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
                          <iframe
                            src={transactionImageUrl}
                            title="Receipt"
                            className="pdf-preview"
                          />
                        ) : (
                          <img
                            src={transactionImageUrl}
                            alt="Receipt"
                            onClick={() => window.open(transactionImageUrl, '_blank')}
                          />
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
