import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

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
  createUser: (userData) => api.post('/create_user', userData),
};

// Imprest endpoints
export const imprestService = {
  create: (data) => api.post('/create_imprest', data),
  getByUser: (userID) => api.get(`/getImprests/${userID}`),
  getAdminSummary: () => api.get('/adminAllImprestSummation'),
  getAdminTotals: () => api.get('/adminSummaries'),
};

// Transaction endpoints
export const transactionService = {
  create: (data) => api.post('/create_transaction', data),
  getByImprest: (imprestID) => api.get(`/imprestAccount_trnsctns/${imprestID}`),
  delete: (transactionID) => api.delete(`/create_transaction/${transactionID}`),
};

// Proposal endpoints
export const proposalService = {
  create: (data) => api.post('/imprestProposal', data),
  updateStatus: (data) => api.patch('/imprestProposal', data),
  getAll: () => api.get('/proposals'),
  getById: (id) => api.get(`/proposals/${id}`),
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

export default api;
