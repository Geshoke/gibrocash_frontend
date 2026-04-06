import { useState, useEffect } from 'react';
import { proposalService, userService } from '../services/api';
import { useAuth } from '../context/AuthContext';
import Layout from '../components/Layout';
import './Proposals.css';

const PAGE_LIMIT = 10;

const emptyFilters = { dateFrom: '', dateTo: '', item: '', userId: '' };

const Proposals = () => {
  const { user, isAdmin } = useAuth();
  const admin = isAdmin();

  const [proposals, setProposals] = useState([]);
  const [selectedProposal, setSelectedProposal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [users, setUsers] = useState([]);

  // Staged inputs — not sent until Apply is clicked
  const [filterInputs, setFilterInputs] = useState(emptyFilters);
  // Last-applied filters — used for page changes
  const [appliedFilters, setAppliedFilters] = useState(emptyFilters);

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    fetchProposals(1, emptyFilters);
    if (admin) fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const res = await userService.getUsers(user.id);
      setUsers(res.data.response || []);
    } catch (err) {
      console.error('Failed to load users:', err);
    }
  };

  const fetchProposals = async (targetPage, filters) => {
    try {
      setLoading(true);
      setError('');
      const params = { page: targetPage, limit: PAGE_LIMIT };
      if (filters.dateFrom) params.dateFrom = filters.dateFrom;
      if (filters.dateTo) params.dateTo = filters.dateTo;
      if (filters.item) params.item = filters.item;
      if (filters.userId) params.userId = filters.userId;

      const response = await proposalService.getAll(params);
      const data = response.data;
      setProposals(data.proposals || []);
      setPage(targetPage);

      const total = data.total ?? data.count ?? data.proposals?.length ?? 0;
      setTotalPages(Math.max(1, Math.ceil(total / PAGE_LIMIT)));
    } catch (err) {
      setError('Failed to load proposals.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleApplyFilters = () => {
    setAppliedFilters(filterInputs);
    setSelectedProposal(null);
    fetchProposals(1, filterInputs);
  };

  const handleClearFilters = () => {
    setFilterInputs(emptyFilters);
    setAppliedFilters(emptyFilters);
    setSelectedProposal(null);
    fetchProposals(1, emptyFilters);
  };

  const handlePageChange = (newPage) => {
    setSelectedProposal(null);
    fetchProposals(newPage, appliedFilters);
  };

  const handleViewDetails = async (proposalId) => {
    try {
      const response = await proposalService.getById(proposalId);
      const proposal = response.data.proposal ?? response.data;
      setSelectedProposal(proposal);
    } catch (err) {
      console.error('Failed to load proposal details:', err);
    }
  };

  const formatCurrency = (amount) =>
    new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(amount || 0);

  const formatDate = (dateString) =>
    new Date(dateString).toLocaleDateString('en-KE', { year: 'numeric', month: 'short', day: 'numeric' });

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'approved': return 'approved';
      case 'rejected': return 'rejected';
      case 'partial': return 'partial';
      default: return 'pending';
    }
  };

  const hasActiveFilters = Object.values(appliedFilters).some(Boolean);

  if (loading && proposals.length === 0) {
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

            {/* Filter Bar */}
            <div className="filter-bar">
              <div className="filter-row">
                <div className="filter-group">
                  <label>From</label>
                  <input
                    type="date"
                    value={filterInputs.dateFrom}
                    onChange={(e) => setFilterInputs((p) => ({ ...p, dateFrom: e.target.value }))}
                  />
                </div>
                <div className="filter-group">
                  <label>To</label>
                  <input
                    type="date"
                    value={filterInputs.dateTo}
                    onChange={(e) => setFilterInputs((p) => ({ ...p, dateTo: e.target.value }))}
                  />
                </div>
              </div>

              <div className="filter-row">
                <div className="filter-group full-width">
                  <label>Search by Item</label>
                  <input
                    type="text"
                    placeholder="e.g. Security, Logistics..."
                    value={filterInputs.item}
                    onChange={(e) => setFilterInputs((p) => ({ ...p, item: e.target.value }))}
                    onKeyDown={(e) => e.key === 'Enter' && handleApplyFilters()}
                  />
                </div>
              </div>

              {admin && (
                <div className="filter-row">
                  <div className="filter-group full-width">
                    <label>Raised By</label>
                    <select
                      value={filterInputs.userId}
                      onChange={(e) => setFilterInputs((p) => ({ ...p, userId: e.target.value }))}
                    >
                      <option value="">All staff</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <div className="filter-actions">
                <button className="apply-filter-btn" onClick={handleApplyFilters}>
                  Apply
                </button>
                {hasActiveFilters && (
                  <button className="clear-filter-btn" onClick={handleClearFilters}>
                    Clear All
                  </button>
                )}
              </div>
            </div>

            {loading ? (
              <div className="list-loading">
                <div className="spinner small"></div>
              </div>
            ) : proposals.length === 0 ? (
              <div className="no-data">
                <p>{hasActiveFilters ? 'No proposals match your filters.' : 'No proposals found.'}</p>
              </div>
            ) : (
              <>
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

                {totalPages > 1 && (
                  <div className="pagination">
                    <button
                      className="page-btn"
                      disabled={page === 1}
                      onClick={() => handlePageChange(page - 1)}
                    >
                      Prev
                    </button>
                    <span className="page-info">Page {page} of {totalPages}</span>
                    <button
                      className="page-btn"
                      disabled={page >= totalPages}
                      onClick={() => handlePageChange(page + 1)}
                    >
                      Next
                    </button>
                  </div>
                )}
              </>
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
                    <span className="value">{selectedProposal.user?.name || 'N/A'}</span>
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
                      {selectedProposal.item_proposeds?.map((item) => (
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
