import { useState, useEffect } from 'react';
import { projectService, transactionService, categoryService, imageService } from '../services/api';
import { useAuth } from '../context/AuthContext';
import Layout from '../components/Layout';
import './Projects.css';

const Projects = () => {
  const { isAdmin } = useAuth();
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [projectDetail, setProjectDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState('');
  const [expandedImprest, setExpandedImprest] = useState(null);
  const [imprestTransactions, setImprestTransactions] = useState({});
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [projectSearch, setProjectSearch] = useState('');
  const [categories, setCategories] = useState([]);
  const [categoryPopoverTxnId, setCategoryPopoverTxnId] = useState(null);
  const [transactionImageUrl, setTransactionImageUrl] = useState(null);
  const [loadingImage, setLoadingImage] = useState(false);
  const [movePopoverImprestId, setMovePopoverImprestId] = useState(null);
  const [moveModalImprest, setMoveModalImprest] = useState(null);
  const [movingImprestId, setMovingImprestId] = useState(null);

  useEffect(() => {
    fetchProjects();
    fetchCategories();
  }, []);

  useEffect(() => {
    if (!categoryPopoverTxnId) return;
    const close = () => setCategoryPopoverTxnId(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [categoryPopoverTxnId]);

  useEffect(() => {
    if (!movePopoverImprestId) return;
    const close = () => setMovePopoverImprestId(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [movePopoverImprestId]);

  const fetchProjects = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await projectService.getAll();
      setProjects(response.data.projects || []);
    } catch (err) {
      setError('Failed to load projects.');
      console.error(err);
    } finally {
      setLoading(false);
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

  const handleAssignCategory = async (e, txnId, catId, imprestId) => {
    e.stopPropagation();
    try {
      await categoryService.assignToTransaction(txnId, catId);
      const cat = categories.find(c => c.id === catId);
      setImprestTransactions(prev => ({
        ...prev,
        [imprestId]: (prev[imprestId] || []).map(t =>
          t.id === txnId ? { ...t, categories: [...(t.categories || []), cat] } : t
        ),
      }));
      setCategoryPopoverTxnId(null);
    } catch (err) {
      console.error('Failed to assign category:', err);
    }
  };

  const handleRemoveCategory = async (e, txnId, catId, imprestId) => {
    e.stopPropagation();
    try {
      await categoryService.removeFromTransaction(txnId, catId);
      setImprestTransactions(prev => ({
        ...prev,
        [imprestId]: (prev[imprestId] || []).map(t =>
          t.id === txnId ? { ...t, categories: (t.categories || []).filter(c => c.id !== catId) } : t
        ),
      }));
    } catch (err) {
      console.error('Failed to remove category:', err);
    }
  };

  const handleSelectProject = async (project) => {
    setSelectedProject(project);
    setProjectDetail(null);
    setExpandedImprest(null);
    setImprestTransactions({});
    setSelectedTransaction(null);
    setTransactionImageUrl(null);

    try {
      setLoadingDetail(true);
      const response = await projectService.getById(project.id);
      setProjectDetail(response.data.project);
    } catch (err) {
      console.error('Failed to load project detail:', err);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleImprestClick = async (imprestId) => {
    if (expandedImprest === imprestId) {
      setExpandedImprest(null);
      setSelectedTransaction(null);
      setTransactionImageUrl(null);
      return;
    }

    setExpandedImprest(imprestId);
    setSelectedTransaction(null);
    setTransactionImageUrl(null);

    // Only fetch if we haven't already loaded this imprest's transactions
    if (imprestTransactions[imprestId]) return;

    try {
      setLoadingTransactions(true);
      const response = await transactionService.getByImprest(imprestId);
      const txns = response.data?.transactions?.rows
        || response.data?.transactions
        || response.data?.response
        || [];
      setImprestTransactions(prev => ({ ...prev, [imprestId]: txns }));
    } catch (err) {
      console.error('Failed to load transactions:', err);
      setImprestTransactions(prev => ({ ...prev, [imprestId]: [] }));
    } finally {
      setLoadingTransactions(false);
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

    if (!txn.images_id) return;

    try {
      setLoadingImage(true);
      const response = await imageService.getTransactionImage(txn.images_id);
      const imagePath = response.data?.path;
      if (imagePath) {
        setTransactionImageUrl(imageService.getImageUrl(imagePath));
      }
    } catch (err) {
      console.error('Failed to load image:', err);
    } finally {
      setLoadingImage(false);
    }
  };

  const handleMoveImprest = async (imprestId, newProjectId) => {
    setMovingImprestId(imprestId);
    setMovePopoverImprestId(null);
    try {
      await projectService.assignImprest(imprestId, newProjectId);
      // Refresh the current project detail and the project list
      const [detailRes, listRes] = await Promise.all([
        projectService.getById(selectedProject.id),
        projectService.getAll(),
      ]);
      setProjectDetail(detailRes.data.project);
      setProjects(listRes.data.projects || []);
      // Clear cached transactions for this imprest since it moved
      setImprestTransactions(prev => {
        const next = { ...prev };
        delete next[imprestId];
        return next;
      });
      if (expandedImprest === imprestId) setExpandedImprest(null);
    } catch (err) {
      console.error('Failed to move imprest:', err);
    } finally {
      setMovingImprestId(null);
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

  const getStatusClass = (status) => {
    switch (status) {
      case 'active': return 'active';
      case 'completed': return 'completed';
      case 'on-hold': return 'on-hold';
      default: return 'active';
    }
  };

  const getImprestBalance = (imprest) => {
    const allocated = parseFloat(imprest.amount) || 0;
    const used = (imprest.transactions || []).reduce(
      (sum, t) => sum + parseFloat(t.price || 0), 0
    );
    return allocated - used;
  };

  const getImprestUsed = (imprest) => {
    return (imprest.transactions || []).reduce(
      (sum, t) => sum + parseFloat(t.price || 0), 0
    );
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
      <div className="projects-page">
        <div className="page-header">
          <div>
            <h1>Projects</h1>
            <p>View projects and their associated imprests</p>
          </div>
        </div>

        {error && <div className="error-banner">{error}</div>}

        <div className="projects-layout">
          {/* Projects List */}
          <div className="projects-list-panel">
            <div className="projects-list-header">
              <h2>All Projects</h2>
              <input
                type="text"
                className="project-search-input"
                placeholder="Search projects..."
                value={projectSearch}
                onChange={e => setProjectSearch(e.target.value)}
              />
            </div>
            {projects.length === 0 ? (
              <div className="no-data">
                <p>No projects found.</p>
              </div>
            ) : (() => {
              const filtered = projects.filter(p =>
                p.name.toLowerCase().includes(projectSearch.toLowerCase()) ||
                (p.description || '').toLowerCase().includes(projectSearch.toLowerCase())
              );
              return filtered.length === 0 ? (
                <div className="no-data"><p>No projects match your search.</p></div>
              ) : filtered.map((project) => (
                <div
                  key={project.id}
                  className={`project-card ${selectedProject?.id === project.id ? 'selected' : ''}`}
                  onClick={() => handleSelectProject(project)}
                >
                  <div className="project-card-header">
                    <h3>{project.name}</h3>
                    <span className={`status-badge ${getStatusClass(project.status)}`}>
                      {project.status}
                    </span>
                  </div>
                  {project.description && (
                    <p className="project-description">{project.description}</p>
                  )}
                  <div className="project-stats">
                    <div className="stat">
                      <span className="stat-label">Imprests</span>
                      <span className="stat-value">{project.imprestCount || 0}</span>
                    </div>
                    <div className="stat">
                      <span className="stat-label">Allocated</span>
                      <span className="stat-value credit">{formatCurrency(project.totalAllocated)}</span>
                    </div>
                    <div className="stat">
                      <span className="stat-label">Used</span>
                      <span className="stat-value debit">{formatCurrency(project.totalUsed)}</span>
                    </div>
                    <div className="stat">
                      <span className="stat-label">Balance</span>
                      <span className={`stat-value ${(project.balance || 0) >= 0 ? 'positive' : 'negative'}`}>
                        {formatCurrency(project.balance)}
                      </span>
                    </div>
                  </div>
                  <span className="project-date">{formatDate(project.createdAt)}</span>
                </div>
              ));
            })()}
          </div>

          {/* Project Detail */}
          <div className="project-detail-panel">
            {!selectedProject && (
              <div className="no-selection">
                <p>Select a project to view its details</p>
              </div>
            )}

            {selectedProject && loadingDetail && (
              <div className="loading-container">
                <div className="spinner"></div>
                <p>Loading project details...</p>
              </div>
            )}

            {selectedProject && projectDetail && !loadingDetail && (
              <>
                <div className="detail-header">
                  <div>
                    <h2>{projectDetail.name}</h2>
                    {projectDetail.description && (
                      <p className="detail-description">{projectDetail.description}</p>
                    )}
                  </div>
                  <span className={`status-badge large ${getStatusClass(projectDetail.status)}`}>
                    {projectDetail.status}
                  </span>
                </div>

                <div className="detail-summary">
                  <div className="summary-card credit">
                    <span className="label">Total Allocated</span>
                    <span className="amount">{formatCurrency(projectDetail.totalAllocated)}</span>
                  </div>
                  <div className="summary-card debit">
                    <span className="label">Total Used</span>
                    <span className="amount">{formatCurrency(projectDetail.totalUsed)}</span>
                  </div>
                  <div className="summary-card balance">
                    <span className="label">Balance</span>
                    <span className="amount">{formatCurrency(projectDetail.balance)}</span>
                  </div>
                </div>

                <div className="imprests-section">
                  <h3>Imprest Accounts ({(projectDetail.imprests || []).length})</h3>

                  {(projectDetail.imprests || []).length === 0 ? (
                    <p className="no-data-inline">No imprests linked to this project.</p>
                  ) : (
                    (projectDetail.imprests || []).map((imprest) => {
                      const isExpanded = expandedImprest === imprest.id;
                      const txns = imprestTransactions[imprest.id] || [];
                      const allocated = parseFloat(imprest.amount) || 0;
                      // Use fetched transactions to compute used once loaded, else fall back to API value
                      const used = imprestTransactions[imprest.id]
                        ? txns.reduce((sum, t) => sum + parseFloat(t.price || 0), 0)
                        : parseFloat(imprest.usedAmount) || 0;
                      const balance = allocated - used;
                      return (
                      <div key={imprest.id} className={`imprest-block ${isExpanded ? 'expanded' : ''}`}>
                        <div
                          className="imprest-block-header imprest-block-clickable"
                          onClick={() => handleImprestClick(imprest.id)}
                        >
                          <div className="imprest-block-title-row">
                            <div className="imprest-block-title">
                              <span className={`imprest-chevron ${isExpanded ? 'open' : ''}`}>›</span>
                              <h4>{imprest.name}</h4>
                              <span className={`source-tag ${imprest.source?.replace(/\s+/g, '-').toLowerCase()}`}>
                                {imprest.source}
                              </span>
                            </div>
                            {isAdmin() && (
                              <div
                                className="imprest-menu-wrapper"
                                onClick={e => e.stopPropagation()}
                              >
                                <button
                                  className="imprest-menu-btn"
                                  disabled={movingImprestId === imprest.id}
                                  onClick={e => {
                                    e.stopPropagation();
                                    setMovePopoverImprestId(
                                      movePopoverImprestId === imprest.id ? null : imprest.id
                                    );
                                  }}
                                >
                                  {movingImprestId === imprest.id ? '...' : '⋮'}
                                </button>
                                {movePopoverImprestId === imprest.id && (
                                  <div
                                    className="imprest-menu-popover"
                                    onClick={e => e.stopPropagation()}
                                  >
                                    <button
                                      className="move-popover-item"
                                      onClick={() => {
                                        setMovePopoverImprestId(null);
                                        setMoveModalImprest(imprest);
                                      }}
                                    >
                                      ↔ Move to project
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="imprest-block-amounts">
                            <span className="credit">{formatCurrency(allocated)} allocated</span>
                            <span className="separator">·</span>
                            <span className="debit">{formatCurrency(used)} used</span>
                            <span className="separator">·</span>
                            <span className={balance >= 0 ? 'positive' : 'negative'}>
                              {formatCurrency(balance)} balance
                            </span>
                            {imprestTransactions[imprest.id] && (
                              <span className="txn-count">
                                {txns.length} txn{txns.length !== 1 ? 's' : ''}
                              </span>
                            )}
                          </div>
                        </div>

                        {isExpanded && (
                          <>
                            {imprest.assignedTo && imprest.assignedTo.length > 0 && (
                              <div className="imprest-assignees">
                                Assigned to: {imprest.assignedTo.map(u => u.name).join(', ')}
                              </div>
                            )}

                            {loadingTransactions && !imprestTransactions[imprest.id] ? (
                              <div className="loading-container small">
                                <div className="spinner"></div>
                              </div>
                            ) : txns.length === 0 ? (
                              <p className="no-data-inline">No transactions recorded.</p>
                            ) : (
                              <>
                                <table className="transactions-table compact">
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
                                    {txns.map((txn) => (
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
                                        <td className="categories-cell" onClick={e => e.stopPropagation()}>
                                          <div className="categories-in-row">
                                            {(txn.categories || []).map(cat => (
                                              <span key={cat.id} className="category-tag">
                                                {cat.cat_name}
                                                <button
                                                  className="remove-tag-btn"
                                                  onClick={e => handleRemoveCategory(e, txn.id, cat.id, imprest.id)}
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
                                                    onClick={e => handleAssignCategory(e, txn.id, cat.id, imprest.id)}
                                                  >{cat.cat_name}</button>
                                                ))}
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
                                      <td colSpan="6" className="total-label">Subtotal:</td>
                                      <td className="debit" colSpan="2">
                                        {formatCurrency(txns.reduce((s, t) => s + parseFloat(t.price || 0), 0))}
                                      </td>
                                    </tr>
                                  </tfoot>
                                </table>

                                {selectedTransaction && txns.some(t => t.id === selectedTransaction.id) && (
                                  <div className="transaction-image-preview">
                                    <div className="preview-header">
                                      <h4>Receipt: {selectedTransaction.item}</h4>
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
                                        <div className="loading-container small">
                                          <div className="spinner"></div>
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
                                        <p className="no-image-message">No receipt attached.</p>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </>
                            )}
                          </>
                        )}
                      </div>
                    )})
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Move Imprest Modal */}
      {moveModalImprest && (
        <div className="modal-overlay" onClick={() => setMoveModalImprest(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Move Imprest</h3>
              <button className="modal-close-btn" onClick={() => setMoveModalImprest(null)}>×</button>
            </div>
            <p className="modal-sub">Select a project to move <strong>{moveModalImprest.name}</strong> to:</p>
            <div className="modal-project-list">
              {projects.filter(p => p.id !== selectedProject.id).map(p => (
                <button
                  key={p.id}
                  className="modal-project-item"
                  disabled={movingImprestId === moveModalImprest.id}
                  onClick={() => {
                    handleMoveImprest(moveModalImprest.id, p.id);
                    setMoveModalImprest(null);
                  }}
                >
                  <span className="modal-project-name">{p.name}</span>
                  <span className={`status-badge ${getStatusClass(p.status)}`}>{p.status}</span>
                </button>
              ))}
              {projects.filter(p => p.id !== selectedProject.id).length === 0 && (
                <p className="modal-empty">No other projects available.</p>
              )}
            </div>
            <div className="modal-footer">
              <button
                className="modal-unlink-btn"
                disabled={movingImprestId === moveModalImprest.id}
                onClick={() => {
                  handleMoveImprest(moveModalImprest.id, null);
                  setMoveModalImprest(null);
                }}
              >
                Remove from project
              </button>
              <button className="modal-cancel-btn" onClick={() => setMoveModalImprest(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default Projects;
