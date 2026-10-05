import * as THREE from "three";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

/**
 * Where/how to draw the 3D model, in video-pixel space (origin bottom-left, +Z toward the viewer),
 * which is exactly the space of the orthographic camera in VirtualTryOn.
 */
export interface Pose {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  /** Pixels per model unit (models are normalized: glasses 1 = frame width, watches 1 = case width). */
  scale: number;
  /** Reference size in pixels (face width / palm width); used for the head occluder. */
  ref: number;
}

const P = (l: NormalizedLandmark, w: number, h: number) => new THREE.Vector3(l.x * w, h - l.y * h, -l.z * w);
const mid = (a: THREE.Vector3, b: THREE.Vector3) => a.clone().add(b).multiplyScalar(0.5);

/** Right-handed orthonormal frame from a primary axis X and a hint for Y; Z = X × Y. */
function frame(x: THREE.Vector3, yHint: THREE.Vector3) {
  const X = x.clone().normalize();
  const Y = yHint.clone().addScaledVector(X, -yHint.dot(X)).normalize();
  const Z = new THREE.Vector3().crossVectors(X, Y);
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
  return { X, Y, Z, q };
}

// FaceMesh indices (478-point model with irises)
const FACE = { rightCheek: 234, leftCheek: 454, forehead: 10, chin: 152, rightIris: 468, leftIris: 473 };
// Hand indices
const HAND = { wrist: 0, indexMcp: 5, middleMcp: 9, pinkyMcp: 17 };

/** Average sunglasses frame width relative to the cheek-to-cheek face width. */
const FRAME_TO_FACE = 0.97;
/** How far in front of the pupils the lens plane sits, in face widths (~1.7 cm on a 14.5 cm face). */
const LENS_OFFSET = 0.12;

/**
 * Sunglasses: full 3D head orientation from cheeks + forehead/chin, scaled by the 3D face width
 * (rotation-invariant, so it stays correct while the head turns), anchored at the pupil midpoint
 * pushed forward to the lens plane.
 */
export function glassesPose(lm: NormalizedLandmark[], w: number, h: number, fit = 1): Pose {
  const cheekR = P(lm[FACE.rightCheek], w, h);
  const cheekL = P(lm[FACE.leftCheek], w, h);
  const across = cheekL.clone().sub(cheekR);
  if (across.x < 0) across.negate(); // guarantee +X is image-right so Z (X × Y) always faces the camera
  const f = frame(across, P(lm[FACE.forehead], w, h).sub(P(lm[FACE.chin], w, h)));

  const faceW = cheekL.distanceTo(cheekR);
  const eyes = lm[FACE.rightIris] ? mid(P(lm[FACE.rightIris], w, h), P(lm[FACE.leftIris], w, h)) : mid(cheekR, cheekL);

  return {
    position: eyes.addScaledVector(f.Z, faceW * LENS_OFFSET),
    quaternion: f.q,
    scale: faceW * FRAME_TO_FACE * fit,
    ref: faceW,
  };
}

/** Average adult palm width (index-MCP to pinky-MCP) used to convert case millimetres to pixels. */
const PALM_MM = 82;

/**
 * Watch: hand frame from wrist → middle knuckle (forearm axis) and index → pinky (across the hand).
 * Model +X points toward the fingers, +Z is the dorsal normal facing the camera, case size comes from
 * real millimetres relative to the measured palm width (capped so the strap fits the wrist).
 */
export function watchPose(lm: NormalizedLandmark[], w: number, h: number, caseMm = 42, loopRatio = 1.5): Pose {
  const wrist = P(lm[HAND.wrist], w, h);
  const middle = P(lm[HAND.middleMcp], w, h);
  const across = P(lm[HAND.pinkyMcp], w, h).sub(P(lm[HAND.indexMcp], w, h));

  const toFingers = middle.clone().sub(wrist);
  const palmLen = toFingers.length() || 1;
  const palmW = across.length() || 1;

  const X = toFingers.clone().normalize();
  const normal = new THREE.Vector3().crossVectors(X, across).normalize();
  if (normal.z < 0) normal.negate(); // show the watch face toward the camera
  const Y = new THREE.Vector3().crossVectors(normal, X);
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, normal));

  return {
    // case centre sits ~28% of a palm length up the forearm from the wrist landmark
    position: wrist.clone().addScaledVector(X, -palmLen * 0.28),
    quaternion: q,
    // real case size, but never let the strap loop get wider than ~1 palm width
    scale: palmW * Math.min(caseMm / PALM_MM, 1.0 / loopRatio),
    ref: palmW,
  };
}

/**
 * Adaptive smoothing: heavy when the target barely moves (kills landmark jitter), light when it moves
 * fast (no visible lag). Scale is smoothed harder than position since it should never "breathe".
 */
export function smoothPose(prev: Pose | null, next: Pose): Pose {
  if (!prev) return next;
  const speed = prev.position.distanceTo(next.position) / Math.max(next.ref, 1); // face/palm widths per frame
  const a = Math.min(1, 0.25 + speed * 12);
  return {
    position: prev.position.clone().lerp(next.position, a),
    quaternion: prev.quaternion.clone().slerp(next.quaternion, Math.min(1, a * 0.9)),
    scale: prev.scale + (next.scale - prev.scale) * Math.min(1, a * 0.4),
    ref: prev.ref + (next.ref - prev.ref) * Math.min(1, a * 0.4),
  };
}
