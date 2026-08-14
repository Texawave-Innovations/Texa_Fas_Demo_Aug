import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Eye, EyeOff, Lock, User, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import fas from '@/modules/sales/fas.png';

function GearLoader() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white">
      <style>{`
        @keyframes spin-ring {
          to { transform: rotate(360deg); }
        }
        @keyframes bar-fill {
          from { width: 0%; }
          to   { width: 100%; }
        }
        @keyframes fade-in-up {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .s-ring { animation: spin-ring 0.9s linear infinite; }
        .s-bar  { animation: bar-fill 1.5s cubic-bezier(0.4, 0, 0.2, 1) forwards; }
        .s-a0   { animation: fade-in-up 0.4s 0.0s ease-out both; }
        .s-a1   { animation: fade-in-up 0.4s 0.12s ease-out both; }
        .s-a2   { animation: fade-in-up 0.4s 0.24s ease-out both; }
        .s-a3   { animation: fade-in-up 0.4s 0.36s ease-out both; }
      `}</style>

      {/* Logo */}
      <div className="s-a0 mb-6">
        <img
          src="https://i.postimg.cc/HxQtB69t/fas.jpg"
          alt="FAS Logo"
          className="h-20 w-20 object-contain rounded-2xl shadow-md"
        />
      </div>

      {/* Brand */}
      <div className="s-a1 text-center mb-8">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">FAS ERP</h1>
        <p className="text-sm text-gray-400 mt-1">Pvt Ltd</p>
      </div>

      {/* Ring spinner */}
      <div className="s-a2 mb-8">
        <div className="relative h-10 w-10">
          <svg className="s-ring h-10 w-10" viewBox="0 0 40 40" fill="none">
            <circle cx="20" cy="20" r="16" stroke="#e5e7eb" strokeWidth="3" />
            <circle
              cx="20" cy="20" r="16"
              stroke="#1d4ed8"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray="60 40"
            />
          </svg>
        </div>
      </div>

      {/* Progress bar */}
      <div className="s-a3 flex flex-col items-center gap-2">
        <div className="w-56 h-1 bg-gray-100 rounded-full overflow-hidden">
          <div className="s-bar h-full rounded-full bg-gradient-to-r from-blue-800 to-blue-500" />
        </div>
        <p className="text-xs text-gray-400 tracking-wide">Initializing your workspace…</p>
      </div>
    </div>
  );
}

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showLoader, setShowLoader] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Validate credentials without calling login() yet (which sets user and triggers redirect)
    const USERS: Record<string, string> = {
      admin: 'admin123', sales: 'sales123', hr: 'hr123',
      accounts: 'accounts123', manager: 'manager123',
      quality: 'quality123', production: 'production123',
    };

    const isValid = USERS[username] === password;

    if (isValid) {
      setLoading(false);
      setShowLoader(true);
      // After 1.5s loader, actually login (sets user in context) and navigate
      setTimeout(() => {
        login(username, password);
        navigate('/dashboard');
      }, 1500);
    } else {
      toast.error('Invalid username or password');
      setLoading(false);
    }
  };

  if (showLoader) {
    return <GearLoader />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-white p-4">
      <div className="w-full max-w-md">
        {/* Logo & Title */}
        <div className="text-center mb-8">
          <img src={fas} alt="FAS Logo" className="w-36 h-auto object-contain mx-auto mb-4" />
          <p className="text-gray-500 text-lg mt-1">ERP</p>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200/50 p-8">
          <div className="mb-6">
            <h2 className="text-3xl font-bold text-gray-900">Welcome back</h2>
            <p className="text-gray-500 text-lg mt-1">Sign in to access your account</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-base font-semibold text-gray-700">Username</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <Input
                  id="username"
                  type="text"
                  placeholder="Enter your username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  className="pl-11 h-14 text-lg bg-gray-50 border-gray-200 focus:bg-white transition-colors"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-base font-semibold text-gray-700">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="pl-11 pr-12 h-14 text-lg bg-gray-50 border-gray-200 focus:bg-white transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-3 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-14 text-lg bg-blue-900 hover:bg-blue-800 text-white font-semibold shadow-lg shadow-blue-900/20 transition-all"
              disabled={loading}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Signing in...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  Sign In
                  <ArrowRight className="h-5 w-5" />
                </span>
              )}
            </Button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          FAS Pvt Ltd &copy; {new Date().getFullYear()}. All rights reserved. 26.06.0-1.0.0
        </p>
      </div>
    </div>
  );
}
