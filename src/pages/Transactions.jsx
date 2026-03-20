import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { imprestService, transactionService, imageService, categoryService } from '../services/api';
import Layout from '../components/Layout';
import './Transactions.css';

const Transactions = () => {
  const { user, isAdmin } = useAuth();
  const [imprests, setImprests] = useState([]);
  const [selectedImprest, setSelectedImprest] = useState('');
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingTxns, setLoadingTxns] = useState(false);
  const [error, setError] = useState('');
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [transactionImageUrl, setTransactionImageUrl] = useState(null);
  const [loadingImage, setLoadingImage] = useState(false);
  const [imageError, setImageError] = useState('');

  // Categories
  const [categories, setCategories] = useState([]);
  const [categoryPopoverTxnId, setCategoryPopoverTxnId] = useState(null);

  useEffect(() => {
    fetchImprests();
    fetchCategories();
  }, [user]);

  useEffect(() => {
    if (selectedImprest) {
      fetchTransactions(selectedImprest);
      setSelectedTransaction(null);
      setTransactionImageUrl(null);
      setImageError('');
      setCategoryPopoverTxnId(null);
    }
  }, [selectedImprest]);

  // Close category popover when clicking outside
  useEffect(() => {
    if (!categoryPopoverTxnId) return;
    const close = () => setCategoryPopoverTxnId(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [categoryPopoverTxnId]);

  const fetchImprests = async () => {
    try {
      setLoading(true);
      setError('');

      let imprestList = [];
      if (isAdmin()) {
        const response = await imprestService.getAdminSummary();
        imprestList = (response.data.response || []).map(imp => ({
          id: imp.id,
          name: imp.imprestName,
          amount: imp.allocated,
          usedAmount: imp.usedAmount,
        }));
      } else {
        const response = await imprestService.getByUser(user.id);
        imprestList = (response.data.response || []).map(imp => ({
          id: imp.id,
          name: imp.name,
          amount: imp.amount,
          usedAmount: imp.totalTransactionPrice || 0,
        }));
      }
      setImprests(imprestList);

      if (imprestList.length > 0) {
        setSelectedImprest(imprestList[0].id);
      }
    } catch (err) {
      setError('Failed to load imprests.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchTransactions = async (imprestId) => {
    try {
      setLoadingTxns(true);
      const response = await transactionService.getByImprest(imprestId);
      const txns = response.data?.transactions?.rows;
      setTransactions(Array.isArray(txns) ? txns : []);
    } catch (err) {
      console.error('Failed to load transactions:', err);
      setTransactions([]);
    } finally {
      setLoadingTxns(false);
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

  const handleAssignCategory = async (e, txnId, catId) => {
    e.stopPropagation();
    try {
      await categoryService.assignToTransaction(txnId, catId);
      const cat = categories.find(c => c.id === catId);
      setTransactions(prev => prev.map(t =>
        t.id === txnId
          ? { ...t, categories: [...(t.categories || []), cat] }
          : t
      ));
      setCategoryPopoverTxnId(null);
    } catch (err) {
      console.error('Failed to assign category:', err);
    }
  };

  const handleRemoveCategory = async (e, txnId, catId) => {
    e.stopPropagation();
    try {
      await categoryService.removeFromTransaction(txnId, catId);
      setTransactions(prev => prev.map(t =>
        t.id === txnId
          ? { ...t, categories: (t.categories || []).filter(c => c.id !== catId) }
          : t
      ));
    } catch (err) {
      console.error('Failed to remove category:', err);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
    }).format(amount || 0);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-KE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getSelectedImprest = () => {
    return imprests.find((i) => i.id === selectedImprest);
  };

  const handleTransactionClick = async (txn) => {
    if (selectedTransaction?.id === txn.id) {
      setSelectedTransaction(null);
      setTransactionImageUrl(null);
      setImageError('');
      return;
    }

    setSelectedTransaction(txn);
    setTransactionImageUrl(null);
    setImageError('');

    if (!txn.images_id) {
      return;
    }

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

  if (loading) {
    return (
      <Layout>
        <div className="loading-container">
          <div className="spinner"></div>
          <p>Loading...</p>
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
            <p>View expenses recorded against imprests</p>
          </div>
        </div>

        {error && <div className="error-banner">{error}</div>}

        <div className="filter-section">
          <div className="form-group">
            <label htmlFor="imprestSelect">Select Imprest Account</label>
            <select
              id="imprestSelect"
              value={selectedImprest}
              onChange={(e) => setSelectedImprest(e.target.value)}
            >
              {imprests.map((imprest) => (
                <option key={imprest.id} value={imprest.id}>
                  {imprest.name} - Balance: {formatCurrency((imprest.amount || 0) - (imprest.usedAmount || 0))}
                </option>
              ))}
            </select>
          </div>
        </div>

        {getSelectedImprest() && (
          <div className="imprest-summary">
            <div className="summary-item">
              <span className="label">Allocated</span>
              <span className="value credit">{formatCurrency(getSelectedImprest().amount)}</span>
            </div>
            <div className="summary-item">
              <span className="label">Used</span>
              <span className="value debit">{formatCurrency(getSelectedImprest().usedAmount)}</span>
            </div>
            <div className="summary-item">
              <span className="label">Balance</span>
              <span className="value">
                {formatCurrency((getSelectedImprest().amount || 0) - (getSelectedImprest().usedAmount || 0))}
              </span>
            </div>
          </div>
        )}

        <div className="transactions-container">
          {loadingTxns ? (
            <div className="loading-container small">
              <div className="spinner"></div>
            </div>
          ) : transactions.length === 0 ? (
            <div className="no-data">
              <p>No transactions recorded yet.</p>
            </div>
          ) : (
            <table className="transactions-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Item</th>
                  <th>Qty</th>
                  <th>Unit Price</th>
                  <th>VAT</th>
                  <th>Total</th>
                  <th>Categories</th>
                  <th>Receipt</th>
                </tr>
              </thead>
              <tbody>
                {(transactions || []).map((txn) => (
                  <tr
                    key={txn.id}
                    onClick={() => handleTransactionClick(txn)}
                    className={selectedTransaction?.id === txn.id ? 'selected' : ''}
                  >
                    <td>{formatDate(txn.createdAt)}</td>
                    <td>{txn.item}</td>
                    <td>{txn.quantity}</td>
                    <td>{formatCurrency(txn.unitPrice)}</td>
                    <td>{formatCurrency(txn.vat_charged)}</td>
                    <td className="debit">{formatCurrency(txn.price)}</td>
                    <td
                      className="categories-cell"
                      onClick={e => e.stopPropagation()}
                    >
                      <div className="categories-in-row">
                        {(txn.categories || []).map(cat => (
                          <span key={cat.id} className="category-tag">
                            {cat.cat_name}
                            <button
                              className="remove-tag-btn"
                              onClick={e => handleRemoveCategory(e, txn.id, cat.id)}
                            >×</button>
                          </span>
                        ))}
                        <button
                          className="add-category-btn"
                          onClick={e => {
                            e.stopPropagation();
                            setCategoryPopoverTxnId(categoryPopoverTxnId === txn.id ? null : txn.id);
                          }}
                        >+</button>
                      </div>
                      {categoryPopoverTxnId === txn.id && (
                        <div className="category-popover" onClick={e => e.stopPropagation()}>
                          {categories
                            .filter(c => !(txn.categories || []).some(tc => tc.id === c.id))
                            .map(cat => (
                              <button
                                key={cat.id}
                                className="category-popover-item"
                                onClick={e => handleAssignCategory(e, txn.id, cat.id)}
                              >
                                {cat.cat_name}
                              </button>
                            ))
                          }
                          {categories.filter(c => !(txn.categories || []).some(tc => tc.id === c.id)).length === 0 && (
                            <span className="category-popover-empty">All categories assigned</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td>
                      {txn.images_id ? (
                        <span className="has-receipt">📎</span>
                      ) : (
                        <span className="no-receipt">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan="5" className="total-label">Total:</td>
                  <td className="debit">
                    {formatCurrency((transactions || []).reduce((sum, t) => sum + parseFloat(t.price || 0), 0))}
                  </td>
                  <td></td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          )}

          {selectedTransaction && (
            <div className="transaction-image-preview">
              <div className="preview-header">
                <h3>Receipt for: {selectedTransaction.item}</h3>
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
              <div className="preview-content">
                {loadingImage ? (
                  <div className="loading-container small">
                    <div className="spinner"></div>
                    <p>Loading file...</p>
                  </div>
                ) : imageError ? (
                  <p className="image-error-message">{imageError}</p>
                ) : transactionImageUrl ? (
                  transactionImageUrl.toLowerCase().endsWith('.pdf') ? (
                    <iframe
                      src={transactionImageUrl}
                      title={`Receipt for ${selectedTransaction.item}`}
                      className="pdf-preview"
                    />
                  ) : (
                    <img
                      src={transactionImageUrl}
                      alt={`Receipt for ${selectedTransaction.item}`}
                      onClick={() => window.open(transactionImageUrl, '_blank')}
                    />
                  )
                ) : (
                  <p className="no-image-message">No receipt attached to this transaction.</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

    </Layout>
  );
};

export default Transactions;
