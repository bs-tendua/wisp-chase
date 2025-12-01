import React, { useRef, useEffect, useState, useCallback } from 'react';
import { GameState, Player, Obstacle, Particle, Pickup, PickupType, FloatingText } from '../types';
import { Play, RotateCcw, Trophy, MousePointer2, Zap, Magnet, Coins, ChevronsUp } from 'lucide-react';

interface GameCanvasProps {
  highScore: number;
  onUpdateHighScore: (score: number) => void;
}

// Physics & Game Constants
const GRAVITY_FORCE = 0.8; 
const INITIAL_SPEED = 8;
const MAX_SPEED = 24;
const BOOST_SPEED = 45;
const SPEED_INCREMENT = 0.003;
const SYNC_DISTANCE_THRESHOLD = 60; // Slightly tighter for better feel

// -- BIOME SYSTEM --
interface Biome {
  id: string;
  threshold: number;
  bgColor: string; // The deep background fade
  accentColor: string; // The glow of the sun/grid
  shapeType: 'city' | 'wasteland' | 'void' | 'core';
  skyGradient: [string, string];
}

const BIOMES: Biome[] = [
  { 
    id: 'NEON_CITY', 
    threshold: 0, 
    bgColor: '#050510', 
    accentColor: '#00e0ff', 
    shapeType: 'city',
    skyGradient: ['#000000', '#001020']
  },
  { 
    id: 'DATA_ROT', 
    threshold: 2000, 
    bgColor: '#1a0500', 
    accentColor: '#ff3000', 
    shapeType: 'wasteland',
    skyGradient: ['#100000', '#200500']
  },
  { 
    id: 'CRYSTAL_VOID', 
    threshold: 5000, 
    bgColor: '#0a001a', 
    accentColor: '#bd00ff', 
    shapeType: 'void',
    skyGradient: ['#050010', '#150020']
  },
  { 
    id: 'MATRIX_CORE', 
    threshold: 8000, 
    bgColor: '#001000', 
    accentColor: '#00ff40', 
    shapeType: 'core',
    skyGradient: ['#000000', '#001505']
  }
];

interface BackgroundEntity {
  x: number;
  y: number;
  w: number;
  h: number;
  layer: number; // 0 = far, 1 = mid, 2 = near
  shape: 'rect' | 'spire' | 'hex' | 'pillar';
}

const WISP_PHRASES = [
    "FASTER...",
    "DON'T BLINK",
    "VOID AHEAD",
    "STAY CLOSE",
    "SYNC WITH ME",
    "CORRUPTION RISING",
    "KEEP UP",
    "FOCUS...",
    "SYSTEM UNSTABLE"
];

// Helper to interpolate colors
const lerpColor = (a: string, b: string, amount: number) => { 
    const ah = parseInt(a.replace(/#/g, ''), 16),
          bh = parseInt(b.replace(/#/g, ''), 16),
          ar = ah >> 16, ag = ah >> 8 & 0xff, ab = ah & 0xff,
          br = bh >> 16, bg = bh >> 8 & 0xff, bb = bh & 0xff,
          rr = ar + amount * (br - ar),
          rg = ag + amount * (bg - ag),
          rb = ab + amount * (bb - ab);

    return '#' + ((1 << 24) + (rr << 16) + (rg << 8) + rb | 0).toString(16).slice(1);
}

const GameCanvas: React.FC<GameCanvasProps> = ({ highScore, onUpdateHighScore }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);
  const [gameState, setGameState] = useState<GameState>(GameState.MENU);
  
  const [finalScore, setFinalScore] = useState(0);
  const [collectedCoins, setCollectedCoins] = useState(0);

  // Mutable game state
  const playerRef = useRef<Player>({
    x: 100,
    y: 0,
    width: 32,
    height: 32,
    dy: 0,
    gravity: GRAVITY_FORCE,
    isGrounded: false,
    color: '#ffffff', // Player is always bright white for contrast
    trail: []
  });

  const droneRef = useRef({
    y: 0,
    offsetY: 0,
    frame: 0,
    message: null as string | null,
    messageTimer: 0,
    isSynced: false,
    accumulatedScore: 0 // The floating bucket
  });

  const obstaclesRef = useRef<Obstacle[]>([]);
  const pickupsRef = useRef<Pickup[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const floatingTextsRef = useRef<FloatingText[]>([]);
  
  // Powerups State
  const powerupRef = useRef<{ type: PickupType | null; timer: number }>({ type: null, timer: 0 });
  const coinsRef = useRef(0);

  // Background State
  const bgEntitiesRef = useRef<BackgroundEntity[]>([]);
  const currentBiomeIndexRef = useRef(0);
  const currentPaletteRef = useRef({
      bg: BIOMES[0].bgColor,
      accent: BIOMES[0].accentColor,
      sky1: BIOMES[0].skyGradient[0],
      sky2: BIOMES[0].skyGradient[1]
  });

  const gameSpeedRef = useRef(INITIAL_SPEED);
  const scoreRef = useRef(0);
  const distanceScoreRef = useRef(0);
  const levelRef = useRef(0);
  const framesRef = useRef(0);
  const canvasSizeRef = useRef({ width: 0, height: 0 });

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  // --- Background Generation ---
  const spawnBgEntity = (layer: number, startX?: number) => {
     const { width, height } = canvasSizeRef.current;
     if (width === 0) return;

     const biome = BIOMES[currentBiomeIndexRef.current];
     const x = startX ?? width + Math.random() * 100;
     
     // Layer 0: Far (Slowest, Big Shapes)
     // Layer 1: Mid (Medium, Details)
     // Layer 2: Near (Fastest, Small Details)
     
     let w, h, y, shape: BackgroundEntity['shape'];

     if (biome.shapeType === 'city') {
         shape = 'rect';
         w = 50 + Math.random() * 100;
         h = (height * 0.2) + Math.random() * (height * 0.4);
         if (layer === 0) { w *= 2; h *= 1.5; }
         y = height - h + (Math.random() * 50); // Slight offset
     } else if (biome.shapeType === 'wasteland') {
         shape = 'spire';
         w = 60 + Math.random() * 120;
         h = (height * 0.3) + Math.random() * (height * 0.4);
         y = height; // Spires grow from bottom
     } else if (biome.shapeType === 'void') {
         shape = 'hex';
         w = 40 + Math.random() * 60;
         h = w; // Hexagons act as radius/size
         y = Math.random() * height; // Floating
     } else {
         shape = 'pillar'; // Core
         w = 20 + Math.random() * 40;
         h = height;
         y = 0;
     }

     bgEntitiesRef.current.push({ x, y, w, h, layer, shape });
  };

  const updateBackground = (speed: number) => {
      // Manage Biome Transitions
      const score = scoreRef.current;
      let targetIndex = 0;
      for(let i = 0; i < BIOMES.length; i++) {
          if (score >= BIOMES[i].threshold) targetIndex = i;
      }
      currentBiomeIndexRef.current = targetIndex;

      const targetBiome = BIOMES[targetIndex];
      const lerpSpeed = 0.01;
      
      currentPaletteRef.current.bg = lerpColor(currentPaletteRef.current.bg, targetBiome.bgColor, lerpSpeed);
      currentPaletteRef.current.accent = lerpColor(currentPaletteRef.current.accent, targetBiome.accentColor, lerpSpeed);
      currentPaletteRef.current.sky1 = lerpColor(currentPaletteRef.current.sky1, targetBiome.skyGradient[0], lerpSpeed);
      currentPaletteRef.current.sky2 = lerpColor(currentPaletteRef.current.sky2, targetBiome.skyGradient[1], lerpSpeed);
      
      // Move entities
      const entitiesToRemove: number[] = [];
      const layerCounts = [0, 0, 0];

      bgEntitiesRef.current.forEach((ent, idx) => {
         // Parallax Speeds
         const layerSpeed = speed * (0.1 + (ent.layer * 0.2)); 
         ent.x -= layerSpeed;
         
         if (ent.x + ent.w < -100) entitiesToRemove.push(idx);
         else layerCounts[ent.layer]++;
      });

      // Cleanup
      for (let i = entitiesToRemove.length - 1; i >= 0; i--) {
          bgEntitiesRef.current.splice(entitiesToRemove[i], 1);
      }

      // Spawn new if needed
      if (layerCounts[0] < 5) spawnBgEntity(0);
      if (layerCounts[1] < 8) spawnBgEntity(1);
  };

  // --- Obstacle & Pickup Generation ---
  const spawnObstacle = () => {
    const { width, height } = canvasSizeRef.current;
    if (width === 0) return;

    // During Boost, no obstacles spawn
    if (powerupRef.current.type === PickupType.BOOST) return;

    const isTop = Math.random() > 0.5;
    const type = Math.random() > 0.6 ? 'block' : 'spike';
    
    const minHeight = height * 0.15;
    const variablity = height * 0.15;
    
    let obstacleHeight = minHeight + Math.random() * variablity;
    const baseWidth = height * 0.12; 
    const obstacleWidth = type === 'block' 
        ? baseWidth + Math.random() * (baseWidth * 0.5) 
        : baseWidth * 0.8 + Math.random() * (baseWidth * 0.4);
    
    const obstacle: Obstacle = {
      x: width + 50,
      y: isTop ? 0 : height - obstacleHeight,
      width: obstacleWidth,
      height: obstacleHeight,
      type: type,
      color: type === 'spike' ? '#ff003c' : '#bf00ff', // Will be overridden by biome color in draw
      passed: false
    };

    if (isTop) {
        obstacle.y = 0;
    }

    obstaclesRef.current.push(obstacle);
  };

  const spawnPickup = () => {
      const { width, height } = canvasSizeRef.current;
      if (width === 0) return;
      
      // Do not spawn pickups if one is already active (keep it simple for now)
      // if (powerupRef.current.type !== null) return;

      const rand = Math.random();
      let type = PickupType.COIN;
      if (rand > 0.95) type = PickupType.BOOST;
      else if (rand > 0.88) type = PickupType.MAGNET;
      else if (rand > 0.80) type = PickupType.MULTIPLIER;
      
      // Pickups spawn in the middle-ish area to be reachable
      const margin = height * 0.3;
      const py = margin + Math.random() * (height - margin * 2);

      pickupsRef.current.push({
          id: Math.random().toString(36).substr(2, 9),
          x: width + 50,
          y: py,
          width: 30,
          height: 30,
          type: type,
          collected: false
      });
  };

  const createExplosion = (x: number, y: number, color: string, count: number = 20) => {
    for (let i = 0; i < count; i++) {
      particlesRef.current.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 15,
        vy: (Math.random() - 0.5) * 15,
        life: 1.0,
        color: color,
        size: Math.random() * 6 + 2
      });
    }
  };

  const createFloatingText = (x: number, y: number, text: string, color: string = '#fff') => {
      floatingTextsRef.current.push({
          id: Date.now() + Math.random(),
          x,
          y,
          text,
          color,
          life: 60,
          vy: -2
      });
  };

  const resetGame = () => {
    const { height } = canvasSizeRef.current;
    
    // Reset palette
    currentPaletteRef.current = {
      bg: BIOMES[0].bgColor,
      accent: BIOMES[0].accentColor,
      sky1: BIOMES[0].skyGradient[0],
      sky2: BIOMES[0].skyGradient[1]
    };
    currentBiomeIndexRef.current = 0;

    playerRef.current = {
      x: 120,
      y: height / 2,
      width: 32,
      height: 32,
      dy: 0,
      gravity: GRAVITY_FORCE,
      isGrounded: false,
      color: '#ffffff',
      trail: []
    };
    droneRef.current = { y: height/2, offsetY: 0, frame: 0, message: null, messageTimer: 0, isSynced: false, accumulatedScore: 0 };
    obstaclesRef.current = [];
    pickupsRef.current = [];
    particlesRef.current = [];
    bgEntitiesRef.current = [];
    floatingTextsRef.current = [];
    powerupRef.current = { type: null, timer: 0 };
    
    // Pre-populate background
    for(let i=0; i<10; i++) spawnBgEntity(0, Math.random() * 1000);
    for(let i=0; i<15; i++) spawnBgEntity(1, Math.random() * 1000);

    gameSpeedRef.current = INITIAL_SPEED;
    scoreRef.current = 0;
    distanceScoreRef.current = 0;
    coinsRef.current = 0;
    levelRef.current = 0;
    framesRef.current = 0;
    setFinalScore(0);
    setCollectedCoins(0);
    setGameState(GameState.PLAYING);
  };

  const handleInput = useCallback(() => {
    if (gameState === GameState.MENU || gameState === GameState.GAME_OVER) {
      resetGame();
      return;
    }

    if (gameState === GameState.PLAYING) {
      // Input disabled during Boost
      if (powerupRef.current.type === PickupType.BOOST) return;

      const p = playerRef.current;
      p.gravity = -p.gravity;
      p.isGrounded = false;
      createExplosion(p.x + p.width/2, p.y + p.height/2, currentPaletteRef.current.accent, 5);
    }
  }, [gameState]);

  // Input Listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        handleInput();
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
        if(gameState === GameState.PLAYING || gameState === GameState.MENU) {
            if (e.button === 2) return; 
            e.preventDefault();
            handleInput();
        }
    };
    
    const handleTouchStart = (e: TouchEvent) => {
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
    
    // Init BG for menu
    if (bgEntitiesRef.current.length === 0) {
         for(let i=0; i<10; i++) spawnBgEntity(0, Math.random() * window.innerWidth);
         for(let i=0; i<15; i++) spawnBgEntity(1, Math.random() * window.innerWidth);
    }

    const loop = (time: number) => {
      // Clear with gradient
      const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
      grad.addColorStop(0, currentPaletteRef.current.sky1);
      grad.addColorStop(1, currentPaletteRef.current.sky2);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (gameState === GameState.PLAYING) {
        updateGame(canvas.width, canvas.height);
      } else if (gameState === GameState.MENU) {
         framesRef.current++;
         gameSpeedRef.current = 2; 
         updateBackground(2); // Slow scroll
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
    const drone = droneRef.current;

    // --- Powerup Logic ---
    if (powerupRef.current.type) {
        powerupRef.current.timer--;
        if (powerupRef.current.timer <= 0) {
            // End boost effect
            if (powerupRef.current.type === PickupType.BOOST) {
                gameSpeedRef.current = MAX_SPEED; // Return to normal max
                droneRef.current.message = "THANK GOD...";
                droneRef.current.messageTimer = 120;
            }
            powerupRef.current.type = null;
        }
    }

    // Boost Effect: Auto-pilot
    if (powerupRef.current.type === PickupType.BOOST) {
        // Accelerate to boost speed
        gameSpeedRef.current = lerp(gameSpeedRef.current, BOOST_SPEED, 0.05);
        
        // Lock player to middle
        const targetY = (height / 2) - (p.height / 2);
        p.y += (targetY - p.y) * 0.1;
        p.dy = 0; 
        p.isGrounded = false;
        
        // Create speed lines / particles
        if (framesRef.current % 2 === 0) {
            createExplosion(0, Math.random() * height, '#00ffff', 1);
        }
    } else {
        // Normal Physics
        if (gameSpeedRef.current < MAX_SPEED) {
            gameSpeedRef.current += SPEED_INCREMENT;
        }
        p.dy += p.gravity;
        p.y += p.dy;

        if (p.y + p.height >= height) {
          p.y = height - p.height;
          p.dy = 0;
          p.isGrounded = true;
        } else if (p.y <= 0) {
          p.y = 0;
          p.dy = 0;
          p.isGrounded = true;
        } else {
          p.isGrounded = false;
        }
    }
    
    // Update Background Elements
    updateBackground(gameSpeedRef.current);

    // --- Scoring ---
    // Base Distance Score
    distanceScoreRef.current += gameSpeedRef.current * 0.05;
    
    // Sync Logic
    const distToWisp = Math.abs((p.y + p.height/2) - (drone.y));
    const isSynced = distToWisp < SYNC_DISTANCE_THRESHOLD;
    
    if (isSynced && powerupRef.current.type !== PickupType.BOOST) {
        // Accumulate score in bucket
        let accumulationRate = 1;
        if (powerupRef.current.type === PickupType.MULTIPLIER) accumulationRate *= 2;
        
        drone.accumulatedScore += accumulationRate;
        if (drone.accumulatedScore % 10 === 0) {
            // Visual feedback for accumulation (pulse)
        }
    } else {
        // Cashed out?
        if (drone.accumulatedScore > 0) {
            const bonus = drone.accumulatedScore * 5; // Multiplier for cashing out
            scoreRef.current += bonus;
            createFloatingText(p.x, p.y - 20, `+${bonus}`, '#ffff00');
            drone.accumulatedScore = 0;
        }
    }
    drone.isSynced = isSynced;

    // Apply distance score
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
        if (droneRef.current.messageTimer <= 0) {
            droneRef.current.message = null;
        }
    }

    // Drone Movement
    droneRef.current.frame += 0.05;
    droneRef.current.offsetY = Math.sin(droneRef.current.frame) * 10;
    const targetDroneY = p.y + (p.height / 2);
    droneRef.current.y += (targetDroneY - droneRef.current.y) * 0.08;

    // Player Trail
    if (framesRef.current % 2 === 0) {
        p.trail.push({ x: p.x, y: p.y, alpha: 0.8 });
    }
    for (let i = p.trail.length - 1; i >= 0; i--) {
        p.trail[i].x -= gameSpeedRef.current;
        p.trail[i].alpha -= 0.08;
        if (p.trail[i].alpha <= 0) p.trail.splice(i, 1);
    }

    framesRef.current++;

    // Spawning
    const spawnRate = Math.floor(1000 / (gameSpeedRef.current * 1.3)); 
    if (framesRef.current % (Math.max(20, spawnRate)) === 0) {
        if (Math.random() > 0.85) spawnPickup();
        else if (Math.random() > 0.2) spawnObstacle();
    }

    // Update Pickups
    const pickupsToRemove: number[] = [];
    pickupsRef.current.forEach((pk, idx) => {
        // Magnet Logic
        if (powerupRef.current.type === PickupType.MAGNET && pk.type === PickupType.COIN) {
            const dx = p.x - pk.x;
            const dy = p.y - pk.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            if (dist < 400) {
                pk.x += (dx / dist) * 15;
                pk.y += (dy / dist) * 15;
            } else {
                pk.x -= gameSpeedRef.current;
            }
        } else {
            pk.x -= gameSpeedRef.current;
        }

        if (pk.x + pk.width < -50) pickupsToRemove.push(idx);

        // Collision
        if (!pk.collected && checkCollision(p, pk)) {
            pk.collected = true;
            pickupsToRemove.push(idx);
            
            // Effect
            if (pk.type === PickupType.COIN) {
                coinsRef.current++;
                createFloatingText(pk.x, pk.y, "+1", '#ffd700');
            } else {
                powerupRef.current = { type: pk.type, timer: 600 }; // 10 seconds (60fps)
                if (pk.type === PickupType.BOOST) powerupRef.current.timer = 180; // 3 seconds
                createFloatingText(pk.x, pk.y, pk.type, '#ffffff');
            }
        }
    });
    for (let i = pickupsToRemove.length - 1; i >= 0; i--) pickupsRef.current.splice(pickupsToRemove[i], 1);


    // Update Obstacles
    const obstaclesToRemove: number[] = [];
    obstaclesRef.current.forEach((obs, index) => {
      obs.x -= gameSpeedRef.current;

      if (!obs.passed && obs.x + obs.width < p.x) {
        obs.passed = true;
        // scoreRef.current += 200; // Removed discrete obstacle score to emphasize flow/sync
      }

      if (obs.x + obs.width < -100) {
        obstaclesToRemove.push(index);
      }

      // Collision (Ignored during Boost)
      if (powerupRef.current.type !== PickupType.BOOST) {
          const pad = 8; 
          const playerHitbox = {
              x: p.x + pad,
              y: p.y + pad,
              w: p.width - pad*2,
              h: p.height - pad*2
          };

          if (
            playerHitbox.x < obs.x + obs.width &&
            playerHitbox.x + playerHitbox.w > obs.x &&
            playerHitbox.y < obs.y + obs.height &&
            playerHitbox.y + playerHitbox.h > obs.y
          ) {
            gameOver();
          }
      }
    });

    for (let i = obstaclesToRemove.length - 1; i >= 0; i--) {
      obstaclesRef.current.splice(obstaclesToRemove[i], 1);
    }

    // Particles & Text
    for (let i = particlesRef.current.length - 1; i >= 0; i--) {
        const pt = particlesRef.current[i];
        pt.x += pt.vx;
        pt.y += pt.vy;
        pt.life -= 0.03;
        if(pt.life <= 0) particlesRef.current.splice(i, 1);
    }

    for (let i = floatingTextsRef.current.length - 1; i >= 0; i--) {
        const ft = floatingTextsRef.current[i];
        ft.y += ft.vy;
        ft.life--;
        if(ft.life <= 0) floatingTextsRef.current.splice(i, 1);
    }
  };

  const gameOver = () => {
    setFinalScore(Math.floor(scoreRef.current));
    setCollectedCoins(coinsRef.current);
    setGameState(GameState.GAME_OVER);
    onUpdateHighScore(Math.floor(scoreRef.current));
    createExplosion(playerRef.current.x + 16, playerRef.current.y + 16, '#ffffff', 50);
  };

  const checkCollision = (p: Player, item: {x: number, y: number, width: number, height: number}) => {
      return (
        p.x < item.x + item.width &&
        p.x + p.width > item.x &&
        p.y < item.y + item.height &&
        p.y + p.height > item.y
      );
  };
  
  const lerp = (start: number, end: number, t: number) => {
      return start * (1 - t) + end * t;
  };

  // --- Rendering Helpers ---

  const drawBackground = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
      const { accent, bg } = currentPaletteRef.current;

      // Draw Parallax Entities
      bgEntitiesRef.current.forEach(ent => {
          ctx.fillStyle = ent.layer === 0 ? accent : accent;
          // Far layers are darker/faded - Reduced Opacity for Contrast
          ctx.globalAlpha = ent.layer === 0 ? 0.05 : 0.1; 
          
          if (ent.shape === 'rect') {
              ctx.fillRect(ent.x, ent.y, ent.w, ent.h);
          } else if (ent.shape === 'spire') {
              ctx.beginPath();
              ctx.moveTo(ent.x, ent.y);
              ctx.lineTo(ent.x + ent.w/2, ent.y - ent.h);
              ctx.lineTo(ent.x + ent.w, ent.y);
              ctx.fill();
          } else if (ent.shape === 'hex') {
               ctx.beginPath();
               for (let i = 0; i < 6; i++) {
                 ctx.lineTo(ent.x + ent.w * Math.cos(i * 2 * Math.PI / 6), ent.y + ent.w * Math.sin(i * 2 * Math.PI / 6));
               }
               ctx.fill();
          } else if (ent.shape === 'pillar') {
              ctx.fillRect(ent.x, ent.y, ent.w, ent.h);
          }
      });
      ctx.globalAlpha = 1.0;

      // Moving Floor/Ceiling Grid
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.15; // Reduced opacity
      
      const speedOffset = (framesRef.current * gameSpeedRef.current) % 100;
      
      // Perspective Lines (Ceiling & Floor)
      ctx.beginPath();
      // Floor
      for (let x = -speedOffset; x < width; x += 100) {
          ctx.moveTo(x + 50, height);
          ctx.lineTo(x, height * 0.75);
      }
      // Ceiling
      for (let x = -speedOffset; x < width; x += 100) {
          ctx.moveTo(x + 50, 0);
          ctx.lineTo(x, height * 0.25);
      }
      ctx.stroke();

      // Horizon Lines
      ctx.beginPath();
      ctx.moveTo(0, height * 0.25);
      ctx.lineTo(width, height * 0.25);
      ctx.moveTo(0, height * 0.75);
      ctx.lineTo(width, height * 0.75);
      ctx.stroke();
      
      ctx.globalAlpha = 1.0;
  };

  const drawSpeechBubble = (ctx: CanvasRenderingContext2D, x: number, y: number, text: string) => {
      ctx.font = "20px 'VT323', monospace";
      const textMetrics = ctx.measureText(text);
      const w = textMetrics.width + 20;
      const h = 30;
      const bubbleX = x - w/2;
      const bubbleY = y - 40;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.fillRect(bubbleX, bubbleY, w, h);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.strokeRect(bubbleX, bubbleY, w, h);

      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText(text, x, bubbleY + 20);

      ctx.beginPath();
      ctx.moveTo(x, bubbleY + h);
      ctx.lineTo(x, y - 10);
      ctx.stroke();
  };

  const drawGlitchRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) => {
      const shake = Math.random() > 0.9 ? 2 : 0;
      ctx.fillStyle = 'rgba(0, 255, 255, 0.5)';
      ctx.fillRect(x - 2 + shake, y, w, h);
      ctx.fillStyle = 'rgba(255, 0, 255, 0.5)';
      ctx.fillRect(x + 2 - shake, y, w, h);
      ctx.fillStyle = color;
      ctx.fillRect(x, y, w, h);
  };

  const drawDataBlock = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) => {
      ctx.shadowBlur = 10;
      ctx.shadowColor = color;
      ctx.fillStyle = 'rgba(10, 10, 10, 1.0)'; // Darker fill
      ctx.fillRect(x, y, w, h);
      
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);
      ctx.shadowBlur = 0;

      ctx.fillStyle = color;
      if (Math.random() > 0.8) {
          const ly = y + Math.random() * h;
          ctx.fillRect(x, ly, w, 2);
      }
  };

  const drawCrystalSpike = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, isCeiling: boolean) => {
      ctx.shadowBlur = 10;
      ctx.shadowColor = color;
      ctx.fillStyle = color;
      ctx.beginPath();
      if (isCeiling) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x + w/2, h);
        ctx.lineTo(x + w, 0);
      } else {
        ctx.moveTo(x, y + h);
        ctx.lineTo(x + w/2, y);
        ctx.lineTo(x + w, y + h);
      }
      ctx.fill();
      ctx.shadowBlur = 0;
  };

  const drawPickup = (ctx: CanvasRenderingContext2D, p: Pickup) => {
      const bob = Math.sin(framesRef.current * 0.1) * 5;
      const y = p.y + bob;
      const x = p.x;
      const cx = x + p.width/2;
      const cy = y + p.height/2;

      ctx.shadowBlur = 15;
      
      if (p.type === PickupType.COIN) {
          ctx.fillStyle = '#FFD700'; // Gold
          ctx.shadowColor = '#FFD700';
          ctx.beginPath();
          // Hexagon
          for (let i = 0; i < 6; i++) {
              ctx.lineTo(cx + p.width/2 * Math.cos(i * 2 * Math.PI / 6), cy + p.width/2 * Math.sin(i * 2 * Math.PI / 6));
          }
          ctx.fill();
          
          ctx.fillStyle = '#000';
          ctx.font = "16px monospace";
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText("C", cx, cy);

      } else if (p.type === PickupType.BOOST) {
          ctx.fillStyle = '#00ffff'; 
          ctx.shadowColor = '#00ffff';
          ctx.beginPath();
          ctx.moveTo(cx, y);
          ctx.lineTo(x + p.width, y + p.height);
          ctx.lineTo(cx, y + p.height - 5);
          ctx.lineTo(x, y + p.height);
          ctx.fill();
      } else if (p.type === PickupType.MAGNET) {
          ctx.strokeStyle = '#ff00ff';
          ctx.shadowColor = '#ff00ff';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(cx, cy, p.width/2, Math.PI, 0);
          ctx.lineTo(x + p.width, cy + 10);
          ctx.moveTo(x, cy);
          ctx.lineTo(x, cy + 10);
          ctx.stroke();
      } else if (p.type === PickupType.MULTIPLIER) {
          ctx.fillStyle = '#00ff00';
          ctx.shadowColor = '#00ff00';
          ctx.font = "bold 24px monospace";
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText("x2", cx, cy);
      }
      ctx.shadowBlur = 0;
  };

  const drawGame = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const p = playerRef.current;
    
    // -- HUD --
    if (gameState !== GameState.MENU) {
        ctx.font = "48px 'VT323', monospace";
        ctx.textAlign = "center";
        ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
        ctx.fillText(Math.floor(scoreRef.current).toString(), width / 2, 60);
        
        // Stats
        ctx.font = "24px 'VT323', monospace";
        ctx.textAlign = "left";
        
        // Coins
        ctx.fillStyle = '#ffd700';
        ctx.fillText(`COINS: ${coinsRef.current}`, 20, 40);

        // Powerup Status
        if (powerupRef.current.type) {
             const secondsLeft = Math.ceil(powerupRef.current.timer / 60);
             ctx.fillStyle = '#fff';
             ctx.fillText(`${powerupRef.current.type} >> ${secondsLeft}s`, 20, 70);
        }

        ctx.textAlign = "right";
        ctx.fillStyle = "#fff";
        ctx.fillText(`HI: ${highScore}`, width - 20, 40);
        
        // Sync Floating Score
        if (droneRef.current.accumulatedScore > 0) {
            const droneX = p.x + 200; 
            const droneY = droneRef.current.y + droneRef.current.offsetY;
            
            ctx.font = "24px 'VT323', monospace";
            ctx.fillStyle = currentPaletteRef.current.accent; // Cyan/Theme color
            ctx.textAlign = "center";
            ctx.fillText(`+${droneRef.current.accumulatedScore * 5}`, droneX, droneY - 40);
            
            // Connecting line to show flow
            ctx.strokeStyle = currentPaletteRef.current.accent;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(droneX, droneY - 35);
            ctx.lineTo(droneX, droneY - 10);
            ctx.stroke();
        }
    }

    // -- Drone --
    const droneX = p.x + 200; 
    const droneY = droneRef.current.y + droneRef.current.offsetY;

    if (gameState === GameState.PLAYING) {
        // Tether
        ctx.strokeStyle = droneRef.current.isSynced ? currentPaletteRef.current.accent : '#555';
        ctx.lineWidth = droneRef.current.isSynced ? 2 : 1;
        ctx.setLineDash(droneRef.current.isSynced ? [] : [5, 5]);
        ctx.beginPath();
        ctx.moveTo(p.x + p.width/2, p.y + p.height/2);
        ctx.lineTo(droneX, droneY);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    // Drone Body
    ctx.shadowBlur = 15;
    ctx.shadowColor = currentPaletteRef.current.accent;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(droneX, droneY, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = currentPaletteRef.current.accent;
    ctx.stroke();
    
    // Drone Eye
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(droneX, droneY, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    if (droneRef.current.message) {
        drawSpeechBubble(ctx, droneX, droneY - 20, droneRef.current.message);
    }

    // -- Player --
    // Trail
    p.trail.forEach(t => {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = t.alpha * 0.3;
        ctx.fillRect(t.x, t.y, p.width, p.height);
    });
    ctx.globalAlpha = 1.0;

    // Main Body
    if (gameState !== GameState.GAME_OVER) {
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#ffffff'; // White glow
        drawGlitchRect(ctx, p.x, p.y, p.width, p.height, '#ffffff'); // Always white core
        ctx.shadowBlur = 0;
        
        // Eye/Visor
        ctx.fillStyle = '#000';
        const eyeOffset = p.dy > 0 ? 18 : 6;
        ctx.fillRect(p.x + 16, p.y + eyeOffset, 12, 4);
    }

    // -- Pickups --
    pickupsRef.current.forEach(pk => {
        drawPickup(ctx, pk);
    });

    // -- Obstacles --
    obstaclesRef.current.forEach(obs => {
        // Obstacles use biome color
        const obsColor = obs.type === 'spike' ? '#ff2040' : currentPaletteRef.current.accent;
        if (obs.type === 'block') {
            drawDataBlock(ctx, obs.x, obs.y, obs.width, obs.height, obsColor);
        } else {
            drawCrystalSpike(ctx, obs.x, obs.y, obs.width, obs.height, obsColor, obs.y === 0);
        }
    });

    // -- Particles --
    particlesRef.current.forEach(pt => {
        ctx.globalAlpha = pt.life;
        ctx.fillStyle = pt.color;
        ctx.fillRect(pt.x, pt.y, pt.size, pt.size);
    });
    ctx.globalAlpha = 1.0;

    // -- Floating Texts --
    floatingTextsRef.current.forEach(ft => {
        ctx.font = "bold 24px 'VT323', monospace";
        ctx.fillStyle = ft.color;
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.strokeText(ft.text, ft.x, ft.y);
        ctx.fillText(ft.text, ft.x, ft.y);
    });

    // Floor/Ceiling lines
    ctx.fillStyle = currentPaletteRef.current.accent;
    ctx.fillRect(0, 0, width, 4); 
    ctx.fillRect(0, height - 4, width, 4);
  };

  return (
    <div 
        className="relative w-full h-full font-[VT323] overflow-hidden" 
        onContextMenu={handleContextMenu}
    >
      <canvas ref={canvasRef} className="block w-full h-full cursor-pointer" />
      
      {/* UI Overlay */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none flex flex-col items-center justify-center">
        
        {/* Start Screen */}
        {gameState === GameState.MENU && (
          <div className="bg-black/95 p-12 border-2 border-cyan-400 flex flex-col items-center text-center shadow-[0_0_50px_rgba(6,182,212,0.4)] pointer-events-auto">
            <h1 className="text-8xl mb-2 text-white italic tracking-tighter" style={{ textShadow: '4px 4px 0px #00e0ff' }}>
              WISP CHASER
            </h1>
            <p className="text-cyan-200 text-xl mb-8 tracking-widest uppercase flex items-center gap-2">
              <Zap size={16} /> SYSTEM READY <Zap size={16} />
            </p>
            
            <button 
                onClick={() => {
                  handleInput();
                }}
                className="group relative px-12 py-4 bg-cyan-600 hover:bg-cyan-500 transition-all duration-200 border-2 border-white text-3xl text-white hover:scale-105 active:scale-95 flex items-center gap-3 shadow-[4px_4px_0px_#fff]"
            >
                <Play className="w-8 h-8" />
                START RUN
            </button>
            
            <div className="mt-12 flex items-center gap-8 text-lg text-slate-400">
                <div className="flex flex-col items-center gap-1">
                    <span className="text-white text-2xl">[SPACE]</span>
                    <span className="text-sm">GRAVITY FLIP</span>
                </div>
            </div>
            
            <div className="mt-8 flex gap-4 text-xs text-slate-500 uppercase tracking-widest">
                <div className="flex items-center gap-1"><Magnet size={12}/> MAGNET</div>
                <div className="flex items-center gap-1"><ChevronsUp size={12}/> BOOST</div>
                <div className="flex items-center gap-1"><Coins size={12}/> COINS</div>
            </div>
          </div>
        )}

        {/* Game Over Screen */}
        {gameState === GameState.GAME_OVER && (
          <div className="bg-black/95 p-12 border-2 border-red-500 flex flex-col items-center text-center shadow-[0_0_80px_rgba(255,0,0,0.5)] pointer-events-auto z-20">
            <h2 className="text-6xl mb-2 text-red-500 tracking-widest" style={{ textShadow: '2px 2px 0px white' }}>CRITICAL FAILURE</h2>
            
            <div className="grid grid-cols-2 gap-8 my-6 w-full max-w-md">
                <div className="text-right border-r border-slate-700 pr-4">
                    <div className="text-slate-400 text-sm">SCORE</div>
                    <div className="text-5xl text-white">{finalScore}</div>
                </div>
                <div className="text-left pl-4">
                    <div className="text-slate-400 text-sm">COINS</div>
                    <div className="text-5xl text-yellow-400">{collectedCoins}</div>
                </div>
            </div>
            
            {finalScore >= highScore && finalScore > 0 && (
                <div className="mb-8 flex items-center gap-2 text-cyan-400 text-2xl animate-pulse">
                    <Trophy size={32} />
                    NEW HIGHSCORE
                </div>
            )}

            <button 
                onClick={() => {
                   resetGame();
                }}
                className="px-8 py-3 bg-white text-black hover:bg-slate-200 border-2 border-transparent hover:border-red-500 transition-all text-2xl flex items-center gap-2 mb-4"
            >
                <RotateCcw size={24} />
                RETRY
            </button>
            <button 
                onClick={() => setGameState(GameState.MENU)}
                className="text-slate-500 hover:text-white transition-colors text-lg uppercase tracking-wider"
            >
                Return to Menu
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default GameCanvas;