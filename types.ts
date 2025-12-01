export enum GameState {
  MENU = 'MENU',
  PLAYING = 'PLAYING',
  GAME_OVER = 'GAME_OVER',
}

export interface Player {
  x: number;
  y: number;
  width: number;
  height: number;
  dy: number;
  gravity: number; // Positive for down, negative for up
  isGrounded: boolean;
  color: string;
  trail: { x: number; y: number; alpha: number }[];
}

export interface Obstacle {
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'spike' | 'block';
  color: string;
  passed: boolean;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
}
