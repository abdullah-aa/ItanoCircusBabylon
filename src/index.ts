import {
    Engine,
    Scene,
    Vector3,
    HemisphericLight,
    MeshBuilder,
    StandardMaterial,
    Color3,
    Texture,
    ParticleSystem,
    Color4,
    Mesh,
    Matrix,
    Quaternion,
    ArcRotateCamera,
    PointLight,
    Space,
    FollowCamera
} from '@babylonjs/core';

import { ASSETS } from './assets.ts'
const MAPPED_ASSETS = ASSETS as Map<string, string>;

// Constants
const MISSILE_SPEED = 2; // Increased for more effective pursuit
const ATTACKER_SPEED = 1.5;
const EVASION_THRESHOLD_MIN = 3;  // Further reduced to allow some missiles to get close enough to explode
const EVASION_THRESHOLD_MAX = 15; // Kept the same for dramatic evasions
const MISSILE_LIFETIME = 10000; // milliseconds
const MISSILE_LAUNCH_INTERVAL_MIN = 1000; // milliseconds
const MISSILE_LAUNCH_INTERVAL_MAX = 3000; // milliseconds
const STATION_SIZE = 20;
const ATTACKER_SIZE = 5;
const MISSILE_SIZE = 2;
const STARFIELD_SIZE = 1000;
const STAR_COUNT = 2000;

// Classes and interfaces
interface IMissile {
    mesh: Mesh;
    container: Mesh;
    trail: ParticleSystem;
    target: Vector3;
    speed: number;
    lifetime: number;
    bezierPaths?: Vector3[][];  // Array of bezier curves, each with 4 control points
    currentBezierPath?: number; // Index of the current bezier path being followed
    bezierTime?: number;
    useBezier: boolean;
    lastPathUpdateTime?: number; // Track when we last updated the path
    targetReached?: boolean;    // Whether the current target point has been reached
}

interface IAttacker {
    mesh: Mesh;
    trail: ParticleSystem;
    target: Vector3;
    currentTarget: Vector3;  // For interpolation between targets
    targetChangeTime: number; // When the target was last changed
    transitionDuration: number; // How long to transition to new target
    speed: number;
    currentSpeed: number;    // For acceleration/deceleration
    evasionThreshold: number;
    lastEvasionTime: number; // When the last evasion maneuver was performed
    isEvading: boolean;      // Whether the attacker is currently evading
    evasionCooldown?: number; // Random cooldown time between evasions
}

// Main function to create the scene
const createScene = (canvas: HTMLCanvasElement): Scene => {
    // Create engine and scene
    const engine = new Engine(canvas, true);
    const scene = new Scene(engine);
    scene.clearColor = new Color4(0, 0, 0, 1); // Black background for space

    // Camera modes
    const CAMERA_MODE = {
        NEUTRAL: 0,
        ATTACKER: 1,
        ATTACKER_SIDE: 2
    };
    let currentCameraMode = CAMERA_MODE.NEUTRAL;

    // We don't need the free camera or station camera anymore as we're using the neutral camera for the free view

    // Create follow camera for attacker (frontview chase camera)
    const attackerCamera = new FollowCamera("attackerCamera", new Vector3(0, 0, -50), scene);
    attackerCamera.minZ = 0.1;
    attackerCamera.maxZ = 2000;
    attackerCamera.radius = 150; // Far distance from the target for frontview chase camera
    attackerCamera.heightOffset = 30; // Positioned high above the target
    attackerCamera.rotationOffset = 0; // View from front (frontview)
    attackerCamera.cameraAcceleration = 0.05; // Smoothing
    attackerCamera.maxCameraSpeed = 10; // Speed limit

    // Create follow camera for attacker (side view camera)
    const attackerSideCamera = new FollowCamera("attackerSideCamera", new Vector3(0, 0, -50), scene);
    attackerSideCamera.minZ = 0.1;
    attackerSideCamera.maxZ = 2000;
    attackerSideCamera.radius = 120; // Slightly closer than front view
    attackerSideCamera.heightOffset = 15; // Not as high as front view
    attackerSideCamera.rotationOffset = 90; // 90 degrees for side view
    attackerSideCamera.cameraAcceleration = 0.05; // Smoothing
    attackerSideCamera.maxCameraSpeed = 10; // Speed limit

    // Create neutral camera for overview of the scene
    const neutralCamera = new ArcRotateCamera("neutralCamera", Math.PI / 4, Math.PI / 3, 300, Vector3.Zero(), scene);
    neutralCamera.minZ = 0.1;
    neutralCamera.maxZ = 2000;
    neutralCamera.lowerRadiusLimit = 150;
    neutralCamera.upperRadiusLimit = 500;
    neutralCamera.setTarget(Vector3.Zero());

    // Set active camera
    scene.activeCamera = neutralCamera;
    neutralCamera.attachControl(canvas, true);

    // Create lights
    const hemisphericLight = new HemisphericLight("hemisphericLight", new Vector3(0, 1, 0), scene);
    hemisphericLight.intensity = 0.5;

    const pointLight = new PointLight("pointLight", Vector3.Zero(), scene);
    pointLight.intensity = 0.5;
    pointLight.diffuse = new Color3(1, 0.8, 0.6);
    pointLight.specular = new Color3(1, 0.8, 0.6);

    // Create starfield
    createStarfield(scene);

    // Create battlestation
    const battlestation = createBattlestation(scene);

    // Create attacker
    const attacker = createAttacker(scene);

    // Set camera targets
    attackerCamera.lockedTarget = attacker.mesh;
    attackerSideCamera.lockedTarget = attacker.mesh;

    // Add keyboard event listener for camera switching
    const switchCamera = () => {
        // Cycle through the three camera modes
        currentCameraMode = (currentCameraMode + 1) % 3; // Cycle through 0, 1, 2

        // Detach controls from all cameras
        if (scene.activeCamera) {
            scene.activeCamera.detachControl(canvas);
        }

        // Set the active camera based on the current mode
        switch (currentCameraMode) {
            case CAMERA_MODE.ATTACKER:
                // Ensure the follow camera is tracking the attacker
                attackerCamera.lockedTarget = attacker.mesh;
                scene.activeCamera = attackerCamera;
                console.log("Camera Mode: Attacker Frontview Chase Camera");
                break;
            case CAMERA_MODE.ATTACKER_SIDE:
                // Ensure the side view camera is tracking the attacker
                attackerSideCamera.lockedTarget = attacker.mesh;
                scene.activeCamera = attackerSideCamera;
                console.log("Camera Mode: Attacker Side View Camera");
                break;
            case CAMERA_MODE.NEUTRAL:
                // Set the neutral camera to view the scene
                neutralCamera.setTarget(Vector3.Zero());
                scene.activeCamera = neutralCamera;
                neutralCamera.attachControl(canvas, true);
                console.log("Camera Mode: Neutral Scene View");
                break;
        }
    };

    // Add keyboard event listener for spacebar
    window.addEventListener("keydown", (event) => {
        if (event.keyCode === 32) { // Spacebar
            switchCamera();
        }
    });

    // Array to store active missiles
    const missiles: IMissile[] = [];

    // Game loop
    // Initialize nextBarrageTime to current time + a small delay to allow the scene to fully load
    let nextBarrageTime = Date.now() + 2000; // 2 second initial delay

    scene.onBeforeRenderObservable.add(() => {
        const currentTime = Date.now();

        // Update attacker movement
        updateAttacker(attacker, battlestation, missiles, scene, currentTime);

        // Update missiles
        updateMissiles(missiles, attacker, currentTime);

        // Update camera targets if needed
        if (currentCameraMode === CAMERA_MODE.NEUTRAL) {
            // Keep the neutral camera focused on the center of the scene
            neutralCamera.setTarget(Vector3.Zero());
        } else if (currentCameraMode === CAMERA_MODE.ATTACKER) {
            // Ensure the attacker camera is tracking the attacker
            attackerCamera.lockedTarget = attacker.mesh;
        } else if (currentCameraMode === CAMERA_MODE.ATTACKER_SIDE) {
            // Ensure the side view camera is tracking the attacker
            attackerSideCamera.lockedTarget = attacker.mesh;
        }
        // The follow cameras automatically follow their lockedTarget

        // Check if we should launch a new barrage
        if (currentTime > nextBarrageTime) {
            // Only launch if no missiles are currently active (previous barrage is gone)
            if (missiles.length === 0) {
                launchMissileBarrage(scene, battlestation, attacker, missiles);

                // Set the next barrage time with a random interval
                nextBarrageTime = currentTime + getRandomInt(MISSILE_LAUNCH_INTERVAL_MIN, MISSILE_LAUNCH_INTERVAL_MAX);
            }
        }

        // Update space station rotation
        if (battlestation.metadata) {
            // Apply current rotation
            battlestation.rotate(
                battlestation.metadata.rotationAxis, 
                battlestation.metadata.rotationSpeed, 
                Space.WORLD
            );

            // Check if it's time to change rotation axis
            if (currentTime > battlestation.metadata.nextRotationChange) {
                // Set new random rotation axis
                battlestation.metadata.rotationAxis = new Vector3(
                    Math.random() - 0.5,
                    Math.random() - 0.5,
                    Math.random() - 0.5
                ).normalize();

                // Set new random rotation speed
                battlestation.metadata.rotationSpeed = getRandomFloat(0.0005, 0.002);

                // Schedule next rotation change
                battlestation.metadata.nextRotationChange = currentTime + getRandomInt(5000, 15000);
            }
        }
    });

    // Start the render loop
    engine.runRenderLoop(() => {
        scene.render();
    });

    // Handle window resize
    window.addEventListener('resize', () => {
        engine.resize();
    });

    return scene;
};

// Create starfield with particles
const createStarfield = (scene: Scene): void => {
    const particleSystem = new ParticleSystem("starfield", STAR_COUNT, scene);

    // Set the texture for the particles
    const texture = MAPPED_ASSETS.get('Flare2.png');
    if (typeof texture === 'string') {
        particleSystem.particleTexture = new Texture(texture, scene);
    }

    // Where the particles come from
    particleSystem.emitter = new Vector3(0, 0, 0); // Center of the scene

    // Emission box - particles emitted from anywhere within this box
    particleSystem.minEmitBox = new Vector3(-STARFIELD_SIZE / 2, -STARFIELD_SIZE / 2, -STARFIELD_SIZE / 2);
    particleSystem.maxEmitBox = new Vector3(STARFIELD_SIZE / 2, STARFIELD_SIZE / 2, STARFIELD_SIZE / 2);

    // Colors of particles
    particleSystem.color1 = new Color4(0.8, 0.8, 0.8, 1.0); // White stars
    particleSystem.color2 = new Color4(0.9, 0.9, 0.9, 1.0); // Slightly brighter white stars
    particleSystem.colorDead = new Color4(0.7, 0.7, 0.7, 0.0); // Fade to gray

    // Size of particles
    particleSystem.minSize = 0.5;
    particleSystem.maxSize = 1.5;

    // Life time of particles
    particleSystem.minLifeTime = Number.MAX_VALUE; // Stars live forever
    particleSystem.maxLifeTime = Number.MAX_VALUE;

    // Emission rate
    particleSystem.emitRate = STAR_COUNT; // Emit all stars at once

    // Blend mode
    particleSystem.blendMode = ParticleSystem.BLENDMODE_ONEONE; // Additive blending for brightness

    // Set the gravity of all particles
    particleSystem.gravity = new Vector3(0, 0, 0); // No gravity in space

    // Direction of particles
    particleSystem.direction1 = new Vector3(0, 0, 0); // No initial direction
    particleSystem.direction2 = new Vector3(0, 0, 0);

    // Power of particles
    particleSystem.minEmitPower = 0;
    particleSystem.maxEmitPower = 0;

    // Start the particle system
    particleSystem.start();
};

// Create the battlestation
const createBattlestation = (scene: Scene): Mesh => {
    const battlestation = MeshBuilder.CreateSphere("battlestation", { diameter: STATION_SIZE }, scene);

    const stationMaterial = new StandardMaterial("stationMaterial", scene);
    stationMaterial.diffuseColor = new Color3(0.5, 0.5, 0.6);
    stationMaterial.specularColor = new Color3(0.2, 0.2, 0.2);
    battlestation.material = stationMaterial;

    // Add some details to the station
    const ring = MeshBuilder.CreateTorus("ring", { diameter: STATION_SIZE * 1.5, thickness: STATION_SIZE / 10 }, scene);
    ring.parent = battlestation;
    ring.rotation.x = Math.PI / 2;

    const ringMaterial = new StandardMaterial("ringMaterial", scene);
    ringMaterial.diffuseColor = new Color3(0.4, 0.4, 0.5);
    ring.material = ringMaterial;

    // Add a second ring at a different angle for more visual interest
    const ring2 = MeshBuilder.CreateTorus("ring2", { diameter: STATION_SIZE * 1.2, thickness: STATION_SIZE / 15 }, scene);
    ring2.parent = battlestation;
    ring2.rotation.x = Math.PI / 4;
    ring2.rotation.y = Math.PI / 4;
    ring2.material = ringMaterial;

    // Add some "modules" to the station
    for (let i = 0; i < 5; i++) {
        const module = MeshBuilder.CreateBox("module" + i, { 
            width: STATION_SIZE / 3, 
            height: STATION_SIZE / 3, 
            depth: STATION_SIZE / 3 
        }, scene);
        module.parent = battlestation;

        // Position modules at random points on the sphere surface
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const radius = STATION_SIZE / 2;

        module.position.x = radius * Math.sin(phi) * Math.cos(theta);
        module.position.y = radius * Math.sin(phi) * Math.sin(theta);
        module.position.z = radius * Math.cos(phi);

        // Orient modules to face outward from center
        const direction = module.position.clone().normalize();
        module.rotationQuaternion = createRotationQuaternion(direction);

        const moduleMaterial = new StandardMaterial("moduleMaterial" + i, scene);
        moduleMaterial.diffuseColor = new Color3(0.6, 0.6, 0.7);
        module.material = moduleMaterial;
    }

    // Set up rotation properties directly on the battlestation
    battlestation.metadata = {
        rotationAxis: new Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
        rotationSpeed: getRandomFloat(0.0005, 0.002),
        nextRotationChange: Date.now() + getRandomInt(5000, 15000)
    };

    return battlestation;
};

// Create the attacking spacecraft
const createAttacker = (scene: Scene): IAttacker => {
    // Create main body
    const attackerMesh = MeshBuilder.CreateBox("attacker", { width: ATTACKER_SIZE, height: ATTACKER_SIZE / 2, depth: ATTACKER_SIZE * 1.5 }, scene);

    const attackerMaterial = new StandardMaterial("attackerMaterial", scene);
    attackerMaterial.diffuseColor = new Color3(0.8, 0.2, 0.2);
    attackerMaterial.specularColor = new Color3(0.5, 0.5, 0.5);
    attackerMesh.material = attackerMaterial;

    // Add wings
    const leftWing = MeshBuilder.CreateBox("leftWing", { width: ATTACKER_SIZE * 0.8, height: ATTACKER_SIZE / 10, depth: ATTACKER_SIZE * 0.6 }, scene);
    leftWing.parent = attackerMesh;
    leftWing.position = new Vector3(-ATTACKER_SIZE * 0.6, 0, 0);

    const rightWing = MeshBuilder.CreateBox("rightWing", { width: ATTACKER_SIZE * 0.8, height: ATTACKER_SIZE / 10, depth: ATTACKER_SIZE * 0.6 }, scene);
    rightWing.parent = attackerMesh;
    rightWing.position = new Vector3(ATTACKER_SIZE * 0.6, 0, 0);

    // Add fins
    const topFin = MeshBuilder.CreateBox("topFin", { width: ATTACKER_SIZE / 10, height: ATTACKER_SIZE * 0.6, depth: ATTACKER_SIZE * 0.5 }, scene);
    topFin.parent = attackerMesh;
    topFin.position = new Vector3(0, ATTACKER_SIZE * 0.4, -ATTACKER_SIZE * 0.4);

    const bottomFin = MeshBuilder.CreateBox("bottomFin", { width: ATTACKER_SIZE / 10, height: ATTACKER_SIZE * 0.6, depth: ATTACKER_SIZE * 0.5 }, scene);
    bottomFin.parent = attackerMesh;
    bottomFin.position = new Vector3(0, -ATTACKER_SIZE * 0.4, -ATTACKER_SIZE * 0.4);

    // Add engine thrusters
    const leftThruster = MeshBuilder.CreateCylinder("leftThruster", { height: ATTACKER_SIZE * 0.4, diameter: ATTACKER_SIZE * 0.2 }, scene);
    leftThruster.parent = attackerMesh;
    leftThruster.position = new Vector3(-ATTACKER_SIZE * 0.3, -ATTACKER_SIZE * 0.1, -ATTACKER_SIZE * 0.8);
    leftThruster.rotation.x = Math.PI / 2;

    const rightThruster = MeshBuilder.CreateCylinder("rightThruster", { height: ATTACKER_SIZE * 0.4, diameter: ATTACKER_SIZE * 0.2 }, scene);
    rightThruster.parent = attackerMesh;
    rightThruster.position = new Vector3(ATTACKER_SIZE * 0.3, -ATTACKER_SIZE * 0.1, -ATTACKER_SIZE * 0.8);
    rightThruster.rotation.x = Math.PI / 2;

    // Apply materials to the additional parts
    const wingMaterial = new StandardMaterial("wingMaterial", scene);
    wingMaterial.diffuseColor = new Color3(0.6, 0.1, 0.1);
    wingMaterial.specularColor = new Color3(0.3, 0.3, 0.3);

    leftWing.material = wingMaterial;
    rightWing.material = wingMaterial;
    topFin.material = wingMaterial;
    bottomFin.material = wingMaterial;

    const thrusterMaterial = new StandardMaterial("thrusterMaterial", scene);
    thrusterMaterial.diffuseColor = new Color3(0.3, 0.3, 0.3);
    thrusterMaterial.emissiveColor = new Color3(0.1, 0.1, 0.1);

    leftThruster.material = thrusterMaterial;
    rightThruster.material = thrusterMaterial;

    // Position the attacker at a distance from the origin
    attackerMesh.position = new Vector3(
        getRandomFloat(-100, 100),
        getRandomFloat(-100, 100),
        getRandomFloat(-100, 100)
    );

    // Create smoke trail for the attacker
    const attackerTrail = new ParticleSystem("attackerTrail", 500, scene);
    const attackerTrailTexture = MAPPED_ASSETS.get('flare.png');
    if (typeof attackerTrailTexture === 'string') {
        attackerTrail.particleTexture = new Texture(attackerTrailTexture, scene);
    }
    attackerTrail.emitter = attackerMesh;
    attackerTrail.minEmitBox = new Vector3(-0.5, -0.5, -2);
    attackerTrail.maxEmitBox = new Vector3(0.5, 0.5, -2);

    attackerTrail.color1 = new Color4(0.8, 0.8, 0.8, 0.1);
    attackerTrail.color2 = new Color4(0.7, 0.7, 0.7, 0.1);
    attackerTrail.colorDead = new Color4(0.5, 0.5, 0.5, 0);

    attackerTrail.minSize = 0.5;
    attackerTrail.maxSize = 1.5;
    attackerTrail.minLifeTime = 0.5;
    attackerTrail.maxLifeTime = 1.0;
    attackerTrail.emitRate = 100;
    attackerTrail.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    attackerTrail.gravity = new Vector3(0, 0, 0);
    attackerTrail.direction1 = new Vector3(-0.2, -0.2, -1);
    attackerTrail.direction2 = new Vector3(0.2, 0.2, -1);
    attackerTrail.minEmitPower = 1;
    attackerTrail.maxEmitPower = 2;
    attackerTrail.updateSpeed = 0.01;

    attackerTrail.start();

    // Generate an initial target position around the battlestation
    const initialAngle = Math.random() * Math.PI * 2;
    const initialHeight = getRandomFloat(-120, 120);
    const initialRadius = getRandomFloat(50, 250);

    // Create initial target position
    const initialTarget = new Vector3(
        Math.cos(initialAngle) * initialRadius,
        initialHeight,
        Math.sin(initialAngle) * initialRadius
    );

    return {
        mesh: attackerMesh,
        trail: attackerTrail,
        // Initially target a random position (will be updated in first frame to be relative to battlestation)
        target: initialTarget.clone(),
        currentTarget: initialTarget.clone(), // Start with current target same as target
        targetChangeTime: Date.now(),
        transitionDuration: 2000, // 2 seconds to transition between targets
        speed: ATTACKER_SPEED,
        currentSpeed: ATTACKER_SPEED * 0.5, // Start at half speed and accelerate
        // 30% chance of a low threshold to allow missiles to get closer from the start
        evasionThreshold: Math.random() < 0.3 
            ? getRandomFloat(EVASION_THRESHOLD_MIN, EVASION_THRESHOLD_MIN + 2)
            : getRandomFloat(EVASION_THRESHOLD_MIN + 3, EVASION_THRESHOLD_MAX),
        lastEvasionTime: 0,
        isEvading: false
    };
};

// Launch a barrage of missiles from the battlestation
const launchMissileBarrage = (scene: Scene, battlestation: Mesh, attacker: IAttacker, missiles: IMissile[]): void => {
    const missileCount = getRandomInt(3, 8); // Random number of missiles in a barrage

    for (let i = 0; i < missileCount; i++) {
        // Create missile with slight delay between each
        setTimeout(() => {
            const missile = createMissile(scene, battlestation.position, attacker.mesh.position);
            missiles.push(missile);
        }, i * 100); // 100ms delay between each missile in the barrage
    }
};

// Create a single missile
const createMissile = (scene: Scene, startPosition: Vector3, targetPosition: Vector3): IMissile => {
    // Create a simple cone for the missile
    const missileMesh = MeshBuilder.CreateCylinder("missile", {
        height: MISSILE_SIZE * 3,
        diameterTop: 0,
        diameterBottom: MISSILE_SIZE,
        tessellation: 24 // Higher tessellation for smoother cone
    }, scene);

    const missileMaterial = new StandardMaterial("missileMaterial", scene);
    missileMaterial.diffuseColor = new Color3(0.8, 0.8, 0.8);
    missileMaterial.specularColor = new Color3(0.3, 0.3, 0.3);
    missileMaterial.emissiveColor = new Color3(0.1, 0.1, 0.1);
    missileMesh.material = missileMaterial;

    // Position the missile
    missileMesh.position = startPosition.clone();

    // By default, cylinders in Babylon.js are created along the y-axis
    // We need to create a parent mesh to handle the orientation properly
    const missileContainer = new Mesh("missileContainer", scene);
    missileMesh.parent = missileContainer;

    // Rotate the missile mesh 90 degrees around the x-axis to align the cone apex with the z-axis
    missileMesh.rotation.x = Math.PI / 2;

    // Position the container at the start position
    missileContainer.position = startPosition.clone();

    // Calculate a target point along the attacker's current path
    // This is based on the attacker's velocity and the missile's velocity
    const attackerDirection = targetPosition.subtract(startPosition);
    attackerDirection.normalize();

    // Calculate a point significantly ahead of the attacker to create overshoot
    // The higher the missile speed relative to attacker speed, the further the interception point
    const speedRatio = MISSILE_SPEED / ATTACKER_SPEED;
    const distanceToTarget = Vector3.Distance(startPosition, targetPosition);
    // Calculate a much larger intercept distance to ensure significant overshooting
    const rawInterceptDistance = distanceToTarget / speedRatio;
    // Allow for much larger intercept distances (3x the original distance and up to 120 units)
    const maxInterceptDistance = Math.min(distanceToTarget * 1.5, 120);
    const interceptDistance = Math.min(rawInterceptDistance * 2, maxInterceptDistance);

    // Calculate the interception point along the attacker's path
    const interceptPoint = targetPosition.add(attackerDirection.scale(interceptDistance));

    // Look at initial target direction
    const direction = interceptPoint.subtract(startPosition);
    if (direction.length() > 0.01) {
        // Create a rotation quaternion that will orient the container toward the target
        missileContainer.rotationQuaternion = createRotationQuaternion(direction);
    }

    // Create enhanced smoke trail for the missile
    const missileTrail = new ParticleSystem("missileTrail", 500, scene);
    const missileTrailTexture = MAPPED_ASSETS.get('flare3.png')
    if (typeof missileTrailTexture === 'string') {
        missileTrail.particleTexture = new Texture(missileTrailTexture, scene);
    }
    missileTrail.emitter = missileMesh;
    // Adjust emit box to account for the rotated missile mesh
    missileTrail.minEmitBox = new Vector3(0, -MISSILE_SIZE * 1.6, 0); // Emit from inner nozzle
    missileTrail.maxEmitBox = new Vector3(0, -MISSILE_SIZE * 1.6, 0);

    // Two-stage color for more realistic rocket exhaust
    missileTrail.color1 = new Color4(1, 0.7, 0.1, 0.8); // Bright yellow-orange core
    missileTrail.color2 = new Color4(1, 0.3, 0.1, 0.6); // Darker orange-red variation
    missileTrail.colorDead = new Color4(0.5, 0.5, 0.5, 0); // Fade to gray smoke

    // Particle size variation for more dynamic effect
    missileTrail.minSize = 0.2;
    missileTrail.maxSize = 1.2;

    // Longer lifetime for trailing smoke effect
    missileTrail.minLifeTime = 0.2;
    missileTrail.maxLifeTime = 0.6;

    // Higher emit rate for denser exhaust
    missileTrail.emitRate = 200;

    // Additive blend mode for brighter core
    missileTrail.blendMode = ParticleSystem.BLENDMODE_ADD;

    // No gravity effect
    missileTrail.gravity = new Vector3(0, 0, 0);

    // Wider cone of particles
    missileTrail.direction1 = new Vector3(-0.15, -0.15, -1);
    missileTrail.direction2 = new Vector3(0.15, 0.15, -1);

    // Higher emit power for longer trail
    missileTrail.minEmitPower = 1;
    missileTrail.maxEmitPower = 2;

    // Faster update for smoother animation
    missileTrail.updateSpeed = 0.005;

    // Add angular velocity for swirling effect
    missileTrail.minAngularSpeed = 0;
    missileTrail.maxAngularSpeed = Math.PI;

    missileTrail.start();

    // All missiles use bezier paths for more interesting movement
    const useBezier = true;

    // Create random multi-bezier path from start to intercept point
    const bezierPaths = createMultiBezierPath(startPosition, interceptPoint);

    // Random initial speed for more varied missile behavior
    const initialSpeed = MISSILE_SPEED * getRandomFloat(0.8, 1.2);

    return {
        mesh: missileMesh,
        container: missileContainer,
        trail: missileTrail,
        target: interceptPoint.clone(), // Target the intercept point, not the attacker directly
        speed: initialSpeed, // Random initial speed
        lifetime: Date.now() + MISSILE_LIFETIME,
        bezierPaths,
        currentBezierPath: 0, // Start with the first bezier path
        bezierTime: 0,
        useBezier,
        lastPathUpdateTime: Date.now(), // Track when we last updated the path
        targetReached: false
    };
};

// Update attacker movement and actions
const updateAttacker = (
    attacker: IAttacker, 
    battlestation: Mesh, 
    missiles: IMissile[], 
    scene: Scene,
    currentTime: number
): void => {
    // Define evasion cooldown period (milliseconds) - now with randomness
    const EVASION_COOLDOWN_MIN = 1500; // 1.5 seconds minimum cooldown
    const EVASION_COOLDOWN_MAX = 4000; // 4 seconds maximum cooldown

    // Use the stored cooldown or generate a new one if not set
    if (!attacker.evasionCooldown) {
        attacker.evasionCooldown = getRandomInt(EVASION_COOLDOWN_MIN, EVASION_COOLDOWN_MAX);
    }

    // Check if any missiles are too close and need evasion
    let closestMissileDistance = Number.MAX_VALUE;
    let closestMissile: IMissile | null = null;
    let needsEvasion = false;

    // Only check for evasion if we're not already evading or if the evasion maneuver has been going on for a while
    const canEvade = !attacker.isEvading || (currentTime - attacker.lastEvasionTime > attacker.transitionDuration * 0.8);

    if (canEvade) {
        for (const missile of missiles) {
            const distance = Vector3.Distance(attacker.mesh.position, missile.mesh.position);
            if (distance < closestMissileDistance) {
                closestMissileDistance = distance;
                closestMissile = missile;
            }

            // Only trigger evasion if the missile is closer than threshold and we're not in cooldown
            if (distance < attacker.evasionThreshold && 
                (currentTime - attacker.lastEvasionTime > attacker.evasionCooldown)) {
                needsEvasion = true;
                break;
            }
        }
    }

    // Check if we need to update the target
    let targetUpdated = false;

    // If evasion is needed, set a new target away from the closest missile
    if (needsEvasion && closestMissile) {
        // Calculate direction from missile to attacker
        const evadeDirection = attacker.mesh.position.subtract(closestMissile.mesh.position);
        evadeDirection.normalize();

        // Calculate evasion factor based on how close the missile is
        // The closer the missile, the more extreme the evasion
        const proximityFactor = Math.min(1.0, attacker.evasionThreshold / closestMissileDistance);
        // Scale from 0.7 (far) to 2.5 (very close)
        const evasionFactor = 0.7 + (proximityFactor * 1.8);

        // Save current target before updating
        attacker.currentTarget = attacker.target.clone();
        attacker.targetChangeTime = currentTime;
        attacker.lastEvasionTime = currentTime;
        attacker.isEvading = true;

        // Set new evasion target - more purposeful by moving away from missile in a clear direction
        // Use the direction from missile to attacker with minimal randomness
        const evasionDistance = 60 * evasionFactor; // Evasion distance now depends on proximity

        // Calculate a more structured evasion direction
        // Add a perpendicular component that increases with proximity
        const perpComponent = 0.3 + (proximityFactor * 0.4); // 30% to 70% perpendicular movement
        const perpVector = new Vector3(
            evadeDirection.y, 
            -evadeDirection.x, 
            evadeDirection.z
        ).normalize().scale(evasionDistance * perpComponent);

        attacker.target = new Vector3(
            attacker.mesh.position.x + evadeDirection.x * evasionDistance + perpVector.x,
            attacker.mesh.position.y + evadeDirection.y * evasionDistance + perpVector.y,
            attacker.mesh.position.z + evadeDirection.z * evasionDistance + perpVector.z
        );

        // Transition duration depends on proximity - faster reaction when missile is closer
        attacker.transitionDuration = 2000 - (proximityFactor * 1000); // 1-2 seconds based on proximity
        targetUpdated = true;

        // Reset evasion threshold for next time - allow for occasional close approaches
        // 30% chance of a low threshold to allow missiles to get closer
        if (Math.random() < 0.3) {
            attacker.evasionThreshold = getRandomFloat(EVASION_THRESHOLD_MIN, EVASION_THRESHOLD_MIN + 2);
        } else {
            attacker.evasionThreshold = getRandomFloat(EVASION_THRESHOLD_MIN + 3, EVASION_THRESHOLD_MAX - 3);
        }

        // Set a new random cooldown period for the next evasion
        attacker.evasionCooldown = getRandomInt(EVASION_COOLDOWN_MIN, EVASION_COOLDOWN_MAX);
    }
    // Continuously update target to ensure constant movement around the space station
    // Check if we're close to the target or if we've been moving toward the same target for too long
    else if ((Vector3.Distance(attacker.mesh.position, attacker.target) < 25 || 
             (currentTime - attacker.targetChangeTime) > attacker.transitionDuration * 1.5)) {

        // Save current target before updating
        attacker.currentTarget = attacker.target.clone();
        attacker.targetChangeTime = currentTime;

        // Reset evasion state if we were evading
        if (attacker.isEvading) {
            attacker.isEvading = false;
        }

        // Generate a new target position that's around the battlestation but at varying distances
        const angle = Math.random() * Math.PI * 2;
        const height = getRandomFloat(-120, 120);
        const radius = getRandomFloat(150, 250); // More consistent radius for smoother paths

        // Make the target relative to the battlestation's position
        attacker.target = new Vector3(
            battlestation.position.x + Math.cos(angle) * radius,
            battlestation.position.y + height,
            battlestation.position.z + Math.sin(angle) * radius
        );

        // Use longer transition for normal movement
        attacker.transitionDuration = 3500; // 3.5 seconds for smoother normal transitions
        targetUpdated = true;
    }
    // Very rarely update target to prevent predictable patterns
    // Extremely low probability to minimize random shaking - only for long-term variation
    else if (Math.random() < 0.0001 && (currentTime - attacker.targetChangeTime) > attacker.transitionDuration * 5) {

        // Save current target before updating
        attacker.currentTarget = attacker.target.clone();
        attacker.targetChangeTime = currentTime;

        // Reset evasion state if we were evading
        if (attacker.isEvading) {
            attacker.isEvading = false;
        }

        // Generate a new target position that's around the battlestation but at varying distances
        const angle = Math.random() * Math.PI * 2;
        const height = getRandomFloat(-120, 120);
        const radius = getRandomFloat(180, 300); // More consistent radius range for smoother paths

        // Make the target relative to the battlestation's position
        attacker.target = new Vector3(
            battlestation.position.x + Math.cos(angle) * radius,
            battlestation.position.y + height,
            battlestation.position.z + Math.sin(angle) * radius
        );

        // Use longer transition for random changes
        attacker.transitionDuration = 7000; // 7 seconds for even smoother random transitions
        targetUpdated = true;
    }

    // Calculate interpolation factor based on elapsed time
    const elapsedTime = currentTime - attacker.targetChangeTime;
    const t = Math.min(elapsedTime / attacker.transitionDuration, 1.0);

    // Use smooth step interpolation for more natural movement
    const smoothT = t * t * (3 - 2 * t);

    // Interpolate between current target and new target
    const interpolatedTarget = new Vector3(
        attacker.currentTarget.x + (attacker.target.x - attacker.currentTarget.x) * smoothT,
        attacker.currentTarget.y + (attacker.target.y - attacker.currentTarget.y) * smoothT,
        attacker.currentTarget.z + (attacker.target.z - attacker.currentTarget.z) * smoothT
    );

    // Calculate direction to the interpolated target
    const direction = interpolatedTarget.subtract(attacker.mesh.position);

    if (direction.length() > 0.01) {
        direction.normalize();

        // Adjust speed based on direction change
        // If target was just updated, gradually accelerate to full speed
        if (targetUpdated) {
            attacker.currentSpeed = Math.max(attacker.speed * 0.5, attacker.currentSpeed);
        } 
        // Otherwise, accelerate/decelerate smoothly
        else {
            // Accelerate to full speed
            attacker.currentSpeed = Math.min(
                attacker.speed,
                attacker.currentSpeed + (attacker.speed * 0.02)
            );
        }

        // Update position with current speed
        attacker.mesh.position.addInPlace(direction.scale(attacker.currentSpeed));

        // Update rotation to face movement direction - do this smoothly
        const targetQuaternion = createRotationQuaternion(direction);

        // If attacker doesn't have a rotation quaternion yet, set it directly
        if (!attacker.mesh.rotationQuaternion) {
            attacker.mesh.rotationQuaternion = targetQuaternion;
        } 
        // Otherwise, interpolate rotation for smooth turning
        else {
            Quaternion.SlerpToRef(
                attacker.mesh.rotationQuaternion,
                targetQuaternion,
                0.1, // Adjust this value for smoother or quicker rotation
                attacker.mesh.rotationQuaternion
            );
        }
    }

};

const createExplosionEffect = (position: Vector3, scene: Scene, baseTextureName: string, color1: Color4, color2: Color4, minSize: number, maxSize: number): ParticleSystem => {
    const explosion = new ParticleSystem("explosion", 500, scene); // Consider unique names or a counter
    const textureAsset = MAPPED_ASSETS.get(baseTextureName);
    if (typeof textureAsset === 'string') {
        explosion.particleTexture = new Texture(textureAsset, scene);
    }
    explosion.emitter = position.clone(); // Clone to avoid modifying original

    explosion.color1 = color1;
    explosion.color2 = color2;
    explosion.colorDead = new Color4(0.5, 0.3, 0.1, 0); // Or make this a parameter

    explosion.minSize = minSize;
    explosion.maxSize = maxSize;
    explosion.minLifeTime = 0.2; // Or make these parameters
    explosion.maxLifeTime = 0.4;
    explosion.emitRate = 400; // Or make this a parameter
    explosion.blendMode = ParticleSystem.BLENDMODE_ADD;
    explosion.gravity = Vector3.Zero();
    explosion.minEmitPower = 4; // Or make these parameters
    explosion.maxEmitPower = 8;
    explosion.minAngularSpeed = 0;
    explosion.maxAngularSpeed = Math.PI;
    explosion.updateSpeed = 0.01;

    explosion.start();

    // Dispose after a short delay
    setTimeout(() => {
        explosion.dispose();
    }, 500); // Or make this a parameter

    return explosion;
};

// Update all missiles
const updateMissiles = (missiles: IMissile[], attacker: IAttacker, currentTime: number): void => {
    // Define constants for path recalculation
    const PATH_UPDATE_INTERVAL_MIN = 2500; // Minimum time between path updates (ms)
    const PATH_UPDATE_INTERVAL_MAX = 5000; // Maximum time between path updates (ms)

    for (let i = missiles.length - 1; i >= 0; i--) {
        const missile = missiles[i];

        // Check if missile has expired
        if (currentTime > missile.lifetime) {
            // Create explosion effect for expired missile
            createExplosionEffect(
                missile.container.position,
                missile.container.getScene(),
                'cloud.png',
                new Color4(1, 0.7, 0.1, 1),
                new Color4(1, 0.5, 0.1, 1),
                0.8,
                2.5
            );

            // Remove the missile
            missile.trail.dispose();
            missile.mesh.dispose();
            missile.container.dispose();
            missiles.splice(i, 1);
            continue;
        }

        // Calculate distance to attacker for dynamic adjustments
        const distanceToAttacker = Vector3.Distance(missile.container.position, attacker.mesh.position);

        // Check if it's time to recalculate the flight path
        const timeSinceLastUpdate = currentTime - (missile.lastPathUpdateTime || 0);
        const shouldUpdatePath = 
            timeSinceLastUpdate > getRandomInt(PATH_UPDATE_INTERVAL_MIN, PATH_UPDATE_INTERVAL_MAX) ||
            missile.targetReached ||
            (distanceToAttacker < 50 && Math.random() < 0.1); // Higher chance to update when close

        if (shouldUpdatePath) {
            // Get attacker's current direction
            const attackerDirection = attacker.mesh.getDirection(new Vector3(0, 0, 1));

            // Calculate a random distance in front of the attacker
            // Significantly increased distances to make missiles overshoot the attacker
            let interceptDistance;
            if (distanceToAttacker < 30) {
                // When close, still overshoot significantly
                interceptDistance = getRandomFloat(60, 100);
            } else if (distanceToAttacker < 80) {
                // Medium distance, larger overshoot
                interceptDistance = getRandomFloat(80, 140);
            } else {
                // Far away, maximum overshoot
                interceptDistance = getRandomFloat(100, 180);
            }

            // Calculate the interception point along the attacker's path
            const interceptPoint = attacker.mesh.position.clone().add(attackerDirection.scale(interceptDistance));

            // Update the missile's target to the new intercept point
            missile.target = interceptPoint.clone();

            // Change missile velocity randomly
            missile.speed = MISSILE_SPEED * getRandomFloat(0.8, 1.5);

            // Create a new random multi-bezier path from current position to the new target
            if (distanceToAttacker < 30) {
                // Create a more direct and aggressive path when close
                const toTarget = missile.target.subtract(missile.container.position);
                const direction = toTarget.normalize();

                // More curved approach even when close
                // Create a perpendicular vector for the curve
                const perpVector = new Vector3(direction.y, -direction.x, direction.z).normalize();
                // Add random variation to perpendicular vector
                perpVector.x += getRandomFloat(-0.2, 0.2);
                perpVector.y += getRandomFloat(-0.2, 0.2);
                perpVector.z += getRandomFloat(-0.2, 0.2);
                perpVector.normalize();

                // Calculate curve offset based on distance
                const curveOffset = distanceToAttacker * getRandomFloat(0.3, 0.5);

                const singleBezierPath = [
                    missile.container.position.clone(),
                    // First control point - with perpendicular offset
                    missile.container.position.add(direction.scale(distanceToAttacker * 0.3))
                                           .add(perpVector.scale(curveOffset)),
                    // Second control point - with opposite perpendicular offset
                    missile.target.subtract(direction.scale(distanceToAttacker * 0.2))
                               .subtract(perpVector.scale(curveOffset * 0.7)),
                    missile.target.clone()
                ];

                missile.bezierPaths = [singleBezierPath];
            } else {
                // Multi-bezier path for farther missiles
                missile.bezierPaths = createMultiBezierPath(
                    missile.container.position.clone(),
                    missile.target.clone()
                );
            }

            // Reset bezier path tracking
            missile.currentBezierPath = 0;
            missile.bezierTime = 0;
            missile.targetReached = false;

            // Update the last path update time
            missile.lastPathUpdateTime = currentTime;
        }

        // All missiles use bezier paths
        if (missile.bezierPaths && missile.bezierPaths.length > 0) {
            // Initialize bezier path tracking if needed
            if (missile.currentBezierPath === undefined) {
                missile.currentBezierPath = 0;
            }
            if (missile.bezierTime === undefined) {
                missile.bezierTime = 0;
            }

            // Get the current bezier path
            const currentPath = missile.bezierPaths[missile.currentBezierPath];

            // Adjust missile speed based on distance to attacker
            let currentSpeed = missile.speed;

            // Boost speed when getting close to attacker for more aggressive pursuit
            if (distanceToAttacker < 30) {
                // Significant speed boost when very close
                currentSpeed = missile.speed * 1.5;
            } else if (distanceToAttacker < 60) {
                // Moderate speed boost when approaching
                currentSpeed = missile.speed * 1.2;
            }

            // Advance along the bezier curve with adjusted speed
            missile.bezierTime += currentSpeed * 0.01;

            // Check if we've reached the end of the current bezier curve
            if (missile.bezierTime >= 1) {
                // Move to the next bezier curve if available
                if (missile.currentBezierPath < missile.bezierPaths.length - 1) {
                    missile.currentBezierPath++;
                    missile.bezierTime = 0;
                } else {
                    // We've reached the end of all bezier curves
                    missile.targetReached = true;
                    // Keep bezierTime at 1 to stay at the end of the curve
                    missile.bezierTime = 1;
                }
            }

            // Calculate position on current bezier curve
            const newPosition = calculateBezierPoint(
                missile.bezierTime,
                currentPath[0],
                currentPath[1],
                currentPath[2],
                currentPath[3]
            );

            // Calculate direction for rotation
            const direction = newPosition.subtract(missile.container.position);
            if (direction.length() > 0.01) {
                direction.normalize();

                // Update rotation to face movement direction
                missile.container.rotationQuaternion = createRotationQuaternion(direction);
            }

            // Update missile container position
            missile.container.position.copyFrom(newPosition);
        }

        // Check if missile has hit the attacker
        if (Vector3.Distance(missile.container.position, attacker.mesh.position) < ATTACKER_SIZE / 2) {
            // Create explosion effect
              createExplosionEffect(
                missile.container.position,
                missile.container.getScene(),
                'fire.png',
                new Color4(1, 0.5, 0, 1),
                new Color4(1, 0.2, 0, 1),
                1,
                3
            );

            // Remove the missile
            missile.trail.dispose();
            missile.mesh.dispose();
            missile.container.dispose();
            missiles.splice(i, 1);
        }
    }
};

// Create a single bezier curve from start to target position
const createBezierPath = (startPos: Vector3, targetPos: Vector3): Vector3[] => {
    const toTarget = targetPos.subtract(startPos);
    const distance = toTarget.length();
    const direction = toTarget.normalize();

    // Calculate a midpoint along the direct path with some randomness
    const midPointOffset = getRandomFloat(0.4, 0.6); // Randomize midpoint position
    const midPoint = startPos.add(direction.scale(distance * midPointOffset));

    // Create a perpendicular vector for the curve
    // Randomly choose between different perpendicular vectors for more diversity
    let perpendicular;
    const randomChoice = Math.random();

    if (randomChoice < 0.33) {
        // Option 1: Standard perpendicular in XY plane
        perpendicular = new Vector3(direction.y, -direction.x, direction.z);
    } else if (randomChoice < 0.66) {
        // Option 2: Perpendicular in XZ plane
        perpendicular = new Vector3(direction.z, direction.y, -direction.x);
    } else {
        // Option 3: Perpendicular in YZ plane
        perpendicular = new Vector3(direction.x, direction.z, -direction.y);
    }

    // Normalize and add some random variation to the perpendicular vector
    perpendicular.normalize();

    // Add a larger random component to make paths more varied and windy
    perpendicular.x += getRandomFloat(-0.3, 0.3);
    perpendicular.y += getRandomFloat(-0.3, 0.3);
    perpendicular.z += getRandomFloat(-0.3, 0.3);
    perpendicular.normalize();

    // Increase the curve offset for more windy paths
    // Use a larger multiplier to create more extreme curves
    const curveOffset = distance * getRandomFloat(0.4, 0.7);

    // Create bezier points with more variation for windier paths
    return [
        startPos.clone(),
        // First control point - with more extreme randomization
        startPos.add(direction.scale(distance * getRandomFloat(0.15, 0.3)))
               .add(perpendicular.scale(curveOffset * getRandomFloat(0.5, 1.0))),
        // Second control point - with more extreme randomization
        midPoint.add(direction.scale(distance * getRandomFloat(0.1, 0.25)))
               .add(perpendicular.scale(curveOffset * getRandomFloat(0.6, 1.2))),
        targetPos.clone()
    ];
};

// Create a path composed of multiple bezier curves from start to target position
const createMultiBezierPath = (startPos: Vector3, targetPos: Vector3): Vector3[][] => {
    // Determine a random number of bezier curves (2-4)
    const numCurves = getRandomInt(2, 4);

    // Create an array to hold all bezier curves
    const bezierPaths: Vector3[][] = [];

    // Calculate intermediate points between start and target
    const toTarget = targetPos.subtract(startPos);
    const totalDistance = toTarget.length();
    const direction = toTarget.normalize();

    // Create intermediate points with some randomness
    const intermediatePoints: Vector3[] = [startPos.clone()];

    for (let i = 1; i < numCurves; i++) {
        // Calculate position along the path with some randomness
        const segmentOffset = i / numCurves;
        const randomOffset = getRandomFloat(-0.1, 0.1); // Add some randomness to segment position
        const segmentPosition = segmentOffset + randomOffset;

        // Create a perpendicular vector for offset
        let perpVector;
        if (Math.random() < 0.5) {
            perpVector = new Vector3(direction.y, -direction.x, direction.z);
        } else {
            perpVector = new Vector3(direction.z, direction.y, -direction.x);
        }
        perpVector.normalize();

        // Add random perpendicular offset
        const perpOffset = totalDistance * getRandomFloat(0.2, 0.5);

        // Create intermediate point
        const intermediatePoint = startPos.add(direction.scale(totalDistance * segmentPosition))
                                         .add(perpVector.scale(perpOffset));

        intermediatePoints.push(intermediatePoint);
    }

    // Add the final target point
    intermediatePoints.push(targetPos.clone());

    // Create bezier curves between each pair of intermediate points
    for (let i = 0; i < numCurves; i++) {
        const curveStart = intermediatePoints[i];
        const curveEnd = intermediatePoints[i + 1];

        // Create a bezier curve between these points
        const bezierCurve = createBezierPath(curveStart, curveEnd);
        bezierPaths.push(bezierCurve);
    }

    return bezierPaths;
};

// Calculate point on a cubic bezier curve
const calculateBezierPoint = (t: number, p0: Vector3, p1: Vector3, p2: Vector3, p3: Vector3): Vector3 => {
    const oneMinusT = 1 - t;
    const oneMinusTSquared = oneMinusT * oneMinusT;
    const oneMinusTCubed = oneMinusTSquared * oneMinusT;
    const tSquared = t * t;
    const tCubed = tSquared * t;

    const x = oneMinusTCubed * p0.x + 3 * oneMinusTSquared * t * p1.x + 3 * oneMinusT * tSquared * p2.x + tCubed * p3.x;
    const y = oneMinusTCubed * p0.y + 3 * oneMinusTSquared * t * p1.y + 3 * oneMinusT * tSquared * p2.y + tCubed * p3.y;
    const z = oneMinusTCubed * p0.z + 3 * oneMinusTSquared * t * p1.z + 3 * oneMinusT * tSquared * p2.z + tCubed * p3.z;

    return new Vector3(x, y, z);
};

// Utility function to get random integer between min and max (inclusive)
const getRandomInt = (min: number, max: number): number => {
    return Math.floor(Math.random() * (max - min + 1)) + min;
};

// Utility function to get random float between min and max
const getRandomFloat = (min: number, max: number): number => {
    return Math.random() * (max - min) + min;
};

// Helper function to create a quaternion rotation from a direction vector
const createRotationQuaternion = (direction: Vector3, upVector: Vector3 = Vector3.Up()): Quaternion => {
    const rotationMatrix = Matrix.LookAtLH(Vector3.Zero(), direction, upVector);
    rotationMatrix.invert();
    return Quaternion.FromRotationMatrix(rotationMatrix);
};

// Initialize the scene when the window loads
window.addEventListener('DOMContentLoaded', () => {
    const canvasElement = document.getElementById('renderCanvas');
    if (canvasElement && canvasElement instanceof HTMLCanvasElement) {
        createScene(canvasElement);
    } else {
        console.error('Canvas element not found or is not a canvas element');
    }
});
