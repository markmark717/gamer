const config = {
    type: Phaser.WEBGL,
    parent: 'game-container',
    width: window.innerWidth,
    height: window.innerHeight,
    backgroundColor: '#05050a',
    physics: {
        default: 'arcade',
        arcade: { gravity: { y: 0 } }
    },
    scene: { preload, create, update }
};

const game = new Phaser.Game(config);

// Game State
let gameState = {
    mana: 100,
    wave: 1,
    isGameOver: false,
    tool: 'spawn'
};

// Groups & Timers
let followers, demons;
let demonSpawnTimer;
let manaRegenTimer;

// UI Elements
const uiMana = document.getElementById('mana-count');
const uiFlock = document.getElementById('flock-count');
const uiWave = document.getElementById('wave-count');

document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        gameState.tool = e.currentTarget.getAttribute('data-tool');
    });
});

function preload() {
    this.load.image('particle', 'https://labs.phaser.io/assets/particles/white.png');
}

function create() {
    // Post-processing: Add intense Bloom for neon glow
    this.cameras.main.setPostPipeline('BloomFx');
    
    // Create Physics Groups
    followers = this.physics.add.group();
    demons = this.physics.add.group();

    // Combat Collision: If a demon touches a follower, both explode.
    this.physics.add.overlap(followers, demons, (follower, demon) => {
        spawnExplosion(this, follower.x, follower.y, 0xffffff, 10);
        spawnExplosion(this, demon.x, demon.y, 0xff0055, 15);
        this.cameras.main.shake(100, 0.01); // Screen shake
        follower.destroy();
        demon.destroy();
        updateUI();
        checkGameOver();
    });

    // Inputs
    this.input.on('pointerdown', (pointer) => interact(this, pointer));

    // Initial Flock
    for(let i=0; i<3; i++) spawnFollower(this, this.cameras.main.centerX + (Math.random()*50-25), this.cameras.main.centerY + (Math.random()*50-25));

    // Core Game Loops
    demonSpawnTimer = this.time.addEvent({ delay: 3000, callback: () => spawnDemon(this), loop: true });
    
    manaRegenTimer = this.time.addEvent({
        delay: 1000, 
        callback: () => {
            if(gameState.isGameOver) return;
            gameState.mana += followers.getChildren().length; // 1 mana per follower per second
            if(gameState.mana > 500) gameState.mana = 500;
            updateUI();
        }, 
        loop: true 
    });

    // Wave Escalator (Harder over time)
    this.time.addEvent({
        delay: 15000, 
        callback: () => {
            gameState.wave++;
            demonSpawnTimer.delay = Math.max(500, demonSpawnTimer.delay * 0.8); // Spawn faster
            updateUI();
        }, 
        loop: true 
    });
}

// --- INTERACTION & POWERS ---
function interact(scene, pointer) {
    if (gameState.isGameOver) return;
    
    let costs = { 'spawn': 20, 'smite': 10, 'nova': 50 };
    let cost = costs[gameState.tool];

    if (gameState.mana >= cost) {
        if (gameState.tool === 'spawn') {
            spawnFollower(scene, pointer.x, pointer.y);
            gameState.mana -= cost;
        } 
        else if (gameState.tool === 'smite') {
            // Find closest demon to click
            let closest = scene.physics.closest(pointer, demons.getChildren());
            if (closest && Phaser.Math.Distance.Between(pointer.x, pointer.y, closest.x, closest.y) < 100) {
                spawnExplosion(scene, closest.x, closest.y, 0x00e5ff, 20);
                scene.cameras.main.shake(150, 0.01);
                closest.destroy();
                gameState.mana -= cost;
            }
        }
        else if (gameState.tool === 'nova') {
            // Massive AoE damage
            spawnExplosion(scene, pointer.x, pointer.y, 0xbc13fe, 100, 400);
            scene.cameras.main.shake(300, 0.03);
            let blastRadius = 250;
            demons.getChildren().forEach(demon => {
                if (Phaser.Math.Distance.Between(pointer.x, pointer.y, demon.x, demon.y) < blastRadius) {
                    demon.destroy();
                }
            });
            gameState.mana -= cost;
        }
        updateUI();
    }
}

// --- ENTITY SPAWNERS ---
function spawnFollower(scene, x, y) {
    let follower = followers.create(x, y, 'particle');
    follower.setTint(0x00e5ff); // Neon Cyan
    follower.setScale(0.5);
    follower.setBlendMode(Phaser.BlendModes.ADD); // Glowing effect
    follower.setCollideWorldBounds(true);
    follower.setBounce(1);
    
    // Add a pulsing glow
    scene.tweens.add({ targets: follower, alpha: 0.5, duration: 1000, yoyo: true, repeat: -1 });

    // Wander AI state
    follower.aiTarget = new Phaser.Math.Vector2(x, y);
}

function spawnDemon(scene) {
    if (gameState.isGameOver || followers.getChildren().length === 0) return;

    // Spawn on random edge of screen
    let x, y;
    if (Math.random() > 0.5) { x = Math.random() > 0.5 ? 0 : config.width; y = Math.random() * config.height; } 
    else { x = Math.random() * config.width; y = Math.random() > 0.5 ? 0 : config.height; }

    let demon = demons.create(x, y, 'particle');
    demon.setTint(0xff0055); // Neon Red
    demon.setScale(0.6);
    demon.setBlendMode(Phaser.BlendModes.ADD);
    
    // Spawn animation
    spawnExplosion(scene, x, y, 0xff0055, 5, 50);
}

// --- VISUAL EFFECTS ---
function spawnExplosion(scene, x, y, color, amount, speed = 150) {
    let emitter = scene.add.particles(x, y, 'particle', {
        tint: color, speed: { min: 50, max: speed },
        scale: { start: 0.4, end: 0 }, blendMode: 'ADD',
        lifespan: 600, quantity: amount
    });
    scene.time.delayedCall(600, () => emitter.destroy());
}

// --- UPDATE LOOPS ---
function update(time, delta) {
    if (gameState.isGameOver) return;

    let allFollowers = followers.getChildren();
    
    // 1. Follower AI (Wander around randomly)
    allFollowers.forEach(follower => {
        if (time % 100 < 20) { // Throttle calculations
            if (Phaser.Math.Distance.Between(follower.x, follower.y, follower.aiTarget.x, follower.aiTarget.y) < 10) {
                // Pick new target nearby
                follower.aiTarget.x = follower.x + Phaser.Math.Between(-100, 100);
                follower.aiTarget.y = follower.y + Phaser.Math.Between(-100, 100);
            }
            scene.physics.moveToObject(follower, follower.aiTarget, 30);
        }
    });

    // 2. Demon AI (Relentlessly hunt the closest follower)
    demons.getChildren().forEach(demon => {
        let closest = this.physics.closest(demon, allFollowers);
        if (closest) {
            this.physics.moveToObject(demon, closest, 60 + (gameState.wave * 2)); // Demons get faster with waves
        } else {
            demon.setVelocity(0, 0); // Stop if no followers left
        }
    });
}

function updateUI() {
    uiMana.innerText = gameState.mana;
    uiFlock.innerText = followers.getChildren().length;
    uiWave.innerText = gameState.wave;
}

function checkGameOver() {
    if (followers.getChildren().length === 0) {
        gameState.isGameOver = true;
        document.getElementById('game-over').classList.remove('hidden');
    }
}

window.addEventListener('resize', () => { game.scale.resize(window.innerWidth, window.innerHeight); });