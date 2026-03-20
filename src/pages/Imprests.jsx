import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { imprestService, userService, projectService } from '../services/api';
import Layout from '../components/Layout';
import './Imprests.css';

const Imprests = () => {
  const { user, isAdmin } = useAuth();
  const [imprests, setImprests] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Slide panel
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

  const openPanel = async (imprest) => {
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

  const unassignedUsers = allUsers.filter(
    u => !(panelImprest?.assignedTo || []).some(a => a.id === u.id)
  );

  const availableProjects = projects.filter(p => p.id !== panelImprest?.projectId);

  return (
    <Layout>
      <div className={`imprests-page ${panelImprest ? 'panel-open' : ''}`}>
        <div className="page-header">
          <div>
            <h1>Imprest Accounts</h1>
            {/* <p>View imprest allocations and balances</p> */}
            <p>Add/Remove assigned user, Add/Change project</p>

          </div>
          <input
            type="text"
            className="imprest-search-input"
            placeholder="Search imprests..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {error && <div className="error-banner">{error}</div>}

        <div className="imprests-grid">
          {imprests.length === 0 ? (
            <div className="no-data-card">
              <p>No imprest accounts found.</p>
            </div>
          ) : (() => {
            const q = search.toLowerCase();
            const filtered = [...imprests]
              .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
              .filter(imp =>
                imp.name.toLowerCase().includes(q) ||
                (imp.source || '').toLowerCase().includes(q) ||
                (imp.projectName || '').toLowerCase().includes(q) ||
                (imp.assignedTo || []).some(u => u.name.toLowerCase().includes(q))
              );
            return filtered.length === 0 ? (
              <div className="no-data-card"><p>No imprests match your search.</p></div>
            ) : filtered.map((imprest) => (
              <div
                key={imprest.id}
                className={`imprest-card ${getStatusClass(imprest)} ${panelImprest?.id === imprest.id ? 'panel-selected' : ''} ${isAdmin() ? 'clickable' : ''}`}
                onClick={() => isAdmin() && openPanel(imprest)}
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
            ));
          })()}
        </div>
      </div>

      {/* Slide-in Panel */}
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

            {userActionError && (
              <div className="ip-error">{userActionError}</div>
            )}

            {loadingPanel ? (
              <div className="ip-loading">
                <div className="spinner"></div>
              </div>
            ) : (
              <div className="ip-body">

                {/* ── Project Section ── */}
                {isAdmin() && (
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
                )}

                {/* ── Users Section ── */}
                {isAdmin() && (
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
                            <button
                              className="iu-remove-btn"
                              onClick={() => handleRemoveUser(u.id)}
                            >
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
                )}

              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
};

export default Imprests;
