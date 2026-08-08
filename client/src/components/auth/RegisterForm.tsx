import React, { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { Eye, EyeOff, Map } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

interface RegisterFormProps {
  onSuccess: () => void;
  onToggleForm: () => void;
}

export const RegisterForm: React.FC<RegisterFormProps> = ({ onSuccess, onToggleForm }) => {
  const { register, loading, error } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const success = await register({ name, email, password });
    if (success) {
      onSuccess();
    }
  };

  return (
    <div className="w-full max-w-md p-8 rounded-3xl bg-white dark:bg-midnight-2 border border-slate-200 dark:border-white/10 shadow-2xl">
      <div className="flex flex-col items-center mb-8">
        <div className="p-3 bg-evergreen/10 dark:bg-grapefruit/10 rounded-xl mb-4">
          <Map className="w-8 h-8 text-evergreen dark:text-grapefruit" />
        </div>
        <h2 className="text-2xl font-extrabold text-slate-900 dark:text-porcelain tracking-tight">Create Account</h2>
        <p className="text-slate-500 dark:text-slate-400 mt-2 text-sm font-medium">Join AnantYatra and plan infinite journeys</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label className="text-slate-700 dark:text-slate-300 font-semibold">Full Name</Label>
          <Input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="bg-slate-50 border-slate-200 text-slate-900 dark:bg-white/5 dark:border-white/10 dark:text-porcelain placeholder:text-slate-400 dark:placeholder:text-slate-500 h-11"
            placeholder="John Doe"
            required
          />
        </div>

        <div className="space-y-2">
          <Label className="text-slate-700 dark:text-slate-300 font-semibold">Email Address</Label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="bg-slate-50 border-slate-200 text-slate-900 dark:bg-white/5 dark:border-white/10 dark:text-porcelain placeholder:text-slate-400 dark:placeholder:text-slate-500 h-11"
            placeholder="you@example.com"
            required
          />
        </div>

        <div className="space-y-2">
          <Label className="text-slate-700 dark:text-slate-300 font-semibold">Password</Label>
          <div className="relative">
            <Input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-slate-50 border-slate-200 text-slate-900 dark:bg-white/5 dark:border-white/10 dark:text-porcelain placeholder:text-slate-400 dark:placeholder:text-slate-500 h-11 pr-10"
              placeholder="••••••••"
              required
              minLength={6}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl">
            <p className="text-xs text-red-600 dark:text-red-400 text-center font-bold">{error}</p>
          </div>
        )}

        <Button
          type="submit"
          disabled={loading}
          className="w-full h-11 bg-evergreen hover:bg-evergreen/90 dark:bg-grapefruit dark:hover:bg-grapefruit/90 text-white rounded-xl shadow-md font-bold text-[15px] transition-all"
        >
          {loading ? (
            <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          ) : (
            'Create Account'
          )}
        </Button>
      </form>

      <p className="mt-6 text-center text-xs font-medium text-slate-500 dark:text-slate-400">
        Already have an account?{' '}
        <button onClick={onToggleForm} className="font-bold text-evergreen dark:text-grapefruit hover:underline transition-colors">
          Sign In
        </button>
      </p>
    </div>
  );
};
