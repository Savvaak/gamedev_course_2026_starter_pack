import Phaser from 'phaser';

const PLAYER_SPEED = 260;
const MAX_ROUNDS = 3;

type LaserShot = {
  body: Phaser.GameObjects.Rectangle;
  vx: number;
  vy: number;
};

export class GameScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Container;
  private playerLabel!: Phaser.GameObjects.Text;
  private pig!: Phaser.GameObjects.Container;
  private pigLabel!: Phaser.GameObjects.Text;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;
  private roundText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private currentRound = 0;
  private defeatedRounds = 0;
  private lasers: LaserShot[] = [];
  private lastShotAt = 0;
  private gameEnded = false;
  private fireworks: Array<{
    x: number;
    y: number;
    vx: number;
    vy: number;
    color: number;
    body: Phaser.GameObjects.Arc;
    life: number;
  }> = [];

  constructor() {
    super('GameScene');
  }

  create(): void {
    const { width, height } = this.scale;

    this.add.rectangle(width / 2, height / 2, width, height, 0x091426);

    this.add
      .text(width / 2, 22, '67 VS 42', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '28px',
        color: '#e2e8f0',
      })
      .setOrigin(0.5, 0);

    this.roundText = this.add.text(width / 2, 64, 'ROUND 1/3', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '22px',
      color: '#f8fafc',
    });
    this.roundText.setOrigin(0.5, 0);

    this.statusText = this.add.text(width / 2, 98, '42 шлёт лазеры', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '16px',
      color: '#cbd5e1',
    });
    this.statusText.setOrigin(0.5, 0);

    this.createPlayer();
    this.createPig();

    if (!this.input.keyboard) {
      throw new Error('Keyboard input is unavailable.');
    }

    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    }) as Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;

    this.currentRound = 0;
    this.defeatedRounds = 0;
    this.startNextRound();
  }

  private createPlayer(): void {
    const { width, height } = this.scale;
    this.player = this.add.container(width * 0.23, height * 0.58);

    this.playerLabel = this.add.text(0, 0, '67', {
      fontFamily: 'Impact, sans-serif',
      fontSize: '48px',
      color: '#f8fafc',
      stroke: '#93c5fd',
      strokeThickness: 6,
    });
    this.playerLabel.setOrigin(0.5, 0.5);

    this.player.add([this.playerLabel]);
  }

  private createPig(): void {
    const { width, height } = this.scale;
    this.pig = this.add.container(width * 0.75, height * 0.55);

    this.pigLabel = this.add.text(0, 0, '42', {
      fontFamily: 'Impact, sans-serif',
      fontSize: '32px',
      color: '#fff7ed',
      stroke: '#0f172a',
      strokeThickness: 4,
    });
    this.pigLabel.setOrigin(0.5, 0.5);

    this.pig.add([this.pigLabel]);
  }

  private movePigAwayFromPlayer(): void {
    const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
    const distance = Phaser.Math.Between(180, 320);
    const targetX = this.player.x + Math.cos(angle) * distance;
    const targetY = this.player.y + Math.sin(angle) * distance;

    this.pig.setPosition(
      Phaser.Math.Clamp(targetX, 80, this.scale.width - 80),
      Phaser.Math.Clamp(targetY, 120, this.scale.height - 60),
    );
  }

  private startNextRound(): void {
    this.currentRound += 1;
    this.lastShotAt = 0;
    this.pig.setVisible(true);
    this.movePigAwayFromPlayer();

    const red = Phaser.Display.Color.GetColor(255, 120 + this.currentRound * 28, 100 + this.currentRound * 18);
    this.pigLabel.setColor(`#${(red & 0xffffff).toString(16).padStart(6, '0')}`);

    this.roundText.setText(`ROUND ${this.currentRound}/${MAX_ROUNDS}`);
    this.statusText.setText(`Лазеры ускоряются: ${this.currentRound}/${MAX_ROUNDS}`);

    this.lasers.forEach((shot) => shot.body.destroy());
    this.lasers = [];
  }

  update(_time: number, delta: number): void {
    if (this.gameEnded) {
      this.updateFireworks(delta);
      return;
    }

    const seconds = delta / 1000;
    let dx = 0;
    let dy = 0;

    if (this.cursors.left.isDown || this.wasd.left.isDown) dx -= 1;
    if (this.cursors.right.isDown || this.wasd.right.isDown) dx += 1;
    if (this.cursors.up.isDown || this.wasd.up.isDown) dy -= 1;
    if (this.cursors.down.isDown || this.wasd.down.isDown) dy += 1;

    if (dx !== 0 || dy !== 0) {
      const length = Math.hypot(dx, dy);
      this.player.x += (dx / length) * PLAYER_SPEED * seconds;
      this.player.y += (dy / length) * PLAYER_SPEED * seconds;
    }

    this.keepPlayerOnScreen();
    this.fireLaserIfNeeded(_time);
    this.updateLasers(seconds);
    this.checkPigCollision();
  }

  private keepPlayerOnScreen(): void {
    const halfWidth = 36;
    const halfHeight = 28;

    this.player.x = Phaser.Math.Clamp(this.player.x, halfWidth, this.scale.width - halfWidth);
    this.player.y = Phaser.Math.Clamp(this.player.y, 120 + halfHeight, this.scale.height - halfHeight);
  }

  private fireLaserIfNeeded(time: number): void {
    const interval = Math.max(0.8, 2.2 - this.currentRound * 0.28);
    if (time - this.lastShotAt < interval * 1000) {
      return;
    }

    this.lastShotAt = time;
    const speed = 180 + this.currentRound * 90;
    const eyeOffsets = [
      { x: -24, y: -8 },
      { x: 24, y: -8 },
    ];

    eyeOffsets.forEach(({ x, y }) => {
      const startX = this.pig.x + x;
      const startY = this.pig.y + y;
      const dx = this.player.x - startX;
      const dy = this.player.y - startY;
      const length = Math.hypot(dx, dy) || 1;

      const laser = this.add.rectangle(startX, startY, 24, 8, 0xfacc15);
      laser.setRotation(Math.atan2(dy, dx));

      this.lasers.push({
        body: laser,
        vx: (dx / length) * speed,
        vy: (dy / length) * speed,
      });
    });
  }

  private updateLasers(seconds: number): void {
    for (let index = this.lasers.length - 1; index >= 0; index -= 1) {
      const shot = this.lasers[index];
      const { body } = shot;

      body.x += shot.vx * seconds;
      body.y += shot.vy * seconds;

      if (
        body.x < -60 ||
        body.x > this.scale.width + 60 ||
        body.y < -60 ||
        body.y > this.scale.height + 60
      ) {
        body.destroy();
        this.lasers.splice(index, 1);
        continue;
      }

      const hitDistance = Phaser.Math.Distance.Between(body.x, body.y, this.player.x, this.player.y);
      if (hitDistance < 36) {
        this.finishGame(false);
        return;
      }
    }
  }

  private checkPigCollision(): void {
    if (!this.pig.visible) {
      return;
    }

    const distance = Phaser.Math.Distance.Between(
      this.player.x,
      this.player.y,
      this.pig.x,
      this.pig.y,
    );

    if (distance <= 74) {
      this.defeatedRounds += 1;
      this.statusText.setText(`42 отступает ${this.defeatedRounds}/${MAX_ROUNDS}`);
      this.movePigAwayFromPlayer();
      this.lasers.forEach((shot) => shot.body.destroy());
      this.lasers = [];

      if (this.defeatedRounds >= MAX_ROUNDS) {
        this.finishGame(true);
        return;
      }

      this.time.delayedCall(220, () => {
        if (!this.gameEnded) {
          this.startNextRound();
        }
      });
    }
  }

  private finishGame(playerWon: boolean): void {
    this.gameEnded = true;
    this.pig.setVisible(false);
    this.lasers.forEach((shot) => shot.body.destroy());
    this.lasers = [];

    const overlayText = playerWon ? 'СИКС СЕВЕН' : '42 БРАТУХИ РУЛЯТ';
    const overlayColor = playerWon ? '#facc15' : '#f87171';
    const overlaySize = playerWon ? '78px' : '54px';

    this.add
      .text(this.scale.width / 2, this.scale.height / 2 - 24, overlayText, {
        fontFamily: 'Impact, sans-serif',
        fontSize: overlaySize,
        color: overlayColor,
        stroke: '#020817',
        strokeThickness: 10,
      })
      .setOrigin(0.5);

    if (playerWon) {
      this.spawnFireworks();
    }
  }

  private spawnFireworks(): void {
    for (let index = 0; index < 36; index += 1) {
      const arc = this.add.circle(
        Phaser.Math.Between(this.scale.width * 0.25, this.scale.width * 0.75),
        Phaser.Math.Between(this.scale.height * 0.2, this.scale.height * 0.7),
        Phaser.Math.Between(3, 7),
        Phaser.Display.Color.GetColor(
          Phaser.Math.Between(180, 255),
          Phaser.Math.Between(80, 220),
          Phaser.Math.Between(40, 160),
        ),
      );

      this.fireworks.push({
        x: arc.x,
        y: arc.y,
        vx: Phaser.Math.FloatBetween(-180, 180),
        vy: Phaser.Math.FloatBetween(-240, 40),
        color: arc.fillColor,
        body: arc,
        life: 1,
      });
    }
  }

  private updateFireworks(delta: number): void {
    const seconds = delta / 1000;

    for (let index = this.fireworks.length - 1; index >= 0; index -= 1) {
      const burst = this.fireworks[index];
      burst.x += burst.vx * seconds;
      burst.y += burst.vy * seconds;
      burst.vy += 260 * seconds;
      burst.life -= seconds;

      burst.body.setPosition(burst.x, burst.y);
      burst.body.setAlpha(Math.max(0, burst.life));

      if (burst.life <= 0) {
        burst.body.destroy();
        this.fireworks.splice(index, 1);
      }
    }
  }
}
