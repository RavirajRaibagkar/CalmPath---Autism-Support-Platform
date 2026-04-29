import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Play, Wind, Gamepad2, Heart } from 'lucide-react';
import MemoryGame from './MemoryGame';

interface CalmSpaceProps {
  onClose: () => void;
}

export default function CalmSpace({ onClose }: CalmSpaceProps) {
  const [mode, setMode] = useState<'breathe' | 'game'>('breathe');
  const [breathePhase, setBreathePhase] = useState<'In' | 'Hold' | 'Out' | 'Rest'>('In');

  // Simple breathing guide timer could be added here
  
  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4"
    >
      <div className="max-w-2xl w-full">
        <div className="flex justify-between items-center mb-6">
          <div className="flex gap-3">
            <button 
              onClick={() => setMode('breathe')}
              className={`px-4 py-2 rounded-xl flex items-center gap-2 text-sm transition-all ${mode === 'breathe' ? 'bg-brand-primary text-slate-900 font-bold' : 'bg-white/80'}`}
            >
              <Wind className="w-4 h-4" /> Breathing
            </button>
            <button 
              onClick={() => setMode('game')}
              className={`px-4 py-2 rounded-xl flex items-center gap-2 text-sm transition-all ${mode === 'game' ? 'bg-brand-primary text-slate-900 font-bold' : 'bg-white/80'}`}
            >
              <Gamepad2 className="w-4 h-4" /> Game
            </button>
          </div>
          <button 
            onClick={onClose}
            className="p-2 bg-white/80 rounded-full hover:bg-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="glass rounded-[32px] p-8 min-h-[400px] flex flex-col items-center justify-center text-center">
          {mode === 'breathe' ? (
            <div className="space-y-8">
              <div className="relative">
                <div className="w-48 h-48 rounded-full bg-brand-primary/20 animate-breathe flex items-center justify-center">
                  <div className="w-32 h-32 rounded-full bg-brand-primary/40 flex items-center justify-center">
                    <Heart className="w-12 h-12 text-brand-primary" fill="currentColor" />
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-slate-800">Relax and Breathe</h2>
                <p className="text-slate-600">Follow the circle and take deep breaths.</p>
              </div>
              <div className="flex gap-2 justify-center">
                {['In', 'Hold', 'Out', 'Rest'].map((phase) => (
                  <div key={phase} className="px-4 py-1 bg-white/50 rounded-full text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    {phase}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <MemoryGame />
          )}
        </div>

        <div className="mt-6 text-center">
          <button 
            onClick={onClose}
            className="btn-primary text-lg px-8 py-3"
          >
            I feel better, let's go back!
          </button>
        </div>
      </div>
    </motion.div>
  );
}
