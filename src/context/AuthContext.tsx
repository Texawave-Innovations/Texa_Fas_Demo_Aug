import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, UserRole } from '@/types';
import { getRecord, logAudit } from '@/services/firebase';

interface AuthContextType {
  user: User | null;
  login: (username: string, password: string) => boolean;
  logout: () => void;
  hasAccess: (module: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Static user database for demo
const USERS: Record<string, { password: string; role: UserRole; name: string }> = {
  'admin': { password: 'admin123', role: 'admin', name: 'Admin User' },
  'sales': { password: 'sales123', role: 'sales', name: 'Sales Executive' },
  'hr': { password: 'hr123', role: 'hr', name: 'HR Manager' },
  'accounts': { password: 'accounts123', role: 'accountant', name: 'Accountant User' },
  'manager': { password: 'manager123', role: 'manager', name: 'Manager User' },
  'quality': { password: 'quality123', role: 'quality', name: 'Quality Inspector' },
  'production': { password: 'production123', role: 'Production', name: 'Production Head' },
  'maintenance': { password: 'maintenance123', role: 'maintenance', name: 'Maintenance Engineer' },
};

// Default role-based access control (fallback if no custom config saved)
const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  admin:       ['dashboard', 'sales', 'hr', 'quality', 'production', 'projects', 'inventory', 'dispatch', 'finance', 'cmms', 'documents', 'vault', 'master', 'audit', 'settings', 'reports'],
  sales:       ['dashboard', 'sales', 'documents'],
  hr:          ['dashboard', 'hr', 'documents'],
  accountant:  ['dashboard', 'finance', 'documents'],
  manager:     ['dashboard', 'production', 'projects', 'quality', 'inventory', 'dispatch', 'cmms', 'documents', 'vault'],
  quality:     ['dashboard', 'quality', 'documents', 'vault'],
  production:  ['dashboard', 'production', 'projects', 'documents', 'vault'],
  maintenance: ['dashboard', 'cmms', 'documents', 'vault'],
};

const loadSavedPermissions = (): Record<string, string[]> => {
  try {
    const saved = localStorage.getItem('erp_role_permissions');
    if (saved) {
      const parsed = JSON.parse(saved);
      const version = parsed._version || 1;
      // Carry forward newly-added module defaults for saves made before they
      // existed, so upgrading the app doesn't silently hide new modules.
      const carryForward: string[] = [];
      if (version < 2) carryForward.push('inventory', 'dispatch');
      if (version < 3) carryForward.push('finance', 'cmms');
      if (version < 4) carryForward.push('audit');
      if (version < 5) carryForward.push('vault');
      if (version < 6) carryForward.push('documents');
      if (version < 7) carryForward.push('projects');

      const merged: Record<string, string[]> = {};
      for (const role of Object.keys(DEFAULT_ROLE_PERMISSIONS)) {
        if (parsed[role] === undefined) {
          merged[role] = DEFAULT_ROLE_PERMISSIONS[role];
        } else {
          const newDefaults = DEFAULT_ROLE_PERMISSIONS[role].filter(p => carryForward.includes(p));
          merged[role] = Array.from(new Set([...parsed[role], ...newDefaults]));
        }
      }
      for (const role of Object.keys(parsed)) {
        if (merged[role] === undefined && role !== '_version') {
          merged[role] = parsed[role];
        }
      }
      return merged;
    }
  } catch { /* ignore */ }
  return DEFAULT_ROLE_PERMISSIONS;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [rolePermissions, setRolePermissions] = useState<Record<string, string[]>>(loadSavedPermissions);

  useEffect(() => {
    const savedUser = localStorage.getItem('erp_user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
    // Re-read permissions (in case Settings page updated them)
    setRolePermissions(loadSavedPermissions());

    // Fetch latest permissions from Firebase to ensure synchronization
    const syncPermissions = async () => {
      try {
        const data = await getRecord('settings', 'rolePermissions');
        if (data) {
          localStorage.setItem('erp_role_permissions', JSON.stringify(data));
          setRolePermissions(loadSavedPermissions());
        }
      } catch (err) {
        console.error('Failed to sync role permissions from Firebase:', err);
      }
    };
    syncPermissions();
  }, []);

  // Listen for permission changes saved by Settings page
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'erp_role_permissions') {
        setRolePermissions(loadSavedPermissions());
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const login = (username: string, password: string): boolean => {
    const userData = USERS[username];
    if (userData && userData.password === password) {
      const user: User = {
        username,
        role: userData.role,
        name: userData.name,
      };
      setUser(user);
      localStorage.setItem('erp_user', JSON.stringify(user));
      localStorage.setItem('erpuser', JSON.stringify(user));
      localStorage.setItem('role', userData.role);
      // Refresh permissions on login
      setRolePermissions(loadSavedPermissions());
      logAudit('auth', null, 'login', undefined, { username, name: userData.name, role: userData.role });
      return true;
    }
    logAudit('auth', null, 'login_failed', `Failed login attempt for username "${username}"`, {
      username, name: username, role: 'unknown',
    });
    return false;
  };

  const logout = () => {
    if (user) {
      logAudit('auth', null, 'logout', undefined, { username: user.username, name: user.name, role: user.role });
    }
    setUser(null);
    localStorage.removeItem('erp_user');
    localStorage.removeItem('erpuser');
    localStorage.removeItem('role');
    sessionStorage.removeItem('fas_reminders_announced');
  };

  const hasAccess = (module: string): boolean => {
    if (!user) return false;
    const roleKey = user.role.toLowerCase();
    const perms = rolePermissions[roleKey] || DEFAULT_ROLE_PERMISSIONS[roleKey] || [];
    return perms.includes(module.toLowerCase());
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, hasAccess }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
