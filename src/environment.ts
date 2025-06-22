import {
  Animation,
  Color3,
  Color4,
  Mesh,
  MeshBuilder,
  ParticleSystem,
  PointLight,
  Scene,
  StandardMaterial,
  Texture,
  Vector3,
} from '@babylonjs/core';
import { STAR_COUNT, STARFIELD_SIZE, STATION_SIZE } from './constants';
import { createRotationQuaternion, getRandomInt } from './utils';

/**
 * Creates a starfield background using a particle system.
 * @param scene - The Babylon.js scene.
 * @param mappedAssets - A map of asset names to their data URLs.
 */
export const createStarfield = (scene: Scene, mappedAssets: Map<string, string>): void => {
  const particleSystem = new ParticleSystem('starfield', STAR_COUNT, scene);

  // Set the texture for the particles
  const texture = mappedAssets.get('Flare2.png');
  if (typeof texture === 'string') {
    particleSystem.particleTexture = new Texture(texture, scene);
  }

  // Where the particles come from
  particleSystem.emitter = new Vector3(0, 0, 0); // Center of the scene

  // Emission box - particles emitted from anywhere within this box
  particleSystem.minEmitBox = new Vector3(
    -STARFIELD_SIZE / 2,
    -STARFIELD_SIZE / 2,
    -STARFIELD_SIZE / 2
  );
  particleSystem.maxEmitBox = new Vector3(
    STARFIELD_SIZE / 2,
    STARFIELD_SIZE / 2,
    STARFIELD_SIZE / 2
  );

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

/**
 * Creates the central battlestation mesh.
 * @param scene - The Babylon.js scene.
 * @returns The battlestation mesh.
 */
export const createBattlestation = (scene: Scene): Mesh => {
  // Main fortress core
  const battlestation = MeshBuilder.CreateSphere(
    'battlestation',
    { diameter: STATION_SIZE },
    scene
  );

  const stationMaterial = new StandardMaterial('stationMaterial', scene);
  stationMaterial.diffuseColor = new Color3(0.2, 0.2, 0.25); // Darker, more menacing
  stationMaterial.specularColor = new Color3(0.1, 0.1, 0.1);
  stationMaterial.emissiveColor = new Color3(0.05, 0.02, 0.02); // Slight red glow
  battlestation.material = stationMaterial;

  // Command tower (central structure)
  const commandTower = MeshBuilder.CreateCylinder(
    'commandTower',
    {
      height: STATION_SIZE * 0.8,
      diameterTop: STATION_SIZE * 0.3,
      diameterBottom: STATION_SIZE * 0.5,
      tessellation: 8,
    },
    scene
  );
  commandTower.parent = battlestation;
  commandTower.position.y = STATION_SIZE * 0.4;

  const commandMaterial = new StandardMaterial('commandMaterial', scene);
  commandMaterial.diffuseColor = new Color3(0.15, 0.15, 0.2);
  commandMaterial.emissiveColor = new Color3(0.1, 0.05, 0.05);
  commandTower.material = commandMaterial;

  // Rotating weapon rings
  const weaponRing1 = MeshBuilder.CreateTorus(
    'weaponRing1',
    { diameter: STATION_SIZE * 1.8, thickness: STATION_SIZE * 0.15 },
    scene
  );
  weaponRing1.parent = battlestation;
  weaponRing1.rotation.x = Math.PI / 2;

  const weaponRingMaterial = new StandardMaterial('weaponRingMaterial', scene);
  weaponRingMaterial.diffuseColor = new Color3(0.3, 0.1, 0.1); // Dark red
  weaponRingMaterial.specularColor = new Color3(0.2, 0.05, 0.05);
  weaponRingMaterial.emissiveColor = new Color3(0.15, 0.03, 0.03);
  weaponRing1.material = weaponRingMaterial;

  // Second weapon ring at different angle
  const weaponRing2 = MeshBuilder.CreateTorus(
    'weaponRing2',
    { diameter: STATION_SIZE * 1.5, thickness: STATION_SIZE * 0.12 },
    scene
  );
  weaponRing2.parent = battlestation;
  weaponRing2.rotation.x = Math.PI / 3;
  weaponRing2.rotation.z = Math.PI / 6;
  weaponRing2.material = weaponRingMaterial;

  // Missile launcher turrets
  const turrets: Mesh[] = [];
  const turretPositions = [
    { theta: 0, phi: Math.PI / 4 },
    { theta: Math.PI / 2, phi: Math.PI / 4 },
    { theta: Math.PI, phi: Math.PI / 4 },
    { theta: (3 * Math.PI) / 2, phi: Math.PI / 4 },
    { theta: Math.PI / 4, phi: (3 * Math.PI) / 4 },
    { theta: (3 * Math.PI) / 4, phi: (3 * Math.PI) / 4 },
    { theta: (5 * Math.PI) / 4, phi: (3 * Math.PI) / 4 },
    { theta: (7 * Math.PI) / 4, phi: (3 * Math.PI) / 4 },
  ];

  turretPositions.forEach((pos, i) => {
    // Turret base
    const turretBase = MeshBuilder.CreateCylinder(
      `turretBase${i}`,
      { height: STATION_SIZE * 0.2, diameter: STATION_SIZE * 0.3, tessellation: 8 },
      scene
    );
    turretBase.parent = battlestation;

    const radius = STATION_SIZE * 0.6;
    turretBase.position.x = radius * Math.sin(pos.phi) * Math.cos(pos.theta);
    turretBase.position.y = radius * Math.cos(pos.phi);
    turretBase.position.z = radius * Math.sin(pos.phi) * Math.sin(pos.theta);

    const turretMaterial = new StandardMaterial(`turretMaterial${i}`, scene);
    turretMaterial.diffuseColor = new Color3(0.25, 0.1, 0.1);
    turretMaterial.specularColor = new Color3(0.15, 0.05, 0.05);
    turretMaterial.emissiveColor = new Color3(0.1, 0.02, 0.02);
    turretBase.material = turretMaterial;

    // Missile launcher barrels
    const barrelContainer = MeshBuilder.CreateBox(
      `barrelContainer${i}`,
      { width: STATION_SIZE * 0.25, height: STATION_SIZE * 0.15, depth: STATION_SIZE * 0.4 },
      scene
    );
    barrelContainer.parent = turretBase;
    barrelContainer.position.y = STATION_SIZE * 0.15;
    barrelContainer.material = turretMaterial;

    // Multiple missile tubes
    for (let j = 0; j < 4; j++) {
      const tube = MeshBuilder.CreateCylinder(
        `missileTube${i}_${j}`,
        { height: STATION_SIZE * 0.5, diameter: STATION_SIZE * 0.08, tessellation: 12 },
        scene
      );
      tube.parent = barrelContainer;

      const offsetX = ((j % 2) - 0.5) * STATION_SIZE * 0.1;
      const offsetZ = (Math.floor(j / 2) - 0.5) * STATION_SIZE * 0.15;
      tube.position.set(offsetX, STATION_SIZE * 0.25, offsetZ);
      tube.rotation.x = Math.PI / 2;

      const tubeMaterial = new StandardMaterial(`tubeMaterial${i}_${j}`, scene);
      tubeMaterial.diffuseColor = new Color3(0.1, 0.1, 0.15);
      tubeMaterial.emissiveColor = new Color3(0.05, 0.05, 0.1);
      tube.material = tubeMaterial;
    }

    // Orient turret to face outward
    const direction = turretBase.position.clone().normalize();
    turretBase.rotationQuaternion = createRotationQuaternion(direction);

    turrets.push(turretBase);
  });

  // Communication/radar arrays
  for (let i = 0; i < 3; i++) {
    const array = MeshBuilder.CreateBox(
      `radarArray${i}`,
      { width: STATION_SIZE * 0.1, height: STATION_SIZE * 0.6, depth: STATION_SIZE * 0.05 },
      scene
    );
    array.parent = battlestation;

    const theta = (i / 3) * Math.PI * 2;
    array.position.x = STATION_SIZE * 0.7 * Math.cos(theta);
    array.position.z = STATION_SIZE * 0.7 * Math.sin(theta);
    array.position.y = STATION_SIZE * 0.1;

    const arrayMaterial = new StandardMaterial(`arrayMaterial${i}`, scene);
    arrayMaterial.diffuseColor = new Color3(0.2, 0.2, 0.3);
    arrayMaterial.emissiveColor = new Color3(0.05, 0.05, 0.15);
    array.material = arrayMaterial;
  }

  // Warning lights
  const warningLights: PointLight[] = [];
  for (let i = 0; i < 6; i++) {
    const light = new PointLight(`warningLight${i}`, Vector3.Zero(), scene);
    light.parent = battlestation;
    light.diffuse = new Color3(1, 0.2, 0.2); // Red warning light
    light.specular = new Color3(1, 0.1, 0.1);
    light.intensity = 0.3;

    const theta = (i / 6) * Math.PI * 2;
    light.position.x = STATION_SIZE * 0.8 * Math.cos(theta);
    light.position.z = STATION_SIZE * 0.8 * Math.sin(theta);
    light.position.y = STATION_SIZE * 0.2;

    warningLights.push(light);
  }

  // Set up enhanced rotation and animation properties
  battlestation.metadata = {
    rotationAxis: new Vector3(0, 1, 0).normalize(),
    rotationSpeed: 0.001,
    nextRotationChange: Date.now() + getRandomInt(5000, 15000),
    turrets: turrets,
    weaponRings: [weaponRing1, weaponRing2],
    warningLights: warningLights,
    commandTower: commandTower,
    isBarrageMode: false,
    barrageStartTime: 0,
    idleAnimationTime: 0,
    nextIdleAnimation: Date.now() + getRandomInt(3000, 8000),
    ringSpinState: 'idle', // 'idle', 'spinning_up', 'active', 'spinning_down'
    ringSpinStartTime: 0,
    ringCurrentSpeed: [0, 0], // Current rotation speeds for each ring
    ringTargetSpeed: [0, 0], // Target rotation speeds for each ring
    lastBarrageLaunchTime: 0, // Track when last barrage was launched
  };

  // Create idle animations
  createIdleAnimations(battlestation, scene);

  // Create barrage animations
  createBarrageAnimations(battlestation, scene);

  return battlestation;
};

/**
 * Creates idle animations for the battlestation
 */
function createIdleAnimations(battlestation: Mesh, scene: Scene): void {
  const metadata = battlestation.metadata;

  // Slow turret scanning animation
  metadata.turrets.forEach((turret: Mesh, index: number) => {
    const scanAnimation = Animation.CreateAndStartAnimation(
      `turretScan${index}`,
      turret,
      'rotation.y',
      30, // 30 fps
      300, // 10 seconds duration
      0,
      Math.PI * 2,
      Animation.ANIMATIONLOOPMODE_CYCLE
    );
  });

  // Note: Weapon rings no longer rotate during idle - they only spin during barrages

  // Warning light pulsing
  metadata.warningLights.forEach((light: PointLight, index: number) => {
    const pulseAnimation = Animation.CreateAndStartAnimation(
      `lightPulse${index}`,
      light,
      'intensity',
      60, // 60 fps for smooth lighting
      120, // 2 seconds
      0.1,
      0.8,
      Animation.ANIMATIONLOOPMODE_CYCLE
    );
  });
}

/**
 * Creates barrage animations for the battlestation
 */
function createBarrageAnimations(battlestation: Mesh, scene: Scene): void {
  // These will be triggered when a barrage starts
  // Implementation will be in the update function
}

/**
 * Updates battlestation animations based on current state with smooth ring transitions
 */
export function updateBattlestationAnimations(
  battlestation: Mesh,
  isLaunchingBarrage: boolean,
  missileCount: number,
  currentTime: number,
  scene: Scene
): void {
  const metadata = battlestation.metadata;
  const deltaTime = 16; // Assume ~60fps for smooth transitions

  // Track when barrage is launched
  if (isLaunchingBarrage) {
    metadata.lastBarrageLaunchTime = currentTime;
  }

  // Time after launch when rings should start spinning down
  const spinDownDelay = 2000; // 2 seconds after launch
  const timeSinceLastLaunch = currentTime - metadata.lastBarrageLaunchTime;
  const shouldSpinDown = metadata.lastBarrageLaunchTime > 0 && timeSinceLastLaunch > spinDownDelay;

  // Handle ring spin state transitions
  if (isLaunchingBarrage && metadata.ringSpinState === 'idle') {
    // Start spinning up rings when barrage begins
    metadata.ringSpinState = 'spinning_up';
    metadata.ringSpinStartTime = currentTime;
    metadata.ringTargetSpeed = [0.08, -0.06]; // Different speeds for each ring
  } else if (
    shouldSpinDown &&
    (metadata.ringSpinState === 'active' || metadata.ringSpinState === 'spinning_up')
  ) {
    // Start spinning down rings after delay following launch
    metadata.ringSpinState = 'spinning_down';
    metadata.ringSpinStartTime = currentTime;
    metadata.ringTargetSpeed = [0, 0];
  }

  // Update ring rotation speeds based on current state
  const spinUpDuration = 2000; // 2 seconds to spin up
  const spinDownDuration = 3000; // 3 seconds to spin down

  if (metadata.ringSpinState === 'spinning_up') {
    const progress = Math.min((currentTime - metadata.ringSpinStartTime) / spinUpDuration, 1);
    const easedProgress = 1 - Math.pow(1 - progress, 3); // Ease-out cubic

    metadata.ringCurrentSpeed[0] = metadata.ringTargetSpeed[0] * easedProgress;
    metadata.ringCurrentSpeed[1] = metadata.ringTargetSpeed[1] * easedProgress;

    if (progress >= 1) {
      metadata.ringSpinState = 'active';
    }
  } else if (metadata.ringSpinState === 'spinning_down') {
    const progress = Math.min((currentTime - metadata.ringSpinStartTime) / spinDownDuration, 1);
    const easedProgress = Math.pow(1 - progress, 2); // Ease-in quadratic

    metadata.ringCurrentSpeed[0] = metadata.ringTargetSpeed[0] + 0.08 * easedProgress;
    metadata.ringCurrentSpeed[1] = metadata.ringTargetSpeed[1] + -0.06 * easedProgress;

    if (progress >= 1) {
      metadata.ringSpinState = 'idle';
      metadata.ringCurrentSpeed = [0, 0];
    }
  }

  // Apply ring rotations
  metadata.weaponRings.forEach((ring: Mesh, index: number) => {
    if (metadata.ringCurrentSpeed[index] !== 0) {
      ring.rotation.z += metadata.ringCurrentSpeed[index];
    }
  });

  if (isLaunchingBarrage && !metadata.isBarrageMode) {
    // Start barrage mode
    metadata.isBarrageMode = true;
    metadata.barrageStartTime = currentTime;

    // Intensify warning lights
    metadata.warningLights.forEach((light: PointLight) => {
      light.intensity = 1.5;
      light.diffuse = new Color3(1, 0.1, 0.1); // Brighter red
    });

    // Speed up turret rotations
    metadata.turrets.forEach((turret: Mesh, index: number) => {
      scene.stopAnimation(turret);
      Animation.CreateAndStartAnimation(
        `turretBarrage${index}`,
        turret,
        'rotation.y',
        60, // Faster fps
        60, // 1 second duration
        turret.rotation.y,
        turret.rotation.y + Math.PI * 2,
        Animation.ANIMATIONLOOPMODE_CYCLE
      );
    });

    // Command tower menacing bob
    Animation.CreateAndStartAnimation(
      'commandTowerBob',
      metadata.commandTower,
      'position.y',
      60,
      60, // 1 second
      metadata.commandTower.position.y,
      metadata.commandTower.position.y + STATION_SIZE * 0.1,
      Animation.ANIMATIONLOOPMODE_YOYO
    );
  } else if (shouldSpinDown && metadata.isBarrageMode) {
    // Return to idle mode
    metadata.isBarrageMode = false;

    // Reset warning lights
    metadata.warningLights.forEach((light: PointLight) => {
      light.intensity = 0.3;
      light.diffuse = new Color3(1, 0.2, 0.2);
    });

    // Return to normal turret speed
    metadata.turrets.forEach((turret: Mesh) => {
      scene.stopAnimation(turret);
    });

    // Stop command tower bob
    scene.stopAnimation(metadata.commandTower);
    metadata.commandTower.position.y = STATION_SIZE * 0.4;

    // Restart idle animations
    createIdleAnimations(battlestation, scene);
  }

  // Random idle animations
  if (!metadata.isBarrageMode && currentTime > metadata.nextIdleAnimation) {
    metadata.nextIdleAnimation = currentTime + getRandomInt(5000, 12000);

    // Random turret movement
    const randomTurret = metadata.turrets[Math.floor(Math.random() * metadata.turrets.length)];
    const targetRotation = Math.random() * Math.PI * 2;

    Animation.CreateAndStartAnimation(
      'randomTurretMove',
      randomTurret,
      'rotation.y',
      30,
      90, // 3 seconds
      randomTurret.rotation.y,
      targetRotation,
      Animation.ANIMATIONLOOPMODE_CONSTANT
    );
  }
}
