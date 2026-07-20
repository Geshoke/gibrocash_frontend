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
  toggleEditTransactions: (id, edit_transactions) => api.patch(`/users/${id}/edit-transactions`, { edit_transactions }),
  toggleCreateInvoices: (id, create_invoices) => api.patch(`/users/${id}/create-invoices`, { create_invoices }),
  toggleMoveTransactions: (id, move_transactions) => api.patch(`/users/${id}/move-transactions`, { move_transactions }),
  toggleProjectComments: (id, project_comments) => api.patch(`/users/${id}/project-comments`, { project_comments }),
  toggleCreateTransactions: (id, create_transactions) => api.patch(`/users/${id}/create-transactions`, { create_transactions }),
  toggleEditContacts: (id, edit_contacts) => api.patch(`/users/${id}/edit-contacts`, { edit_contacts }),
};

// Payout recipient directory endpoints
export const recipientService = {
  getAll: () => api.get('/payout-contacts'),
  create: (data) => api.post('/payout-contacts', data),
  update: (id, data) => api.patch(`/payout-contacts/${id}`, data),
  delete: (id) => api.delete(`/payout-contacts/${id}`),
};

// Imprest endpoints
export const imprestService = {
  create: (data) => api.post('/create_imprest', data),
  getByUser: (userID) => api.get(`/getImprests/${userID}`),
  getAllNames: () => api.get('/imprests/all-names'),
  getAdminSummary: () => api.get('/adminAllImprestSummation'),
  getAdminTotals: () => api.get('/adminSummaries'),
  assignUser: (imprestId, userId) => api.post(`/imprests/${imprestId}/users`, { userId }),
  removeUser: (imprestId, userId) => api.delete(`/imprests/${imprestId}/users/${userId}`),
  findOrCreateExpenses: (data) => api.post('/imprests/expenses', data),
};

// Transaction endpoints
export const transactionService = {
  create: (data) => api.post('/create_transaction', data),
  getAll: (userId, page = 1, limit = 50, filters = {}) =>
    api.get('/transactions', {
      params: {
        ...(userId              ? { user_id:     userId              } : {}),
        ...(filters.search      ? { search:      filters.search      } : {}),
        ...(filters.from_date   ? { from_date:   filters.from_date   } : {}),
        ...(filters.to_date     ? { to_date:     filters.to_date     } : {}),
        ...(filters.category_id ? { category_id: filters.category_id } : {}),
        page,
        limit,
      },
    }),
  getByImprest: (imprestID) => api.get(`/imprestAccount_trnsctns/${imprestID}`),
  createForImprest: (imprestId, formData) => api.post(`/imprests/${imprestId}/transactions`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  delete: (transactionID) => api.delete(`/create_transaction/${transactionID}`),
  update: (id, data) => api.patch(`/transactions/${id}`, data),
  move: (id, imprest_id) => api.patch(`/transactions/${id}/move`, { imprest_id }),
  split: (id, parts) => api.post(`/transactions/${id}/split`, { parts }),
  uploadReceipt: (id, formData) => api.patch(`/transactions/${id}/receipt`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
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
  getComments: (id) => api.get(`/projects/${id}/comments`),
  addComment: (id, data) => api.post(`/projects/${id}/comments`, data),
  deleteComment: (id, commentId) => api.delete(`/projects/${id}/comments/${commentId}`),
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

  // Poll status of a specific B2C payment by originatorConversationId
  checkB2cStatus: (originatorConversationId) =>
    paybillApi.get(`/shortcode_3576329/b2c/payments/status/${originatorConversationId}`),

  // Fetch persisted B2C payment ledger from DB
  getPayments: () =>
    paybillApi.get('/shortcode_3576329/b2c/payments'),

  // Fetch persisted B2B payment ledger from DB
  getB2bPayments: () =>
    paybillApi.get('/shortcode_3576329/b2b/payments'),
};

// Invoice endpoints
export const invoiceService = {
  create: (data) => api.post('/invoices', data),
  getAll: (params) => api.get('/invoices', { params }),
  getById: (id) => api.get(`/invoices/${id}`),
  update: (id, data) => api.patch(`/invoices/${id}`, data),
  updateStatus: (id, status) => api.patch(`/invoices/${id}/status`, { status }),
  delete: (id) => api.delete(`/invoices/${id}`),
};

// Invoice catalog endpoints
export const catalogService = {
  getAll: () => api.get('/invoice-catalog'),
  create: (data) => api.post('/invoice-catalog', data),
  update: (id, data) => api.patch(`/invoice-catalog/${id}`, data),
  delete: (id) => api.delete(`/invoice-catalog/${id}`),
};

export default api;
