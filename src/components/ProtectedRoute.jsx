import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ProtectedRoute = ({ children, require }) => {
  const { isAuthenticated, loading, isSuperAdmin, canPayout, canCreateInvoices } = useAuth();

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
      }}>
        Loading...
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (require === 'admin' && !isSuperAdmin()) {
    return <Navigate to="/dashboard" replace />;
  }

  if (require === 'payout' && !canPayout()) {
    return <Navigate to="/dashboard" replace />;
  }

  if (require === 'invoice' && !canCreateInvoices()) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};

export default ProtectedRoute;
