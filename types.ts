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

export enum PickupType {
  COIN = 'COIN',
  MULTIPLIER = 'MULTIPLIER',
  MAGNET = 'MAGNET',
  BOOST = 'BOOST'
}

export interface Pickup {
  id: string; // Unique ID for keying
  x: number;
  y: number;
  width: number;
  height: number;
  type: PickupType;
  collected: boolean;
}

export interface FloatingText {
  id: number;
  x: number;
  y: number;
  text: string;
  color: string;
  life: number; // Frames remaining
  vy: number;
}