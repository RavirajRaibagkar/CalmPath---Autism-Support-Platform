import React, { useState, useEffect, useRef } from 'react';
import { supabase, type UserProfile, type Task } from '../lib/supabase';
import { askGemini } from '../lib/gemini';
import { motion, AnimatePresence } from 'motion/react';
import * as faceapi from 'face-api.js';
import { 
  Play, Pause, RefreshCcw, MessageCircle, LogOut, 
  CheckCircle2, Clock, Brain, Coffee, Send, ChevronRight,
  Smile, Frown, Meh, AlertCircle, Eye, EyeOff, BookOpen, StickyNote
} from 'lucide-react';
import CalmSpace from './CalmSpace';
import Markdown from 'react-markdown';
import confetti from 'canvas-confetti';
import { debounce } from 'lodash';

interface Props {
  profile: UserProfile;
  user: any;
}

const MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights/';

export default function ChildDashboard({ profile, user }: Props) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [currentTask, setCurrentTask] = useState<Task | null>(null);
  const [timer, setTimer] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [isBreak, setIsBreak] = useState(false);
  const [emotion, setEmotion] = useState('Neutral');
  const [messages, setMessages] = useState<{role: 'user' | 'bot', text: string}[]>([]);
  const [inputText, setInputText] = useState('');
  const [loadingChat, setLoadingChat] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isTabActive, setIsTabActive] = useState(true);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [webcamError, setWebcamError] = useState<string | null>(null);
  const [childNote, setChildNote] = useState('');
  const [isSavingNote, setIsSavingNote] = useState(false);

  // Video Ref for distraction detection
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [distractionTimer, setDistractionTimer] = useState(0);
  const [isDistracted, setIsDistracted] = useState(false);
  const missedFramesRef = useRef(0);

  useEffect(() => {
    async function loadModels() {
      console.log("Loading face models from:", MODEL_URL);
      try {
        await Promise.all([
          faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
          faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
        ]);
        setModelsLoaded(true);
      } catch (err) {
        console.warn("Face model load failed:", err);
      }
    }

    let currentStream: MediaStream | null = null;
    
    async function initWebcam() {
      try {
        currentStream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (videoRef.current) videoRef.current.srcObject = currentStream;
        setWebcamError(null);
      } catch (err: any) {
        console.error("Webcam error:", err);
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setWebcamError("Webcam access denied. Please enable your camera in browser settings and refresh the page.");
        } else {
          setWebcamError("Could not access webcam. Please check your camera connection.");
        }
      }
    }

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

    loadModels();
    initWebcam();
    fetchTasks();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const interval = setInterval(() => {
      if (isActive && !isBreak) {
        // Handle Distraction (Tab Focus context)
        if (!isTabActive) {
          setDistractionTimer(prev => prev + 1);
          setIsDistracted(true);
          if (distractionTimer > 10) {
            logDistraction();
          }
        } else {
          setDistractionTimer(0);
        }

        // Increment Focus Time only if models are active and not currently considered distracted
        if (modelsLoaded && !isDistracted && isTabActive) {
          setTimer(t => t + 1);
        }

        // Perform facial analysis every second for accurate focus tracking
        captureAndAnalyze();
      }
    }, 1000);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [isActive, isBreak, distractionTimer, timer, isTabActive]);

  async function captureAndAnalyze() {
    if (!videoRef.current || !canvasRef.current || !isActive || isBreak) return;

    const video = videoRef.current;
    
    // 1. Snapshot Frame (Internal use only if needed)
    const canvas = canvasRef.current;
    canvas.width = 300;
    canvas.height = 225;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, 300, 225);
    }

    // 2. Perform Local Analysis if models are ready
    if (!modelsLoaded) return;

    try {
      // SSD Mobilenet v1 is much more accurate than TinyFaceDetector
      // It handles varying distances and lighting better, reducing false "Looking Away"
      const options = new faceapi.SsdMobilenetv1Options({
        minConfidence: 0.4 
      });

      const detections = await faceapi.detectSingleFace(video, options).withFaceExpressions();
      
      if (detections) {
        missedFramesRef.current = 0; // Reset counter on successful detection
        const expressions = detections.expressions;
        const sorted = Object.entries(expressions).sort(([,a], [,b]) => (b as number) - (a as number));
        const topEmotion = sorted[0][0];
        const confidence = (sorted[0][1] as number);
        const formattedEmo = topEmotion.charAt(0).toUpperCase() + topEmotion.slice(1);
        
        if (formattedEmo !== emotion) {
          setEmotion(formattedEmo);
          logEmotion(formattedEmo, confidence);
        }
        setIsDistracted(false);
      } else {
        // Face not detected in this frame
        missedFramesRef.current += 1;

        // Only switch to 'Looking Away' if it fails for 5 consecutive seconds (increased smoothing)
        if (missedFramesRef.current >= 5) {
          if (emotion !== 'Looking Away') {
            setEmotion('Looking Away');
            setIsDistracted(true);
            logEmotion('Looking Away');
          }
        }
      }
    } catch (err) {
      console.warn("Local analysis error:", err);
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

  async function logEmotion(emo: string, confidence: number = 0.9) {
    if (!sessionId) return;
    try {
      const { error } = await supabase.from('emotion_samples').insert({
        child_id: profile.id,
        session_id: sessionId,
        emotion: emo,
        confidence
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
    
    // Fetch child note for this task
    const { data: noteData } = await supabase
      .from('child_notes')
      .select('content')
      .eq('task_id', task.id)
      .eq('user_id', profile.id)
      .single();
    
    setChildNote(noteData?.content || '');

    const { data } = await supabase.from('focus_sessions').insert({
      child_id: profile.id,
      task_id: task.id,
      start_time: new Date().toISOString()
    }).select().single();
    if (data) setSessionId(data.id);
  }

  const debouncedSaveNote = useRef(
    debounce(async (content: string, taskId: string, userId: string) => {
      setIsSavingNote(true);
      try {
        const { error } = await supabase
          .from('child_notes')
          .upsert({
            task_id: taskId,
            user_id: userId,
            content: content,
            updated_at: new Date().toISOString()
          }, { onConflict: 'task_id,user_id' });
        
        if (error) console.error("Error saving note:", error);
      } finally {
        setIsSavingNote(false);
      }
    }, 1000)
  ).current;

  useEffect(() => {
    if (currentTask && profile) {
      debouncedSaveNote(childNote, currentTask.id, profile.id);
    }
  }, [childNote, currentTask, profile]);

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
    <div className="max-w-[1600px] mx-auto h-screen flex flex-col lg:flex-row overflow-hidden bg-slate-50/50">
      {/* LEFT SIDEBAR - Navigation & Tasks */}
      <aside className="w-full lg:w-72 flex flex-col bg-white border-r border-slate-100 h-full">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-2xl bg-brand-primary flex items-center justify-center font-bold text-white shadow-lg shadow-brand-primary/20">
              {profile.name[0]}
            </div>
            <div>
              <h2 className="font-bold text-sm text-slate-800">Hi, {profile.name}!</h2>
              <div className="flex items-center gap-1.5 mt-0.5">
                <div className={`w-1.5 h-1.5 rounded-full ${modelsLoaded ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Focus AI Active</p>
              </div>
            </div>
          </div>
          
          <nav className="space-y-1">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 px-2">My Tasks</h3>
            <div className="space-y-2 max-h-[60vh] overflow-y-auto px-1 custom-scrollbar">
              {tasks.filter(t => !t.is_completed).map(task => (
                <motion.button
                  key={task.id}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={() => startSession(task)}
                  className={`w-full p-3 rounded-xl border transition-all text-left group ${currentTask?.id === task.id ? 'border-brand-primary bg-brand-primary/5 ring-1 ring-brand-primary/20' : 'border-slate-100 bg-white hover:border-brand-primary/30'}`}
                >
                  <p className="font-bold text-xs text-slate-700 truncate">{task.title}</p>
                  <div className={`flex items-center gap-1.5 mt-2 text-[10px] ${currentTask?.id === task.id ? 'text-brand-primary' : 'text-slate-400'}`}>
                    <Play className="w-2.5 h-2.5" /> Start Learning
                  </div>
                </motion.button>
              ))}
              {tasks.filter(t => !t.is_completed).length === 0 && (
                <div className="p-4 text-center text-slate-300">
                  <CheckCircle2 className="w-6 h-6 mx-auto mb-2 opacity-20" />
                  <p className="text-[10px]">All done!</p>
                </div>
              )}
            </div>
          </nav>
        </div>

        <div className="mt-auto p-4 border-t border-slate-50">
          <button 
            onClick={() => supabase.auth.signOut()}
            className="w-full p-3 rounded-xl flex items-center gap-3 text-slate-500 hover:bg-slate-100 hover:text-red-500 transition-all text-xs font-bold"
          >
            <LogOut className="w-4 h-4" /> Sign Out
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT - Video & Notes */}
      <main className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Top Header/Stats */}
        <header className="px-8 py-3 bg-white border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Session Time</span>
              <span className="text-lg font-mono font-bold text-brand-accent">{formatTime(timer)}</span>
            </div>
            <div className="w-px h-6 bg-slate-100" />
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Active Emotion</span>
              <div className="flex items-center gap-2">
                <Smile className="w-4 h-4 text-brand-primary" />
                <span className="text-sm font-bold text-slate-700">{emotion}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
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
              className="px-4 py-2 bg-brand-primary/10 text-brand-primary rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-brand-primary hover:text-white transition-all shadow-sm"
            >
              <Coffee className="w-4 h-4" /> I Need a Break
            </button>
            <button 
              onClick={completeTask}
              disabled={!currentTask}
              className="px-4 py-2 bg-brand-primary text-white rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-brand-primary-dark transition-all shadow-md shadow-brand-primary/20 disabled:opacity-50 disabled:grayscale"
            >
              <CheckCircle2 className="w-4 h-4" /> Mark as Done
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 lg:p-6 custom-scrollbar">
          {webcamError && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-3 p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 text-xs mb-4"
            >
              <AlertCircle className="w-4 h-4" />
              <p>{webcamError}</p>
            </motion.div>
          )}

          {currentTask ? (
            <div className="space-y-6">
              {/* Video Player - Large (Approx 50% width effectively) */}
              <div className="glass rounded-[32px] overflow-hidden bg-slate-900 shadow-2xl shadow-slate-200/50 relative group">
                <video ref={videoRef} autoPlay playsInline muted className="hidden" />
                <canvas ref={canvasRef} className="hidden" />
                
                <div className="aspect-video w-full max-h-[60vh]">
                  {currentTask.url && !isBreak ? (
                    <iframe 
                      className="w-full h-full"
                      src={`https://www.youtube.com/embed/${getYoutubeId(currentTask.url)}?autoplay=1&mute=0&rel=0&modestbranding=1`}
                      title="Learning Video"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    ></iframe>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white flex-col gap-4">
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
              </div>

              {/* Bottom Section: Notes Grid */}
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                {/* Child's Study Notes */}
                <div className="xl:col-span-1 flex flex-col gap-3">
                  <div className="flex items-center justify-between px-2">
                    <div className="flex items-center gap-2">
                      <StickyNote className="w-4 h-4 text-brand-accent" />
                      <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">My Study Notes</h3>
                    </div>
                    {isSavingNote && <span className="text-[10px] text-brand-primary animate-pulse italic">Saving...</span>}
                  </div>
                  <div className="glass p-4 rounded-3xl min-h-[300px] flex flex-col bg-white/40">
                    <textarea 
                      className="flex-1 bg-transparent border-none focus:ring-0 text-sm text-slate-600 resize-none placeholder:text-slate-300 leading-relaxed custom-scrollbar"
                      placeholder="Write your notes here while you learn..."
                      value={childNote}
                      onChange={(e) => setChildNote(e.target.value)}
                    />
                  </div>
                </div>

                {/* Parent's Instructions & Reference Video */}
                <div className="xl:col-span-2 space-y-6">
                  {/* Parent Notes */}
                  {currentTask.notes && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 px-2">
                        <Brain className="w-4 h-4 text-brand-primary" />
                        <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Parent's Guidance</h3>
                      </div>
                      <div className="glass p-5 rounded-3xl bg-blue-50/30 border-blue-100/20 text-slate-600 text-sm leading-relaxed">
                        {currentTask.notes}
                      </div>
                    </div>
                  )}

                  {/* Reference Video */}
                  {currentTask.reference_link && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 px-2">
                        <Eye className="w-4 h-4 text-brand-accent" />
                        <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Recommended Video</h3>
                      </div>
                      <div className="glass overflow-hidden rounded-3xl bg-slate-900/5 aspect-video max-w-md border border-slate-100">
                        <iframe 
                          className="w-full h-full"
                          src={`https://www.youtube.com/embed/${getYoutubeId(currentTask.reference_link)}`}
                          title="Reference Video"
                          allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                        ></iframe>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center p-12 glass rounded-[40px] text-center space-y-6 bg-white/50">
              <div className="w-24 h-24 rounded-full bg-brand-primary/10 flex items-center justify-center shadow-inner">
                <BookOpen className="w-12 h-12 text-brand-primary opacity-60" />
              </div>
              <div className="space-y-2">
                <h2 className="text-3xl font-bold text-slate-800">Your Learning Path</h2>
                <p className="text-slate-500 max-w-sm mx-auto">Select a task from the sidebar to begin your focus session with AI support.</p>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* RIGHT SIDEBAR - AI Assistant */}
      <aside className="w-full lg:w-80 flex flex-col bg-white border-l border-slate-100 h-full">
        <div className="p-4 border-b border-slate-100 flex items-center gap-2 bg-slate-50/50">
          <MessageCircle className="w-4 h-4 text-brand-primary" />
          <h3 className="font-bold text-xs text-slate-700 uppercase tracking-wider">Ask CalmPath AI</h3>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-slate-50/30">
          {messages.length === 0 && (
            <div className="h-full flex items-center justify-center text-center p-6 text-slate-400">
              <div className="space-y-3">
                <Brain className="w-8 h-8 mx-auto opacity-20" />
                <p className="text-xs italic">Hi! Having trouble with your task? I'm here to help you stay calm and focused.</p>
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[90%] p-3 rounded-2xl text-[13px] leading-relaxed shadow-sm ${m.role === 'user' ? 'bg-brand-accent text-white rounded-tr-none' : 'bg-white border border-slate-100 rounded-tl-none text-slate-700'}`}>
                <Markdown>{m.text}</Markdown>
              </div>
            </div>
          ))}
          {loadingChat && (
            <div className="flex justify-start">
              <div className="bg-white border border-slate-100 p-3 rounded-2xl rounded-tl-none flex gap-1">
                <div className="w-1 h-1 bg-brand-primary rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                <div className="w-1 h-1 bg-brand-primary rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                <div className="w-1 h-1 bg-brand-primary rounded-full animate-bounce"></div>
              </div>
            </div>
          )}
        </div>

        <form onSubmit={handleSendMessage} className="p-4 bg-white border-t border-slate-100">
          <div className="relative">
            <input 
              type="text"
              placeholder="Question about your task?"
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-4 pr-10 py-3 text-xs focus:ring-2 focus:ring-brand-primary focus:outline-none transition-all placeholder:text-slate-400 font-medium"
              value={inputText}
              onChange={e => setInputText(e.target.value)}
            />
            <button 
              className="absolute right-2 top-1.5 p-1.5 bg-brand-primary text-white rounded-xl shadow-lg shadow-brand-primary/20 hover:scale-105 active:scale-95 transition-all" 
              type="submit"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </form>
      </aside>

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
