import { createContext, useContext, useState, useEffect } from 'react';
import { authService, userService } from '../services/api';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    const storedToken = localStorage.getItem('token');

    if (storedUser && storedToken) {
      setUser(JSON.parse(storedUser));
    }
    setLoading(false);
  }, []);

  const login = async (phoneNo, password) => {
    const response = await authService.login(phoneNo, password);
    const userData = response.data;

    // Fetch full profile to get flags not included in login response
    localStorage.setItem('token', userData.token);
    const profileRes = await userService.getById(userData.id);
    const profile = profileRes.data.response;

    const userObj = {
      id: userData.id,
      name: userData.name,
      phone: userData.phone,
      designation: userData.designation,
      payout: userData.payout,
      super_admin: userData.super_admin ?? false,
      view_all_imprests: profile?.view_all_imprests ?? false,
    };

    localStorage.setItem('user', JSON.stringify(userObj));
    setUser(userObj);

    return userData;
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  const isAdmin = () => {
    return user?.designation?.toLowerCase() === 'admin';
  };

  const isSuperAdmin = () => {
    return user?.super_admin === true;
  };

  const canPayout = () => {
    return isAdmin() || (user?.designation?.toLowerCase() === 'staff' && user?.payout === true);
  };

  const canViewAllImprests = () => {
    return isAdmin() || user?.view_all_imprests === true;
  };

  const value = {
    user,
    login,
    logout,
    isAdmin,
    isSuperAdmin,
    canPayout,
    canViewAllImprests,
    isAuthenticated: !!user,
    loading,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
