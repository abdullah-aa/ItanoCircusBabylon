import {
  ArcRotateCamera,
  Color4,
  Engine,
  FollowCamera,
  HemisphericLight,
  Scene,
  Space,
  Vector3,
  PointerEventTypes,
  KeyboardEventTypes,
} from '@babylonjs/core';
import { ASSETS } from './assets';
import { createAttacker, updateAttacker } from './attacker';
import { MISSILE_LAUNCH_INTERVAL_MAX, MISSILE_LAUNCH_INTERVAL_MIN } from './constants';
import { createBattlestation, createStarfield, updateBattlestationAnimations } from './environment';
import { launchMissileBarrage, updateMissiles } from './missile';
import { createRadar, updateRadar } from './radar';
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
    ATTACKER_REAR: 3,
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

  const attackerRearCamera = new FollowCamera('attackerRearCamera', new Vector3(0, 0, 50), scene);
  attackerRearCamera.minZ = 0.1;
  attackerRearCamera.maxZ = 2000;
  attackerRearCamera.radius = 150;
  attackerRearCamera.heightOffset = 30;
  attackerRearCamera.rotationOffset = 180;
  attackerRearCamera.cameraAcceleration = 0.05;
  attackerRearCamera.maxCameraSpeed = 10;

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

  // --- ENVIRONMENT & GAME OBJECTS ---
  createStarfield(scene, MAPPED_ASSETS);
  const battlestation = createBattlestation(scene);
  const attacker = createAttacker(scene, MAPPED_ASSETS);
  createRadar();

  // --- CAMERA TARGETING ---
  attackerCamera.lockedTarget = attacker.mesh;
  attackerSideCamera.lockedTarget = attacker.mesh;
  attackerRearCamera.lockedTarget = attacker.mesh;

  // --- INPUT HANDLING ---
  const switchCamera = () => {
    currentCameraMode = (currentCameraMode + 1) % 4; // Cycle through 0, 1, 2, 3

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
      case CAMERA_MODE.ATTACKER_REAR:
        attackerRearCamera.lockedTarget = attacker.mesh;
        scene.activeCamera = attackerRearCamera;
        console.log('Camera Mode: Attacker Rear View Camera');
        break;
      case CAMERA_MODE.NEUTRAL:
        neutralCamera.setTarget(Vector3.Zero());
        scene.activeCamera = neutralCamera;
        neutralCamera.attachControl(canvas, true);
        console.log('Camera Mode: Neutral Scene View');
        break;
    }
  };

  const controlToggleButton = document.getElementById('control-toggle');
  if (controlToggleButton) {
    controlToggleButton.addEventListener('click', () => {
      attacker.isUserControlled = !attacker.isUserControlled;
      console.log(`User control ${attacker.isUserControlled ? 'enabled' : 'disabled'}`);
      controlToggleButton.classList.toggle('user-controlled', attacker.isUserControlled);
      controlToggleButton.textContent = attacker.isUserControlled ? 'U' : 'AI';

      if (!attacker.isUserControlled) {
        attacker.yaw = 0;
        attacker.pitch = 0;
      }
    });
  }

  window.addEventListener('keydown', event => {
    if (event.key === ' ' || event.key === 'Spacebar') {
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
        // Double-tap detected, switch camera
        switchCamera();
        lastTapTime = 0; // Reset after double tap
      } else {
        // Single tap
        lastTapTime = currentTime;
      }
    },
    { passive: false }
  );

  // User control input handling
  const inputMap = new Map<string, boolean>();
  scene.onKeyboardObservable.add(kbInfo => {
    if (kbInfo.type === KeyboardEventTypes.KEYDOWN) {
      inputMap.set(kbInfo.event.key, true);
    } else {
      inputMap.set(kbInfo.event.key, false);
    }
  });

  // Mobile swipe controls
  let pointerDown = false;
  let lastPointerX = 0;
  let lastPointerY = 0;
  const SWIPE_SENSITIVITY = 0.005;

  scene.onPointerObservable.add(pointerInfo => {
    if (!attacker.isUserControlled || currentCameraMode === CAMERA_MODE.NEUTRAL) return;

    switch (pointerInfo.type) {
      case PointerEventTypes.POINTERDOWN:
        pointerDown = true;
        lastPointerX = pointerInfo.event.clientX;
        lastPointerY = pointerInfo.event.clientY;
        break;
      case PointerEventTypes.POINTERUP:
        pointerDown = false;
        attacker.yaw = 0;
        attacker.pitch = 0;
        break;
      case PointerEventTypes.POINTERMOVE:
        if (pointerDown) {
          const dx = pointerInfo.event.clientX - lastPointerX;
          const dy = pointerInfo.event.clientY - lastPointerY;

          // Inverted controls: swipe right -> yaw right, swipe up -> pitch down
          attacker.yaw = dx * SWIPE_SENSITIVITY;
          attacker.pitch = -dy * SWIPE_SENSITIVITY; // Negative for inversion

          lastPointerX = pointerInfo.event.clientX;
          lastPointerY = pointerInfo.event.clientY;
        }
        break;
    }
  });

  // --- GAME STATE ---
  const missiles: IMissile[] = [];
  let nextBarrageTime = Date.now() + 2000; // 2 second initial delay

  // --- RENDER LOOP ---
  scene.onBeforeRenderObservable.add(() => {
    const currentTime = Date.now();

    // Handle user control inputs
    if (attacker.isUserControlled && currentCameraMode !== CAMERA_MODE.NEUTRAL) {
      const YAW_SPEED = 0.02;
      const PITCH_SPEED = 0.02;

      // Keyboard controls are continuously checked
      if (inputMap.get('ArrowLeft')) {
        attacker.yaw = -YAW_SPEED;
      } else if (inputMap.get('ArrowRight')) {
        attacker.yaw = YAW_SPEED;
      } else if (!pointerDown) {
        attacker.yaw = 0; // Reset yaw if no horizontal keys or swipe
      }

      if (inputMap.get('ArrowUp')) {
        attacker.pitch = PITCH_SPEED; // Pitch up
      } else if (inputMap.get('ArrowDown')) {
        attacker.pitch = -PITCH_SPEED; // Pitch down
      } else if (!pointerDown) {
        attacker.pitch = 0; // Reset pitch if no vertical keys or swipe
      }

    } else {
        // Clear inputs if not in user control mode
        attacker.yaw = 0;
        attacker.pitch = 0;
    }

    updateAttacker(attacker, battlestation, missiles, scene, currentTime);
    updateMissiles(missiles, attacker, currentTime, MAPPED_ASSETS);
    updateRadar(attacker, battlestation);

    // Update camera targets if needed
    if (currentCameraMode === CAMERA_MODE.NEUTRAL) {
      neutralCamera.setTarget(Vector3.Zero());
    } else if (currentCameraMode === CAMERA_MODE.ATTACKER) {
      attackerCamera.lockedTarget = attacker.mesh;
    } else if (currentCameraMode === CAMERA_MODE.ATTACKER_SIDE) {
      attackerSideCamera.lockedTarget = attacker.mesh;
    } else if (currentCameraMode === CAMERA_MODE.ATTACKER_REAR) {
      attackerRearCamera.lockedTarget = attacker.mesh;
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
