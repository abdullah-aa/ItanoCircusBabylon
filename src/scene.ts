import {
  ArcRotateCamera,
  Color3,
  Color4,
  Engine,
  FollowCamera,
  HemisphericLight,
  PointLight,
  Scene,
  Space,
  Vector3,
} from '@babylonjs/core';
import { ASSETS } from './assets';
import { createAttacker, updateAttacker } from './attacker';
import { MISSILE_LAUNCH_INTERVAL_MAX, MISSILE_LAUNCH_INTERVAL_MIN } from './constants';
import { createBattlestation, createStarfield, updateBattlestationAnimations } from './environment';
import { launchMissileBarrage, updateMissiles } from './missile';
import { IMissile } from './types';
import { getRandomInt, getRandomFloat } from './utils';

/**
 * Creates the main Babylon.js scene, including all game objects, cameras, and lights.
 * @param canvas The HTML canvas element to render the scene in.
 * @returns The created Babylon.js scene.
 */
export const createScene = (canvas: HTMLCanvasElement): Scene => {
  const engine = new Engine(canvas, true);
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.05, 0.1, 0.2, 1); // Dark blue background for space

  const MAPPED_ASSETS = ASSETS as Map<string, string>;

  // --- CAMERA SETUP ---
  const CAMERA_MODE = {
    NEUTRAL: 0,
    ATTACKER: 1,
    ATTACKER_SIDE: 2,
  };
  let currentCameraMode = CAMERA_MODE.NEUTRAL;

  const attackerCamera = new FollowCamera('attackerCamera', new Vector3(0, 0, -50), scene);
  attackerCamera.minZ = 0.1;
  attackerCamera.maxZ = 2000;
  attackerCamera.radius = 150;
  attackerCamera.heightOffset = 30;
  attackerCamera.rotationOffset = 0;
  attackerCamera.cameraAcceleration = 0.05;
  attackerCamera.maxCameraSpeed = 10;

  const attackerSideCamera = new FollowCamera('attackerSideCamera', new Vector3(0, 0, -50), scene);
  attackerSideCamera.minZ = 0.1;
  attackerSideCamera.maxZ = 2000;
  attackerSideCamera.radius = 120;
  attackerSideCamera.heightOffset = 15;
  attackerSideCamera.rotationOffset = 90;
  attackerSideCamera.cameraAcceleration = 0.05;
  attackerSideCamera.maxCameraSpeed = 10;

  const neutralCamera = new ArcRotateCamera(
    'neutralCamera',
    Math.PI / 4,
    Math.PI / 3,
    300,
    Vector3.Zero(),
    scene
  );
  neutralCamera.minZ = 0.1;
  neutralCamera.maxZ = 2000;
  neutralCamera.lowerRadiusLimit = 150;
  neutralCamera.upperRadiusLimit = 500;
  neutralCamera.setTarget(Vector3.Zero());

  scene.activeCamera = neutralCamera;
  neutralCamera.attachControl(canvas, true);

  // --- LIGHTS ---
  const hemisphericLight = new HemisphericLight('hemisphericLight', new Vector3(0, 1, 0), scene);
  hemisphericLight.intensity = 0.5;

  const pointLight = new PointLight('pointLight', Vector3.Zero(), scene);
  pointLight.intensity = 0.5;
  pointLight.diffuse = new Color3(1, 0.8, 0.6);
  pointLight.specular = new Color3(1, 0.8, 0.6);

  // --- ENVIRONMENT & GAME OBJECTS ---
  createStarfield(scene, MAPPED_ASSETS);
  const battlestation = createBattlestation(scene);
  const attacker = createAttacker(scene, MAPPED_ASSETS);

  // --- CAMERA TARGETING ---
  attackerCamera.lockedTarget = attacker.mesh;
  attackerSideCamera.lockedTarget = attacker.mesh;

  // --- INPUT HANDLING ---
  const switchCamera = () => {
    currentCameraMode = (currentCameraMode + 1) % 3; // Cycle through 0, 1, 2

    if (scene.activeCamera) {
      scene.activeCamera.detachControl(canvas);
    }

    switch (currentCameraMode) {
      case CAMERA_MODE.ATTACKER:
        attackerCamera.lockedTarget = attacker.mesh;
        scene.activeCamera = attackerCamera;
        console.log('Camera Mode: Attacker Frontview Chase Camera');
        break;
      case CAMERA_MODE.ATTACKER_SIDE:
        attackerSideCamera.lockedTarget = attacker.mesh;
        scene.activeCamera = attackerSideCamera;
        console.log('Camera Mode: Attacker Side View Camera');
        break;
      case CAMERA_MODE.NEUTRAL:
        neutralCamera.setTarget(Vector3.Zero());
        scene.activeCamera = neutralCamera;
        neutralCamera.attachControl(canvas, true);
        console.log('Camera Mode: Neutral Scene View');
        break;
    }
  };

  window.addEventListener('keydown', event => {
    if (event.keyCode === 32) {
      // Spacebar
      switchCamera();
    }
  });

  let lastTapTime = 0;
  const DOUBLE_TAP_DELAY = 300; // ms

  canvas.addEventListener(
    'touchstart',
    event => {
      event.preventDefault();
      const currentTime = Date.now();
      const timeSinceLastTap = currentTime - lastTapTime;

      if (timeSinceLastTap < DOUBLE_TAP_DELAY && timeSinceLastTap > 0) {
        // Double-tap detected
        switchCamera();
        lastTapTime = 0; // Reset after double tap
      } else {
        // Single tap
        lastTapTime = currentTime;
      }
    },
    { passive: false }
  );

  // --- GAME STATE ---
  const missiles: IMissile[] = [];
  let nextBarrageTime = Date.now() + 2000; // 2 second initial delay

  // --- RENDER LOOP ---
  scene.onBeforeRenderObservable.add(() => {
    const currentTime = Date.now();

    updateAttacker(attacker, battlestation, missiles, scene, currentTime);
    updateMissiles(missiles, attacker, currentTime, MAPPED_ASSETS);

    // Update camera targets if needed
    if (currentCameraMode === CAMERA_MODE.NEUTRAL) {
      neutralCamera.setTarget(Vector3.Zero());
    } else if (currentCameraMode === CAMERA_MODE.ATTACKER) {
      attackerCamera.lockedTarget = attacker.mesh;
    } else if (currentCameraMode === CAMERA_MODE.ATTACKER_SIDE) {
      attackerSideCamera.lockedTarget = attacker.mesh;
    }

    // Check if we should launch a new barrage
    let isLaunchingBarrage = false;
    if (currentTime > nextBarrageTime) {
      if (missiles.length === 0) {
        launchMissileBarrage(scene, battlestation, attacker, missiles, MAPPED_ASSETS);
        nextBarrageTime =
          currentTime + getRandomInt(MISSILE_LAUNCH_INTERVAL_MIN, MISSILE_LAUNCH_INTERVAL_MAX);
        isLaunchingBarrage = true;
      }
    }

    // Update battlestation animations based on barrage state
    // Pass both launch state and missile count separately
    updateBattlestationAnimations(
      battlestation,
      isLaunchingBarrage,
      missiles.length,
      currentTime,
      scene
    );

    // Update space station rotation
    if (battlestation.metadata) {
      battlestation.rotate(
        battlestation.metadata.rotationAxis,
        battlestation.metadata.rotationSpeed,
        Space.WORLD
      );

      if (currentTime > battlestation.metadata.nextRotationChange) {
        battlestation.metadata.rotationAxis = new Vector3(
          Math.random() - 0.5,
          Math.random() - 0.5,
          Math.random() - 0.5
        ).normalize();
        battlestation.metadata.rotationSpeed = getRandomFloat(0.0005, 0.002);
        battlestation.metadata.nextRotationChange = currentTime + getRandomInt(5000, 15000);
      }
    }
  });

  engine.runRenderLoop(() => {
    scene.render();
  });

  window.addEventListener('resize', () => {
    engine.resize();
  });

  return scene;
};
