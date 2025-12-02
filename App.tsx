import React, { useState, useEffect } from 'react';
import GameCanvas from './components/GameCanvas';
import { Inventory, GameSettings } from './types';

const INITIAL_INVENTORY: Inventory = {
  coins: 0,
  unlockedItems: ['skin_default', 'wisp_default'],
  equippedSkin: 'skin_default',
  equippedWisp: 'wisp_default'
};

const INITIAL_SETTINGS: GameSettings = {
  musicVolume: 0.5,
  sfxVolume: 0.5
};

const App: React.FC = () => {
  // -- State Initialization with LocalStorage --
  
  const [highScore, setHighScore] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('wc-highscore');
      return saved ? parseInt(saved, 10) : 0;
    } catch { return 0; }
  });

  const [inventory, setInventory] = useState<Inventory>(() => {
    try {
      const saved = localStorage.getItem('wc-inventory');
      return saved ? JSON.parse(saved) : INITIAL_INVENTORY;
    } catch { return INITIAL_INVENTORY; }
  });

  const [settings, setSettings] = useState<GameSettings>(() => {
    try {
      const saved = localStorage.getItem('wc-settings');
      return saved ? JSON.parse(saved) : INITIAL_SETTINGS;
    } catch { return INITIAL_SETTINGS; }
  });

  // -- Persistence Effects --

  useEffect(() => {
    localStorage.setItem('wc-highscore', highScore.toString());
  }, [highScore]);

  useEffect(() => {
    localStorage.setItem('wc-inventory', JSON.stringify(inventory));
  }, [inventory]);

  useEffect(() => {
    localStorage.setItem('wc-settings', JSON.stringify(settings));
  }, [settings]);

  return (
    <div className="fixed inset-0 w-full h-full bg-black text-white overflow-hidden select-none touch-none">
      <div className="scanlines"></div>
      <div className="crt-overlay"></div>
      <div className="screen-flicker w-full h-full">
        <GameCanvas 
          highScore={highScore} 
          onUpdateHighScore={setHighScore}
          inventory={inventory}
          onUpdateInventory={setInventory}
          settings={settings}
          onUpdateSettings={setSettings}
        />
      </div>
    </div>
  );
};

export default App;