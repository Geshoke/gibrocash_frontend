import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { imprestService, userService } from '../services/api';
import Layout from '../components/Layout';
import './Imprests.css';

const Imprests = () => {
  const { user, isAdmin } = useAuth();
  const [imprests, setImprests] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    amount: '',
    ImprestType: 'company imprest',
    assignedTo: '',
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchData();
  }, [user]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError('');

      if (isAdmin()) {
        const [imprestsRes, usersRes] = await Promise.all([
          imprestService.getAdminSummary(),
          userService.getUsers(user.id),
        ]);
        // Admin summary returns { response: [...] }
        const adminImprests = (imprestsRes.data.response || []).map(imp => ({
          id: imp.id,
          name: imp.imprestName,
          amount: imp.allocated,
          usedAmount: imp.usedAmount,
          source: imp.source || 'company imprest',
          createdAt: imp.createdAt,
          assignedTo: imp.assignedTo,
        }));
        setImprests(adminImprests);
        // Users API returns { response: [...] }
        setUsers(usersRes.data.response || []);
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
      setError('Failed to load imprests. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      const selectedUser = users.find((u) => u.id === formData.assignedTo);
      await imprestService.create({
        name: formData.name,
        amount: parseFloat(formData.amount),
        createdBy: user.id,
        assignedTo: {
          id: selectedUser.id,
          phone: selectedUser.phone,
        },
        ImprestType: formData.ImprestType,
      });

      setShowModal(false);
      setFormData({
        name: '',
        amount: '',
        ImprestType: 'company imprest',
        assignedTo: '',
      });
      fetchData();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create imprest.');
    } finally {
      setSubmitting(false);
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

  const getStatusClass = (imprest) => {
    const balance = calculateBalance(imprest);
    if (imprest.closedStatus_Flag) return 'closed';
    if (balance <= 0) return 'depleted';
    if (balance < imprest.amount * 0.2) return 'low';
    return 'active';
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
      <div className="imprests-page">
        <div className="page-header">
          <div>
            <h1>Imprest Accounts</h1>
            <p>Manage and track imprest allocations</p>
          </div>
          {isAdmin() && (
            <button className="create-button" onClick={() => setShowModal(true)}>
              + Create Imprest
            </button>
          )}
        </div>

        {error && <div className="error-banner">{error}</div>}

        <div className="imprests-grid">
          {imprests.length === 0 ? (
            <div className="no-data-card">
              <p>No imprest accounts found.</p>
            </div>
          ) : (
            [...imprests]
              .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
              .map((imprest) => (
              <div key={imprest.id} className={`imprest-card ${getStatusClass(imprest)}`}>
                <div className="card-header">
                  <div>
                    <h3>{imprest.name}</h3>
                    <div className="card-meta">
                      <span className="card-date">{formatDate(imprest.createdAt)}</span>
                      {imprest.assignedTo && imprest.assignedTo.length > 0 && (
                        <span className="card-assignee">
                          {imprest.assignedTo.map(u => u.name).join(', ')}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className={`status-badge ${getStatusClass(imprest)}`}>
                    {imprest.closedStatus_Flag ? 'Closed' : 'Active'}
                  </span>
                </div>

                <div className="card-body">
                  <div className="source-tag">
                    {imprest.source}
                  </div>

                  <div className="amounts-grid">
                    <div className="amount-item">
                      <span className="label">Allocated</span>
                      <span className="value credit">{formatCurrency(imprest.amount)}</span>
                    </div>
                    <div className="amount-item">
                      <span className="label">Used</span>
                      <span className="value debit">{formatCurrency(imprest.usedAmount)}</span>
                    </div>
                    <div className="amount-item full-width">
                      <span className="label">Balance</span>
                      <span className={`value ${calculateBalance(imprest) >= 0 ? 'positive' : 'negative'}`}>
                        {formatCurrency(calculateBalance(imprest))}
                      </span>
                    </div>
                  </div>

                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={{
                        width: `${Math.min(((imprest.usedAmount || 0) / imprest.amount) * 100, 100)}%`,
                      }}
                    ></div>
                  </div>
                  <span className="progress-label">
                    {Math.round(((imprest.usedAmount || 0) / imprest.amount) * 100)}% utilized
                  </span>
                </div>

                <div className="card-footer">
                  <span className="date">Created: {formatDate(imprest.createdAt)}</span>
                </div>
              </div>
            ))
          )}
        </div>

        {showModal && (
          <div className="modal-overlay" onClick={() => setShowModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Create New Imprest</h2>
                <button className="close-button" onClick={() => setShowModal(false)}>
                  &times;
                </button>
              </div>

              <form onSubmit={handleSubmit} className="modal-form">
                <div className="form-group">
                  <label htmlFor="name">Imprest Name</label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    placeholder="e.g., Office Supplies Q1"
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="amount">Amount (KES)</label>
                  <input
                    type="number"
                    id="amount"
                    name="amount"
                    value={formData.amount}
                    onChange={handleInputChange}
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="ImprestType">Imprest Type</label>
                  <select
                    id="ImprestType"
                    name="ImprestType"
                    value={formData.ImprestType}
                    onChange={handleInputChange}
                    required
                  >
                    <option value="company imprest">Company Imprest</option>
                    <option value="directors advance">Directors Advance</option>
                    <option value="loan">Loan</option>
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="assignedTo">Assign To</label>
                  <select
                    id="assignedTo"
                    name="assignedTo"
                    value={formData.assignedTo}
                    onChange={handleInputChange}
                    required
                  >
                    <option value="">Select a user</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.phone})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="modal-actions">
                  <button type="button" className="cancel-button" onClick={() => setShowModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="submit-button" disabled={submitting}>
                    {submitting ? 'Creating...' : 'Create Imprest'}
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

export default Imprests;
