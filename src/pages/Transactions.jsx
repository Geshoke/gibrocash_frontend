import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { imprestService, transactionService, imageService } from '../services/api';
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
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    item: '',
    itemQuantity: 1,
    unitPrice: '',
    vat_charged: 0,
    receipt: null,
  });
  const [submitting, setSubmitting] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [transactionImageUrl, setTransactionImageUrl] = useState(null);
  const [loadingImage, setLoadingImage] = useState(false);
  const [imageError, setImageError] = useState('');

  useEffect(() => {
    fetchImprests();
  }, [user]);

  useEffect(() => {
    if (selectedImprest) {
      fetchTransactions(selectedImprest);
      setSelectedTransaction(null);
      setTransactionImageUrl(null);
      setImageError('');
    }
  }, [selectedImprest]);

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
      // API returns { transactions: { count, rows: [...] } }
      const txns = response.data?.transactions?.rows;
      setTransactions(Array.isArray(txns) ? txns : []);
    } catch (err) {
      console.error('Failed to load transactions:', err);
      setTransactions([]);
    } finally {
      setLoadingTxns(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type, files } = e.target;
    if (type === 'file') {
      setFormData((prev) => ({ ...prev, receipt: files[0] }));
      if (files[0]) {
        const reader = new FileReader();
        reader.onloadend = () => setPreviewImage(reader.result);
        reader.readAsDataURL(files[0]);
      }
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  const calculateTotal = () => {
    const qty = parseFloat(formData.itemQuantity) || 0;
    const price = parseFloat(formData.unitPrice) || 0;
    const vat = parseFloat(formData.vat_charged) || 0;
    return (qty * price) + vat;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      let imageUrl = '';

      if (formData.receipt) {
        const uploadFormData = new FormData();
        uploadFormData.append('file', formData.receipt);
        uploadFormData.append('imprest_id', selectedImprest);
        const uploadRes = await imageService.uploadToImprest(uploadFormData);
        imageUrl = uploadRes.data?.url || '';
      }

      await transactionService.create({
        item: formData.item,
        itemQuantity: parseInt(formData.itemQuantity),
        unitPrice: parseFloat(formData.unitPrice),
        Total_amount: calculateTotal(),
        imprestAccount_id: selectedImprest,
        userID: user.id,
        vat_charged: parseFloat(formData.vat_charged) || 0,
        url_image: imageUrl,
      });

      setShowModal(false);
      setFormData({
        item: '',
        itemQuantity: 1,
        unitPrice: '',
        vat_charged: 0,
        receipt: null,
      });
      setPreviewImage(null);
      fetchTransactions(selectedImprest);
      fetchImprests();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create transaction.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (transactionId) => {
    if (!window.confirm('Are you sure you want to delete this transaction?')) {
      return;
    }

    try {
      await transactionService.delete(transactionId);
      fetchTransactions(selectedImprest);
      fetchImprests();
    } catch (err) {
      setError('Failed to delete transaction.');
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
            <p>Record and track expenses against imprests</p>
          </div>
          {selectedImprest && (
            <button className="create-button" onClick={() => setShowModal(true)}>
              + Add Transaction
            </button>
          )}
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
              <button className="create-button" onClick={() => setShowModal(true)}>
                + Add First Transaction
              </button>
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
                  <th>Receipt</th>
                  <th>Actions</th>
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
                    <td>
                      {txn.images_id ? (
                        <span className="has-receipt">📎</span>
                      ) : (
                        <span className="no-receipt">-</span>
                      )}
                    </td>
                    <td>
                      <button
                        className="delete-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(txn.id);
                        }}
                        title="Delete transaction"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan="5" className="total-label">Total:</td>
                  <td className="debit" colSpan="3">
                    {formatCurrency((transactions || []).reduce((sum, t) => sum + parseFloat(t.price || 0), 0))}
                  </td>
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

        {showModal && (
          <div className="modal-overlay" onClick={() => setShowModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Add Transaction</h2>
                <button className="close-button" onClick={() => setShowModal(false)}>
                  &times;
                </button>
              </div>

              <form onSubmit={handleSubmit} className="modal-form">
                <div className="form-group">
                  <label htmlFor="item">Item Description</label>
                  <input
                    type="text"
                    id="item"
                    name="item"
                    value={formData.item}
                    onChange={handleInputChange}
                    placeholder="e.g., Office supplies"
                    required
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="itemQuantity">Quantity</label>
                    <input
                      type="number"
                      id="itemQuantity"
                      name="itemQuantity"
                      value={formData.itemQuantity}
                      onChange={handleInputChange}
                      min="1"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="unitPrice">Unit Price (KES)</label>
                    <input
                      type="number"
                      id="unitPrice"
                      name="unitPrice"
                      value={formData.unitPrice}
                      onChange={handleInputChange}
                      placeholder="0.00"
                      min="0"
                      step="0.01"
                      required
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="vat_charged">VAT Charged (KES)</label>
                  <input
                    type="number"
                    id="vat_charged"
                    name="vat_charged"
                    value={formData.vat_charged}
                    onChange={handleInputChange}
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                  />
                </div>

                <div className="total-preview">
                  <span>Total Amount:</span>
                  <span className="total-value">{formatCurrency(calculateTotal())}</span>
                </div>

                <div className="form-group">
                  <label htmlFor="receipt">Receipt (Image/PDF)</label>
                  <input
                    type="file"
                    id="receipt"
                    name="receipt"
                    onChange={handleInputChange}
                    accept="image/*,.pdf"
                  />
                  {previewImage && (
                    <div className="receipt-preview">
                      <img src={previewImage} alt="Receipt preview" />
                    </div>
                  )}
                </div>

                <div className="modal-actions">
                  <button type="button" className="cancel-button" onClick={() => setShowModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="submit-button" disabled={submitting}>
                    {submitting ? 'Adding...' : 'Add Transaction'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Transactions;
