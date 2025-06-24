// Speed multiplier for adjusting game speed (can be modified at runtime)
export let gameSpeedMultiplier = 1.0;

// Base speed values (these stay constant)
const BASE_MISSILE_SPEED = 15;
const BASE_ATTACKER_SPEED = 2;

// Dynamic speed getters that use the multiplier
export const getMissileSpeed = () => BASE_MISSILE_SPEED * gameSpeedMultiplier;
export const getAttackerSpeed = () => BASE_ATTACKER_SPEED * gameSpeedMultiplier;

// Function to adjust game speed
export const setGameSpeedMultiplier = (multiplier: number) => {
  gameSpeedMultiplier = Math.max(0.3, Math.min(2.0, multiplier)); // Clamp between 0.3x and 2.0x
};

// Legacy exports for backward compatibility (these now use the multiplier)
export const MISSILE_SPEED = BASE_MISSILE_SPEED;
export const ATTACKER_SPEED = BASE_ATTACKER_SPEED;

export const EVASION_THRESHOLD_MIN = 20; // Increased for more dramatic evasions
export const EVASION_THRESHOLD_MAX = 40; // Increased for earlier evasion triggers
export const MISSILE_LIFETIME_MIN = 12000; // Minimum missile lifetime
export const MISSILE_LIFETIME_MAX = 18000; // Maximum missile lifetime
export const MISSILE_LAUNCH_INTERVAL_MIN = 2000; // Longer intervals for bigger barrages
export const MISSILE_LAUNCH_INTERVAL_MAX = 4000; // Longer intervals for bigger barrages
export const ITANO_MISSILE_COUNT_MIN = 15; // Minimum missiles for Itano Circus effect
export const ITANO_MISSILE_COUNT_MAX = 25; // Maximum missiles for Itano Circus effect
export const STATION_SIZE = 20;
export const ATTACKER_SIZE = 5;
export const MISSILE_SIZE = 2;
export const STARFIELD_SIZE = 1000;
export const STAR_COUNT = 2000;
