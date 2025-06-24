import { Mesh, ParticleSystem, Vector3 } from '@babylonjs/core';

/**
 * Defines the different formation patterns for missile barrages.
 */
export enum MissileFormationType {
  SPIRAL_SWARM = 0,
  DOUBLE_HELIX = 1,
  CONE_FORMATION = 2,
  WAVE_PATTERN = 3,
}

/**
 * Parameters for defining the spiral motion of an Itano Circus missile.
 */
export interface ISpiralParams {
  radius: number;
  speed: number;
  phase: number;
  axis: Vector3;
}

/**
 * Represents a single missile in the simulation.
 */
export interface IMissile {
  mesh: Mesh;
  container: Mesh; // A parent mesh for correct orientation
  trail: ParticleSystem;
  coreTrail?: ParticleSystem; // Additional bright core trail for visual effect
  target: Vector3;
  speed: number;
  lifetime: number;
  bezierPaths?: Vector3[][]; // Array of bezier curves for complex flight paths
  currentBezierPath?: number; // Index of the current bezier path being followed
  bezierTime?: number; // Time elapsed along the current bezier path (0-1)
  useBezier: boolean; // Flag to determine if bezier pathing is used
  lastPathUpdateTime?: number; // Timestamp of the last path recalculation
  targetReached?: boolean; // Flag to indicate if the missile has reached its bezier target
  // Itano Circus specific properties
  spiralParams: ISpiralParams;
  formationType: MissileFormationType;
  groupIndex: number; // Position in the formation group
  totalInGroup: number; // Total number of missiles in the formation group
  isNearMiss: boolean; // Whether this missile is intended to miss for dramatic effect
  basePosition?: Vector3; // Position along the base path before spiral offset is applied
  lastPosition?: Vector3; // Previous position for smooth movement tracking
}

/**
 * Represents the attacker spacecraft.
 */
export interface IAttacker {
  mesh: Mesh;
  trail: ParticleSystem;
  target: Vector3;
  currentTarget: Vector3; // For interpolation between targets
  targetChangeTime: number; // When the target was last changed
  transitionDuration: number; // How long to transition to new target
  speed: number;
  currentSpeed: number; // For acceleration/deceleration
  evasionThreshold: number;
  lastEvasionTime: number; // When the last evasion maneuver was performed
  isEvading: boolean; // Whether the attacker is currently evading
  evasionCooldown?: number; // Random cooldown time between evasions
  bezierPaths?: Vector3[][]; // Array of bezier curves, each with 4 control points
  currentBezierPath?: number; // Index of the current bezier path being followed
  bezierTime?: number; // Position along the current bezier curve
  useBezier: boolean; // Whether to use bezier curves for movement
  lastPathUpdateTime?: number; // Track when we last updated the path
  targetReached?: boolean; // Whether the current target point has been reached
  // Enhanced evasion properties
  isPerformingBarrelRoll: boolean; // Whether currently doing a barrel roll
  barrelRollProgress: number; // Progress through barrel roll (0-1)
  barrelRollAxis: Vector3; // Axis of barrel roll rotation
  lastDirectionChange: number; // When direction was last changed
  evasionIntensity: number; // How aggressively to evade (0-1)
  burstSpeed: number; // Temporary speed boost during evasion
  // User control properties
  isUserControlled: boolean;
  yaw: number; // User control input for yaw
  pitch: number; // User control input for pitch
}
