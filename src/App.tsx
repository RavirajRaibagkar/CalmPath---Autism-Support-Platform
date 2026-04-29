import React, { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured, type UserProfile } from './lib/supabase';
import Auth from './components/Auth';
import ChildDashboard from './components/ChildDashboard';
import ParentDashboard from './components/ParentDashboard';
import { Loader2, AlertCircle } from 'lucide-react';

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  if (!isSupabaseConfigured) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-calm-blue p-6">
        <div className="max-w-md w-full glass p-8 rounded-[32px] text-center space-y-6">
          <div className="w-20 h-20 bg-brand-secondary/20 rounded-full flex items-center justify-center mx-auto">
            <AlertCircle className="w-10 h-10 text-brand-secondary" />
          </div>
          <h1 className="text-2xl font-bold">Setup Required</h1>
          <p className="text-slate-600">
            Please configure your Supabase URL and Anon Key in the <b>Secrets</b> panel to start using CalmPath.
          </p>
          <div className="bg-slate-100 p-4 rounded-xl text-left text-sm font-mono space-y-2">
            <p>VITE_SUPABASE_URL</p>
            <p>VITE_SUPABASE_ANON_KEY</p>
          </div>
          <p className="text-xs text-slate-400">
            You can find these in your Supabase Project Settings &rarr; API.
          </p>
        </div>
      </div>
    );
  }

  useEffect(() => {
    // Check current session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      else setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function fetchProfile(id: string) {
    try {
      const { data, error } = await supabase
        .from('custom_users')
        .select('*')
        .eq('id', id)
        .maybeSingle(); // Use maybeSingle to avoid 406/PGRST116 errors if row is missing
      
      if (error) throw error;
      
      if (!data) {
        console.warn('Authenticated user has no profile in custom_users.');
        // Don't sign out immediately, set profile to null and stop loading
        // App will render Auth component which should handle profile creation
        setProfile(null);
        setLoading(false);
        return;
      }

      setProfile(data);
    } catch (err) {
      console.error('Error fetching profile:', err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-soft-bg">
        <Loader2 className="w-12 h-12 text-brand-primary animate-spin" />
      </div>
    );
  }

  if (!user || !profile) {
    return <Auth onAuthSuccess={() => setLoading(true)} sessionUser={user} />;
  }

  return (
    <div className="min-h-screen bg-soft-bg">
      {profile.role === 'child' ? (
        <ChildDashboard profile={profile} user={user} />
      ) : (
        <ParentDashboard profile={profile} user={user} />
      )}
    </div>
  );
}
