import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import confetti from 'canvas-confetti';

const EMOJIS = ['🐶', '🐱', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨'];

export default function MemoryGame() {
  const [cards, setCards] = useState<string[]>([]);
  const [flipped, setFlipped] = useState<number[]>([]);
  const [solved, setSolved] = useState<number[]>([]);
  const [disabled, setDisabled] = useState(false);

  useEffect(() => {
    initialize();
  }, []);

  function initialize() {
    const deck = [...EMOJIS, ...EMOJIS].sort(() => Math.random() - 0.5);
    setCards(deck);
    setSolved([]);
    setFlipped([]);
  }

  function handleCardClick(index: number) {
    if (disabled || flipped.includes(index) || solved.includes(index)) return;

    const newFlipped = [...flipped, index];
    setFlipped(newFlipped);

    if (newFlipped.length === 2) {
      setDisabled(true);
      const [first, second] = newFlipped;
      
      if (cards[first] === cards[second]) {
        setSolved([...solved, first, second]);
        setFlipped([]);
        setDisabled(false);
        if (solved.length + 2 === cards.length) {
          confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
        }
      } else {
        setTimeout(() => {
          setFlipped([]);
          setDisabled(false);
        }, 1000);
      }
    }
  }

  return (
    <div className="w-full max-w-md">
      <h3 className="text-2xl font-bold mb-6 text-slate-700">Find the Pairs!</h3>
      <div className="grid grid-cols-4 gap-4">
        {cards.map((emoji, index) => {
          const isFlipped = flipped.includes(index) || solved.includes(index);
          return (
            <motion.div
              key={index}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => handleCardClick(index)}
              className={`aspect-square rounded-2xl flex items-center justify-center text-4xl cursor-pointer transition-all duration-300 ${isFlipped ? 'bg-white shadow-inner' : 'bg-brand-accent shadow-lg'}`}
            >
              {isFlipped ? emoji : '?'}
            </motion.div>
          );
        })}
      </div>
      {solved.length === cards.length && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-8">
          <button onClick={initialize} className="text-brand-accent font-bold hover:underline">Play Again?</button>
        </motion.div>
      )}
    </div>
  );
}
