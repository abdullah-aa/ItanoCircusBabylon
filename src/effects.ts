import { Color4, Mesh, ParticleSystem, Scene, Texture, Vector3 } from '@babylonjs/core';
import { MISSILE_SIZE } from './constants';

/**
 * Creates a generic particle trail effect for an object.
 * @param scene The Babylon.js scene.
 * @param emitter The mesh to emit particles from.
 * @param mappedAssets A map of asset names to their data URLs.
 * @param textureName The name of the texture file for the particles.
 * @param config An object with particle system configuration options.
 * @returns The created particle system.
 */
export const createTrail = (
  scene: Scene,
  emitter: Mesh,
  mappedAssets: Map<string, string>,
  textureName: string,
  config: Partial<ParticleSystem> & {
    color1: Color4;
    color2: Color4;
    colorDead: Color4;
  }
): ParticleSystem => {
  const trail = new ParticleSystem(`trail_${emitter.name}`, 2000, scene);
  const texture = mappedAssets.get(textureName);
  if (typeof texture === 'string') {
    trail.particleTexture = new Texture(texture, scene);
  }

  trail.emitter = emitter;

  // Assign all config properties to the particle system
  Object.assign(trail, config);

  trail.start();
  return trail;
};

/**
 * Creates a bright, core trail effect for a missile for added visual flair.
 * @param scene The Babylon.js scene.
 * @param parentMesh The missile mesh to attach the trail to.
 * @param mappedAssets A map of asset names to their data URLs.
 * @returns The created particle system for the core trail.
 */
export const createEnhancedMissileTrail = (
  scene: Scene,
  parentMesh: Mesh,
  mappedAssets: Map<string, string>
): ParticleSystem => {
  return createTrail(scene, parentMesh, mappedAssets, 'Flare2.png', {
    minEmitBox: new Vector3(0, -MISSILE_SIZE * 1.8, 0),
    maxEmitBox: new Vector3(0, -MISSILE_SIZE * 1.8, 0),
    color1: new Color4(1, 1, 1, 1),
    color2: new Color4(0.8, 0.9, 1, 0.8),
    colorDead: new Color4(0.3, 0.3, 0.5, 0),
    minSize: 0.1,
    maxSize: 0.5,
    minLifeTime: 0.3,
    maxLifeTime: 0.8,
    emitRate: 150,
    blendMode: ParticleSystem.BLENDMODE_ADD,
    gravity: new Vector3(0, 0, 0),
    direction1: new Vector3(-0.1, -0.1, -1),
    direction2: new Vector3(0.1, 0.1, -1),
    minEmitPower: 0.5,
    maxEmitPower: 1.5,
    updateSpeed: 0.005,
  });
};

/**
 * Creates a temporary explosion effect at a given position.
 * The effect is automatically disposed of after a short duration.
 * @param position The world position to create the explosion at.
 * @param scene The Babylon.js scene.
 * @param mappedAssets A map of asset names to their data URLs.
 * @param baseTextureName The texture to use for the explosion particles.
 * @param color1 The primary color of the explosion particles.
 * @param color2 The secondary color of the explosion particles.
 * @param minSize The minimum size of the explosion particles.
 * @param maxSize The maximum size of the explosion particles.
 * @returns The created particle system for the explosion.
 */
export const createExplosionEffect = (
  position: Vector3,
  scene: Scene,
  mappedAssets: Map<string, string>,
  baseTextureName: string,
  color1: Color4,
  color2: Color4,
  minSize: number,
  maxSize: number
): ParticleSystem => {
  const explosion = new ParticleSystem('explosion', 500, scene); // Consider unique names or a counter
  const textureAsset = mappedAssets.get(baseTextureName);
  if (typeof textureAsset === 'string') {
    explosion.particleTexture = new Texture(textureAsset, scene);
  }
  explosion.emitter = position.clone(); // Clone to avoid modifying original

  explosion.color1 = color1;
  explosion.color2 = color2;
  explosion.colorDead = new Color4(0.5, 0.3, 0.1, 0); // Or make this a parameter

  explosion.minSize = minSize;
  explosion.maxSize = maxSize;
  explosion.minLifeTime = 0.2; // Or make these parameters
  explosion.maxLifeTime = 0.4;
  explosion.emitRate = 400; // Or make this a parameter
  explosion.blendMode = ParticleSystem.BLENDMODE_ADD;
  explosion.gravity = Vector3.Zero();
  explosion.minEmitPower = 4; // Or make these parameters
  explosion.maxEmitPower = 8;
  explosion.minAngularSpeed = 0;
  explosion.maxAngularSpeed = Math.PI;
  explosion.updateSpeed = 0.01;

  explosion.start();

  // Dispose after a short delay
  setTimeout(() => {
    explosion.dispose();
  }, 500); // Or make this a parameter

  return explosion;
};
