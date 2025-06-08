import {
    Engine,
    Scene,
    Vector3,
    Vector4,
    HemisphericLight,
    MeshBuilder,
    StandardMaterial,
    Color3,
    FreeCamera,
    Texture,
    ParticleSystem,
    Color4,
    Mesh,
    Path3D,
    Matrix,
    Quaternion,
    ArcRotateCamera,
    PointLight,
    SphereParticleEmitter,
    GPUParticleSystem,
    TransformNode,
    Animation,
    Space,
    Scalar,
    CubicEase,
    EasingFunction,
    BezierCurveEase
} from '@babylonjs/core';

// Constants
const MISSILE_SPEED = 1.2;
const ATTACKER_SPEED = 1.5;
const EVASION_THRESHOLD_MIN = 10;
const EVASION_THRESHOLD_MAX = 30;
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
    trail: ParticleSystem;
    target: Vector3;
    speed: number;
    lifetime: number;
    bezierPoints?: Vector3[];
    bezierTime?: number;
    useBezier: boolean;
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
}

// Main function to create the scene
const createScene = (canvas: HTMLCanvasElement): Scene => {
    // Create engine and scene
    const engine = new Engine(canvas, true);
    const scene = new Scene(engine);
    scene.clearColor = new Color4(0, 0, 0, 1); // Black background for space

    // Create free camera for mouse and keyboard controls
    const camera = new FreeCamera("camera", new Vector3(0, 0, -100), scene);
    camera.attachControl(canvas, true);
    camera.minZ = 0.1;
    camera.maxZ = 2000;

    // Set camera speed
    camera.speed = 2.0;
    camera.angularSensibility = 500; // Lower value = higher sensitivity

    // Enable WASD controls
    camera.keysUp.push(87);    // W
    camera.keysDown.push(83);  // S
    camera.keysLeft.push(65);  // A
    camera.keysRight.push(68); // D

    // Add keys for up/down movement
    camera.keysUpward.push(69);   // E
    camera.keysDownward.push(81); // Q

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

    // Array to store active missiles
    const missiles: IMissile[] = [];

    // Game loop
    let lastMissileLaunchTime = 0;
    scene.onBeforeRenderObservable.add(() => {
        const currentTime = Date.now();

        // Update attacker movement
        updateAttacker(attacker, battlestation, missiles, scene, currentTime);

        // Update missiles
        updateMissiles(missiles, attacker, currentTime);

        // Launch new missiles at random intervals
        if (currentTime - lastMissileLaunchTime > getRandomInt(MISSILE_LAUNCH_INTERVAL_MIN, MISSILE_LAUNCH_INTERVAL_MAX)) {
            launchMissileBarrage(scene, battlestation, attacker, missiles);
            lastMissileLaunchTime = currentTime;
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

    starfieldParticles.minLifeTime = Number.MAX_SAFE_INTEGER;
    starfieldParticles.maxLifeTime = Number.MAX_SAFE_INTEGER;
    starfieldParticles.minSize = 0.1;
    starfieldParticles.maxSize = 0.5;
    starfieldParticles.emitRate = STAR_COUNT;
    starfieldParticles.minEmitPower = 0;
    starfieldParticles.maxEmitPower = 0;
    starfieldParticles.updateSpeed = 0.01;

    starfieldParticles.createSphereEmitter(STARFIELD_SIZE, 0);

    starfieldParticles.color1 = new Color4(0.8, 0.8, 1.0, 1.0);
    starfieldParticles.color2 = new Color4(0.9, 0.9, 1.0, 1.0);
    starfieldParticles.colorDead = new Color4(0.8, 0.8, 1.0, 1.0);

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
        evasionThreshold: getRandomFloat(EVASION_THRESHOLD_MIN, EVASION_THRESHOLD_MAX),
        lastShotTime: 0
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
    // Create main missile body
    const missileMesh = MeshBuilder.CreateCylinder("missile", { 
        height: MISSILE_SIZE * 3, 
        diameter: MISSILE_SIZE / 2 
    }, scene);

    const missileMaterial = new StandardMaterial("missileMaterial", scene);
    missileMaterial.diffuseColor = new Color3(0.7, 0.7, 0.7);
    missileMaterial.emissiveColor = new Color3(0.2, 0.2, 0.2);
    missileMesh.material = missileMaterial;

    // Create nose cone
    const noseCone = MeshBuilder.CreateCylinder("noseCone", {
        height: MISSILE_SIZE,
        diameterTop: 0,
        diameterBottom: MISSILE_SIZE / 2
    }, scene);
    noseCone.parent = missileMesh;
    noseCone.position.z = MISSILE_SIZE * 2;
    // Rotate to align with missile body
    noseCone.rotation.x = Math.PI / 2;

    // Create fins (4 fins arranged in X pattern)
    const finMaterial = new StandardMaterial("finMaterial", scene);
    finMaterial.diffuseColor = new Color3(0.5, 0.5, 0.5);

    for (let i = 0; i < 4; i++) {
        const fin = MeshBuilder.CreateBox("fin" + i, {
            width: MISSILE_SIZE / 10,
            height: MISSILE_SIZE,
            depth: MISSILE_SIZE
        }, scene);
        fin.parent = missileMesh;
        fin.position.z = -MISSILE_SIZE * 1.2;
        // Position fins outward from center
        const angle = Math.PI / 4 + (i * Math.PI / 2);
        fin.position.x = Math.cos(angle) * (MISSILE_SIZE / 4);
        fin.position.y = Math.sin(angle) * (MISSILE_SIZE / 4);
        fin.rotation.z = angle; // Rotate each fin 45 degrees + 90 degrees per fin
        // Align with missile body
        fin.rotation.x = Math.PI / 2;
        fin.material = finMaterial;
    }

    // Create small control surfaces near the front
    const controlMaterial = new StandardMaterial("controlMaterial", scene);
    controlMaterial.diffuseColor = new Color3(0.6, 0.6, 0.6);

    for (let i = 0; i < 4; i++) {
        const control = MeshBuilder.CreateBox("control" + i, {
            width: MISSILE_SIZE / 15,
            height: MISSILE_SIZE / 2,
            depth: MISSILE_SIZE / 3
        }, scene);
        control.parent = missileMesh;
        control.position.z = MISSILE_SIZE;
        // Position control surfaces outward from center
        const angle = Math.PI / 4 + (i * Math.PI / 2);
        control.position.x = Math.cos(angle) * (MISSILE_SIZE / 3);
        control.position.y = Math.sin(angle) * (MISSILE_SIZE / 3);
        control.rotation.z = angle; // Same pattern as fins
        // Align with missile body
        control.rotation.x = Math.PI / 2;
        control.material = controlMaterial;
    }

    // Create engine nozzle
    const nozzle = MeshBuilder.CreateCylinder("nozzle", {
        height: MISSILE_SIZE / 2,
        diameterTop: MISSILE_SIZE / 2,
        diameterBottom: MISSILE_SIZE / 3
    }, scene);
    nozzle.parent = missileMesh;
    nozzle.position.z = -MISSILE_SIZE * 1.5;
    // Align with missile body
    nozzle.rotation.x = Math.PI / 2;

    const nozzleMaterial = new StandardMaterial("nozzleMaterial", scene);
    nozzleMaterial.diffuseColor = new Color3(0.3, 0.3, 0.3);
    nozzleMaterial.emissiveColor = new Color3(0.1, 0.1, 0.1);
    nozzle.material = nozzleMaterial;

    // Position and orient the missile
    missileMesh.position = startPosition.clone();

    // Look at initial target direction
    const direction = targetPosition.subtract(startPosition);
    if (direction.length() > 0.01) {
        const upVector = Vector3.Up();
        const rotationMatrix = Matrix.LookAtLH(Vector3.Zero(), direction, upVector);
        rotationMatrix.invert();
        const quaternion = Quaternion.FromRotationMatrix(rotationMatrix);
        missileMesh.rotationQuaternion = quaternion;
    }

    // Create smoke trail for the missile
    const missileTrail = new ParticleSystem("missileTrail", 300, scene);
    missileTrail.particleTexture = new Texture("https://raw.githubusercontent.com/BabylonJS/Babylon.js/master/assets/textures/flare.png", scene);
    missileTrail.emitter = missileMesh;
    missileTrail.minEmitBox = new Vector3(0, 0, -MISSILE_SIZE * 1.5);
    missileTrail.maxEmitBox = new Vector3(0, 0, -MISSILE_SIZE * 1.5);

    missileTrail.color1 = new Color4(1, 0.5, 0, 0.2);
    missileTrail.color2 = new Color4(1, 0.5, 0, 0.2);
    missileTrail.colorDead = new Color4(0.5, 0.5, 0.5, 0);

    missileTrail.minSize = 0.3;
    missileTrail.maxSize = 1;
    missileTrail.minLifeTime = 0.3;
    missileTrail.maxLifeTime = 0.5;
    missileTrail.emitRate = 100;
    missileTrail.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    missileTrail.gravity = new Vector3(0, 0, 0);
    missileTrail.direction1 = new Vector3(-0.1, -0.1, -1);
    missileTrail.direction2 = new Vector3(0.1, 0.1, -1);
    missileTrail.minEmitPower = 0.5;
    missileTrail.maxEmitPower = 1;
    missileTrail.updateSpeed = 0.01;

    missileTrail.start();

    // Decide if this missile will use bezier path
    const useBezier = Math.random() > 0.5;

    // If using bezier, calculate control points
    let bezierPoints: Vector3[] | undefined;
    if (useBezier) {
        const startToTarget = targetPosition.subtract(startPosition);
        const distance = startToTarget.length();

        // Create random control points for the bezier curve
        bezierPoints = [
            startPosition.clone(),
            startPosition.add(new Vector3(
                getRandomFloat(-distance/2, distance/2),
                getRandomFloat(-distance/2, distance/2),
                getRandomFloat(-distance/2, distance/2)
            )),
            targetPosition.add(new Vector3(
                getRandomFloat(-distance/2, distance/2),
                getRandomFloat(-distance/2, distance/2),
                getRandomFloat(-distance/2, distance/2)
            )),
            targetPosition.clone()
        ];
    }

    return {
        mesh: missileMesh,
        trail: missileTrail,
        target: targetPosition.clone(),
        speed: MISSILE_SPEED * getRandomFloat(0.8, 1.2), // Slight speed variation
        lifetime: Date.now() + MISSILE_LIFETIME,
        bezierPoints,
        bezierTime: 0,
        useBezier
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
    // Check if any missiles are too close and need evasion
    let closestMissileDistance = Number.MAX_VALUE;
    let needsEvasion = false;

    for (const missile of missiles) {
        const distance = Vector3.Distance(attacker.mesh.position, missile.mesh.position);
        if (distance < closestMissileDistance) {
            closestMissileDistance = distance;
        }

        if (distance < attacker.evasionThreshold) {
            needsEvasion = true;
            break;
        }
    }

    // Check if we need to update the target
    let targetUpdated = false;

    // If evasion is needed, set a new random target away from current position
    if (needsEvasion) {
        // More drastic evasion the closer the missile is
        const evasionFactor = Math.max(0.5, Math.min(2, attacker.evasionThreshold / closestMissileDistance));

        // Save current target before updating
        attacker.currentTarget = attacker.target.clone();
        attacker.targetChangeTime = currentTime;

        // Set new evasion target
        attacker.target = new Vector3(
            attacker.mesh.position.x + getRandomFloat(-50, 50) * evasionFactor,
            attacker.mesh.position.y + getRandomFloat(-50, 50) * evasionFactor,
            attacker.mesh.position.z + getRandomFloat(-50, 50) * evasionFactor
        );

        // Use shorter transition for evasive maneuvers
        attacker.transitionDuration = 1000; // 1 second for evasion
        targetUpdated = true;

        // Reset evasion threshold for next time
        attacker.evasionThreshold = getRandomFloat(EVASION_THRESHOLD_MIN, EVASION_THRESHOLD_MAX);
    } 
    // Continuously update target to ensure constant movement around the space station
    // Only if we're close to the target and haven't recently changed targets
    else if (Vector3.Distance(attacker.mesh.position, attacker.target) < 20 && 
             (currentTime - attacker.targetChangeTime) > attacker.transitionDuration) {

        // Save current target before updating
        attacker.currentTarget = attacker.target.clone();
        attacker.targetChangeTime = currentTime;

        // Generate a new target position that's around the battlestation but at varying distances
        const angle = Math.random() * Math.PI * 2;
        const height = getRandomFloat(-120, 120);
        const radius = getRandomFloat(100, 250); // Increased minimum radius for smoother paths

        // Make the target relative to the battlestation's position
        attacker.target = new Vector3(
            battlestation.position.x + Math.cos(angle) * radius,
            battlestation.position.y + height,
            battlestation.position.z + Math.sin(angle) * radius
        );

        // Use longer transition for normal movement
        attacker.transitionDuration = 3000; // 3 seconds for normal transitions
        targetUpdated = true;
    }
    // Occasionally update target to prevent predictable patterns, but much less frequently
    else if (Math.random() < 0.002 && (currentTime - attacker.targetChangeTime) > attacker.transitionDuration * 2) {

        // Save current target before updating
        attacker.currentTarget = attacker.target.clone();
        attacker.targetChangeTime = currentTime;

        // Generate a new target position that's around the battlestation but at varying distances
        const angle = Math.random() * Math.PI * 2;
        const height = getRandomFloat(-120, 120);
        const radius = getRandomFloat(100, 250); // Increased minimum radius for smoother paths

        // Make the target relative to the battlestation's position
        attacker.target = new Vector3(
            battlestation.position.x + Math.cos(angle) * radius,
            battlestation.position.y + height,
            battlestation.position.z + Math.sin(angle) * radius
        );

        // Use longer transition for random changes
        attacker.transitionDuration = 4000; // 4 seconds for random transitions
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
    for (let i = missiles.length - 1; i >= 0; i--) {
        const missile = missiles[i];

        // Check if missile has expired
        if (currentTime > missile.lifetime) {
            missile.trail.dispose();
            missile.mesh.dispose();
            missiles.splice(i, 1);
            continue;
        }

        // Update target to current attacker position
        missile.target = attacker.mesh.position.clone();

        // Move missile based on path type
        if (missile.useBezier && missile.bezierPoints) {
            // Bezier curve path
            if (missile.bezierTime === undefined) {
                missile.bezierTime = 0;
            }

            missile.bezierTime += missile.speed * 0.01;

            if (missile.bezierTime > 1) {
                missile.bezierTime = 1;
            }

            // Calculate position on bezier curve
            const newPosition = calculateBezierPoint(
                missile.bezierTime,
                missile.bezierPoints[0],
                missile.bezierPoints[1],
                missile.bezierPoints[2],
                missile.bezierPoints[3]
            );

            // Calculate direction for rotation
            const direction = newPosition.subtract(missile.mesh.position);
            if (direction.length() > 0.01) {
                direction.normalize();

                // Update rotation to face movement direction
                const upVector = Vector3.Up();
                const rotationMatrix = Matrix.LookAtLH(Vector3.Zero(), direction, upVector);
                rotationMatrix.invert();
                const quaternion = Quaternion.FromRotationMatrix(rotationMatrix);
                missile.mesh.rotationQuaternion = quaternion;
            }

            missile.mesh.position.copyFrom(newPosition);

            // If we've reached the end of the bezier curve, switch to direct pursuit
            if (missile.bezierTime >= 1) {
                missile.useBezier = false;
            }
        } else {
            // Direct pursuit path
            const direction = missile.target.subtract(missile.mesh.position);
            if (direction.length() > 0.01) {
                direction.normalize();

                // Update position
                missile.mesh.position.addInPlace(direction.scale(missile.speed));

                // Update rotation to face movement direction
                const upVector = Vector3.Up();
                const rotationMatrix = Matrix.LookAtLH(Vector3.Zero(), direction, upVector);
                rotationMatrix.invert();
                const quaternion = Quaternion.FromRotationMatrix(rotationMatrix);
                missile.mesh.rotationQuaternion = quaternion;
            }
        }

        // Check if missile has hit the attacker
        if (Vector3.Distance(missile.mesh.position, attacker.mesh.position) < ATTACKER_SIZE / 2) {
            // Create explosion effect
            const explosion = new ParticleSystem("explosion", 500, missile.mesh.getScene());
            explosion.particleTexture = new Texture("https://raw.githubusercontent.com/BabylonJS/Babylon.js/master/assets/textures/flare.png", missile.mesh.getScene());
            explosion.emitter = missile.mesh.position;

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
            missiles.splice(i, 1);
        }
    }
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
