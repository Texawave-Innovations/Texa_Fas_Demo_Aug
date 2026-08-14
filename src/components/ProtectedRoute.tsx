import { Navigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import AccessDenied from '@/pages/AccessDenied';

interface ProtectedRouteProps {
  children: React.ReactNode;
  module?: string;
}

export const ProtectedRoute = ({ children, module }: ProtectedRouteProps) => {
  const { user, hasAccess } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (module && !hasAccess(module)) {
    return <AccessDenied />;
  }

  return <>{children}</>;
};
