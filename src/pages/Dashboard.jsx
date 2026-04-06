import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { imprestService, transactionService, imageService } from '../services/api';
import Layout from '../components/Layout';
import './Dashboard.css';

const Dashboard = () => {
  const { user, isAdmin } = useAuth();
  const [imprests, setImprests] = useState([]);
  const [selectedImprest, setSelectedImprest] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [transactionImageUrl, setTransactionImageUrl] = useState(null);
  const [loadingImage, setLoadingImage] = useState(false);
  const [filterText, setFilterText] = useState('');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');

  useEffect(() => {
    fetchData();
  }, [user]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData(true);
    setRefreshing(false);
  };

  const fetchData = async (isRefresh = false) => {
    try {
      if (!isRefresh) setLoading(true);
      setError('');

      if (isAdmin()) {
        const [summaryRes, imprestsRes] = await Promise.all([
          imprestService.getAdminTotals(),
          imprestService.getAdminSummary(),
        ]);
        setSummary({
          totalAllocated: summaryRes.data.totalAllocated,
          totalUsed: summaryRes.data.totalUsedAmount,
        });
        // Admin summary returns { response: [...] } with different field names
        const adminImprests = (imprestsRes.data.response || []).map(imp => ({
          id: imp.id,
          name: imp.imprestName,
          amount: imp.allocated,
          usedAmount: imp.usedAmount,
          source: imp.source || 'company imprest',
          createdAt: imp.createdAt,
          assignedTo: imp.assignedTo,
          project: imp.project || null,
        }));
        setImprests(adminImprests);
      } else {
        const response = await imprestService.getByUser(user.id);
        // Staff endpoint returns { response: [...] }
        const staffImprests = (response.data.response || []).map(imp => ({
          id: imp.id,
          name: imp.name,
          amount: imp.amount,
          usedAmount: imp.totalTransactionPrice || 0,
          source: imp.source,
          closedStatus_Flag: imp.closedStatus_Flag,
          createdAt: imp.createdAt,
        }));
        setImprests(staffImprests);
      }
    } catch (err) {
      setError('Failed to load data. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleImprestClick = async (imprest) => {
    setSelectedImprest(imprest);
    setSelectedTransaction(null);
    setTransactionImageUrl(null);
    try {
      const response = await transactionService.getByImprest(imprest.id);
      // API returns { transactions: { count, rows: [...] } }
      const txns = response.data?.transactions?.rows;
      setTransactions(Array.isArray(txns) ? txns : []);
    } catch (err) {
      console.error('Failed to load transactions:', err);
      setTransactions([]);
    }
  };

  const handleTransactionClick = async (txn) => {
    if (selectedTransaction?.id === txn.id) {
      setSelectedTransaction(null);
      setTransactionImageUrl(null);
      return;
    }

    setSelectedTransaction(txn);
    setTransactionImageUrl(null);

    if (!txn.images_id) {
      return;
    }

    try {
      setLoadingImage(true);
      const response = await imageService.getTransactionImage(txn.images_id);
      const imagePath = response.data?.path;
      if (imagePath) {
        setTransactionImageUrl(imageService.getImageUrl(imagePath));
      }
    } catch (err) {
      console.error('Failed to load transaction image:', err);
    } finally {
      setLoadingImage(false);
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
    });
  };

  const calculateBalance = (imprest) => {
    const allocated = parseFloat(imprest.amount) || 0;
    const used = parseFloat(imprest.usedAmount) || 0;
    return allocated - used;
  };

  const filteredImprests = [...imprests]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .filter((imp) => {
      if (filterText && !imp.name.toLowerCase().includes(filterText.toLowerCase())) return false;
      const created = new Date(imp.createdAt);
      if (filterStartDate && created < new Date(filterStartDate)) return false;
      if (filterEndDate && created > new Date(filterEndDate + 'T23:59:59')) return false;
      return true;
    });

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
      <div className="dashboard">
        <div className="dashboard-header">
          <div>
            <h1>Account Statement</h1>
            <p>Welcome back, {user?.name}</p>
          </div>
          <button
            className={`refresh-btn ${refreshing ? 'spinning' : ''}`}
            onClick={handleRefresh}
            disabled={refreshing}
            title="Refresh"
          >
            ↻
          </button>
        </div>

        {error && <div className="error-banner">{error}</div>}

        {isAdmin() && summary && (
          <div className="summary-cards">
            <div className="summary-card credit">
              <h3>Total Allocated</h3>
              <p className="amount">{formatCurrency(summary.totalAllocated)}</p>
              <span className="label">Credit</span>
            </div>
            <div className="summary-card debit">
              <h3>Total Used</h3>
              <p className="amount">{formatCurrency(summary.totalUsed)}</p>
              <span className="label">Debit</span>
            </div>
            <div className="summary-card balance">
              <h3>Balance</h3>
              <p className="amount">{formatCurrency(summary.totalAllocated - summary.totalUsed)}</p>
              <span className="label">Available</span>
            </div>
          </div>
        )}

        <div className="dashboard-content">
          <div className="imprests-panel">
            <h2>Imprest Accounts</h2>

            <div className="imprest-filters">
              <input
                type="text"
                className="filter-input"
                placeholder="Search by title..."
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
              />
              <div className="filter-dates">
                <div className="filter-date-group">
                  <label>From</label>
                  <input
                    type="date"
                    className="filter-input"
                    value={filterStartDate}
                    onChange={(e) => setFilterStartDate(e.target.value)}
                  />
                </div>
                <div className="filter-date-group">
                  <label>To</label>
                  <input
                    type="date"
                    className="filter-input"
                    value={filterEndDate}
                    onChange={(e) => setFilterEndDate(e.target.value)}
                  />
                </div>
              </div>
              {(filterText || filterStartDate || filterEndDate) && (
                <button
                  className="clear-filters-btn"
                  onClick={() => { setFilterText(''); setFilterStartDate(''); setFilterEndDate(''); }}
                >
                  Clear filters
                </button>
              )}
            </div>

            {imprests.length === 0 ? (
              <p className="no-data">No imprest accounts found.</p>
            ) : filteredImprests.length === 0 ? (
              <p className="no-data">No imprests match the current filters.</p>
            ) : (
              <ul className="imprest-list">
                {filteredImprests.map((imprest) => (
                  <li
                    key={imprest.id}
                    className={`imprest-item ${selectedImprest?.id === imprest.id ? 'selected' : ''}`}
                    onClick={() => handleImprestClick(imprest)}
                  >
                    <div className="imprest-info">
                      <h4 className="imprest-title">{imprest.name}</h4>
                      <div className="imprest-tags">
                        <span className={`source-badge ${imprest.source?.replace(/\s+/g, '-').toLowerCase()}`}>
                          {imprest.source}
                        </span>
                        {imprest.project && (
                          <span className="project-badge">
                            🗂️ {imprest.project.name}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="imprest-date">{formatDate(imprest.createdAt)}</span>
                    <div className="imprest-amounts">
                      <div className="amount-row">
                        <span className="label">Allocated:</span>
                        <span className="credit-amount">{formatCurrency(imprest.amount)}</span>
                      </div>
                      <div className="amount-row">
                        <span className="label">Used:</span>
                        <span className="debit-amount">{formatCurrency(imprest.usedAmount)}</span>
                      </div>
                      <div className="amount-row balance">
                        <span className="label">Balance:</span>
                        <span className={calculateBalance(imprest) >= 0 ? 'positive' : 'negative'}>
                          {formatCurrency(calculateBalance(imprest))}
                        </span>
                      </div>
                    </div>
                    <div className="expense-progress">
                      <div className="progress-bar">
                        <div
                          className="progress-fill"
                          style={{ width: `${Math.min(((imprest.usedAmount || 0) / (imprest.amount || 1)) * 100, 100)}%` }}
                        ></div>
                      </div>
                      <span className="progress-label">
                        {Math.round(((imprest.usedAmount || 0) / (imprest.amount || 1)) * 100)}% expensed
                      </span>
                    </div>
                    {imprest.assignedTo && imprest.assignedTo.length > 0 && (
                      <div className="imprest-assignee">
                        Assigned to: {imprest.assignedTo.map(u => u.name).join(', ')}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="transactions-panel">
            <h2>
              {selectedImprest ? `Transactions - ${selectedImprest.name}` : 'Select an Imprest Account'}
            </h2>
            {selectedImprest ? (
              transactions.length === 0 ? (
                <p className="no-data">No transactions recorded yet.</p>
              ) : (
                <>
                <table className="transactions-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Item</th>
                      <th>Qty</th>
                      <th>Unit Price</th>
                      <th>VAT</th>
                      <th>Total (Debit)</th>
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
                        <td className="debit-amount">{formatCurrency(txn.price)}</td>
                        <td>{txn.images_id ? '📎' : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan="5" className="total-label">Total Debits:</td>
                      <td className="debit-amount" colSpan="2">
                        {formatCurrency((transactions || []).reduce((sum, t) => sum + parseFloat(t.price || 0), 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>

                {selectedTransaction && (
                  <div className="transaction-image-preview">
                    <div className="preview-header">
                      <h3>Receipt: {selectedTransaction.item}</h3>
                      <button
                        className="close-preview-btn"
                        onClick={() => {
                          setSelectedTransaction(null);
                          setTransactionImageUrl(null);
                        }}
                      >
                        &times;
                      </button>
                    </div>
                    <div className="preview-content">
                      {loadingImage ? (
                        <div className="loading-spinner">
                          <div className="spinner"></div>
                          <p>Loading file...</p>
                        </div>
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
                        <p className="no-image">No receipt attached.</p>
                      )}
                    </div>
                  </div>
                )}
                </>
              )
            ) : (
              <p className="no-data">Click on an imprest account to view its transactions.</p>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Dashboard;
