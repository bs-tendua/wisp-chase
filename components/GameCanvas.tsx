import React, { useRef, useEffect, useState, useCallback } from 'react';
import { GameState, Player, Obstacle, Particle } from '../types';
import { Play, RotateCcw, Trophy, MousePointer2 } from 'lucide-react';

interface GameCanvasProps {
  highScore: number;
  onUpdateHighScore: (score: number) => void;
}

// Physics & Game Constants
const GRAVITY_FORCE = 0.8; // Slightly stronger gravity for snappier feel
const INITIAL_SPEED = 8;
const MAX_SPEED = 24;
const SPEED_INCREMENT = 0.003;
const SYNC_DISTANCE_THRESHOLD = 80; // Distance in pixels to be considered "Synced" with Wisp

// Theme Colors
const COLORS = {
  bg: '#000000',
  player: '#00fff2', // Cyan
  playerGlow: '#00fff2',
  drone: '#800080', // Dim Magenta (Darker)
  droneLight: '#d02090', // Slight highlight
  spike: '#ff003c', // Red/Pink
  block: '#bf00ff', // Purple
  grid: '#1a1a2e',
  text: '#ffffff'
};

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

const GameCanvas: React.FC<GameCanvasProps> = ({ highScore, onUpdateHighScore }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);
  const [gameState, setGameState] = useState<GameState>(GameState.MENU);
  
  // We keep score in a ref for 60fps updates, but sync to state for Game Over UI
  const [finalScore, setFinalScore] = useState(0);

  // Mutable game state
  const playerRef = useRef<Player>({
    x: 100,
    y: 0,
    width: 32,
    height: 32,
    dy: 0,
    gravity: GRAVITY_FORCE,
    isGrounded: false,
    color: COLORS.player,
    trail: []
  });

  // The "Wisp" drone that leads the player
  const droneRef = useRef({
    y: 0,
    offsetY: 0, // For floating animation
    frame: 0,
    message: null as string | null,
    messageTimer: 0,
    isSynced: false
  });

  const obstaclesRef = useRef<Obstacle[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const gameSpeedRef = useRef(INITIAL_SPEED);
  const scoreRef = useRef(0);
  const distanceScoreRef = useRef(0);
  const levelRef = useRef(0);
  const framesRef = useRef(0);
  const canvasSizeRef = useRef({ width: 0, height: 0 });

  // Prevent Context Menu (Right Click)
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  const spawnObstacle = () => {
    const { width, height } = canvasSizeRef.current;
    if (width === 0) return;

    const isTop = Math.random() > 0.5;
    const type = Math.random() > 0.6 ? 'block' : 'spike';
    
    // Scale size proportionate to screen height
    // Previous was 0.25 to 0.45, reducing to 0.15 to 0.30 (15% - 30% of screen height)
    const minHeight = height * 0.15;
    const variablity = height * 0.15;
    
    let obstacleHeight = minHeight + Math.random() * variablity;
    
    // Width is also proportionate to height to maintain aspect ratio on different screens
    // Blocks are roughly square-ish or slightly rectangular
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
      color: type === 'spike' ? COLORS.spike : COLORS.block,
      passed: false
    };

    if (isTop) {
        obstacle.y = 0;
    }

    obstaclesRef.current.push(obstacle);
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

  const resetGame = () => {
    const { height } = canvasSizeRef.current;
    playerRef.current = {
      x: 120,
      y: height / 2,
      width: 32,
      height: 32,
      dy: 0,
      gravity: GRAVITY_FORCE,
      isGrounded: false,
      color: COLORS.player,
      trail: []
    };
    droneRef.current = { y: height/2, offsetY: 0, frame: 0, message: null, messageTimer: 0, isSynced: false };
    obstaclesRef.current = [];
    particlesRef.current = [];
    gameSpeedRef.current = INITIAL_SPEED;
    scoreRef.current = 0;
    distanceScoreRef.current = 0;
    levelRef.current = 0;
    framesRef.current = 0;
    setFinalScore(0);
    setGameState(GameState.PLAYING);
  };

  const handleInput = useCallback(() => {
    if (gameState === GameState.MENU || gameState === GameState.GAME_OVER) {
      resetGame();
      return;
    }

    if (gameState === GameState.PLAYING) {
      const p = playerRef.current;
      // Gravity Flip
      p.gravity = -p.gravity;
      p.isGrounded = false;
      
      // Visual flair on flip
      createExplosion(p.x + p.width/2, p.y + p.height/2, COLORS.player, 5);
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
            if (e.button === 2) return; // Ignore right click logic here, handled by onContextMenu
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

    const loop = (time: number) => {
      ctx.fillStyle = COLORS.bg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (gameState === GameState.PLAYING) {
        updateGame(canvas.width, canvas.height);
      } else if (gameState === GameState.MENU) {
         // Ambient animation for menu
         framesRef.current++;
         gameSpeedRef.current = 2; // Slow scroll for menu
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

    // Speed scaling
    if (gameSpeedRef.current < MAX_SPEED) {
      gameSpeedRef.current += SPEED_INCREMENT;
    }

    // Distance Scoring
    distanceScoreRef.current += gameSpeedRef.current * 0.05;
    
    // Proximity / Sync Check
    const distToWisp = Math.abs((p.y + p.height/2) - (droneRef.current.y));
    const isSynced = distToWisp < SYNC_DISTANCE_THRESHOLD;
    droneRef.current.isSynced = isSynced;

    // Sync Bonus Multiplier
    const scoreMultiplier = isSynced ? 3.0 : 1.0; 

    if (distanceScoreRef.current >= 1) {
        scoreRef.current += Math.floor(distanceScoreRef.current) * scoreMultiplier;
        distanceScoreRef.current -= Math.floor(distanceScoreRef.current);
    }

    // Leveling Up & Dialogue
    const currentLevel = Math.floor(scoreRef.current / 500);
    if (currentLevel > levelRef.current) {
        levelRef.current = currentLevel;
        // Trigger Wisp Message
        droneRef.current.message = WISP_PHRASES[Math.floor(Math.random() * WISP_PHRASES.length)];
        droneRef.current.messageTimer = 180; // 3 seconds
    }

    if (droneRef.current.messageTimer > 0) {
        droneRef.current.messageTimer--;
        if (droneRef.current.messageTimer <= 0) {
            droneRef.current.message = null;
        }
    }

    // Physics
    p.dy += p.gravity;
    p.y += p.dy;

    // Boundaries
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

    // Update Drone (Angelfish) Logic
    droneRef.current.frame += 0.05;
    droneRef.current.offsetY = Math.sin(droneRef.current.frame) * 10;
    
    const targetY = p.y + (p.height / 2); // Center of player
    // Smooth lerp: moves 8% of the distance per frame
    droneRef.current.y += (targetY - droneRef.current.y) * 0.08;

    // Trails
    if (framesRef.current % 2 === 0) {
        p.trail.push({ x: p.x, y: p.y, alpha: 0.8 });
    }
    for (let i = p.trail.length - 1; i >= 0; i--) {
        p.trail[i].x -= gameSpeedRef.current;
        p.trail[i].alpha -= 0.08;
        if (p.trail[i].alpha <= 0) p.trail.splice(i, 1);
    }

    // Spawn Logic - Harder as game progresses
    framesRef.current++;
    // Spawn rate gets tighter as speed increases
    const spawnRate = Math.floor(1000 / (gameSpeedRef.current * 1.3)); 
    if (framesRef.current % (Math.max(20, spawnRate)) === 0 && Math.random() > 0.2) {
      spawnObstacle();
    }

    // Obstacles Logic
    const obstaclesToRemove: number[] = [];
    obstaclesRef.current.forEach((obs, index) => {
      obs.x -= gameSpeedRef.current;

      // Obstacle Passing Bonus
      if (!obs.passed && obs.x + obs.width < p.x) {
        obs.passed = true;
        scoreRef.current += 200; // Increased bonus
      }

      if (obs.x + obs.width < -100) {
        obstaclesToRemove.push(index);
      }

      // Collision
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
    });

    for (let i = obstaclesToRemove.length - 1; i >= 0; i--) {
      obstaclesRef.current.splice(obstaclesToRemove[i], 1);
    }

    // Particles
    for (let i = particlesRef.current.length - 1; i >= 0; i--) {
        const pt = particlesRef.current[i];
        pt.x += pt.vx;
        pt.y += pt.vy;
        pt.life -= 0.03;
        if(pt.life <= 0) particlesRef.current.splice(i, 1);
    }
  };

  const gameOver = () => {
    setFinalScore(Math.floor(scoreRef.current));
    setGameState(GameState.GAME_OVER);
    onUpdateHighScore(Math.floor(scoreRef.current));
    createExplosion(playerRef.current.x + 16, playerRef.current.y + 16, COLORS.player, 50);
  };

  // --- Rendering Helpers ---

  const drawBackground = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
      // Moving Grid Effect
      ctx.strokeStyle = '#1e1e2e';
      ctx.lineWidth = 2;
      
      const speedOffset = (framesRef.current * gameSpeedRef.current * 0.5) % 100;
      
      ctx.beginPath();
      for (let x = -speedOffset; x < width; x += 100) {
          ctx.moveTo(x, height);
          ctx.lineTo(x + 100, height/2); 
      }
      ctx.stroke();

      // Horizon
      ctx.strokeStyle = COLORS.player;
      ctx.globalAlpha = 0.2;
      ctx.beginPath();
      ctx.moveTo(0, height/2);
      ctx.lineTo(width, height/2);
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

      // Bubble BG
      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.fillRect(bubbleX, bubbleY, w, h);
      ctx.strokeStyle = COLORS.player;
      ctx.lineWidth = 1;
      ctx.strokeRect(bubbleX, bubbleY, w, h);

      // Text
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText(text, x, bubbleY + 20);

      // Line to source
      ctx.beginPath();
      ctx.moveTo(x, bubbleY + h);
      ctx.lineTo(x, y - 10);
      ctx.stroke();
  };

  const drawGlitchRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) => {
      const shake = Math.random() > 0.9 ? 2 : 0;
      
      ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';
      ctx.fillRect(x - 2 + shake, y, w, h);
      
      ctx.fillStyle = 'rgba(0, 0, 255, 0.5)';
      ctx.fillRect(x + 2 - shake, y, w, h);
      
      ctx.fillStyle = color;
      ctx.fillRect(x, y, w, h);
  };

  const drawDataBlock = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) => {
      // Base glow
      ctx.shadowBlur = 10;
      ctx.shadowColor = color;
      ctx.fillStyle = 'rgba(20, 0, 30, 0.95)'; // Opaque to feel solid
      ctx.fillRect(x, y, w, h);
      
      // Outline
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);
      ctx.shadowBlur = 0;

      // Internal Matrix Glitch Pattern - Denser for "Massive" feel
      ctx.fillStyle = color;
      const bitSize = 8;
      for(let i = 0; i < w; i += bitSize + 2) {
          for(let j = 0; j < h; j += bitSize + 2) {
              if (Math.random() > 0.8) {
                  ctx.globalAlpha = 0.4;
                  ctx.fillRect(x + i, y + j, bitSize, bitSize);
              }
          }
      }
      ctx.globalAlpha = 1.0;

      // Random glitch line
      if (Math.random() > 0.8) {
          ctx.fillStyle = '#ffffff';
          const ly = y + Math.random() * h;
          ctx.fillRect(x - 5, ly, w + 10, 4);
      }
  };

  const drawCrystalSpike = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, isCeiling: boolean) => {
      ctx.shadowBlur = 15;
      ctx.shadowColor = color;
      
      const drawShard = (offsetX: number, scaleX: number, scaleY: number, alpha: number) => {
          ctx.fillStyle = color;
          ctx.globalAlpha = alpha;
          ctx.beginPath();
          if (isCeiling) {
            ctx.moveTo(x + offsetX, 0);
            ctx.lineTo(x + w/2 + offsetX, h * scaleY);
            ctx.lineTo(x + w + offsetX, 0);
          } else {
            ctx.moveTo(x + offsetX, y + h);
            ctx.lineTo(x + w/2 + offsetX, y + h - (h * scaleY));
            ctx.lineTo(x + w + offsetX, y + h);
          }
          ctx.fill();
      };

      // Draw multiple shards for a jagged look
      drawShard(0, 1.0, 1.0, 0.8); // Main
      drawShard(-5, 0.6, 0.7, 0.4); // Left echo
      drawShard(5, 0.6, 0.6, 0.4); // Right echo
      
      ctx.globalAlpha = 1.0;
      ctx.shadowBlur = 0;
  };

  const drawGame = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const p = playerRef.current;
    
    // -- HUD --
    if (gameState !== GameState.MENU) {
        ctx.font = "48px 'VT323', monospace";
        ctx.textAlign = "center";
        ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
        ctx.fillText(Math.floor(scoreRef.current).toString(), width / 2, height / 2);
        
        ctx.font = "24px 'VT323', monospace";
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "left";
        ctx.fillText(`SCORE: ${Math.floor(scoreRef.current)}`, 20, 40);

        // Sync Indicator
        if (droneRef.current.isSynced) {
            ctx.fillStyle = "#00fff2";
            ctx.fillText("SYNCED >> x3 PTS", 20, 70);
        }

        ctx.textAlign = "right";
        ctx.fillStyle = "#ff00ff";
        ctx.fillText(`HI: ${highScore}`, width - 20, 40);
    }

    // -- Drone (Wisp) --
    // Drawn before player so player can overlap it slightly
    const droneX = p.x + 200; // Leads the player further
    const droneY = droneRef.current.y + droneRef.current.offsetY;

    // Tether Line (Changes if synced)
    if (gameState === GameState.PLAYING) {
        ctx.strokeStyle = droneRef.current.isSynced ? '#00fff2' : COLORS.drone;
        ctx.lineWidth = droneRef.current.isSynced ? 3 : 1;
        ctx.globalAlpha = droneRef.current.isSynced ? 0.8 : 0.2;
        ctx.beginPath();
        ctx.moveTo(p.x + p.width/2, p.y + p.height/2);
        ctx.lineTo(droneX, droneY);
        ctx.stroke();
        ctx.globalAlpha = 1.0;
    }

    // Drone Body (Dimmer now)
    ctx.shadowBlur = 10;
    ctx.shadowColor = COLORS.drone;
    ctx.fillStyle = COLORS.drone; // Use the dim magenta
    ctx.globalAlpha = 0.7; // Make it translucent
    ctx.beginPath();
    ctx.arc(droneX, droneY, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1.0;
    
    // Inner core
    ctx.fillStyle = COLORS.droneLight;
    ctx.beginPath();
    ctx.arc(droneX, droneY, 3, 0, Math.PI * 2);
    ctx.fill();

    // Drone Rings
    ctx.strokeStyle = COLORS.drone;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.arc(droneX, droneY, 12 + Math.sin(framesRef.current * 0.1) * 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1.0;
    ctx.shadowBlur = 0;

    // Drone Chat
    if (droneRef.current.message) {
        drawSpeechBubble(ctx, droneX, droneY - 20, droneRef.current.message);
    }

    // -- Player --
    // Draw Trail
    p.trail.forEach(t => {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = t.alpha * 0.4;
        ctx.fillRect(t.x, t.y, p.width, p.height);
    });
    ctx.globalAlpha = 1.0;

    if (gameState !== GameState.GAME_OVER) {
        ctx.shadowBlur = 20;
        ctx.shadowColor = p.color;
        drawGlitchRect(ctx, p.x, p.y, p.width, p.height, p.color);
        ctx.shadowBlur = 0;
        
        // Player "Eye" or Core
        ctx.fillStyle = '#fff';
        const eyeOffset = p.dy > 0 ? 4 : 20; // Eye looks up/down
        ctx.fillRect(p.x + 20, p.y + eyeOffset, 8, 8);
    }

    // -- Obstacles --
    obstaclesRef.current.forEach(obs => {
        if (obs.type === 'block') {
            drawDataBlock(ctx, obs.x, obs.y, obs.width, obs.height, obs.color);
        } else {
            drawCrystalSpike(ctx, obs.x, obs.y, obs.width, obs.height, obs.color, obs.y === 0);
        }
    });

    // -- Particles --
    particlesRef.current.forEach(pt => {
        ctx.globalAlpha = pt.life;
        ctx.fillStyle = pt.color;
        ctx.fillRect(pt.x, pt.y, pt.size, pt.size);
    });
    ctx.globalAlpha = 1.0;

    // Floor/Ceiling lines
    ctx.fillStyle = COLORS.player;
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
          <div className="bg-black/90 p-12 border-2 border-cyan-400 flex flex-col items-center text-center shadow-[0_0_50px_rgba(6,182,212,0.4)] pointer-events-auto transform rotate-1">
            <h1 className="text-7xl mb-4 text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-white to-fuchsia-500 animate-pulse tracking-widest" style={{ textShadow: '4px 4px 0px #800080' }}>
              WISP CHASER
            </h1>
            <p className="text-cyan-200 text-xl mb-8 tracking-widest uppercase">
              FOLLOW THE SIGNAL. STAY ALIVE.
            </p>
            
            <button 
                onClick={() => {
                  handleInput(); // Starts game
                }}
                className="group relative px-10 py-4 bg-cyan-600 hover:bg-cyan-500 transition-all duration-200 border-2 border-white text-2xl text-white hover:scale-105 active:scale-95 flex items-center gap-3"
            >
                <Play className="w-6 h-6" />
                INITIATE_RUN
            </button>
            
            <div className="mt-10 flex items-center gap-8 text-lg text-slate-400">
                <div className="flex items-center gap-2">
                    <span className="px-3 py-1 border border-slate-600 bg-slate-900 text-white">[SPACE]</span>
                    <span>FLIP</span>
                </div>
                <div className="flex items-center gap-2">
                    <MousePointer2 size={20} />
                    <span>CLICK</span>
                </div>
            </div>
          </div>
        )}

        {/* Game Over Screen */}
        {gameState === GameState.GAME_OVER && (
          <div className="bg-black/90 p-12 border-2 border-red-500 flex flex-col items-center text-center shadow-[0_0_80px_rgba(255,0,0,0.4)] pointer-events-auto z-20">
            <h2 className="text-6xl mb-2 text-red-500 tracking-widest" style={{ textShadow: '2px 2px 0px white' }}>FATAL ERROR</h2>
            <div className="text-8xl mb-6 text-white tracking-widest font-mono">
                {finalScore}
            </div>
            
            {finalScore >= highScore && finalScore > 0 && (
                <div className="mb-8 flex items-center gap-2 text-yellow-400 text-2xl animate-bounce">
                    <Trophy size={32} />
                    NEW RECORD
                </div>
            )}

            <button 
                onClick={() => {
                   resetGame();
                }}
                className="px-8 py-3 bg-white text-black hover:bg-slate-200 border-2 border-transparent hover:border-red-500 transition-all text-2xl flex items-center gap-2"
            >
                <RotateCcw size={24} />
                REBOOT SYSTEM
            </button>
            <button 
                onClick={() => setGameState(GameState.MENU)}
                className="mt-6 text-slate-500 hover:text-white transition-colors text-lg uppercase tracking-wider"
            >
                Abort
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default GameCanvas;