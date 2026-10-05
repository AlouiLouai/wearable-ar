"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { FaceLandmarker, FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import { Glasses, Watch, Camera, RefreshCw, SwitchCamera, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Category, Product } from "@/lib/catalog";
import { glassesPose, smoothPose, watchPose, type Pose } from "./anchors";
import { loadProductModel } from "./modelLoader";
import { buildPlaceholder, disposeObject } from "./placeholders";

interface VirtualTryOnProps {
  category: Category;
  product?: Product;
  onCategoryChange?: (category: Category) => void;
  className?: string;
}

type Status = "starting" | "ready" | "error";
type Landmarker = FaceLandmarker | HandLandmarker;

const WASM_PATH = "/mediapipe/wasm";
const MODEL_PATHS: Record<Category, string> = {
  sunglasses: "/models/face_landmarker.task",
  watch: "/models/hand_landmarker.task",
};

let filesetPromise: ReturnType<typeof FilesetResolver.forVisionTasks> | null = null;
const getFileset = () => (filesetPromise ??= FilesetResolver.forVisionTasks(WASM_PATH));

async function createLandmarker(category: Category): Promise<Landmarker> {
  const fileset = await getFileset();
  const make = (delegate: "GPU" | "CPU") => {
    const baseOptions = { modelAssetPath: MODEL_PATHS[category], delegate };
    return category === "sunglasses"
      ? FaceLandmarker.createFromOptions(fileset, { baseOptions, runningMode: "VIDEO", numFaces: 1 })
      : HandLandmarker.createFromOptions(fileset, { baseOptions, runningMode: "VIDEO", numHands: 1 });
  };
  try {
    return await make("GPU");
  } catch {
    return make("CPU"); // some mobile GPUs/browsers reject the GPU delegate
  }
}

export function VirtualTryOn({ category, product, onCategoryChange, className }: VirtualTryOnProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const three = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.OrthographicCamera;
    anchor: THREE.Group;
    occluder: THREE.Mesh;
    size: { w: number; h: number };
  } | null>(null);
  const categoryRef = useRef(category);
  const productRef = useRef(product);
  const loopRatioRef = useRef<number | undefined>(undefined);
  const poseRef = useRef<Pose | null>(null);

  const [status, setStatus] = useState<Status>("starting");
  const [error, setError] = useState<string | null>(null);
  const [tracking, setTracking] = useState(false);
  const [mirrored, setMirrored] = useState(true);
  const [modelState, setModelState] = useState<"loading" | "glb" | "placeholder">("loading");
  const [attempt, setAttempt] = useState(0);
  // User camera choice; only applies to the category it was made in (each category starts on its default camera).
  const [camChoice, setCamChoice] = useState<{ category: Category; facing?: "user" | "environment"; deviceId?: string } | null>(null);
  const cam = camChoice?.category === category ? camChoice : null;
  const [cameraCount, setCameraCount] = useState(0);
  const currentCam = useRef<{ facing?: string; deviceId?: string; all: string[] }>({ all: [] });

  // --- Three.js scene (once) -------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" });
    } catch {
      return; // three.current stays null; the camera effect surfaces this as an error
    }
    renderer.setPixelRatio(1);
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x333344, 1.4));
    const key = new THREE.DirectionalLight(0xffffff, 2);
    key.position.set(0.5, 1, 2);
    scene.add(key);

    const anchor = new THREE.Group();
    anchor.visible = false;
    scene.add(anchor);

    // Invisible head proxy: writes depth only, so the temple arms disappear behind the head when it turns.
    const occluder = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), new THREE.MeshBasicMaterial({ colorWrite: false }));
    occluder.renderOrder = -1;
    occluder.visible = false;
    scene.add(occluder);

    const camera = new THREE.OrthographicCamera(0, 1, 1, 0, -5000, 5000);
    three.current = { renderer, scene, camera, anchor, occluder, size: { w: 0, h: 0 } };

    return () => {
      disposeObject(scene);
      renderer.dispose();
      three.current = null;
    };
  }, []);

  // --- Product model: show nothing until the real .glb is ready; placeholder only if it can't load -----
  useEffect(() => {
    productRef.current = product;
    const t = three.current;
    if (!t || !product) return;
    let cancelled = false;
    const { anchor } = t;

    const clear = () => {
      for (const old of [...anchor.children]) {
        anchor.remove(old);
        if (old.userData.placeholder) disposeObject(old); // cached .glb models are reused, never disposed
      }
    };
    const show = (obj: THREE.Object3D, state: "glb" | "placeholder") => {
      if (cancelled) return;
      clear();
      loopRatioRef.current = obj.userData.loopRatio;
      anchor.add(obj);
      setModelState(state);
    };
    const fallback = () => {
      const ph = buildPlaceholder(product);
      ph.userData.placeholder = true;
      show(ph, "placeholder");
    };

    clear();
    setModelState("loading");
    if (!product.assetUrl) fallback();
    else loadProductModel(product).then((m) => show(m, "glb"), fallback);

    return () => {
      cancelled = true;
    };
  }, [product]);

  // --- Camera + landmarker + render loop (per category) -------------------------
  useEffect(() => {
    categoryRef.current = category;
    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;
    let raf = 0;
    let stream: MediaStream | null = null;
    let landmarker: Landmarker | null = null;
    let lastVideoTime = -1;
    let lastSeen = 0;
    let wasTracking = false;
    poseRef.current = null;
    setStatus("starting");
    setError(null);
    setTracking(false);

    const loop = () => {
      raf = requestAnimationFrame(loop);
      const t = three.current;
      if (!t || !landmarker || video.readyState < 2) return;

      const w = video.videoWidth;
      const h = video.videoHeight;
      if (t.size.w !== w || t.size.h !== h) {
        t.renderer.setSize(w, h, false);
        Object.assign(t.camera, { left: 0, right: w, top: h, bottom: 0 });
        t.camera.updateProjectionMatrix();
        t.size = { w, h };
      }

      const now = performance.now();
      if (video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;
        let lm = undefined;
        try {
          if (categoryRef.current === "sunglasses") {
            lm = (landmarker as FaceLandmarker).detectForVideo(video, now).faceLandmarks[0];
          } else {
            lm = (landmarker as HandLandmarker).detectForVideo(video, now).landmarks[0];
          }
        } catch {
          /* transient inference error: skip this frame */
        }
        if (lm) {
          lastSeen = now;
          const prod = productRef.current;
          const target =
            categoryRef.current === "sunglasses"
              ? glassesPose(lm, w, h, prod?.fit)
              : watchPose(lm, w, h, prod?.caseMm, loopRatioRef.current);
          poseRef.current = smoothPose(poseRef.current, target);
        }
      }

      const visible = now - lastSeen < 250 && !!poseRef.current;
      if (visible !== wasTracking) {
        wasTracking = visible;
        setTracking(visible);
      }
      t.anchor.visible = visible;
      const p = poseRef.current;
      const glasses = categoryRef.current === "sunglasses";
      t.occluder.visible = visible && glasses;
      if (visible && p) {
        t.anchor.position.copy(p.position);
        t.anchor.quaternion.copy(p.quaternion);
        t.anchor.scale.setScalar(Math.max(p.scale, 1));
        if (glasses) {
          // ellipsoid roughly the size of a head, behind the pupils; radii in face widths; front tip stays ~0.12 behind the pupils so it can never cover the lenses
          const back = new THREE.Vector3(0, 0.05, -0.74).multiplyScalar(p.ref).applyQuaternion(p.quaternion);
          t.occluder.position.copy(p.position).add(back);
          t.occluder.quaternion.copy(p.quaternion);
          t.occluder.scale.set(0.46, 0.78, 0.5).multiplyScalar(p.ref);
        }
      }
      t.renderer.render(t.scene, t.camera);
    };

    (async () => {
      try {
        if (!three.current) throw new Error("WebGL is not available on this device.");
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("Camera access needs a secure (HTTPS) connection and a supported browser.");
        }
        const facingMode = cam?.facing ?? (category === "sunglasses" ? "user" : "environment");
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            ...(cam?.deviceId ? { deviceId: { exact: cam.deviceId } } : { facingMode: { ideal: facingMode } }),
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
        if (cancelled) return stream.getTracks().forEach((tr) => tr.stop());
        const settings = stream.getVideoTracks()[0]?.getSettings();
        setMirrored(settings?.facingMode !== "environment");
        // device labels/ids are only available after permission is granted
        const all = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput").map((d) => d.deviceId);
        currentCam.current = { facing: settings?.facingMode, deviceId: settings?.deviceId, all };
        setCameraCount(all.length);
        video.srcObject = stream;
        await video.play();

        landmarker = await createLandmarker(category);
        if (cancelled) return landmarker.close();
        setStatus("ready");
        raf = requestAnimationFrame(loop);
      } catch (e) {
        if (cancelled) return;
        const denied = e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError");
        setError(denied ? "Camera permission was denied. Allow camera access and retry." : e instanceof Error ? e.message : "Could not start the AR engine.");
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      landmarker?.close();
      stream?.getTracks().forEach((tr) => tr.stop());
      video.srcObject = null;
    };
  }, [category, attempt, cam?.facing, cam?.deviceId]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const switchCamera = useCallback(() => {
    const { facing, deviceId, all } = currentCam.current;
    if (facing === "user" || facing === "environment") {
      // phones report which way the camera faces: flip front <-> back
      setCamChoice({ category, facing: facing === "user" ? "environment" : "user" });
    } else if (all.length > 1) {
      // desktops/other: cycle through the available cameras
      const next = all[(Math.max(all.indexOf(deviceId ?? ""), 0) + 1) % all.length];
      setCamChoice({ category, deviceId: next });
    }
  }, [category]);

  const hint =
    category === "sunglasses" ? "Face the camera" : "Show the back of your hand and wrist";

  return (
    <div className={cn("relative size-full overflow-hidden bg-black", className)}>
      <video
        ref={videoRef}
        playsInline
        muted
        className={cn("absolute inset-0 size-full object-cover", mirrored && "-scale-x-100")}
      />
      <canvas
        ref={canvasRef}
        className={cn("pointer-events-none absolute inset-0 size-full object-cover", mirrored && "-scale-x-100")}
      />

      {cameraCount > 1 && status !== "error" && (
        <Button
          size="icon"
          variant="secondary"
          aria-label="Switch camera"
          onClick={switchCamera}
          className="absolute right-3 top-3 rounded-full border border-white/10 bg-black/50 backdrop-blur"
        >
          <SwitchCamera />
        </Button>
      )}

      {/* Category switcher */}
      <div className="absolute inset-x-0 top-0 flex justify-center p-3">
        <div className="flex rounded-full border border-white/10 bg-black/50 p-1 backdrop-blur">
          {(
            [
              ["sunglasses", "Sunglasses", Glasses],
              ["watch", "Watches", Watch],
            ] as const
          ).map(([value, label, Icon]) => (
            <Button
              key={value}
              size="sm"
              variant={category === value ? "default" : "ghost"}
              className="rounded-full"
              aria-pressed={category === value}
              onClick={() => onCategoryChange?.(value)}
            >
              <Icon /> {label}
            </Button>
          ))}
        </div>
      </div>

      {/* Status overlays */}
      {status === "starting" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60 text-sm text-muted-foreground">
          <Camera className="size-8 animate-pulse text-primary" />
          Starting camera &amp; AR engine…
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/80 p-8 text-center">
          <TriangleAlert className="size-8 text-primary" />
          <p className="max-w-xs text-sm">{error}</p>
          <Button onClick={retry}>
            <RefreshCw /> Try again
          </Button>
        </div>
      )}
      {status === "ready" && !tracking && (
        <div className="absolute inset-x-0 top-16 flex justify-center">
          <span className="rounded-full bg-black/60 px-3 py-1 text-xs text-muted-foreground backdrop-blur">{hint}</span>
        </div>
      )}
      {status === "ready" && modelState === "loading" && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
          Loading 3D model…
        </div>
      )}
      {status === "ready" && modelState === "placeholder" && product?.assetUrl && (
        <div className="absolute bottom-2 right-3 text-[10px] text-white/40">preview model</div>
      )}
    </div>
  );
}
