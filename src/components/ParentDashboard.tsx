import React, { useState, useEffect } from 'react';
import { supabase, type UserProfile, type Task, type EmotionSample, type FocusSession, type FocusEvent, type Report } from '../lib/supabase';
import { getParentInsights, generateReportSummary, askGemini } from '../lib/gemini';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users, Plus, ClipboardList, TrendingUp, AlertTriangle, 
  CheckCircle, Clock, Coffee, Smile, Send, Loader2,
  Trash2, ExternalLink, RefreshCcw, LogOut, FileText,
  Calendar, Layout, ChevronRight, MessageSquare
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
  const [activeTab, setActiveTab] = useState<'overview' | 'reports' | 'chat'>('overview');
  
  // Form states
  const [inviteEmail, setInviteEmail] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskUrl, setTaskUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [insights, setInsights] = useState<string | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);

  // Chat states
  const [chatMessages, setChatMessages] = useState<{role: 'user' | 'bot', text: string}[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  useEffect(() => {
    fetchRelationships();
  }, []);

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

      return () => {
        tasksSub.unsubscribe();
        sessionsSub.unsubscribe();
        eventsSub.unsubscribe();
        samplesSub.unsubscribe();
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

    const [tasksRes, samplesRes, sessionsRes, eventsRes, reportsRes] = await Promise.all([
      supabase.from('tasks').select('*').eq('child_id', selectedChild.id).order('created_at', { ascending: false }),
      supabase.from('emotion_samples').select('*').eq('child_id', selectedChild.id).order('timestamp', { ascending: false }).limit(100),
      supabase.from('focus_sessions').select('*').eq('child_id', selectedChild.id).order('created_at', { ascending: false }),
      supabase.from('focus_events').select('*').eq('child_id', selectedChild.id).order('created_at', { ascending: false }).limit(50),
      supabase.from('reports').select('*').eq('child_id', selectedChild.id).order('created_at', { ascending: false })
    ]);

    if (tasksRes.data) setTasks(tasksRes.data);
    if (samplesRes.data) setEmotionSamples(samplesRes.data);
    if (sessionsRes.data) setSessions(sessionsRes.data);
    if (eventsRes.data) setEvents(eventsRes.data);
    if (reportsRes.data) setReports(reportsRes.data);
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
      url: taskUrl
    });

    if (!error) {
      setTaskTitle('');
      setTaskUrl('');
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
    
    const summary = {
      profile: selectedChild,
      sessions: sessions.slice(0, 50),
      emotions: emotionSamples.slice(0, 200),
      events: events.slice(0, 100)
    };
    
    const content = await generateReportSummary(summary, type);
    
    const { error } = await supabase.from('reports').insert({
      child_id: selectedChild.id,
      generated_by: profile.id,
      report_type: type,
      content,
      period_start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      period_end: new Date().toISOString()
    });
    
    if (!error) fetchChildData();
    setReportLoading(false);
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

  // Stats calculation
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

  return (
    <div className="max-w-7xl mx-auto p-4 lg:p-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex justify-between items-start w-full">
          <div>
            <h1 className="text-4xl font-bold text-slate-800">Parent Dashboard</h1>
            <p className="text-slate-500">Monitoring progress for your linked students.</p>
          </div>
          <button 
            onClick={() => supabase.auth.signOut()}
            className="flex items-center gap-2 px-4 py-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
          >
            <LogOut className="w-5 h-5" />
            <span className="hidden sm:inline font-bold">Sign Out</span>
          </button>
        </div>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4 bg-white/50 p-2 rounded-[28px] glass w-full md:w-auto overflow-x-auto">
          {children.map(kid => (
            <button
              key={kid.id}
              onClick={() => setSelectedChild(kid)}
              className={`px-6 py-3 rounded-2xl font-bold transition-all ${selectedChild?.id === kid.id ? 'bg-brand-primary shadow-lg' : 'hover:bg-white'}`}
            >
              {kid.name}
            </button>
          ))}
          <div className="flex gap-2 ml-2 px-4">
            <input 
              type="email" 
              placeholder="Child Email" 
              className="bg-white rounded-xl px-4 py-2 border border-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
            />
            <button onClick={handleInvite} className="p-2 bg-brand-accent rounded-xl text-white">
              <Plus className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b border-slate-100">
        {[
          { id: 'overview', label: 'Overview', icon: Layout },
          { id: 'reports', label: 'Reports', icon: FileText },
          { id: 'chat', label: 'AI Consultant', icon: MessageSquare }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-6 py-4 font-bold border-b-4 transition-all ${activeTab === tab.id ? 'border-brand-primary text-slate-800' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
          >
            <tab.icon className="w-5 h-5" />
            {tab.label}
          </button>
        ))}
      </div>

      {selectedChild ? (
        <AnimatePresence mode="wait">
          {activeTab === 'overview' && (
            <motion.div 
              key="overview"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="grid grid-cols-1 lg:grid-cols-12 gap-8"
            >
          {/* Overview Stats */}
          <div className="lg:col-span-8 space-y-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Completed', value: completedTasks, icon: CheckCircle, color: 'text-brand-primary' },
                { label: 'Avg Focus', value: `${Math.round(totalFocusTime / 60)}m`, icon: Clock, color: 'text-brand-accent' },
                { label: 'Tab Switches', value: events.filter(e => e.event_type === 'tab_switch').length, icon: AlertTriangle, color: 'text-orange-500' },
                { label: 'Breaks', value: sessions.reduce((acc, s) => acc + s.break_count, 0), icon: Coffee, color: 'text-brand-secondary' },
                { label: 'Last Mood', value: lastEmotion, icon: Smile, color: 'text-green-500' }
              ].map((stat, i) => (
                <div key={i} className="glass p-6 rounded-[32px] text-center space-y-2">
                  <stat.icon className={`w-6 h-6 mx-auto ${stat.color}`} />
                  <p className="text-2xl font-bold">{stat.value}</p>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest leading-tight">{stat.label}</p>
                </div>
              ))}
            </div>

            {/* Live Feed & Alerts */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="glass p-8 rounded-[40px] space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-bold">Focus & Behavior Live</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Live Syncing</span>
                    </div>
                  </div>
                  <AlertTriangle className="text-orange-500" />
                </div>
                
                <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2">
                  {events.length > 0 ? events.map(event => (
                    <div key={event.id} className="flex gap-4 p-4 bg-slate-50/50 rounded-2xl border border-slate-100">
                      <div className={`p-2 rounded-xl h-fit ${
                        event.event_type === 'tab_switch' ? 'bg-orange-100 text-orange-500' :
                        event.event_type === 'break_start' ? 'bg-blue-100 text-blue-500' :
                        'bg-green-100 text-green-500'
                      }`}>
                        {event.event_type === 'tab_switch' ? <Layout className="w-4 h-4" /> : 
                         event.event_type === 'break_start' ? <Coffee className="w-4 h-4" /> : 
                         <RefreshCcw className="w-4 h-4" />}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-bold capitalize">
                          {event.event_type.replace('_', ' ')}
                        </p>
                        <p className="text-xs text-slate-400">
                          {new Date(event.created_at).toLocaleTimeString()}
                          {event.details?.task_title && ` • ${event.details.task_title}`}
                        </p>
                      </div>
                    </div>
                  )) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 py-12 text-center">
                      <Layout className="w-12 h-12 mb-2 opacity-10" />
                      <p>No behavior events detected.</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="glass p-8 rounded-[40px] space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-bold">Emotion Summary</h3>
                  <TrendingUp className="text-brand-primary" />
                </div>
                <div className="h-[300px] min-w-0">
                  {emotionData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                      <PieChart>
                        <Pie
                          data={emotionData}
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {emotionData.map((entry: any, index: number) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-slate-400">No samples yet</div>
                  )}
                </div>
              </div>

              <div className="glass p-8 rounded-[40px] space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-bold">Smart Insights</h3>
                  <button onClick={generateInsights} disabled={insightsLoading} className="text-brand-accent">
                    {insightsLoading ? <Loader2 className="animate-spin" /> : <RefreshCcw className="w-5 h-5" />}
                  </button>
                </div>
                <div className="min-h-[250px] text-sm text-slate-600 leading-relaxed">
                  {insights ? (
                    <Markdown>{insights}</Markdown>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-slate-400 text-center py-12">
                      <TrendingUp className="w-12 h-12 mb-4 opacity-10" />
                      <p>Click the refresh button to generate AI insights based on {selectedChild.name}'s progress.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Task Management */}
            <div className="glass p-8 rounded-[40px] space-y-8">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold">Assigned Tasks</h3>
                <ClipboardList className="text-brand-primary" />
              </div>

              <div className="space-y-4 max-h-[400px] overflow-y-auto pr-4">
                {tasks.map(task => (
                  <div key={task.id} className="flex items-center justify-between p-4 bg-white/50 rounded-2xl border border-slate-100">
                    <div className="flex items-center gap-4">
                      {task.is_completed ? (
                        <CheckCircle className="text-brand-primary" />
                      ) : (
                        <Clock className="text-slate-300" />
                      )}
                      <div>
                        <p className={`font-bold ${task.is_completed ? 'line-through text-slate-400' : ''}`}>{task.title}</p>
                        <p className="text-xs text-brand-accent truncate max-w-[200px]">{task.url}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                       <a href={task.url} target="_blank" rel="noreferrer" className="p-2 hover:bg-white rounded-lg"><ExternalLink className="w-4 h-4" /></a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Sidebar - Actions */}
          <div className="lg:col-span-4 space-y-8">
            <div className="glass p-8 rounded-[40px] space-y-6">
              <h3 className="text-xl font-bold">Assign New Task</h3>
              <form onSubmit={handleAddTask} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400 uppercase">Lesson Title</label>
                  <input 
                    type="text" 
                    placeholder="e.g., Intro to Math" 
                    className="w-full bg-white rounded-xl px-4 py-3 border border-slate-100"
                    value={taskTitle}
                    onChange={e => setTaskTitle(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400 uppercase">YouTube URL</label>
                  <input 
                    type="url" 
                    placeholder="https://youtube.com/..." 
                    className="w-full bg-white rounded-xl px-4 py-3 border border-slate-100"
                    value={taskUrl}
                    onChange={e => setTaskUrl(e.target.value)}
                    required
                  />
                </div>
                <button type="submit" disabled={loading} className="w-full btn-primary">
                  {loading ? <Loader2 className="animate-spin mx-auto" /> : 'Assign Task'}
                </button>
              </form>
            </div>

            {/* Alert Banner */}
            {emotionSamples.some(s => ['Sad', 'Angry', 'Frustrated'].includes(s.emotion)) && (
              <motion.div 
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="bg-red-50 border-2 border-red-200 p-6 rounded-[32px] flex items-start gap-4"
              >
                <div className="p-2 bg-red-100 rounded-xl text-red-500">
                  <AlertTriangle />
                </div>
                <div>
                  <h4 className="font-bold text-red-800">Support Needed</h4>
                  <p className="text-sm text-red-600 mt-1">{selectedChild.name} recently showed signs of distress. Consider suggesting a break.</p>
                </div>
              </motion.div>
            )}

            <div className="glass p-8 rounded-[40px] space-y-6">
              <h3 className="text-xl font-bold">Recent History</h3>
              <div className="space-y-4">
                {sessions.slice(0, 5).map(session => (
                  <div key={session.id} className="text-sm border-b border-slate-100 pb-4">
                    <div className="flex justify-between font-bold">
                      <span>Session {new Date(session.start_time).toLocaleDateString()}</span>
                      <span className="text-brand-accent">{Math.round(session.focus_duration/60)}m focus</span>
                    </div>
                    <div className="flex gap-4 mt-1 text-slate-400 text-xs">
                      <span className="flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {session.distraction_count} Distractions</span>
                      <span className="flex items-center gap-1"><Coffee className="w-3 h-3" /> {session.break_count} Breaks</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
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
                  <div key={report.id} className="glass p-8 rounded-[40px] space-y-4">
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-3">
                        <div className="p-3 bg-brand-primary/20 rounded-2xl text-brand-primary">
                          <Calendar className="w-6 h-6" />
                        </div>
                        <div>
                          <h4 className="font-bold capitalize">{report.report_type} Report</h4>
                          <p className="text-xs text-slate-400">{new Date(report.created_at).toLocaleDateString()}</p>
                        </div>
                      </div>
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
    </div>
  );
}
