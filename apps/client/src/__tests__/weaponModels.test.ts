import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  computeCenteredOpticOffset,
  createWeaponModels,
  RIFLE_ADS_CAMERA_BIAS,
  RIFLE_OPTIC_AIM_POINT,
  RIFLE_VIEWMODEL_SCALE,
} from '../rendering/weaponModels';

const makeTexture = (): THREE.Texture => {
  const texture = new THREE.Texture();
  texture.needsUpdate = true;
  return texture;
};

const rendererSource = readFileSync(
  resolve(process.cwd(), 'src/rendering/GameRenderer.ts'),
  'utf8'
);

const readRendererConstant = (name: string): number => {
  const match = rendererSource.match(
    new RegExp(`const ${name} = (-?\\d+(?:\\.\\d+)?);`)
  );
  if (!match?.[1]) throw new Error(`missing numeric renderer constant ${name}`);
  return Number(match[1]);
};

interface LiveAdsFrame {
  recoil: number;
  walkIntensity: number;
  walkPhase: number;
  reloadProgress: number;
  crouchAmount: number;
}

const getLiveAdsReticleCameraPosition = ({
  elapsedSeconds,
  frame,
}: {
  elapsedSeconds: number;
  frame: LiveAdsFrame;
}): THREE.Vector3 => {
  const { rifle, materials } = createWeaponModels(makeTexture());
  let opticReticle: THREE.Object3D | undefined;
  rifle.traverse(object => {
    if (object instanceof THREE.Mesh && object.material === materials.accent) {
      opticReticle = object;
    }
  });
  if (!opticReticle) throw new Error('missing rifle optic reticle');

  const hipX = readRendererConstant('WEAPON_HIP_X');
  const hipY = readRendererConstant('WEAPON_HIP_Y');
  const hipZ = readRendererConstant('WEAPON_HIP_Z');
  const hipYaw = readRendererConstant('WEAPON_HIP_YAW');
  const hipRoll = readRendererConstant('WEAPON_HIP_ROLL');
  const adsX = readRendererConstant('WEAPON_ADS_X');
  const adsY = readRendererConstant('WEAPON_ADS_Y');
  const adsZ = readRendererConstant('WEAPON_ADS_Z');
  const adsYaw = readRendererConstant('WEAPON_ADS_YAW');
  const adsRoll = readRendererConstant('WEAPON_ADS_ROLL');
  const poseResponse = readRendererConstant('WEAPON_POSE_RESPONSE');
  const fixedDeltaSeconds = 1 / 60;
  let presentationX = hipX;
  let presentationY = hipY;
  let presentationZ = hipZ;
  let presentationYaw = hipYaw;
  let presentationRoll = hipRoll;
  let fov = 80;

  for (
    let simulatedSeconds = 0;
    simulatedSeconds < elapsedSeconds;
    simulatedSeconds += fixedDeltaSeconds
  ) {
    const poseBlend = 1 - Math.exp(-poseResponse * fixedDeltaSeconds);
    presentationX = THREE.MathUtils.lerp(presentationX, adsX, poseBlend);
    presentationY = THREE.MathUtils.lerp(presentationY, adsY, poseBlend);
    presentationZ = THREE.MathUtils.lerp(presentationZ, adsZ, poseBlend);
    presentationYaw = THREE.MathUtils.lerp(presentationYaw, adsYaw, poseBlend);
    presentationRoll = THREE.MathUtils.lerp(presentationRoll, adsRoll, poseBlend);
    const targetFov = 80 * 0.78;
    fov += (targetFov - fov) * Math.min(1, fixedDeltaSeconds * 14);
  }

  const adsAmount = THREE.MathUtils.clamp(
    (hipX - presentationX) / (hipX - adsX),
    0,
    1
  );
  const hipAmount = 1 - adsAmount;
  const walkSwayX =
    Math.sin(frame.walkPhase) *
    frame.walkIntensity *
    readRendererConstant('WEAPON_WALK_SWAY_X') *
    hipAmount;
  const walkSwayY =
    Math.cos(frame.walkPhase * 2) *
    frame.walkIntensity *
    readRendererConstant('WEAPON_WALK_SWAY_Y') *
    hipAmount;
  const walkSwayYaw =
    Math.cos(frame.walkPhase) *
    frame.walkIntensity *
    readRendererConstant('WEAPON_WALK_SWAY_YAW') *
    hipAmount;
  const walkSwayRoll =
    Math.sin(frame.walkPhase) *
    frame.walkIntensity *
    readRendererConstant('WEAPON_WALK_SWAY_ROLL') *
    hipAmount;
  const reloadTilt = frame.reloadProgress * 0.22 * hipAmount;
  const reloadDrop = frame.reloadProgress * 0.08 * hipAmount;

  const camera = new THREE.PerspectiveCamera(fov, 16 / 9, 0.1, 200);
  const weaponRig = new THREE.Group();
  weaponRig.position.set(
    presentationX + walkSwayX,
    presentationY +
      frame.recoil * 0.08 -
      reloadDrop -
      frame.crouchAmount * 0.08 * hipAmount,
    presentationZ
  );
  weaponRig.rotation.set(
    frame.recoil * 0.6 + walkSwayY + reloadTilt * 0.35,
    presentationYaw + walkSwayYaw,
    presentationRoll + walkSwayRoll
  );
  const centeredOffset = computeCenteredOpticOffset(
    new THREE.Vector2(),
    RIFLE_OPTIC_AIM_POINT,
    RIFLE_VIEWMODEL_SCALE,
    weaponRig.rotation,
    new THREE.Vector3()
  );
  weaponRig.position.x = centeredOffset.x + RIFLE_ADS_CAMERA_BIAS[0];
  weaponRig.position.y = centeredOffset.y + RIFLE_ADS_CAMERA_BIAS[1];
  weaponRig.add(rifle);
  camera.add(weaponRig);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return opticReticle.getWorldPosition(new THREE.Vector3());
};

describe('weapon model alignment', () => {
  it('keeps the rifle body, barrel, sight, and buttpad on one centerline', () => {
    const { rifle } = createWeaponModels(makeTexture());

    // These are the rifle's structural pieces, in construction order. Grips,
    // controls, and hands are intentionally excluded because they are allowed
    // to sit to either side of the weapon's longitudinal axis.
    const structuralChildIndexes = [0, 1, 2, 3, 4, 7, 8, 21, 24, 25, 26];

    for (const index of structuralChildIndexes) {
      const part = rifle.children[index];
      if (!part) {
        throw new Error(`missing structural rifle part at child ${index}`);
      }
      expect(part.position.x, `rifle child ${index} is off the centerline`).toBeCloseTo(
        0,
        6
      );
    }
  });

  it('keeps ADS-critical rifle parts free of local yaw and roll', () => {
    const { rifle } = createWeaponModels(makeTexture());
    const adsCriticalChildIndexes = [0, 2, 3, 4, 8, 21, 22, 23, 24, 25, 26];

    for (const index of adsCriticalChildIndexes) {
      const part = rifle.children[index];
      if (!part) {
        throw new Error(`missing ADS-critical rifle part at child ${index}`);
      }
      expect(part.rotation.y, `rifle child ${index} has local yaw`).toBeCloseTo(0, 6);
      expect(part.rotation.z, `rifle child ${index} has local roll`).toBeCloseTo(0, 6);
    }
  });

  it('pins the live scoped optic to its calibrated camera anchor during recoil and movement', () => {
    const reticlePosition = getLiveAdsReticleCameraPosition({
      elapsedSeconds: 0.5,
      frame: {
        // Match the renderer's maximum live recoil and worst-case presentation
        // inputs instead of testing only the undisturbed target constants.
        recoil: 0.12,
        walkIntensity: 1,
        walkPhase: Math.PI * 0.5,
        reloadProgress: 1,
        crouchAmount: 1,
      },
    });

    expect(reticlePosition.x).toBeCloseTo(RIFLE_ADS_CAMERA_BIAS[0], 6);
    expect(reticlePosition.y).toBeCloseTo(RIFLE_ADS_CAMERA_BIAS[1], 6);
  });
});
