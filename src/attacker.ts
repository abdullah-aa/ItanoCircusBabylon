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
import * as earcut from 'earcut';
import {
  ATTACKER_SIZE,
  getAttackerSpeed,
  EVASION_THRESHOLD_MAX,
  EVASION_THRESHOLD_MIN,
  STATION_SIZE,
} from './constants';
import { createTrail } from './effects';
import { IAttacker, IMissile } from './types';
import {
  createRotationQuaternion,
  getRandomFloat,
  createBezierPath,
  calculateBezierTangent,
} from './utils';

/**
 * Creates the attacker spacecraft, including its mesh and trail effects.
 * @param scene The Babylon.js scene.
 * @param mappedAssets A map of asset names to their data URLs.
 * @returns The IAttacker object.
 */
export const createAttacker = (scene: Scene, mappedAssets: Map<string, string>): IAttacker => {
  // --- MATERIALS ---
  const bodyMaterial = new StandardMaterial('attackerBodyMat', scene);
  bodyMaterial.diffuseColor = new Color3(0.1, 0.4, 0.8); // A nice blue
  bodyMaterial.specularColor = new Color3(0.2, 0.5, 0.9);

  const wingMaterial = new StandardMaterial('attackerWingMat', scene);
  wingMaterial.diffuseColor = new Color3(0.1, 0.2, 0.6); // Darker blue
  wingMaterial.specularColor = new Color3(0.1, 0.3, 0.7);

  const cockpitMaterial = new StandardMaterial('attackerCockpitMat', scene);
  cockpitMaterial.diffuseColor = new Color3(1, 0.5, 0); // Contrasting orange
  cockpitMaterial.emissiveColor = new Color3(0.8, 0.4, 0);
  cockpitMaterial.alpha = 0.8;

  const thrusterMaterial = new StandardMaterial('attackerThrusterMat', scene);
  thrusterMaterial.diffuseColor = new Color3(0.3, 0.3, 0.3);
  thrusterMaterial.emissiveColor = new Color3(0.1, 0.1, 0.1);

  // --- MESH CONSTRUCTION ---
  // Main fuselage - using a capsule for a sleeker look
  const fuselage = MeshBuilder.CreateCapsule(
    'attackerFuselage',
    {
      height: ATTACKER_SIZE * 2.2,
      radius: ATTACKER_SIZE * 0.4,
    },
    scene
  );
  fuselage.rotation.x = Math.PI / 2;
  fuselage.bakeCurrentTransformIntoVertices();
  fuselage.material = bodyMaterial;

  // Cockpit
  const cockpit = MeshBuilder.CreateSphere(
    'attackerCockpit',
    { diameter: ATTACKER_SIZE / 2, segments: 12 },
    scene
  );
  cockpit.material = cockpitMaterial;
  cockpit.parent = fuselage;
  cockpit.position = new Vector3(0, ATTACKER_SIZE * 0.2, ATTACKER_SIZE * 0.7);

  // Swept Wings - more aggressive and sleek
  const wingShape = [
    new Vector3(0, 0, ATTACKER_SIZE * 0.2),
    new Vector3(-ATTACKER_SIZE * 2.5, 0, ATTACKER_SIZE * 0.4),
    new Vector3(-ATTACKER_SIZE * 2.5, 0, -ATTACKER_SIZE * 0.6),
    new Vector3(0, 0, -ATTACKER_SIZE * 1.0),
  ];

  const leftWing = MeshBuilder.CreatePolygon(
    'attackerLeftWing',
    { shape: wingShape, depth: ATTACKER_SIZE / 20 },
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
  leftThruster.position = new Vector3(-ATTACKER_SIZE * 0.25, 0, -ATTACKER_SIZE * 1.1);
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
    color1: new Color4(0.2, 0.5, 1.0, 0.5),
    color2: new Color4(0.5, 0.8, 1.0, 0.5),
    colorDead: new Color4(0.1, 0.2, 0.4, 0),
    minSize: 1.0, // Increased size for prominence
    maxSize: 2.0, // Increased size for prominence
    minLifeTime: 0.8,
    maxLifeTime: 1.5,
    emitRate: 200, // More particles
    blendMode: ParticleSystem.BLENDMODE_ADD, // Brighter blending
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
    speed: getAttackerSpeed(),
    currentSpeed: getAttackerSpeed(),
    evasionThreshold: getRandomFloat(EVASION_THRESHOLD_MIN, EVASION_THRESHOLD_MAX),
    lastEvasionTime: 0,
    isEvading: false,
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
    burstSpeed: getAttackerSpeed(),
    // User control
    isUserControlled: false,
    yaw: 0,
    pitch: 0,
  };
};

const updateUserControlledAttacker = (attacker: IAttacker): void => {
  const rotationSpeed = 1.0;
  if (attacker.pitch !== 0 || attacker.yaw !== 0) {
    const yaw = attacker.yaw * rotationSpeed;
    const pitch = attacker.pitch * rotationSpeed;

    // Create rotation quaternions around local axes
    const yawQuat = Quaternion.RotationAxis(Vector3.Up(), yaw); // Yaw around local Y
    const pitchQuat = Quaternion.RotationAxis(Vector3.Right(), -pitch); // Pitch around local X (inverted for intuitive controls)

    // Combine and apply rotation
    if (attacker.mesh.rotationQuaternion) {
      const combinedRotation = yawQuat.multiply(pitchQuat);
      attacker.mesh.rotationQuaternion.multiplyInPlace(combinedRotation);
    }
  }

  // Move forward in the new direction
  const forward = attacker.mesh.getDirection(new Vector3(0, 0, 1));
  attacker.mesh.position.addInPlace(forward.scale(attacker.speed));
};

const updateAIControlledAttacker = (
  attacker: IAttacker,
  battlestation: Mesh,
  currentTime: number
): void => {
  const PATH_CHANGE_COOLDOWN = 2000;
  const STATION_AVOIDANCE_DISTANCE = STATION_SIZE * 4;
  const STATION_REPULSION_STRENGTH = 6;

  let stationAvoidanceForce = Vector3.Zero();
  let needsStationAvoidance = false;
  const distanceToBattlestation = Vector3.Distance(attacker.mesh.position, battlestation.position);
  if (distanceToBattlestation < STATION_AVOIDANCE_DISTANCE) {
    needsStationAvoidance = true;
    const awayFromStation = attacker.mesh.position.subtract(battlestation.position);
    if (awayFromStation.length() > 0.01) {
      const repulsionStrength =
        STATION_REPULSION_STRENGTH * (1 - distanceToBattlestation / STATION_AVOIDANCE_DISTANCE);
      stationAvoidanceForce = awayFromStation.normalize().scale(repulsionStrength);
    }
  }

  const pathComplete = (attacker.bezierTime || 0) >= 1.0;
  const timeSinceLastUpdate = currentTime - (attacker.lastPathUpdateTime || 0);
  const shouldUpdatePath = timeSinceLastUpdate > getRandomFloat(6000, 8000);

  if (pathComplete || shouldUpdatePath) {
    const angle = Math.random() * Math.PI * 2;
    const height = getRandomFloat(-100, 100);
    const radius = getRandomFloat(Math.max(140, STATION_AVOIDANCE_DISTANCE + 30), 220);

    const newTargetCandidate = new Vector3(
      battlestation.position.x + Math.cos(angle) * radius,
      battlestation.position.y + height,
      battlestation.position.z + Math.sin(angle) * radius
    );

    const forward = attacker.mesh.getDirection(new Vector3(0, 0, 1)).normalize();
    const directionToTarget = newTargetCandidate.subtract(attacker.mesh.position).normalize();

    const dotProduct = Vector3.Dot(forward, directionToTarget);
    const clampedDotProduct = Math.max(-1, Math.min(1, dotProduct));
    const angleBetween = Math.acos(clampedDotProduct);
    const maxAngle = 25 * (Math.PI / 180); // 25 degrees in radians

    let newTarget = newTargetCandidate;

    if (angleBetween > maxAngle) {
      const rotationAxis = Vector3.Cross(forward, directionToTarget);

      if (rotationAxis.lengthSquared() > 0.001) {
        rotationAxis.normalize();
        const clampRotation = Quaternion.RotationAxis(rotationAxis, maxAngle);
        const newDirection = forward.applyRotationQuaternion(clampRotation);
        const distance = Vector3.Distance(attacker.mesh.position, newTargetCandidate);
        newTarget = attacker.mesh.position.add(newDirection.scale(distance));
      } else {
        // Attacker is facing directly away from the target, pick an arbitrary axis to turn
        let arbitraryAxis = Vector3.Up();
        if (Math.abs(Vector3.Dot(forward, arbitraryAxis)) > 0.99) {
          arbitraryAxis = Vector3.Right(); // Use right vector if forward is aligned with up
        }
        const clampRotation = Quaternion.RotationAxis(arbitraryAxis, maxAngle);
        const newDirection = forward.applyRotationQuaternion(clampRotation);
        const distance = Vector3.Distance(attacker.mesh.position, newTargetCandidate);
        newTarget = attacker.mesh.position.add(newDirection.scale(distance));
      }
    }

    attacker.bezierPaths = [createBezierPath(attacker.mesh.position, newTarget)];
    attacker.currentBezierPath = 0;
    attacker.bezierTime = 0;
    attacker.targetChangeTime = currentTime;
    attacker.lastPathUpdateTime = currentTime;
  }

  if (attacker.useBezier && attacker.bezierPaths && attacker.bezierPaths.length > 0) {
    const currentPath = attacker.bezierPaths[attacker.currentBezierPath || 0];
    if (currentPath && currentPath.length >= 4) {
      const tangent = calculateBezierTangent(
        attacker.bezierTime || 0,
        currentPath[0],
        currentPath[1],
        currentPath[2],
        currentPath[3]
      );

      let movementDirection = tangent.normalize();
      const desiredMoveDistance = attacker.speed;

      if (needsStationAvoidance && stationAvoidanceForce.length() > 0.01) {
        movementDirection = movementDirection.add(stationAvoidanceForce.scale(1.5)).normalize();
      }

      const newPosition = attacker.mesh.position.add(movementDirection.scale(desiredMoveDistance));
      attacker.mesh.position.copyFrom(newPosition);

      const tangentLength = tangent.length();
      if (tangentLength > 0.01) {
        const timeIncrement = desiredMoveDistance / (tangentLength * 100);
        attacker.bezierTime = Math.min((attacker.bezierTime || 0) + timeIncrement, 1.0);
      } else {
        attacker.bezierTime = Math.min((attacker.bezierTime || 0) + 0.01, 1.0);
      }

      if (attacker.bezierTime >= 1.0) {
        if (attacker.bezierPaths && attacker.currentBezierPath! < attacker.bezierPaths.length - 1) {
          attacker.currentBezierPath!++;
          attacker.bezierTime = 0;
        } else {
          attacker.targetReached = true;
        }
      }

      if (movementDirection.length() > 0.01) {
        movementDirection.normalize();
        const targetRotation = createRotationQuaternion(movementDirection);
        if (attacker.mesh.rotationQuaternion) {
          Quaternion.SlerpToRef(
            attacker.mesh.rotationQuaternion,
            targetRotation,
            0.1,
            attacker.mesh.rotationQuaternion
          );
        }
      }
    }
  }
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
  // Ensure rotation quaternion is initialized
  if (!attacker.mesh.rotationQuaternion) {
    // Look forward initially, away from the origin
    attacker.mesh.rotationQuaternion = Quaternion.FromEulerAngles(0, Math.PI, 0);
  }

  if (attacker.isUserControlled) {
    updateUserControlledAttacker(attacker);
  } else {
    updateAIControlledAttacker(attacker, battlestation, currentTime);
  }

  // Keep speed value updated with current multiplier
  attacker.speed = getAttackerSpeed();
  attacker.currentSpeed = attacker.speed;
};
