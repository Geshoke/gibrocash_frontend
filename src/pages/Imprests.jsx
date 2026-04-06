import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { imprestService, userService, projectService, imageService } from '../services/api';
import Layout from '../components/Layout';
import './Imprests.css';

const Imprests = () => {
  const { user, isAdmin } = useAuth();
  const [imprests, setImprests] = useState([]);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Images panel
  const [selectedImprest, setSelectedImprest] = useState(null);
  const [imprestImages, setImprestImages] = useState([]);
  const [loadingImages, setLoadingImages] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState(null);

  // Slide panel (admin features)
  const [panelImprest, setPanelImprest] = useState(null);
  const [allUsers, setAllUsers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loadingPanel, setLoadingPanel] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [userActionError, setUserActionError] = useState('');
  const [assigningProject, setAssigningProject] = useState(false);

  useEffect(() => {
    fetchData();
  }, [user]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError('');

      if (isAdmin()) {
        const imprestsRes = await imprestService.getAdminSummary();
        const adminImprests = (imprestsRes.data.response || []).map(imp => ({
          id: imp.id,
          name: imp.imprestName,
          amount: imp.allocated,
          usedAmount: imp.usedAmount,
          source: imp.source || 'company imprest',
          createdAt: imp.createdAt,
          assignedTo: imp.assignedTo || [],
          projectName: imp.projectName || imp.project?.name || null,
          projectId: imp.projectId || imp.project?.id || null,
        }));
        setImprests(adminImprests);
      } else {
        const response = await imprestService.getByUser(user.id);
        const staffImprests = (response.data.response || []).map(imp => ({
          id: imp.id,
          name: imp.name,
          amount: imp.amount,
          usedAmount: imp.totalTransactionPrice || 0,
          source: imp.source,
          closedStatus_Flag: imp.closedStatus_Flag,
          createdAt: imp.createdAt,
          projectName: imp.projectName || imp.project?.name || null,
          projectId: imp.projectId || imp.project?.id || null,
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

  // ── Images panel ──────────────────────────────────────────
  const handleCardClick = async (imprest) => {
    if (selectedImprest?.id === imprest.id) {
      setSelectedImprest(null);
      setImprestImages([]);
      return;
    }
    setSelectedImprest(imprest);
    setImprestImages([]);
    setLoadingImages(true);
    try {
      const res = await imageService.getImageCount(imprest.id);
      setImprestImages(res.data.imageNames || []);
    } catch (err) {
      console.error('Failed to load images:', err);
    } finally {
      setLoadingImages(false);
    }
  };

  const closeImagesPanel = () => {
    setSelectedImprest(null);
    setImprestImages([]);
    setLightboxUrl(null);
  };

  // ── Slide-in admin panel ───────────────────────────────────
  const openPanel = async (e, imprest) => {
    e.stopPropagation();
    setPanelImprest(imprest);
    setSelectedUserId('');
    setSelectedProjectId('');
    setUserActionError('');
    setLoadingPanel(true);
    try {
      const [usersRes, projectsRes] = await Promise.all([
        userService.getUsers(user.id),
        projectService.getAll(),
      ]);
      setAllUsers(usersRes.data.response || []);
      setProjects(projectsRes.data.projects || []);
    } catch (err) {
      console.error('Failed to load panel data:', err);
    } finally {
      setLoadingPanel(false);
    }
  };

  const closePanel = () => {
    setPanelImprest(null);
    setSelectedUserId('');
    setSelectedProjectId('');
    setUserActionError('');
  };

  const handleAssignProject = async () => {
    if (!selectedProjectId) return;
    setAssigningProject(true);
    try {
      await projectService.assignImprest(panelImprest.id, selectedProjectId);
      const project = projects.find(p => p.id === selectedProjectId);
      const updated = { ...panelImprest, projectId: project.id, projectName: project.name };
      setPanelImprest(updated);
      setImprests(prev => prev.map(i => i.id === updated.id ? updated : i));
      setSelectedProjectId('');
    } catch (err) {
      setUserActionError(err.response?.data?.message || 'Failed to assign project');
    } finally {
      setAssigningProject(false);
    }
  };

  const handleAssignUser = async () => {
    if (!selectedUserId) return;
    setUserActionError('');
    try {
      await imprestService.assignUser(panelImprest.id, selectedUserId);
      const newUser = allUsers.find(u => u.id === selectedUserId);
      const updated = {
        ...panelImprest,
        assignedTo: [...(panelImprest.assignedTo || []), newUser],
      };
      setPanelImprest(updated);
      setImprests(prev => prev.map(i => i.id === updated.id ? updated : i));
      setSelectedUserId('');
    } catch (err) {
      setUserActionError(err.response?.data?.response || 'Failed to assign user');
    }
  };

  const handleRemoveUser = async (targetUserId) => {
    setUserActionError('');
    try {
      await imprestService.removeUser(panelImprest.id, targetUserId);
      const updated = {
        ...panelImprest,
        assignedTo: panelImprest.assignedTo.filter(u => u.id !== targetUserId),
      };
      setPanelImprest(updated);
      setImprests(prev => prev.map(i => i.id === updated.id ? updated : i));
    } catch (err) {
      setUserActionError(err.response?.data?.response || 'Failed to remove user');
    }
  };

  // ── Helpers ────────────────────────────────────────────────
  const formatCurrency = (amount) =>
    new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(amount || 0);

  const formatDate = (dateString) =>
    new Date(dateString).toLocaleDateString('en-KE', { year: 'numeric', month: 'short', day: 'numeric' });

  const calculateBalance = (imprest) =>
    (parseFloat(imprest.amount) || 0) - (parseFloat(imprest.usedAmount) || 0);

  const getStatusClass = (imprest) => {
    const balance = calculateBalance(imprest);
    if (imprest.closedStatus_Flag) return 'closed';
    if (balance <= 0) return 'depleted';
    if (balance < imprest.amount * 0.2) return 'low';
    return 'active';
  };

  const isPdf = (url) => url?.toLowerCase().endsWith('.pdf');

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

  const unassignedUsers = allUsers.filter(
    u => !(panelImprest?.assignedTo || []).some(a => a.id === u.id)
  );
  const availableProjects = projects.filter(p => p.id !== panelImprest?.projectId);

  const q = search.toLowerCase();
  const filtered = [...imprests]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .filter(imp => {
      if (
        imp.name.toLowerCase().includes(q) === false &&
        (imp.source || '').toLowerCase().includes(q) === false &&
        (imp.projectName || '').toLowerCase().includes(q) === false &&
        (imp.assignedTo || []).some(u => u.name.toLowerCase().includes(q)) === false
      ) return false;
      const created = new Date(imp.createdAt);
      if (dateFrom && created < new Date(dateFrom)) return false;
      if (dateTo && created > new Date(dateTo + 'T23:59:59')) return false;
      return true;
    });

  const hasDateFilter = dateFrom || dateTo;

  return (
    <Layout>
      <div className="imprests-page">
        <div className="page-header">
          <div>
            <h1>Imprest Accounts</h1>
            <p>Click a card to view attachments</p>
          </div>
          <div className="imprest-filters">
            <input
              type="text"
              className="imprest-search-input"
              placeholder="Search imprests..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <div className="imprest-date-filters">
              <div className="imprest-date-group">
                <label>From</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={e => setDateFrom(e.target.value)}
                />
              </div>
              <div className="imprest-date-group">
                <label>To</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={e => setDateTo(e.target.value)}
                />
              </div>
              {hasDateFilter && (
                <button
                  className="imprest-clear-dates"
                  onClick={() => { setDateFrom(''); setDateTo(''); }}
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>

        {error && <div className="error-banner">{error}</div>}

        <div className={`imprests-layout ${selectedImprest ? 'split' : ''}`}>
          {/* ── Cards ── */}
          <div className="imprests-left">
            <div className="imprests-grid">
              {imprests.length === 0 ? (
                <div className="no-data-card"><p>No imprest accounts found.</p></div>
              ) : filtered.length === 0 ? (
                <div className="no-data-card"><p>No imprests match your search.</p></div>
              ) : filtered.map((imprest) => (
                <div
                  key={imprest.id}
                  className={`imprest-card ${getStatusClass(imprest)} clickable ${selectedImprest?.id === imprest.id ? 'panel-selected' : ''}`}
                  onClick={() => handleCardClick(imprest)}
                >
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
                    <div className="card-header-right">
                      <span className={`status-badge ${getStatusClass(imprest)}`}>
                        {imprest.closedStatus_Flag ? 'Closed' : 'Active'}
                      </span>
                      {isAdmin() && (
                        <button
                          className="hamburger-btn"
                          onClick={(e) => openPanel(e, imprest)}
                          title="Manage imprest"
                        >
                          &#9776;
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="card-body">
                    <div className="imprest-card-tags">
                      <div className="source-tag">{imprest.source}</div>
                      {imprest.projectName ? (
                        <div className="project-tag">📁 {imprest.projectName}</div>
                      ) : (
                        <div className="project-tag unassigned">No project</div>
                      )}
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
                        style={{ width: `${Math.min(((imprest.usedAmount || 0) / imprest.amount) * 100, 100)}%` }}
                      />
                    </div>
                    <span className="progress-label">
                      {Math.round(((imprest.usedAmount || 0) / imprest.amount) * 100)}% utilized
                    </span>
                  </div>

                  <div className="card-footer">
                    <span className="date">Created: {formatDate(imprest.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Images panel ── */}
          {selectedImprest && (
            <div className="imprests-images-panel">
              <div className="iip-header">
                <div>
                  <h2>{selectedImprest.name}</h2>
                  <p>Attachments</p>
                </div>
                <button className="iip-close-btn" onClick={closeImagesPanel}>×</button>
              </div>

              {loadingImages ? (
                <div className="iip-loading">
                  <div className="spinner"></div>
                </div>
              ) : imprestImages.length === 0 ? (
                <div className="iip-empty">
                  <p>No attachments found for this imprest.</p>
                </div>
              ) : (
                <div className="iip-grid">
                  {imprestImages.map((img) => {
                    const url = imageService.getImageUrl(img.url);
                    return (
                      <div
                        key={img.id}
                        className="iip-thumb"
                        onClick={() => setLightboxUrl(url)}
                      >
                        {isPdf(img.url) ? (
                          <div className="iip-pdf-thumb">
                            <span className="iip-pdf-icon">PDF</span>
                            <span className="iip-pdf-name">{img.url.split('/').pop()}</span>
                          </div>
                        ) : (
                          <img
                            src={url}
                            alt={img.url.split('/').pop()}
                            loading="lazy"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Lightbox ── */}
      {lightboxUrl && (
        <div className="lightbox-overlay" onClick={() => setLightboxUrl(null)}>
          <button className="lightbox-close">×</button>
          {isPdf(lightboxUrl) ? (
            <iframe
              src={lightboxUrl}
              className="lightbox-pdf"
              onClick={e => e.stopPropagation()}
              title="Document preview"
            />
          ) : (
            <img
              src={lightboxUrl}
              className="lightbox-img"
              onClick={e => e.stopPropagation()}
              alt="Attachment"
            />
          )}
        </div>
      )}

      {/* ── Slide-in admin panel ── */}
      {panelImprest && (
        <div className="imprest-panel-overlay" onClick={closePanel} />
      )}
      <div className={`imprest-panel ${panelImprest ? 'open' : ''}`}>
        {panelImprest && (
          <>
            <div className="ip-header">
              <div>
                <h3 className="ip-title">{panelImprest.name}</h3>
                <span className="ip-sub">{panelImprest.source}</span>
              </div>
              <button className="ip-close-btn" onClick={closePanel}>×</button>
            </div>

            {userActionError && <div className="ip-error">{userActionError}</div>}

            {loadingPanel ? (
              <div className="ip-loading"><div className="spinner"></div></div>
            ) : (
              <div className="ip-body">
                {/* Project Section */}
                <div className="ip-section">
                  <p className="ip-section-label">Project</p>
                  <div className="ip-current-project">
                    {panelImprest.projectName ? (
                      <span className="project-tag">📁 {panelImprest.projectName}</span>
                    ) : (
                      <span className="project-tag unassigned">No project assigned</span>
                    )}
                  </div>
                  <p className="ip-field-label">
                    {panelImprest.projectName ? 'Change project' : 'Assign to project'}
                  </p>
                  <div className="ip-row">
                    <select
                      className="iu-select"
                      value={selectedProjectId}
                      onChange={e => setSelectedProjectId(e.target.value)}
                    >
                      <option value="">Select a project...</option>
                      {availableProjects.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    <button
                      className="iu-add-btn"
                      onClick={handleAssignProject}
                      disabled={!selectedProjectId || assigningProject}
                    >
                      {assigningProject ? '...' : 'Save'}
                    </button>
                  </div>
                </div>

                {/* Users Section */}
                <div className="ip-section">
                  <p className="ip-section-label">Assigned Users</p>
                  {(panelImprest.assignedTo || []).length === 0 ? (
                    <p className="iu-empty">No users assigned.</p>
                  ) : (
                    <ul className="iu-user-list">
                      {panelImprest.assignedTo.map(u => (
                        <li key={u.id} className="iu-user-item">
                          <div className="iu-user-avatar">{u.name?.charAt(0).toUpperCase()}</div>
                          <div className="iu-user-info">
                            <span className="iu-user-name">{u.name}</span>
                            <span className="iu-user-phone">{u.phone}</span>
                          </div>
                          <button className="iu-remove-btn" onClick={() => handleRemoveUser(u.id)}>
                            Remove
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                  <p className="ip-field-label" style={{ marginTop: '16px' }}>Add user</p>
                  {unassignedUsers.length === 0 ? (
                    <p className="iu-empty">All users are already assigned.</p>
                  ) : (
                    <div className="ip-row">
                      <select
                        className="iu-select"
                        value={selectedUserId}
                        onChange={e => setSelectedUserId(e.target.value)}
                      >
                        <option value="">Select a user...</option>
                        {unassignedUsers.map(u => (
                          <option key={u.id} value={u.id}>
                            {u.name} — {u.designation_tbl?.name || ''}
                          </option>
                        ))}
                      </select>
                      <button
                        className="iu-add-btn"
                        onClick={handleAssignUser}
                        disabled={!selectedUserId}
                      >
                        Add
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
};

export default Imprests;
