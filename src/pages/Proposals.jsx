import { useState, useEffect } from 'react';
import { proposalService } from '../services/api';
import Layout from '../components/Layout';
import './Proposals.css';

const Proposals = () => {
  const [proposals, setProposals] = useState([]);
  const [selectedProposal, setSelectedProposal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchProposals();
  }, []);

  const fetchProposals = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await proposalService.getAll();
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
      setSelectedProposal(response.data.proposal);
    } catch (err) {
      console.error('Failed to load proposal details:', err);
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
      case 'approved': return 'approved';
      case 'rejected': return 'rejected';
      case 'partial': return 'partial';
      default: return 'pending';
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
            <p>View imprest proposals and their status</p>
          </div>
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
                    <span className="label">Created By</span>
                    <span className="value">{selectedProposal.user_tbl?.name || 'N/A'}</span>
                  </div>
                  {selectedProposal.project && (
                    <div className="meta-item">
                      <span className="label">Project</span>
                      <span className="value">{selectedProposal.project.name}</span>
                    </div>
                  )}
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
                        <th>Unit Price</th>
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
              </>
            ) : (
              <div className="no-selection">
                <p>Select a proposal to view details</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Proposals;
