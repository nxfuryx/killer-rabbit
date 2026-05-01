// ============================================================
//  Killer Rabbit – single-player wave shooter
//  Controls: WASD / Arrow keys to move, Mouse to aim & shoot
// ============================================================

const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');

// ---------- canvas sizing ----------
const W = 900;
const H = 650;
canvas.width  = W;
canvas.height = H;

// ============================================================
//  Helpers
// ============================================================
function rand(min, max) { return Math.random() * (max - min) + min; }
function dist(a, b)     { return Math.hypot(a.x - b.x, a.y - b.y); }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// ============================================================
//  Input
// ============================================================
const keys   = {};
const mouse  = { x: W / 2, y: H / 2, down: false };

window.addEventListener('keydown',   e => { keys[e.code] = true; });
window.addEventListener('keyup',     e => { keys[e.code] = false; });
canvas.addEventListener('mousemove', e => {
  const r = canvas.getBoundingClientRect();
  mouse.x = e.clientX - r.left;
  mouse.y = e.clientY - r.top;
});
canvas.addEventListener('mousedown', e => { if (e.button === 0) mouse.down = true; });
canvas.addEventListener('mouseup',   e => { if (e.button === 0) mouse.down = false; });

// ============================================================
//  Constants
// ============================================================
const PLAYER_SPEED   = 220;   // px / s
const BULLET_SPEED   = 520;   // px / s
const BULLET_DAMAGE  = 35;
const FIRE_RATE      = 0.18;  // seconds between shots
const PLAYER_RADIUS  = 18;
const BULLET_RADIUS  = 5;

const ENEMY_TYPES = {
  skeleton: {
    color:      '#d4f0ff',
    outline:    '#8ec8e8',
    radius:     16,
    speed:      105,
    hp:         60,
    damage:     8,
    score:      10,
    label:      'SKELETON',
  },
  zombie: {
    color:      '#7ec86e',
    outline:    '#3a7a2a',
    radius:     20,
    speed:      60,
    hp:         180,
    damage:     15,
    score:      25,
    label:      'ZOMBIE',
  },
};

// ============================================================
//  State
// ============================================================
let state       = 'start';   // 'start' | 'play' | 'waveclear' | 'gameover'
let score       = 0;
let waveNumber  = 0;
let enemies     = [];
let bullets     = [];
let particles   = [];
let player;
let fireCooldown    = 0;
let waveClearTimer  = 0;
let damageFlash     = 0;

// ============================================================
//  Player
// ============================================================
function createPlayer() {
  return {
    x:      W / 2,
    y:      H / 2,
    vx:     0,
    vy:     0,
    angle:  0,
    hp:     100,
    maxHp:  100,
    radius: PLAYER_RADIUS,
    alive:  true,
    invincible: 0,
  };
}

// ============================================================
//  Bullets
// ============================================================
function spawnBullet(x, y, angle) {
  bullets.push({
    x,
    y,
    vx: Math.cos(angle) * BULLET_SPEED,
    vy: Math.sin(angle) * BULLET_SPEED,
    radius: BULLET_RADIUS,
    life: 1.6,   // seconds until auto-remove
  });
}

// ============================================================
//  Enemies
// ============================================================
function spawnEnemy(type) {
  const def = ENEMY_TYPES[type];
  // spawn just outside canvas borders
  let x, y;
  const side = Math.floor(rand(0, 4));
  if (side === 0) { x = rand(0, W);  y = -def.radius - 10; }
  else if (side === 1) { x = W + def.radius + 10; y = rand(0, H); }
  else if (side === 2) { x = rand(0, W);  y = H + def.radius + 10; }
  else               { x = -def.radius - 10; y = rand(0, H); }

  enemies.push({
    type,
    x,
    y,
    hp:     def.hp,
    maxHp:  def.hp,
    radius: def.radius,
    speed:  def.speed,
    damage: def.damage,
    score:  def.score,
    color:  def.color,
    outline:def.outline,
    label:  def.label,
    flash:  0,
  });
}

function waveEnemyCount(wave) {
  // each wave increases count; mix of types
  return {
    skeleton: 3 + wave * 2,
    zombie:   1 + Math.floor(wave * 0.8),
  };
}

function startWave() {
  waveNumber++;
  const counts = waveEnemyCount(waveNumber);
  const toSpawn = [];
  for (let i = 0; i < counts.skeleton; i++) toSpawn.push('skeleton');
  for (let i = 0; i < counts.zombie;   i++) toSpawn.push('zombie');

  // stagger spawning so they don't all arrive at once
  let delay = 0;
  toSpawn.forEach(type => {
    setTimeout(() => { if (state === 'play') spawnEnemy(type); }, delay);
    delay += rand(120, 350);
  });
}

// ============================================================
//  Particles
// ============================================================
function spawnParticles(x, y, color, count) {
  for (let i = 0; i < count; i++) {
    const angle = rand(0, Math.PI * 2);
    const speed = rand(40, 160);
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: rand(2, 5),
      color,
      life: rand(0.3, 0.9),
      maxLife: 0,  // set below
    });
    particles[particles.length - 1].maxLife = particles[particles.length - 1].life;
  }
}

// ============================================================
//  Update helpers
// ============================================================
function updatePlayer(dt) {
  if (!player.alive) return;

  let dx = 0, dy = 0;
  if (keys['KeyW'] || keys['ArrowUp'])    dy -= 1;
  if (keys['KeyS'] || keys['ArrowDown'])  dy += 1;
  if (keys['KeyA'] || keys['ArrowLeft'])  dx -= 1;
  if (keys['KeyD'] || keys['ArrowRight']) dx += 1;

  const len = Math.hypot(dx, dy);
  if (len > 0) { dx /= len; dy /= len; }

  player.x += dx * PLAYER_SPEED * dt;
  player.y += dy * PLAYER_SPEED * dt;
  player.x  = clamp(player.x, player.radius, W - player.radius);
  player.y  = clamp(player.y, player.radius, H - player.radius);

  player.angle = Math.atan2(mouse.y - player.y, mouse.x - player.x);

  if (player.invincible > 0) player.invincible -= dt;

  // shooting
  fireCooldown -= dt;
  if (mouse.down && fireCooldown <= 0) {
    fireCooldown = FIRE_RATE;
    const gunTip = 22;
    spawnBullet(
      player.x + Math.cos(player.angle) * gunTip,
      player.y + Math.sin(player.angle) * gunTip,
      player.angle
    );
  }
}

function updateBullets(dt) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0 || b.x < -20 || b.x > W + 20 || b.y < -20 || b.y > H + 20) {
      bullets.splice(i, 1);
    }
  }
}

function updateEnemies(dt) {
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];

    // move toward player
    const angle = Math.atan2(player.y - e.y, player.x - e.x);
    e.x += Math.cos(angle) * e.speed * dt;
    e.y += Math.sin(angle) * e.speed * dt;
    if (e.flash > 0) e.flash -= dt;

    // bullet collision
    for (let j = bullets.length - 1; j >= 0; j--) {
      const b = bullets[j];
      if (dist(e, b) < e.radius + b.radius) {
        e.hp   -= BULLET_DAMAGE;
        e.flash = 0.12;
        bullets.splice(j, 1);
        spawnParticles(b.x, b.y, e.color, 5);
        if (e.hp <= 0) {
          score += e.score;
          spawnParticles(e.x, e.y, e.color, 12);
          enemies.splice(i, 1);
          break;
        }
      }
    }
  }
}

function updatePlayerEnemyCollision() {
  if (!player.alive || player.invincible > 0) return;
  for (const e of enemies) {
    if (dist(player, e) < player.radius + e.radius - 4) {
      player.hp -= e.damage;
      player.invincible = 0.55;
      damageFlash = 0.2;
      if (player.hp <= 0) {
        player.hp    = 0;
        player.alive = false;
        spawnParticles(player.x, player.y, '#ff8888', 20);
        state = 'gameover';
      }
      break;
    }
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 1 - 4 * dt;
    p.vy *= 1 - 4 * dt;
    p.life -= dt;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

// ============================================================
//  Draw helpers
// ============================================================
function drawBackground() {
  // dark grass grid
  ctx.fillStyle = '#1a2a1a';
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = '#1f2f1f';
  ctx.lineWidth = 1;
  const gridSize = 50;
  for (let x = 0; x < W; x += gridSize) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let y = 0; y < H; y += gridSize) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
}

function drawRabbit(x, y, angle, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(angle + Math.PI / 2); // body faces movement direction

  const R = PLAYER_RADIUS;

  // body
  ctx.fillStyle   = '#e8e8e8';
  ctx.strokeStyle = '#aaa';
  ctx.lineWidth   = 2;
  ctx.beginPath();
  ctx.ellipse(0, 4, R * 0.75, R, 0, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();

  // head
  ctx.fillStyle   = '#f0f0f0';
  ctx.strokeStyle = '#bbb';
  ctx.beginPath();
  ctx.arc(0, -R * 0.65, R * 0.55, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();

  // left ear
  ctx.fillStyle   = '#f0f0f0';
  ctx.strokeStyle = '#bbb';
  ctx.beginPath();
  ctx.ellipse(-R * 0.35, -R * 1.5, R * 0.18, R * 0.55, -0.15, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
  // inner ear
  ctx.fillStyle = '#ffb6c1';
  ctx.beginPath();
  ctx.ellipse(-R * 0.35, -R * 1.5, R * 0.09, R * 0.35, -0.15, 0, Math.PI * 2);
  ctx.fill();

  // right ear
  ctx.fillStyle   = '#f0f0f0';
  ctx.strokeStyle = '#bbb';
  ctx.beginPath();
  ctx.ellipse(R * 0.35, -R * 1.5, R * 0.18, R * 0.55, 0.15, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#ffb6c1';
  ctx.beginPath();
  ctx.ellipse(R * 0.35, -R * 1.5, R * 0.09, R * 0.35, 0.15, 0, Math.PI * 2);
  ctx.fill();

  // eye
  ctx.fillStyle = '#ff2222';
  ctx.beginPath();
  ctx.arc(R * 0.22, -R * 0.72, 3, 0, Math.PI * 2);
  ctx.fill();

  // tail
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(0, R * 0.9, R * 0.22, 0, Math.PI * 2);
  ctx.fill();

  // gun (drawn at angle 0 = right in local space, then rotated to face mouse)
  ctx.restore();
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle); // gun always faces mouse
  ctx.fillStyle   = '#555';
  ctx.strokeStyle = '#333';
  ctx.lineWidth   = 2;
  ctx.beginPath();
  ctx.roundRect(8, -4, 20, 8, 2);
  ctx.fill(); ctx.stroke();
  // barrel highlight
  ctx.fillStyle = '#777';
  ctx.fillRect(22, -2, 6, 4);

  ctx.restore();
}

function drawSkeleton(e) {
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.globalAlpha = e.flash > 0 ? 0.5 : 1.0;

  const R = e.radius;

  // skull
  ctx.fillStyle   = e.flash > 0 ? '#ffffff' : e.color;
  ctx.strokeStyle = e.outline;
  ctx.lineWidth   = 2;
  ctx.beginPath();
  ctx.arc(0, -R * 0.5, R * 0.62, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();

  // eye sockets
  ctx.fillStyle = '#222';
  ctx.beginPath(); ctx.arc(-R * 0.22, -R * 0.55, R * 0.15, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc( R * 0.22, -R * 0.55, R * 0.15, 0, Math.PI * 2); ctx.fill();

  // body ribs
  ctx.strokeStyle = e.outline;
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 3; i++) {
    const yy = R * 0.1 + i * R * 0.28;
    ctx.beginPath();
    ctx.moveTo(-R * 0.5, yy); ctx.lineTo(R * 0.5, yy);
    ctx.stroke();
  }

  // spine
  ctx.beginPath(); ctx.moveTo(0, -R * 0.1); ctx.lineTo(0, R); ctx.stroke();

  // legs
  ctx.beginPath();
  ctx.moveTo(0, R * 0.8); ctx.lineTo(-R * 0.5, R * 1.4);
  ctx.moveTo(0, R * 0.8); ctx.lineTo( R * 0.5, R * 1.4);
  ctx.stroke();

  ctx.restore();
}

function drawZombie(e) {
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.globalAlpha = e.flash > 0 ? 0.5 : 1.0;

  const R = e.radius;

  // body
  ctx.fillStyle   = e.flash > 0 ? '#aaffaa' : e.color;
  ctx.strokeStyle = e.outline;
  ctx.lineWidth   = 2;
  ctx.beginPath();
  ctx.roundRect(-R * 0.6, -R * 0.6, R * 1.2, R * 1.6, 4);
  ctx.fill(); ctx.stroke();

  // head
  ctx.fillStyle   = e.flash > 0 ? '#ccffcc' : '#a0d890';
  ctx.beginPath();
  ctx.arc(0, -R * 0.85, R * 0.55, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();

  // eyes – hollow X
  ctx.strokeStyle = '#ff4444';
  ctx.lineWidth = 2;
  [[-R*0.22, -R*0.92], [R*0.22, -R*0.92]].forEach(([ex, ey]) => {
    const s = R * 0.12;
    ctx.beginPath();
    ctx.moveTo(ex-s, ey-s); ctx.lineTo(ex+s, ey+s);
    ctx.moveTo(ex+s, ey-s); ctx.lineTo(ex-s, ey+s);
    ctx.stroke();
  });

  // arms outstretched (zombie pose)
  ctx.strokeStyle = e.outline;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-R * 0.6, 0); ctx.lineTo(-R * 1.3, -R * 0.3);
  ctx.moveTo( R * 0.6, 0); ctx.lineTo( R * 1.3, -R * 0.3);
  ctx.stroke();

  // legs
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-R * 0.3, R); ctx.lineTo(-R * 0.5, R * 1.5);
  ctx.moveTo( R * 0.3, R); ctx.lineTo( R * 0.5, R * 1.5);
  ctx.stroke();

  ctx.restore();
}

function drawEnemyHealthBar(e) {
  if (e.hp >= e.maxHp) return;
  const bw = e.radius * 2.4;
  const bh = 4;
  const bx = e.x - bw / 2;
  const by = e.y - e.radius * 1.8;
  ctx.fillStyle = '#600';
  ctx.fillRect(bx, by, bw, bh);
  ctx.fillStyle = '#0f0';
  ctx.fillRect(bx, by, bw * (e.hp / e.maxHp), bh);
}

function drawBullets() {
  bullets.forEach(b => {
    ctx.save();
    ctx.fillStyle   = '#ffe566';
    ctx.strokeStyle = '#ff9900';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();

    // muzzle glow
    const grd = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.radius * 3);
    grd.addColorStop(0, 'rgba(255,230,50,0.4)');
    grd.addColorStop(1, 'rgba(255,150,0,0)');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.radius * 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

function drawParticles() {
  particles.forEach(p => {
    const t = p.life / p.maxLife;
    ctx.save();
    ctx.globalAlpha = t;
    ctx.fillStyle   = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius * t, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

function drawHUD() {
  // --- health bar ---
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(12, 12, 204, 22);
  ctx.fillStyle = '#600';
  ctx.fillRect(14, 14, 200, 18);
  ctx.fillStyle = player.hp > 40 ? '#22cc44' : '#ff4444';
  ctx.fillRect(14, 14, 200 * (player.hp / player.maxHp), 18);
  ctx.strokeStyle = '#888';
  ctx.lineWidth = 1;
  ctx.strokeRect(14, 14, 200, 18);

  ctx.fillStyle   = '#fff';
  ctx.font        = 'bold 12px Courier New';
  ctx.textBaseline = 'middle';
  ctx.fillText(`HP  ${player.hp} / ${player.maxHp}`, 18, 23);

  // --- score ---
  ctx.fillStyle    = '#ffe566';
  ctx.font         = 'bold 18px Courier New';
  ctx.textAlign    = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText(`SCORE  ${score}`, W - 14, 14);

  // --- wave ---
  ctx.fillStyle = '#8ec8e8';
  ctx.font      = 'bold 15px Courier New';
  ctx.textAlign = 'center';
  ctx.fillText(`WAVE  ${waveNumber}`, W / 2, 14);

  // --- enemies remaining ---
  ctx.fillStyle = '#ccc';
  ctx.font      = '13px Courier New';
  ctx.fillText(`ENEMIES  ${enemies.length}`, W / 2, 34);

  ctx.textAlign    = 'left';
  ctx.textBaseline = 'alphabetic';
}

function drawDamageFlash() {
  if (damageFlash <= 0) return;
  ctx.save();
  ctx.globalAlpha = damageFlash * 0.45;
  ctx.fillStyle   = '#ff0000';
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

// ============================================================
//  Screen helpers
// ============================================================
function drawPanel(title, lines, subColor) {
  ctx.fillStyle   = 'rgba(0,0,0,0.78)';
  ctx.fillRect(W/2 - 220, H/2 - 130, 440, 260);
  ctx.strokeStyle = '#888';
  ctx.lineWidth   = 2;
  ctx.strokeRect(W/2 - 220, H/2 - 130, 440, 260);

  ctx.textAlign   = 'center';
  ctx.font        = 'bold 36px Courier New';
  ctx.fillStyle   = subColor || '#ffe566';
  ctx.fillText(title, W/2, H/2 - 68);

  lines.forEach((line, i) => {
    ctx.font      = '18px Courier New';
    ctx.fillStyle = '#ddd';
    ctx.fillText(line, W/2, H/2 - 20 + i * 30);
  });

  ctx.textAlign = 'left';
}

function drawStartScreen() {
  drawBackground();

  // title
  ctx.textAlign = 'center';
  ctx.font      = 'bold 58px Courier New';
  ctx.fillStyle = '#ff4444';
  ctx.fillText('KILLER RABBIT', W/2, H/2 - 100);

  ctx.font      = 'bold 24px Courier New';
  ctx.fillStyle = '#ffe566';
  ctx.fillText('Waves of undead await…', W/2, H/2 - 45);

  ctx.font      = '18px Courier New';
  ctx.fillStyle = '#ccc';
  const lines = [
    'WASD / Arrow keys  ──  Move',
    'Mouse              ──  Aim',
    'Left Click (hold)  ──  Shoot',
  ];
  lines.forEach((l, i) => ctx.fillText(l, W/2, H/2 + 20 + i * 30));

  ctx.font      = 'bold 22px Courier New';
  ctx.fillStyle = '#fff';
  const blink = Math.floor(Date.now() / 600) % 2 === 0;
  if (blink) ctx.fillText('[ CLICK TO START ]', W/2, H/2 + 145);

  ctx.textAlign = 'left';
}

function drawWaveClearScreen() {
  drawPanel(
    `WAVE  ${waveNumber - 1}  CLEARED!`,
    [`SCORE: ${score}`, `Next wave in…  ${Math.ceil(waveClearTimer)}s`],
    '#22cc44'
  );
}

function drawGameOverScreen() {
  drawPanel(
    'YOU DIED',
    [`WAVE REACHED: ${waveNumber}`, `FINAL SCORE: ${score}`, 'Click to restart'],
    '#ff4444'
  );
}

// ============================================================
//  Main game loop
// ============================================================
let lastTime = 0;

function loop(timestamp) {
  const dt = Math.min((timestamp - lastTime) / 1000, 0.05);
  lastTime  = timestamp;

  // ---------- update ----------
  if (state === 'play') {
    updatePlayer(dt);
    updateBullets(dt);
    updateEnemies(dt);
    if (state === 'play') updatePlayerEnemyCollision();
    updateParticles(dt);
    if (damageFlash > 0) damageFlash -= dt;

    // check wave cleared
    if (enemies.length === 0 && state === 'play') {
      state          = 'waveclear';
      waveClearTimer = 3.5;
    }
  } else if (state === 'waveclear') {
    updateParticles(dt);
    waveClearTimer -= dt;
    if (waveClearTimer <= 0) {
      state = 'play';
      startWave();
    }
  } else if (state === 'gameover') {
    updateParticles(dt);
  }

  // ---------- draw ----------
  if (state === 'start') {
    drawStartScreen();
  } else {
    drawBackground();
    drawParticles();
    drawBullets();

    enemies.forEach(e => {
      if (e.type === 'skeleton') drawSkeleton(e);
      else                       drawZombie(e);
      drawEnemyHealthBar(e);
    });

    if (player.alive) {
      const flicker = player.invincible > 0 && Math.floor(player.invincible * 12) % 2 === 0;
      drawRabbit(player.x, player.y, player.angle, flicker ? 0.35 : 1.0);
    }

    drawHUD();
    drawDamageFlash();

    if (state === 'waveclear') drawWaveClearScreen();
    if (state === 'gameover')  drawGameOverScreen();
  }

  requestAnimationFrame(loop);
}

// ============================================================
//  Click / input to advance states
// ============================================================
canvas.addEventListener('click', () => {
  if (state === 'start') {
    player     = createPlayer();
    score      = 0;
    waveNumber = 0;
    enemies    = [];
    bullets    = [];
    particles  = [];
    fireCooldown = 0;
    state      = 'play';
    startWave();
  } else if (state === 'gameover') {
    player     = createPlayer();
    score      = 0;
    waveNumber = 0;
    enemies    = [];
    bullets    = [];
    particles  = [];
    fireCooldown = 0;
    state      = 'play';
    startWave();
  }
});

// ============================================================
//  Boot
// ============================================================
requestAnimationFrame(loop);
