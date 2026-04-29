/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// Initialize with dummy values if missing to prevent boot-time crash, 
// but we'll check isSupabaseConfigured in the UI.
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co', 
  supabaseAnonKey || 'placeholder'
);

export type UserProfile = {
  id: string;
  email: string;
  name: string;
  role: 'parent' | 'child';
  created_at: string;
};

export type Task = {
  id: string;
  child_id: string;
  assigned_by: string;
  title: string;
  url: string;
  reference_link: string | null;
  notes: string | null;
  is_completed: boolean;
  completed_at: string | null;
  created_at: string;
};

export type EmotionSample = {
  id: string;
  child_id: string;
  session_id: string | null;
  emotion: string;
  confidence: number;
  timestamp: string;
};

export type FocusSession = {
  id: string;
  child_id: string;
  task_id: string | null;
  start_time: string;
  end_time: string | null;
  focus_duration: number;
  distraction_count: number;
  break_count: number;
  created_at: string;
};

export type FocusEvent = {
  id: string;
  child_id: string;
  session_id: string | null;
  event_type: 'tab_switch' | 'break_start' | 'break_end';
  details: any;
  created_at: string;
};

export type Report = {
  id: string;
  child_id: string;
  generated_by: string;
  report_type: 'daily' | 'weekly' | 'monthly';
  content: string;
  period_start: string;
  period_end: string;
  created_at: string;
};

export type ChildNote = {
  id: string;
  user_id: string;
  task_id: string;
  content: string;
  created_at: string;
  updated_at: string;
};
