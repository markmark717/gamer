// --- PHASER ENGINE CONFIG ---
const config = {
    type: Phaser.WEBGL, // Force WebGL for advanced graphics/bloom
    parent: 'game-container',
    width: window.innerWidth,
    height: window.innerHeight,
    pixelArt: false, // Set true for strict retro pixel scaling
    physics: {
        default: 'arcade',
        arcade: { gravity: { y: 0 }, debug: false }
    },
    scene: { preload: preload, create: create, update: update }
};

const game = new Phaser.Game(config);

let currentTool = 'spawn';
let entities = [];
let groundLayer;
let pointerDown = false;

// UI Tool Selection
document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        currentTool = e.currentTarget.getAttribute('data-tool');
    });
});

// --- 1. PRELOAD ASSETS ---
function preload() {
    // Hosted assets from Phaser's official labs (CORS friendly)
    this.load.image('tiles', 'https://labs.phaser.io/assets/tilemaps/tiles/tmw_desert_spacing.png');
    this.load.spritesheet('dude', 'https://labs.phaser.io/assets/sprites/dude.png', { frameWidth: 32, frameHeight: 48 });
    this.load.atlas('flares', 'https://labs.phaser.io/assets/particles/flares.png', 'https://labs.phaser.io/assets/particles/flares.json');
}

// --- 2. CREATE SCENE ---
function create() {
    // Post-Processing: Add WebGL Bloom for that premium glowing look
    this.cameras.main.setPostPipeline('BloomFx');
    
    // Procedural Tilemap Generation
    const mapWidth = 50;
    const mapHeight = 50;
    const levelData = [];
    
    // Create an island-like desert map
    for (let y = 0; y < mapHeight; y++) {
        let row = [];
        for (let x = 0; x < mapWidth; x++) {
            let distToCenter = Math.hypot(x - mapWidth/2, y - mapHeight/2);
            if (distToCenter < 15) row.push(Math.floor(Math.random() * 3)); // Sand variants
            else if (distToCenter < 20) row.push(3); // Edge rocks
            else row.push(29); // Water/Void tile
        }
        levelData.push(row);
    }

    const map = this.make.tilemap({ data: levelData, tileWidth: 33, tileHeight: 33 });
    const tileset = map.addTilesetImage('tiles', 'tiles', 33, 33, 1, 1);
    groundLayer = map.createLayer(0, tileset, 0, 0);
    
    // Scale up the world
    groundLayer.setScale(2);
    
    // Set Camera Bounds & Initial Zoom
    this.cameras.main.setBounds(0, 0, map.widthInPixels * 2, map.heightInPixels * 2);
    this.cameras.main.setZoom(0.8);
    this.cameras.main.centerOn((mapWidth*66)/2, (mapHeight*66)/2);

    // Animations for the 'dude' sprite
    this.anims.create({ key: 'left', frames: this.anims.generateFrameNumbers('dude', { start: 0, end: 3 }), frameRate: 10, repeat: -1 });
    this.anims.create({ key: 'turn', frames: [ { key: 'dude', frame: 4 } ], frameRate: 20 });
    this.anims.create({ key: 'right', frames: this.anims.generateFrameNumbers('dude', { start: 5, end: 8 }), frameRate: 10, repeat: -1 });

    // Inputs
    this.input.mouse.disableContextMenu(); // Free up right-click for panning
    
    this.input.on('pointerdown', (pointer) => {
        if (pointer.rightButtonDown()) return; // Let panning handle right click
        interact(this, pointer);
    });

    // Camera Panning (Right Click + Drag)
    this.input.on('pointermove', (pointer) => {
        if (!pointer.isDown) return;
        if (pointer.rightButtonDown()) {
            this.cameras.main.scrollX -= (pointer.x - pointer.prevPosition.x) / this.cameras.main.zoom;
            this.cameras.main.scrollY -= (pointer.y - pointer.prevPosition.y) / this.cameras.main.zoom;
        } else {
            interact(this, pointer); // Click and drag paint
        }
    });

    // Camera Zooming (Scroll)
    this.input.on('wheel', (pointer, gameObjects, deltaX, deltaY, deltaZ) => {
        let newZoom = this.cameras.main.zoom * (deltaY > 0 ? 0.9 : 1.1);
        this.cameras.main.setZoom(Phaser.Math.Clamp(newZoom, 0.2, 2.5));
    });
}

// --- 3. INTERACTION LOGIC ---
function interact(scene, pointer) {
    // Convert screen coordinates to world coordinates accounting for camera zoom/pan
    let worldX = scene.cameras.main.getWorldPoint(pointer.x, pointer.y).x;
    let worldY = scene.cameras.main.getWorldPoint(pointer.x, pointer.y).y;

    if (currentTool === 'spawn') {
        // Prevent spawning hundreds instantly if dragging
        if (Math.random() > 0.8) spawnEntity(scene, worldX, worldY);
    } 
    else if (currentTool === 'smite') {
        triggerSmite(scene, worldX, worldY);
    }
    else if (currentTool === 'meteor') {
        if (Math.random() > 0.9) triggerMeteor(scene, worldX, worldY);
    }
}

function spawnEntity(scene, x, y) {
    let ent = scene.physics.add.sprite(x, y, 'dude');
    ent.setScale(0.8);
    ent.setTint(Math.random() * 0xffffff); // Random colored shirts
    
    // Assign random behavior timers
    ent.aiData = {
        stateTime: scene.time.now + Math.random() * 2000,
        tx: x, ty: y
    };
    entities.push(ent);
}

function triggerSmite(scene, x, y) {
    // High-quality WebGL particle explosion
    let emitter = scene.add.particles(x, y, 'flares', {
        frame: 'blue',
        speed: { min: 100, max: 400 },
        angle: { min: 0, max: 360 },
        scale: { start: 0.5, end: 0 },
        blendMode: 'ADD',
        lifespan: 800,
        quantity: 15
    });
    
    // Auto destroy emitter after explosion
    scene.time.delayedCall(800, () => emitter.destroy());

    // Kill entities caught in blast
    entities = entities.filter(ent => {
        if (Phaser.Math.Distance.Between(x, y, ent.x, ent.y) < 100) {
            ent.destroy(); // Remove from Phaser scene
            return false;  // Remove from our array
        }
        return true;
    });
}

function triggerMeteor(scene, x, y) {
    // Fire trail falling from sky
    let meteor = scene.add.particles(x - 400, y - 800, 'flares', {
        frame: 'red', speed: 0, scale: { start: 1, end: 0 }, blendMode: 'ADD', lifespan: 400
    });
    
    scene.tweens.add({
        targets: meteor, x: x, y: y, duration: 400, ease: 'Linear',
        onComplete: () => {
            meteor.destroy();
            // Ground Explosion
            let blast = scene.add.particles(x, y, 'flares', {
                frame: 'yellow', speed: { min: 200, max: 600 }, scale: { start: 1.5, end: 0 },
                blendMode: 'ADD', lifespan: 1000, quantity: 40
            });
            scene.time.delayedCall(1000, () => blast.destroy());
            
            // Screen Shake
            scene.cameras.main.shake(300, 0.02);

            // Kill entities in massive radius
            entities = entities.filter(ent => {
                if (Phaser.Math.Distance.Between(x, y, ent.x, ent.y) < 250) {
                    ent.destroy(); return false;
                }
                return true;
            });
        }
    });
}

// --- 4. GAME LOOP ---
function update(time, delta) {
    // Update Entities AI
    entities.forEach(ent => {
        if (time > ent.aiData.stateTime) {
            // Pick new destination
            let rDist = Phaser.Math.Between(20, 150);
            let rAngle = Phaser.Math.FloatBetween(0, Math.PI * 2);
            ent.aiData.tx = ent.x + Math.cos(rAngle) * rDist;
            ent.aiData.ty = ent.y + Math.sin(rAngle) * rDist;
            ent.aiData.stateTime = time + Phaser.Math.Between(1000, 4000);
        }

        // Move towards destination
        let dist = Phaser.Math.Distance.Between(ent.x, ent.y, ent.aiData.tx, ent.aiData.ty);
        if (dist > 5) {
            let angle = Phaser.Math.Angle.Between(ent.x, ent.y, ent.aiData.tx, ent.aiData.ty);
            ent.setVelocityX(Math.cos(angle) * 60);
            ent.setVelocityY(Math.sin(angle) * 60);
            
            // Handle Sprite Animation Direction
            if (Math.abs(ent.body.velocity.x) > Math.abs(ent.body.velocity.y)) {
                if (ent.body.velocity.x < 0) ent.anims.play('left', true);
                else ent.anims.play('right', true);
            }
        } else {
            ent.setVelocity(0, 0);
            ent.anims.play('turn');
        }
    });
}

// Handle window resize dynamically
window.addEventListener('resize', () => {
    game.scale.resize(window.innerWidth, window.innerHeight);
});