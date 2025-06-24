import { Matrix, Quaternion, Vector3 } from '@babylonjs/core';

/**
 * Returns a random integer between min and max (inclusive).
 * @param min - The minimum value.
 * @param max - The maximum value.
 * @returns A random integer.
 */
export const getRandomInt = (min: number, max: number): number => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

/**
 * Returns a random float between min and max.
 * @param min - The minimum value.
 * @param max - The maximum value.
 * @returns A random float.
 */
export const getRandomFloat = (min: number, max: number): number => {
  return Math.random() * (max - min) + min;
};

/**
 * Creates a quaternion for rotation based on a direction vector.
 * This is useful for aligning an object to face a certain direction.
 * @param direction - The direction vector the object should face.
 * @param upVector - The up vector, defaults to Vector3.Up().
 * @returns A quaternion representing the rotation.
 */
export const createRotationQuaternion = (
  direction: Vector3,
  upVector: Vector3 = Vector3.Up()
): Quaternion => {
  const rotationMatrix = Matrix.LookAtLH(Vector3.Zero(), direction, upVector);
  rotationMatrix.invert();
  return Quaternion.FromRotationMatrix(rotationMatrix);
};

/**
 * Calculates a point on a cubic Bezier curve.
 * @param t - The position on the curve (0 to 1).
 * @param p0 - The start point of the curve.
 * @param p1 - The first control point.
 * @param p2 - The second control point.
 * @param p3 - The end point of the curve.
 * @returns A Vector3 representing the point on the curve at position t.
 */
export const calculateBezierPoint = (
  t: number,
  p0: Vector3,
  p1: Vector3,
  p2: Vector3,
  p3: Vector3
): Vector3 => {
  const oneMinusT = 1 - t;
  const oneMinusTSquared = oneMinusT * oneMinusT;
  const oneMinusTCubed = oneMinusTSquared * oneMinusT;
  const tSquared = t * t;
  const tCubed = tSquared * t;

  const x =
    oneMinusTCubed * p0.x +
    3 * oneMinusTSquared * t * p1.x +
    3 * oneMinusT * tSquared * p2.x +
    tCubed * p3.x;
  const y =
    oneMinusTCubed * p0.y +
    3 * oneMinusTSquared * t * p1.y +
    3 * oneMinusT * tSquared * p2.y +
    tCubed * p3.y;
  const z =
    oneMinusTCubed * p0.z +
    3 * oneMinusTSquared * t * p1.z +
    3 * oneMinusT * tSquared * p2.z +
    tCubed * p3.z;

  return new Vector3(x, y, z);
};

/**
 * Calculates the tangent (derivative) of a cubic Bezier curve at parameter t.
 * This gives the direction and relative speed at any point on the curve.
 * @param t - The position on the curve (0 to 1).
 * @param p0 - The start point of the curve.
 * @param p1 - The first control point.
 * @param p2 - The second control point.
 * @param p3 - The end point of the curve.
 * @returns A Vector3 representing the tangent vector at position t.
 */
export const calculateBezierTangent = (
  t: number,
  p0: Vector3,
  p1: Vector3,
  p2: Vector3,
  p3: Vector3
): Vector3 => {
  const oneMinusT = 1 - t;
  const oneMinusTSquared = oneMinusT * oneMinusT;
  const tSquared = t * t;

  // Derivative of cubic bezier: 3 * (1-t)^2 * (p1-p0) + 6 * (1-t) * t * (p2-p1) + 3 * t^2 * (p3-p2)
  const term1 = p1.subtract(p0).scale(3 * oneMinusTSquared);
  const term2 = p2.subtract(p1).scale(6 * oneMinusT * t);
  const term3 = p3.subtract(p2).scale(3 * tSquared);

  return term1.add(term2).add(term3);
};

/**
 * Creates a single, randomized Bezier curve between two points.
 * This is used to generate windy, unpredictable flight paths.
 * @param startPos - The starting position of the curve.
 * @param targetPos - The ending position of the curve.
 * @returns An array of 4 Vector3 points defining the Bezier curve.
 */
export const createBezierPath = (startPos: Vector3, targetPos: Vector3): Vector3[] => {
  const toTarget = targetPos.subtract(startPos);
  const distance = toTarget.length();
  const direction = toTarget.normalize();

  // Calculate a midpoint along the direct path with some randomness
  const midPointOffset = getRandomFloat(0.4, 0.6); // Randomize midpoint position
  const midPoint = startPos.add(direction.scale(distance * midPointOffset));

  // Create a perpendicular vector for the curve
  // Randomly choose between different perpendicular vectors for more diversity
  let perpendicular;
  const randomChoice = Math.random();

  if (randomChoice < 0.33) {
    // Option 1: Standard perpendicular in XY plane
    perpendicular = new Vector3(direction.y, -direction.x, direction.z);
  } else if (randomChoice < 0.66) {
    // Option 2: Perpendicular in XZ plane
    perpendicular = new Vector3(direction.z, direction.y, -direction.x);
  } else {
    // Option 3: Perpendicular in YZ plane
    perpendicular = new Vector3(direction.x, direction.z, -direction.y);
  }

  // Normalize and add some random variation to the perpendicular vector
  perpendicular.normalize();

  // Add a larger random component to make paths more varied and windy
  perpendicular.x += getRandomFloat(-0.3, 0.3);
  perpendicular.y += getRandomFloat(-0.3, 0.3);
  perpendicular.z += getRandomFloat(-0.3, 0.3);
  perpendicular.normalize();

  // Increase the curve offset for more windy paths
  // Use a larger multiplier to create more extreme curves
  const curveOffset = distance * getRandomFloat(0.4, 0.7);

  // Create bezier points with more variation for windier paths
  return [
    startPos.clone(),
    // First control point - with more extreme randomization
    startPos
      .add(direction.scale(distance * getRandomFloat(0.15, 0.3)))
      .add(perpendicular.scale(curveOffset * getRandomFloat(0.5, 1.0))),
    // Second control point - with more extreme randomization
    midPoint
      .add(direction.scale(distance * getRandomFloat(0.1, 0.25)))
      .add(perpendicular.scale(curveOffset * getRandomFloat(0.6, 1.2))),
    targetPos.clone(),
  ];
};

/**
 * Creates a flight path composed of multiple connected Bezier curves.
 * This results in more complex and longer flight paths.
 * @param startPos - The starting position of the entire path.
 * @param targetPos - The ending position of the entire path.
 * @returns An array of Bezier curves, where each curve is an array of 4 Vector3 points.
 */
export const createMultiBezierPath = (startPos: Vector3, targetPos: Vector3): Vector3[][] => {
  // Determine a random number of bezier curves (2-4)
  const numCurves = getRandomInt(2, 4);

  // Create an array to hold all bezier curves
  const bezierPaths: Vector3[][] = [];

  // Calculate intermediate points between start and target
  const toTarget = targetPos.subtract(startPos);
  const totalDistance = toTarget.length();
  const direction = toTarget.normalize();

  // Create intermediate points with some randomness
  const intermediatePoints: Vector3[] = [startPos.clone()];

  for (let i = 1; i < numCurves; i++) {
    // Calculate position along the path with some randomness
    const segmentOffset = i / numCurves;
    const randomOffset = getRandomFloat(-0.1, 0.1); // Add some randomness to segment position
    const segmentPosition = segmentOffset + randomOffset;

    // Create a perpendicular vector for offset
    let perpVector;
    if (Math.random() < 0.5) {
      perpVector = new Vector3(direction.y, -direction.x, direction.z);
    } else {
      perpVector = new Vector3(direction.z, direction.y, -direction.x);
    }
    perpVector.normalize();

    // Add random perpendicular offset
    const perpOffset = totalDistance * getRandomFloat(0.2, 0.5);

    // Create intermediate point
    const intermediatePoint = startPos
      .add(direction.scale(totalDistance * segmentPosition))
      .add(perpVector.scale(perpOffset));

    intermediatePoints.push(intermediatePoint);
  }

  // Add the final target point
  intermediatePoints.push(targetPos.clone());

  // Create bezier curves between each pair of intermediate points
  for (let i = 0; i < numCurves; i++) {
    const curveStart = intermediatePoints[i];
    const curveEnd = intermediatePoints[i + 1];

    // Create a bezier curve between these points
    const bezierCurve = createBezierPath(curveStart, curveEnd);
    bezierPaths.push(bezierCurve);
  }

  return bezierPaths;
};
