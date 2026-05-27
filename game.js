/* ==========================================================================
   NEON BREAKOUT - Complete Game Engine
   ========================================================================== */

// --- Game Constants & Configurations ---
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;

const GameState = {
  START: 'START',
  PLAYING: 'PLAYING',
  PAUSED: 'PAUSED',
  LEVEL_COMPLETE: 'LEVEL_COMPLETE',
  GAMEOVER: 'GAMEOVER'
};

// --- Web Audio API Synth Engine ---
class WebAudioSynth {
  constructor() {
    this.ctx = null;
    this.isMuted = false;
    this.musicPlaying = false;
    this.currentStep = 0;
    this.bpm = 135;
    this.stepDuration = 60 / this.bpm / 4; // 16th note (~111ms)
    this.sequencerTimer = null;
    this.distortion = null;
    this.musicGain = null;

    // MIDI heavy rock pentatonic progression in E Minor
    this.bassPattern = [
      40, 40, 40, 40, 43, 43, 45, 45,
      40, 40, 40, 40, 50, 47, 45, 43,
      40, 40, 40, 40, 43, 43, 45, 45,
      40, 40, 40, 40, 38, 38, 36, 35
    ];
    this.guitarPattern = [
      64,  0, 64,  0, 67,  0, 69,  0,
      64,  0, 64,  0, 74, 72, 69, 67,
      64,  0, 64,  0, 67,  0, 69,  0,
      64,  0, 64,  0, 62, 62, 60, 59
    ];
  }

  init() {
    if (this.ctx) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    } catch (e) {
      console.warn("Web Audio API not supported or blocked by browser security:", e);
      this.ctx = null;
    }
  }

  makeDistortionCurve(amount = 60) {
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    const deg = Math.PI / 180;
    for (let i = 0 ; i < n_samples; ++i ) {
      const x = (i * 2) / n_samples - 1;
      curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x));
    }
    return curve;
  }

  startRockMusic() {
    this.init();
    if (!this.ctx) return;
    
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    if (this.musicPlaying) return;
    this.musicPlaying = true;
    this.currentStep = 0;

    if (!this.distortion) {
      this.distortion = this.ctx.createWaveShaper();
      this.distortion.curve = this.makeDistortionCurve(120);
      this.distortion.oversample = '4x';
      
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.setValueAtTime(0.06, this.ctx.currentTime);
      
      this.distortion.connect(this.musicGain);
      this.musicGain.connect(this.ctx.destination);
    }

    this.sequencerTimer = setInterval(() => {
      if (this.isMuted || gameState !== GameState.PLAYING) return;
      this.playSequencerStep();
    }, this.stepDuration * 1000);
  }

  stopRockMusic() {
    if (this.sequencerTimer) {
      clearInterval(this.sequencerTimer);
      this.sequencerTimer = null;
    }
    this.musicPlaying = false;
  }

  playSequencerStep() {
    const time = this.ctx.currentTime;
    const step = this.currentStep % 32;

    const playKick = (step === 0 || step === 8 || step === 16 || step === 20 || step === 24);
    if (playKick) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.frequency.setValueAtTime(140, time);
      osc.frequency.exponentialRampToValueAtTime(0.01, time + 0.12);

      gain.gain.setValueAtTime(0.18, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);

      osc.start(time);
      osc.stop(time + 0.13);
    }

    const playSnare = (step === 8 || step === 24);
    if (playSnare) {
      const bufferSize = this.ctx.sampleRate * 0.15;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1100;

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.12, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.14);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);
      noise.start(time);
      noise.stop(time + 0.15);

      const tone = this.ctx.createOscillator();
      const toneGain = this.ctx.createGain();
      tone.type = 'triangle';
      tone.frequency.setValueAtTime(180, time);
      toneGain.gain.setValueAtTime(0.08, time);
      toneGain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);

      tone.connect(toneGain);
      toneGain.connect(this.ctx.destination);
      tone.start(time);
      tone.stop(time + 0.09);
    }

    const playHat = (step % 2 === 1);
    if (playHat) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(10000, time);

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 8000;

      gain.gain.setValueAtTime(step % 4 === 2 ? 0.012 : 0.006, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(time);
      osc.stop(time + 0.05);
    }

    if (step % 2 === 0) {
      const bassIndex = Math.floor(step / 2) % 16;
      const bassNote = this.bassPattern[bassIndex + (Math.floor(this.currentStep / 32) % 2) * 16];
      
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';

      const freq = Math.pow(2, (bassNote - 69) / 12) * 440;
      osc.frequency.setValueAtTime(freq, time);

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(320, time);
      filter.Q.value = 7;

      gain.gain.setValueAtTime(0.12, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + this.stepDuration * 1.8);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.distortion);

      osc.start(time);
      osc.stop(time + this.stepDuration * 1.9);
    }

    const guitarNote = this.guitarPattern[step];
    if (guitarNote > 0 && Math.random() < 0.82) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';

      const freq = Math.pow(2, (guitarNote - 69) / 12) * 440;
      osc.frequency.setValueAtTime(freq, time);

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(750, time);

      gain.gain.setValueAtTime(0.04, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + this.stepDuration * 1.2);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.distortion);

      osc.start(time);
      osc.stop(time + this.stepDuration * 1.3);
    }

    this.currentStep++;
  }

  playOscillator(freqStart, freqEnd, type, duration, volume = 0.1) {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    try {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }

      const osc = this.ctx.createOscillator();
      const gainNode = this.ctx.createGain();
      
      osc.type = type;
      osc.frequency.setValueAtTime(freqStart, this.ctx.currentTime);
      
      if (freqEnd !== freqStart) {
        osc.frequency.exponentialRampToValueAtTime(freqEnd, this.ctx.currentTime + duration);
      }

      gainNode.gain.setValueAtTime(volume, this.ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);

      osc.connect(gainNode);
      gainNode.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch (e) {
      console.warn("Synth oscillator sweep error: ", e);
    }
  }

  playHit(isHard = false) {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;
    const time = this.ctx.currentTime;

    if (isHard) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(600, time);
      osc.frequency.exponentialRampToValueAtTime(100, time + 0.18);
      
      gain.gain.setValueAtTime(0.18, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.18);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(time);
      osc.stop(time + 0.19);
      
      const bufSize = this.ctx.sampleRate * 0.08;
      const buffer = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
      
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 3000;
      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.08, time);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);
      
      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(this.ctx.destination);
      noise.start(time);
      noise.stop(time + 0.09);
    } else {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(800, time);
      osc.frequency.exponentialRampToValueAtTime(200, time + 0.1);
      
      gain.gain.setValueAtTime(0.15, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(time);
      osc.stop(time + 0.11);
    }
  }

  playPaddleHit() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;
    const time = this.ctx.currentTime;
    
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(60, time + 0.15);

    gain.gain.setValueAtTime(0.24, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(time);
    osc.stop(time + 0.16);

    const pop = this.ctx.createOscillator();
    const popGain = this.ctx.createGain();
    pop.type = 'sine';
    pop.frequency.setValueAtTime(450, time);
    pop.frequency.exponentialRampToValueAtTime(200, time + 0.03);
    popGain.gain.setValueAtTime(0.15, time);
    popGain.gain.exponentialRampToValueAtTime(0.001, time + 0.03);
    
    pop.connect(popGain);
    popGain.connect(this.ctx.destination);
    pop.start(time);
    pop.stop(time + 0.04);
  }

  playExplosion() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    try {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }

      const bufferSize = this.ctx.sampleRate * 0.4;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const noiseNode = this.ctx.createBufferSource();
      noiseNode.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1000, this.ctx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.35);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.25, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.35);

      noiseNode.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      noiseNode.start();
      noiseNode.stop(this.ctx.currentTime + 0.4);
    } catch (e) {
      this.playOscillator(150, 40, 'square', 0.3, 0.15);
    }
  }

  playLaser() {
    this.playOscillator(880, 440, 'sawtooth', 0.08, 0.05);
  }

  playPowerup() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;
    
    try {
      const notes = [261.63, 329.63, 392.00, 523.25];
      notes.forEach((freq, index) => {
        setTimeout(() => {
          this.playOscillator(freq, freq * 1.5, 'sine', 0.15, 0.08);
        }, index * 40);
      });
    } catch (e) {
      console.warn("Sound playPowerup error: ", e);
    }
  }

  playLoseLife() {
    this.playOscillator(180, 60, 'square', 0.4, 0.15);
  }

  playLevelClear() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;
    
    try {
      const melody = [523.25, 587.33, 659.25, 698.46, 783.99, 880.00, 987.77, 1046.50];
      melody.forEach((freq, index) => {
        setTimeout(() => {
          this.playOscillator(freq, freq, 'triangle', 0.15, 0.1);
        }, index * 80);
      });
    } catch (e) {
      console.warn("Sound playLevelClear error: ", e);
    }
  }

  playGameOver() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    try {
      const melody = [220, 196, 174.61, 146.83, 110];
      melody.forEach((freq, index) => {
        setTimeout(() => {
          this.playOscillator(freq, freq - 10, 'sawtooth', 0.25, 0.12);
        }, index * 180);
      });
    } catch (e) {
      console.warn("Sound playGameOver error: ", e);
    }
  }
}

const synth = new WebAudioSynth();

// --- Game Engine Variables ---
let canvas, ctx;
let mouseX = CANVAS_WIDTH / 2;
let highscore = parseInt(localStorage.getItem('neon_highscore')) || 0;

// Game State Tracking
let gameState = GameState.START;
let score = 0;
let level = 1;
let lives = 3;
let maxLives = 3;
let speedFactor = 1.0;

// Combo Multiplier System
let combo = 1.0;
let comboTimer = 0;
const COMBO_MAX_DURATION = 3500; // 3.5 seconds
let consecutiveHits = 0;
let maxComboInLevel = 1.0;

// Bricks variables
let bricks = [];
let totalBricksCount = 0;

// Entities
let paddle = {
  x: 340,
  y: 540,
  width: 120,
  baseWidth: 120,
  height: 18,
  targetX: 340,
  sticky: false,
  laserActive: false,
  laserTimer: 0,
  laserCooldown: 0,
  expandTimer: 0
};

let balls = [];
let powerups = [];
let lasers = [];
let particles = [];
let shieldActive = false;

// Screen Shake variables
let shakeTimer = 0;
let shakeIntensity = 0;

// Stats for level evaluation
let bricksBrokenThisLevel = 0;
let totalPaddleHits = 0;
let accuratePaddleHits = 0; // Hits that kept ball alive

// --- Level Grid Visual Maps ---
// 0: Empty, 1: Normal, 2: Hard, 3: Explosive, 4: Mystery
const LEVELS = [
  // Level 1: Simple Neon Rows
  [
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 4, 1, 1, 4, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
  ],
  // Level 2: Cyber Alien (Space Invader)
  [
    [0, 0, 1, 0, 0, 0, 0, 1, 0, 0],
    [0, 0, 0, 1, 0, 0, 1, 0, 0, 0],
    [0, 2, 2, 2, 2, 2, 2, 2, 2, 0],
    [2, 2, 4, 2, 2, 2, 2, 4, 2, 2],
    [3, 2, 2, 2, 2, 2, 2, 2, 2, 3],
    [2, 0, 1, 1, 1, 1, 1, 1, 0, 2],
    [0, 0, 1, 0, 0, 0, 0, 1, 0, 0]
  ],
  // Level 3: Cyber Fortress
  [
    [2, 2, 2, 2, 3, 3, 2, 2, 2, 2],
    [2, 4, 0, 0, 0, 0, 0, 0, 4, 2],
    [2, 0, 1, 1, 1, 1, 1, 1, 0, 2],
    [3, 0, 1, 4, 3, 3, 4, 1, 0, 3],
    [2, 0, 1, 1, 1, 1, 1, 1, 0, 2],
    [2, 4, 0, 0, 0, 0, 0, 0, 4, 2],
    [2, 2, 2, 2, 3, 3, 2, 2, 2, 2]
  ],
  // Level 4: Wavy Neon Sine
  [
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [2, 1, 0, 0, 0, 0, 0, 0, 1, 2],
    [3, 2, 1, 0, 0, 0, 0, 1, 2, 3],
    [4, 3, 2, 1, 0, 0, 1, 2, 3, 4],
    [3, 2, 1, 0, 0, 0, 0, 1, 2, 3],
    [2, 1, 0, 0, 0, 0, 0, 0, 1, 2],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 1]
  ]
];

// Tailored brick colors based on health/type
const BRICK_STYLE = {
  1: { color: 'hsl(328, 100%, 54%)', label: 'normal' },     // Pink
  2: { color: 'hsl(195, 100%, 50%)', label: 'hard' },       // Cyan/Blue
  3: { color: 'hsl(0, 100%, 55%)', label: 'explosive' },    // Orange/Red
  4: { color: 'hsl(48, 100%, 50%)', label: 'mystery' }      // Gold
};

// --- Initialization ---
window.addEventListener('DOMContentLoaded', () => {
  canvas = document.getElementById('gameCanvas');
  ctx = canvas.getContext('2d');

  setupDomEventListeners();
  updateHud();

  // Resize listener to match proper responsive bounding box
  window.addEventListener('resize', handleCanvasSizing);
  handleCanvasSizing();

  // Run the core animation loop
  let lastTime = 0;
  function gameLoop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    let deltaTime = timestamp - lastTime;
    
    // Avoid massive delta frame jumps (e.g. if tab goes idle)
    if (deltaTime > 100) deltaTime = 16.66;
    
    lastTime = timestamp;
    
    update(deltaTime);
    draw();
    
    requestAnimationFrame(gameLoop);
  }
  requestAnimationFrame(gameLoop);
});

// Calculate responsive mouse interactions on canvas scaling
function handleCanvasSizing() {
  const rect = canvas.getBoundingClientRect();
  // Simply captures physical dimension ratios
}

function setupDomEventListeners() {
  // Mouse controls: track position relative to canvas
  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = CANVAS_WIDTH / rect.width;
    mouseX = (e.clientX - rect.left) * scaleX;
    paddle.targetX = mouseX - paddle.width / 2;
  });

  // Mouse click to launch ball / fire laser
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) { // Left click
      triggerLaunchOrFire();
    }
  });

  // Keyboard controls for keyboard fallbacks and Pause
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' || e.key.toLowerCase() === 'p') {
      togglePause();
    }
    // Debug helper: skip levels (disabled in production, but let's keep it safe)
    if (e.key === ']' && gameState === GameState.PLAYING) {
      handleLevelCompleted();
    }
  });

  // Buttons Click Triggers
  document.getElementById('start-game-btn').addEventListener('click', startGame);
  document.getElementById('restart-game-btn').addEventListener('click', restartGame);
  document.getElementById('resume-btn').addEventListener('click', togglePause);
  document.getElementById('restart-from-pause-btn').addEventListener('click', () => {
    togglePause();
    restartGame();
  });
  document.getElementById('next-level-btn').addEventListener('click', startNextLevelSequence);
  
  // Header Controllers
  document.getElementById('pause-btn').addEventListener('click', togglePause);
  
  const muteBtn = document.getElementById('mute-btn');
  muteBtn.addEventListener('click', () => {
    synth.isMuted = !synth.isMuted;
    const icon = document.getElementById('volume-icon');
    if (synth.isMuted) {
      muteBtn.classList.add('muted');
      icon.innerHTML = '<path fill="currentColor" d="M12,4L9.91,6.09L12,8.18M19,12C19,10.06 17.91,8.37 16.32,7.5L14.88,8.94C16.14,9.5 17,10.65 17,12C17,13.06 16.4,13.97 15.54,14.43L17,15.89C18.22,14.95 19,13.57 19,12M3.27,3L2,4.27L7.73,10H3V16H7L12,21V14.27L17.73,20L19,18.73L3.27,3M12,4V6.73L9.58,9.15L12,11.57V4Z" />';
    } else {
      muteBtn.classList.remove('muted');
      icon.innerHTML = '<path fill="currentColor" d="M14,3.23V5.29C16.89,6.15 19,8.83 19,12C19,15.17 16.89,17.85 14,18.71V20.77C18.03,19.86 21,16.28 21,12C21,7.72 18.03,4.14 14,3.23M16.5,12C16.5,10.23 15.5,8.71 14,7.97V16C15.5,15.29 16.5,13.77 16.5,12M3,9V15H7L12,20V4L7,9H3Z" />';
      synth.init();
      synth.playOscillator(440, 660, 'sine', 0.1, 0.05);
    }
  });
}

function triggerLaunchOrFire() {
  if (gameState !== GameState.PLAYING) return;
  synth.init();

  // 1. Launch any attached balls
  let launched = false;
  balls.forEach(ball => {
    if (ball.attached) {
      ball.attached = false;
      const angle = (Math.random() * 60 - 30) * Math.PI / 180; // random launch angle deviation
      ball.vx = Math.sin(angle) * ball.baseSpeed;
      ball.vy = -Math.cos(angle) * ball.baseSpeed;
      launched = true;
    }
  });

  if (launched) {
    synth.playPaddleHit();
    return;
  }

  // 2. Fire Lasers if active
  if (paddle.laserActive && paddle.laserCooldown <= 0) {
    lasers.push({ x: paddle.x + 10, y: paddle.y - 10, vy: -12, active: true });
    lasers.push({ x: paddle.x + paddle.width - 10, y: paddle.y - 10, vy: -12, active: true });
    paddle.laserCooldown = 280; // cooldown in ms
    synth.playLaser();
    triggerScreenShake(3, 40);
  }
}

// --- Screen Shake Controller ---
function triggerScreenShake(intensity, duration) {
  shakeIntensity = intensity;
  shakeTimer = duration;
}

// --- HUD Panels Updater ---
function updateHud() {
  document.getElementById('hud-score').textContent = score.toString().padStart(6, '0');
  document.getElementById('hud-highscore').textContent = highscore.toString().padStart(6, '0');
  document.getElementById('hud-level').textContent = `LV.${level.toString().padStart(2, '0')}`;
  
  // Render Hearts
  const hearts = document.querySelectorAll('.lives-container .heart');
  hearts.forEach((heart, idx) => {
    if (idx < lives) {
      heart.classList.add('active');
    } else {
      heart.classList.remove('active');
    }
  });

  // Combo HUD Display
  const hudCombo = document.getElementById('hud-combo');
  hudCombo.textContent = `${combo.toFixed(1)}x`;
  
  // Color combo text as it builds
  if (combo >= 3.0) {
    hudCombo.className = 'combo-val neon-pink';
  } else if (combo >= 2.0) {
    hudCombo.className = 'combo-val neon-cyan';
  } else {
    hudCombo.className = 'combo-val';
  }

  // Active Power-ups Bar
  const container = document.getElementById('active-powerups-container');
  container.innerHTML = '';
  
  let activeCount = 0;
  const powerupLabels = [
    { cond: paddle.laserActive, type: 'LASER', badge: 'L', color: 'fill-red', timer: paddle.laserTimer, max: 10000 },
    { cond: paddle.width > paddle.baseWidth, type: 'EXPAND', badge: 'W', color: 'fill-blue', timer: paddle.expandTimer, max: 10000 },
    { cond: paddle.sticky, type: 'STICKY', badge: 'S', color: 'fill-gold', timer: 1, max: 1 }, // infinite until used or life lost
    { cond: shieldActive, type: 'SHIELD', badge: 'G', color: 'fill-purple', timer: 1, max: 1 } // infinite until hit
  ];

  powerupLabels.forEach(p => {
    if (p.cond) {
      activeCount++;
      const item = document.createElement('div');
      item.className = 'powerup-active-item';
      
      const badgeClass = p.type === 'LASER' ? 'badge-red' : 
                         p.type === 'EXPAND' ? 'badge-blue' : 
                         p.type === 'STICKY' ? 'badge-gold' : 'badge-purple';

      const pct = p.max === 1 ? 100 : Math.max(0, (p.timer / p.max) * 100);

      item.innerHTML = `
        <span class="badge ${badgeClass}">${p.badge}</span>
        <div class="powerup-progress">
          <div class="powerup-progress-fill ${p.color}" style="width: ${pct}%;"></div>
        </div>
      `;
      container.appendChild(item);
    }
  });

  if (activeCount === 0) {
    container.innerHTML = '<div class="no-powerups">目前無啟用道具</div>';
  }
}

// --- Menu Overlays Toggler ---
function showOverlay(id) {
  document.querySelectorAll('.overlay').forEach(el => el.classList.remove('active'));
  if (id) {
    document.getElementById(id).classList.add('active');
  }
}

// --- Game Control Actions ---
function startGame() {
  synth.init();
  showOverlay(null);
  gameState = GameState.PLAYING;
  resetGameStats();
  initLevel(level);
  synth.playPowerup();
  synth.startRockMusic();
}

function restartGame() {
  level = 1;
  score = 0;
  lives = maxLives;
  speedFactor = 1.0;
  resetGameStats();
  showOverlay(null);
  gameState = GameState.PLAYING;
  initLevel(1);
  synth.playPowerup();
  synth.startRockMusic();
}

function togglePause() {
  if (gameState === GameState.PLAYING) {
    gameState = GameState.PAUSED;
    showOverlay('overlay-pause');
    synth.stopRockMusic();
  } else if (gameState === GameState.PAUSED) {
    gameState = GameState.PLAYING;
    showOverlay(null);
    synth.init();
    synth.startRockMusic();
  }
}

function resetGameStats() {
  consecutiveHits = 0;
  combo = 1.0;
  comboTimer = 0;
  maxComboInLevel = 1.0;
}

// --- Brick Creator & Generator ---
function initLevel(lvlNum) {
  bricks = [];
  balls = [];
  powerups = [];
  lasers = [];
  particles = [];
  shieldActive = false;
  
  paddle.width = paddle.baseWidth;
  paddle.sticky = false;
  paddle.laserActive = false;
  paddle.laserTimer = 0;
  paddle.expandTimer = 0;

  // Level statistics resets
  bricksBrokenThisLevel = 0;
  totalPaddleHits = 0;
  accuratePaddleHits = 0;
  consecutiveHits = 0;
  combo = 1.0;
  
  // Calculate Difficulty Scaling factor (increases by 8% per level)
  speedFactor = 1.0 + (lvlNum - 1) * 0.08;

  // Get or Generate Grid Matrix
  let layout;
  if (lvlNum <= LEVELS.length) {
    layout = LEVELS[lvlNum - 1];
  } else {
    layout = generateProceduralLayout(lvlNum);
  }

  // Layout sizing parameters
  const rows = layout.length;
  const cols = layout[0].length;
  
  const topOffset = 80;
  const padding = 10;
  const sideOffset = 40;
  const widthAvailable = CANVAS_WIDTH - (sideOffset * 2);
  const brickWidth = (widthAvailable - (padding * (cols - 1))) / cols;
  const brickHeight = 22;

  totalBricksCount = 0;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const type = layout[r][c];
      if (type > 0) {
        const x = sideOffset + c * (brickWidth + padding);
        const y = topOffset + r * (brickHeight + padding);
        const style = BRICK_STYLE[type];
        
        let hp = 1;
        if (type === 2) hp = 2 + Math.floor(lvlNum / 4); // Reinforced gets stronger

        bricks.push({
          x: x,
          y: y,
          width: brickWidth,
          height: brickHeight,
          type: type,
          hp: hp,
          maxHp: hp,
          color: style.color,
          active: true,
          row: r,
          col: c,
          // Moving brick feature for Level 5+
          vx: (lvlNum >= 5 && r % 2 === 0) ? (Math.random() > 0.5 ? 0.02 * lvlNum : -0.02 * lvlNum) : 0
        });

        if (type !== 3) { // Explosive bricks are easy 1-hits, but count in clearing
          totalBricksCount++;
        }
      }
    }
  }

  // Initialize standard first ball
  const ballSpeed = 5 * speedFactor;
  balls.push({
    x: CANVAS_WIDTH / 2,
    y: paddle.y - 12,
    vx: 0,
    vy: 0,
    radius: 9,
    baseSpeed: ballSpeed,
    attached: true,
    trail: []
  });

  updateHud();
}

// Procedural infinite level layout generator
function generateProceduralLayout(lvlNum) {
  const rows = 4 + Math.min(4, Math.floor(lvlNum / 3));
  const cols = 10;
  const matrix = [];

  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) {
      const rand = Math.random();
      if (rand < 0.15) {
        row.push(0); // empty block
      } else if (rand < 0.55) {
        row.push(1); // normal
      } else if (rand < 0.75) {
        row.push(2); // reinforced
      } else if (rand < 0.88) {
        row.push(3); // explosive
      } else {
        row.push(4); // mystery powerup
      }
    }
    matrix.push(row);
  }
  return matrix;
}

function startNextLevelSequence() {
  showOverlay(null);
  gameState = GameState.PLAYING;
  initLevel(level);
  synth.startRockMusic();
}

// --- Particles System Generator ---
function spawnExplosionParticles(x, y, color, count = 12) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1.5 + Math.random() * 3.5;
    particles.push({
      x: x,
      y: y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      color: color,
      radius: 2 + Math.random() * 3,
      alpha: 1.0,
      decay: 0.015 + Math.random() * 0.02
    });
  }
}

// --- Engine Update Tick ---
function update(dt) {
  if (gameState !== GameState.PLAYING) return;

  // 1. Decelerate timers
  if (paddle.laserActive) {
    paddle.laserTimer -= dt;
    if (paddle.laserTimer <= 0) {
      paddle.laserActive = false;
      updateHud();
    }
  }

  if (paddle.laserCooldown > 0) {
    paddle.laserCooldown -= dt;
  }

  if (paddle.width > paddle.baseWidth) {
    paddle.expandTimer -= dt;
    if (paddle.expandTimer <= 0) {
      paddle.width = paddle.baseWidth;
      updateHud();
    }
  }

  // Combo timer decay
  if (consecutiveHits > 0) {
    comboTimer -= dt;
    // Calculate combo fill percentage
    const fillBar = document.getElementById('hud-combo-progress');
    if (fillBar) {
      fillBar.style.width = `${Math.max(0, (comboTimer / COMBO_MAX_DURATION) * 100)}%`;
    }

    if (comboTimer <= 0) {
      consecutiveHits = 0;
      combo = 1.0;
      updateHud();
    }
  }

  // 2. Paddle Movement & Mouse tracking
  // Direct positioning bounded inside borders
  paddle.x = Math.max(10, Math.min(CANVAS_WIDTH - paddle.width - 10, paddle.targetX));

  // 3. Update active Lasers
  for (let i = lasers.length - 1; i >= 0; i--) {
    const l = lasers[i];
    l.y += l.vy;
    
    // Boundary check
    if (l.y < 0) {
      lasers.splice(i, 1);
      continue;
    }

    // Collision checking against Bricks
    for (let j = bricks.length - 1; j >= 0; j--) {
      const b = bricks[j];
      if (b.active && 
          l.x > b.x && l.x < b.x + b.width &&
          l.y > b.y && l.y < b.y + b.height) {
        
        l.active = false;
        damageBrick(b);
        lasers.splice(i, 1);
        break;
      }
    }
  }

  // 4. Update Balls (with collision checking)
  let activeBallsCount = 0;
  
  balls.forEach(ball => {
    if (ball.attached) {
      // Pin to paddle center
      ball.x = paddle.x + paddle.width / 2;
      ball.y = paddle.y - ball.radius;
      activeBallsCount++;
      return;
    }

    // Add coordinate to trail
    ball.trail.push({ x: ball.x, y: ball.y });
    if (ball.trail.length > 8) ball.trail.shift();

    // Physics step
    ball.x += ball.vx;
    ball.y += ball.vy;
    activeBallsCount++;

    // Wall bounces
    // Side Walls
    if (ball.x - ball.radius < 10) {
      ball.x = 10 + ball.radius;
      ball.vx = -ball.vx;
      synth.playHit(false);
      spawnExplosionParticles(ball.x - ball.radius, ball.y, '#fff', 3);
    } else if (ball.x + ball.radius > CANVAS_WIDTH - 10) {
      ball.x = CANVAS_WIDTH - 10 - ball.radius;
      ball.vx = -ball.vx;
      synth.playHit(false);
      spawnExplosionParticles(ball.x + ball.radius, ball.y, '#fff', 3);
    }

    // Top ceiling
    if (ball.y - ball.radius < 45) {
      ball.y = 45 + ball.radius;
      ball.vy = -ball.vy;
      synth.playHit(false);
      spawnExplosionParticles(ball.x, ball.y - ball.radius, '#fff', 3);
    }

    // Bottom out-of-bounds check (Life lost condition)
    if (ball.y - ball.radius > CANVAS_HEIGHT) {
      ball.active = false; // flag to remove
      return;
    }

    // Shield/Floor bounce
    if (shieldActive && ball.y + ball.radius >= 580) {
      ball.vy = -Math.abs(ball.vy);
      ball.y = 580 - ball.radius;
      shieldActive = false; // energy shield consumed
      synth.playPaddleHit();
      triggerScreenShake(8, 250);
      spawnExplosionParticles(ball.x, 580, 'hsl(280, 100%, 60%)', 25);
      updateHud();
    }

    // 5. Ball colliding with Paddle
    if (ball.y + ball.radius >= paddle.y && 
        ball.y - ball.radius <= paddle.y + paddle.height &&
        ball.x + ball.radius >= paddle.x && 
        ball.x - ball.radius <= paddle.x + paddle.width) {
      
      totalPaddleHits++;

      // Check for sticky catch
      if (paddle.sticky) {
        ball.attached = true;
        ball.vx = 0;
        ball.vy = 0;
        synth.playPaddleHit();
        return;
      }

      // Rebound math: angle scales depending on displacement from paddle center
      const centerDist = ball.x - (paddle.x + paddle.width / 2);
      const normalizedDist = centerDist / (paddle.width / 2); // value -1 to 1
      
      // Target reflective angle (max 65 degrees deflection)
      const maxReflectionAngle = 65 * Math.PI / 180;
      const targetAngle = normalizedDist * maxReflectionAngle;

      const speed = ball.baseSpeed;
      ball.vx = speed * Math.sin(targetAngle);
      ball.vy = -speed * Math.cos(targetAngle);
      
      // Safe override to prevent flat horizontal lockups
      if (Math.abs(ball.vy) < 1.5) {
        ball.vy = -1.5;
      }

      // Force push upwards slightly to resolve overlapping/clipping
      ball.y = paddle.y - ball.radius;

      synth.playPaddleHit();
      spawnExplosionParticles(ball.x, paddle.y, '#fff', 5);
      
      // Successful paddle recovery builds combo slightly (protect active combo)
      if (consecutiveHits > 0) {
        comboTimer = COMBO_MAX_DURATION; // reset combo timer
      }
    }

    // 6. Ball colliding with Bricks
    for (let i = 0; i < bricks.length; i++) {
      const b = bricks[i];
      if (!b.active) continue;

      // Circle to AABB Box collision
      // Closest coordinates on brick to ball center
      const closestX = Math.max(b.x, Math.min(ball.x, b.x + b.width));
      const closestY = Math.max(b.y, Math.min(ball.y, b.y + b.height));

      const distSq = (ball.x - closestX) ** 2 + (ball.y - closestY) ** 2;

      if (distSq < ball.radius ** 2) {
        // Reflection physics: find axis of impact
        const diffX = ball.x - closestX;
        const diffY = ball.y - closestY;

        if (Math.abs(diffX) > Math.abs(diffY)) {
          // Bounced from side
          ball.vx = diffX > 0 ? Math.abs(ball.vx) : -Math.abs(ball.vx);
        } else {
          // Bounced from top/bottom
          ball.vy = diffY > 0 ? Math.abs(ball.vy) : -Math.abs(ball.vy);
        }

        // Damage the hit brick
        damageBrick(b);
        accuratePaddleHits++;
        break; // resolve only 1 hit per frame per ball
      }
    }
  });

  // Filter out fallen balls
  balls = balls.filter(b => b.active !== false);

  // If no balls are remaining, player loses a life!
  if (balls.length === 0) {
    handleLifeLost();
  }

  // 7. Power-ups movement & capture
  for (let i = powerups.length - 1; i >= 0; i--) {
    const p = powerups[i];
    p.y += p.vy;

    // Outer boundaries
    if (p.y > CANVAS_HEIGHT) {
      powerups.splice(i, 1);
      continue;
    }

    // Capture by Paddle
    if (p.y + p.radius >= paddle.y && 
        p.y - p.radius <= paddle.y + paddle.height &&
        p.x + p.radius >= paddle.x && 
        p.x - p.radius <= paddle.x + paddle.width) {
      
      collectPowerup(p.type);
      powerups.splice(i, 1);
      synth.playPowerup();
    }
  }

  // 8. Update floating particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.alpha -= p.decay;

    if (p.alpha <= 0) {
      particles.splice(i, 1);
    }
  }

  // 9. Update Moving Bricks (Level 5+ features)
  bricks.forEach(b => {
    if (b.active && b.vx !== 0) {
      b.x += b.vx;
      // Bounce bricks off walls
      if (b.x <= 15 || b.x + b.width >= CANVAS_WIDTH - 15) {
        b.vx = -b.vx;
      }
    }
  });

  // 10. Check if all standard bricks are broken (Level Win Condition)
  const remainingTargetBricks = bricks.filter(b => b.active && b.type !== 3).length;
  if (remainingTargetBricks === 0 && totalBricksCount > 0) {
    handleLevelCompleted();
  }
}

// --- Damage / Break Brick Trigger ---
function damageBrick(brick) {
  brick.hp--;
  
  // Scoring Math (multiplied by combo factor)
  const basePoint = brick.type === 2 ? 150 : 100;
  const reward = Math.round(basePoint * combo);
  score += reward;

  // Build Combo Multiplier
  consecutiveHits++;
  comboTimer = COMBO_MAX_DURATION;
  combo = 1.0 + (consecutiveHits * 0.1);
  if (combo > maxComboInLevel) maxComboInLevel = combo;

  updateHud();

  if (brick.hp <= 0) {
    brick.active = false;
    bricksBrokenThisLevel++;
    
    // Spark animation
    spawnExplosionParticles(brick.x + brick.width/2, brick.y + brick.height/2, brick.color, 16);
    
    // Audio trigger
    synth.playHit(brick.type === 2);

    // 1. Explosive bricks detonate chain reactions!
    if (brick.type === 3) {
      triggerExplosionDetonation(brick);
    }

    // 2. Power-up Drop calculations
    // Guaranteed on Mystery brick (4), random 15% on normal bricks (1, 2)
    const powerupChance = brick.type === 4 ? 1.0 : 0.15;
    if (Math.random() < powerupChance) {
      spawnPowerup(brick.x + brick.width / 2, brick.y + brick.height);
    }
  } else {
    // Standard hit (cracked animation refresh)
    spawnExplosionParticles(brick.x + brick.width/2, brick.y + brick.height/2, brick.color, 4);
    synth.playHit(true);
  }
}

function triggerExplosionDetonation(expBrick) {
  synth.playExplosion();
  triggerScreenShake(12, 300);

  const radius = 90; // explosion sweep area
  const expCenterX = expBrick.x + expBrick.width / 2;
  const expCenterY = expBrick.y + expBrick.height / 2;

  // Render temporary shockwave ring
  particles.push({
    x: expCenterX,
    y: expCenterY,
    vx: 0,
    vy: 0,
    color: 'rgba(255, 100, 0, 0.4)',
    radius: 10,
    alpha: 1.0,
    decay: 0.05 // rapid decay
  });

  bricks.forEach(b => {
    if (b.active) {
      const bCenterX = b.x + b.width / 2;
      const bCenterY = b.y + b.height / 2;
      const dist = Math.hypot(bCenterX - expCenterX, bCenterY - expCenterY);
      
      if (dist <= radius) {
        // Damage neighboring blocks!
        setTimeout(() => {
          damageBrick(b);
        }, 80); // slight sequential delay for juicy ripple effect
      }
    }
  });
}

function spawnPowerup(x, y) {
  const types = ['MULTIBALL', 'LASER', 'EXPAND', 'STICKY', 'SHIELD'];
  const type = types[Math.floor(Math.random() * types.length)];
  
  const colors = {
    'MULTIBALL': 'hsl(140, 100%, 50%)', // Green
    'LASER': 'hsl(0, 100%, 55%)',       // Red
    'EXPAND': 'hsl(195, 100%, 50%)',     // Blue
    'STICKY': 'hsl(48, 100%, 50%)',     // Gold
    'SHIELD': 'hsl(280, 100%, 60%)'     // Purple
  };

  powerups.push({
    x: x,
    y: y,
    vy: 2.2, // vertical fall speed
    type: type,
    color: colors[type],
    radius: 12,
    active: true
  });
}

function collectPowerup(type) {
  synth.playPowerup();
  
  if (type === 'MULTIBALL') {
    // Add two extra balls scaling off existing active balls
    const originalCount = balls.length;
    for (let i = 0; i < Math.min(originalCount, 2); i++) {
      const parentBall = balls[i];
      const speed = parentBall.baseSpeed;
      
      balls.push({
        x: parentBall.x,
        y: parentBall.y,
        vx: speed * Math.sin(Math.random() * 2 - 1),
        vy: -speed * Math.cos(Math.random() * 0.5),
        radius: parentBall.radius,
        baseSpeed: speed,
        attached: false,
        trail: []
      });
      balls.push({
        x: parentBall.x,
        y: parentBall.y,
        vx: speed * Math.sin(Math.random() * 2 - 1),
        vy: speed * Math.cos(Math.random() * 0.5),
        radius: parentBall.radius,
        baseSpeed: speed,
        attached: false,
        trail: []
      });
    }
  } else if (type === 'LASER') {
    paddle.laserActive = true;
    paddle.laserTimer = 10000; // 10 seconds duration
  } else if (type === 'EXPAND') {
    paddle.width = paddle.baseWidth * 1.5; // wider paddle
    paddle.expandTimer = 10000; // 10 seconds
  } else if (type === 'STICKY') {
    paddle.sticky = true;
  } else if (type === 'SHIELD') {
    shieldActive = true;
  }

  updateHud();
}

// --- Lose Life and Respawn Mechanics ---
function handleLifeLost() {
  lives--;
  synth.playLoseLife();
  triggerScreenShake(15, 400);

  // Clear combos
  resetGameStats();
  updateHud();

  if (lives <= 0) {
    handleGameOver();
  } else {
    // Respawn one ball attached to paddle
    const ballSpeed = 5 * speedFactor;
    balls.push({
      x: paddle.x + paddle.width / 2,
      y: paddle.y - 12,
      vx: 0,
      vy: 0,
      radius: 9,
      baseSpeed: ballSpeed,
      attached: true,
      trail: []
    });
  }
}

// --- High Score Keepers ---
function handleGameOver() {
  gameState = GameState.GAMEOVER;
  
  if (score > highscore) {
    highscore = score;
    localStorage.setItem('neon_highscore', highscore);
  }

  document.getElementById('final-score').textContent = score.toString().padStart(6, '0');
  document.getElementById('final-highscore').textContent = highscore.toString().padStart(6, '0');
  document.getElementById('final-level').textContent = level;

  showOverlay('overlay-game-over');
  synth.playGameOver();
  synth.stopRockMusic();
}

function handleLevelCompleted() {
  gameState = GameState.LEVEL_COMPLETE;
  
  // Math for stats panel evaluation
  const accuracy = totalPaddleHits > 0 ? Math.round((accuratePaddleHits / totalPaddleHits) * 100) : 100;
  
  document.getElementById('stat-combo').textContent = `${maxComboInLevel.toFixed(1)}x`;
  document.getElementById('stat-accuracy').textContent = `${accuracy}%`;
  document.getElementById('stat-points').textContent = score;
  document.getElementById('level-clear-title').textContent = `關卡 ${level} 已完成！`;

  // Increase global level tier
  level++;

  showOverlay('overlay-level-clear');
  synth.playLevelClear();
  synth.stopRockMusic();
}

// --- Render Core Loop ---
function draw() {
  ctx.save();

  // Apply screen shake displacement
  if (shakeTimer > 0) {
    const dx = (Math.random() * 2 - 1) * shakeIntensity;
    const dy = (Math.random() * 2 - 1) * shakeIntensity;
    ctx.translate(dx, dy);
    shakeTimer -= 16.66; // decrement by roughly 1 frame time
  }

  // Clear Canvas (with dark space vacuum color)
  ctx.fillStyle = '#05060c';
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // Draw Header Border Glow
  ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.fillRect(0, 0, CANVAS_WIDTH, 45);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, 45);
  ctx.lineTo(CANVAS_WIDTH, 45);
  ctx.stroke();

  // Draw Arena Sidewalls Glow
  ctx.strokeStyle = 'rgba(0, 204, 255, 0.15)';
  ctx.beginPath();
  ctx.moveTo(10, 45);
  ctx.lineTo(10, CANVAS_HEIGHT);
  ctx.moveTo(CANVAS_WIDTH - 10, 45);
  ctx.lineTo(CANVAS_WIDTH - 10, CANVAS_HEIGHT);
  ctx.stroke();

  // 1. Render Active Shield Energy Floor
  if (shieldActive) {
    ctx.save();
    ctx.shadowBlur = 15;
    ctx.shadowColor = 'hsl(280, 100%, 60%)';
    ctx.strokeStyle = 'hsl(280, 100%, 60%)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(10, 580);
    ctx.lineTo(CANVAS_WIDTH - 10, 580);
    ctx.stroke();
    ctx.restore();
  }

  // 2. Render Bricks
  bricks.forEach(b => {
    if (!b.active) return;

    ctx.save();
    
    // Brick Core Gradient fills
    const grad = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.height);
    grad.addColorStop(0, b.color);
    grad.addColorStop(1, '#05060c');
    
    ctx.fillStyle = grad;
    ctx.strokeStyle = b.color;
    ctx.lineWidth = 1.5;
    
    // Draw rounded rect corners
    drawRoundedRect(ctx, b.x, b.y, b.width, b.height, 4);
    ctx.fill();
    ctx.stroke();

    // Specific layouts for hard or explosive bricks
    if (b.type === 2) {
      // Reinforced metallic cracks
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 1;
      
      // Cracking patterns based on remaining health percentage
      if (b.hp < b.maxHp) {
        ctx.beginPath();
        ctx.moveTo(b.x + 5, b.y + 5);
        ctx.lineTo(b.x + b.width/2, b.y + b.height/2);
        ctx.lineTo(b.x + b.width - 8, b.y + 4);
        if (b.hp === 1) { // severe crack
          ctx.moveTo(b.x + b.width/2, b.y + b.height/2);
          ctx.lineTo(b.x + 10, b.y + b.height - 5);
        }
        ctx.stroke();
      }
    } else if (b.type === 3) {
      // Explosive warning core glow
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(b.x + b.width/2, b.y + b.height/2, 4, 0, Math.PI*2);
      ctx.fill();
    } else if (b.type === 4) {
      // Mystery Question indicator symbol
      ctx.font = 'bold 12px Orbitron';
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('?', b.x + b.width/2, b.y + b.height/2 + 1);
    }

    ctx.restore();
  });

  // 3. Render Floating Power-ups
  powerups.forEach(p => {
    ctx.save();
    ctx.shadowBlur = 12;
    ctx.shadowColor = p.color;
    ctx.fillStyle = p.color;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;

    // Draw stylized hexagonal capsules
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Central letter badge indicators
    ctx.font = '900 10px Orbitron';
    ctx.fillStyle = '#000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    let text = 'P';
    if (p.type === 'MULTIBALL') text = '3';
    if (p.type === 'LASER') text = 'L';
    if (p.type === 'EXPAND') text = 'W';
    if (p.type === 'STICKY') text = 'S';
    if (p.type === 'SHIELD') text = 'G';

    ctx.fillText(text, p.x, p.y + 1);
    ctx.restore();
  });

  // 4. Render Active Lasers
  ctx.save();
  lasers.forEach(l => {
    ctx.shadowBlur = 12;
    ctx.shadowColor = 'hsl(0, 100%, 55%)';
    ctx.strokeStyle = 'hsl(0, 100%, 55%)';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(l.x, l.y);
    ctx.lineTo(l.x, l.y + 15);
    ctx.stroke();
  });
  ctx.restore();

  // 5. Render Particle sparks
  particles.forEach(p => {
    ctx.save();
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });

  // 6. Render Paddle (Retro glowing cylinder capsule)
  ctx.save();
  ctx.shadowBlur = 12;
  const paddleGlow = paddle.laserActive ? 'hsl(0, 100%, 55%)' : 
                     paddle.sticky ? 'hsl(48, 100%, 50%)' : 'hsl(195, 100%, 50%)';
  ctx.shadowColor = paddleGlow;

  // Double Gradient Fill for high dimensional look
  const paddleGrad = ctx.createLinearGradient(paddle.x, paddle.y, paddle.x, paddle.y + paddle.height);
  paddleGrad.addColorStop(0, paddleGlow);
  paddleGrad.addColorStop(0.5, '#fff');
  paddleGrad.addColorStop(1, '#05060c');
  
  ctx.fillStyle = paddleGrad;
  ctx.strokeStyle = paddleGlow;
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, paddle.x, paddle.y, paddle.width, paddle.height, 9);
  ctx.fill();
  ctx.stroke();

  // Laser emitter turrets overlay if Laser is active
  if (paddle.laserActive) {
    ctx.fillStyle = '#ff1e1e';
    ctx.fillRect(paddle.x + 5, paddle.y - 4, 8, 4);
    ctx.fillRect(paddle.x + paddle.width - 13, paddle.y - 4, 8, 4);
  }
  ctx.restore();

  // 7. Render Balls
  balls.forEach(ball => {
    // Render Trail elements
    ball.trail.forEach((pos, idx) => {
      ctx.save();
      const alpha = (idx + 1) / (ball.trail.length * 4); // smooth fade
      ctx.globalAlpha = alpha;
      ctx.fillStyle = 'hsl(195, 100%, 50%)';
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, ball.radius * 0.8, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    });

    // Render Ball Core
    ctx.save();
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#00ccff';
    
    const ballGrad = ctx.createRadialGradient(ball.x - 2, ball.y - 2, 1, ball.x, ball.y, ball.radius);
    ballGrad.addColorStop(0, '#ffffff');
    ballGrad.addColorStop(0.3, '#00ccff');
    ballGrad.addColorStop(1, '#0055ff');

    ctx.fillStyle = ballGrad;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });

  ctx.restore();
}

// Rounded rectangles rendering helpers
function drawRoundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}
