import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
const PAYBILL_BASE_URL = import.meta.env.VITE_PAYBILL_URL;

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor to handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 403) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth endpoints
export const authService = {
  login: (phoneNo, password) => api.post('/login', { phoneNo, password }),
};

// User endpoints
export const userService = {
  getUsers: (userID) => api.get(`/getUsers/${userID}`),
  getById: (id) => api.get(`/users/${id}`),
  createUser: (userData) => api.post('/create_user', userData),
  togglePayout: (id, payout) => api.patch(`/users/${id}/payout`, { payout }),
  toggleSuperAdmin: (id, super_admin) => api.patch(`/users/${id}/super-admin`, { super_admin }),
  toggleViewAllImprests: (id, view_all_imprests) => api.patch(`/users/${id}/view-all-imprests`, { view_all_imprests }),
};

// Imprest endpoints
export const imprestService = {
  create: (data) => api.post('/create_imprest', data),
  getByUser: (userID) => api.get(`/getImprests/${userID}`),
  getAdminSummary: () => api.get('/adminAllImprestSummation'),
  getAdminTotals: () => api.get('/adminSummaries'),
  assignUser: (imprestId, userId) => api.post(`/imprests/${imprestId}/users`, { userId }),
  removeUser: (imprestId, userId) => api.delete(`/imprests/${imprestId}/users/${userId}`),
};

// Transaction endpoints
export const transactionService = {
  create: (data) => api.post('/create_transaction', data),
  getAll: (userId, page = 1, limit = 50) =>
    api.get('/transactions', { params: { ...(userId ? { user_id: userId } : {}), page, limit } }),
  getByImprest: (imprestID) => api.get(`/imprestAccount_trnsctns/${imprestID}`),
  delete: (transactionID) => api.delete(`/create_transaction/${transactionID}`),
};

// Category endpoints
export const categoryService = {
  getAll: () => api.get('/categories'),
  create: (cat_name) => api.post('/categories', { cat_name }),
  delete: (id) => api.delete(`/categories/${id}`),
  assignToTransaction: (txnId, category_id) => api.post(`/transactions/${txnId}/categories`, { category_id }),
  removeFromTransaction: (txnId, catId) => api.delete(`/transactions/${txnId}/categories/${catId}`),
};

// Proposal endpoints
export const proposalService = {
  create: (data) => api.post('/imprestProposal', data),
  updateStatus: (data) => api.patch('/imprestProposal', data),
  getAll: (params) => api.get('/proposals', { params }),
  getById: (id) => api.get(`/proposals/${id}`),
};

// Project endpoints
export const projectService = {
  getAll: () => api.get('/projects'),
  getById: (id) => api.get(`/projects/${id}`),
  assignImprest: (imprestId, projectId) =>
    api.patch(`/imprest/${imprestId}/assign-project`, { project_id: projectId }),
};

// Image endpoints
export const imageService = {
  upload: (formData) => api.post('/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  uploadToImprest: (formData) => api.post('/upload_fromImprest', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  getImprestImages: (imprestID) => api.get(`/requestImage/${imprestID}`),
  getImageCount: (imprestID) => api.get(`/getImprestImagesCount/${imprestID}`),
  getTransactionImage: (imageID) => api.get(`/TransactionImages/${imageID}`),
  getImageUrl: (imagePath) => `${API_BASE_URL}/gibroFinanceimages/${imagePath}`,
};

// Payroll / B2C endpoints
// Payload shape per employee: { phoneNumber, amount, remarks }
export const payrollService = {
  sendB2C:     (payload)  => api.post('/b2c/send', payload),
  sendBulkB2C: (payloads) => api.post('/b2c/bulk', { payments: payloads }),
};

// Payout PIN flow — talks directly to the paybill backend
const paybillApi = axios.create({
  baseURL: PAYBILL_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

export const payoutService = {
  // Called when user clicks Initiate — generates PIN and sends SMS
  // Body: { type, payload, label, amount }
  request: (data) =>
    paybillApi.post('/shortcode_3576329/payouts/request', data),

  // Called when user submits the PIN in the modal
  // Body: { payoutId, pin }
  authorise: (payoutId, pin) =>
    paybillApi.post('/shortcode_3576329/payouts/authorise', { payoutId, pin }),

  // Fetch persisted B2C payment ledger from DB
  getPayments: () =>
    paybillApi.get('/shortcode_3576329/b2c/payments'),
};

export default api;
