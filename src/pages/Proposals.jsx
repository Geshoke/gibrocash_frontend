import { useState, useEffect } from 'react';
import { proposalService, userService } from '../services/api';
import { useAuth } from '../context/AuthContext';
import Layout from '../components/Layout';
import './Proposals.css';

const PAGE_LIMIT = 10;

const emptyFilters = { dateFrom: '', dateTo: '', item: '', name: '', userId: '' };

const Proposals = () => {
  const { user, isAdmin } = useAuth();
  const admin = isAdmin();

  const [proposals, setProposals] = useState([]);
  const [selectedProposal, setSelectedProposal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [users, setUsers] = useState([]);

  const [filterInputs, setFilterInputs] = useState(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState(emptyFilters);

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Comparison
  const [compareMode, setCompareMode] = useState(false);
  const [compareList, setCompareList] = useState([]);

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
      if (filters.name) params.name = filters.name;
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
    if (compareMode) {
      // In compare mode, clicks add to comparison instead
      if (compareList.some((p) => p.id === proposalId)) return;
      if (compareList.length >= 2) return;
      try {
        const response = await proposalService.getById(proposalId);
        const proposal = response.data.proposal ?? response.data;
        setCompareList((prev) => [...prev, proposal]);
      } catch (err) {
        console.error('Failed to load proposal for comparison:', err);
      }
      return;
    }
    try {
      const response = await proposalService.getById(proposalId);
      const proposal = response.data.proposal ?? response.data;
      setSelectedProposal(proposal);
    } catch (err) {
      console.error('Failed to load proposal details:', err);
    }
  };

  const enterCompareMode = () => {
    setCompareMode(true);
    setCompareList([]);
    setSelectedProposal(null);
  };

  const clearCompare = () => {
    setCompareMode(false);
    setCompareList([]);
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
          {!compareMode && (
            <button className="open-compare-btn" onClick={enterCompareMode} title="Compare proposals">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="18" rx="1"/>
                <rect x="14" y="3" width="7" height="18" rx="1"/>
              </svg>
              <span className="open-compare-label">Compare proposals</span>
            </button>
          )}
        </div>

        {error && <div className="error-banner">{error}</div>}

        <div className="proposals-content">
          {/* ── Left panel ── */}
          <div className="proposals-list-panel">
            <h2>All Proposals</h2>

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
                  <label>Proposal Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Demobilisation, Borehole..."
                    value={filterInputs.name}
                    onChange={(e) => setFilterInputs((p) => ({ ...p, name: e.target.value }))}
                    onKeyDown={(e) => e.key === 'Enter' && handleApplyFilters()}
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
                <button className="apply-filter-btn" onClick={handleApplyFilters}>Apply</button>
                {hasActiveFilters && (
                  <button className="clear-filter-btn" onClick={handleClearFilters}>Clear All</button>
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
                  {proposals.map((proposal) => {
                    const inCompare = compareList.some((p) => p.id === proposal.id);
                    const compareFull = compareMode && compareList.length >= 2 && !inCompare;
                    return (
                      <div
                        key={proposal.id}
                        className={`proposal-card
                          ${selectedProposal?.id === proposal.id && !compareMode ? 'selected' : ''}
                          ${inCompare ? 'in-compare' : ''}
                          ${compareMode && !inCompare && !compareFull ? 'compare-pick' : ''}
                          ${compareFull ? 'compare-full' : ''}
                        `}
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
                    );
                  })}
                </div>

                {totalPages > 1 && (
                  <div className="pagination">
                    <button className="page-btn" disabled={page === 1} onClick={() => handlePageChange(page - 1)}>
                      Prev
                    </button>
                    <span className="page-info">Page {page} of {totalPages}</span>
                    <button className="page-btn" disabled={page >= totalPages} onClick={() => handlePageChange(page + 1)}>
                      Next
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── Right panel ── */}
          <div className="proposal-details-panel">
            {compareMode ? (
              <div className="compare-view">
                <div className="compare-view-header">
                  <h2>
                    {compareList.length === 0
                      ? 'Select proposals to compare'
                      : compareList.length === 1
                      ? 'Pick one more proposal'
                      : 'Comparison'}
                  </h2>
                  <button className="clear-compare-btn" onClick={clearCompare}>Exit</button>
                </div>

                <div className={`compare-columns cols-${Math.max(compareList.length, 1)}`}>
                  {compareList.map((proposal) => (
                    <div key={proposal.id} className="compare-column">
                      <div className="compare-col-header">
                        <div className="compare-col-title">
                          <h3>{proposal.name}</h3>
                          <span className={`status-badge ${getStatusColor(proposal.status)}`}>
                            {proposal.status}
                          </span>
                        </div>
                        <button
                          className="compare-toggle-btn remove"
                          onClick={() => setCompareList((prev) => prev.filter((p) => p.id !== proposal.id))}
                          title="Remove"
                        >
                          ×
                        </button>
                      </div>

                      <div className="compare-meta">
                        <span>{proposal.user?.name || 'N/A'}</span>
                        <span>{formatDate(proposal.createdAt)}</span>
                        {proposal.project && <span>{proposal.project.name}</span>}
                      </div>

                      <table className="items-table">
                        <thead>
                          <tr>
                            <th>Item</th>
                            <th>Qty</th>
                            <th>Unit</th>
                            <th>Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {proposal.item_proposeds?.map((item) => (
                            <tr key={item.id}>
                              <td>{item.item}</td>
                              <td>{item.quantity}</td>
                              <td>{formatCurrency(item.total_price)}</td>
                              <td>{formatCurrency(item.total_price * item.quantity)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr>
                            <td colSpan="3" className="total-label">Grand Total</td>
                            <td className="compare-grand-total">{formatCurrency(proposal.total)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  ))}

                  {compareList.length < 2 && (
                    <div className="compare-placeholder">
                      <span>+</span>
                      <p>Click a proposal on the left</p>
                    </div>
                  )}
                </div>
              </div>

            ) : selectedProposal ? (
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
                          <td>{formatCurrency(item.total_price)}</td>
                          <td>{formatCurrency(item.total_price * item.quantity)}</td>
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
