import React, { useState, useEffect, useRef } from 'react';
import { supabase, type UserProfile, type Task } from '../lib/supabase';
import { askGemini, analyzeEmotion } from '../lib/gemini';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Play, Pause, RefreshCcw, MessageCircle, LogOut, 
  CheckCircle2, Clock, Brain, Coffee, Send, ChevronRight,
  Smile, Frown, Meh, AlertCircle
} from 'lucide-react';
import CalmSpace from './CalmSpace';
import Markdown from 'react-markdown';
import confetti from 'canvas-confetti';

interface Props {
  profile: UserProfile;
  user: any;
}

export default function ChildDashboard({ profile, user }: Props) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [currentTask, setCurrentTask] = useState<Task | null>(null);
  const [timer, setTimer] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [isBreak, setIsBreak] = useState(false);
  const [emotion, setEmotion] = useState('Happy');
  const [messages, setMessages] = useState<{role: 'user' | 'bot', text: string}[]>([]);
  const [inputText, setInputText] = useState('');
  const [loadingChat, setLoadingChat] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isTabActive, setIsTabActive] = useState(true);

  // Video Ref for distraction detection (simulated)
  const videoContainerRef = useRef<HTMLDivElement>(null);

  const [distractionTimer, setDistractionTimer] = useState(0);
  const [isDistracted, setIsDistracted] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    setupWebcam();
    fetchTasks();

    const handleVisibilityChange = () => {
      const hidden = document.hidden;
      setIsTabActive(!hidden);
      if (hidden && isActive && !isBreak) {
        logEvent('tab_switch', { 
          timestamp: new Date().toISOString(),
          task_title: currentTask?.title 
        });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    const interval = setInterval(() => {
      if (isActive && !isBreak) {
        setTimer(t => t + 1);
        
        // Handle Distraction (Simulated via Tab Focus context)
        if (!isTabActive) {
          setDistractionTimer(prev => prev + 1);
          if (distractionTimer > 10) {
            setIsDistracted(true);
            // No longer forcing deactivate, just logging and warning
            logDistraction();
          }
        } else {
          setDistractionTimer(0);
          setIsDistracted(false);
        }

        // Real Camera Detection every 5 seconds
        if (timer % 5 === 0) captureAndAnalyze();
      }
    }, 1000);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isActive, isBreak, distractionTimer, timer, isTabActive]);

  async function setupWebcam() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Webcam error:", err);
    }
  }

  async function captureAndAnalyze() {
    if (!videoRef.current || !canvasRef.current || !isActive || isBreak) return;

    const canvas = canvasRef.current;
    const video = videoRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0);
    const frame = canvas.toDataURL('image/jpeg', 0.5);

    try {
      const data = await analyzeEmotion(frame);
      
      if (data.emotion) {
        const emo = data.emotion === 'looking_away' ? 'Looking Away' : data.emotion.charAt(0).toUpperCase() + data.emotion.slice(1);
        setEmotion(emo);
        logEmotion(emo);
      }
    } catch (err) {
      console.error("Emotion analysis failed:", err);
    }
  }

  async function logDistraction() {
    if (!sessionId) return;
    try {
      const { data: session } = await supabase.from('focus_sessions').select('distraction_count').eq('id', sessionId).single();
      if (session) {
        await supabase.from('focus_sessions').update({ 
          distraction_count: (session.distraction_count || 0) + 1 
        }).eq('id', sessionId);
      }
    } catch (err) {
      console.error("Log distraction error:", err);
    }
  }

  async function logEvent(type: string, details: any = {}) {
    if (!profile) return;
    try {
      await supabase.from('focus_events').insert({
        child_id: profile.id,
        session_id: sessionId,
        event_type: type,
        details
      });
    } catch (err) {
      console.error("Log event error:", err);
    }
  }

  async function fetchTasks() {
    const { data } = await supabase
      .from('tasks')
      .select('*')
      .eq('child_id', profile.id)
      .order('created_at', { ascending: false });
    if (data) setTasks(data);
  }

  function simulateEmotion() {
    const emotions = ['Happy', 'Focused', 'Curious', 'Neutral', 'Bored'];
    const random = emotions[Math.floor(Math.random() * emotions.length)];
    setEmotion(random);
    logEmotion(random);
  }

  async function logEmotion(emo: string) {
    if (!sessionId) return;
    try {
      const { error } = await supabase.from('emotion_samples').insert({
        child_id: profile.id,
        session_id: sessionId,
        emotion: emo,
        confidence: 0.9
      });
      if (error) console.warn("Logging emotion failed:", error.message);
    } catch (err) {
      console.error("Emotion logging exception:", err);
    }
  }

  async function startSession(task: Task) {
    setCurrentTask(task);
    setIsActive(true);
    setTimer(0);
    const { data } = await supabase.from('focus_sessions').insert({
      child_id: profile.id,
      task_id: task.id,
      start_time: new Date().toISOString()
    }).select().single();
    if (data) setSessionId(data.id);
  }

  async function completeTask() {
    if (!currentTask) return;
    confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    
    await supabase.from('tasks').update({ 
      is_completed: true, 
      completed_at: new Date().toISOString() 
    }).eq('id', currentTask.id);

    if (sessionId) {
      await supabase.from('focus_sessions').update({ 
        end_time: new Date().toISOString(),
        focus_duration: timer
      }).eq('id', sessionId);
    }

    setCurrentTask(null);
    setIsActive(false);
    fetchTasks();
  }

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!inputText.trim()) return;

    const userMsg = inputText;
    setInputText('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setLoadingChat(true);

    const reply = await askGemini(userMsg, `The student's current emotion is ${emotion}.`);
    setMessages(prev => [...prev, { role: 'bot', text: reply }]);
    setLoadingChat(false);

    // Log chat
    await supabase.from('chat_logs').insert({
      user_id: profile.id,
      user_message: userMsg,
      bot_response: reply,
      emotion_context: emotion
    });
  }

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getYoutubeId = (url: string) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  return (
    <div className="max-w-7xl mx-auto p-4 lg:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
      {/* Sidebar - Tasks */}
      <div className="lg:col-span-3 space-y-6">
        <div className="glass p-6 rounded-[32px]">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-full bg-brand-primary flex items-center justify-center font-bold text-xl">
              {profile.name[0]}
            </div>
            <div>
              <h2 className="font-bold text-lg">Hello, {profile.name}!</h2>
              <p className="text-xs text-slate-500">Ready to learn?</p>
            </div>
          </div>
          
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest">My Tasks</h3>
            {tasks.filter(t => !t.is_completed).map(task => (
              <motion.button
                key={task.id}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => startSession(task)}
                className={`w-full p-4 rounded-2xl border-2 text-left transition-all ${currentTask?.id === task.id ? 'border-brand-primary bg-brand-primary/5' : 'border-slate-100 bg-white/50'}`}
              >
                <p className="font-semibold truncate">{task.title}</p>
                <div className="flex items-center gap-2 mt-2 text-xs text-slate-400">
                  <Play className="w-3 h-3" /> Start Learning
                </div>
              </motion.button>
            ))}
            {tasks.filter(t => !t.is_completed).length === 0 && (
              <div className="p-8 text-center text-slate-400">
                <CheckCircle2 className="w-10 h-10 mx-auto mb-2 opacity-20" />
                <p>No pending tasks!</p>
              </div>
            )}
          </div>
        </div>

        <button 
          onClick={() => supabase.auth.signOut()}
          className="w-full p-4 rounded-2xl flex items-center justify-center gap-2 text-slate-500 hover:bg-slate-200 transition-colors"
        >
          <LogOut className="w-5 h-5" /> Sign Out
        </button>
      </div>

      {/* Main Content */}
      <div className="lg:col-span-6 space-y-6">
        {/* Hidden elements for tracking */}
        <video ref={videoRef} autoPlay playsInline muted className="hidden" />
        <canvas ref={canvasRef} className="hidden" />

        {currentTask ? (
          <div className="space-y-6">
            {/* Player Container */}
            <div className="glass rounded-[40px] overflow-hidden aspect-video relative" ref={videoContainerRef}>
              {currentTask.url && !isBreak ? (
                <iframe 
                  className="w-full h-full"
                  src={`https://www.youtube.com/embed/${getYoutubeId(currentTask.url)}?autoplay=1&mute=0`}
                  title="Learning Video"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                ></iframe>
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-slate-900 text-white flex-col gap-4">
                  {isBreak ? (
                    <>
                      <Coffee className="w-12 h-12 text-brand-primary animate-bounce" />
                      <p className="text-xl font-bold">Taking a break...</p>
                    </>
                  ) : (
                    <p className="text-slate-400">Video URL not provided</p>
                  )}
                </div>
              )}
            </div>

            {/* Controls */}
            <div className="flex flex-wrap gap-4 items-center justify-between glass p-6 rounded-[32px]">
              <div className="flex gap-4">
                <div className="flex flex-col items-center px-6 py-2 bg-white rounded-2xl shadow-sm">
                  <span className="text-xs font-bold text-slate-400 uppercase">Focus Time</span>
                  <span className="text-2xl font-mono font-bold text-brand-accent">{formatTime(timer)}</span>
                </div>
                <div className="flex flex-col items-center px-6 py-2 bg-white rounded-2xl shadow-sm">
                  <span className="text-xs font-bold text-slate-400 uppercase">My Mood</span>
                  <div className="flex items-center gap-2 text-brand-primary font-bold text-xl">
                    <Smile className="w-5 h-5" /> {emotion}
                  </div>
                </div>
              </div>

              <div className="flex gap-4">
                <button 
                  onClick={() => {
                    setIsBreak(true);
                    logEvent('break_start');
                    if (sessionId) {
                      supabase.from('focus_sessions').select('break_count').eq('id', sessionId).single().then(({data}) => {
                        if (data) supabase.from('focus_sessions').update({ break_count: (data.break_count || 0) + 1 }).eq('id', sessionId);
                      });
                    }
                  }}
                  className="btn-accent px-8 flex items-center gap-2"
                >
                  <Coffee className="w-5 h-5" /> I Need a Break
                </button>
                <button 
                  onClick={completeTask}
                  className="btn-primary px-8 flex items-center gap-2"
                >
                  <CheckCircle2 className="w-5 h-5" /> Done!
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center p-12 glass rounded-[40px] text-center space-y-6">
            <div className="w-24 h-24 rounded-full bg-brand-primary/20 flex items-center justify-center">
              <Brain className="w-12 h-12 text-brand-primary" />
            </div>
            <h2 className="text-3xl font-bold">Choose a task to start learning!</h2>
            <p className="text-slate-500 max-w-sm">Select one of your parent's assignments from the left to begin your session.</p>
          </div>
        )}
      </div>

      {/* Right Sidebar - Chat */}
      <div className="lg:col-span-3">
        <div className="glass h-full min-h-[600px] flex flex-col rounded-[32px] overflow-hidden">
          <div className="p-6 bg-brand-primary/10 border-b border-brand-primary/20 flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-brand-primary" />
            <h3 className="font-bold">Ask CalmPath</h3>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && (
              <div className="h-full flex items-center justify-center text-center p-8 text-slate-400">
                <p>Hi! I'm here to help with your learning. Ask me anything!</p>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] p-3 rounded-2xl text-sm ${m.role === 'user' ? 'bg-brand-accent text-white rounded-tr-none' : 'bg-white shadow-sm border border-slate-100 rounded-tl-none'}`}>
                  <Markdown>{m.text}</Markdown>
                </div>
              </div>
            ))}
            {loadingChat && <div className="text-slate-300 animate-pulse">Thinking...</div>}
          </div>

          <form onSubmit={handleSendMessage} className="p-4 bg-white/50 border-t border-slate-100 flex gap-2">
            <input 
              type="text"
              placeholder="Ask a question..."
              className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-2 focus:ring-2 focus:ring-brand-primary focus:outline-none"
              value={inputText}
              onChange={e => setInputText(e.target.value)}
            />
            <button className="p-2 bg-brand-primary rounded-xl" type="submit">
              <Send className="w-5 h-5" />
            </button>
          </form>
        </div>
      </div>

      <AnimatePresence>
        {isBreak && (
          <CalmSpace 
            onClose={() => {
              setIsBreak(false);
              logEvent('break_end');
            }} 
          />
        )}
      </AnimatePresence>
    </div>
  );
}
