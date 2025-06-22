import { createScene } from './scene';

/**
 * Entry point of the application.
 *
 * This script waits for the DOM to be fully loaded, then finds the canvas element
 * and initializes the Babylon.js scene.
 */
window.addEventListener('DOMContentLoaded', () => {
  const canvasElement = document.getElementById('renderCanvas');
  if (canvasElement && canvasElement instanceof HTMLCanvasElement) {
    createScene(canvasElement);
  } else {
    console.error('Canvas element not found or is not a canvas element');
  }
});
