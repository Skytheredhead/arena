import * as THREE from 'three';

const CONCRETE_TEXTURE_URL = '/materials/wet-concrete-albedo.jpg';
const GUNMETAL_TEXTURE_URL = '/materials/gunmetal-albedo.jpg';

const configureTiledTexture = (
  texture: THREE.Texture,
  repeatX: number,
  repeatY: number
): THREE.Texture => {
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = 8;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

interface TextureReadyState {
  ready: boolean;
  listeners: Set<() => void>;
}

const textureReadyStates = new WeakMap<THREE.Texture, TextureReadyState>();

const loadTiledTexture = (
  loader: THREE.TextureLoader,
  url: string,
  repeatX: number,
  repeatY: number
): THREE.Texture => {
  const state: TextureReadyState = {
    ready: false,
    listeners: new Set(),
  };
  const texture = configureTiledTexture(
    loader.load(url, () => {
      state.ready = true;
      for (const listener of state.listeners) listener();
      state.listeners.clear();
    }),
    repeatX,
    repeatY
  );
  textureReadyStates.set(texture, state);
  return texture;
};

const attachMaterialTexture = (
  material: THREE.MeshStandardMaterial,
  texture: THREE.Texture,
  options: { bump?: boolean; repeat?: [number, number] } = {}
): void => {
  const attach = (): void => {
    const activeTexture = options.repeat ? texture.clone() : texture;
    if (options.repeat) {
      activeTexture.wrapS = THREE.RepeatWrapping;
      activeTexture.wrapT = THREE.RepeatWrapping;
      activeTexture.repeat.set(...options.repeat);
      activeTexture.needsUpdate = true;
    }
    material.map = activeTexture;
    if (options.bump) material.bumpMap = activeTexture;
    material.needsUpdate = true;
  };
  const state = textureReadyStates.get(texture);
  if (!state || state.ready) attach();
  else state.listeners.add(attach);
};

export interface PhotorealTextureSet {
  concrete: THREE.Texture;
  gunmetal: THREE.Texture;
}

export const loadPhotorealTextures = (): PhotorealTextureSet => {
  const loader = new THREE.TextureLoader();
  const concrete = loadTiledTexture(loader, CONCRETE_TEXTURE_URL, 2.5, 2.5);
  const gunmetal = loadTiledTexture(loader, GUNMETAL_TEXTURE_URL, 2, 2);
  return { concrete, gunmetal };
};

export const createWetConcreteMaterial = (
  texture: THREE.Texture
): THREE.MeshPhysicalMaterial => {
  const material = new THREE.MeshPhysicalMaterial({
    color: '#b8c0c5',
    bumpScale: 0.11,
    roughness: 0.48,
    metalness: 0.02,
    clearcoat: 0.68,
    clearcoatRoughness: 0.22,
    envMapIntensity: 0.72,
  });
  attachMaterialTexture(material, texture, { bump: true });
  return material;
};

export const createWetAsphaltMaterial = (
  texture: THREE.Texture
): THREE.MeshPhysicalMaterial => {
  const material = new THREE.MeshPhysicalMaterial({
    color: '#687681',
    bumpScale: 0.12,
    roughness: 0.42,
    metalness: 0.04,
    clearcoat: 0.64,
    clearcoatRoughness: 0.2,
    envMapIntensity: 0.9,
  });
  attachMaterialTexture(material, texture, {
    bump: true,
    repeat: [12, 12],
  });
  return material;
};

export interface WeaponMaterialSet {
  receiver: THREE.MeshPhysicalMaterial;
  polymer: THREE.MeshPhysicalMaterial;
  machined: THREE.MeshPhysicalMaterial;
  glass: THREE.MeshPhysicalMaterial;
  rubber: THREE.MeshStandardMaterial;
  glove: THREE.MeshStandardMaterial;
  accent: THREE.MeshStandardMaterial;
}

export const createWeaponMaterialSet = (
  texture: THREE.Texture
): WeaponMaterialSet => {
  const materials: WeaponMaterialSet = {
    receiver: new THREE.MeshPhysicalMaterial({
    color: '#aeb4b7',
    roughness: 0.36,
    metalness: 0.62,
    clearcoat: 0.35,
    clearcoatRoughness: 0.24,
    envMapIntensity: 1.1,
    emissive: '#20292e',
    emissiveIntensity: 0.34,
  }),
    polymer: new THREE.MeshPhysicalMaterial({
    color: '#72787b',
    roughness: 0.58,
    metalness: 0.08,
    clearcoat: 0.18,
    clearcoatRoughness: 0.4,
    emissive: '#14191c',
    emissiveIntensity: 0.25,
  }),
    machined: new THREE.MeshPhysicalMaterial({
    color: '#9aa3a9',
    roughness: 0.22,
    metalness: 0.9,
    clearcoat: 0.42,
    clearcoatRoughness: 0.2,
  }),
    glass: new THREE.MeshPhysicalMaterial({
    color: '#d1f7fb',
    roughness: 0.08,
    metalness: 0,
    transmission: 0,
    thickness: 0.006,
    transparent: true,
    opacity: 0.025,
    depthWrite: false,
    envMapIntensity: 1.25,
    side: THREE.DoubleSide,
  }),
    rubber: new THREE.MeshStandardMaterial({
    color: '#090d10',
    roughness: 0.88,
    metalness: 0.02,
  }),
    glove: new THREE.MeshStandardMaterial({
    color: '#13191d',
    roughness: 0.9,
    metalness: 0.01,
  }),
    accent: new THREE.MeshStandardMaterial({
    color: '#a7dfe5',
    roughness: 0.24,
    metalness: 0.52,
    emissive: '#36d8e6',
    emissiveIntensity: 0.32,
    }),
  };
  attachMaterialTexture(materials.receiver, texture);
  attachMaterialTexture(materials.polymer, texture);
  attachMaterialTexture(materials.machined, texture);
  return materials;
};
