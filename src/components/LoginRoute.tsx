// src/components/LoginRoute.tsx
import { useAuth } from "@/context/AuthContext";
import { Navigate } from "react-router-dom";
import { ReactNode } from "react";

interface LoginRouteProps {
  children: ReactNode;
}

export function LoginRoute({ children }: LoginRouteProps) {
  const { user } = useAuth();

  // If already logged in → go to dashboard
  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
