import React, { useRef, useEffect, useState, useCallback } from 'react';
import { GameState, Player, Obstacle, Particle, Pickup, PickupType, FloatingText, Inventory, StoreItem, GameSettings } from '../types';
import { Play, RotateCcw, Trophy, MousePointer2, Zap, Magnet, Coins, ChevronsUp, ShoppingCart, Volume2, X, Lock, Check, Pause, Music } from 'lucide-react';

interface GameCanvasProps {
  highScore: number;
  onUpdateHighScore: (score: number) => void;
  inventory: Inventory;
  onUpdateInventory: (inv: Inventory) => void;
  settings: GameSettings;
  onUpdateSettings: (settings: GameSettings) => void;
}

// -- CONSTANTS & DATA --

const STORE_ITEMS: StoreItem[] = [
    { id: 'skin_default', name: 'Standard Issue', type: 'skin', price: 0, value: '#ffffff' },
    { id: 'skin_neon_red', name: 'Crimson Fury', type: 'skin', price: 50, value: '#ff003c' },
    { id: 'skin_cyber_yellow', name: 'Cyber Haze', type: 'skin', price: 100, value: '#facc15' },
    { id: 'skin_matrix', name: 'Matrix Code', type: 'skin', price: 200, value: '#00ff40' },
    { id: 'skin_plasma', name: 'Plasma Blue', type: 'skin', price: 300, value: '#00e0ff' },
    { id: 'skin_void', name: 'Void Walker', type: 'skin', price: 500, value: '#9d00ff' },
    
    { id: 'wisp_default', name: 'Drone MK1', type: 'wisp', price: 0, value: 'default' },
    { id: 'wisp_pulsar', name: 'Pulsar Orb', type: 'wisp', price: 150, value: 'pulsar' },
    { id: 'wisp_star', name: 'Nova Star', type: 'wisp', price: 300, value: 'star' },
];

const GRAVITY_FORCE = 0.8; 
const INITIAL_SPEED = 8;
const MAX_SPEED = 24;
const BOOST_SPEED = 45;
const SPEED_INCREMENT = 0.003;
const SYNC_DISTANCE_THRESHOLD = 60; 

interface Biome {
  id: string;
  threshold: number;
  bgColor: string; 
  accentColor: string;
  shapeType: 'city' | 'wasteland' | 'void' | 'core';
  skyGradient: [string, string];
}

const BIOMES: Biome[] = [
  { id: 'NEON_CITY', threshold: 0, bgColor: '#050510', accentColor: '#00e0ff', shapeType: 'city', skyGradient: ['#000000', '#001020'] },
  { id: 'DATA_ROT', threshold: 2000, bgColor: '#1a0500', accentColor: '#ff3000', shapeType: 'wasteland', skyGradient: ['#100000', '#200500'] },
  { id: 'CRYSTAL_VOID', threshold: 5000, bgColor: '#0a001a', accentColor: '#bd00ff', shapeType: 'void', skyGradient: ['#050010', '#150020'] },
  { id: 'MATRIX_CORE', threshold: 8000, bgColor: '#001000', accentColor: '#00ff40', shapeType: 'core', skyGradient: ['#000000', '#001505'] }
];

interface BackgroundEntity {
  x: number; y: number; w: number; h: number; layer: number; shape: 'rect' | 'spire' | 'hex' | 'pillar';
}

const WISP_PHRASES = ["FASTER...", "DON'T BLINK", "VOID AHEAD", "STAY CLOSE", "SYNC WITH ME", "CORRUPTION RISING", "KEEP UP", "FOCUS...", "SYSTEM UNSTABLE"];

const lerpColor = (a: string, b: string, amount: number) => { 
    const ah = parseInt(a.replace(/#/g, ''), 16), bh = parseInt(b.replace(/#/g, ''), 16),
          ar = ah >> 16, ag = ah >> 8 & 0xff, ab = ah & 0xff,
          br = bh >> 16, bg = bh >> 8 & 0xff, bb = bh & 0xff,
          rr = ar + amount * (br - ar), rg = ag + amount * (bg - ag), rb = ab + amount * (bb - ab);
    return '#' + ((1 << 24) + (rr << 16) + (rg << 8) + rb | 0).toString(16).slice(1);
}

// -- AUDIO ENGINE --

const NOTES: Record<string, number> = {
  'C1': 32.70, 'C#1': 34.65, 'D1': 36.71, 'E1': 41.20, 'F1': 43.65, 'F#1': 46.25, 'G1': 49.00, 'A1': 55.00, 'B1': 61.74,
  'F2': 87.31, 'F#2': 92.50, 'G2': 98.00, 'A2': 110.00, 'B2': 123.47, 'D2': 73.42, 'E2': 82.41,
  'C3': 130.81, 'C#3': 138.59, 'D3': 146.83, 'E3': 164.81, 'F3': 174.61, 'F#3': 185.00, 'G3': 196.00, 'A3': 220.00, 'B3': 246.94, 'C#2': 69.30,
  'C4': 261.63, 'C#4': 277.18, 'D4': 293.66, 'E4': 329.63, 'F4': 349.23, 'F#4': 369.99, 'G4': 392.00, 'G#4': 415.30, 'A4': 440.00, 'B4': 493.88,
  'C5': 523.25, 'C#5': 554.37, 'D5': 587.33, 'E5': 659.25, 'F5': 698.46, 'F#5': 739.99, 'G5': 783.99, 'G#5': 830.61, 'A5': 880.00, 'B5': 987.77, 'C6': 1046.50, 'C#6': 1108.73
};

class AudioEngine {
  ctx: AudioContext | null = null;
  masterGain: GainNode | null = null;
  musicGain: GainNode | null = null;
  bassGain: GainNode | null = null;
  sfxGain: GainNode | null = null;
  noiseBuffer: AudioBuffer | null = null;
  
  nextNoteTime: number = 0;
  step: number = 0;
  isPlaying: boolean = false;
  currentTrack: 'menu' | 'game' | 'none' = 'none';
  timerID: number | null = null;

  constructor() {
    const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      this.ctx = new AudioContextClass();
      this.masterGain = this.ctx!.createGain();
      this.musicGain = this.ctx!.createGain();
      this.bassGain = this.ctx!.createGain();
      this.sfxGain = this.ctx!.createGain();
      
      this.masterGain.connect(this.ctx!.destination);
      this.musicGain.connect(this.masterGain);
      this.bassGain.connect(this.masterGain);
      this.sfxGain.connect(this.masterGain);
      
      this.musicGain.gain.value = 0.2; // Lead synth lower
      this.bassGain.gain.value = 0.5; // Bass louder
      this.sfxGain.gain.value = 0.4;

      // Create White Noise Buffer for Drums
      const bufferSize = this.ctx.sampleRate * 2;
      this.noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
          data[i] = Math.random() * 2 - 1;
      }
    }
  }

  resume = () => { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  suspend = () => { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }

  setVolumes = (musicVol: number, sfxVol: number) => {
    if (this.musicGain) this.musicGain.gain.setTargetAtTime(musicVol * 0.3, this.ctx?.currentTime || 0, 0.1);
    if (this.bassGain) this.bassGain.gain.setTargetAtTime(musicVol * 0.6, this.ctx?.currentTime || 0, 0.1);
    if (this.sfxGain) this.sfxGain.gain.setTargetAtTime(sfxVol * 0.5, this.ctx?.currentTime || 0, 0.1);
  }

  playDrum(type: 'kick' | 'snare' | 'hat', time: number) {
      if (!this.ctx || !this.bassGain || !this.sfxGain || !this.noiseBuffer) return;

      if (type === 'kick') {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.connect(gain);
          gain.connect(this.bassGain);
          
          osc.frequency.setValueAtTime(120, time);
          osc.frequency.exponentialRampToValueAtTime(0.01, time + 0.3);
          gain.gain.setValueAtTime(0.8, time);
          gain.gain.exponentialRampToValueAtTime(0.01, time + 0.3);
          osc.start(time);
          osc.stop(time + 0.3);
      } else if (type === 'snare') {
          const src = this.ctx.createBufferSource();
          src.buffer = this.noiseBuffer;
          const gain = this.ctx.createGain();
          const filter = this.ctx.createBiquadFilter();
          
          filter.type = 'bandpass';
          filter.frequency.value = 1500;
          
          src.connect(filter);
          filter.connect(gain);
          gain.connect(this.sfxGain);
          
          gain.gain.setValueAtTime(0.3, time);
          gain.gain.exponentialRampToValueAtTime(0.01, time + 0.15);
          src.start(time);
          src.stop(time + 0.2);
      } else if (type === 'hat') {
          const src = this.ctx.createBufferSource();
          src.buffer = this.noiseBuffer;
          const gain = this.ctx.createGain();
          const filter = this.ctx.createBiquadFilter();
          
          filter.type = 'highpass';
          filter.frequency.value = 5000;
          
          src.connect(filter);
          filter.connect(gain);
          gain.connect(this.sfxGain);
          
          gain.gain.setValueAtTime(0.05, time);
          gain.gain.exponentialRampToValueAtTime(0.01, time + 0.05);
          src.start(time);
          src.stop(time + 0.05);
      }
  }

  playLeadNote(freq: number, time: number, duration: number, style: 'pluck' | 'cowbell') {
    if (!this.ctx || !this.musicGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    // Using softer waveforms to avoid ear fatigue
    if (style === 'cowbell') {
        osc.type = 'triangle'; // Softer than square
    } else {
        osc.type = 'sine'; // Very soft
    }
    
    osc.frequency.setValueAtTime(freq, time);
    
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(style === 'cowbell' ? 0.2 : 0.1, time + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.01, time + duration);

    osc.connect(gain);
    gain.connect(this.musicGain);
    osc.start(time);
    osc.stop(time + duration + 0.1);
  }

  playBassNote(freq: number, time: number, duration: number) {
      if (!this.ctx || !this.bassGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, time);

      // Lowpass filter for deep bass
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(400, time); 
      filter.frequency.linearRampToValueAtTime(100, time + duration); // Filter sweep

      gain.gain.setValueAtTime(0.5, time);
      gain.gain.exponentialRampToValueAtTime(0.01, time + duration);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.bassGain);
      osc.start(time);
      osc.stop(time + duration + 0.1);
  }

  scheduler = () => {
    if (!this.ctx || !this.isPlaying) return;
    
    const lookahead = 0.1;
    
    while (this.nextNoteTime < this.ctx.currentTime + lookahead) {
        if (this.currentTrack === 'menu') {
            // "Playing with my heart" Vibe: Low, Plucky, Deep House
            // 115 BPM
            const tempo = 0.13; // 16th notes
            const s = this.step % 32;

            // Simple House Beat
            if (s % 4 === 0) this.playDrum('kick', this.nextNoteTime);
            if (s % 4 === 2) this.playDrum('hat', this.nextNoteTime);

            // Deep Bass Arp (F#m -> D -> A -> E) - Low Octaves
            let bassNote = '';
            if (s < 8) bassNote = (s % 6 === 0) ? 'F#2' : (s % 3 === 0 ? 'F#2' : ''); 
            else if (s < 16) bassNote = (s % 6 === 0) ? 'D2' : (s % 3 === 0 ? 'D2' : '');
            else if (s < 24) bassNote = (s % 6 === 0) ? 'A2' : (s % 3 === 0 ? 'A2' : '');
            else bassNote = (s % 6 === 0) ? 'E2' : (s % 3 === 0 ? 'E2' : '');

            if (bassNote && NOTES[bassNote]) this.playBassNote(NOTES[bassNote], this.nextNoteTime, tempo * 3);

            // Sparse Lead Plucks (Octave 3-4)
            if (s === 0) this.playLeadNote(NOTES['C#4'], this.nextNoteTime, tempo * 4, 'pluck');
            if (s === 14) this.playLeadNote(NOTES['A3'], this.nextNoteTime, tempo * 4, 'pluck');

            this.nextNoteTime += tempo;
            this.step++;

        } else if (this.currentTrack === 'game') {
            // "Shot It" Vibe: Phonk/Trap, Aggressive Bass
            // 140 BPM
            const tempo = 0.107; 
            const s = this.step % 32;

            // Trap Beat
            if (s % 8 === 0) this.playDrum('kick', this.nextNoteTime);
            if (s % 8 === 4) this.playDrum('snare', this.nextNoteTime);
            if (s % 2 === 0) this.playDrum('hat', this.nextNoteTime);
            // Fast hats on end of bar
            if (s > 28) this.playDrum('hat', this.nextNoteTime);

            // Driving Bass Arp (F# Phrygian) - Constant 8th notes, punchy
            const bassSeq = ['F#1', 'F#1', 'F#2', 'F#1', 'A1', 'F#1', 'C#2', 'F#1'];
            if (s % 2 === 0) {
                 const note = bassSeq[(s/2) % 8];
                 this.playBassNote(NOTES[note], this.nextNoteTime, tempo * 1.5);
            }

            // Low "Cowbell" Melody (Octave 3-4, not 5-6)
            let note: string | null = null;
            if (s === 0) note = 'F#3'; if (s === 6) note = 'A3'; 
            if (s === 12) note = 'F#3'; if (s === 14) note = 'E3';
            
            if (note && NOTES[note]) {
                this.playLeadNote(NOTES[note], this.nextNoteTime, tempo * 2, 'cowbell');
            }

            this.nextNoteTime += tempo;
            this.step++;
        }
    }
    this.timerID = window.setTimeout(this.scheduler, 25);
  }

  playTrack = (track: 'menu' | 'game') => {
      if (this.currentTrack === track && this.isPlaying) return;
      if (!this.ctx) return;
      
      this.isPlaying = true;
      this.currentTrack = track;
      this.step = 0;
      this.nextNoteTime = this.ctx.currentTime + 0.1;
      
      if (this.timerID) clearTimeout(this.timerID);
      this.scheduler();
  }

  stopMusic = () => {
    this.isPlaying = false;
    this.currentTrack = 'none';
    if (this.timerID) clearTimeout(this.timerID);
  }

  playSfx = (type: 'jump' | 'coin' | 'crash' | 'powerup' | 'score') => {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.sfxGain!);

      if (type === 'jump') {
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(150, t);
          osc.frequency.exponentialRampToValueAtTime(300, t + 0.1);
          gain.gain.setValueAtTime(0.2, t);
          gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
          osc.start(t);
          osc.stop(t + 0.1);
      } else if (type === 'coin') {
          osc.type = 'sine';
          osc.frequency.setValueAtTime(1200, t);
          osc.frequency.setValueAtTime(1800, t + 0.05);
          gain.gain.setValueAtTime(0.3, t);
          gain.gain.linearRampToValueAtTime(0.01, t + 0.2);
          osc.start(t);
          osc.stop(t + 0.2);
      } else if (type === 'crash') {
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(100, t);
          osc.frequency.exponentialRampToValueAtTime(10, t + 0.3);
          gain.gain.setValueAtTime(0.5, t);
          gain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
          osc.start(t);
          osc.stop(t + 0.3);
      } else if (type === 'powerup') {
          this.playTone(523.25, t, 0.1); // C5
          this.playTone(659.25, t + 0.1, 0.1); // E5
          this.playTone(783.99, t + 0.2, 0.3); // G5
      } else if (type === 'score') {
          this.playTone(880, t, 0.1);
          this.playTone(1760, t + 0.05, 0.1);
      }
  }

  playTone(freq: number, time: number, duration: number) {
      if (!this.ctx || !this.sfxGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.2, time);
      gain.gain.exponentialRampToValueAtTime(0.01, time + duration);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(time);
      osc.stop(time + duration);
  }
}

// -- MAIN COMPONENT --

const GameCanvas: React.FC<GameCanvasProps> = ({ 
    highScore, onUpdateHighScore, inventory, onUpdateInventory, settings, onUpdateSettings
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);
  const [gameState, setGameState] = useState<GameState>(GameState.MENU);
  const [lives, setLives] = useState(3);
  
  const [finalScore, setFinalScore] = useState(0);
  const [collectedCoins, setCollectedCoins] = useState(0);
  const audioRef = useRef<AudioEngine | null>(null);

  // Mutable game state
  const playerRef = useRef<Player>({
    x: 100, y: 0, width: 32, height: 32, dy: 0, gravity: GRAVITY_FORCE,
    isGrounded: false, color: '#ffffff', trail: []
  });

  const droneRef = useRef({
    y: 0, offsetY: 0, frame: 0, message: null as string | null, messageTimer: 0, isSynced: false, accumulatedScore: 0
  });

  const livesRef = useRef(3);
  const obstaclesRef = useRef<Obstacle[]>([]);
  const pickupsRef = useRef<Pickup[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const floatingTextsRef = useRef<FloatingText[]>([]);
  const powerupRef = useRef<{ type: PickupType | null; timer: number }>({ type: null, timer: 0 });
  const invincibilityRef = useRef(0);
  const hudShakeRef = useRef(0);
  const coinsRef = useRef(0); // Session coins

  const bgEntitiesRef = useRef<BackgroundEntity[]>([]);
  const currentBiomeIndexRef = useRef(0);
  const currentPaletteRef = useRef({
      bg: BIOMES[0].bgColor, accent: BIOMES[0].accentColor, sky1: BIOMES[0].skyGradient[0], sky2: BIOMES[0].skyGradient[1]
  });

  const gameSpeedRef = useRef(INITIAL_SPEED);
  const scoreRef = useRef(0);
  const distanceScoreRef = useRef(0);
  const levelRef = useRef(0);
  const framesRef = useRef(0);
  const canvasSizeRef = useRef({ width: 0, height: 0 });

  // -- INIT AUDIO --
  useEffect(() => {
    audioRef.current = new AudioEngine();
    return () => { audioRef.current?.stopMusic(); }
  }, []);

  // Sync volumes
  useEffect(() => {
      audioRef.current?.setVolumes(settings.musicVolume, settings.sfxVolume);
  }, [settings]);

  // Handle Music State
  useEffect(() => {
      const audio = audioRef.current;
      if (!audio) return;

      if (gameState === GameState.MENU || gameState === GameState.STORE || gameState === GameState.SETTINGS || gameState === GameState.PAUSED || gameState === GameState.GAME_OVER) {
          if (gameState !== GameState.MENU) audio.resume();
          audio.playTrack('menu');
      } else if (gameState === GameState.PLAYING) {
          audio.resume();
          audio.playTrack('game');
      }
  }, [gameState]);

  // -- GAME LOGIC --

  const spawnBgEntity = (layer: number, startX?: number) => {
     const { width, height } = canvasSizeRef.current;
     if (width === 0) return;
     const biome = BIOMES[currentBiomeIndexRef.current];
     const x = startX ?? width + Math.random() * 100;
     
     let w, h, y, shape: BackgroundEntity['shape'];
     if (biome.shapeType === 'city') {
         shape = 'rect';
         w = 50 + Math.random() * 100; h = (height * 0.2) + Math.random() * (height * 0.4);
         if (layer === 0) { w *= 2; h *= 1.5; }
         y = height - h + (Math.random() * 50); 
     } else if (biome.shapeType === 'wasteland') {
         shape = 'spire';
         w = 60 + Math.random() * 120; h = (height * 0.3) + Math.random() * (height * 0.4);
         y = height;
     } else if (biome.shapeType === 'void') {
         shape = 'hex';
         w = 40 + Math.random() * 60; h = w; y = Math.random() * height;
     } else {
         shape = 'pillar'; w = 20 + Math.random() * 40; h = height; y = 0;
     }
     bgEntitiesRef.current.push({ x, y, w, h, layer, shape });
  };

  const updateBackground = (speed: number) => {
      const score = scoreRef.current;
      let targetIndex = 0;
      for(let i = 0; i < BIOMES.length; i++) if (score >= BIOMES[i].threshold) targetIndex = i;
      currentBiomeIndexRef.current = targetIndex;
      const targetBiome = BIOMES[targetIndex];
      const lerpSpeed = 0.01;
      
      currentPaletteRef.current.bg = lerpColor(currentPaletteRef.current.bg, targetBiome.bgColor, lerpSpeed);
      currentPaletteRef.current.accent = lerpColor(currentPaletteRef.current.accent, targetBiome.accentColor, lerpSpeed);
      currentPaletteRef.current.sky1 = lerpColor(currentPaletteRef.current.sky1, targetBiome.skyGradient[0], lerpSpeed);
      currentPaletteRef.current.sky2 = lerpColor(currentPaletteRef.current.sky2, targetBiome.skyGradient[1], lerpSpeed);
      
      const entitiesToRemove: number[] = [];
      const layerCounts = [0, 0, 0];
      bgEntitiesRef.current.forEach((ent, idx) => {
         ent.x -= speed * (0.1 + (ent.layer * 0.2)); 
         if (ent.x + ent.w < -100) entitiesToRemove.push(idx);
         else layerCounts[ent.layer]++;
      });
      for (let i = entitiesToRemove.length - 1; i >= 0; i--) bgEntitiesRef.current.splice(entitiesToRemove[i], 1);
      if (layerCounts[0] < 5) spawnBgEntity(0);
      if (layerCounts[1] < 8) spawnBgEntity(1);
  };

  const spawnObstacle = () => {
    const { width, height } = canvasSizeRef.current;
    if (width === 0 || powerupRef.current.type === PickupType.BOOST) return;

    const isTop = Math.random() > 0.5;
    const type = Math.random() > 0.6 ? 'block' : 'spike';
    const minHeight = height * 0.15;
    let obstacleHeight = minHeight + Math.random() * (height * 0.15);
    const baseWidth = height * 0.12; 
    const obstacleWidth = type === 'block' ? baseWidth + Math.random() * (baseWidth * 0.5) : baseWidth * 0.8 + Math.random() * (baseWidth * 0.4);
    
    obstaclesRef.current.push({
      x: width + 50, y: isTop ? 0 : height - obstacleHeight,
      width: obstacleWidth, height: obstacleHeight,
      type: type, color: type === 'spike' ? '#ff003c' : '#bf00ff', passed: false
    });
  };

  const spawnPickup = () => {
      const { width, height } = canvasSizeRef.current;
      if (width === 0) return;
      const rand = Math.random();
      let type = PickupType.COIN;
      if (rand > 0.95) type = PickupType.BOOST;
      else if (rand > 0.88) type = PickupType.MAGNET;
      else if (rand > 0.80) type = PickupType.MULTIPLIER;
      
      const margin = height * 0.3;
      pickupsRef.current.push({
          id: Math.random().toString(36).substr(2, 9),
          x: width + 50, y: margin + Math.random() * (height - margin * 2),
          width: 30, height: 30, type: type, collected: false
      });
  };

  const createExplosion = (x: number, y: number, color: string, count: number = 20) => {
    for (let i = 0; i < count; i++) {
      particlesRef.current.push({
        x, y, vx: (Math.random() - 0.5) * 15, vy: (Math.random() - 0.5) * 15, life: 1.0, color: color, size: Math.random() * 6 + 2
      });
    }
  };

  const createFloatingText = (x: number, y: number, text: string, color: string = '#fff') => {
      floatingTextsRef.current.push({ id: Date.now() + Math.random(), x, y, text, color, life: 60, vy: -2 });
  };

  const resetGame = () => {
    const { height } = canvasSizeRef.current;
    
    // Get player color from inventory
    const skin = STORE_ITEMS.find(i => i.id === inventory.equippedSkin);
    const playerColor = skin ? skin.value : '#ffffff';

    currentPaletteRef.current = { bg: BIOMES[0].bgColor, accent: BIOMES[0].accentColor, sky1: BIOMES[0].skyGradient[0], sky2: BIOMES[0].skyGradient[1] };
    currentBiomeIndexRef.current = 0;

    playerRef.current = {
      x: 120, y: height / 2, width: 32, height: 32, dy: 0, gravity: GRAVITY_FORCE,
      isGrounded: false, color: playerColor, trail: []
    };
    droneRef.current = { y: height/2, offsetY: 0, frame: 0, message: null, messageTimer: 0, isSynced: false, accumulatedScore: 0 };
    obstaclesRef.current = [];
    pickupsRef.current = [];
    particlesRef.current = [];
    bgEntitiesRef.current = [];
    floatingTextsRef.current = [];
    powerupRef.current = { type: null, timer: 0 };
    invincibilityRef.current = 0;
    hudShakeRef.current = 0;
    
    for(let i=0; i<10; i++) spawnBgEntity(0, Math.random() * 1000);
    for(let i=0; i<15; i++) spawnBgEntity(1, Math.random() * 1000);

    gameSpeedRef.current = INITIAL_SPEED;
    scoreRef.current = 0;
    distanceScoreRef.current = 0;
    coinsRef.current = 0;
    levelRef.current = 0;
    framesRef.current = 0;
    livesRef.current = 3;
    setLives(3);
    setFinalScore(0);
    setCollectedCoins(0);
    setGameState(GameState.PLAYING);
  };

  const handleInput = useCallback(() => {
    if (gameState === GameState.MENU || gameState === GameState.GAME_OVER) {
      if (gameState === GameState.MENU) audioRef.current?.resume(); // Ensure audio context is ready
      resetGame();
      return;
    }

    if (gameState === GameState.PLAYING) {
      if (powerupRef.current.type === PickupType.BOOST) return;
      const p = playerRef.current;
      p.gravity = -p.gravity;
      p.isGrounded = false;
      createExplosion(p.x + p.width/2, p.y + p.height/2, currentPaletteRef.current.accent, 5);
      audioRef.current?.playSfx('jump');
    }
  }, [gameState, inventory]); // Inventory needed for skin reset

  // Input Listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
          if (gameState === GameState.PLAYING) {
              setGameState(GameState.PAUSED);
              // Audio context continues to run to play menu music
          } else if (gameState === GameState.PAUSED) {
              setGameState(GameState.PLAYING);
          } else if (gameState === GameState.STORE || gameState === GameState.SETTINGS) {
              setGameState(GameState.MENU);
          }
          return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        handleInput();
      }
    };
    const handleMouseDown = (e: MouseEvent) => {
        if(gameState === GameState.PLAYING || gameState === GameState.MENU || gameState === GameState.GAME_OVER) {
            // Prevent store clicks from triggering game start
            if ((e.target as HTMLElement).tagName !== 'BUTTON' && (e.target as HTMLElement).tagName !== 'INPUT') {
              if (e.button === 2) return; 
              e.preventDefault();
              handleInput();
            }
        }
    };
    const handleTouchStart = (e: TouchEvent) => {
         // Check if touching UI element
         if ((e.target as HTMLElement).tagName === 'BUTTON' || (e.target as HTMLElement).tagName === 'INPUT') return;
         
         if(gameState === GameState.PLAYING) {
            e.preventDefault();
            handleInput();
        }
    }
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('touchstart', handleTouchStart, { passive: false });
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('touchstart', handleTouchStart);
    };
  }, [handleInput, gameState]);

  // Game Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const resize = () => {
      const parent = canvas.parentElement;
      if (parent) {
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;
        canvasSizeRef.current = { width: canvas.width, height: canvas.height };
      }
    };
    window.addEventListener('resize', resize);
    resize();
    
    if (bgEntitiesRef.current.length === 0) {
         for(let i=0; i<10; i++) spawnBgEntity(0, Math.random() * window.innerWidth);
         for(let i=0; i<15; i++) spawnBgEntity(1, Math.random() * window.innerWidth);
    }

    const loop = (time: number) => {
      const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
      grad.addColorStop(0, currentPaletteRef.current.sky1);
      grad.addColorStop(1, currentPaletteRef.current.sky2);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (gameState === GameState.PLAYING) {
        updateGame(canvas.width, canvas.height);
      } else if (gameState === GameState.MENU || gameState === GameState.STORE || gameState === GameState.SETTINGS || gameState === GameState.PAUSED) {
         // Background animation continues for pause screen
         framesRef.current++;
         gameSpeedRef.current = 2; 
         updateBackground(2); 
      }

      drawBackground(ctx, canvas.width, canvas.height);
      drawGame(ctx, canvas.width, canvas.height);
      
      requestRef.current = requestAnimationFrame(loop);
    };

    requestRef.current = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(requestRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [gameState]);

  const updateGame = (width: number, height: number) => {
    const p = playerRef.current;
    
    if (invincibilityRef.current > 0) invincibilityRef.current--;
    if (hudShakeRef.current > 0) hudShakeRef.current--;

    if (powerupRef.current.type) {
        powerupRef.current.timer--;
        if (powerupRef.current.timer <= 0) {
            if (powerupRef.current.type === PickupType.BOOST) {
                gameSpeedRef.current = MAX_SPEED; 
                droneRef.current.message = "THANK GOD...";
                droneRef.current.messageTimer = 120;
            }
            powerupRef.current.type = null;
        }
    }

    if (powerupRef.current.type === PickupType.BOOST) {
        gameSpeedRef.current = lerp(gameSpeedRef.current, BOOST_SPEED, 0.05);
        const targetY = (height / 2) - (p.height / 2);
        p.y += (targetY - p.y) * 0.1;
        p.dy = 0; p.isGrounded = false;
        if (framesRef.current % 2 === 0) createExplosion(0, Math.random() * height, '#00ffff', 1);
    } else {
        if (gameSpeedRef.current < MAX_SPEED) gameSpeedRef.current += SPEED_INCREMENT;
        p.dy += p.gravity;
        
        // Terminal Velocity Clamp
        if (p.dy > 15) p.dy = 15;
        if (p.dy < -15) p.dy = -15;

        p.y += p.dy;
        if (p.y + p.height >= height) { p.y = height - p.height; p.dy = 0; p.isGrounded = true; } 
        else if (p.y <= 0) { p.y = 0; p.dy = 0; p.isGrounded = true; } 
        else { p.isGrounded = false; }
    }
    
    updateBackground(gameSpeedRef.current);
    distanceScoreRef.current += gameSpeedRef.current * 0.05;
    
    // WISP AI & LOGIC
    // Wisp anticipates obstacles. It looks ahead.
    let targetY = height / 2;
    let nearestObs = null;
    let minDist = 9999;
    
    // Find nearest threatening obstacle in front
    obstaclesRef.current.forEach(obs => {
        if (obs.passed) return;
        const dist = obs.x - p.x;
        if (dist > 0 && dist < 600 && dist < minDist) {
            minDist = dist;
            nearestObs = obs;
        }
    });

    if (nearestObs) {
        const obs = nearestObs as Obstacle;
        // Basic AI: If obstacle is bottom (y > 0), go Up. If top (y == 0), go Down.
        if (obs.y > 0) { // Floor obstacle, go to top 25%
            targetY = height * 0.25;
        } else { // Ceiling obstacle, go to bottom 75%
            targetY = height * 0.75;
        }
        // Smooth transition to dodge
        droneRef.current.y += (targetY - droneRef.current.y) * 0.05;
    } else {
        // Idle Sine Wave Motion
        const time = framesRef.current * 0.05;
        targetY = (height / 2) + Math.sin(time) * (height * 0.3);
        droneRef.current.y += (targetY - droneRef.current.y) * 0.03;
    }

    const distToWisp = Math.abs((p.y + p.height/2) - (droneRef.current.y));
    const isSynced = distToWisp < SYNC_DISTANCE_THRESHOLD;
    
    if (isSynced && powerupRef.current.type !== PickupType.BOOST) {
        let accumulationRate = 1;
        if (powerupRef.current.type === PickupType.MULTIPLIER) accumulationRate *= 2;
        droneRef.current.accumulatedScore += accumulationRate;
    } else {
        if (droneRef.current.accumulatedScore > 0) {
            const bonus = droneRef.current.accumulatedScore * 5; 
            scoreRef.current += bonus;
            createFloatingText(p.x, p.y - 20, `+${bonus}`, '#ffff00');
            audioRef.current?.playSfx('score');
            droneRef.current.accumulatedScore = 0;
        }
    }
    droneRef.current.isSynced = isSynced;

    if (distanceScoreRef.current >= 1) {
        let addedScore = Math.floor(distanceScoreRef.current);
        if (powerupRef.current.type === PickupType.MULTIPLIER) addedScore *= 2;
        scoreRef.current += addedScore;
        distanceScoreRef.current -= Math.floor(distanceScoreRef.current);
    }

    // Wisp Chat
    const currentLevel = Math.floor(scoreRef.current / 1000);
    if (currentLevel > levelRef.current) {
        levelRef.current = currentLevel;
        droneRef.current.message = WISP_PHRASES[Math.floor(Math.random() * WISP_PHRASES.length)];
        droneRef.current.messageTimer = 180;
    }
    if (droneRef.current.messageTimer > 0) {
        droneRef.current.messageTimer--;
        if (droneRef.current.messageTimer <= 0) droneRef.current.message = null;
    }

    droneRef.current.frame += 0.05;
    droneRef.current.offsetY = Math.sin(droneRef.current.frame) * 5;

    if (framesRef.current % 2 === 0) p.trail.push({ x: p.x, y: p.y, alpha: 0.8 });
    for (let i = p.trail.length - 1; i >= 0; i--) {
        p.trail[i].x -= gameSpeedRef.current;
        p.trail[i].alpha -= 0.08;
        if (p.trail[i].alpha <= 0) p.trail.splice(i, 1);
    }

    framesRef.current++;
    const spawnRate = Math.floor(1000 / (gameSpeedRef.current * 1.3)); 
    if (framesRef.current % (Math.max(20, spawnRate)) === 0) {
        if (Math.random() > 0.85) spawnPickup();
        else if (Math.random() > 0.2) spawnObstacle();
    }

    // Entity updates
    const pickupsToRemove: number[] = [];
    pickupsRef.current.forEach((pk, idx) => {
        if (powerupRef.current.type === PickupType.MAGNET && pk.type === PickupType.COIN) {
            const dx = p.x - pk.x; const dy = p.y - pk.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            if (dist < 400) { pk.x += (dx / dist) * 15; pk.y += (dy / dist) * 15; } else { pk.x -= gameSpeedRef.current; }
        } else { pk.x -= gameSpeedRef.current; }
        if (pk.x + pk.width < -50) pickupsToRemove.push(idx);

        if (!pk.collected && checkCollision(p, pk)) {
            pk.collected = true; pickupsToRemove.push(idx);
            if (pk.type === PickupType.COIN) {
                coinsRef.current++;
                createFloatingText(pk.x, pk.y, "+1", '#ffd700');
                audioRef.current?.playSfx('coin');
            } else {
                powerupRef.current = { type: pk.type, timer: 600 }; 
                if (pk.type === PickupType.BOOST) powerupRef.current.timer = 180; 
                createFloatingText(pk.x, pk.y, pk.type, '#ffffff');
                audioRef.current?.playSfx('powerup');
            }
        }
    });
    for (let i = pickupsToRemove.length - 1; i >= 0; i--) pickupsRef.current.splice(pickupsToRemove[i], 1);

    const obstaclesToRemove: number[] = [];
    obstaclesRef.current.forEach((obs, index) => {
      obs.x -= gameSpeedRef.current;
      if (!obs.passed && obs.x + obs.width < p.x) {
        obs.passed = true;
        createFloatingText(p.x, p.y - 40, "+100", '#ffffff');
        scoreRef.current += 100;
        audioRef.current?.playSfx('score');
      }
      if (obs.x + obs.width < -100) obstaclesToRemove.push(index);
      
      if (powerupRef.current.type !== PickupType.BOOST && invincibilityRef.current === 0) {
          const pad = 8; 
          const playerHitbox = { x: p.x + pad, y: p.y + pad, w: p.width - pad*2, h: p.height - pad*2 };
          if (playerHitbox.x < obs.x + obs.width && playerHitbox.x + playerHitbox.w > obs.x && playerHitbox.y < obs.y + obs.height && playerHitbox.y + playerHitbox.h > obs.y) {
            handlePlayerHit();
          }
      }
    });
    for (let i = obstaclesToRemove.length - 1; i >= 0; i--) obstaclesRef.current.splice(obstaclesToRemove[i], 1);

    for (let i = particlesRef.current.length - 1; i >= 0; i--) {
        const pt = particlesRef.current[i];
        pt.x += pt.vx; pt.y += pt.vy; pt.life -= 0.03;
        if(pt.life <= 0) particlesRef.current.splice(i, 1);
    }
    for (let i = floatingTextsRef.current.length - 1; i >= 0; i--) {
        const ft = floatingTextsRef.current[i];
        ft.y += ft.vy; ft.life--;
        if(ft.life <= 0) floatingTextsRef.current.splice(i, 1);
    }
  };

  const handlePlayerHit = () => {
      if (invincibilityRef.current > 0) return;
      
      livesRef.current -= 1;
      setLives(livesRef.current);

      if (livesRef.current <= 0) {
          gameOver();
      } else {
          invincibilityRef.current = 120; // 2 seconds at 60fps
          hudShakeRef.current = 20; // Shake frames
          createExplosion(playerRef.current.x + 16, playerRef.current.y + 16, '#ff0000', 30);
          audioRef.current?.playSfx('crash');
      }
  };

  const gameOver = () => {
    setFinalScore(Math.floor(scoreRef.current));
    setCollectedCoins(coinsRef.current);
    
    // Update inventory with collected coins
    const newInventory = { ...inventory, coins: inventory.coins + coinsRef.current };
    onUpdateInventory(newInventory);
    
    setGameState(GameState.GAME_OVER);
    onUpdateHighScore(Math.floor(scoreRef.current));
    createExplosion(playerRef.current.x + 16, playerRef.current.y + 16, '#ffffff', 50);
    audioRef.current?.playSfx('crash');
  };

  const checkCollision = (p: Player, item: {x: number, y: number, width: number, height: number}) => {
      return (p.x < item.x + item.width && p.x + p.width > item.x && p.y < item.y + item.height && p.y + p.height > item.y);
  };
  
  const lerp = (start: number, end: number, t: number) => start * (1 - t) + end * t;

  // -- RENDERERS --
  const drawBackground = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
      const { accent } = currentPaletteRef.current;
      bgEntitiesRef.current.forEach(ent => {
          ctx.fillStyle = accent;
          ctx.globalAlpha = ent.layer === 0 ? 0.05 : 0.1; 
          if (ent.shape === 'rect') ctx.fillRect(ent.x, ent.y, ent.w, ent.h);
          else if (ent.shape === 'spire') { ctx.beginPath(); ctx.moveTo(ent.x, ent.y); ctx.lineTo(ent.x + ent.w/2, ent.y - ent.h); ctx.lineTo(ent.x + ent.w, ent.y); ctx.fill(); }
          else if (ent.shape === 'hex') { ctx.beginPath(); for (let i = 0; i < 6; i++) ctx.lineTo(ent.x + ent.w * Math.cos(i * 2 * Math.PI / 6), ent.y + ent.w * Math.sin(i * 2 * Math.PI / 6)); ctx.fill(); }
          else if (ent.shape === 'pillar') ctx.fillRect(ent.x, ent.y, ent.w, ent.h);
      });
      ctx.globalAlpha = 1.0;
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1; ctx.globalAlpha = 0.15; 
      const speedOffset = (framesRef.current * gameSpeedRef.current) % 100;
      ctx.beginPath();
      for (let x = -speedOffset; x < width; x += 100) { ctx.moveTo(x + 50, height); ctx.lineTo(x, height * 0.75); }
      for (let x = -speedOffset; x < width; x += 100) { ctx.moveTo(x + 50, 0); ctx.lineTo(x, height * 0.25); }
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, height * 0.25); ctx.lineTo(width, height * 0.25);
      ctx.moveTo(0, height * 0.75); ctx.lineTo(width, height * 0.75);
      ctx.stroke();
      ctx.globalAlpha = 1.0;
  };

  const drawSpeechBubble = (ctx: CanvasRenderingContext2D, x: number, y: number, text: string) => {
      ctx.font = "20px 'VT323', monospace";
      const textMetrics = ctx.measureText(text);
      const w = textMetrics.width + 20; const h = 30;
      const bubbleX = x - w/2; const bubbleY = y - 40;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)'; ctx.fillRect(bubbleX, bubbleY, w, h);
      ctx.strokeStyle = '#ffffff'; ctx.strokeRect(bubbleX, bubbleY, w, h);
      ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.fillText(text, x, bubbleY + 20);
      ctx.beginPath(); ctx.moveTo(x, bubbleY + h); ctx.lineTo(x, y - 10); ctx.stroke();
  };

  const drawGlitchRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) => {
      const shake = Math.random() > 0.9 ? 2 : 0;
      ctx.fillStyle = 'rgba(0, 255, 255, 0.5)'; ctx.fillRect(x - 2 + shake, y, w, h);
      ctx.fillStyle = 'rgba(255, 0, 255, 0.5)'; ctx.fillRect(x + 2 - shake, y, w, h);
      ctx.fillStyle = color; ctx.fillRect(x, y, w, h);
  };

  const drawDataBlock = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) => {
      ctx.shadowBlur = 10; ctx.shadowColor = color; ctx.fillStyle = 'rgba(10, 10, 10, 1.0)'; ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h); ctx.shadowBlur = 0;
      ctx.fillStyle = color; if (Math.random() > 0.8) ctx.fillRect(x, y + Math.random() * h, w, 2);
  };

  const drawCrystalSpike = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, isCeiling: boolean) => {
      ctx.shadowBlur = 10; ctx.shadowColor = color; ctx.fillStyle = color; ctx.beginPath();
      if (isCeiling) { ctx.moveTo(x, 0); ctx.lineTo(x + w/2, h); ctx.lineTo(x + w, 0); } 
      else { ctx.moveTo(x, y + h); ctx.lineTo(x + w/2, y); ctx.lineTo(x + w, y + h); }
      ctx.fill(); ctx.shadowBlur = 0;
  };

  const drawPickup = (ctx: CanvasRenderingContext2D, p: Pickup) => {
      const bob = Math.sin(framesRef.current * 0.1) * 5;
      const y = p.y + bob; const cx = p.x + p.width/2; const cy = y + p.height/2;
      ctx.shadowBlur = 15;
      if (p.type === PickupType.COIN) {
          ctx.fillStyle = '#FFD700'; ctx.shadowColor = '#FFD700'; ctx.beginPath();
          for (let i = 0; i < 6; i++) ctx.lineTo(cx + p.width/2 * Math.cos(i * 2 * Math.PI / 6), cy + p.width/2 * Math.sin(i * 2 * Math.PI / 6));
          ctx.fill(); ctx.fillStyle = '#000'; ctx.font = "16px monospace"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText("C", cx, cy);
      } else if (p.type === PickupType.BOOST) {
          ctx.fillStyle = '#00ffff'; ctx.shadowColor = '#00ffff'; ctx.beginPath();
          ctx.moveTo(cx, y); ctx.lineTo(p.x + p.width, y + p.height); ctx.lineTo(cx, y + p.height - 5); ctx.lineTo(p.x, y + p.height); ctx.fill();
      } else if (p.type === PickupType.MAGNET) {
          ctx.strokeStyle = '#ff00ff'; ctx.shadowColor = '#ff00ff'; ctx.lineWidth = 3; ctx.beginPath();
          ctx.arc(cx, cy, p.width/2, Math.PI, 0); ctx.lineTo(p.x + p.width, cy + 10); ctx.moveTo(p.x, cy); ctx.lineTo(p.x, cy + 10); ctx.stroke();
      } else if (p.type === PickupType.MULTIPLIER) {
          ctx.fillStyle = '#00ff00'; ctx.shadowColor = '#00ff00'; ctx.font = "bold 24px monospace"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText("x2", cx, cy);
      }
      ctx.shadowBlur = 0;
  };

  const drawGame = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const p = playerRef.current;
    
    if (gameState !== GameState.MENU && gameState !== GameState.STORE && gameState !== GameState.SETTINGS) {
        ctx.font = "48px 'VT323', monospace"; ctx.textAlign = "center"; ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
        ctx.fillText(Math.floor(scoreRef.current).toString(), width / 2, 60);
        
        // Draw Hearts (Centered below score)
        ctx.font = "32px 'VT323', monospace";
        const shakeX = hudShakeRef.current > 0 ? (Math.random() - 0.5) * 10 : 0;
        const shakeY = hudShakeRef.current > 0 ? (Math.random() - 0.5) * 10 : 0;
        
        for (let i = 0; i < 3; i++) {
            // Heart logic: If i is less than current lives, it's active (Red), otherwise greyed out (#555)
            ctx.fillStyle = i < livesRef.current ? '#ff003c' : '#555555';
            ctx.fillText("♥", (width / 2) + (i - 1) * 35 + shakeX, 95 + shakeY);
        }

        ctx.font = "24px 'VT323', monospace"; ctx.textAlign = "left";
        ctx.fillStyle = '#ffd700'; ctx.fillText(`COINS: ${coinsRef.current}`, 20, 40);

        if (powerupRef.current.type) {
             const secondsLeft = Math.ceil(powerupRef.current.timer / 60);
             ctx.fillStyle = '#fff'; ctx.fillText(`${powerupRef.current.type} >> ${secondsLeft}s`, 20, 80);
        }
        ctx.textAlign = "right"; ctx.fillStyle = "#fff"; ctx.fillText(`HI: ${highScore}`, width - 20, 40);
        
        if (droneRef.current.accumulatedScore > 0) {
            const droneX = p.x + 200; const droneY = droneRef.current.y + droneRef.current.offsetY;
            ctx.font = "24px 'VT323', monospace"; ctx.fillStyle = currentPaletteRef.current.accent; ctx.textAlign = "center";
            ctx.fillText(`+${droneRef.current.accumulatedScore * 5}`, droneX, droneY - 40);
            ctx.strokeStyle = currentPaletteRef.current.accent; ctx.lineWidth = 1; ctx.beginPath();
            ctx.moveTo(droneX, droneY - 35); ctx.lineTo(droneX, droneY - 10); ctx.stroke();
        }
    }

    const droneX = p.x + 200; 
    const droneY = droneRef.current.y + droneRef.current.offsetY;

    if (gameState === GameState.PLAYING || gameState === GameState.PAUSED) {
        ctx.strokeStyle = droneRef.current.isSynced ? currentPaletteRef.current.accent : '#555';
        ctx.lineWidth = droneRef.current.isSynced ? 2 : 1;
        ctx.setLineDash(droneRef.current.isSynced ? [] : [5, 5]);
        ctx.beginPath(); ctx.moveTo(p.x + p.width/2, p.y + p.height/2); ctx.lineTo(droneX, droneY); ctx.stroke(); ctx.setLineDash([]);
    }

    ctx.shadowBlur = 15; ctx.shadowColor = currentPaletteRef.current.accent;
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(droneX, droneY, 10, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = currentPaletteRef.current.accent; ctx.stroke();
    
    // Wisp Style Logic
    ctx.fillStyle = '#fff';
    if (inventory.equippedWisp === 'wisp_pulsar') {
        const pulse = Math.sin(framesRef.current * 0.2) * 2;
        ctx.arc(droneX, droneY, 4 + pulse, 0, Math.PI * 2);
    } else if (inventory.equippedWisp === 'wisp_star') {
        // Draw star shape
        ctx.beginPath();
        for (let i = 0; i < 5; i++) ctx.lineTo(droneX + 6 * Math.cos((18 + i * 72) * Math.PI / 180), droneY + 6 * Math.sin((18 + i * 72) * Math.PI / 180));
    } else {
        ctx.arc(droneX, droneY, 4, 0, Math.PI * 2);
    }
    ctx.fill(); ctx.shadowBlur = 0;

    if (droneRef.current.message) drawSpeechBubble(ctx, droneX, droneY - 20, droneRef.current.message);

    p.trail.forEach(t => { ctx.fillStyle = p.color; ctx.globalAlpha = t.alpha * 0.3; ctx.fillRect(t.x, t.y, p.width, p.height); });
    ctx.globalAlpha = 1.0;

    if (gameState !== GameState.GAME_OVER) {
        // Invincibility Blink
        if (invincibilityRef.current > 0 && Math.floor(framesRef.current / 4) % 2 === 0) {
            // Blink, don't draw
        } else {
            ctx.shadowBlur = 20; ctx.shadowColor = p.color; // Glow matches skin
            drawGlitchRect(ctx, p.x, p.y, p.width, p.height, p.color);
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#000'; const eyeOffset = p.dy > 0 ? 18 : 6; ctx.fillRect(p.x + 16, p.y + eyeOffset, 12, 4);
        }
    }

    pickupsRef.current.forEach(pk => drawPickup(ctx, pk));
    obstaclesRef.current.forEach(obs => {
        const obsColor = obs.type === 'spike' ? '#ff2040' : currentPaletteRef.current.accent;
        if (obs.type === 'block') drawDataBlock(ctx, obs.x, obs.y, obs.width, obs.height, obsColor);
        else drawCrystalSpike(ctx, obs.x, obs.y, obs.width, obs.height, obsColor, obs.y === 0);
    });
    particlesRef.current.forEach(pt => { ctx.globalAlpha = pt.life; ctx.fillStyle = pt.color; ctx.fillRect(pt.x, pt.y, pt.size, pt.size); });
    ctx.globalAlpha = 1.0;
    floatingTextsRef.current.forEach(ft => { ctx.font = "bold 24px 'VT323', monospace"; ctx.fillStyle = ft.color; ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.strokeText(ft.text, ft.x, ft.y); ctx.fillText(ft.text, ft.x, ft.y); });
    ctx.fillStyle = currentPaletteRef.current.accent; ctx.fillRect(0, 0, width, 4); ctx.fillRect(0, height - 4, width, 4);
  };

  return (
    <div className="relative w-full h-full font-[VT323] overflow-hidden" onContextMenu={(e) => e.preventDefault()}>
      <canvas ref={canvasRef} className="block w-full h-full cursor-pointer touch-none" />
      
      {/* UI Overlay */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none flex flex-col items-center justify-center">
        
        {/* Menu Screen */}
        {gameState === GameState.MENU && (
          <div className="bg-black/95 p-6 md:p-12 border-2 border-cyan-400 flex flex-col items-center text-center shadow-[0_0_50px_rgba(6,182,212,0.4)] pointer-events-auto max-w-[90%] md:max-w-none">
            <h1 className="text-5xl md:text-8xl mb-2 text-white italic tracking-tighter" style={{ textShadow: '4px 4px 0px #00e0ff' }}>WISP CHASER</h1>
            <p className="text-cyan-200 text-lg md:text-xl mb-6 md:mb-8 tracking-widest uppercase flex items-center gap-2">
              <Zap size={16} /> SYSTEM READY <Zap size={16} />
            </p>
            
            <button onClick={() => { audioRef.current?.resume(); handleInput(); }} className="w-64 mb-4 px-8 py-3 bg-cyan-600 hover:bg-cyan-500 border-2 border-white text-2xl text-white hover:scale-105 active:scale-95 flex items-center justify-center gap-3 shadow-[4px_4px_0px_#fff] transition-all">
                <Play /> START RUN
            </button>
            <button onClick={() => { audioRef.current?.resume(); setGameState(GameState.STORE); }} className="w-64 mb-4 px-8 py-3 bg-slate-800 hover:bg-slate-700 border-2 border-cyan-400 text-2xl text-cyan-400 hover:scale-105 active:scale-95 flex items-center justify-center gap-3 shadow-[4px_4px_0px_#00e0ff] transition-all">
                <ShoppingCart /> STORE
            </button>
            <button onClick={() => { audioRef.current?.resume(); setGameState(GameState.SETTINGS); }} className="w-64 px-8 py-3 bg-slate-900 hover:bg-slate-800 border-2 border-slate-600 text-2xl text-slate-400 hover:scale-105 active:scale-95 flex items-center justify-center gap-3 shadow-[4px_4px_0px_#666] transition-all">
                <Volume2 /> SETTINGS
            </button>
          </div>
        )}

        {/* Pause Screen */}
        {gameState === GameState.PAUSED && (
          <div className="bg-black/90 p-8 border-2 border-yellow-500 flex flex-col items-center text-center shadow-[0_0_50px_rgba(234,179,8,0.4)] pointer-events-auto z-50">
            <h2 className="text-6xl mb-6 text-yellow-500 tracking-widest flex items-center gap-4"><Pause size={48} /> PAUSED</h2>
            
            <div className="w-64 mb-4">
                <label className="flex items-center gap-2 text-left text-cyan-400 mb-2"><Music size={16}/> MUSIC VOL {Math.round(settings.musicVolume * 100)}%</label>
                <input 
                    type="range" min="0" max="1" step="0.1" 
                    value={settings.musicVolume}
                    onChange={(e) => onUpdateSettings({...settings, musicVolume: parseFloat(e.target.value)})}
                    className="w-full accent-cyan-500"
                />
            </div>
            <div className="w-64 mb-8">
                <label className="flex items-center gap-2 text-left text-cyan-400 mb-2"><Volume2 size={16}/> SFX VOL {Math.round(settings.sfxVolume * 100)}%</label>
                <input 
                    type="range" min="0" max="1" step="0.1" 
                    value={settings.sfxVolume}
                    onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        onUpdateSettings({...settings, sfxVolume: val});
                        if (val > 0) audioRef.current?.playSfx('jump');
                    }}
                    className="w-full accent-cyan-500"
                />
            </div>

            <button onClick={() => { setGameState(GameState.PLAYING); audioRef.current?.resume(); }} className="w-64 mb-4 px-8 py-3 bg-white text-black hover:bg-slate-200 text-2xl flex items-center justify-center gap-3">
                <Play size={24} /> RESUME
            </button>
            <button onClick={() => { setGameState(GameState.MENU); audioRef.current?.stopMusic(); }} className="w-64 px-8 py-3 bg-red-900/50 hover:bg-red-900 border border-red-500 text-white text-2xl flex items-center justify-center gap-3">
                <X size={24} /> ABORT RUN
            </button>
          </div>
        )}

        {/* Store Screen */}
        {gameState === GameState.STORE && (
            <div className="bg-black/95 p-6 border-2 border-yellow-400 flex flex-col items-center text-center shadow-[0_0_50px_rgba(250,204,21,0.4)] pointer-events-auto w-[90%] max-w-4xl h-[80%] overflow-hidden relative">
                <div className="flex justify-between w-full items-center mb-6 border-b border-slate-700 pb-4">
                    <h2 className="text-4xl text-yellow-400 tracking-widest flex items-center gap-3"><ShoppingCart/> DARKNET MARKET</h2>
                    <div className="flex items-center gap-2 text-2xl text-yellow-400"><Coins /> {inventory.coins}</div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 w-full overflow-y-auto pb-20 px-2">
                    {STORE_ITEMS.map(item => {
                        const unlocked = inventory.unlockedItems.includes(item.id);
                        const equipped = inventory.equippedSkin === item.id || inventory.equippedWisp === item.id;
                        
                        return (
                            <div key={item.id} className={`p-4 border-2 ${equipped ? 'border-green-500 bg-green-900/20' : 'border-slate-700 bg-slate-900/50'} flex flex-col items-center gap-2 relative group hover:border-cyan-400 transition-colors`}>
                                <div className="text-xl text-white mb-2">{item.name}</div>
                                <div className="w-16 h-16 mb-2 border border-slate-600 flex items-center justify-center bg-black">
                                    {item.type === 'skin' && <div className="w-8 h-8" style={{ backgroundColor: item.value.startsWith('#') ? item.value : '#fff' }}></div>}
                                    {item.type === 'wisp' && <div className="w-4 h-4 rounded-full bg-cyan-400 shadow-[0_0_10px_cyan]"></div>}
                                </div>
                                {unlocked ? (
                                    <button 
                                        onClick={() => {
                                            const newInv = { ...inventory };
                                            if (item.type === 'skin') newInv.equippedSkin = item.id;
                                            else newInv.equippedWisp = item.id;
                                            onUpdateInventory(newInv);
                                            audioRef.current?.playSfx('powerup');
                                        }}
                                        disabled={equipped}
                                        className={`w-full py-1 text-lg ${equipped ? 'bg-green-600 text-white' : 'bg-cyan-900 hover:bg-cyan-700 text-cyan-200'} transition-colors`}
                                    >
                                        {equipped ? 'EQUIPPED' : 'EQUIP'}
                                    </button>
                                ) : (
                                    <button 
                                        onClick={() => {
                                            if (inventory.coins >= item.price) {
                                                const newInv = { ...inventory, coins: inventory.coins - item.price, unlockedItems: [...inventory.unlockedItems, item.id] };
                                                onUpdateInventory(newInv);
                                                audioRef.current?.playSfx('coin');
                                            }
                                        }}
                                        className={`w-full py-1 text-lg flex items-center justify-center gap-2 ${inventory.coins >= item.price ? 'bg-yellow-600 hover:bg-yellow-500 text-white' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}
                                    >
                                        {inventory.coins >= item.price ? 'BUY' : <Lock size={14}/>} {item.price > 0 ? item.price : 'FREE'}
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>

                <button onClick={() => setGameState(GameState.MENU)} className="absolute bottom-4 right-4 px-6 py-2 bg-red-900 hover:bg-red-800 text-red-200 border border-red-500 flex items-center gap-2">
                    <X /> CLOSE
                </button>
            </div>
        )}

        {/* Settings Screen */}
        {gameState === GameState.SETTINGS && (
            <div className="bg-black/95 p-8 border-2 border-slate-500 flex flex-col items-center text-center shadow-[0_0_50px_rgba(100,100,100,0.4)] pointer-events-auto z-20">
                <h2 className="text-4xl text-slate-300 mb-8 tracking-widest flex items-center gap-2"><Volume2/> AUDIO CONFIG</h2>
                <div className="w-64 mb-6">
                    <label className="block text-left text-cyan-400 mb-2">MUSIC VOLUME {Math.round(settings.musicVolume * 100)}%</label>
                    <input 
                        type="range" min="0" max="1" step="0.1" 
                        value={settings.musicVolume}
                        onChange={(e) => onUpdateSettings({...settings, musicVolume: parseFloat(e.target.value)})}
                        className="w-full accent-cyan-500"
                    />
                </div>
                <div className="w-64 mb-8">
                    <label className="block text-left text-cyan-400 mb-2">SFX VOLUME {Math.round(settings.sfxVolume * 100)}%</label>
                    <input 
                        type="range" min="0" max="1" step="0.1" 
                        value={settings.sfxVolume}
                        onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            onUpdateSettings({...settings, sfxVolume: val});
                            if (val > 0) audioRef.current?.playSfx('jump');
                        }}
                        className="w-full accent-cyan-500"
                    />
                </div>
                <button onClick={() => setGameState(GameState.MENU)} className="px-8 py-2 bg-slate-800 hover:bg-slate-700 text-white border border-slate-500">BACK</button>
            </div>
        )}

        {/* Game Over Screen */}
        {gameState === GameState.GAME_OVER && (
          <div className="bg-black/95 p-6 md:p-12 border-2 border-red-500 flex flex-col items-center text-center shadow-[0_0_80px_rgba(255,0,0,0.5)] pointer-events-auto z-20 max-w-[90%]">
            <h2 className="text-4xl md:text-6xl mb-2 text-red-500 tracking-widest" style={{ textShadow: '2px 2px 0px white' }}>CRITICAL FAILURE</h2>
            <div className="grid grid-cols-2 gap-4 md:gap-8 my-4 md:my-6 w-full max-w-md">
                <div className="text-right border-r border-slate-700 pr-4">
                    <div className="text-slate-400 text-xs md:text-sm">SCORE</div>
                    <div className="text-3xl md:text-5xl text-white">{finalScore}</div>
                </div>
                <div className="text-left pl-4">
                    <div className="text-slate-400 text-xs md:text-sm">COINS</div>
                    <div className="text-3xl md:text-5xl text-yellow-400">{collectedCoins}</div>
                </div>
            </div>
            {finalScore >= highScore && finalScore > 0 && (
                <div className="mb-6 md:mb-8 flex items-center gap-2 text-cyan-400 text-lg md:text-2xl animate-pulse"><Trophy size={24} /> NEW HIGHSCORE</div>
            )}
            <button onClick={() => resetGame()} className="px-6 py-2 md:px-8 md:py-3 bg-white text-black hover:bg-slate-200 border-2 border-transparent hover:border-red-500 transition-all text-lg md:text-2xl flex items-center gap-2 mb-4">
                <RotateCcw size={20} /> RETRY
            </button>
            <button onClick={() => setGameState(GameState.MENU)} className="text-slate-500 hover:text-white transition-colors text-sm md:text-lg uppercase tracking-wider">Return to Menu</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default GameCanvas;