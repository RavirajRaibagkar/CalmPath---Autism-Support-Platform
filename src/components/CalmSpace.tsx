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
      className="fixed inset-0 z-50 bg-calm-blue/95 backdrop-blur-xl flex items-center justify-center p-4"
    >
      <div className="max-w-4xl w-full">
        <div className="flex justify-between items-center mb-8">
          <div className="flex gap-4">
            <button 
              onClick={() => setMode('breathe')}
              className={`px-6 py-2 rounded-2xl flex items-center gap-2 transition-all ${mode === 'breathe' ? 'bg-brand-primary text-slate-900' : 'bg-white/50'}`}
            >
              <Wind className="w-5 h-5" /> Breathing
            </button>
            <button 
              onClick={() => setMode('game')}
              className={`px-6 py-2 rounded-2xl flex items-center gap-2 transition-all ${mode === 'game' ? 'bg-brand-primary text-slate-900' : 'bg-white/50'}`}
            >
              <Gamepad2 className="w-5 h-5" /> Game
            </button>
          </div>
          <button 
            onClick={onClose}
            className="p-3 bg-white/50 rounded-full hover:bg-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="glass rounded-[40px] p-12 min-h-[500px] flex flex-col items-center justify-center text-center">
          {mode === 'breathe' ? (
            <div className="space-y-12">
              <div className="relative">
                <div className="w-64 h-64 rounded-full bg-brand-primary/20 animate-breathe flex items-center justify-center">
                  <div className="w-48 h-48 rounded-full bg-brand-primary/40 flex items-center justify-center">
                    <Heart className="w-20 h-20 text-brand-primary" fill="currentColor" />
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                <h2 className="text-4xl font-bold text-slate-800">Relax and Breathe</h2>
                <p className="text-xl text-slate-600">Follow the circle and take deep, slow breaths.</p>
              </div>
              <div className="flex gap-4 justify-center">
                {['In', 'Hold', 'Out', 'Rest'].map((phase) => (
                  <div key={phase} className="px-6 py-2 bg-white/50 rounded-full text-sm font-bold uppercase tracking-widest text-slate-400">
                    {phase}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <MemoryGame />
          )}
        </div>

        <div className="mt-8 text-center">
          <button 
            onClick={onClose}
            className="btn-primary text-xl px-12 py-4"
          >
            I feel better, let's go back!
          </button>
        </div>
      </div>
    </motion.div>
  );
}
