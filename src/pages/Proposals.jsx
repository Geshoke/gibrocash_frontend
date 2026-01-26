import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { proposalService } from '../services/api';
import Layout from '../components/Layout';
import './Proposals.css';

const Proposals = () => {
  const { user, isAdmin } = useAuth();
  const [proposals, setProposals] = useState([]);
  const [selectedProposal, setSelectedProposal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    items: [{ name: '', quantity: 1, price: '' }],
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchProposals();
  }, []);

  const fetchProposals = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await proposalService.getAll();
      // API returns { response: "success", proposals: [...] }
      setProposals(response.data.proposals || []);
    } catch (err) {
      setError('Failed to load proposals.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetails = async (proposalId) => {
    try {
      const response = await proposalService.getById(proposalId);
      // API returns { response: "success", proposal: {...} }
      setSelectedProposal(response.data.proposal);
    } catch (err) {
      console.error('Failed to load proposal details:', err);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleItemChange = (index, field, value) => {
    setFormData((prev) => {
      const newItems = [...prev.items];
      newItems[index] = { ...newItems[index], [field]: value };
      return { ...prev, items: newItems };
    });
  };

  const addItem = () => {
    setFormData((prev) => ({
      ...prev,
      items: [...prev.items, { name: '', quantity: 1, price: '' }],
    }));
  };

  const removeItem = (index) => {
    if (formData.items.length > 1) {
      setFormData((prev) => ({
        ...prev,
        items: prev.items.filter((_, i) => i !== index),
      }));
    }
  };

  const calculateTotal = () => {
    return formData.items.reduce((sum, item) => {
      return sum + (parseFloat(item.quantity) || 0) * (parseFloat(item.price) || 0);
    }, 0);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      await proposalService.create({
        title: formData.title,
        amount: calculateTotal(),
        createdBy: user.id,
        items: formData.items.map((item) => ({
          name: item.name,
          quantity: parseInt(item.quantity),
          price: parseFloat(item.price),
        })),
      });

      setShowModal(false);
      setFormData({
        title: '',
        items: [{ name: '', quantity: 1, price: '' }],
      });
      fetchProposals();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create proposal.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusUpdate = async (proposalId, newStatus) => {
    try {
      await proposalService.updateStatus({
        proposalId,
        status: newStatus,
      });
      fetchProposals();
      if (selectedProposal?.id === proposalId) {
        handleViewDetails(proposalId);
      }
    } catch (err) {
      setError('Failed to update proposal status.');
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

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'approved':
        return 'approved';
      case 'rejected':
        return 'rejected';
      case 'partial':
        return 'partial';
      default:
        return 'pending';
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
      <div className="proposals-page">
        <div className="page-header">
          <div>
            <h1>Proposals</h1>
            <p>Create and manage imprest proposals</p>
          </div>
          <button className="create-button" onClick={() => setShowModal(true)}>
            + New Proposal
          </button>
        </div>

        {error && <div className="error-banner">{error}</div>}

        <div className="proposals-content">
          <div className="proposals-list-panel">
            <h2>All Proposals</h2>
            {proposals.length === 0 ? (
              <div className="no-data">
                <p>No proposals found.</p>
              </div>
            ) : (
              <div className="proposals-list">
                {proposals.map((proposal) => (
                  <div
                    key={proposal.id}
                    className={`proposal-card ${selectedProposal?.id === proposal.id ? 'selected' : ''}`}
                    onClick={() => handleViewDetails(proposal.id)}
                  >
                    <div className="proposal-header">
                      <h3>{proposal.name}</h3>
                      <span className={`status-badge ${getStatusColor(proposal.status)}`}>
                        {proposal.status}
                      </span>
                    </div>
                    <div className="proposal-meta">
                      <span className="amount">{formatCurrency(proposal.total)}</span>
                      <span className="date">{formatDate(proposal.createdAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="proposal-details-panel">
            {selectedProposal ? (
              <>
                <div className="details-header">
                  <h2>{selectedProposal.name}</h2>
                  <span className={`status-badge large ${getStatusColor(selectedProposal.status)}`}>
                    {selectedProposal.status}
                  </span>
                </div>

                <div className="details-meta">
                  <div className="meta-item">
                    <span className="label">Total Amount</span>
                    <span className="value">{formatCurrency(selectedProposal.total)}</span>
                  </div>
                  <div className="meta-item">
                    <span className="label">Created</span>
                    <span className="value">{formatDate(selectedProposal.createdAt)}</span>
                  </div>
                </div>

                <div className="items-section">
                  <h3>Proposed Items</h3>
                  <table className="items-table">
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th>Quantity</th>
                        <th>Price</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedProposal.item_proposed_tbls?.map((item) => (
                        <tr key={item.id}>
                          <td>{item.item}</td>
                          <td>{item.quantity}</td>
                          <td>{formatCurrency(item.total_price / item.quantity)}</td>
                          <td>{formatCurrency(item.total_price)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {isAdmin() && selectedProposal.status === 'pending' && (
                  <div className="action-buttons">
                    <button
                      className="approve-btn"
                      onClick={() => handleStatusUpdate(selectedProposal.id, 'approved')}
                    >
                      Approve
                    </button>
                    <button
                      className="partial-btn"
                      onClick={() => handleStatusUpdate(selectedProposal.id, 'partial')}
                    >
                      Partial
                    </button>
                    <button
                      className="reject-btn"
                      onClick={() => handleStatusUpdate(selectedProposal.id, 'rejected')}
                    >
                      Reject
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="no-selection">
                <p>Select a proposal to view details</p>
              </div>
            )}
          </div>
        </div>

        {showModal && (
          <div className="modal-overlay" onClick={() => setShowModal(false)}>
            <div className="modal large" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Create New Proposal</h2>
                <button className="close-button" onClick={() => setShowModal(false)}>
                  &times;
                </button>
              </div>

              <form onSubmit={handleSubmit} className="modal-form">
                <div className="form-group">
                  <label htmlFor="title">Proposal Title</label>
                  <input
                    type="text"
                    id="title"
                    name="title"
                    value={formData.title}
                    onChange={handleInputChange}
                    placeholder="e.g., Office Equipment Purchase"
                    required
                  />
                </div>

                <div className="items-input-section">
                  <div className="items-header">
                    <h3>Items</h3>
                    <button type="button" className="add-item-btn" onClick={addItem}>
                      + Add Item
                    </button>
                  </div>

                  {formData.items.map((item, index) => (
                    <div key={index} className="item-row">
                      <div className="form-group item-name">
                        <input
                          type="text"
                          value={item.name}
                          onChange={(e) => handleItemChange(index, 'name', e.target.value)}
                          placeholder="Item name"
                          required
                        />
                      </div>
                      <div className="form-group item-qty">
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                          placeholder="Qty"
                          min="1"
                          required
                        />
                      </div>
                      <div className="form-group item-price">
                        <input
                          type="number"
                          value={item.price}
                          onChange={(e) => handleItemChange(index, 'price', e.target.value)}
                          placeholder="Price"
                          min="0"
                          step="0.01"
                          required
                        />
                      </div>
                      <button
                        type="button"
                        className="remove-item-btn"
                        onClick={() => removeItem(index)}
                        disabled={formData.items.length === 1}
                      >
                        &times;
                      </button>
                    </div>
                  ))}
                </div>

                <div className="total-preview">
                  <span>Total Amount:</span>
                  <span className="total-value">{formatCurrency(calculateTotal())}</span>
                </div>

                <div className="modal-actions">
                  <button type="button" className="cancel-button" onClick={() => setShowModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="submit-button" disabled={submitting}>
                    {submitting ? 'Creating...' : 'Create Proposal'}
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

export default Proposals;
