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

// Constants
const MISSILE_SPEED = 1.5; // Increased for more effective pursuit
const ATTACKER_SPEED = 1.5;
const EVASION_THRESHOLD_MIN = 3;  // Further reduced to allow some missiles to get close enough to explode
const EVASION_THRESHOLD_MAX = 15; // Kept the same for dramatic evasions
const MISSILE_LIFETIME = 10000; // milliseconds
const MISSILE_LAUNCH_INTERVAL_MIN = 1000; // milliseconds
const MISSILE_LAUNCH_INTERVAL_MAX = 3000; // milliseconds
const PLASMA_SHOT_INTERVAL = 2000; // milliseconds
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
    bezierPoints?: Vector3[];
    bezierTime?: number;
    useBezier: boolean;
    lastPathUpdateTime?: number; // Track when we last updated the path
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
    lastShotTime: number;
    lastEvasionTime: number; // When the last evasion maneuver was performed
    isEvading: boolean;      // Whether the attacker is currently evading
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
        ATTACKER: 1
    };
    let currentCameraMode = CAMERA_MODE.NEUTRAL;

    // We don't need the free camera or station camera anymore as we're using the neutral camera for the free view

    // Create follow camera for attacker (frontview chase camera)
    const attackerCamera = new FollowCamera("attackerCamera", new Vector3(0, 0, -50), scene);
    attackerCamera.minZ = 0.1;
    attackerCamera.maxZ = 2000;
    attackerCamera.radius = 100; // Far distance from the target for frontview chase camera
    attackerCamera.heightOffset = 30; // Positioned high above the target
    attackerCamera.rotationOffset = 0; // View from front (frontview)
    attackerCamera.cameraAcceleration = 0.05; // Smoothing
    attackerCamera.maxCameraSpeed = 10; // Speed limit

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

    // Add keyboard event listener for camera switching
    const switchCamera = () => {
        // Toggle between the two camera modes
        currentCameraMode = currentCameraMode === CAMERA_MODE.NEUTRAL ? CAMERA_MODE.ATTACKER : CAMERA_MODE.NEUTRAL;

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
        }
        // The attackerCamera automatically follows its lockedTarget

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
    const starfieldParticles = new ParticleSystem("starfield", STAR_COUNT, scene);
    starfieldParticles.particleTexture = new Texture("https://raw.githubusercontent.com/BabylonJS/Babylon.js/master/assets/textures/flare.png", scene);

    // Use large but finite lifetime values to ensure particles are visible
    starfieldParticles.minLifeTime = 1000;
    starfieldParticles.maxLifeTime = 1000;
    starfieldParticles.minSize = 0.1;
    starfieldParticles.maxSize = 0.5;
    starfieldParticles.emitRate = STAR_COUNT;
    starfieldParticles.minEmitPower = 0;
    starfieldParticles.maxEmitPower = 0;
    starfieldParticles.updateSpeed = 0.01;

    // Create a larger sphere emitter for better visibility
    starfieldParticles.createSphereEmitter(STARFIELD_SIZE, 0);

    // Brighter colors for better visibility
    starfieldParticles.color1 = new Color4(1.0, 1.0, 1.0, 1.0);
    starfieldParticles.color2 = new Color4(0.9, 0.9, 1.0, 1.0);
    starfieldParticles.colorDead = new Color4(0.8, 0.8, 1.0, 1.0);

    // Set blendMode for better visibility
    starfieldParticles.blendMode = ParticleSystem.BLENDMODE_ADD;

    starfieldParticles.start();
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
        const rotationMatrix = Matrix.LookAtLH(Vector3.Zero(), direction, Vector3.Up());
        rotationMatrix.invert();
        const quaternion = Quaternion.FromRotationMatrix(rotationMatrix);
        module.rotationQuaternion = quaternion;

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
    attackerTrail.particleTexture = new Texture("https://raw.githubusercontent.com/BabylonJS/Babylon.js/master/assets/textures/flare.png", scene);
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
        lastShotTime: 0,
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

    // Calculate a point ahead of the attacker based on velocities
    // The higher the missile speed relative to attacker speed, the closer the interception point
    const speedRatio = MISSILE_SPEED / ATTACKER_SPEED;
    const distanceToTarget = Vector3.Distance(startPosition, targetPosition);
    // Limit the intercept distance to prevent targeting points too far ahead
    const rawInterceptDistance = distanceToTarget / speedRatio;
    // Cap the intercept distance to a reasonable value relative to the current distance
    const maxInterceptDistance = Math.min(distanceToTarget * 0.5, 30);
    const interceptDistance = Math.min(rawInterceptDistance, maxInterceptDistance);

    // Calculate the interception point along the attacker's path
    const interceptPoint = targetPosition.add(attackerDirection.scale(interceptDistance));

    // Look at initial target direction
    const direction = interceptPoint.subtract(startPosition);
    if (direction.length() > 0.01) {
        // Create a rotation quaternion that will orient the container toward the target
        const upVector = Vector3.Up();
        const rotationMatrix = Matrix.LookAtLH(Vector3.Zero(), direction, upVector);
        rotationMatrix.invert();

        // Convert the rotation matrix to a quaternion
        const quaternion = Quaternion.FromRotationMatrix(rotationMatrix);

        // Apply the quaternion rotation to the container
        missileContainer.rotationQuaternion = quaternion;
    }

    // Create enhanced smoke trail for the missile
    const missileTrail = new ParticleSystem("missileTrail", 500, scene);
    missileTrail.particleTexture = new Texture("https://raw.githubusercontent.com/BabylonJS/Babylon.js/master/assets/textures/flare.png", scene);
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

    // Create a second particle system for the bright engine core
    const engineCore = new ParticleSystem("engineCore", 100, scene);
    engineCore.particleTexture = new Texture("https://raw.githubusercontent.com/BabylonJS/Babylon.js/master/assets/textures/flare.png", scene);
    engineCore.emitter = missileMesh;
    // Adjust emit box to account for the rotated missile mesh
    engineCore.minEmitBox = new Vector3(0, -MISSILE_SIZE * 1.6, 0);
    engineCore.maxEmitBox = new Vector3(0, -MISSILE_SIZE * 1.6, 0);

    // Bright white-yellow core
    engineCore.color1 = new Color4(1, 1, 0.7, 1);
    engineCore.color2 = new Color4(1, 0.9, 0.5, 1);
    engineCore.colorDead = new Color4(1, 0.5, 0.2, 0);

    // Small, bright particles
    engineCore.minSize = 0.1;
    engineCore.maxSize = 0.4;

    // Very short lifetime for core effect
    engineCore.minLifeTime = 0.05;
    engineCore.maxLifeTime = 0.1;

    // High emit rate for solid core appearance
    engineCore.emitRate = 150;

    // Additive blend for maximum brightness
    engineCore.blendMode = ParticleSystem.BLENDMODE_ADD;

    // No gravity
    engineCore.gravity = new Vector3(0, 0, 0);

    // Narrow cone
    engineCore.direction1 = new Vector3(-0.05, -0.05, -1);
    engineCore.direction2 = new Vector3(0.05, 0.05, -1);

    // Low power - stays close to nozzle
    engineCore.minEmitPower = 0.2;
    engineCore.maxEmitPower = 0.5;

    // Fast update for smooth effect
    engineCore.updateSpeed = 0.005;

    // Start both particle systems
    engineCore.start();

    // Link the engine core to the main trail for disposal
    missileTrail.disposeOnStop = true;
    engineCore.disposeOnStop = true;
    missileTrail.onDisposeObservable.add(() => {
        engineCore.dispose();
    });

    missileTrail.start();

    // All missiles use bezier paths for more interesting movement
    const useBezier = true;

    // Create random bezier path from start to intercept point
    const bezierPoints = createBezierPath(startPosition, interceptPoint);

    // Random initial speed for more varied missile behavior
    const initialSpeed = MISSILE_SPEED * getRandomFloat(0.8, 1.2);

    return {
        mesh: missileMesh,
        container: missileContainer,
        trail: missileTrail,
        target: interceptPoint.clone(), // Target the intercept point, not the attacker directly
        speed: initialSpeed, // Random initial speed
        lifetime: Date.now() + MISSILE_LIFETIME,
        bezierPoints,
        bezierTime: 0,
        useBezier,
        lastPathUpdateTime: Date.now() // Track when we last updated the path
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
    // Define evasion cooldown period (milliseconds)
    const EVASION_COOLDOWN = 3000; // 3 seconds cooldown between evasions

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
                (currentTime - attacker.lastEvasionTime > EVASION_COOLDOWN)) {
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

        // More controlled evasion factor - less variation
        const evasionFactor = Math.max(0.7, Math.min(1.5, attacker.evasionThreshold / closestMissileDistance));

        // Save current target before updating
        attacker.currentTarget = attacker.target.clone();
        attacker.targetChangeTime = currentTime;
        attacker.lastEvasionTime = currentTime;
        attacker.isEvading = true;

        // Set new evasion target - more purposeful by moving away from missile in a clear direction
        // Use the direction from missile to attacker with minimal randomness
        const evasionDistance = 60 * evasionFactor; // Increased base evasion distance for more decisive movement

        // Calculate a more structured evasion direction
        // Add a slight perpendicular component to create a more natural evasive maneuver
        const perpVector = new Vector3(
            evadeDirection.y, 
            -evadeDirection.x, 
            evadeDirection.z
        ).normalize().scale(evasionDistance * 0.3); // 30% perpendicular movement

        attacker.target = new Vector3(
            attacker.mesh.position.x + evadeDirection.x * evasionDistance + perpVector.x,
            attacker.mesh.position.y + evadeDirection.y * evasionDistance + perpVector.y,
            attacker.mesh.position.z + evadeDirection.z * evasionDistance + perpVector.z
        );

        // Use longer transition for evasive maneuvers to make them smoother
        attacker.transitionDuration = 2000; // 2 seconds for smoother evasion
        targetUpdated = true;

        // Reset evasion threshold for next time - allow for occasional close approaches
        // 30% chance of a low threshold to allow missiles to get closer
        if (Math.random() < 0.3) {
            attacker.evasionThreshold = getRandomFloat(EVASION_THRESHOLD_MIN, EVASION_THRESHOLD_MIN + 2);
        } else {
            attacker.evasionThreshold = getRandomFloat(EVASION_THRESHOLD_MIN + 3, EVASION_THRESHOLD_MAX - 3);
        }
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
        const upVector = Vector3.Up();
        const rotationMatrix = Matrix.LookAtLH(Vector3.Zero(), direction, upVector);
        rotationMatrix.invert();
        const targetQuaternion = Quaternion.FromRotationMatrix(rotationMatrix);

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

    // Check if we have a clear shot at the battlestation
    const distanceToBattlestation = Vector3.Distance(attacker.mesh.position, battlestation.position);

    // More sophisticated line of sight check
    const directionToBattlestation = battlestation.position.subtract(attacker.mesh.position);
    directionToBattlestation.normalize();

    // Check if attacker is facing the battlestation (dot product of forward vector and direction to battlestation)
    const forwardVector = new Vector3(0, 0, 1);
    const rotatedForward = Vector3.TransformNormal(forwardVector, attacker.mesh.getWorldMatrix());
    rotatedForward.normalize();

    const dotProduct = Vector3.Dot(rotatedForward, directionToBattlestation);

    // Only fire if we're facing the battlestation (dot product > 0.9 means angle < ~25 degrees)
    // and we're at a reasonable distance
    const hasLineOfSight = dotProduct > 0.9 && distanceToBattlestation < 150 && distanceToBattlestation > 30;

    // Fire plasma cannon if we have a clear shot and enough time has passed since last shot
    if (hasLineOfSight && currentTime - attacker.lastShotTime > PLASMA_SHOT_INTERVAL) {
        firePlasmaShot(scene, attacker, battlestation);
        attacker.lastShotTime = currentTime;
    }
};

// Fire a plasma shot from the attacker towards the battlestation
const firePlasmaShot = (scene: Scene, attacker: IAttacker, battlestation: Mesh): void => {
    // Create a plasma bolt
    const plasma = MeshBuilder.CreateSphere("plasma", { diameter: 1 }, scene);

    const plasmaMaterial = new StandardMaterial("plasmaMaterial", scene);
    plasmaMaterial.diffuseColor = new Color3(0, 0.8, 1);
    plasmaMaterial.emissiveColor = new Color3(0, 0.8, 1);
    plasmaMaterial.alpha = 0.7;
    plasma.material = plasmaMaterial;

    // Position at the attacker's position
    plasma.position = attacker.mesh.position.clone();

    // Create plasma trail
    const plasmaTrail = new ParticleSystem("plasmaTrail", 200, scene);
    plasmaTrail.particleTexture = new Texture("https://raw.githubusercontent.com/BabylonJS/Babylon.js/master/assets/textures/flare.png", scene);
    plasmaTrail.emitter = plasma;

    plasmaTrail.color1 = new Color4(0, 0.8, 1, 0.5);
    plasmaTrail.color2 = new Color4(0, 0.5, 1, 0.5);
    plasmaTrail.colorDead = new Color4(0, 0.3, 0.5, 0);

    plasmaTrail.minSize = 0.5;
    plasmaTrail.maxSize = 1;
    plasmaTrail.minLifeTime = 0.1;
    plasmaTrail.maxLifeTime = 0.3;
    plasmaTrail.emitRate = 100;
    plasmaTrail.blendMode = ParticleSystem.BLENDMODE_ADD;
    plasmaTrail.gravity = new Vector3(0, 0, 0);
    plasmaTrail.minEmitPower = 0.1;
    plasmaTrail.maxEmitPower = 0.3;
    plasmaTrail.updateSpeed = 0.01;

    plasmaTrail.start();

    // Calculate direction to battlestation
    const direction = battlestation.position.subtract(plasma.position);
    direction.normalize();

    // Animation to move the plasma towards the battlestation
    scene.onBeforeRenderObservable.add(function plasmaUpdate() {
        plasma.position.addInPlace(direction.scale(2)); // Faster than missiles

        // Check if plasma has reached the battlestation
        if (Vector3.Distance(plasma.position, battlestation.position) < STATION_SIZE / 2) {
            // Create explosion effect
            const explosion = new ParticleSystem("explosion", 500, scene);
            explosion.particleTexture = new Texture("https://raw.githubusercontent.com/BabylonJS/Babylon.js/master/assets/textures/flare.png", scene);
            explosion.emitter = plasma.position;

            explosion.color1 = new Color4(0, 0.8, 1, 1);
            explosion.color2 = new Color4(0, 0.5, 1, 1);
            explosion.colorDead = new Color4(0, 0.3, 0.5, 0);

            explosion.minSize = 1;
            explosion.maxSize = 3;
            explosion.minLifeTime = 0.3;
            explosion.maxLifeTime = 0.5;
            explosion.emitRate = 500;
            explosion.blendMode = ParticleSystem.BLENDMODE_ADD;
            explosion.gravity = new Vector3(0, 0, 0);
            explosion.minEmitPower = 5;
            explosion.maxEmitPower = 10;
            explosion.minAngularSpeed = 0;
            explosion.maxAngularSpeed = Math.PI;
            explosion.updateSpeed = 0.01;

            explosion.start();

            // Dispose after explosion finishes
            setTimeout(() => {
                explosion.dispose();
            }, 500);

            // Clean up
            plasmaTrail.dispose();
            plasma.dispose();
            scene.onBeforeRenderObservable.removeCallback(plasmaUpdate);
        }

        // Dispose if it goes too far
        if (Vector3.Distance(plasma.position, attacker.mesh.position) > 300) {
            plasmaTrail.dispose();
            plasma.dispose();
            scene.onBeforeRenderObservable.removeCallback(plasmaUpdate);
        }
    });
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
            const explosion = new ParticleSystem("explosion", 300, missile.container.getScene());
            explosion.particleTexture = new Texture("https://raw.githubusercontent.com/BabylonJS/Babylon.js/master/assets/textures/flare.png", missile.container.getScene());
            explosion.emitter = missile.container.position;

            // Use slightly different colors for lifetime expiration explosion (more orange/yellow than red)
            explosion.color1 = new Color4(1, 0.7, 0.1, 1);
            explosion.color2 = new Color4(1, 0.5, 0.1, 1);
            explosion.colorDead = new Color4(0.5, 0.3, 0.1, 0);

            // Slightly smaller explosion than collision
            explosion.minSize = 0.8;
            explosion.maxSize = 2.5;
            explosion.minLifeTime = 0.2;
            explosion.maxLifeTime = 0.4;
            explosion.emitRate = 400;
            explosion.blendMode = ParticleSystem.BLENDMODE_ADD;
            explosion.gravity = new Vector3(0, 0, 0);
            explosion.minEmitPower = 4;
            explosion.maxEmitPower = 8;
            explosion.minAngularSpeed = 0;
            explosion.maxAngularSpeed = Math.PI;
            explosion.updateSpeed = 0.01;

            explosion.start();

            // Dispose after explosion finishes
            setTimeout(() => {
                explosion.dispose();
            }, 500);

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
            (missile.bezierTime && missile.bezierTime >= 1) ||
            (distanceToAttacker < 50 && Math.random() < 0.1); // Higher chance to update when close

        if (shouldUpdatePath) {
            // Calculate a new target point along the attacker's current path
            // Get attacker's current direction
            const attackerDirection = attacker.mesh.getDirection(new Vector3(0, 0, 1));

            // Calculate a point ahead of the attacker based on velocities
            // The higher the missile speed relative to attacker speed, the closer the interception point
            const speedRatio = missile.speed / attacker.currentSpeed;
            // Limit the intercept distance to prevent targeting points too far ahead
            const rawInterceptDistance = distanceToAttacker / speedRatio;
            // Cap the intercept distance to a reasonable value relative to the current distance
            const maxInterceptDistance = Math.min(distanceToAttacker * 0.5, 30);
            const interceptDistance = Math.min(rawInterceptDistance, maxInterceptDistance);

            // Calculate the interception point along the attacker's path
            const interceptPoint = attacker.mesh.position.clone().add(attackerDirection.scale(interceptDistance));

            // Update the missile's target to the new intercept point
            missile.target = interceptPoint.clone();

            // Change missile velocity randomly
            missile.speed = MISSILE_SPEED * getRandomFloat(0.8, 1.5);

            // Create a new random bezier path from current position to the new target
            if (distanceToAttacker < 30) {
                // Create a more direct and aggressive path when close
                const toTarget = missile.target.subtract(missile.container.position);
                const direction = toTarget.normalize();

                // More direct approach with sharper turns
                missile.bezierPoints = [
                    missile.container.position.clone(),
                    // First control point - closer to direct line
                    missile.container.position.add(direction.scale(distanceToAttacker * 0.3)),
                    // Second control point - very close to target
                    missile.target.subtract(direction.scale(distanceToAttacker * 0.1)),
                    missile.target.clone()
                ];
            } else {
                // Normal bezier path for farther missiles
                missile.bezierPoints = createBezierPath(
                    missile.container.position.clone(),
                    missile.target.clone()
                );
            }

            // Reset bezier time for the new path
            missile.bezierTime = 0;

            // Update the last path update time
            missile.lastPathUpdateTime = currentTime;
        }

        // All missiles use bezier paths
        if (missile.bezierPoints) {
            // Initialize bezier time if needed
            if (missile.bezierTime === undefined) {
                missile.bezierTime = 0;
            }

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

            // Calculate position on bezier curve
            const newPosition = calculateBezierPoint(
                missile.bezierTime,
                missile.bezierPoints[0],
                missile.bezierPoints[1],
                missile.bezierPoints[2],
                missile.bezierPoints[3]
            );

            // Calculate direction for rotation
            const direction = newPosition.subtract(missile.container.position);
            if (direction.length() > 0.01) {
                direction.normalize();

                // Update rotation to face movement direction
                const upVector = Vector3.Up();
                const rotationMatrix = Matrix.LookAtLH(Vector3.Zero(), direction, upVector);
                rotationMatrix.invert();
                const quaternion = Quaternion.FromRotationMatrix(rotationMatrix);
                missile.container.rotationQuaternion = quaternion;
            }

            // Update missile container position
            missile.container.position.copyFrom(newPosition);
        }

        // Check if missile has hit the attacker
        if (Vector3.Distance(missile.container.position, attacker.mesh.position) < ATTACKER_SIZE / 2) {
            // Create explosion effect
            const explosion = new ParticleSystem("explosion", 500, missile.container.getScene());
            explosion.particleTexture = new Texture("https://raw.githubusercontent.com/BabylonJS/Babylon.js/master/assets/textures/flare.png", missile.container.getScene());
            explosion.emitter = missile.container.position;

            explosion.color1 = new Color4(1, 0.5, 0, 1);
            explosion.color2 = new Color4(1, 0.2, 0, 1);
            explosion.colorDead = new Color4(0.5, 0.1, 0, 0);

            explosion.minSize = 1;
            explosion.maxSize = 3;
            explosion.minLifeTime = 0.3;
            explosion.maxLifeTime = 0.5;
            explosion.emitRate = 500;
            explosion.blendMode = ParticleSystem.BLENDMODE_ADD;
            explosion.gravity = new Vector3(0, 0, 0);
            explosion.minEmitPower = 5;
            explosion.maxEmitPower = 10;
            explosion.minAngularSpeed = 0;
            explosion.maxAngularSpeed = Math.PI;
            explosion.updateSpeed = 0.01;

            explosion.start();

            // Dispose after explosion finishes
            setTimeout(() => {
                explosion.dispose();
            }, 500);

            // Remove the missile
            missile.trail.dispose();
            missile.mesh.dispose();
            missile.container.dispose();
            missiles.splice(i, 1);
        }
    }
};

// Create a bezier path from start to target position
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
    const curveOffset = distance * getRandomFloat(0.25, 0.5);

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

// Initialize the scene when the window loads
window.addEventListener('DOMContentLoaded', () => {
    const canvasElement = document.getElementById('renderCanvas');
    if (canvasElement && canvasElement instanceof HTMLCanvasElement) {
        createScene(canvasElement);
    } else {
        console.error('Canvas element not found or is not a canvas element');
    }
});
