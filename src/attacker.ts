import {
  Color3,
  Color4,
  Mesh,
  MeshBuilder,
  ParticleSystem,
  Quaternion,
  Scene,
  StandardMaterial,
  Vector3,
} from '@babylonjs/core';
import earcut from 'earcut';
import {
  ATTACKER_SIZE,
  ATTACKER_SPEED,
  EVASION_THRESHOLD_MAX,
  EVASION_THRESHOLD_MIN,
} from './constants';
import { createTrail } from './effects';
import { IAttacker, IMissile } from './types';
import { createRotationQuaternion, getRandomFloat } from './utils';

/**
 * Creates the attacker spacecraft, including its mesh and trail effects.
 * @param scene The Babylon.js scene.
 * @param mappedAssets A map of asset names to their data URLs.
 * @returns The IAttacker object.
 */
export const createAttacker = (scene: Scene, mappedAssets: Map<string, string>): IAttacker => {
  // --- MATERIALS ---
  const bodyMaterial = new StandardMaterial('attackerBodyMat', scene);
  bodyMaterial.diffuseColor = new Color3(0.6, 0.1, 0.1); // Dark red
  bodyMaterial.specularColor = new Color3(0.5, 0.2, 0.2);

  const wingMaterial = new StandardMaterial('attackerWingMat', scene);
  wingMaterial.diffuseColor = new Color3(0.4, 0.1, 0.1); // Even darker red
  wingMaterial.specularColor = new Color3(0.3, 0.1, 0.1);

  const cockpitMaterial = new StandardMaterial('attackerCockpitMat', scene);
  cockpitMaterial.diffuseColor = new Color3(0, 0.8, 1); // Bright blue/cyan
  cockpitMaterial.emissiveColor = new Color3(0, 0.3, 0.5);
  cockpitMaterial.alpha = 0.6; // Semi-transparent

  const thrusterMaterial = new StandardMaterial('attackerThrusterMat', scene);
  thrusterMaterial.diffuseColor = new Color3(0.3, 0.3, 0.3);
  thrusterMaterial.emissiveColor = new Color3(0.1, 0.1, 0.1);

  // --- MESH CONSTRUCTION ---
  // Main fuselage
  const fuselage = MeshBuilder.CreateBox(
    'attackerFuselage',
    {
      width: ATTACKER_SIZE * 0.8,
      height: ATTACKER_SIZE / 2.5,
      depth: ATTACKER_SIZE * 1.8,
    },
    scene
  );
  fuselage.material = bodyMaterial;

  // Cockpit
  const cockpit = MeshBuilder.CreateSphere(
    'attackerCockpit',
    { diameter: ATTACKER_SIZE / 2, segments: 12 },
    scene
  );
  cockpit.material = cockpitMaterial;
  cockpit.parent = fuselage;
  cockpit.position = new Vector3(0, ATTACKER_SIZE * 0.2, ATTACKER_SIZE * 0.5);

  // Swept Wings
  const wingShape = [
    new Vector3(0, 0, 0),
    new Vector3(-ATTACKER_SIZE * 1.5, 0, ATTACKER_SIZE * 0.5),
    new Vector3(-ATTACKER_SIZE * 1.5, 0, -ATTACKER_SIZE * 0.5),
    new Vector3(0, 0, -ATTACKER_SIZE * 0.8),
  ];

  const leftWing = MeshBuilder.CreatePolygon(
    'attackerLeftWing',
    { shape: wingShape, depth: ATTACKER_SIZE / 12 },
    scene,
    earcut
  );
  leftWing.material = wingMaterial;
  leftWing.parent = fuselage;
  leftWing.position.x = -ATTACKER_SIZE * 0.4;
  leftWing.rotation.y = Math.PI; // Flip for the other side

  const rightWing = leftWing.clone('attackerRightWing');
  rightWing.parent = fuselage;
  rightWing.position.x = ATTACKER_SIZE * 0.4;
  rightWing.scaling.x = -1; // Mirror on the x-axis

  // Engine Thrusters
  const thrusterDiameter = ATTACKER_SIZE * 0.3;
  const thrusterHeight = ATTACKER_SIZE * 0.6;
  const leftThruster = MeshBuilder.CreateCylinder(
    'leftThruster',
    { height: thrusterHeight, diameter: thrusterDiameter, tessellation: 12 },
    scene
  );
  leftThruster.material = thrusterMaterial;
  leftThruster.parent = fuselage;
  leftThruster.position = new Vector3(-ATTACKER_SIZE * 0.25, 0, -ATTACKER_SIZE * 0.9);
  leftThruster.rotation.x = Math.PI / 2;

  const rightThruster = leftThruster.clone('rightThruster');
  rightThruster.parent = fuselage;
  rightThruster.position.x = ATTACKER_SIZE * 0.25;

  const attackerMesh = fuselage; // Use fuselage as the main mesh for the attacker object

  // Position the attacker at a distance from the origin
  attackerMesh.position = new Vector3(
    getRandomFloat(-100, 100),
    getRandomFloat(-100, 100),
    getRandomFloat(-100, 100)
  );

  // Create smoke trail for the attacker
  const attackerTrail = createTrail(scene, attackerMesh, mappedAssets, 'flare.png', {
    minEmitBox: new Vector3(-0.5, -0.5, -2),
    maxEmitBox: new Vector3(0.5, 0.5, -2),
    color1: new Color4(0.8, 0.8, 0.8, 0.1),
    color2: new Color4(0.7, 0.7, 0.7, 0.1),
    colorDead: new Color4(0.5, 0.5, 0.5, 0),
    minSize: 0.5,
    maxSize: 1.5,
    minLifeTime: 0.5,
    maxLifeTime: 1.0,
    emitRate: 100,
    blendMode: ParticleSystem.BLENDMODE_STANDARD,
    gravity: new Vector3(0, 0, 0),
    direction1: new Vector3(-0.2, -0.2, -1),
    direction2: new Vector3(0.2, 0.2, -1),
    minEmitPower: 1,
    maxEmitPower: 2,
    updateSpeed: 0.01,
  });

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
    target: initialTarget.clone(),
    currentTarget: attackerMesh.position.clone(),
    targetChangeTime: Date.now(),
    transitionDuration: 4000, // 4 seconds to transition between targets
    speed: ATTACKER_SPEED,
    currentSpeed: ATTACKER_SPEED,
    evasionThreshold: getRandomFloat(EVASION_THRESHOLD_MIN, EVASION_THRESHOLD_MAX),
    lastEvasionTime: 0,
    isEvading: false,
    // Simplified properties - keeping for compatibility but not used
    bezierPaths: undefined,
    currentBezierPath: 0,
    bezierTime: 0,
    useBezier: false,
    lastPathUpdateTime: Date.now(),
    targetReached: false,
    isPerformingBarrelRoll: false,
    barrelRollProgress: 0,
    barrelRollAxis: Vector3.Up(),
    lastDirectionChange: Date.now(),
    evasionIntensity: 0,
    burstSpeed: ATTACKER_SPEED,
  };
};

/**
 * Updates the attacker's position, rotation, and behavior on each frame.
 * @param attacker The attacker object to update.
 * @param battlestation The battlestation mesh, used for navigation.
 * @param missiles An array of active missiles, used for collision avoidance.
 * @param scene The Babylon.js scene.
 * @param currentTime The current time in milliseconds.
 */
export const updateAttacker = (
  attacker: IAttacker,
  battlestation: Mesh,
  missiles: IMissile[],
  scene: Scene,
  currentTime: number
): void => {
  const PATH_CHANGE_COOLDOWN = 2000; // 2 seconds cooldown between path changes
  const COLLISION_THRESHOLD = 40; // Distance to trigger evasion

  // Check if any missiles are too close
  let needsNewPath = false;
  for (const missile of missiles) {
    const distance = Vector3.Distance(attacker.mesh.position, missile.container.position);
    if (distance < COLLISION_THRESHOLD) {
      // Only change path if cooldown has passed
      if (currentTime - attacker.lastEvasionTime > PATH_CHANGE_COOLDOWN) {
        needsNewPath = true;
        attacker.lastEvasionTime = currentTime;
        break;
      }
    }
  }

  // Calculate movement direction towards target
  const toTarget = attacker.target.subtract(attacker.mesh.position);
  let distanceToTarget = toTarget.length();

  // Check if we need a new target (collision avoidance, natural progression, or reached current target)
  const pathComplete = currentTime - attacker.targetChangeTime > attacker.transitionDuration;
  const targetReached = distanceToTarget < 5.0; // Increased threshold to prevent stopping

  if (needsNewPath || pathComplete || targetReached) {
    // Generate a new curved path around the battlestation
    const angle = Math.random() * Math.PI * 2;
    const height = getRandomFloat(-100, 100);
    const radius = getRandomFloat(120, 200);

    attacker.target = new Vector3(
      battlestation.position.x + Math.cos(angle) * radius,
      battlestation.position.y + height,
      battlestation.position.z + Math.sin(angle) * radius
    );

    attacker.currentTarget = attacker.mesh.position.clone();
    attacker.targetChangeTime = currentTime;
    attacker.transitionDuration = getRandomFloat(3000, 5000); // 3-5 seconds per path

    // Recalculate direction to new target
    toTarget.copyFrom(attacker.target.subtract(attacker.mesh.position));
    distanceToTarget = toTarget.length();
  }

  // Calculate movement direction - always move towards target
  let movementDirection: Vector3;
  if (distanceToTarget > 0.01) {
    // Move towards target at constant speed
    movementDirection = toTarget.normalize();

    // Apply speed directly per frame (speed is already calibrated for per-frame movement)
    const movementDistance = attacker.speed;

    // Don't overshoot the target
    const actualMovementDistance = Math.min(movementDistance, distanceToTarget);

    // Update position
    const newPosition = attacker.mesh.position.add(movementDirection.scale(actualMovementDistance));
    attacker.mesh.position.copyFrom(newPosition);
  } else {
    // Very close to target, use forward direction for rotation
    movementDirection = Vector3.Forward();
  }

  if (movementDirection.length() > 0.01) {
    movementDirection.normalize();

    // Smooth rotation towards movement direction
    const targetRotation = createRotationQuaternion(movementDirection);

    if (!attacker.mesh.rotationQuaternion) {
      attacker.mesh.rotationQuaternion = targetRotation;
    } else {
      Quaternion.SlerpToRef(
        attacker.mesh.rotationQuaternion,
        targetRotation,
        0.1, // Smooth rotation interpolation
        attacker.mesh.rotationQuaternion
      );
    }
  }

  // Update speed for reference (not used for position)
  attacker.currentSpeed = attacker.speed;
};
