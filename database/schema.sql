-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.chat_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  user_message text NOT NULL,
  bot_response text NOT NULL,
  emotion_context text,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT chat_logs_pkey PRIMARY KEY (id),
  CONSTRAINT chat_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.custom_users(id)
);
CREATE TABLE public.child_notes (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid,
  task_id uuid,
  content text,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT child_notes_pkey PRIMARY KEY (id),
  CONSTRAINT child_notes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT child_notes_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id)
);
CREATE TABLE public.custom_users (
  id uuid NOT NULL,
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  role text NOT NULL CHECK (role = ANY (ARRAY['parent'::text, 'child'::text])),
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT custom_users_pkey PRIMARY KEY (id),
  CONSTRAINT custom_users_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);
CREATE TABLE public.emotion_samples (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL,
  session_id uuid,
  emotion text NOT NULL,
  confidence double precision NOT NULL,
  timestamp timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT emotion_samples_pkey PRIMARY KEY (id),
  CONSTRAINT emotion_samples_child_id_fkey FOREIGN KEY (child_id) REFERENCES public.custom_users(id),
  CONSTRAINT emotion_samples_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.focus_sessions(id)
);
CREATE TABLE public.focus_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL,
  session_id uuid,
  event_type text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT focus_events_pkey PRIMARY KEY (id),
  CONSTRAINT focus_events_child_id_fkey FOREIGN KEY (child_id) REFERENCES public.custom_users(id),
  CONSTRAINT focus_events_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.focus_sessions(id)
);
CREATE TABLE public.focus_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL,
  task_id uuid,
  start_time timestamp with time zone NOT NULL,
  end_time timestamp with time zone,
  focus_duration integer NOT NULL DEFAULT 0,
  distraction_count integer NOT NULL DEFAULT 0,
  break_count integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT focus_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT focus_sessions_child_id_fkey FOREIGN KEY (child_id) REFERENCES public.custom_users(id),
  CONSTRAINT focus_sessions_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id)
);
CREATE TABLE public.invitations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  parent_id uuid NOT NULL,
  child_email text NOT NULL,
  code text NOT NULL UNIQUE,
  status text NOT NULL CHECK (status = ANY (ARRAY['pending'::text, 'used'::text, 'expired'::text])),
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT invitations_pkey PRIMARY KEY (id),
  CONSTRAINT invitations_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.custom_users(id)
);
CREATE TABLE public.parent_child (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  parent_id uuid NOT NULL,
  child_id uuid NOT NULL,
  status text NOT NULL CHECK (status = ANY (ARRAY['pending'::text, 'accepted'::text, 'declined'::text])),
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT parent_child_pkey PRIMARY KEY (id),
  CONSTRAINT parent_child_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.custom_users(id),
  CONSTRAINT parent_child_child_id_fkey FOREIGN KEY (child_id) REFERENCES public.custom_users(id)
);
CREATE TABLE public.quiz_questions (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  quiz_id uuid,
  question_text text NOT NULL,
  options ARRAY NOT NULL,
  correct_option_index integer NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  CONSTRAINT quiz_questions_pkey PRIMARY KEY (id),
  CONSTRAINT quiz_questions_quiz_id_fkey FOREIGN KEY (quiz_id) REFERENCES public.quizzes(id)
);
CREATE TABLE public.quiz_submissions (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  quiz_id uuid,
  child_id uuid,
  score integer NOT NULL,
  total_questions integer NOT NULL,
  completed_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  CONSTRAINT quiz_submissions_pkey PRIMARY KEY (id),
  CONSTRAINT quiz_submissions_quiz_id_fkey FOREIGN KEY (quiz_id) REFERENCES public.quizzes(id),
  CONSTRAINT quiz_submissions_child_id_fkey FOREIGN KEY (child_id) REFERENCES auth.users(id)
);
CREATE TABLE public.quizzes (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  assigned_by uuid,
  child_id uuid,
  title text NOT NULL,
  description text,
  time_limit_minutes integer DEFAULT 10,
  is_completed boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  CONSTRAINT quizzes_pkey PRIMARY KEY (id),
  CONSTRAINT quizzes_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES auth.users(id),
  CONSTRAINT quizzes_child_id_fkey FOREIGN KEY (child_id) REFERENCES auth.users(id)
);
CREATE TABLE public.reports (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL,
  generated_by uuid NOT NULL,
  report_type text NOT NULL,
  content text NOT NULL,
  focus_score integer NOT NULL DEFAULT 0,
  emotion_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  period_start timestamp with time zone NOT NULL,
  period_end timestamp with time zone NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT reports_pkey PRIMARY KEY (id),
  CONSTRAINT reports_child_id_fkey FOREIGN KEY (child_id) REFERENCES public.custom_users(id),
  CONSTRAINT reports_generated_by_fkey FOREIGN KEY (generated_by) REFERENCES public.custom_users(id)
);
CREATE TABLE public.tasks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL,
  assigned_by uuid NOT NULL,
  title text NOT NULL,
  url text NOT NULL,
  is_completed boolean NOT NULL DEFAULT false,
  completed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  reference_link text,
  notes text,
  CONSTRAINT tasks_pkey PRIMARY KEY (id),
  CONSTRAINT tasks_child_id_fkey FOREIGN KEY (child_id) REFERENCES public.custom_users(id),
  CONSTRAINT tasks_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.custom_users(id)
);