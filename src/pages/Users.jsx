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
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    UserName: '',
    phoneNo: '',
    password: '',
    confirmPassword: '',
    designation: 'STAFF',
  });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    fetchUsers();
  }, [user]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await userService.getUsers(user.id);
      // API returns { response: [...] }
      setUsers(response.data.response || []);
    } catch (err) {
      setError('Failed to load users.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setFormError('');
  };

  const validateForm = () => {
    if (!formData.UserName.trim()) {
      setFormError('Name is required.');
      return false;
    }
    if (!formData.phoneNo.trim()) {
      setFormError('Phone number is required.');
      return false;
    }
    if (!/^(0|\+?254)\d{9}$/.test(formData.phoneNo.replace(/\s/g, ''))) {
      setFormError('Please enter a valid Kenyan phone number.');
      return false;
    }
    if (formData.password.length < 6) {
      setFormError('Password must be at least 6 characters.');
      return false;
    }
    if (formData.password !== formData.confirmPassword) {
      setFormError('Passwords do not match.');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!validateForm()) {
      return;
    }

    setSubmitting(true);

    try {
      await userService.createUser({
        UserName: formData.UserName,
        phoneNo: formData.phoneNo,
        password: formData.password,
        designation: formData.designation,
      });

      setShowModal(false);
      setFormData({
        UserName: '',
        phoneNo: '',
        password: '',
        confirmPassword: '',
        designation: 'STAFF',
      });
      fetchUsers();
    } catch (err) {
      setFormError(err.response?.data?.message || 'Failed to create user.');
    } finally {
      setSubmitting(false);
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
            <p>Manage system users and access</p>
          </div>
          <button className="create-button" onClick={() => setShowModal(true)}>
            + Add User
          </button>
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
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {showModal && (
          <div className="modal-overlay" onClick={() => setShowModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Add New User</h2>
                <button className="close-button" onClick={() => setShowModal(false)}>
                  &times;
                </button>
              </div>

              <form onSubmit={handleSubmit} className="modal-form">
                {formError && <div className="form-error">{formError}</div>}

                <div className="form-group">
                  <label htmlFor="UserName">Full Name</label>
                  <input
                    type="text"
                    id="UserName"
                    name="UserName"
                    value={formData.UserName}
                    onChange={handleInputChange}
                    placeholder="John Doe"
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="phoneNo">Phone Number</label>
                  <input
                    type="text"
                    id="phoneNo"
                    name="phoneNo"
                    value={formData.phoneNo}
                    onChange={handleInputChange}
                    placeholder="0712345678"
                    required
                  />
                  <span className="hint">Kenyan format: 07XX or 254XX or +254XX</span>
                </div>

                <div className="form-group">
                  <label htmlFor="designation">Role</label>
                  <select
                    id="designation"
                    name="designation"
                    value={formData.designation}
                    onChange={handleInputChange}
                    required
                  >
                    <option value="STAFF">Staff</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="password">Password</label>
                  <input
                    type="password"
                    id="password"
                    name="password"
                    value={formData.password}
                    onChange={handleInputChange}
                    placeholder="Minimum 6 characters"
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="confirmPassword">Confirm Password</label>
                  <input
                    type="password"
                    id="confirmPassword"
                    name="confirmPassword"
                    value={formData.confirmPassword}
                    onChange={handleInputChange}
                    placeholder="Re-enter password"
                    required
                  />
                </div>

                <div className="modal-actions">
                  <button type="button" className="cancel-button" onClick={() => setShowModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="submit-button" disabled={submitting}>
                    {submitting ? 'Creating...' : 'Create User'}
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

export default Users;
