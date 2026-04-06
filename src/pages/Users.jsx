import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { userService } from '../services/api';
import Layout from '../components/Layout';
import './Users.css';

const Users = () => {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchUsers();
  }, [user]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await userService.getUsers(user.id);
      setUsers(response.data.response || []);
    } catch (err) {
      setError('Failed to load users.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSuperAdmin = async (targetUser, value) => {
    setUsers(prev => prev.map(u => u.id === targetUser.id ? { ...u, super_admin: value } : u));
    try {
      await userService.toggleSuperAdmin(targetUser.id, value);
    } catch (err) {
      console.error('Failed to update super admin:', err);
      setUsers(prev => prev.map(u => u.id === targetUser.id ? { ...u, super_admin: !value } : u));
    }
  };

  const handleTogglePayout = async (targetUser, value) => {
    setUsers(prev => prev.map(u => u.id === targetUser.id ? { ...u, payout: value } : u));
    try {
      await userService.togglePayout(targetUser.id, value);
    } catch (err) {
      console.error('Failed to update payout:', err);
      setUsers(prev => prev.map(u => u.id === targetUser.id ? { ...u, payout: !value } : u));
    }
  };

  const handleToggleViewAllImprests = async (targetUser, value) => {
    setUsers(prev => prev.map(u => u.id === targetUser.id ? { ...u, view_all_imprests: value } : u));
    try {
      await userService.toggleViewAllImprests(targetUser.id, value);
    } catch (err) {
      console.error('Failed to update view all imprests:', err);
      setUsers(prev => prev.map(u => u.id === targetUser.id ? { ...u, view_all_imprests: !value } : u));
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-KE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
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
      <div className="users-page">
        <div className="page-header">
          <div>
            <h1>User Management</h1>
            <p>View system users and their roles</p>
          </div>
        </div>

        {error && <div className="error-banner">{error}</div>}

        <div className="users-container">
          {users.length === 0 ? (
            <div className="no-data">
              <p>No users found.</p>
            </div>
          ) : (
            <table className="users-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Role</th>
                  <th>Created</th>
                  <th>
                    Super Admin
                    <span className="super-admin-hint"> — category management</span>
                  </th>
                  <th>Payout</th>
                  <th>View All Imprests</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div className="user-cell">
                        <div className="user-avatar">
                          {u.name?.charAt(0).toUpperCase()}
                        </div>
                        <span>{u.name}</span>
                      </div>
                    </td>
                    <td>{u.phone}</td>
                    <td>
                      <span className={`role-badge ${u.designation_tbl?.name?.toLowerCase()}`}>
                        {u.designation_tbl?.name || 'N/A'}
                      </span>
                    </td>
                    <td>{formatDate(u.createdAt)}</td>
                    <td>
                      <label className="toggle-switch">
                        <input
                          type="checkbox"
                          checked={u.super_admin ?? false}
                          onChange={e => handleToggleSuperAdmin(u, e.target.checked)}
                        />
                        <span className="toggle-slider" />
                      </label>
                    </td>
                    <td>
                      <label className="toggle-switch">
                        <input
                          type="checkbox"
                          checked={u.payout ?? false}
                          onChange={e => handleTogglePayout(u, e.target.checked)}
                        />
                        <span className="toggle-slider" />
                      </label>
                    </td>
                    <td>
                      <label className="toggle-switch">
                        <input
                          type="checkbox"
                          checked={u.view_all_imprests ?? false}
                          onChange={e => handleToggleViewAllImprests(u, e.target.checked)}
                        />
                        <span className="toggle-slider" />
                      </label>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default Users;
