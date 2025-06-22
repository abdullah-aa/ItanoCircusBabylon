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
import {
  ATTACKER_SIZE,
  ATTACKER_SPEED,
  ITANO_MISSILE_COUNT_MAX,
  ITANO_MISSILE_COUNT_MIN,
  MISSILE_LIFETIME,
  MISSILE_SIZE,
  MISSILE_SPEED,
} from './constants';
import { createEnhancedMissileTrail, createExplosionEffect, createTrail } from './effects';
import { IAttacker, IMissile, ISpiralParams, MissileFormationType } from './types';
import {
  calculateBezierPoint,
  createMultiBezierPath,
  createRotationQuaternion,
  getRandomFloat,
  getRandomInt,
} from './utils';

/**
 * Calculates a target point for a missile that is intended to be a "near miss".
 * @param originalTarget The original target position.
 * @param missDistance The desired distance by which to miss the target.
 * @returns A new Vector3 representing the near-miss target position.
 */
const calculateNearMissTarget = (originalTarget: Vector3, missDistance: number): Vector3 => {
  const randomDirection = new Vector3(
    getRandomFloat(-1, 1),
    getRandomFloat(-1, 1),
    getRandomFloat(-1, 1)
  ).normalize();

  return originalTarget.add(randomDirection.scale(missDistance));
};

/**
 * Applies spiral motion to a missile's base position.
 * @param missile The missile to apply motion to.
 * @param basePosition The base position of the missile along its path.
 * @param deltaTime The time since the last frame.
 * @returns The new position of the missile with the spiral offset.
 */
const applySpiralMotion = (
  missile: IMissile,
  basePosition: Vector3,
  deltaTime: number
): Vector3 => {
  const { spiralParams } = missile;

  // Clamp spiral speed to prevent extreme motion
  const maxSpiralSpeed = 0.5; // Maximum spiral speed to prevent teleporting
  const clampedSpeed =
    Math.min(Math.abs(spiralParams.speed), maxSpiralSpeed) * Math.sign(spiralParams.speed);

  // Update spiral phase with controlled speed
  spiralParams.phase += clampedSpeed * deltaTime * 0.001; // Convert ms to seconds

  // Calculate spiral offset with safety checks
  const perpendicular1 = new Vector3(spiralParams.axis.y, -spiralParams.axis.x, 0);

  // Ensure perpendicular vector is valid
  if (perpendicular1.length() < 0.01) {
    // Fallback perpendicular vector if axis is too close to Z-axis
    perpendicular1.copyFrom(new Vector3(1, 0, 0));
  }
  perpendicular1.normalize();

  const perpendicular2 = Vector3.Cross(spiralParams.axis, perpendicular1);
  perpendicular2.normalize();

  // Clamp spiral radius to prevent extreme offsets
  const maxRadius = 25; // Maximum spiral radius
  const clampedRadius = Math.min(spiralParams.radius, maxRadius);

  const spiralOffset = perpendicular1
    .scale(Math.cos(spiralParams.phase) * clampedRadius)
    .add(perpendicular2.scale(Math.sin(spiralParams.phase) * clampedRadius));

  // Ensure the spiral offset doesn't cause extreme position changes
  if (spiralOffset.length() > maxRadius) {
    spiralOffset.normalize();
    spiralOffset.scaleInPlace(maxRadius);
  }

  return basePosition.add(spiralOffset);
};

/**
 * Calculates the parameters for a missile's spiral motion based on its formation type.
 * @param formationType The type of missile formation.
 * @param groupIndex The index of the missile in its group.
 * @param totalInGroup The total number of missiles in the group.
 * @param startPos The starting position of the missile.
 * @param targetPos The target position of the missile.
 * @returns An ISpiralParams object with the calculated parameters.
 */
const calculateSpiralParams = (
  formationType: MissileFormationType,
  groupIndex: number,
  totalInGroup: number,
  startPos: Vector3,
  targetPos: Vector3
): ISpiralParams => {
  const direction = targetPos.subtract(startPos).normalize();
  const basePhase = (groupIndex / totalInGroup) * Math.PI * 2;

  switch (formationType) {
    case MissileFormationType.SPIRAL_SWARM:
      return {
        radius: getRandomFloat(3, 12), // Reduced max radius
        speed: getRandomFloat(0.05, 0.15), // Reduced speed range
        phase: basePhase,
        axis: direction,
      };
    case MissileFormationType.DOUBLE_HELIX:
      return {
        radius: getRandomFloat(5, 15), // Reduced max radius
        speed: groupIndex % 2 === 0 ? 0.1 : -0.1, // Reduced speed
        phase: basePhase + (groupIndex % 2) * Math.PI,
        axis: direction,
      };
    case MissileFormationType.CONE_FORMATION:
      return {
        radius: (groupIndex / totalInGroup) * 20 + 3, // Reduced cone size
        speed: getRandomFloat(0.03, 0.08), // Reduced speed range
        phase: basePhase,
        axis: direction,
      };
    case MissileFormationType.WAVE_PATTERN:
      return {
        radius: 8 + 6 * Math.sin(basePhase * 3), // Reduced wave amplitude
        speed: getRandomFloat(0.08, 0.12), // Reduced speed range
        phase: basePhase,
        axis: direction,
      };
    default:
      return {
        radius: 8, // Reduced default radius
        speed: 0.05, // Reduced default speed
        phase: basePhase,
        axis: direction,
      };
  }
};

/**
 * Creates a single Itano Circus-style missile.
 * @param scene The Babylon.js scene.
 * @param startPosition The starting position of the missile.
 * @param targetPosition The initial target position for the missile.
 * @param formationType The formation type for the missile group.
 * @param groupIndex The index of this missile within its formation group.
 * @param totalInGroup The total number of missiles in the formation group.
 * @param mappedAssets A map of asset names to their data URLs.
 * @returns An IMissile object.
 */
const createItanoMissile = (
  scene: Scene,
  startPosition: Vector3,
  targetPosition: Vector3,
  formationType: MissileFormationType,
  groupIndex: number,
  totalInGroup: number,
  mappedAssets: Map<string, string>
): IMissile => {
  // --- Create a more detailed missile model ---
  // The missile is composed of a body, a nose cone, and fins.
  // We create a main 'body' mesh and parent the other parts to it.
  // This entire group is then parented to a 'missileContainer' for rotation and positioning.

  const missileMaterial = new StandardMaterial('missileMaterial', scene);
  missileMaterial.diffuseColor = new Color3(0.9, 0.9, 0.9);
  missileMaterial.specularColor = new Color3(0.4, 0.4, 0.4);
  missileMaterial.emissiveColor = new Color3(0.1, 0.1, 0.1);

  const finMaterial = new StandardMaterial('finMaterial', scene);
  finMaterial.diffuseColor = new Color3(0.7, 0.2, 0.2); // Reddish fins
  finMaterial.specularColor = new Color3(0.3, 0.1, 0.1);

  // Body (main cylinder)
  const bodyHeight = MISSILE_SIZE * 2.5;
  const bodyDiameter = MISSILE_SIZE * 0.8;
  const missileMesh = MeshBuilder.CreateCylinder(
    'missileBody',
    { height: bodyHeight, diameter: bodyDiameter, tessellation: 24 },
    scene
  );
  missileMesh.material = missileMaterial;

  // Nose Cone
  const noseHeight = MISSILE_SIZE * 1.5;
  const nose = MeshBuilder.CreateCylinder(
    'missileNose',
    {
      height: noseHeight,
      diameterTop: 0,
      diameterBottom: bodyDiameter,
      tessellation: 24,
    },
    scene
  );
  nose.material = missileMaterial;
  nose.parent = missileMesh;
  nose.position.y = bodyHeight / 2 + noseHeight / 2; // Position at the front of the body

  // Fins (two boxes arranged in a cross)
  const finLength = MISSILE_SIZE * 1.2;
  const finWidth = MISSILE_SIZE * 1.5; // How far the fin extends from the body
  const finDepth = 0.05; // Thickness of the fin
  const finYPosition = -bodyHeight / 2 + finLength / 2;

  const fin1 = MeshBuilder.CreateBox(
    'fin1',
    { width: finWidth, height: finLength, depth: finDepth },
    scene
  );
  fin1.material = finMaterial;
  fin1.parent = missileMesh;
  fin1.position.y = finYPosition;

  const fin2 = MeshBuilder.CreateBox(
    'fin2',
    { width: finDepth, height: finLength, depth: finWidth },
    scene
  );
  fin2.material = finMaterial;
  fin2.parent = missileMesh;
  fin2.position.y = finYPosition;

  // The missile model is built with its 'up' direction along the Y-axis.
  // We need a container to handle the positioning and rotation in the world.
  const missileContainer = new Mesh('missileContainer', scene);
  missileMesh.parent = missileContainer;

  // Rotate the missile model to align its 'forward' direction with the container's Z-axis.
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

  // Look at initial target direction with smooth initialization
  const direction = interceptPoint.subtract(startPosition);
  if (direction.length() > 0.01) {
    direction.normalize();
    // Create a rotation quaternion that will orient the container toward the target
    missileContainer.rotationQuaternion = createRotationQuaternion(direction);
  } else {
    // Default orientation if no valid direction
    missileContainer.rotationQuaternion = Quaternion.Identity();
  }

  // Create enhanced smoke trail for the missile
  const missileTrail = createTrail(scene, missileMesh, mappedAssets, 'flare3.png', {
    minEmitBox: new Vector3(0, -MISSILE_SIZE * 1.6, 0),
    maxEmitBox: new Vector3(0, -MISSILE_SIZE * 1.6, 0),
    color1: new Color4(1, 0.7, 0.1, 0.8), // Bright yellow-orange core
    color2: new Color4(1, 0.3, 0.1, 0.6), // Darker orange-red variation
    colorDead: new Color4(0.5, 0.5, 0.5, 0), // Fade to gray smoke
    minSize: 0.2,
    maxSize: 1.2,
    minLifeTime: 0.2,
    maxLifeTime: 0.6,
    emitRate: 200,
    blendMode: ParticleSystem.BLENDMODE_ADD,
    gravity: new Vector3(0, 0, 0),
    direction1: new Vector3(-0.15, -0.15, -1),
    direction2: new Vector3(0.15, 0.15, -1),
    minEmitPower: 1,
    maxEmitPower: 2,
    updateSpeed: 0.005,
    minAngularSpeed: 0,
    maxAngularSpeed: Math.PI,
  });

  // All missiles use bezier paths for more interesting movement
  const useBezier = true;

  // Create random multi-bezier path from start to intercept point
  const bezierPaths = createMultiBezierPath(startPosition, interceptPoint);

  // Ensure we have valid bezier paths
  if (!bezierPaths || bezierPaths.length === 0) {
    // Fallback: create a simple direct path if bezier generation fails
    const directPath = [
      startPosition.clone(),
      startPosition.add(interceptPoint.subtract(startPosition).scale(0.33)),
      startPosition.add(interceptPoint.subtract(startPosition).scale(0.67)),
      interceptPoint.clone(),
    ];
    bezierPaths.push(directPath);
  }

  // Random initial speed for more varied missile behavior (reduced variation)
  const initialSpeed = MISSILE_SPEED * getRandomFloat(0.9, 1.1);

  // Calculate spiral parameters based on formation type
  const spiralParams = calculateSpiralParams(
    formationType,
    groupIndex,
    totalInGroup,
    startPosition,
    targetPosition
  );

  // 70% chance for near miss to create dramatic effect
  const isNearMiss = Math.random() < 0.7;

  // Create enhanced trail for dramatic effect
  const coreTrail = createEnhancedMissileTrail(scene, missileMesh, mappedAssets);

  return {
    mesh: missileMesh,
    container: missileContainer,
    trail: missileTrail,
    coreTrail,
    target: isNearMiss ? calculateNearMissTarget(interceptPoint, 15) : interceptPoint.clone(),
    speed: initialSpeed,
    lifetime: Date.now() + MISSILE_LIFETIME,
    bezierPaths,
    currentBezierPath: 0,
    bezierTime: 0,
    useBezier,
    lastPathUpdateTime: Date.now(),
    targetReached: false,
    // Itano Circus properties
    spiralParams,
    formationType,
    groupIndex,
    totalInGroup,
    isNearMiss,
    basePosition: startPosition.clone(),
  };
};

/**
 * Launches a barrage of Itano Circus-style missiles from the battlestation.
 * @param scene The Babylon.js scene.
 * @param battlestation The battlestation mesh, which is the origin of the missiles.
 * @param attacker The attacker object, which is the target of the missiles.
 * @param missiles The array to add the new missiles to.
 * @param mappedAssets A map of asset names to their data URLs.
 */
export const launchMissileBarrage = (
  scene: Scene,
  battlestation: Mesh,
  attacker: IAttacker,
  missiles: IMissile[],
  mappedAssets: Map<string, string>
): void => {
  const missileCount = getRandomInt(ITANO_MISSILE_COUNT_MIN, ITANO_MISSILE_COUNT_MAX);
  const formationType = getRandomInt(0, 3) as MissileFormationType;

  console.log(
    `Launching Itano Circus barrage: ${missileCount} missiles in ${MissileFormationType[formationType]} formation`
  );

  for (let i = 0; i < missileCount; i++) {
    // Create missile with slight delay between each for dramatic effect
    setTimeout(() => {
      const missile = createItanoMissile(
        scene,
        battlestation.position,
        attacker.mesh.position,
        formationType,
        i,
        missileCount,
        mappedAssets
      );
      missiles.push(missile);
    }, i * 50); // 50ms delay between each missile for rapid fire effect
  }
};

/**
 * Updates the state of all active missiles on each frame.
 * @param missiles The array of active missiles.
 * @param attacker The attacker object, which the missiles are targeting.
 * @param currentTime The current time in milliseconds.
 * @param mappedAssets A map of asset names to their data URLs.
 */
export const updateMissiles = (
  missiles: IMissile[],
  attacker: IAttacker,
  currentTime: number,
  mappedAssets: Map<string, string>
): void => {
  // Define constants for path recalculation
  const PATH_UPDATE_INTERVAL_MIN = 2500; // Minimum time between path updates (ms)
  const PATH_UPDATE_INTERVAL_MAX = 5000; // Maximum time between path updates (ms)
  const DELTA_TIME = 16.67; // Assume 60fps for consistent timing
  const MAX_SPEED_MULTIPLIER = 1.3; // Limit speed boost to prevent blur
  const BEZIER_SPEED_FACTOR = 0.003; // Reduced from 0.01 to prevent teleporting

  for (let i = missiles.length - 1; i >= 0; i--) {
    const missile = missiles[i];

    // Check if missile has expired
    if (currentTime > missile.lifetime) {
      // Create explosion effect for expired missile
      createExplosionEffect(
        missile.container.position,
        missile.container.getScene(),
        mappedAssets,
        'cloud.png',
        new Color4(1, 0.7, 0.1, 1),
        new Color4(1, 0.5, 0.1, 1),
        1.5, // Increased min size
        4.0 // Increased max size
      );

      // Remove the missile and all its trails
      missile.trail.dispose();
      if (missile.coreTrail) {
        missile.coreTrail.dispose();
      }
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
      const interceptPoint = attacker.mesh.position
        .clone()
        .add(attackerDirection.scale(interceptDistance));

      // Update the missile's target to the new intercept point
      missile.target = interceptPoint.clone();

      // Change missile velocity randomly but keep it within reasonable bounds
      missile.speed = MISSILE_SPEED * getRandomFloat(0.9, 1.1); // Reduced variation

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
          missile.container.position
            .add(direction.scale(distanceToAttacker * 0.3))
            .add(perpVector.scale(curveOffset)),
          // Second control point - with opposite perpendicular offset
          missile.target
            .subtract(direction.scale(distanceToAttacker * 0.2))
            .subtract(perpVector.scale(curveOffset * 0.7)),
          missile.target.clone(),
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

      // Adjust missile speed based on distance to attacker with limited multipliers
      let speedMultiplier = 1.0;

      // Moderate speed boost when getting close to attacker
      if (distanceToAttacker < 30) {
        speedMultiplier = MAX_SPEED_MULTIPLIER; // Limited boost to prevent blur
      } else if (distanceToAttacker < 60) {
        speedMultiplier = 1.15; // Small boost when approaching
      }

      const currentSpeed = missile.speed * speedMultiplier;

      // Advance along the bezier curve with controlled speed
      const bezierAdvancement = currentSpeed * BEZIER_SPEED_FACTOR;
      missile.bezierTime += bezierAdvancement;

      // Clamp bezier time to prevent overshooting
      missile.bezierTime = Math.min(missile.bezierTime, 1.0);

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

      // Calculate desired target position on bezier curve with spiral offset
      const basePosition = calculateBezierPoint(
        missile.bezierTime,
        currentPath[0],
        currentPath[1],
        currentPath[2],
        currentPath[3]
      );

      // Store base position for reference
      missile.basePosition = basePosition.clone();

      // Apply spiral motion to create desired target position
      const desiredPosition = applySpiralMotion(missile, basePosition, DELTA_TIME);

      // Calculate desired direction (where the missile should be heading)
      const currentPosition = missile.container.position;
      let desiredDirection = desiredPosition.subtract(currentPosition);

      // If desired direction is too small, use bezier path tangent
      if (desiredDirection.length() < 0.01) {
        const lookAheadTime = Math.min(missile.bezierTime + 0.1, 1.0);
        const lookAheadPosition = calculateBezierPoint(
          lookAheadTime,
          currentPath[0],
          currentPath[1],
          currentPath[2],
          currentPath[3]
        );
        desiredDirection = lookAheadPosition.subtract(basePosition);
      }

      if (desiredDirection.length() > 0.01) {
        desiredDirection.normalize();

        // Create target rotation towards desired direction
        const targetRotation = createRotationQuaternion(desiredDirection);

        // Initialize rotation quaternion if it doesn't exist
        if (!missile.container.rotationQuaternion) {
          missile.container.rotationQuaternion = targetRotation;
        } else {
          // Smooth steering towards desired direction
          Quaternion.SlerpToRef(
            missile.container.rotationQuaternion,
            targetRotation,
            0.08, // Slower steering for more natural flight
            missile.container.rotationQuaternion
          );
        }
      }

      // Move missile forward in its facing direction (natural flight)
      const forwardDirection = missile.container.getDirection(new Vector3(0, 0, 1));
      const forwardMovement = forwardDirection.scale(currentSpeed * 0.1); // Scale for frame rate

      // Apply forward movement
      const newPosition = currentPosition.add(forwardMovement);

      // Validate movement distance to prevent extreme jumps
      const movementDistance = forwardMovement.length();
      if (movementDistance < 10 && movementDistance > 0) {
        missile.container.position.copyFrom(newPosition);
      }
    }

    // Check if missile has hit the attacker (only if not a deliberate near miss)
    if (
      !missile.isNearMiss &&
      Vector3.Distance(missile.container.position, attacker.mesh.position) < ATTACKER_SIZE / 2
    ) {
      // Create explosion effect
      createExplosionEffect(
        missile.container.position,
        missile.container.getScene(),
        mappedAssets,
        'fire.png',
        new Color4(1, 0.5, 0, 1),
        new Color4(1, 0.2, 0, 1),
        2, // Increased min size
        5 // Increased max size
      );

      // Remove the missile and all its trails
      missile.trail.dispose();
      if (missile.coreTrail) {
        missile.coreTrail.dispose();
      }
      missile.mesh.dispose();
      missile.container.dispose();
      missiles.splice(i, 1);
    }
  }
};
