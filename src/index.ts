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
    Quaternion
} from '@babylonjs/core';

// Canvas and engine setup
const canvasElement = document.getElementById('renderCanvas');
if (!canvasElement) {
    throw new Error('Canvas element not found');
}
// Double assertion to safely convert to HTMLCanvasElement
const canvas = canvasElement as unknown as HTMLCanvasElement;
const engine = new Engine(canvas, true);

// Create scene
const createScene = (): Scene => {
    const scene = new Scene(engine);
    scene.clearColor = new Color4(0.05, 0.05, 0.1, 1); // Dark blue space background

    // Camera setup
    const camera = new FreeCamera('camera', new Vector3(0, 30, -50), scene);
    camera.setTarget(Vector3.Zero());
    camera.attachControl(canvas, true);
    camera.speed = 0.5; // Adjust camera movement speed

    // Lighting
    const light = new HemisphericLight('light', new Vector3(0, 1, 0), scene);
    light.intensity = 0.7;

    // Create a simple starfield for background
    createStarfield(scene);

    // Create spacecraft and missiles
    createSpacecraftAndMissiles(scene);

    return scene;
};

// Create a simple starfield background
const createStarfield = (scene: Scene): void => {
    const starCount = 1000;
    const starfieldRadius = 500;

    for (let i = 0; i < starCount; i++) {
        // Random position within a sphere
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const r = starfieldRadius * Math.cbrt(Math.random()); // Cube root for more uniform distribution

        const x = r * Math.sin(phi) * Math.cos(theta);
        const y = r * Math.sin(phi) * Math.sin(theta);
        const z = r * Math.cos(phi);

        const star = MeshBuilder.CreateSphere(`star${i}`, { diameter: 0.5 + Math.random() }, scene);
        star.position = new Vector3(x, y, z);

        const starMaterial = new StandardMaterial(`starMaterial${i}`, scene);
        starMaterial.emissiveColor = new Color3(
            0.7 + Math.random() * 0.3,
            0.7 + Math.random() * 0.3,
            0.7 + Math.random() * 0.3
        );
        star.material = starMaterial;
    }
};

// Create spacecraft and missiles with their behaviors
const createSpacecraftAndMissiles = (scene: Scene): void => {
    // Create attacking spacecraft
    const attackerCount = 5;
    const attackers: Mesh[] = [];

    for (let i = 0; i < attackerCount; i++) {
        const attacker = createSpacecraft(scene, true);
        attacker.position = new Vector3(
            -50 + Math.random() * 100,
            20 + Math.random() * 40,
            -100 + Math.random() * 50
        );

        // Random rotation
        attacker.rotation = new Vector3(
            Math.random() * Math.PI * 2,
            Math.random() * Math.PI * 2,
            Math.random() * Math.PI * 2
        );

        attackers.push(attacker);

        // Create smoke trail for attacker
        createSmokeTrail(scene, attacker, new Color4(0.2, 0.2, 0.8, 0.5)); // Blue-ish smoke for spacecraft
    }

    // Create defending spacecraft
    const defenderCount = 3;
    const defenders: Mesh[] = [];

    for (let i = 0; i < defenderCount; i++) {
        const defender = createSpacecraft(scene, false);
        defender.position = new Vector3(
            -30 + Math.random() * 60,
            10 + Math.random() * 20,
            50 + Math.random() * 50
        );

        // Face generally toward the attackers
        defender.rotation = new Vector3(
            Math.random() * Math.PI * 0.5 - Math.PI * 0.25,
            Math.PI + Math.random() * Math.PI * 0.5 - Math.PI * 0.25,
            Math.random() * Math.PI * 0.5 - Math.PI * 0.25
        );

        defenders.push(defender);

        // Create smoke trail for defender
        createSmokeTrail(scene, defender, new Color4(0.8, 0.2, 0.2, 0.5)); // Red-ish smoke for spacecraft
    }

    // Create missiles
    const missileCount = 30;
    const missiles: Mesh[] = [];

    for (let i = 0; i < missileCount; i++) {
        // Determine which defender fires this missile
        const defenderIndex = Math.floor(Math.random() * defenderCount);
        const defender = defenders[defenderIndex];

        // Create missile at defender position
        const missile = createMissile(scene);
        missile.position = defender.position.clone();

        // Create a random target position near one of the attackers
        const targetAttackerIndex = Math.floor(Math.random() * attackerCount);
        const targetAttacker = attackers[targetAttackerIndex];

        // Add some randomness to the target position (missile spread)
        const targetPosition = targetAttacker.position.clone().add(
            new Vector3(
                Math.random() * 20 - 10,
                Math.random() * 20 - 10,
                Math.random() * 20 - 10
            )
        );

        // Create a curved path for the missile
        const controlPoint1 = missile.position.clone().add(
            new Vector3(
                Math.random() * 40 - 20,
                Math.random() * 40 - 20,
                (targetPosition.z - missile.position.z) * 0.3
            )
        );

        const controlPoint2 = targetPosition.clone().add(
            new Vector3(
                Math.random() * 40 - 20,
                Math.random() * 40 - 20,
                (missile.position.z - targetPosition.z) * 0.3
            )
        );

        // Create a Bezier curve path
        const bezierPoints = [];
        for (let t = 0; t <= 1; t += 0.02) {
            const point = getBezierPoint(
                missile.position,
                controlPoint1,
                controlPoint2,
                targetPosition,
                t
            );
            bezierPoints.push(point);
        }

        const path3d = new Path3D(bezierPoints);
        const pathLength = path3d.length();

        // Store path data with the missile
        (missile as any).pathData = {
            path: path3d,
            distance: 0,
            totalDistance: pathLength,
            speed: 0.5 + Math.random() * 0.5 // Random speed for each missile
        };

        missiles.push(missile);

        // Create smoke trail for missile
        createSmokeTrail(scene, missile, new Color4(0.7, 0.7, 0.7, 0.7)); // White-ish smoke for missiles
    }

    // Animation loop for spacecraft and missiles
    scene.onBeforeRenderObservable.add(() => {
        // Initialize time-based movement if not already done
        if (!scene.metadata) {
            scene.metadata = {
                time: 0,
                attackerPhases: attackers.map(() => Math.random() * Math.PI * 2),
                defenderPhases: defenders.map(() => Math.random() * Math.PI * 2)
            };
        }

        // Update time
        scene.metadata.time += 0.01;
        const time = scene.metadata.time;

        // Move attackers in a weaving pattern
        attackers.forEach((attacker, index) => {
            const phase = scene.metadata.attackerPhases[index];

            // Sinusoidal movement for weaving effect
            const xMovement = Math.sin(time * 0.5 + phase);
            const yMovement = Math.cos(time * 0.3 + phase) * 0.5;
            const zMovement = Math.sin(time * 0.7 + phase * 2) * 0.7;

            attacker.position.addInPlace(new Vector3(xMovement, yMovement, zMovement));

            // Keep within bounds
            if (attacker.position.x < -100) attacker.position.x = -100;
            if (attacker.position.x > 100) attacker.position.x = 100;
            if (attacker.position.y < 10) attacker.position.y = 10;
            if (attacker.position.y > 80) attacker.position.y = 80;
            if (attacker.position.z < -150) attacker.position.z = -150;
            if (attacker.position.z > 0) attacker.position.z = 0;

            // Smooth rotation to face movement direction
            attacker.rotation.x += (Math.sin(time * 0.2 + phase) * 0.01 - attacker.rotation.x) * 0.1;
            attacker.rotation.y += (Math.cos(time * 0.3 + phase) * 0.01 - attacker.rotation.y) * 0.1;
            attacker.rotation.z += (Math.sin(time * 0.4 + phase) * 0.01 - attacker.rotation.z) * 0.1;
        });

        // Move defenders in a complementary weaving pattern
        defenders.forEach((defender, index) => {
            const phase = scene.metadata.defenderPhases[index];

            // Sinusoidal movement with different frequencies for weaving effect
            const xMovement = Math.cos(time * 0.6 + phase) * 0.8;
            const yMovement = Math.sin(time * 0.4 + phase) * 0.4;
            const zMovement = Math.cos(time * 0.5 + phase * 2) * 0.6;

            defender.position.addInPlace(new Vector3(xMovement, yMovement, zMovement));

            // Keep within bounds
            if (defender.position.x < -50) defender.position.x = -50;
            if (defender.position.x > 50) defender.position.x = 50;
            if (defender.position.y < 5) defender.position.y = 5;
            if (defender.position.y > 40) defender.position.y = 40;
            if (defender.position.z < 30) defender.position.z = 30;
            if (defender.position.z > 150) defender.position.z = 150;

            // Smooth rotation to face movement direction
            defender.rotation.x += (Math.cos(time * 0.3 + phase) * 0.01 - defender.rotation.x) * 0.1;
            defender.rotation.y += (Math.sin(time * 0.2 + phase) * 0.01 - defender.rotation.y) * 0.1;
            defender.rotation.z += (Math.cos(time * 0.5 + phase) * 0.01 - defender.rotation.z) * 0.1;
        });

        // Move missiles along their paths
        missiles.forEach(missile => {
            const pathData = (missile as any).pathData;
            if (!pathData) return;

            // Update missile position along path
            pathData.distance += pathData.speed;

            if (pathData.distance >= pathData.totalDistance) {
                // Missile reached end of path, reset to start with new path
                pathData.distance = 0;

                // Randomly choose whether an attacker or defender fires the missile
                let sourcePosition;
                let targetPosition;

                if (Math.random() < 0.5) {
                    // Defender fires at an attacker
                    const defenderIndex = Math.floor(Math.random() * defenders.length);
                    const defender = defenders[defenderIndex];
                    sourcePosition = defender.position.clone();

                    const targetAttackerIndex = Math.floor(Math.random() * attackers.length);
                    const targetAttacker = attackers[targetAttackerIndex];
                    targetPosition = targetAttacker.position.clone();
                } else {
                    // Attacker fires at a defender
                    const attackerIndex = Math.floor(Math.random() * attackers.length);
                    const attacker = attackers[attackerIndex];
                    sourcePosition = attacker.position.clone();

                    const targetDefenderIndex = Math.floor(Math.random() * defenders.length);
                    const targetDefender = defenders[targetDefenderIndex];
                    targetPosition = targetDefender.position.clone();
                }

                missile.position = sourcePosition;

                // Add some randomness to the target position
                targetPosition.addInPlace(
                    new Vector3(
                        Math.random() * 20 - 10,
                        Math.random() * 20 - 10,
                        Math.random() * 20 - 10
                    )
                );

                // Create new control points
                const controlPoint1 = missile.position.clone().add(
                    new Vector3(
                        Math.random() * 40 - 20,
                        Math.random() * 40 - 20,
                        (targetPosition.z - missile.position.z) * 0.3
                    )
                );

                const controlPoint2 = targetPosition.clone().add(
                    new Vector3(
                        Math.random() * 40 - 20,
                        Math.random() * 40 - 20,
                        (missile.position.z - targetPosition.z) * 0.3
                    )
                );

                // Create a new Bezier curve path
                const bezierPoints = [];
                for (let t = 0; t <= 1; t += 0.02) {
                    const point = getBezierPoint(
                        missile.position,
                        controlPoint1,
                        controlPoint2,
                        targetPosition,
                        t
                    );
                    bezierPoints.push(point);
                }

                pathData.path = new Path3D(bezierPoints);
                pathData.totalDistance = pathData.path.length();
            } else {
                // Calculate position and tangent at current distance
                const ratio = pathData.distance / pathData.totalDistance;
                const curvePoint = pathData.path.getPointAt(ratio);
                const tangent = pathData.path.getTangentAt(ratio);

                // Update missile position
                missile.position = curvePoint;

                // Orient missile along path
                if (tangent.length() > 0.01) {
                    const up = Vector3.Up();
                    const axisX = Vector3.Cross(up, tangent).normalize();
                    const axisY = Vector3.Cross(tangent, axisX).normalize();
                    const axisZ = tangent.normalize();

                    const rotationMatrix = Matrix.Identity();
                    const xArray = axisX.asArray();
                    const yArray = axisY.asArray();
                    const zArray = axisZ.asArray();

                    rotationMatrix.setRow(0, new Vector4(xArray[0], xArray[1], xArray[2], 0));
                    rotationMatrix.setRow(1, new Vector4(yArray[0], yArray[1], yArray[2], 0));
                    rotationMatrix.setRow(2, new Vector4(zArray[0], zArray[1], zArray[2], 0));

                    missile.rotationQuaternion = Quaternion.FromRotationMatrix(rotationMatrix);
                }
            }
        });
    });
};

// Create a spacecraft mesh
const createSpacecraft = (scene: Scene, isAttacker: boolean): Mesh => {
    // Create a simple spacecraft model
    const body = MeshBuilder.CreateBox('body', { width: 2, height: 1, depth: 4 }, scene);

    // Wings
    const leftWing = MeshBuilder.CreateBox('leftWing', { width: 3, height: 0.2, depth: 2 }, scene);
    leftWing.position = new Vector3(-2, 0, 0);
    leftWing.parent = body;

    const rightWing = MeshBuilder.CreateBox('rightWing', { width: 3, height: 0.2, depth: 2 }, scene);
    rightWing.position = new Vector3(2, 0, 0);
    rightWing.parent = body;

    // Cockpit
    const cockpit = MeshBuilder.CreateSphere('cockpit', { diameter: 1 }, scene);
    cockpit.position = new Vector3(0, 0.5, 1);
    cockpit.scaling = new Vector3(1, 0.8, 1.2);
    cockpit.parent = body;

    // Engine
    const engine = MeshBuilder.CreateCylinder('engine', { height: 1, diameter: 1 }, scene);
    engine.position = new Vector3(0, 0, -2);
    engine.rotation.x = Math.PI / 2;
    engine.parent = body;

    // Materials
    const bodyMaterial = new StandardMaterial('bodyMaterial', scene);
    bodyMaterial.diffuseColor = isAttacker ? new Color3(0.2, 0.2, 0.7) : new Color3(0.7, 0.2, 0.2);
    body.material = bodyMaterial;

    const wingMaterial = new StandardMaterial('wingMaterial', scene);
    wingMaterial.diffuseColor = isAttacker ? new Color3(0.3, 0.3, 0.8) : new Color3(0.8, 0.3, 0.3);
    leftWing.material = wingMaterial;
    rightWing.material = wingMaterial;

    const cockpitMaterial = new StandardMaterial('cockpitMaterial', scene);
    cockpitMaterial.diffuseColor = new Color3(0.1, 0.1, 0.1);
    cockpitMaterial.specularColor = new Color3(1, 1, 1);
    cockpitMaterial.specularPower = 128;
    cockpit.material = cockpitMaterial;

    const engineMaterial = new StandardMaterial('engineMaterial', scene);
    engineMaterial.diffuseColor = new Color3(0.5, 0.5, 0.5);
    engine.material = engineMaterial;

    return body;
};

// Create a missile mesh
const createMissile = (scene: Scene): Mesh => {
    // Create a simple missile model
    const body = MeshBuilder.CreateCylinder('missileBody', { height: 2, diameter: 0.3 }, scene);
    body.rotation.x = Math.PI / 2;

    // Nose cone (using cylinder with scaled top)
    const nose = MeshBuilder.CreateCylinder('missileNose', { 
        height: 0.7, 
        diameter: 0.3,
        diameterTop: 0.01, // Very small top diameter to create a cone shape
        diameterBottom: 0.3,
        tessellation: 24
    }, scene);
    nose.position = new Vector3(0, 0, 1.35);
    nose.rotation.x = Math.PI / 2;
    nose.parent = body;

    // Fins
    const finPositions = [
        new Vector3(0, 0.3, -0.8),
        new Vector3(0, -0.3, -0.8),
        new Vector3(0.3, 0, -0.8),
        new Vector3(-0.3, 0, -0.8)
    ];

    finPositions.forEach((position, index) => {
        const fin = MeshBuilder.CreateBox(`fin${index}`, { width: 0.1, height: 0.5, depth: 0.5 }, scene);
        fin.position = position;

        // Rotate fins appropriately
        if (index < 2) {
            fin.rotation.x = Math.PI / 4;
        } else {
            fin.rotation.z = Math.PI / 4;
        }

        fin.parent = body;
    });

    // Materials
    const bodyMaterial = new StandardMaterial('missileMaterial', scene);
    bodyMaterial.diffuseColor = new Color3(0.7, 0.7, 0.7);
    body.material = bodyMaterial;

    const noseMaterial = new StandardMaterial('noseMaterial', scene);
    noseMaterial.diffuseColor = new Color3(0.8, 0.2, 0.2);
    nose.material = noseMaterial;

    return body;
};

// Create smoke trail particle system
const createSmokeTrail = (scene: Scene, emitter: Mesh, color: Color4): void => {
    const smokeSystem = new ParticleSystem('smoke', 500, scene);
    smokeSystem.particleTexture = new Texture('https://assets.babylonjs.com/textures/flare.png', scene);

    // Particles emitter
    smokeSystem.emitter = emitter;
    smokeSystem.minEmitBox = new Vector3(-0.1, -0.1, -0.1);
    smokeSystem.maxEmitBox = new Vector3(0.1, 0.1, 0.1);

    // Particle behavior
    smokeSystem.color1 = color;
    smokeSystem.color2 = new Color4(color.r * 0.7, color.g * 0.7, color.b * 0.7, color.a * 0.7);
    smokeSystem.colorDead = new Color4(0.1, 0.1, 0.1, 0);

    smokeSystem.minSize = 0.3;
    smokeSystem.maxSize = 0.8;

    smokeSystem.minLifeTime = 0.5;
    smokeSystem.maxLifeTime = 1.5;

    smokeSystem.emitRate = 50;

    smokeSystem.blendMode = ParticleSystem.BLENDMODE_STANDARD;

    smokeSystem.gravity = new Vector3(0, -0.05, 0);

    smokeSystem.direction1 = new Vector3(-0.2, -0.2, -0.2);
    smokeSystem.direction2 = new Vector3(0.2, 0.2, 0.2);

    smokeSystem.minAngularSpeed = 0;
    smokeSystem.maxAngularSpeed = Math.PI;

    smokeSystem.minEmitPower = 0.5;
    smokeSystem.maxEmitPower = 1.5;
    smokeSystem.updateSpeed = 0.01;

    // Start the particle system
    smokeSystem.start();
};

// Helper function to calculate points on a cubic Bezier curve
const getBezierPoint = (
    p0: Vector3,
    p1: Vector3,
    p2: Vector3,
    p3: Vector3,
    t: number
): Vector3 => {
    const oneMinusT = 1 - t;
    const oneMinusTSquared = oneMinusT * oneMinusT;
    const oneMinusTCubed = oneMinusTSquared * oneMinusT;

    const tSquared = t * t;
    const tCubed = tSquared * t;

    const x = oneMinusTCubed * p0.x +
              3 * oneMinusTSquared * t * p1.x +
              3 * oneMinusT * tSquared * p2.x +
              tCubed * p3.x;

    const y = oneMinusTCubed * p0.y +
              3 * oneMinusTSquared * t * p1.y +
              3 * oneMinusT * tSquared * p2.y +
              tCubed * p3.y;

    const z = oneMinusTCubed * p0.z +
              3 * oneMinusTSquared * t * p1.z +
              3 * oneMinusT * tSquared * p2.z +
              tCubed * p3.z;

    return new Vector3(x, y, z);
};

// Create and run the scene
const scene = createScene();
engine.runRenderLoop(() => {
    scene.render();
});

// Handle browser resize
window.addEventListener('resize', () => {
    engine.resize();
});
