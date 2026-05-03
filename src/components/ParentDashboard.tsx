import React, { useState, useEffect } from 'react';
import { supabase, type UserProfile, type Task, type EmotionSample, type FocusSession, type FocusEvent, type Report, type Quiz, type QuizQuestion, type QuizSubmission } from '../lib/supabase';
import { getParentInsights, generateReportSummary, askGemini } from '../lib/gemini';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users, Plus, ClipboardList, TrendingUp, AlertTriangle, Activity,
  CheckCircle, Clock, Coffee, Smile, Send, Loader2,
  Trash2, ExternalLink, RefreshCcw, LogOut, FileText,
  Calendar, Layout, ChevronRight, MessageSquare, BrainCircuit, HelpCircle, Gamepad
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import Markdown from 'react-markdown';

interface Props {
  profile: UserProfile;
  user: any;
}

export default function ParentDashboard({ profile, user }: Props) {
  const [children, setChildren] = useState<UserProfile[]>([]);
  const [selectedChild, setSelectedChild] = useState<UserProfile | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [emotionSamples, setEmotionSamples] = useState<EmotionSample[]>([]);
  const [sessions, setSessions] = useState<FocusSession[]>([]);
  const [events, setEvents] = useState<FocusEvent[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [quizzes, setQuizzes] = useState<(Quiz & { questions_count: number, submissions: QuizSubmission[] })[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'reports' | 'quizzes' | 'chat'>('overview');
  const [liveFrame, setLiveFrame] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(false);
  
  // Form states
  const [inviteEmail, setInviteEmail] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskUrl, setTaskUrl] = useState('');
  const [taskRefLink, setTaskRefLink] = useState('');
  const [taskNotes, setTaskNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [insights, setInsights] = useState<string | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);

  // Chat states
  const [chatMessages, setChatMessages] = useState<{role: 'user' | 'bot', text: string}[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  // Quiz Form states
  const [quizTitle, setQuizTitle] = useState('');
  const [quizTime, setQuizTime] = useState(10);
  const [quizQuestions, setQuizQuestions] = useState<{text: string, options: string[], correct: number}[]>([
    { text: '', options: ['', '', '', ''], correct: 0 }
  ]);

  useEffect(() => {
    fetchRelationships();
  }, []);

  // Derived state - computed from state variables above
  const completedTasks = tasks.filter(t => t.is_completed).length;
  const totalFocusTime = sessions.reduce((acc, s) => acc + s.focus_duration, 0);
  const lastEmotion = emotionSamples[0]?.emotion || 'Unknown';
  
  const emotionData = emotionSamples.reduce((acc: any, curr) => {
    const existing = acc.find((a: any) => a.name === curr.emotion);
    if (existing) existing.value++;
    else acc.push({ name: curr.emotion, value: 1 });
    return acc;
  }, []);

  const COLORS = ['#8DE4D0', '#FFD4A3', '#B4B9FC', '#D1E9FF', '#FFF1E6', '#FFB7B7'];

  useEffect(() => {
    if (selectedChild) {
      fetchChildData();
      
      // Real-time subscriptions
      const tasksSub = supabase.channel(`tasks-${selectedChild.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `child_id=eq.${selectedChild.id}` }, fetchChildData)
        .subscribe();
        
      const sessionsSub = supabase.channel(`sessions-${selectedChild.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'focus_sessions', filter: `child_id=eq.${selectedChild.id}` }, fetchChildData)
        .subscribe();

      const eventsSub = supabase.channel(`events-${selectedChild.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'focus_events', filter: `child_id=eq.${selectedChild.id}` }, fetchChildData)
        .subscribe();

      const samplesSub = supabase.channel(`samples-${selectedChild.id}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'emotion_samples', filter: `child_id=eq.${selectedChild.id}` }, fetchChildData)
        .subscribe();

      // Live monitoring broadcast subscription
      const liveSub = supabase.channel(`live-${selectedChild.id}`)
        .on('broadcast', { event: 'video-frame' }, (payload) => {
          setLiveFrame(payload.payload.frame);
          setIsLive(true);
          // Auto-clear live status if no frames for 5 seconds
          const timer = setTimeout(() => setIsLive(false), 5000);
          return () => clearTimeout(timer);
        })
        .subscribe();

      return () => {
        tasksSub.unsubscribe();
        sessionsSub.unsubscribe();
        eventsSub.unsubscribe();
        samplesSub.unsubscribe();
        liveSub.unsubscribe();
      };
    }
  }, [selectedChild]);

  async function fetchRelationships() {
    const { data } = await supabase
      .from('parent_child')
      .select('child_id, custom_users!parent_child_child_id_fkey(*)')
      .eq('parent_id', profile.id);
    
    if (data) {
      const kids = data.map((d: any) => d.custom_users);
      setChildren(kids);
      if (kids.length > 0 && !selectedChild) setSelectedChild(kids[0]);
    }
  }

  async function fetchChildData() {
    if (!selectedChild) return;

    const [tasksRes, samplesRes, sessionsRes, eventsRes, reportsRes, quizzesRes] = await Promise.all([
      supabase.from('tasks').select('*').eq('child_id', selectedChild.id).order('created_at', { ascending: false }),
      supabase.from('emotion_samples').select('*').eq('child_id', selectedChild.id).order('timestamp', { ascending: false }).limit(100),
      supabase.from('focus_sessions').select('*').eq('child_id', selectedChild.id).order('created_at', { ascending: false }),
      supabase.from('focus_events').select('*').eq('child_id', selectedChild.id).order('created_at', { ascending: false }).limit(50),
      supabase.from('reports').select('*').eq('child_id', selectedChild.id).order('created_at', { ascending: false }),
      supabase.from('quizzes').select('*, quiz_questions(count), quiz_submissions(*)').eq('child_id', selectedChild.id).order('created_at', { ascending: false })
    ]);

    if (tasksRes.data) setTasks(tasksRes.data);
    if (samplesRes.data) setEmotionSamples(samplesRes.data);
    if (sessionsRes.data) setSessions(sessionsRes.data);
    if (eventsRes.data) setEvents(eventsRes.data);
    if (reportsRes.data) setReports(reportsRes.data);
    if (quizzesRes.data) {
      setQuizzes(quizzesRes.data.map((q: any) => ({
        ...q,
        questions_count: q.quiz_questions?.[0]?.count || 0,
        submissions: q.quiz_submissions || []
      })));
    }
  }

  async function handleInvite() {
    if (!inviteEmail) return;
    setLoading(true);
    // In a real app, this would send an email and create an invitation record.
    // For this demo, we'll try to find a user with this email and link directly if they exist.
    try {
      const { data: child, error } = await supabase
        .from('custom_users')
        .select('*')
        .eq('email', inviteEmail)
        .eq('role', 'child')
        .single();
      
      if (error || !child) throw new Error('Could not find a student with that email.');

      const { error: linkError } = await supabase
        .from('parent_child')
        .insert({ parent_id: profile.id, child_id: child.id, status: 'accepted' });
      
      if (linkError) throw linkError;

      alert('Student linked successfully!');
      setInviteEmail('');
      fetchRelationships();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddTask(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedChild || !taskTitle || !taskUrl) return;
    setLoading(true);

    const { error } = await supabase.from('tasks').insert({
      child_id: selectedChild.id,
      assigned_by: profile.id,
      title: taskTitle,
      url: taskUrl,
      reference_link: taskRefLink || null,
      notes: taskNotes || null
    });

    if (!error) {
      setTaskTitle('');
      setTaskUrl('');
      setTaskRefLink('');
      setTaskNotes('');
      fetchChildData();
    }
    setLoading(false);
  }

  async function generateInsights() {
    setInsightsLoading(true);
    const summary = {
      sessions: sessions.slice(0, 5),
      emotions: emotionSamples.slice(0, 50),
      tasks: tasks.slice(0, 5)
    };
    const res = await getParentInsights(summary);
    setInsights(res);
    setInsightsLoading(false);
  }

  async function handleGenerateReport(type: 'daily' | 'weekly' | 'monthly') {
    if (!selectedChild) return;
    setReportLoading(true);
    
    const now = new Date();
    let periodStart = new Date();
    
    if (type === 'daily') periodStart.setDate(now.getDate() - 1);
    else if (type === 'weekly') periodStart.setDate(now.getDate() - 7);
    else if (type === 'monthly') periodStart.setMonth(now.getMonth() - 1);

    const filteredSessions = sessions.filter(s => new Date(s.start_time) >= periodStart);
    const filteredEmotions = emotionSamples.filter(s => new Date(s.timestamp) >= periodStart);
    const filteredEvents = events.filter(e => new Date(e.created_at) >= periodStart);
    
    const summary = {
      profile: selectedChild,
      sessions: filteredSessions,
      emotions: filteredEmotions,
      events: filteredEvents,
      stats: {
        totalFocusTime: filteredSessions.reduce((acc, s) => acc + s.focus_duration, 0),
        distractionCount: filteredSessions.reduce((acc, s) => acc + s.distraction_count, 0),
        tabSwitches: filteredEvents.filter(e => e.event_type === 'tab_switch').length,
      }
    };
    
    let content = '';
    try {
      content = await generateReportSummary(summary, type);
    } catch (err: any) {
      console.error("AI Report Generation Error:", err);
      // Fallback structured report if AI fails (e.g. rate limited or quota exhausted)
      content = `### ${type.toUpperCase()} Performance Report (Manual Summary)
Student: **${selectedChild.name}**
Generated on: ${new Date().toLocaleDateString()}

#### 📊 Learning Statistics
- **Total Focus Time:** ${Math.round(summary.stats.totalFocusTime / 60)} minutes
- **Distraction Frequency:** ${summary.stats.distractionCount} events recorded
- **Browser Discipline:** ${summary.stats.tabSwitches} tab switches detected

#### 🧠 Emotional Climate
The session data reveals various emotional states. The most frequent emotions recorded were:
${Object.entries(
  filteredEmotions.reduce((acc: any, curr) => {
    acc[curr.emotion] = (acc[curr.emotion] || 0) + 1;
    return acc;
  }, {})
).map(([emo, count]) => `- ${emo}: ${count} samples`).join('\n')}

*Note: This report was generated using core session data as the AI analysis service is currently experiencing high demand. Please try generating an AI-enhanced report later for deeper behavioral insights.*`;
    }
    
    // Calculate simple metrics for structured storage
    const focusScore = summary.stats.totalFocusTime > 0 
      ? Math.max(0, Math.min(100, 100 - (summary.stats.distractionCount * 5))) 
      : 0;
      
    const emoSummary = filteredEmotions.reduce((acc: any, curr) => {
      acc[curr.emotion] = (acc[curr.emotion] || 0) + 1;
      return acc;
    }, {});
    
    const { error } = await supabase.from('reports').insert({
      child_id: selectedChild.id,
      generated_by: profile.id,
      report_type: type,
      content,
      focus_score: Math.round(focusScore),
      emotion_summary: JSON.parse(JSON.stringify(emoSummary)), // Ensure plain object for JSONB
      period_start: periodStart.toISOString(),
      period_end: now.toISOString()
    });
    
    if (!error) {
      alert('Report saved successfully!');
      fetchChildData();
    } else {
      console.error('Report Save Error:', error);
      alert(`Failed to save report: ${error.message}. Check if 'focus_score' and 'emotion_summary' columns exist in your 'reports' table.`);
    }
    
    setReportLoading(false);
  }

  async function handleDeleteReport(id: string) {
    if (!confirm('Are you sure you want to delete this report?')) return;
    const { error } = await supabase.from('reports').delete().eq('id', id);
    if (!error) fetchChildData();
  }

  async function handleChat(e: React.FormEvent) {
    e.preventDefault();
    if (!chatInput.trim() || !selectedChild) return;
    
    const userMsg = chatInput;
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setChatLoading(true);
    
    const context = `You are discussing student ${selectedChild.name}. 
    Recent stats: ${completedTasks} tasks done, ${Math.round(totalFocusTime/60)}m focus time.
    Total tab switches: ${events.filter(e => e.event_type === 'tab_switch').length}.
    Latest reports: ${reports.slice(0, 2).map(r => r.content).join('\n---\n')}.
    Use this data to answer questions about the child, including educational needs or behavioral patterns.`;
    
    const reply = await askGemini(userMsg, context);
    setChatMessages(prev => [...prev, { role: 'bot', text: reply }]);
    setChatLoading(false);
  }

  async function handleCreateQuiz(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedChild || !quizTitle) return;
    setLoading(true);

    try {
      const { data: quiz, error: quizError } = await supabase.from('quizzes').insert({
        child_id: selectedChild.id,
        assigned_by: profile.id,
        title: quizTitle,
        time_limit_minutes: quizTime
      }).select().single();

      if (quizError) throw quizError;

      const questionsToAdd = quizQuestions.map(q => ({
        quiz_id: quiz.id,
        question_text: q.text,
        options: q.options,
        correct_option_index: q.correct
      }));

      const { error: questionsError } = await supabase.from('quiz_questions').insert(questionsToAdd);
      if (questionsError) throw questionsError;

      setQuizTitle('');
      setQuizQuestions([{ text: '', options: ['', '', '', ''], correct: 0 }]);
      fetchChildData();
      alert('Quiz created successfully!');
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteQuiz(id: string) {
    if (!confirm('Are you sure you want to delete this quiz?')) return;
    const { error } = await supabase.from('quizzes').delete().eq('id', id);
    if (!error) fetchChildData();
  }

  return (
    <div className="max-w-[1600px] mx-auto min-h-screen bg-[#f8fafc] flex flex-col lg:flex-row overflow-hidden">
      {/* SIDEBAR NAVIGATION */}
      <aside className="w-full lg:w-72 bg-white border-r border-slate-200 flex flex-col h-screen sticky top-0">
        <div className="p-8 pb-4">
          <div className="flex items-center gap-3 mb-10">
            <div className="w-12 h-12 rounded-2xl bg-brand-primary flex items-center justify-center font-black text-white shadow-xl shadow-brand-primary/20">
              {profile.name[0]}
            </div>
            <div>
              <h2 className="font-black text-slate-800 text-lg leading-tight">Parent</h2>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mt-1">Control Hub</p>
            </div>
          </div>

          <nav className="space-y-1">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-3 mb-3">Linked Students</h3>
            <div className="space-y-2 mb-8">
              {children.map(kid => (
                <button
                  key={kid.id}
                  onClick={() => setSelectedChild(kid)}
                  className={`w-full flex items-center gap-3 p-3 rounded-2xl transition-all group ${selectedChild?.id === kid.id ? 'bg-brand-primary/10 text-brand-primary' : 'hover:bg-slate-50 text-slate-600'}`}
                >
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black shadow-sm ${selectedChild?.id === kid.id ? 'bg-brand-primary text-white' : 'bg-slate-100 text-slate-400'}`}>
                    {kid.name[0]}
                  </div>
                  <span className="font-bold text-sm truncate">{kid.name}</span>
                </button>
              ))}
              
              <div className="p-1 mt-4">
                <div className="flex gap-1.5">
                  <input 
                    type="email" 
                    placeholder="Link Student Email" 
                    className="flex-1 bg-slate-50 rounded-xl px-4 py-2 border-none text-[10px] focus:ring-2 focus:ring-brand-primary/20 placeholder:text-slate-400"
                    value={inviteEmail}
                    onChange={e => setInviteEmail(e.target.value)}
                  />
                  <button onClick={handleInvite} className="p-2 bg-brand-accent text-white rounded-xl shadow-lg shadow-brand-accent/20 hover:scale-105 active:scale-95 transition-all">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-3 mb-3">Navigation</h3>
            {[
              { id: 'overview', label: 'Overview', icon: Layout },
              { id: 'quizzes', label: 'Manage Quizzes', icon: BrainCircuit },
              { id: 'reports', label: 'Progress Reports', icon: FileText },
              { id: 'chat', label: 'Ask AI Expert', icon: MessageSquare }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`w-full flex items-center gap-3 p-3 rounded-2xl transition-all font-bold text-sm ${activeTab === tab.id ? 'bg-slate-900 text-white shadow-xl shadow-slate-900/10' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                <tab.icon className={`w-4 h-4 ${activeTab === tab.id ? 'text-brand-primary' : ''}`} />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="mt-auto p-6 border-t border-slate-100">
          <button 
            onClick={() => supabase.auth.signOut()}
            className="w-full flex items-center gap-3 p-3 rounded-2xl text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all text-sm font-bold"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 h-screen overflow-y-auto p-4 lg:p-10 custom-scrollbar">
        {selectedChild ? (
          <div className="max-w-6xl mx-auto space-y-10">
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div>
                <h1 className="text-4xl font-black text-slate-800 tracking-tight">{selectedChild.name}'s Dashboard</h1>
                <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px] mt-1 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Live Monitoring Connection Established
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="px-4 py-2 bg-white rounded-2xl border border-slate-100 shadow-sm flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-brand-primary" />
                  <span className="text-xs font-bold text-slate-600">Active Session Tracker</span>
                </div>
              </div>
            </header>
            <AnimatePresence mode="wait">
              {activeTab === 'overview' && (
                <motion.div 
                  key="overview"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-8"
                >
                  <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                    {[
                      { label: 'Completed', value: completedTasks, icon: CheckCircle, color: 'text-brand-primary' },
                      { label: 'Avg Focus', value: `${Math.round(totalFocusTime / 60)}m`, icon: Clock, color: 'text-brand-accent' },
                      { label: 'Tab Switches', value: events.filter(e => e.event_type === 'tab_switch').length, icon: AlertTriangle, color: 'text-orange-500' },
                      { label: 'Breaks', value: sessions.reduce((acc, s) => acc + s.break_count, 0), icon: Coffee, color: 'text-brand-secondary' },
                      { label: 'Last Mood', value: lastEmotion, icon: Smile, color: 'text-green-500' }
                    ].map((stat, i) => (
                      <div key={i} className="glass p-6 rounded-[32px] text-center space-y-2 group hover:scale-105 transition-all cursor-default">
                        <stat.icon className={`w-8 h-8 mx-auto ${stat.color} group-hover:animate-bounce`} />
                        <p className="text-2xl font-black text-slate-800 tracking-tight">{stat.value}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] leading-tight">{stat.label}</p>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    <div className="lg:col-span-8 space-y-8">
                      <div className="glass p-8 rounded-[40px] space-y-6 relative overflow-hidden group">
                        <div className="flex items-center justify-between relative z-10">
                          <h3 className="text-2xl font-black text-slate-800">Remote Live Feed</h3>
                        </div>
                        <div className="aspect-video bg-slate-900 rounded-[32px] overflow-hidden relative group">
                          {liveFrame ? (
                            <img src={liveFrame} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            <div className="absolute inset-0 flex items-center justify-center text-slate-500">
                              No active feed
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="glass p-8 rounded-[40px] space-y-6">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="text-2xl font-black text-slate-800">Behavioral Events</h3>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Real-time engagement tracking</p>
                          </div>
                          <div className="p-3 bg-brand-primary/10 rounded-2xl">
                            <Activity className="w-5 h-5 text-brand-primary" />
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                          {events.length > 0 ? events.slice(0, 10).map(event => (
                            <div key={event.id} className="flex gap-4 p-5 bg-white/40 rounded-3xl border border-slate-100 hover:border-brand-primary transition-all group">
                              <div className={`p-3 rounded-2xl h-fit ${
                                event.event_type === 'tab_switch' ? 'bg-orange-100 text-orange-500' :
                                event.event_type === 'break_start' ? 'bg-blue-100 text-blue-500' :
                                'bg-green-100 text-green-500'
                              }`}>
                                {event.event_type === 'tab_switch' ? <Layout className="w-5 h-5" /> : 
                                 event.event_type === 'break_start' ? <Coffee className="w-5 h-5" /> : 
                                 <RefreshCcw className="w-5 h-5" />}
                              </div>
                              <div className="space-y-1">
                                <p className="text-sm font-black text-slate-800 capitalize leading-none pt-1">
                                  {event.event_type.replace('_', ' ')}
                                </p>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                                  {new Date(event.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </p>
                              </div>
                            </div>
                          )) : (
                            <div className="col-span-full py-16 text-center text-slate-300">
                              <Layout className="w-12 h-12 mx-auto mb-3 opacity-10" />
                              <p className="text-xs font-bold uppercase tracking-widest">No activity reported</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="lg:col-span-4 space-y-8">
                      <div className="glass p-8 rounded-[40px] space-y-4">
                        <h3 className="text-xl font-bold">Assign New Task</h3>
                        <form onSubmit={handleAddTask} className="space-y-4">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Task Name</label>
                            <input 
                              type="text" 
                              placeholder="e.g., Intro to Math" 
                              className="w-full bg-white rounded-xl px-4 py-3 border border-slate-100 text-sm"
                              value={taskTitle}
                              onChange={e => setTaskTitle(e.target.value)}
                              required
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">youtube url</label>
                            <input 
                              type="url" 
                              placeholder="https://youtube.com/..." 
                              className="w-full bg-white rounded-xl px-4 py-3 border border-slate-100 text-sm"
                              value={taskUrl}
                              onChange={e => setTaskUrl(e.target.value)}
                              required
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">reference url</label>
                            <input 
                              type="url" 
                              placeholder="Secondary resource..." 
                              className="w-full bg-white rounded-xl px-4 py-3 border border-slate-100 text-sm"
                              value={taskRefLink}
                              onChange={e => setTaskRefLink(e.target.value)}
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Notes for child</label>
                            <textarea 
                              placeholder="Instructions for the student..." 
                              className="w-full bg-white rounded-xl px-4 py-3 border border-slate-100 text-sm min-h-[100px] resize-none"
                              value={taskNotes}
                              onChange={e => setTaskNotes(e.target.value)}
                            />
                          </div>
                          <button type="submit" disabled={loading} className="w-full btn-primary py-4">
                            {loading ? <Loader2 className="animate-spin mx-auto w-5 h-5" /> : 'Assign Task'}
                          </button>
                        </form>
                      </div>

                      <div className="glass p-8 rounded-[40px] space-y-8">
                        <div className="flex items-center justify-between">
                          <h3 className="text-2xl font-black text-slate-800">Mood Analytics</h3>
                          <TrendingUp className="text-brand-primary w-6 h-6" />
                        </div>
                        <div className="h-[240px] min-w-0 relative">
                          {emotionData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Pie
                                  data={emotionData}
                                  innerRadius={60}
                                  outerRadius={80}
                                  paddingAngle={8}
                                  dataKey="value"
                                  stroke="none"
                                >
                                  {emotionData.map((_entry: any, index: number) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                  ))}
                                </Pie>
                                <Tooltip 
                                  contentStyle={{ borderRadius: '24px', border: 'none', padding: '16px', boxShadow: '0 20px 40px -10px rgba(0,0,0,0.1)' }}
                                  itemStyle={{ fontWeight: 'bold', textTransform: 'capitalize' }}
                                />
                              </PieChart>
                            </ResponsiveContainer>
                          ) : (
                            <div className="h-full flex flex-col items-center justify-center text-slate-300 space-y-4">
                              <Smile className="w-12 h-12 opacity-10" />
                              <p className="text-xs font-bold uppercase tracking-widest text-center">Pending Emotion Data</p>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="glass p-8 rounded-[40px] space-y-6">
                        <div className="flex items-center justify-between">
                          <h3 className="text-xl font-bold">AI Counselor</h3>
                          <button onClick={generateInsights} disabled={insightsLoading} className="p-2 bg-brand-accent/10 rounded-xl text-brand-accent hover:bg-brand-accent/20 transition-all">
                            {insightsLoading ? <Loader2 className="animate-spin w-5 h-5" /> : <RefreshCcw className="w-5 h-5" />}
                          </button>
                        </div>
                        <div className="prose prose-sm prose-slate max-w-none text-slate-600">
                          {insights ? (
                            <Markdown>{insights}</Markdown>
                          ) : (
                            <div className="py-12 text-center text-slate-300 space-y-4">
                              <TrendingUp className="w-10 h-10 mx-auto opacity-10" />
                              <p className="text-xs font-bold uppercase tracking-widest px-4">Generate instant behavioral patterns based on current session data.</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Learning Path */}
                  <div className="glass p-12 rounded-[40px] space-y-8">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-3xl font-black text-slate-800">Learning Path</h3>
                        <p className="text-slate-500 font-medium">Manage and review educational materials for {selectedChild.name}.</p>
                      </div>
                      <div className="p-4 bg-brand-primary/10 rounded-3xl">
                        <ClipboardList className="w-8 h-8 text-brand-primary" />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {tasks.map(task => (
                        <motion.div 
                          whileHover={{ y: -5 }}
                          key={task.id} 
                          className="flex flex-col p-6 bg-white/40 rounded-[32px] border border-slate-100 hover:border-brand-primary group transition-all"
                        >
                          <div className="flex justify-between items-start mb-4">
                            {task.is_completed ? (
                              <div className="bg-emerald-100 text-emerald-600 p-2 rounded-xl">
                                <CheckCircle className="w-5 h-5" />
                              </div>
                            ) : (
                              <div className="bg-slate-100 text-slate-400 p-2 rounded-xl">
                                <Clock className="w-5 h-5" />
                              </div>
                            )}
                            <div className="flex items-center gap-2">
                              <a href={task.url} target="_blank" rel="noreferrer" className="p-2 text-slate-300 hover:text-brand-accent transition-colors">
                                <ExternalLink className="w-5 h-5" />
                              </a>
                              <button 
                                onClick={async () => {
                                  if (confirm('Delete this task?')) {
                                    await supabase.from('tasks').delete().eq('id', task.id);
                                    fetchChildData();
                                  }
                                }}
                                className="p-2 text-slate-200 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                          <h4 className={`text-lg font-black text-slate-800 leading-tight mb-2 ${task.is_completed ? 'line-through opacity-40' : ''}`}>
                            {task.title}
                          </h4>
                          {task.notes && (
                            <p className="text-xs text-slate-500 line-clamp-2 mb-4 italic">"{task.notes}"</p>
                          )}
                          <p className="text-[10px] text-brand-accent font-black uppercase tracking-widest truncate mt-auto">{new URL(task.url).hostname}</p>
                        </motion.div>
                      ))}
                      {tasks.length === 0 && (
                        <div className="col-span-full py-12 text-center text-slate-300">
                          <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-10" />
                          <p>No tasks assigned yet.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}

          {activeTab === 'quizzes' && (
            <motion.div 
              key="quizzes"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="grid grid-cols-1 lg:grid-cols-12 gap-8"
            >
              <div className="lg:col-span-8 space-y-6">
                <div className="glass p-8 rounded-[40px] space-y-6">
                  <h3 className="text-2xl font-black text-slate-800">Assigned Quizzes</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {quizzes.map(quiz => (
                      <div key={quiz.id} className="p-6 bg-white/50 rounded-3xl border border-slate-100 flex flex-col group relative">
                        <button 
                          onClick={() => handleDeleteQuiz(quiz.id)}
                          className="absolute top-4 right-4 p-2 text-slate-300 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <div className="flex items-center gap-3 mb-4">
                          <div className={`p-3 rounded-2xl ${quiz.is_completed ? 'bg-emerald-100 text-emerald-600' : 'bg-brand-primary/10 text-brand-primary'}`}>
                            <HelpCircle className="w-5 h-5" />
                          </div>
                          <div>
                            <h4 className="font-bold text-slate-800">{quiz.title}</h4>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{quiz.questions_count} Questions • {quiz.time_limit_minutes}m</p>
                          </div>
                        </div>
                        
                        {quiz.submissions.length > 0 ? (
                          <div className="mt-auto space-y-2">
                            <div className="flex justify-between text-xs font-bold">
                              <span className="text-slate-400">Best Score</span>
                              <span className="text-emerald-500">{quiz.submissions[0].score}/{quiz.submissions[0].total_questions}</span>
                            </div>
                            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-emerald-500" 
                                style={{ width: `${(quiz.submissions[0].score / quiz.submissions[0].total_questions) * 100}%` }}
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="mt-auto text-xs text-slate-400 italic">Not taken yet</div>
                        )}
                      </div>
                    ))}
                    {quizzes.length === 0 && (
                      <div className="col-span-full py-12 text-center text-slate-300">
                        <BrainCircuit className="w-12 h-12 mx-auto mb-3 opacity-10" />
                        <p>No quizzes created yet.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="lg:col-span-4 bg-white/50 glass rounded-[40px] p-8 space-y-6">
                <h3 className="text-xl font-bold">Create New Quiz</h3>
                <form onSubmit={handleCreateQuiz} className="space-y-6">
                  <div className="space-y-4">
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase px-1">Quiz Title</label>
                      <input 
                        type="text" 
                        className="w-full bg-white rounded-xl px-4 py-3 border border-slate-100 text-sm"
                        placeholder="e.g., Weekly Math Quiz"
                        value={quizTitle}
                        onChange={e => setQuizTitle(e.target.value)}
                        required
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase px-1">Time Limit (mins)</label>
                      <input 
                        type="number" 
                        className="w-full bg-white rounded-xl px-4 py-3 border border-slate-100 text-sm"
                        value={quizTime}
                        onChange={e => setQuizTime(Number(e.target.value))}
                        min={1}
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex justify-between items-center px-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Questions</label>
                      <button 
                        type="button"
                        onClick={() => setQuizQuestions([...quizQuestions, { text: '', options: ['', '', '', ''], correct: 0 }])}
                        className="text-brand-primary text-xs font-bold hover:underline"
                      >
                        + Add Question
                      </button>
                    </div>

                    <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                      {quizQuestions.map((q, qIndex) => (
                        <div key={qIndex} className="p-4 bg-white rounded-2xl border border-slate-100 space-y-3">
                          <input 
                            placeholder={`Question ${qIndex + 1}`}
                            className="w-full text-xs font-bold text-slate-700 bg-slate-50 rounded-lg px-3 py-2 border-none"
                            value={q.text}
                            onChange={e => {
                              const newQs = [...quizQuestions];
                              newQs[qIndex].text = e.target.value;
                              setQuizQuestions(newQs);
                            }}
                            required
                          />
                          <div className="grid grid-cols-2 gap-2">
                            {q.options.map((opt, oIndex) => (
                              <div key={oIndex} className="flex items-center gap-2">
                                <input 
                                  type="radio" 
                                  name={`correct-${qIndex}`}
                                  checked={q.correct === oIndex}
                                  onChange={() => {
                                    const newQs = [...quizQuestions];
                                    newQs[qIndex].correct = oIndex;
                                    setQuizQuestions(newQs);
                                  }}
                                />
                                <input 
                                  placeholder={`Option ${oIndex + 1}`}
                                  className="w-full text-[10px] bg-slate-50 rounded-lg px-2 py-1.5 border-none"
                                  value={opt}
                                  onChange={e => {
                                    const newQs = [...quizQuestions];
                                    newQs[qIndex].options[oIndex] = e.target.value;
                                    setQuizQuestions(newQs);
                                  }}
                                  required
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <button type="submit" disabled={loading} className="w-full btn-primary py-4 text-sm">
                    {loading ? <Loader2 className="animate-spin mx-auto" /> : 'Settle Quiz'}
                  </button>
                </form>
              </div>
            </motion.div>
          )}

          {activeTab === 'reports' && (
            <motion.div 
              key="reports"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-8"
            >
              <div className="glass p-8 rounded-[40px] flex items-center justify-between">
                <div>
                  <h3 className="text-2xl font-bold">Progress Reports</h3>
                  <p className="text-slate-500">In-depth analysis of {selectedChild.name}'s journey.</p>
                </div>
                <div className="flex gap-3">
                  {(['daily', 'weekly', 'monthly'] as const).map(type => (
                    <button
                      key={type}
                      onClick={() => handleGenerateReport(type)}
                      disabled={reportLoading}
                      className="btn-accent px-6 capitalize flex items-center gap-2"
                    >
                      {reportLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                      New {type}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {reports.map(report => (
                   <div key={report.id} className="glass p-8 rounded-[40px] space-y-4 relative group">
                    <button 
                      onClick={() => handleDeleteReport(report.id)}
                      className="absolute top-6 right-6 p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-3">
                        <div className="p-3 bg-brand-primary/20 rounded-2xl text-brand-primary">
                          <Calendar className="w-6 h-6" />
                        </div>
                        <div>
                          <h4 className="font-bold capitalize">{report.report_type} Report</h4>
                          <p className="text-xs text-slate-400">
                            {new Date(report.period_start).toLocaleDateString()} - {new Date(report.period_end).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      {report.focus_score !== null && (
                        <div className="flex flex-col items-end">
                          <div className="text-xl font-black text-brand-primary">{report.focus_score}%</div>
                          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Focus Score</div>
                        </div>
                      )}
                    </div>
                    <div className="prose prose-slate max-w-none text-sm text-slate-600">
                      <Markdown>{report.content}</Markdown>
                    </div>
                  </div>
                ))}
                {reports.length === 0 && (
                  <div className="col-span-full py-20 text-center glass rounded-[40px] space-y-4">
                    <FileText className="w-16 h-16 mx-auto text-slate-200" />
                    <p className="text-slate-400">No reports generated yet. Click above to create your first analysis.</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'chat' && (
            <motion.div 
              key="chat"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="glass p-12 rounded-[40px] max-w-4xl mx-auto space-y-8 min-h-[600px] flex flex-col"
            >
              <div className="flex items-center gap-4 border-b border-slate-100 pb-6">
                <div className="p-4 bg-brand-accent/20 rounded-3xl text-brand-accent">
                  <MessageSquare className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold">Parent AI Consultant</h3>
                  <p className="text-slate-500">Ask about behavior, focus, or autism-related support patterns.</p>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto space-y-6 pr-4">
                {chatMessages.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center text-center space-y-4 text-slate-400">
                    <TrendingUp className="w-12 h-12 opacity-10" />
                    <p className="max-w-xs">I have access to {selectedChild.name}'s reports and focus data. Try asking: "How has their focus been lately?" or "What are some tips for their frustration peaks?"</p>
                  </div>
                )}
                {chatMessages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] p-6 rounded-[32px] ${msg.role === 'user' ? 'bg-brand-accent text-white rounded-tr-none' : 'bg-slate-50 text-slate-800 rounded-tl-none'}`}>
                      <Markdown>{msg.text}</Markdown>
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex gap-2 text-slate-300 animate-pulse">
                    <Loader2 className="animate-spin" /> Analyzing data...
                  </div>
                )}
              </div>

              <form onSubmit={handleChat} className="flex gap-4">
                <input 
                  type="text"
                  placeholder="Ask your AI consultant..."
                  className="flex-1 bg-slate-50 border border-slate-100 rounded-3xl px-8 py-4 focus:ring-2 focus:ring-brand-accent focus:outline-none shadow-inner"
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                />
                <button 
                  type="submit" 
                  disabled={chatLoading}
                  className="p-4 bg-brand-accent rounded-3xl text-white shadow-lg active:scale-95 transition-all"
                >
                  <Send className="w-6 h-6" />
                </button>
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    ) : (
        <div className="py-20 text-center space-y-6">
          <Users className="w-20 h-20 mx-auto text-slate-200" />
          <h2 className="text-2xl font-bold text-slate-400">Invite a student to start monitoring their progress.</h2>
          <div className="max-w-md mx-auto p-2 glass rounded-2xl flex gap-2">
            <input 
              type="email" 
              placeholder="Enter student email" 
              className="flex-1 bg-transparent px-4 focus:outline-none"
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
            />
            <button onClick={handleInvite} className="btn-primary py-2 px-6">Invite</button>
          </div>
        </div>
      )}
    </main>
    </div>
  );
}
