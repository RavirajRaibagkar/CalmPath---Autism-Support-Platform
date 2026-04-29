import React, { useState, useEffect, useRef } from 'react';
import { supabase, type UserProfile, type Task, type Quiz, type QuizQuestion, type QuizSubmission } from '../lib/supabase';
import { askGemini } from '../lib/gemini';
import { motion, AnimatePresence } from 'motion/react';
import * as faceapi from 'face-api.js';
import { 
  Play, Pause, RefreshCcw, MessageCircle, LogOut, 
  CheckCircle2, Clock, Brain, Coffee, Send, ChevronRight,
  Smile, Frown, Meh, AlertCircle, Eye, EyeOff, BookOpen, StickyNote, HelpCircle, ArrowLeft, ArrowRight, Loader2
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

  // Quiz states
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [activeQuiz, setActiveQuiz] = useState<(Quiz & { questions: QuizQuestion[] }) | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState<number[]>([]);
  const [quizTimer, setQuizTimer] = useState(0);
  const [isSubmittingQuiz, setIsSubmittingQuiz] = useState(false);
  const [quizResult, setQuizResult] = useState<{score: number, total: number} | null>(null);

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
    fetchQuizzes();
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

  async function fetchQuizzes() {
    const { data } = await supabase
      .from('quizzes')
      .select('*')
      .eq('child_id', profile.id)
      .eq('is_completed', false)
      .order('created_at', { ascending: false });
    if (data) setQuizzes(data);
  }

  async function startQuiz(quiz: Quiz) {
    const { data: questions } = await supabase
      .from('quiz_questions')
      .select('*')
      .eq('quiz_id', quiz.id)
      .order('id', { ascending: true });
    
    if (questions) {
      setActiveQuiz({ ...quiz, questions });
      setQuizTimer(quiz.time_limit_minutes * 60);
      setCurrentQuestionIndex(0);
      setQuizAnswers(new Array(questions.length).fill(-1));
      setQuizResult(null);
    }
  }

  async function submitQuiz() {
    if (!activeQuiz) return;
    setIsSubmittingQuiz(true);
    
    let score = 0;
    activeQuiz.questions.forEach((q, i) => {
      if (quizAnswers[i] === q.correct_option_index) score++;
    });

    try {
      await supabase.from('quiz_submissions').insert({
        quiz_id: activeQuiz.id,
        child_id: profile.id,
        score,
        total_questions: activeQuiz.questions.length
      });

      setQuizResult({ score, total: activeQuiz.questions.length });
      fetchQuizzes();
    } catch (err) {
      console.error("Quiz submission error:", err);
    } finally {
      setIsSubmittingQuiz(false);
    }
  }

  useEffect(() => {
    let qInterval: any;
    if (activeQuiz && quizTimer > 0 && !quizResult) {
      qInterval = setInterval(() => {
        setQuizTimer(t => {
          if (t <= 1) {
            submitQuiz();
            return 0;
          }
          return t - 1;
        });
      }, 1000);
    }
    return () => clearInterval(qInterval);
  }, [activeQuiz, quizTimer, quizResult]);

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

    let reply = '';
    try {
      reply = await askGemini(userMsg, `The student's current emotion is ${emotion}.`);
    } catch (err: any) {
      console.error("Student AI Chat Error:", err);
      reply = "I'm here for you! I'm currently thinking very hard, but remember: you're doing great. Take a deep breath and keep going—you've got this! (My wisdom is temporarily limited, but my support isn't!)";
    }
    
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
          
          <nav className="space-y-6">
            <div className="space-y-1">
              <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 px-2">My Tasks</h3>
              <div className="space-y-2 max-h-[30vh] overflow-y-auto px-1 custom-scrollbar">
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
              </div>
            </div>

            <div className="space-y-1">
              <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 px-2">My Quizzes</h3>
              <div className="space-y-2 max-h-[30vh] overflow-y-auto px-1 custom-scrollbar">
                {quizzes.map(quiz => (
                  <motion.button
                    key={quiz.id}
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => startQuiz(quiz)}
                    className="w-full p-3 rounded-xl border border-brand-accent/20 bg-brand-accent/5 hover:bg-brand-accent/10 transition-all text-left group"
                  >
                    <p className="font-bold text-xs text-slate-700 truncate">{quiz.title}</p>
                    <div className="flex items-center gap-1.5 mt-2 text-[10px] text-brand-accent">
                      <HelpCircle className="w-2.5 h-2.5" /> Start Quiz ({quiz.time_limit_minutes}m)
                    </div>
                  </motion.button>
                ))}
                {quizzes.length === 0 && (
                  <div className="p-4 text-center text-slate-300">
                    <CheckCircle2 className="w-6 h-6 mx-auto mb-2 opacity-20" />
                    <p className="text-[10px]">No quizzes yet</p>
                  </div>
                )}
              </div>
            </div>
          </nav>
        </div>

        <div className="mt-auto p-6 border-t border-slate-50 bg-slate-50/30">
          <button 
            onClick={() => supabase.auth.signOut()}
            className="w-full p-4 rounded-2xl flex items-center gap-3 text-slate-400 hover:bg-red-50 hover:text-red-500 transition-all text-sm font-black uppercase tracking-widest group"
          >
            <div className="p-2 bg-white rounded-xl shadow-sm group-hover:bg-red-100 transition-colors">
              <LogOut className="w-4 h-4" />
            </div> 
            Sign Out
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT - Video & Notes */}
      <main className="flex-1 flex flex-col h-full bg-slate-50/30 overflow-hidden">
        {/* Top Header/Stats */}
        <header className="px-8 py-4 bg-white/80 backdrop-blur-xl border-b border-slate-100 flex items-center justify-between z-10">
          <div className="flex items-center gap-8">
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Concentration</span>
              <span className="text-xl font-mono font-black text-brand-primary tabular-nums">{formatTime(timer)}</span>
            </div>
            <div className="w-px h-8 bg-slate-100" />
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Emotion State</span>
              <div className="flex items-center gap-2">
                <div className={`p-1 rounded-lg ${
                  emotion === 'Happy' ? 'bg-green-100 text-green-600' :
                  emotion === 'Focused' ? 'bg-blue-100 text-blue-600' :
                  emotion === 'Looking Away' ? 'bg-orange-100 text-orange-600' :
                  'bg-slate-100 text-slate-500'
                }`}>
                  <Brain className="w-4 h-4" />
                </div>
                <span className="text-sm font-black text-slate-700">{emotion}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button 
              onClick={() => {
                setIsBreak(true);
                logEvent('break_start');
              }}
              className="px-6 py-2.5 bg-white border-2 border-brand-primary/20 text-brand-primary rounded-2xl text-[11px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-brand-primary hover:text-white hover:border-brand-primary transition-all shadow-sm"
            >
              <Coffee className="w-4 h-4" /> Take a Break
            </button>
            <button 
              onClick={completeTask}
              disabled={!currentTask}
              className="px-6 py-2.5 bg-brand-primary text-white rounded-2xl text-[11px] font-black uppercase tracking-widest flex items-center gap-2 hover:scale-105 active:scale-95 transition-all shadow-xl shadow-brand-primary/25 disabled:opacity-50 disabled:grayscale disabled:scale-100"
            >
              <CheckCircle2 className="w-4 h-4" /> Finish Task
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 lg:p-10 custom-scrollbar space-y-10">
          {webcamError && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-4 p-5 bg-red-50 border-2 border-red-100 rounded-3xl text-red-600 shadow-lg shadow-red-500/5"
            >
              <div className="p-3 bg-white rounded-2xl shadow-sm">
                <AlertCircle className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <p className="font-black text-sm uppercase tracking-tight">Camera Correction Needed</p>
                <p className="text-xs font-bold opacity-80">{webcamError}</p>
              </div>
            </motion.div>
          )}

          {currentTask ? (
            <div className="max-w-[1200px] mx-auto space-y-10">
              {/* Immersive Video Player */}
              <motion.div 
                layoutId={`video-${currentTask.id}`}
                className="group relative"
              >
                <div className="absolute -inset-4 bg-brand-primary/5 rounded-[48px] blur-2xl group-hover:bg-brand-primary/10 transition-all" />
                <div className="relative glass rounded-[44px] overflow-hidden bg-slate-900 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.2)] border-8 border-white/50">
                  <video ref={videoRef} autoPlay playsInline muted className="hidden" />
                  <canvas ref={canvasRef} className="hidden" />
                  
                  <div className="aspect-video w-full h-full min-h-[60vh] max-h-[75vh]">
                    {currentTask.url && !isBreak ? (
                      <iframe 
                        className="w-full h-full"
                        src={`https://www.youtube.com/embed/${getYoutubeId(currentTask.url)}?autoplay=1&mute=0&rel=0&modestbranding=1&showinfo=0`}
                        title="Learning Video"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      ></iframe>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white flex-col gap-6">
                        {isBreak ? (
                          <motion.div 
                            initial={{ scale: 0.8 }}
                            animate={{ scale: 1 }}
                            className="text-center"
                          >
                            <div className="w-24 h-24 bg-brand-primary/20 rounded-full flex items-center justify-center mx-auto mb-6">
                              <Coffee className="w-12 h-12 text-brand-primary animate-pulse" />
                            </div>
                            <h3 className="text-3xl font-black tracking-tight">Time for a Calm Break</h3>
                            <p className="text-slate-400 font-bold mt-2">The video is paused while you recharge.</p>
                          </motion.div>
                        ) : (
                          <AlertCircle className="w-12 h-12 text-slate-700" />
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>

              {/* Study Tools Section */}
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
                {/* Writing Pad */}
                <div className="xl:col-span-7 space-y-4">
                  <div className="flex items-center justify-between px-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-brand-accent/10 rounded-xl">
                        <StickyNote className="w-4 h-4 text-brand-accent" />
                      </div>
                      <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Interactive Study Pad</h3>
                    </div>
                    {isSavingNote && (
                      <div className="flex items-center gap-2 text-[10px] text-brand-primary font-black uppercase tracking-tighter">
                        <Loader2 className="w-3 h-3 animate-spin" /> Saving Progress
                      </div>
                    )}
                  </div>
                  <div className="glass p-8 rounded-[40px] bg-white/60 shadow-xl shadow-slate-200/50 min-h-[400px] flex flex-col relative">
                    <div className="absolute top-8 left-8 bottom-8 w-px bg-slate-100 hidden md:block" />
                    <textarea 
                      className="flex-1 bg-transparent border-none focus:ring-0 text-lg text-slate-700 resize-none placeholder:text-slate-300 leading-relaxed custom-scrollbar md:pl-10 font-medium"
                      placeholder="Capture your thoughts and key learnings here..."
                      value={childNote}
                      onChange={(e) => setChildNote(e.target.value)}
                    />
                  </div>
                </div>

                {/* Resource Hub */}
                <div className="xl:col-span-5 space-y-8">
                  {/* Guidance */}
                  {currentTask.notes && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-3 px-4">
                        <div className="p-2 bg-brand-primary/10 rounded-xl">
                          <Brain className="w-4 h-4 text-brand-primary" />
                        </div>
                        <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Mission Protocol</h3>
                      </div>
                      <div className="glass p-8 rounded-[40px] bg-brand-primary/5 border-2 border-brand-primary/10 text-slate-700 font-bold leading-relaxed shadow-lg shadow-brand-primary/5 italic">
                        "{currentTask.notes}"
                      </div>
                    </div>
                  )}

                  {/* Reference */}
                  {currentTask.reference_link && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-3 px-4">
                        <div className="p-2 bg-brand-accent/10 rounded-xl">
                          <Eye className="w-4 h-4 text-brand-accent" />
                        </div>
                        <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Support Resource</h3>
                      </div>
                      <div className="glass overflow-hidden rounded-[40px] shadow-2xl shadow-slate-200/50 aspect-video border-4 border-white">
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

      <AnimatePresence>
        {activeQuiz && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-900/95 backdrop-blur-2xl flex items-center justify-center p-4 lg:p-8"
          >
            <div className="w-full max-w-2xl glass p-8 lg:p-10 rounded-[48px] space-y-8 relative overflow-hidden bg-white/95 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.3)]">
              {/* Animated Progress Bar at the top */}
              {!quizResult && (
                <div className="absolute top-0 left-0 w-full h-2 bg-slate-100">
                  <motion.div 
                    className="h-full bg-brand-primary"
                    initial={{ width: 0 }}
                    animate={{ width: `${((currentQuestionIndex + 1) / activeQuiz.questions.length) * 100}%` }}
                    transition={{ type: 'spring', stiffness: 50, damping: 20 }}
                  />
                </div>
              )}

              {!quizResult ? (
                <>
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <h2 className="text-2xl font-black text-slate-800 tracking-tight">{activeQuiz.title}</h2>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-brand-primary/10 text-brand-primary rounded-md text-[10px] font-bold uppercase tracking-wider">Question {currentQuestionIndex + 1}</span>
                        <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">{activeQuiz.questions.length} Total</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end">
                      <motion.div 
                        animate={quizTimer < 30 ? { scale: [1, 1.1, 1], color: ['#6366f1', '#ef4444', '#6366f1'] } : {}}
                        transition={{ repeat: Infinity, duration: 1 }}
                        className="text-3xl font-mono font-black text-brand-accent tabular-nums"
                      >
                        {formatTime(quizTimer)}
                      </motion.div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Time Left</p>
                    </div>
                  </div>

                  <AnimatePresence mode="wait">
                    <motion.div
                      key={currentQuestionIndex}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.3 }}
                      className="space-y-8"
                    >
                      <div className="p-10 bg-slate-50/80 rounded-[32px] border border-slate-100 min-h-[180px] flex items-center justify-center relative overflow-hidden group">
                        <div className="absolute top-4 left-4 text-slate-200">
                          <HelpCircle className="w-12 h-12 rotate-[-15deg] group-hover:rotate-0 transition-transform duration-500" />
                        </div>
                        <h3 className="text-xl md:text-2xl font-bold text-slate-800 text-center leading-tight relative z-10">
                          {activeQuiz.questions[currentQuestionIndex].question_text}
                        </h3>
                      </div>

                      <div className="grid grid-cols-1 gap-3">
                        {activeQuiz.questions[currentQuestionIndex].options.map((option, idx) => (
                          <motion.button
                            key={idx}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.1 }}
                            onClick={() => {
                              const newAnswers = [...quizAnswers];
                              newAnswers[currentQuestionIndex] = idx;
                              setQuizAnswers(newAnswers);
                            }}
                            className={`p-5 rounded-[28px] border-2 transition-all group flex items-center gap-4 text-sm font-bold text-left relative overflow-hidden ${quizAnswers[currentQuestionIndex] === idx ? 'border-brand-primary bg-brand-primary/5 text-brand-primary shadow-lg shadow-brand-primary/10 ring-4 ring-brand-primary/5' : 'border-slate-100 bg-white hover:border-brand-primary/30 text-slate-700'}`}
                          >
                            <span className={`w-10 h-10 rounded-2xl flex items-center justify-center text-xs transition-colors shrink-0 ${quizAnswers[currentQuestionIndex] === idx ? 'bg-brand-primary text-white' : 'bg-slate-50 text-slate-400 group-hover:bg-brand-primary/10 group-hover:text-brand-primary'}`}>
                              {String.fromCharCode(65 + idx)}
                            </span>
                            <span className="flex-1">{option}</span>
                            {quizAnswers[currentQuestionIndex] === idx && (
                              <motion.div 
                                layoutId="check"
                                className="w-2 h-2 rounded-full bg-brand-primary"
                              />
                            )}
                          </motion.button>
                        ))}
                      </div>
                    </motion.div>
                  </AnimatePresence>

                  <div className="flex items-center justify-between pt-4">
                    <button 
                      onClick={() => setCurrentQuestionIndex(prev => Math.max(0, prev - 1))}
                      disabled={currentQuestionIndex === 0}
                      className="px-6 py-3 text-slate-400 font-bold flex items-center gap-2 hover:text-slate-600 disabled:opacity-0 transition-all text-xs uppercase tracking-widest"
                    >
                      <ArrowLeft className="w-4 h-4" /> Previous
                    </button>

                    {currentQuestionIndex === activeQuiz.questions.length - 1 ? (
                      <button 
                        onClick={submitQuiz}
                        disabled={isSubmittingQuiz || quizAnswers.includes(-1)}
                        className="bg-brand-primary text-white rounded-[24px] px-12 py-4 font-black shadow-[0_12px_24px_-8px_rgba(99,102,241,0.5)] hover:scale-105 active:scale-95 transition-all text-sm flex items-center gap-2 group disabled:opacity-50 disabled:grayscale"
                      >
                        {isSubmittingQuiz ? <Loader2 className="animate-spin" /> : <>Complete Quiz <CheckCircle2 className="w-5 h-5 group-hover:scale-110 transition-transform" /></>}
                      </button>
                    ) : (
                      <button 
                        onClick={() => setCurrentQuestionIndex(prev => Math.min(activeQuiz.questions.length - 1, prev + 1))}
                        className="bg-brand-primary text-white rounded-[24px] px-8 py-4 font-black shadow-[0_12px_24px_-8px_rgba(99,102,241,0.5)] hover:scale-105 active:scale-95 transition-all text-sm flex items-center gap-2 group"
                      >
                        Next Question <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <motion.div 
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="text-center space-y-10 py-8"
                >
                  <div className="relative inline-block">
                    <div className="w-32 h-32 bg-emerald-500 text-white rounded-[40px] flex items-center justify-center mx-auto shadow-2xl shadow-emerald-200 rotate-12">
                      <CheckCircle2 className="w-16 h-16" />
                    </div>
                    <motion.div 
                      initial={{ scale: 0 }} 
                      animate={{ scale: 1 }} 
                      transition={{ delay: 0.5 }}
                      className="absolute -bottom-4 -right-4 bg-brand-accent text-white px-4 py-2 rounded-2xl font-black text-xs shadow-lg"
                    >
                      EXCELLENT!
                    </motion.div>
                  </div>

                  <div className="space-y-2">
                    <h2 className="text-5xl font-black text-slate-800 tracking-tight">Quiz Complete!</h2>
                    <p className="text-slate-400 font-bold uppercase tracking-widest text-sm">Amazing work, {profile.name}!</p>
                  </div>

                  <div className="bg-slate-50/50 rounded-[40px] p-8 border border-slate-100">
                    <div className="text-8xl font-black text-emerald-500 tracking-tighter tabular-nums">
                      {quizResult.score}<span className="text-slate-200 font-light mx-1">/</span>{quizResult.total}
                    </div>
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-4">Questions Answered Correctly</div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-white rounded-3xl border border-slate-100 flex flex-col items-center">
                      <Clock className="w-6 h-6 text-brand-primary mb-2" />
                      <span className="text-lg font-bold text-slate-800">{formatTime((activeQuiz.time_limit_minutes * 60) - quizTimer)}</span>
                      <span className="text-[10px] font-bold text-slate-400 uppercase">Time Used</span>
                    </div>
                    <div className="p-4 bg-white rounded-3xl border border-slate-100 flex flex-col items-center">
                      <Brain className="w-6 h-6 text-brand-primary mb-2" />
                      <span className="text-lg font-bold text-slate-800">{Math.round((quizResult.score / quizResult.total) * 100)}%</span>
                      <span className="text-[10px] font-bold text-slate-400 uppercase">Accuracy</span>
                    </div>
                  </div>

                  <button 
                    onClick={() => setActiveQuiz(null)}
                    className="w-full bg-slate-900 text-white py-6 rounded-[32px] text-lg font-black shadow-2xl shadow-slate-200 hover:scale-[1.02] active:scale-[0.98] transition-all"
                  >
                    Return to Library
                  </button>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
