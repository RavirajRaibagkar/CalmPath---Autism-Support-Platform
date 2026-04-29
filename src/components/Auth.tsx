import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { motion } from 'motion/react';
import { Mail, Lock, User, Users, Loader2 } from 'lucide-react';

interface AuthProps {
  onAuthSuccess: () => void;
  sessionUser?: any;
}

export default function Auth({ onAuthSuccess, sessionUser }: AuthProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'parent' | 'child'>('child');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If user is already in sessionUser but we are here, they need a profile
  const needsProfile = !!sessionUser;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (needsProfile) {
        // Just create the profile for the existing user
        const { error: profileError } = await supabase
          .from('custom_users')
          .upsert([{ id: sessionUser.id, email: sessionUser.email, name, role }], { onConflict: 'id' });
        
        if (profileError) throw profileError;
      } else if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        // Sign up the user
        const { data: { user }, error: signUpError } = await supabase.auth.signUp({ 
          email, 
          password,
          options: {
            data: { display_name: name } 
          }
        });
        
        if (signUpError) throw signUpError;
        
        if (user) {
          const { error: profileError } = await supabase
            .from('custom_users')
            .upsert([{ id: user.id, email, name, role }], { onConflict: 'id' });
          if (profileError) throw profileError;
        }
      }
      onAuthSuccess();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-calm-blue">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md p-8 glass rounded-3xl"
      >
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-brand-primary to-brand-accent bg-clip-text text-transparent">
            CalmPath
          </h1>
          <p className="text-slate-600 mt-2">
            {needsProfile 
              ? 'Complete your profile information.' 
              : isLogin 
                ? 'Welcome back! Let\'s start learning.' 
                : 'Join your calm learning journey today.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {(needsProfile || !isLogin) && (
            <div className="space-y-4">
              <div className="relative">
                <User className="absolute left-3 top-3.5 h-5 w-5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Full Name"
                  className="w-full pl-10 pr-4 py-3 rounded-2xl bg-white/50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-primary"
                  value={needsProfile && !name ? sessionUser.user_metadata?.display_name || '' : name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="flex gap-2 p-1 bg-slate-100 rounded-2xl">
                <button
                  type="button"
                  onClick={() => setRole('child')}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${role === 'child' ? 'bg-white shadow-sm' : 'text-slate-500'}`}
                >
                  Student
                </button>
                <button
                  type="button"
                  onClick={() => setRole('parent')}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${role === 'parent' ? 'bg-white shadow-sm' : 'text-slate-500'}`}
                >
                  Parent
                </button>
              </div>
            </div>
          )}

          {!needsProfile && (
            <>
              <div className="relative">
                <Mail className="absolute left-3 top-3.5 h-5 w-5 text-slate-400" />
                <input
                  type="email"
                  placeholder="Email Address"
                  className="w-full pl-10 pr-4 py-3 rounded-2xl bg-white/50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-primary"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="relative">
                <Lock className="absolute left-3 top-3.5 h-5 w-5 text-slate-400" />
                <input
                  type="password"
                  placeholder="Password"
                  className="w-full pl-10 pr-4 py-3 rounded-2xl bg-white/50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-primary"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </>
          )}

          {error && <p className="text-red-500 text-sm px-2">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-brand-primary text-slate-900 font-bold rounded-2xl shadow-lg hover:brightness-105 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {loading ? <Loader2 className="animate-spin mx-auto" /> : (needsProfile ? 'Complete Setup' : isLogin ? 'Sign In' : 'Create Account')}
          </button>

          {needsProfile && (
            <button 
              type="button"
              onClick={() => supabase.auth.signOut()}
              className="w-full text-sm text-slate-400 py-2 hover:text-slate-600"
            >
              Cancel and Sign Out
            </button>
          )}
        </form>

        {!needsProfile && (
          <div className="mt-8 text-center">
            <button 
              onClick={() => setIsLogin(!isLogin)}
              className="text-slate-600 hover:text-slate-900 transition-colors"
            >
              {isLogin ? "Don't have an account? Sign Up" : "Already have an account? Sign In"}
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
