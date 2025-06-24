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
  STATION_SIZE,
} from './constants';
import { createTrail } from './effects';
import { IAttacker, IMissile } from './types';
import { createRotationQuaternion, getRandomFloat, createBezierPath, calculateBezierTangent } from './utils';

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
    // Enable bezier curve movement
    bezierPaths: [createBezierPath(attackerMesh.position, initialTarget)],
    currentBezierPath: 0,
    bezierTime: 0,
    useBezier: true,
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
  const STATION_AVOIDANCE_DISTANCE = STATION_SIZE * 4; // Minimum distance to maintain from station
  const STATION_REPULSION_STRENGTH = 6; // How strongly to push away from station

  // Check distance to battlestation and apply avoidance
  const distanceToBattlestation = Vector3.Distance(attacker.mesh.position, battlestation.position);
  let stationAvoidanceForce = Vector3.Zero();
  let needsStationAvoidance = false;
  
  if (distanceToBattlestation < STATION_AVOIDANCE_DISTANCE) {
    needsStationAvoidance = true;
    // Calculate repulsion vector away from station
    const awayFromStation = attacker.mesh.position.subtract(battlestation.position);
    if (awayFromStation.length() > 0.01) {
      // Normalize and scale by inverse distance (closer = stronger repulsion)
      const repulsionStrength = STATION_REPULSION_STRENGTH * (1 - distanceToBattlestation / STATION_AVOIDANCE_DISTANCE);
      stationAvoidanceForce = awayFromStation.normalize().scale(repulsionStrength);
    }
  }

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

  // Initialize bezier paths if not using bezier or no paths exist
  if (!attacker.useBezier || !attacker.bezierPaths || attacker.bezierPaths.length === 0) {
    // Generate a new curved path around the battlestation
    const angle = Math.random() * Math.PI * 2;
    const height = getRandomFloat(-100, 100);
         const radius = getRandomFloat(Math.max(140, STATION_AVOIDANCE_DISTANCE + 30), 220);

    const newTarget = new Vector3(
      battlestation.position.x + Math.cos(angle) * radius,
      battlestation.position.y + height,
      battlestation.position.z + Math.sin(angle) * radius
    );

         attacker.bezierPaths = [createBezierPath(attacker.mesh.position, newTarget)];
     attacker.currentBezierPath = 0;
     attacker.bezierTime = 0;
     attacker.useBezier = true;
     attacker.targetChangeTime = currentTime;
     attacker.lastPathUpdateTime = currentTime;
   }

   // Check if we need a new bezier path
   const pathComplete = (attacker.bezierTime || 0) >= 1.0;
   const timeSinceLastUpdate = currentTime - (attacker.lastPathUpdateTime || 0);
   const shouldUpdatePath = timeSinceLastUpdate > getRandomFloat(6000, 8000); // 6-8 seconds between path updates

   if (needsNewPath || pathComplete || shouldUpdatePath) {
     // Generate a new curved path around the battlestation, avoiding getting too close
     const angle = Math.random() * Math.PI * 2;
     const height = getRandomFloat(-100, 100);
     const radius = getRandomFloat(Math.max(140, STATION_AVOIDANCE_DISTANCE + 30), 220);

     const newTarget = new Vector3(
       battlestation.position.x + Math.cos(angle) * radius,
       battlestation.position.y + height,
       battlestation.position.z + Math.sin(angle) * radius
     );

     // Create new bezier path from current position to new target
     attacker.bezierPaths = [createBezierPath(attacker.mesh.position, newTarget)];
     attacker.currentBezierPath = 0;
     attacker.bezierTime = 0;
     attacker.targetChangeTime = currentTime;
     attacker.lastPathUpdateTime = currentTime;
   }

   // Follow bezier curve
   if (attacker.useBezier && attacker.bezierPaths && attacker.bezierPaths.length > 0) {
     const currentPath = attacker.bezierPaths[attacker.currentBezierPath || 0];
     
     if (currentPath && currentPath.length >= 4) {
       // Get tangent vector (direction) at current position
       const tangent = calculateBezierTangent(
         attacker.bezierTime || 0,
         currentPath[0],
         currentPath[1],
         currentPath[2],
         currentPath[3]
       );

       // Calculate movement direction and distance for constant speed
       let movementDirection = tangent.normalize();
       const desiredMoveDistance = attacker.speed; // Use attacker speed directly
       
       // Apply station avoidance if too close
       if (needsStationAvoidance && stationAvoidanceForce.length() > 0.01) {
         // Blend movement direction with avoidance force (stronger influence)
         movementDirection = movementDirection.add(stationAvoidanceForce.scale(1.5)).normalize();
       }
       
       // Move at constant speed in the direction
       const newPosition = attacker.mesh.position.add(movementDirection.scale(desiredMoveDistance));
       attacker.mesh.position.copyFrom(newPosition);

       // Update bezier time based on how much we actually moved along the curve
       // This is an approximation - we increment based on tangent length
       const tangentLength = tangent.length();
       if (tangentLength > 0.01) {
         const timeIncrement = desiredMoveDistance / (tangentLength * 100); // Scale factor for reasonable progression
         attacker.bezierTime = Math.min((attacker.bezierTime || 0) + timeIncrement, 1.0);
       } else {
         // If tangent is too small, use small fixed increment
         attacker.bezierTime = Math.min((attacker.bezierTime || 0) + 0.01, 1.0);
       }

       // Handle curve completion
       if (attacker.bezierTime >= 1.0) {
         // Move to next bezier path if available
         if (attacker.bezierPaths && attacker.currentBezierPath! < attacker.bezierPaths.length - 1) {
           attacker.currentBezierPath!++;
           attacker.bezierTime = 0;
         } else {
           // Path completed, will generate new one on next update
           attacker.targetReached = true;
         }
       }

       // Smooth rotation towards movement direction
       if (movementDirection.length() > 0.01) {
         movementDirection.normalize();
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
     }
   }

  // Update speed for reference (not used for position)
  attacker.currentSpeed = attacker.speed;
};
