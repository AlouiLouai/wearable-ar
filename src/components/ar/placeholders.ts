import * as THREE from "three";
import type { Product } from "@/lib/catalog";

/**
 * Low-poly stand-ins used when a product's .glb is missing or fails to load.
 * Convention shared with real assets (see normalizeModel in VirtualTryOn):
 *   - glasses: 1 unit wide along X (frame width); watches: 1 unit = case width (X)
 *   - +Y is "up" for glasses; for watches the strap runs along Y (around the wrist) and the forearm axis is X
 *     (a watch laid flat, 12 o'clock toward +Y, loops its strap around X when worn)
 *   - the front / watch face points toward +Z (the camera)
 */

const mat = (color: THREE.ColorRepresentation, opts: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, metalness: 0.6, roughness: 0.35, ...opts });

export function buildPlaceholder(product: Product): THREE.Group {
  return product.category === "sunglasses" ? buildGlasses(product) : buildWatch(product);
}

function buildGlasses({ color, style }: Product): THREE.Group {
  const g = new THREE.Group();
  const frame = mat(color);
  const lens = mat(0x0a0a0a, { transparent: true, opacity: 0.65, metalness: 0.9, roughness: 0.1 });

  const lensX = 0.25;
  const r = style === "round" ? 0.19 : 0.2;

  for (const side of [-1, 1]) {
    if (style === "wayfarer") {
      const rim = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.3, 0.03), frame);
      rim.position.set(side * lensX, 0, -0.005);
      const glass = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.24, 0.02), lens);
      glass.position.set(side * lensX, -0.005, 0.015);
      g.add(rim, glass);
    } else {
      // aviator = slightly flattened disc, round = circle
      const squash = style === "aviator" ? 0.85 : 1;
      const glass = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.02, 20), lens);
      glass.rotation.x = Math.PI / 2;
      glass.scale.set(1, 1, squash);
      glass.position.set(side * lensX, style === "aviator" ? -0.02 : 0, 0);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.016, 6, 24), frame);
      rim.scale.set(1, squash, 1);
      rim.position.copy(glass.position);
      g.add(glass, rim);
    }
    // temple arm running back (-Z)
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.025, 0.6), frame);
    arm.position.set(side * 0.485, 0.05, -0.3);
    g.add(arm);
  }

  const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.03), frame);
  bridge.position.set(0, 0.06, 0);
  g.add(bridge);
  return g;
}

function buildWatch({ color, style }: Product): THREE.Group {
  const g = new THREE.Group();
  const strapColor = style === "classic" ? 0x3b2a1d : style === "chrono" ? color : 0x111111;
  const strap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.5, 0.3, 24, 1, true),
    mat(strapColor, { side: THREE.DoubleSide, metalness: style === "chrono" ? 0.9 : 0.1, roughness: 0.6 }),
  );
  strap.rotation.z = Math.PI / 2; // loop around the forearm axis (X)
  g.add(strap);

  // The case sits on top of the wrist, i.e. on the strap's +Z side.
  const caseGroup = new THREE.Group();
  caseGroup.position.z = 0.52;
  caseGroup.rotation.x = Math.PI / 2; // cylinder axis Y -> Z so the dial faces the camera

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.12, 24), mat(color));
  const dial = new THREE.Mesh(
    new THREE.CylinderGeometry(0.29, 0.29, 0.02, 24),
    mat(style === "classic" ? 0xf2efe6 : 0x0d0d0f, { metalness: 0.2 }),
  );
  dial.position.y = 0.062;
  caseGroup.add(body, dial);

  const handColor = style === "classic" ? 0x111111 : 0xf5f2ea;
  const hour = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.02, 0.15), mat(handColor));
  hour.position.set(0, 0.08, -0.07);
  const minute = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.02, 0.24), mat(handColor));
  minute.position.set(0.07, 0.085, -0.04);
  minute.rotation.y = -Math.PI / 4;
  caseGroup.add(hour, minute);

  if (style === "chrono") {
    for (const [x, z] of [[-0.12, 0], [0.12, 0], [0, 0.13]] as const) {
      const sub = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.01, 12), mat(color));
      sub.position.set(x, 0.075, z);
      caseGroup.add(sub);
    }
  }

  g.add(caseGroup);
  g.position.z = -0.46 / 0.68; // match the real-model pivot: origin on the skin under the case
  g.scale.setScalar(1 / 0.68); // case diameter is 0.68 above; normalize so 1 unit = case width
  g.userData.loopRatio = 1 / 0.68;
  return g;
}

export function disposeObject(obj: THREE.Object3D) {
  obj.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    const m = mesh.material;
    for (const mm of Array.isArray(m) ? m : [m]) mm?.dispose();
  });
}
