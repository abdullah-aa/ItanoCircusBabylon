import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { IAttacker } from './types';

let radar: HTMLElement | null;
let radarGrid: HTMLElement | null;
let attackerDot: HTMLElement | null;
let stationDot: HTMLElement | null;

const MIN_RADAR_SCALE = 250; // a value that maps world units to radar pixels

/**
 * Initializes the radar DOM elements and collapse/expand functionality.
 */
export const createRadar = (): void => {
  radar = document.getElementById('radar-overlay');
  radarGrid = document.getElementById('radar-grid');
  attackerDot = document.getElementById('attacker-dot');
  stationDot = document.getElementById('station-dot');

  const header = document.getElementById('radar-header');
  const content = document.getElementById('radar-content');
  const toggleButton = document.getElementById('toggle-radar');

  if (header && content && toggleButton) {
    const toggle = () => {
      const isCollapsed = content.style.display === 'none';
      content.style.display = isCollapsed ? 'block' : 'none';
      toggleButton.textContent = isCollapsed ? '-' : '+';
    };

    header.addEventListener('click', toggle);
  }
};

/**
 * Updates the radar display with the current positions of the attacker and battlestation.
 * The radar shows a top-down (XZ plane) view of the battlespace.
 * @param attacker The attacker object.
 * @param battlestation The battlestation mesh.
 */
export const updateRadar = (attacker: IAttacker, battlestation: Mesh): void => {
  if (!radarGrid || !attackerDot || !stationDot) {
    return;
  }

  const radarWidth = radarGrid.clientWidth;
  const radarHeight = radarGrid.clientHeight;

  // Center of the radar is the battlestation's position
  const stationPos = battlestation.position;

  // Attacker position relative to the station
  const attackerRelPos = attacker.mesh.position.subtract(stationPos);

  // Dynamically adjust radar scale to keep the attacker in view.
  // The scale is the larger of the X or Z distance from the center.
  const maxDist = Math.max(Math.abs(attackerRelPos.x), Math.abs(attackerRelPos.z));

  // Add a buffer so the dot is not at the very edge of the radar, and enforce a minimum scale.
  const radarScale = Math.max(maxDist * 1.2, MIN_RADAR_SCALE);

  // Project to 2D (XZ plane) and scale to radar dimensions
  // X -> x, Z -> y on the radar. Invert Z for conventional top-down view.
  const attackerRadarX = (attackerRelPos.x / radarScale) * (radarWidth / 2) + radarWidth / 2;
  const attackerRadarY = (-attackerRelPos.z / radarScale) * (radarHeight / 2) + radarHeight / 2;

  // Station is always at the center
  const stationRadarX = radarWidth / 2;
  const stationRadarY = radarHeight / 2;

  // With dynamic scaling, clamping should not be necessary for the attacker, but we keep it for safety.
  const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(val, max));

  // Update attacker dot
  attackerDot.style.left = `${clamp(attackerRadarX, 0, radarWidth)}px`;
  attackerDot.style.top = `${clamp(attackerRadarY, 0, radarHeight)}px`;

  // Update station dot
  stationDot.style.left = `${clamp(stationRadarX, 0, radarWidth)}px`;
  stationDot.style.top = `${clamp(stationRadarY, 0, radarHeight)}px`;

  // Use color to indicate height difference (Y-axis)
  const heightDiff = attacker.mesh.position.y - stationPos.y;
  if (Math.abs(heightDiff) < 10) {
    attackerDot.style.backgroundColor = 'yellow'; // Same level
  } else if (heightDiff > 10) {
    attackerDot.style.backgroundColor = 'cyan'; // Attacker is above
  } else {
    attackerDot.style.backgroundColor = 'magenta'; // Attacker is below
  }
}; 