import React, { useState } from 'react';
import GameCanvas from './components/GameCanvas';

const App: React.FC = () => {
  const [highScore, setHighScore] = useState<number>(() => {
    const saved = localStorage.getItem('neon-glitch-highscore');
    return saved ? parseInt(saved, 10) : 0;
  });

  const updateHighScore = (score: number) => {
    if (score > highScore) {
      setHighScore(score);
      localStorage.setItem('neon-glitch-highscore', score.toString());
    }
  };

  return (
    <div className="w-full h-screen bg-black text-white overflow-hidden relative select-none">
      <div className="scanlines"></div>
      <div className="crt-overlay"></div>
      <div className="screen-flicker w-full h-full">
        <GameCanvas highScore={highScore} onUpdateHighScore={updateHighScore} />
      </div>
    </div>
  );
};

export default App;