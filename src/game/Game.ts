import { ITEMS, TUNING, ZONES, type ItemDef } from './config';
import { drawSprite, preloadSprite } from './sprites';
import { Effects } from './effects';
import { sfx } from './audio';

type GameState = 'menu' | 'playing' | 'rebuild' | 'gameover';

interface FallingItem {
  def: ItemDef;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  spin: number;
}

const BEST_SCORE_KEY = 'silly-squirrel-best';

export class Game {
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private lastTime = 0;
  private elapsed = 0;

  private state: GameState = 'menu';
  private score = 0;
  private best = 0;
  private lives = TUNING.maxLives;
  private level = 1;
  /** Tools collected this level — they power the wire rebuild. */
  private tools = 0;

  // Squirrel
  private squirrelX = 0.5; // fraction of width
  private squirrelDir = 1;
  private carried: ItemDef | null = null;
  private respawnTimer = 0;

  // The troll fight
  private rebuild = { progress: 0, timeLeft: 0, stompTimer: 0, hammer: 0 };
  private gameOverTime = 0;

  private falling: FallingItem[] = [];
  private effects = new Effects();

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D not supported');
    this.ctx = ctx;
    this.best = Number(localStorage.getItem(BEST_SCORE_KEY) ?? 0);

    for (const item of ITEMS) preloadSprite(item.id);
    for (const id of ['squirrel', 'heart', 'toolbox', 'dumpster', 'troll']) preloadSprite(id);

    window.addEventListener('resize', () => this.resize());
    this.resize();

    window.addEventListener('keydown', (e) => this.onKey(e));
    canvas.addEventListener('pointerdown', () => this.onTap());

    // Handy for poking at the game from the browser console / tests.
    (window as unknown as Record<string, unknown>).__game = this;
  }

  start(): void {
    requestAnimationFrame((t) => this.frame(t));
  }

  // ---------------------------------------------------------------- input

  private onKey(e: KeyboardEvent): void {
    if (e.repeat) return; // mashing means real presses — no key-repeat cheating!
    // Don't steal keys while typing in the debug menu.
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

    if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.squirrelDir = -1;
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') this.squirrelDir = 1;
    else if (e.code === 'Space') {
      // Space only acts in-game, so mashing at game over can't
      // accidentally start a new run.
      e.preventDefault();
      if (this.state === 'playing') this.dropItem();
      else if (this.state === 'rebuild') this.rebuildPress();
    } else if (e.code === 'Enter') {
      this.onTap();
    }
  }

  private onTap(): void {
    if (this.state === 'menu') this.beginRun();
    else if (this.state === 'playing') this.dropItem();
    else if (this.state === 'rebuild') this.rebuildPress();
    else if (this.state === 'gameover') {
      // A short grace period so frantic mashing doesn't skip the
      // game-over screen the instant it appears.
      if (this.elapsed - this.gameOverTime > 1) this.state = 'menu';
    }
  }

  // ------------------------------------------------------------- gameplay

  private beginRun(): void {
    this.state = 'playing';
    this.score = 0;
    this.lives = TUNING.maxLives;
    this.level = 1;
    this.tools = 0;
    this.squirrelX = 0.5;
    this.squirrelDir = 1;
    this.falling = [];
    this.carried = this.randomItem();
    this.respawnTimer = 0;
    sfx.levelUp();
  }

  private randomItem(): ItemDef {
    return ITEMS[Math.floor(Math.random() * ITEMS.length)];
  }

  private dropItem(): void {
    if (!this.carried) return;
    const speed = this.squirrelSpeed() * this.w;
    this.falling.push({
      def: this.carried,
      x: this.squirrelX * this.w,
      y: this.wireYAt(this.squirrelX) + this.itemSize() * 0.9,
      vx: this.squirrelDir * speed * 0.35,
      vy: 40,
      rotation: 0,
      spin: (Math.random() - 0.5) * 6,
    });
    this.carried = null;
    this.respawnTimer = TUNING.respawnDelay;
    sfx.drop();
  }

  private squirrelSpeed(): number {
    return TUNING.squirrelBaseSpeed + (this.level - 1) * TUNING.squirrelSpeedPerLevel;
  }

  /** Which of the three zones an x position is over. */
  private zoneIndexAt(x: number): number {
    return Math.max(0, Math.min(ZONES.length - 1, Math.floor((x / this.w) * ZONES.length)));
  }

  /** Center x of a zone's bin. */
  private binX(zoneIndex: number): number {
    return ((zoneIndex * 2 + 1) / (ZONES.length * 2)) * this.w;
  }

  private resolveLanding(item: FallingItem): void {
    const zoneIndex = this.zoneIndexAt(item.x);
    const zone = ZONES[zoneIndex];
    const correct = zone.kind === item.def.kind;
    const binX = this.binX(zoneIndex);
    const binY = this.h * TUNING.binY;

    if (correct) {
      this.score += TUNING.pointsPerCatch;
      this.effects.floatText(item.x, item.y - 40, `+${TUNING.pointsPerCatch}`, '#ffe14d');
      if (zone.kind === 'tool') {
        this.tools += 1;
        this.effects.floatText(binX, binY - 70, `🧰 x${this.tools}`, '#ffd34d');
      }
      const sparkle = zone.kind === 'good' ? '💖' : zone.kind === 'tool' ? '🔩' : '⭐';
      this.effects.burst(binX, binY, { emoji: sparkle, count: 10, speed: 240 });
      sfx.correct();

      const newLevel = 1 + Math.floor(this.score / TUNING.pointsPerLevel);
      if (newLevel > this.level) this.startRebuild();
    } else {
      this.lives -= 1;
      this.effects.shake = 14;
      this.effects.burst(item.x, item.y, { emoji: '💥', count: 14, speed: 320 });
      this.effects.burst(item.x, item.y, { color: '#ff9c3f', count: 20, speed: 380 });
      this.effects.floatText(item.x, item.y - 40, 'OOPS!', '#ff6b6b');
      sfx.wrong();
      if (this.lives <= 0) this.endRun();
    }
  }

  private endRun(): void {
    this.state = 'gameover';
    this.gameOverTime = this.elapsed;
    this.best = Math.max(this.best, this.score);
    localStorage.setItem(BEST_SCORE_KEY, String(this.best));
    sfx.gameOver();
  }

  // ---------------------------------------------------------- troll fight

  private startRebuild(): void {
    this.state = 'rebuild';
    this.falling = [];
    this.carried = null;
    this.rebuild = {
      progress: 0,
      timeLeft: TUNING.rebuild.time,
      stompTimer: TUNING.rebuild.stompEvery,
      hammer: 0,
    };
    this.effects.shake = 12;
    this.effects.floatText(this.w / 2, this.h * 0.35, 'THE WIRE FELL! 🧌', '#ff6b6b');
    sfx.wrong();
  }

  private rebuildPress(): void {
    const gain = TUNING.rebuild.perPress + this.tools * TUNING.rebuild.perToolBonus;
    this.rebuild.progress = Math.min(100, this.rebuild.progress + gain);
    this.rebuild.hammer = 1;
    sfx.hammer();

    if (this.rebuild.progress >= 100) {
      this.level += 1;
      this.tools = 0; // tools are used up fixing the wire
      this.state = 'playing';
      this.carried = null;
      this.respawnTimer = TUNING.respawnDelay;
      this.effects.floatText(this.w / 2, this.h * 0.4, `LEVEL ${this.level}!`, '#7dffb3');
      this.effects.burst(this.w / 2, this.h * TUNING.wireY, { emoji: '⚡', count: 16, speed: 300 });
      sfx.levelUp();
    }
  }

  private updateRebuild(dt: number): void {
    const r = this.rebuild;
    const cfg = TUNING.rebuild;
    r.hammer = Math.max(0, r.hammer - dt * 6);
    r.timeLeft -= dt;

    // The troll works against you...
    r.progress = Math.max(0, r.progress - (cfg.drainBase + cfg.drainPerLevel * (this.level - 1)) * dt);

    // ...and every few seconds he SMASHES.
    r.stompTimer -= dt;
    if (r.stompTimer <= 0) {
      r.stompTimer += cfg.stompEvery;
      r.progress = Math.max(0, r.progress - cfg.stompAmount);
      this.effects.shake = 10;
      this.effects.floatText(this.w * 0.62, this.h * 0.3, 'TROLL SMASH!', '#ff6b6b');
      this.effects.burst(this.w * 0.62, this.h * 0.32, { emoji: '💢', count: 6, speed: 200 });
      sfx.wrong();
    }

    if (r.timeLeft <= 0) {
      this.lives -= 1;
      if (this.lives <= 0) {
        this.endRun();
      } else {
        // Back to the wire — collect more tools and try again at the
        // same score (the next correct catch re-summons the troll).
        this.state = 'playing';
        this.respawnTimer = TUNING.respawnDelay;
        this.effects.floatText(this.w / 2, this.h * 0.4, 'The troll stopped you! Grab more 🧰!', '#ffb84d');
        sfx.wrong();
      }
    }
  }

  // ----------------------------------------------------------- main loop

  private frame(time: number): void {
    const dt = Math.min(0.05, (time - this.lastTime) / 1000 || 0.016);
    this.lastTime = time;
    this.elapsed += dt;

    if (this.state === 'playing') this.update(dt);
    else if (this.state === 'rebuild') this.updateRebuild(dt);
    this.effects.update(dt, TUNING.gravity * this.h);
    this.draw();

    requestAnimationFrame((t) => this.frame(t));
  }

  private update(dt: number): void {
    // Squirrel runs along the wire and bounces at the edges.
    this.squirrelX += this.squirrelDir * this.squirrelSpeed() * dt;
    const margin = 0.06;
    if (this.squirrelX > 1 - margin) {
      this.squirrelX = 1 - margin;
      this.squirrelDir = -1;
    } else if (this.squirrelX < margin) {
      this.squirrelX = margin;
      this.squirrelDir = 1;
    }

    // Pick up the next item after a short delay.
    if (!this.carried) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) this.carried = this.randomItem();
    }

    // Falling items.
    const gravity = TUNING.gravity * this.h;
    const landY = this.h * TUNING.binY;
    for (const item of this.falling) {
      item.vy += gravity * dt;
      item.x += item.vx * dt;
      item.y += item.vy * dt;
      item.rotation += item.spin * dt;
    }
    const landed = this.falling.filter((i) => i.y >= landY);
    this.falling = this.falling.filter((i) => i.y < landY);
    for (const item of landed) this.resolveLanding(item);
  }

  // ------------------------------------------------------------- drawing

  private resize(): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = this.w * this.dpr;
    this.canvas.height = this.h * this.dpr;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  private itemSize(): number {
    return Math.min(this.w, this.h) * 0.055;
  }

  private squirrelSize(): number {
    return Math.min(this.w, this.h) * 0.085;
  }

  /** The wire sags in the middle like a real power line. */
  private wireYAt(xFrac: number): number {
    const sag = 4 * xFrac * (1 - xFrac);
    return this.h * TUNING.wireY + this.h * TUNING.wireSag * sag;
  }

  private draw(): void {
    const { ctx } = this;
    ctx.save();
    if (this.effects.shake > 0) {
      ctx.translate(
        (Math.random() - 0.5) * this.effects.shake,
        (Math.random() - 0.5) * this.effects.shake,
      );
    }

    this.drawBackground();
    this.drawZones();

    if (this.state === 'rebuild') {
      this.drawBrokenWire();
      this.drawRebuildUi();
    } else {
      this.drawWire();
      this.drawSquirrel();
      this.drawFalling();
    }

    this.effects.draw(ctx);
    this.drawHud();

    if (this.state === 'menu') this.drawMenu();
    else if (this.state === 'gameover') this.drawGameOver();

    ctx.restore();
  }

  private drawBackground(): void {
    const { ctx, w, h } = this;
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#8ecdf5');
    sky.addColorStop(0.7, '#cbe9fb');
    sky.addColorStop(1, '#a8e08e');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    // Drifting clouds
    ctx.font = `${Math.min(w, h) * 0.07}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = 0.8;
    for (let i = 0; i < 3; i++) {
      const cx = ((this.elapsed * 12 + i * (w / 3) + i * 137) % (w + 200)) - 100;
      const cy = h * (0.3 + 0.13 * i);
      ctx.fillText('☁️', cx, cy);
    }
    ctx.globalAlpha = 1;

    // Grass at the bottom
    ctx.fillStyle = '#7cc96b';
    ctx.fillRect(0, h * 0.92, w, h * 0.08);
  }

  private drawZones(): void {
    const { ctx, w, h } = this;
    const wireBottom = this.wireYAt(0.5) + 30;
    const zoneW = w / ZONES.length;
    const binY = h * TUNING.binY;
    const binSize = Math.min(w, h) * 0.125;

    for (let i = 0; i < ZONES.length; i++) {
      const zone = ZONES[i];
      ctx.fillStyle = zone.tint;
      ctx.fillRect(i * zoneW, wireBottom, zoneW, h - wireBottom);

      const bounce = Math.sin(this.elapsed * 3 + i * 2) * 4;
      drawSprite(ctx, zone.spriteId, zone.emoji, this.binX(i), binY + bounce, binSize);

      ctx.font = `bold ${Math.min(w, h) * 0.026}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(60, 40, 50, 0.65)';
      ctx.fillText(zone.label, this.binX(i), binY + binSize * 0.75);
    }

    // Dashed dividers between zones, like the drawing
    ctx.strokeStyle = 'rgba(210, 60, 80, 0.55)';
    ctx.lineWidth = 4;
    ctx.setLineDash([18, 14]);
    for (let i = 1; i < ZONES.length; i++) {
      ctx.beginPath();
      ctx.moveTo(i * zoneW, wireBottom);
      ctx.lineTo(i * zoneW, h * 0.92);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  private drawPoles(): void {
    const { ctx, w } = this;
    ctx.strokeStyle = '#6b4a2f';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(6, this.wireYAt(0) - 20);
    ctx.lineTo(6, this.h * 0.92);
    ctx.moveTo(w - 6, this.wireYAt(1) - 20);
    ctx.lineTo(w - 6, this.h * 0.92);
    ctx.stroke();
  }

  private drawWire(): void {
    const { ctx, w } = this;
    this.drawPoles();

    // The electrowire itself
    ctx.strokeStyle = '#2c3e50';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, this.wireYAt(0));
    ctx.quadraticCurveTo(w / 2, this.wireYAt(0.5) + this.h * TUNING.wireSag, w, this.wireYAt(1));
    ctx.stroke();

    // Electric sparks gliding along the wire
    for (let i = 0; i < 3; i++) {
      const t = ((this.elapsed * 0.35 + i / 3) % 1);
      const x = t * w;
      const y = this.wireYAt(t);
      const pulse = 0.5 + 0.5 * Math.sin(this.elapsed * 6 + i * 2);
      ctx.fillStyle = `rgba(255, 235, 80, ${0.55 + 0.25 * pulse})`;
      ctx.beginPath();
      ctx.arc(x, y, 4 + 1.5 * pulse, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** The fallen wire: two drooping halves with a gap that closes as you rebuild. */
  private drawBrokenWire(): void {
    const { ctx, w, h } = this;
    this.drawPoles();

    const progress = this.rebuild.progress / 100;
    const gapHalf = w * 0.28 * (1 - progress) + w * 0.01;
    const droop = h * 0.22 * (1 - progress);
    const leftTipX = w / 2 - gapHalf;
    const rightTipX = w / 2 + gapHalf;
    const tipY = this.wireYAt(0.5) + droop;

    ctx.strokeStyle = '#2c3e50';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, this.wireYAt(0));
    ctx.quadraticCurveTo(leftTipX * 0.7, tipY + 20, leftTipX, tipY);
    ctx.moveTo(w, this.wireYAt(1));
    ctx.quadraticCurveTo(w - (w - rightTipX) * 0.7, tipY + 20, rightTipX, tipY);
    ctx.stroke();

    // Sparking broken ends
    const pulse = 0.5 + 0.5 * Math.sin(this.elapsed * 12);
    ctx.font = `${this.itemSize() * (0.8 + 0.3 * pulse)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⚡', leftTipX, tipY);
    ctx.fillText('⚡', rightTipX, tipY);

    // The squirrel hammers at the left end...
    const size = this.squirrelSize();
    drawSprite(ctx, 'squirrel', '🐿️', leftTipX - size * 0.7, tipY - size * 0.5, size, 0, true);
    const swing = -1.1 * this.rebuild.hammer;
    drawSprite(ctx, 'hammer', '🔨', leftTipX - size * 0.15, tipY - size * 0.7, size * 0.7, swing);

    // ...while the troll yanks on the right end.
    const trollSize = size * 1.7;
    const shakeX = Math.sin(this.elapsed * 9) * 4;
    drawSprite(ctx, 'troll', '🧌', rightTipX + trollSize * 0.55 + shakeX, tipY + trollSize * 0.15, trollSize);
  }

  private drawRebuildUi(): void {
    const { ctx, w, h } = this;
    const r = this.rebuild;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Countdown
    const urgent = r.timeLeft < 4;
    ctx.font = `bold ${Math.min(w, h) * 0.06}px system-ui, sans-serif`;
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    const timeText = `⏰ ${Math.max(0, r.timeLeft).toFixed(1)}`;
    ctx.strokeText(timeText, w / 2, h * 0.5);
    ctx.fillStyle = urgent ? '#ff6b6b' : '#fff';
    ctx.fillText(timeText, w / 2, h * 0.5);

    // Progress bar
    const barW = w * 0.6;
    const barH = Math.max(20, h * 0.035);
    const barX = (w - barW) / 2;
    const barY = h * 0.58;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.roundRect(barX - 4, barY - 4, barW + 8, barH + 8, 12);
    ctx.fill();
    const grad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
    grad.addColorStop(0, '#ffd34d');
    grad.addColorStop(1, '#7dffb3');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW * (r.progress / 100), barH, 8);
    ctx.fill();

    // Instructions
    const pulse = 0.7 + 0.3 * Math.sin(this.elapsed * 8);
    ctx.globalAlpha = pulse;
    ctx.font = `bold ${Math.min(w, h) * 0.04}px system-ui, sans-serif`;
    ctx.strokeText('MASH SPACE / TAP FAST! 🔨', w / 2, h * 0.68);
    ctx.fillStyle = '#fff';
    ctx.fillText('MASH SPACE / TAP FAST! 🔨', w / 2, h * 0.68);
    ctx.globalAlpha = 1;

    const gain = TUNING.rebuild.perPress + this.tools * TUNING.rebuild.perToolBonus;
    ctx.font = `${Math.min(w, h) * 0.028}px system-ui, sans-serif`;
    ctx.fillStyle = '#ffe14d';
    ctx.fillText(`🧰 ${this.tools} tools → ${gain.toFixed(1)}% per hit`, w / 2, h * 0.74);
  }

  private drawSquirrel(): void {
    const { ctx } = this;
    const x = this.squirrelX * this.w;
    const size = this.squirrelSize();
    const y = this.wireYAt(this.squirrelX) - size * 0.45;
    // A slow gentle rock reads as "running" without the strobing that a
    // fast vertical bob causes at emoji sizes.
    const rock = this.state === 'playing' ? Math.sin(this.elapsed * 6) * 0.07 : 0;

    // The emoji squirrel faces left by default; flip when running right.
    drawSprite(ctx, 'squirrel', '🐿️', x, y, size, rock, this.squirrelDir === 1);

    // Carried item dangles below the wire with a little sway.
    if (this.carried && this.state === 'playing') {
      const sway = Math.sin(this.elapsed * 6) * 0.15;
      const itemY = this.wireYAt(this.squirrelX) + this.itemSize() * 0.9;
      ctx.strokeStyle = 'rgba(90, 60, 40, 0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y + size * 0.3);
      ctx.lineTo(x + sway * 20, itemY - this.itemSize() * 0.4);
      ctx.stroke();
      drawSprite(ctx, this.carried.id, this.carried.emoji, x + sway * 20, itemY, this.itemSize(), sway);
    }
  }

  private drawFalling(): void {
    for (const item of this.falling) {
      drawSprite(this.ctx, item.def.id, item.def.emoji, item.x, item.y, this.itemSize(), item.rotation);
    }
  }

  private drawHud(): void {
    const { ctx, w } = this;
    if (this.state === 'menu') return;

    ctx.font = `bold ${Math.min(w, this.h) * 0.045}px system-ui, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    const scoreText = `⭐ ${this.score}   🧰 ${this.tools}`;
    ctx.strokeText(scoreText, 16, 12);
    ctx.fillStyle = '#fff';
    ctx.fillText(scoreText, 16, 12);

    ctx.textAlign = 'right';
    const hearts =
      '❤️'.repeat(Math.max(0, this.lives)) +
      '🖤'.repeat(Math.max(0, TUNING.maxLives - this.lives));
    ctx.strokeText(hearts, w - 16, 12);
    ctx.fillText(hearts, w - 16, 12);

    ctx.textAlign = 'center';
    ctx.font = `bold ${Math.min(w, this.h) * 0.03}px system-ui, sans-serif`;
    ctx.strokeText(`Level ${this.level}`, w / 2, 16);
    ctx.fillText(`Level ${this.level}`, w / 2, 16);
  }

  private overlay(alpha: number): void {
    this.ctx.fillStyle = `rgba(20, 30, 50, ${alpha})`;
    this.ctx.fillRect(0, 0, this.w, this.h);
  }

  private drawMenu(): void {
    const { ctx, w, h } = this;
    this.overlay(0.45);

    const cx = w / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const bounce = Math.abs(Math.sin(this.elapsed * 2.5)) * 14;
    ctx.font = `${Math.min(w, h) * 0.14}px sans-serif`;
    ctx.fillText('🐿️', cx, h * 0.24 - bounce);

    ctx.font = `bold ${Math.min(w, h) * 0.075}px system-ui, sans-serif`;
    ctx.lineWidth = 8;
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.strokeText('SILLY SQUIRREL', cx, h * 0.37);
    ctx.fillStyle = '#ffe14d';
    ctx.fillText('SILLY SQUIRREL', cx, h * 0.37);

    ctx.font = `${Math.min(w, h) * 0.03}px system-ui, sans-serif`;
    ctx.fillStyle = '#fff';
    ctx.fillText('🍓 Yummy things go in the ❤️', cx, h * 0.48);
    ctx.fillText('🔧 Tools go in the 🧰', cx, h * 0.53);
    ctx.fillText('💣 Bad things go in the 🗑️', cx, h * 0.58);
    ctx.fillText('⬅️ ➡️ steer  •  tap / SPACE to drop', cx, h * 0.63);
    ctx.fillStyle = '#ffd34d';
    ctx.fillText('🧌 A troll breaks the wire after each level —', cx, h * 0.69);
    ctx.fillText('MASH to rebuild it! More tools = faster fixing!', cx, h * 0.73);

    if (this.best > 0) {
      ctx.fillStyle = '#7dffb3';
      ctx.fillText(`Best score: ${this.best}`, cx, h * 0.79);
    }

    const pulse = 0.6 + 0.4 * Math.sin(this.elapsed * 4);
    ctx.globalAlpha = pulse;
    ctx.font = `bold ${Math.min(w, h) * 0.04}px system-ui, sans-serif`;
    ctx.fillStyle = '#fff';
    ctx.fillText('TAP or press ENTER to play', cx, h * 0.86);
    ctx.globalAlpha = 1;
  }

  private drawGameOver(): void {
    const { ctx, w, h } = this;
    this.overlay(0.55);

    const cx = w / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.font = `${Math.min(w, h) * 0.13}px sans-serif`;
    ctx.fillText('💥', cx, h * 0.3);

    ctx.font = `bold ${Math.min(w, h) * 0.07}px system-ui, sans-serif`;
    ctx.lineWidth = 8;
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.strokeText('GAME OVER', cx, h * 0.44);
    ctx.fillStyle = '#ff6b6b';
    ctx.fillText('GAME OVER', cx, h * 0.44);

    ctx.font = `bold ${Math.min(w, h) * 0.045}px system-ui, sans-serif`;
    ctx.fillStyle = '#fff';
    ctx.fillText(`Score: ${this.score}`, cx, h * 0.55);
    ctx.fillStyle = '#ffe14d';
    ctx.fillText(`Best: ${this.best}`, cx, h * 0.62);

    const pulse = 0.6 + 0.4 * Math.sin(this.elapsed * 4);
    ctx.globalAlpha = pulse;
    ctx.font = `bold ${Math.min(w, h) * 0.038}px system-ui, sans-serif`;
    ctx.fillStyle = '#fff';
    ctx.fillText('TAP or press ENTER for menu', cx, h * 0.75);
    ctx.globalAlpha = 1;
  }
}
