-- CalmPath Database Schema

-- 1. Users table (Custom extension of auth.users)
CREATE TABLE public.custom_users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('parent', 'child')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Parent-Child Relationship table
CREATE TABLE public.parent_child (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id UUID REFERENCES public.custom_users(id) ON DELETE CASCADE NOT NULL,
    child_id UUID REFERENCES public.custom_users(id) ON DELETE CASCADE NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'declined')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(parent_id, child_id)
);

-- 3. Invitations table
CREATE TABLE public.invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id UUID REFERENCES public.custom_users(id) ON DELETE CASCADE NOT NULL,
    child_email TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'used', 'expired')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Tasks table
CREATE TABLE public.tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    child_id UUID REFERENCES public.custom_users(id) ON DELETE CASCADE NOT NULL,
    assigned_by UUID REFERENCES public.custom_users(id) NOT NULL,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    is_completed BOOLEAN DEFAULT FALSE NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Focus Sessions table
CREATE TABLE public.focus_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    child_id UUID REFERENCES public.custom_users(id) ON DELETE CASCADE NOT NULL,
    task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE,
    focus_duration INTEGER DEFAULT 0 NOT NULL, -- in seconds
    distraction_count INTEGER DEFAULT 0 NOT NULL,
    break_count INTEGER DEFAULT 0 NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. Emotion Samples table
CREATE TABLE public.emotion_samples (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    child_id UUID REFERENCES public.custom_users(id) ON DELETE CASCADE NOT NULL,
    session_id UUID REFERENCES public.focus_sessions(id) ON DELETE CASCADE,
    emotion TEXT NOT NULL,
    confidence FLOAT NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 7. Chat Logs
CREATE TABLE public.chat_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.custom_users(id) ON DELETE CASCADE NOT NULL,
    user_message TEXT NOT NULL,
    bot_response TEXT NOT NULL,
    emotion_context TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 8. Behaviort/Focus Events (Tab switches, breaks, etc.)
CREATE TABLE public.focus_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    child_id UUID REFERENCES public.custom_users(id) ON DELETE CASCADE NOT NULL,
    session_id UUID REFERENCES public.focus_sessions(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL, -- 'tab_switch', 'break_start', 'break_end'
    details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 9. Generated Reports
CREATE TABLE public.reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    child_id UUID REFERENCES public.custom_users(id) ON DELETE CASCADE NOT NULL,
    generated_by UUID REFERENCES public.custom_users(id) NOT NULL,
    report_type TEXT NOT NULL CHECK (report_type IN ('daily', 'weekly', 'monthly')),
    content TEXT NOT NULL,
    period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS POLICIES

ALTER TABLE public.custom_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parent_child ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.focus_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emotion_samples ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.focus_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- Custom Users: Users can read their own profile, or search others by email for inviting
CREATE POLICY "Users can read own profile" ON public.custom_users
    FOR SELECT USING (auth.uid() = id OR (auth.role() = 'authenticated'));

CREATE POLICY "Users can insert own profile" ON public.custom_users
    FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.custom_users
    FOR UPDATE USING (auth.uid() = id);

-- Parent-Child: Parents can see their links, children can see their links
CREATE POLICY "Users can see their own parent_child links" ON public.parent_child
    FOR SELECT USING (auth.uid() = parent_id OR auth.uid() = child_id);

CREATE POLICY "Parents can invite children" ON public.parent_child
    FOR INSERT WITH CHECK (auth.uid() = parent_id);

-- Tasks: Parents can manage tasks for their linked children, children can see their tasks
CREATE POLICY "Parents can manage tasks for linked children" ON public.tasks
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.parent_child
            WHERE parent_child.parent_id = auth.uid() AND parent_child.child_id = tasks.child_id
        )
    );

CREATE POLICY "Children can see their own tasks" ON public.tasks
    FOR SELECT USING (child_id = auth.uid());

CREATE POLICY "Children can update their own tasks" ON public.tasks
    FOR UPDATE USING (child_id = auth.uid());

-- Emotion Samples & Sessions: Parents can see their children's data
CREATE POLICY "Parents can view child data" ON public.emotion_samples
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.parent_child
            WHERE parent_child.parent_id = auth.uid() AND parent_child.child_id = emotion_samples.child_id
        )
    );

CREATE POLICY "Children can add their own emotion samples" ON public.emotion_samples
    FOR INSERT WITH CHECK (child_id = auth.uid());

-- Focus Sessions
CREATE POLICY "Parents can view child sessions" ON public.focus_sessions
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.parent_child
            WHERE parent_child.parent_id = auth.uid() AND parent_child.child_id = focus_sessions.child_id
        )
    );

CREATE POLICY "Children can start sessions" ON public.focus_sessions
    FOR INSERT WITH CHECK (child_id = auth.uid());

CREATE POLICY "Children can update their own sessions" ON public.focus_sessions
    FOR UPDATE USING (child_id = auth.uid());

-- Focus Events
CREATE POLICY "Parents can view child events" ON public.focus_events
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.parent_child
            WHERE parent_child.parent_id = auth.uid() AND parent_child.child_id = focus_events.child_id
        )
    );

CREATE POLICY "Children can log events" ON public.focus_events
    FOR INSERT WITH CHECK (child_id = auth.uid());

-- Reports
CREATE POLICY "Users can view child reports" ON public.reports
    FOR SELECT USING (
        child_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.parent_child
            WHERE parent_child.parent_id = auth.uid() AND parent_child.child_id = reports.child_id
        )
    );

CREATE POLICY "Parents can generate reports" ON public.reports
    FOR INSERT WITH CHECK (generated_by = auth.uid());

-- Chat Logs
CREATE POLICY "Users can manage their own chat logs" ON public.chat_logs
    FOR ALL USING (user_id = auth.uid());
