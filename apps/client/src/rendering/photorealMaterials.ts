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

const loadTiledTexture = (
  loader: THREE.TextureLoader,
  url: string,
  repeatX: number,
  repeatY: number,
  fallbackRgb: [number, number, number]
): THREE.Texture => {
  // Start with valid image data so the first frame never tries to upload an
  // empty TextureLoader placeholder while the authored material downloads.
  const fallbackCanvas = document.createElement('canvas');
  fallbackCanvas.width = 1;
  fallbackCanvas.height = 1;
  const fallbackContext = fallbackCanvas.getContext('2d');
  if (fallbackContext) {
    fallbackContext.fillStyle = `rgb(${fallbackRgb.join(',')})`;
    fallbackContext.fillRect(0, 0, 1, 1);
  }
  const texture = configureTiledTexture(
    new THREE.CanvasTexture(fallbackCanvas),
    repeatX,
    repeatY
  );
  texture.needsUpdate = true;
  loader.load(url, (loadedTexture) => {
    texture.source = loadedTexture.source;
    texture.needsUpdate = true;
    loadedTexture.dispose();
  });
  return texture;
};

export interface PhotorealTextureSet {
  concrete: THREE.Texture;
  gunmetal: THREE.Texture;
}

export const loadPhotorealTextures = (): PhotorealTextureSet => {
  const loader = new THREE.TextureLoader();
  const concrete = loadTiledTexture(
    loader,
    CONCRETE_TEXTURE_URL,
    18,
    18,
    [126, 134, 139]
  );
  const gunmetal = loadTiledTexture(
    loader,
    GUNMETAL_TEXTURE_URL,
    2,
    2,
    [92, 99, 104]
  );
  return { concrete, gunmetal };
};

export const createWetConcreteMaterial = (
  texture: THREE.Texture
): THREE.MeshPhysicalMaterial => {
  const material = new THREE.MeshPhysicalMaterial({
    color: '#b8c0c5',
    map: texture,
    bumpMap: texture,
    bumpScale: 0.075,
    roughness: 0.43,
    metalness: 0.02,
    clearcoat: 0.68,
    clearcoatRoughness: 0.22,
    envMapIntensity: 0.72,
  });

  material.onBeforeCompile = (shader) => {
    shader.uniforms.concreteMap = { value: texture };
    shader.uniforms.concreteScale = { value: 0.34 };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vConcreteWorldPosition;
        varying vec3 vConcreteWorldNormal;`
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        vConcreteWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vConcreteWorldNormal = normalize(mat3(modelMatrix) * objectNormal);`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D concreteMap;
        uniform float concreteScale;
        varying vec3 vConcreteWorldPosition;
        varying vec3 vConcreteWorldNormal;`
      )
      .replace(
        '#include <map_fragment>',
        `vec3 concreteBlend = abs(normalize(vConcreteWorldNormal));
        concreteBlend = max(concreteBlend, vec3(0.0001));
        concreteBlend /= concreteBlend.x + concreteBlend.y + concreteBlend.z;
        vec2 concreteUvX = vConcreteWorldPosition.zy * concreteScale;
        vec2 concreteUvY = vConcreteWorldPosition.xz * concreteScale;
        vec2 concreteUvZ = vConcreteWorldPosition.xy * concreteScale;
        vec4 concreteX = texture2D(concreteMap, concreteUvX);
        vec4 concreteY = texture2D(concreteMap, concreteUvY);
        vec4 concreteZ = texture2D(concreteMap, concreteUvZ);
        vec4 concreteSample = concreteX * concreteBlend.x +
          concreteY * concreteBlend.y + concreteZ * concreteBlend.z;
        diffuseColor *= concreteSample;`
      );
  };
  material.customProgramCacheKey = () => 'arena-wet-concrete-v1';
  return material;
};

export const createWetAsphaltMaterial = (
  texture: THREE.Texture
): THREE.MeshPhysicalMaterial =>
  new THREE.MeshPhysicalMaterial({
    color: '#687681',
    map: texture,
    bumpMap: texture,
    bumpScale: 0.12,
    roughness: 0.42,
    metalness: 0.04,
    clearcoat: 0.64,
    clearcoatRoughness: 0.2,
    envMapIntensity: 0.9,
  });

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
): WeaponMaterialSet => ({
  receiver: new THREE.MeshPhysicalMaterial({
    color: '#798187',
    map: texture,
    roughness: 0.28,
    metalness: 0.78,
    clearcoat: 0.35,
    clearcoatRoughness: 0.24,
    envMapIntensity: 1.1,
    emissive: '#182026',
    emissiveIntensity: 0.52,
  }),
  polymer: new THREE.MeshPhysicalMaterial({
    color: '#555d62',
    map: texture,
    roughness: 0.58,
    metalness: 0.08,
    clearcoat: 0.18,
    clearcoatRoughness: 0.4,
    emissive: '#0d1215',
    emissiveIntensity: 0.38,
  }),
  machined: new THREE.MeshPhysicalMaterial({
    color: '#9aa3a9',
    map: texture,
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
});
