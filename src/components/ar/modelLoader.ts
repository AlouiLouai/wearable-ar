import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { Product } from "@/lib/catalog";

/**
 * Loads a .glb and bakes its pose into a wrapper so every model shares one convention:
 *  - sunglasses: origin = centre of the FRONT frame plane (so head rotation pivots at the lenses),
 *                1 unit = frame width (X), temples extend toward -Z
 *  - watches:    origin = centre of the case on the skin side, 1 unit = case width (X, along the forearm),
 *                dial toward +Z, strap loops around X
 * Prepared models are cached per product, so switching back is instant and nothing is shown
 * until the real asset is ready (no placeholder flash).
 */
const cache = new Map<string, Promise<THREE.Group>>();

export function loadProductModel(product: Product): Promise<THREE.Group> {
  const url = product.assetUrl;
  if (!url) return Promise.reject(new Error("no asset"));
  const key = `${url}|${product.category}|${product.rotation?.join(",") ?? ""}`;
  let hit = cache.get(key);
  if (!hit) {
    hit = new GLTFLoader().loadAsync(url).then((gltf) => prepare(gltf.scene, product));
    hit.catch(() => cache.delete(key)); // allow retry after a failure
    cache.set(key, hit);
  }
  return hit;
}

function worldVertices(root: THREE.Object3D, visit: (v: THREE.Vector3) => void) {
  const v = new THREE.Vector3();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.visible) return;
    const pos = mesh.geometry.getAttribute("position");
    if (!pos) return;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      visit(v);
    }
  });
}

function prepare(root: THREE.Object3D, product: Product): THREE.Group {
  if (product.rotation) root.rotation.set(...product.rotation);
  root.updateMatrixWorld(true);

  const full = new THREE.Box3();
  worldVertices(root, (v) => full.expandByPoint(v));
  const size = full.getSize(new THREE.Vector3());

  let origin: THREE.Vector3;
  let ref: number;
  if (product.category === "sunglasses") {
    // measure only the front 12% of the depth: that's the frame/lenses, not the temple arms
    const zCut = full.max.z - size.z * 0.12;
    const front = new THREE.Box3();
    worldVertices(root, (v) => {
      if (v.z >= zCut) front.expandByPoint(v);
    });
    const c = front.getCenter(new THREE.Vector3());
    origin = new THREE.Vector3(c.x, c.y, full.max.z);
    ref = front.max.x - front.min.x;
  } else {
    // pivot on the skin: centred on the case, at the strap/case contact (just under the case back),
    // not at the middle of the strap loop, so tilting the hand doesn't swing the case sideways
    origin = full.getCenter(new THREE.Vector3());
    origin.z = full.max.z - size.x * 0.22;
    ref = size.x;
  }

  root.position.sub(origin);
  const wrapper = new THREE.Group();
  wrapper.add(root);
  wrapper.scale.setScalar(ref > 0 ? 1 / ref : 1);
  const outer = new THREE.Group();
  outer.add(wrapper);
  outer.userData.loopRatio = size.x > 0 ? size.y / size.x : 1.5; // strap-loop height in case widths
  return outer;
}
