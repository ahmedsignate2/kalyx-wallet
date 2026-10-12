'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer, MeshTransmissionMaterial, PerformanceMonitor, Sparkles } from '@react-three/drei';

/*
 * LE PRISME KALYX — la scène 3D du film, rendue par la carte graphique (three.js).
 *
 *  - Une gemme taillée (tour, couronne, table, pavillon) en VRAI verre : transmission,
 *    indice de réfraction, DISPERSION chromatique (les arêtes se décomposent en arc-en-ciel)
 *    et irisation. Elle réfracte réellement ce qui est derrière elle : à l'ouverture,
 *    le titre « Douze mots. » est peint dans la scène, et le cristal le tord.
 *  - Douze éclats de verre en orbite : les douze mots. Au chapitre « ne jamais se faire
 *    voler », ils se referment en cage autour de la gemme.
 *  - Lumière 100 % procédurale (bandeaux et anneaux lumineux) : aucune image HDR, aucun
 *    modèle, aucun fichier téléchargé — rien à charger, rien qui puisse casser.
 *  - Chorégraphie pilotée par le défilement : chaque chapitre a sa pose (position,
 *    taille, rayon d'orbite, cage), interpolée en douceur entre les chapitres.
 *  - Qualité adaptative (densité de rendu selon la fluidité mesurée), rendu suspendu
 *    quand l'onglet est masqué, une seule image fixe si « réduire les animations ».
 * Décor pur : le texte réel reste dans la page (titre compris, pour les lecteurs d'écran).
 */

const INK = '#080a09';
const SAGE = '#8fad9a';
const PAPER = '#f3efe6';

// ---------------------------------------------------------------- chorégraphie

/** Pose de la scène pour un moment du film. `x` en fraction de la demi-largeur visible. */
type Pose = { x: number; y: number; scale: number; ring: number; cage: number; tilt: number; glow: number };

const POSES: Record<string, Pose> = {
  // Au-dessus du titre : seule la pointe le réfracte, le titre reste lisible.
  open: { x: 0, y: 0.13, scale: 0.92, ring: 2.35, cage: 0, tilt: 0.35, glow: 1 },
  words: { x: 0, y: 0, scale: 0.72, ring: 3.1, cage: 0, tilt: 0.9, glow: 0.55 },
  prologue: { x: 0.5, y: 0.02, scale: 0.95, ring: 1.75, cage: 0, tilt: 0.5, glow: 1 },
  fonctionnement: { x: -0.55, y: 0, scale: 0.78, ring: 2.1, cage: 0, tilt: 1.1, glow: 0.7 },
  perdre: { x: 0, y: 0, scale: 0.8, ring: 2, cage: 0, tilt: 0.6, glow: 0.6 },
  voler: { x: 0.52, y: 0, scale: 0.86, ring: 1.4, cage: 1, tilt: 0.2, glow: 1 },
  copilote: { x: -0.52, y: 0, scale: 0.8, ring: 2.2, cage: 0.15, tilt: 0.8, glow: 0.8 },
  frais: { x: 0.55, y: 0, scale: 0.7, ring: 2.4, cage: 0, tilt: 1.2, glow: 0.6 },
  vision: { x: 0, y: 0, scale: 0.8, ring: 2.2, cage: 0, tilt: 0.6, glow: 0.6 },
  telecharger: { x: 0, y: 0.06, scale: 1.05, ring: 1.9, cage: 0, tilt: 0.4, glow: 1 },
};

type Anchor = { at: number; pose: Pose };

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const ease = (v: number) => v * v * (3 - 2 * v);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

function mixPose(a: Pose, b: Pose, t: number): Pose {
  return {
    x: mix(a.x, b.x, t),
    y: mix(a.y, b.y, t),
    scale: mix(a.scale, b.scale, t),
    ring: mix(a.ring, b.ring, t),
    cage: mix(a.cage, b.cage, t),
    tilt: mix(a.tilt, b.tilt, t),
    glow: mix(a.glow, b.glow, t),
  };
}

/**
 * Repères du film en coordonnées de document (centre de l'écran), mesurés au
 * redimensionnement seulement : la boucle d'image ne lit que `scrollY`.
 */
function measureAnchors(): { anchors: Anchor[]; titleEnd: number } {
  const vh = window.innerHeight;
  const anchors: Anchor[] = [{ at: vh / 2, pose: POSES.open }];
  let titleEnd = vh * 0.2;
  const opening = document.getElementById('ouverture');
  if (opening) {
    const top = opening.getBoundingClientRect().top + window.scrollY;
    const run = Math.max(1, opening.offsetHeight - vh);
    titleEnd = top + run * 0.08;
    anchors.push({ at: top + run * 0.45 + vh / 2, pose: POSES.words });
  }
  for (const id of ['prologue', 'fonctionnement', 'perdre', 'voler', 'copilote', 'frais', 'vision', 'telecharger']) {
    const el = document.getElementById(id);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    anchors.push({ at: r.top + window.scrollY + Math.min(r.height, vh * 1.4) / 2, pose: POSES[id] });
  }
  anchors.sort((a, b) => a.at - b.at);
  return { anchors, titleEnd };
}

function poseAt(anchors: Anchor[], center: number): Pose {
  if (anchors.length === 0) return POSES.open;
  if (center <= anchors[0].at) return anchors[0].pose;
  for (let i = 1; i < anchors.length; i++) {
    const a = anchors[i - 1];
    const b = anchors[i];
    if (center <= b.at) return mixPose(a.pose, b.pose, ease(clamp01((center - a.at) / Math.max(1, b.at - a.at))));
  }
  return anchors[anchors.length - 1].pose;
}

// ---------------------------------------------------------------- géométrie

/** Taille brillant simplifiée : pavillon en pointe, rondiste, couronne, table. */
function gemGeometry(): THREE.BufferGeometry {
  const profile = [
    new THREE.Vector2(0.0001, -1.05), // colette
    new THREE.Vector2(0.56, -0.52), // pavillon, deux étages de facettes
    new THREE.Vector2(0.99, -0.07), // bas du rondiste
    new THREE.Vector2(1.0, 0.03), // haut du rondiste
    new THREE.Vector2(0.84, 0.22), // couronne basse
    new THREE.Vector2(0.6, 0.38), // couronne haute (étoiles)
    new THREE.Vector2(0.0001, 0.38), // table
  ];
  const g = new THREE.LatheGeometry(profile, 16).toNonIndexed();
  g.computeVertexNormals(); // non indexée : une normale par facette, la taille reste nette
  return g;
}

/** Les douze positions de la cage : sommets d'un icosaèdre. */
const CAGE = (() => {
  const p = new THREE.IcosahedronGeometry(1, 0).getAttribute('position');
  const seen: THREE.Vector3[] = [];
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(p, i);
    if (!seen.some((s) => s.distanceToSquared(v) < 1e-6)) seen.push(v);
  }
  return seen.slice(0, 12);
})();

// ---------------------------------------------------------------- titre peint dans la scène

/** Les douze mots d'exemple (les mêmes que l'ouverture), en grille, sur une texture répétable. */
const WORDS = ['ocean', 'planet', 'silent', 'orbit', 'north', 'garden', 'river', 'pulse', 'velvet', 'cradle', 'mirror', 'fossil'];

function wordsTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 1024;
  const tx = new THREE.CanvasTexture(c);
  const paint = () => {
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const family = getComputedStyle(document.body).getPropertyValue('--font-fraunces').trim() || 'Georgia, serif';
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `300 92px ${family}`;
    WORDS.forEach((w, i) => {
      ctx.fillText(w, 170 + (i % 3) * 342, 128 + Math.floor(i / 3) * 256);
    });
    tx.needsUpdate = true; // même taille : simple renvoi
  };
  paint();
  document.fonts?.ready.then(paint).catch(() => {}); // repeint dans la vraie police une fois chargée
  tx.colorSpace = THREE.NoColorSpace;
  tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
  tx.anisotropy = 4;
  return tx;
}

const TEXT_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

const TEXT_FRAG = /* glsl */ `
uniform sampler2D uText;
uniform float uFade;
uniform float uTime;
uniform vec3 uInk;
uniform vec3 uSage;
uniform vec3 uPaper;
uniform float uAspect;
uniform vec2 uGem;
uniform float uGemSize;
uniform sampler2D uWords;
varying vec2 vUv;
void main() {
  vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
  // Fond : encre et halo sauge à peine perceptible.
  float halo = exp(-dot(p, p) * 2.2);
  // LES DOUZE MOTS VIVENT DANS LE CRISTAL : peints juste derrière la gemme (et nulle
  // part ailleurs), ils n'apparaissent qu'à travers le verre, décomposés en éclats.
  vec2 g = p - uGem;
  vec2 wuv = g / (uGemSize * 2.0) + 0.5;
  wuv.y += uTime * 0.012; // ils défilent lentement, comme une phrase qu'on relit
  float words = texture2D(uWords, fract(wuv)).a;
  float r2 = dot(g, g) / (uGemSize * uGemSize);
  float inside = exp(-r2 * 10.0); // éteint au bord de la gemme : hors du verre, on ne lit rien
  float box = exp(-r2 * 0.9);
  // Valeurs LINÉAIRES : converties en sRGB à la sortie, elles éclairciraient vite le fond.
  vec3 col = uInk + uSage * (halo * 0.012) + mix(uSage, uPaper, 0.5) * box * 0.018 + uPaper * words * inside * 0.9;
  col = mix(col, uPaper, texture2D(uText, vUv).a * uFade);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

/** Texture du titre : un simple masque d'alpha, sans mipmaps (il est vu à sa taille). */
function titleTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const tx = new THREE.CanvasTexture(canvas);
  tx.colorSpace = THREE.NoColorSpace; // on ne lit que l'alpha
  tx.generateMipmaps = false;
  tx.minFilter = THREE.LinearFilter;
  tx.magFilter = THREE.LinearFilter;
  return tx;
}

/**
 * Peint le titre à la place exacte du titre de la page, en coordonnées d'ÉCRAN du film :
 * le titre est collant, et le fond suit la caméra. La position est prise par rapport au
 * conteneur collant (qui est en haut quand il colle) et sans le léger décalage animé :
 * peint alors que le visiteur est plus bas (lien d'ancre, rechargement, rotation), le
 * titre reste juste — il était peint hors du cadre, et disparaissait au retour.
 * Retour à la ligne comme dans la page (titres longs, petits écrans).
 */
function paintTitle(ctx: CanvasRenderingContext2D, el: HTMLElement, title: string, dpr: number) {
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  const sticky = el.closest<HTMLElement>('.sticky');
  const top0 = sticky ? r.top - sticky.getBoundingClientRect().top : r.top;
  const shift = el.parentElement ? /translateY\((-?[\d.]+)px\)/.exec(el.parentElement.style.transform) : null;
  const top = top0 - (shift ? parseFloat(shift[1]) : 0);
  ctx.scale(dpr, dpr);
  ctx.fillStyle = '#fff';
  ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.direction = (document.documentElement.dir as CanvasDirection) || 'ltr';
  const letter = parseFloat(cs.letterSpacing);
  if (!Number.isNaN(letter) && 'letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${letter}px`;
  // Lignes : mêmes coupures que le navigateur, à la largeur réelle du titre.
  const maxW = Math.max(1, el.clientWidth);
  const lines: string[] = [];
  for (const word of title.split(/\s+/)) {
    const last = lines[lines.length - 1];
    if (last !== undefined && ctx.measureText(`${last} ${word}`).width <= maxW) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  const fontPx = parseFloat(cs.fontSize);
  const lh = cs.lineHeight === 'normal' ? fontPx * 1.2 : parseFloat(cs.lineHeight) || fontPx;
  const cx = r.left + r.width / 2;
  const cy = top + r.height / 2;
  lines.forEach((line, i) => ctx.fillText(line, cx, cy + (i - (lines.length - 1) / 2) * lh, maxW));
}

/**
 * Fond plein écran, à la profondeur où la gemme le réfracte. Opaque exprès : seuls les
 * objets opaques passent dans le rendu de transmission que le verre échantillonne.
 * Le titre y est peint à la place exacte du titre de la page (police, taille, position).
 */
function Backdrop({ title, state }: { title: string; state: React.MutableRefObject<SceneState> }) {
  const { camera, size, viewport } = useThree();
  const DEPTH = -4;
  const vp = viewport.getCurrentViewport(camera, new THREE.Vector3(0, 0, DEPTH));
  const canvas = useMemo(() => document.createElement('canvas'), []);
  const texture = useMemo(() => {
    return titleTexture(canvas);
  }, [canvas]);
  const textureRef = useRef(texture);
  const words = useMemo(() => wordsTexture(), []);
  useEffect(() => () => words.dispose(), [words]);
  const uniforms = useMemo(
    () => ({
      uText: { value: texture as THREE.Texture },
      uFade: { value: 1 },
      uTime: { value: 0 },
      uInk: { value: new THREE.Color(INK) },
      uSage: { value: new THREE.Color(SAGE) },
      uPaper: { value: new THREE.Color(PAPER) },
      uAspect: { value: 1 },
      uGem: { value: new THREE.Vector2() },
      uGemSize: { value: 0.2 },
      uWords: { value: words },
    }),
    [texture, words],
  );

  // Peint le titre là où la page le pose, avec la police réellement chargée.
  useEffect(() => {
    let alive = true;
    const paint = () => {
      if (!alive) return;
      const el = document.querySelector<HTMLElement>('[data-prism-title]');
      // Définition du rendu (≤ 1,5) : au-delà, la texture coûtait des dizaines de Mo pour rien.
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = Math.round(size.width * dpr);
      const h = Math.round(size.height * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        /*
         * Taille changée (fenêtre, zoom, rotation, barre d'adresse iOS) : three alloue la
         * texture une fois pour toutes et ne renvoie ensuite que des sous-images. Un canvas
         * redimensionné exige une NOUVELLE texture, sinon le titre s'étire ou se dédouble.
         */
        canvas.width = w;
        canvas.height = h;
        const fresh = titleTexture(canvas);
        textureRef.current.dispose();
        textureRef.current = fresh;
        uniforms.uText.value = fresh;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (el) paintTitle(ctx, el, title, dpr);
      textureRef.current.needsUpdate = true;
    };
    document.fonts?.ready.then(paint).catch(paint);
    paint();
    return () => {
      alive = false;
    };
  }, [canvas, uniforms, title, size.width, size.height]);

  const material = useMemo(
    () => new THREE.ShaderMaterial({ vertexShader: TEXT_VERT, fragmentShader: TEXT_FRAG, uniforms, depthWrite: false, toneMapped: false }),
    [uniforms],
  );
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => () => textureRef.current.dispose(), []);

  useFrame((_, dt) => {
    if (!state.current.reduce) uniforms.uTime.value += Math.min(dt, 0.1); // figé si l'on réduit les animations
    uniforms.uFade.value = state.current.titleFade;
    uniforms.uAspect.value = size.width / size.height;
    // Centre de la gemme à l'écran (même repère que p dans le shader).
    const gp = state.current.gemScreen;
    uniforms.uGem.value.set(gp.x * 0.5 * uniforms.uAspect.value, gp.y * 0.5);
    uniforms.uGemSize.value = state.current.gemRadius;
  });

  return (
    <mesh position={[0, 0, DEPTH]} renderOrder={-1}>
      <planeGeometry args={[vp.width, vp.height]} />
      {/* Matériau créé ici (et non par props) : R3F recopie l'objet `uniforms` reçu en props,
          et les valeurs numériques écrites ensuite (fondu du titre) n'arrivaient jamais. */}
      <primitive object={material} attach="material" />
    </mesh>
  );
}

// ---------------------------------------------------------------- gemme et éclats

type SceneState = { pose: Pose; titleFade: number; pointer: THREE.Vector2; reduce: boolean; /** Position de la gemme à l'écran, -1..1. */ gemScreen: THREE.Vector2; /** Rayon apparent de la gemme, en hauteurs d'écran. */ gemRadius: number };

type Quality = { samples: number; resolution: number };

function Gem({ state, quality, coarse }: { state: React.MutableRefObject<SceneState>; quality: Quality; coarse: boolean }) {
  const geometry = useMemo(gemGeometry, []);
  const shard = useMemo(() => new THREE.OctahedronGeometry(0.13, 0), []);
  const group = useRef<THREE.Group>(null);
  const gem = useRef<THREE.Mesh>(null);
  const shards = useRef<(THREE.Mesh | null)[]>([]);
  const ring = useRef<THREE.Mesh>(null);
  const halo = useRef<THREE.PointLight>(null);
  const { viewport, camera } = useThree();
  const cur = useRef<Pose>({ ...POSES.open });
  const tmp = useMemo(() => ({ a: new THREE.Vector3(), b: new THREE.Vector3(), e: new THREE.Euler() }), []);

  useFrame(({ clock }, dt) => {
    const s = state.current;
    const t = s.reduce ? 8 : clock.elapsedTime;
    // Lissage exponentiel selon le temps écoulé : même vitesse à 60 et à 120 Hz.
    const k = s.reduce ? 1 : 1 - Math.exp(-dt * 3.2);
    const c = cur.current;
    const target = s.pose;
    (Object.keys(c) as (keyof Pose)[]).forEach((key) => {
      c[key] += (target[key] - c[key]) * k;
    });

    const vp = viewport.getCurrentViewport(camera, tmp.a.set(0, 0, 0));
    const narrow = vp.width < vp.height; // téléphone en portrait : la gemme reste centrée
    const g = group.current;
    if (g) {
      // Sur téléphone, le texte occupe toute la largeur : quand la pose est « de côté »
      // (chapitre avec une maquette), la gemme descend vers la maquette, sous le texte.
      g.position.set(narrow ? 0 : c.x * (vp.width / 2), c.y * vp.height - (narrow ? 0.24 * vp.height * Math.min(1, Math.abs(c.x) * 2) : 0), 0);
      const sc = c.scale * (narrow ? Math.min(1, vp.width / 3.4) : 1);
      g.scale.setScalar(sc);
      tmp.b.copy(g.position).project(camera);
      s.gemScreen.set(tmp.b.x, tmp.b.y);
      s.gemRadius = sc / vp.height; // rayon 1 de la gemme, rapporté à la hauteur visible
      // La souris incline la scène, avec retenue.
      const kr = s.reduce ? 1 : 1 - Math.exp(-dt * 2.5);
      g.rotation.x += (s.pointer.y * 0.18 - g.rotation.x) * kr;
      g.rotation.y += (s.pointer.x * 0.28 - g.rotation.y) * kr;
    }
    if (gem.current) {
      gem.current.rotation.y = t * 0.22;
      gem.current.rotation.x = Math.sin(t * 0.35) * 0.08 + 0.26; // de trois quarts : la table en ellipse, le pavillon visible
      gem.current.rotation.z = Math.cos(t * 0.27) * 0.06;
    }
    if (ring.current) {
      ring.current.rotation.x = Math.PI / 2 - c.tilt * 0.55;
      ring.current.rotation.z = t * 0.05;
      ring.current.scale.setScalar(c.ring);
      (ring.current.material as THREE.MeshBasicMaterial).opacity = 0.16 * (1 - c.cage) * c.glow;
    }
    if (halo.current) halo.current.intensity = 6 + 10 * c.glow;

    // Éclats : orbite inclinée ↔ cage icosaédrique.
    for (let i = 0; i < 12; i++) {
      const m = shards.current[i];
      if (!m) continue;
      const a = (i / 12) * Math.PI * 2 + t * 0.16;
      tmp.a.set(Math.cos(a) * c.ring, Math.sin(a * 2 + i) * 0.12, Math.sin(a) * c.ring);
      tmp.e.set(-c.tilt * 0.55, 0, 0);
      tmp.a.applyEuler(tmp.e);
      tmp.b.copy(CAGE[i]).multiplyScalar(1.45).applyAxisAngle(THREE.Object3D.DEFAULT_UP, t * 0.12);
      m.position.lerpVectors(tmp.a, tmp.b, ease(clamp01(c.cage)));
      m.rotation.set(t * 0.6 + i, t * 0.4 + i * 0.5, 0);
      const pulse = 1 + Math.sin(t * 1.3 + i) * 0.08;
      m.scale.setScalar(mix(1, 1.35, c.cage) * pulse);
    }
  });

  return (
    <group ref={group}>
      <mesh ref={gem} geometry={geometry}>
        {/*
          Verre « de bijoutier » : la face arrière est rendue aussi (reflets internes),
          aberration chromatique et légère déformation qui respire avec le temps.
          Échantillons et définition du tampon suivent la puissance de la machine.
        */}
        <MeshTransmissionMaterial
          samples={quality.samples}
          resolution={quality.resolution}
          transmission={1}
          thickness={0.85}
          roughness={0.04}
          ior={1.55}
          chromaticAberration={0.42}
          anisotropicBlur={0.18}
          distortion={0.22}
          distortionScale={0.45}
          temporalDistortion={0.08}
          backside={!coarse} // la face arrière coûte un rendu complet de plus : pas sur téléphone
          backsideThickness={0.35}
          clearcoat={1}
          clearcoatRoughness={0.04}
          iridescence={0.6}
          iridescenceIOR={1.35}
          iridescenceThicknessRange={[100, 480]}
          attenuationColor="#e8fff1"
          attenuationDistance={3}
          color="#f4fff8"
          envMapIntensity={2}
          flatShading
        />
      </mesh>
      {Array.from({ length: 12 }, (_, i) => (
        <mesh key={i} ref={(m) => { shards.current[i] = m; }} geometry={shard}>
          {/* Éclats de miroir irisé : le verre transmissif, sur des éclats si petits, virait au noir. */}
          {coarse ? (
            <meshStandardMaterial color="#d6e8dc" metalness={0.92} roughness={0.14} envMapIntensity={2.6} flatShading />
          ) : (
            <meshPhysicalMaterial color="#d6e8dc" metalness={0.92} roughness={0.14} iridescence={0.9} iridescenceIOR={1.6} iridescenceThicknessRange={[180, 620]} clearcoat={1} envMapIntensity={2.6} flatShading />
          )}
        </mesh>
      ))}
      <mesh ref={ring}>
        <torusGeometry args={[1, 0.004, 8, 160]} />
        <meshBasicMaterial color={SAGE} transparent opacity={0.16} depthWrite={false} toneMapped={false} />
      </mesh>
      <pointLight ref={halo} color={SAGE} intensity={12} distance={6} position={[0, 0, 0]} />
    </group>
  );
}

/** Studio lumineux procédural : rendu UNE fois dans une carte d'environnement. */
function Studio() {
  return (
    <Environment resolution={256} frames={1}>
      <color attach="background" args={['#0c0f0d']} />
      <Lightformer form="rect" intensity={3} color={PAPER} position={[0, 4, -3]} scale={[10, 0.5, 1]} />
      <Lightformer form="rect" intensity={5} color={PAPER} position={[-2, 4.5, 1]} scale={[3, 0.25, 1]} />
      <Lightformer form="rect" intensity={5} color={PAPER} position={[2, 4.2, -1]} scale={[3, 0.25, 1]} />
      <Lightformer form="rect" intensity={4} color={PAPER} position={[0, -4, 1]} rotation-x={Math.PI / 2} scale={[10, 2, 1]} />
      <Lightformer form="rect" intensity={4} color={PAPER} position={[-5, 1, -2]} rotation-y={Math.PI / 2.4} scale={[6, 0.8, 1]} />
      <Lightformer form="rect" intensity={3.5} color={SAGE} position={[5, -1, -1]} rotation-y={-Math.PI / 2.4} scale={[6, 1.6, 1]} />
      <Lightformer form="ring" intensity={4} color={SAGE} position={[0, 0, -6]} scale={4} />
      <Lightformer form="circle" intensity={8} color="#ffffff" position={[2.5, 3, 3]} scale={1.4} />
      <Lightformer form="rect" intensity={2.5} color="#d9c9ff" position={[-3, -3, 2]} scale={[4, 0.6, 1]} />
    </Environment>
  );
}

/** Lit le défilement et la souris ; écrit la pose cible (aucun rendu React par image). */
function Driver({ state }: { state: React.MutableRefObject<SceneState> }) {
  const invalidate = useThree((s) => s.invalidate);
  const setFrameloop = useThree((s) => s.setFrameloop);
  useEffect(() => {
    let anchors: Anchor[] = [];
    let titleEnd = 1;
    let paused = false;
    // Sections OPAQUES (papier) : quand l'une couvre tout l'écran, la scène est invisible —
    // on cesse de la calculer (batterie, chaleur), et on reprend en la quittant.
    const covers = ['perdre', 'vision'].map((id) => document.getElementById(id)).filter((e): e is HTMLElement => !!e);
    const read = () => {
      const center = window.scrollY + window.innerHeight / 2;
      state.current.pose = poseAt(anchors, center);
      state.current.titleFade = 1 - ease(clamp01(window.scrollY / Math.max(1, titleEnd)));
      const hidden = covers.some((el) => {
        const r = el.getBoundingClientRect();
        return r.top <= 0 && r.bottom >= window.innerHeight;
      });
      if (hidden !== paused) {
        paused = hidden;
        setFrameloop(hidden ? 'never' : state.current.reduce ? 'demand' : 'always');
      }
      invalidate();
    };
    const measure = () => {
      ({ anchors, titleEnd } = measureAnchors());
      read();
    };
    const onPointer = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || state.current.reduce) return; // image fixe : la souris n'y touche pas
      state.current.pointer.set((e.clientX / window.innerWidth) * 2 - 1, -((e.clientY / window.innerHeight) * 2 - 1));
    };
    measure();
    // La page se met en place (polices, images) : on remesure une fois stabilisée.
    const late = window.setTimeout(measure, 1200);
    const ro = new ResizeObserver(measure);
    ro.observe(document.body);
    window.addEventListener('scroll', read, { passive: true });
    window.addEventListener('pointermove', onPointer, { passive: true });
    return () => {
      window.clearTimeout(late);
      ro.disconnect();
      window.removeEventListener('scroll', read);
      window.removeEventListener('pointermove', onPointer);
    };
  }, [state, invalidate, setFrameloop]);
  return null;
}

/** Fondu d'entrée du canvas à la première image, et signal pour masquer le titre DOM. */
function Ready({ onReady }: { onReady: () => void }) {
  const done = useRef(false);
  useFrame(() => {
    if (done.current) return;
    done.current = true;
    requestAnimationFrame(onReady);
  });
  return null;
}

/*
 * Paliers de qualité FIXES (définis une fois : aucun objet recréé, aucun rendu React
 * inutile). Le nombre d'échantillons du verre ne change pas en cours de route : le
 * changer recompile le shader (saccade visible). Seuls la définition et le tampon bougent.
 */
const TIERS = [
  { dpr: 0.75, resolution: 256 },
  { dpr: 1, resolution: 384 },
  { dpr: 1.25, resolution: 512 },
  { dpr: 1.5, resolution: 768 },
  { dpr: 2, resolution: 1024 },
] as const;

export default function PrismScene({ title }: { title: string }) {
  const reduce = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  const coarse = useMemo(() => window.matchMedia('(pointer: coarse)').matches, []);
  const state = useRef<SceneState>({ pose: { ...POSES.open }, titleFade: 1, pointer: new THREE.Vector2(), reduce, gemScreen: new THREE.Vector2(), gemRadius: 0.2 });
  const wrap = useRef<HTMLDivElement>(null);
  // Plafond : jamais plus de pixels que l'écran n'en a (un écran ×1 ne rend pas en ×2).
  const screenDpr = window.devicePixelRatio || 1;
  const maxTier = useMemo(() => {
    const cap = coarse ? 2 : 4;
    let t = 0;
    while (t < cap && TIERS[t + 1].dpr <= Math.max(1, screenDpr)) t++;
    return t;
  }, [coarse, screenDpr]);
  const [tier, setTier] = React.useState(() => Math.min(maxTier, coarse ? 2 : 3));
  const samples = coarse ? 5 : 8;
  const quality = useMemo(() => ({ samples, resolution: TIERS[tier].resolution }), [samples, tier]);

  useEffect(
    () => () => {
      delete document.documentElement.dataset.prism;
    },
    [],
  );

  const show = (on: boolean) => {
    if (wrap.current) wrap.current.style.opacity = on ? '1' : '0';
    if (on) document.documentElement.dataset.prism = 'on';
    else delete document.documentElement.dataset.prism; // le titre de la page redevient visible
  };

  return (
    <div ref={wrap} aria-hidden className="pointer-events-none fixed inset-0 -z-10 opacity-0 transition-opacity duration-1000 ease-editorial">
      <Canvas
        dpr={Math.min(TIERS[tier].dpr, Math.max(1, screenDpr))}
        frameloop={reduce ? 'demand' : 'always'}
        camera={{ position: [0, 0, 8], fov: 35, near: 0.1, far: 40 }}
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance', stencil: false }}
        onCreated={({ gl }) => {
          gl.setClearColor(INK);
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
          /*
           * Contexte graphique perdu (GPU réinitialisé, mémoire saturée sur iOS) : le titre
           * de la page redevient visible tant que la scène n'est pas restaurée.
           */
          gl.domElement.addEventListener('webglcontextlost', () => show(false));
          gl.domElement.addEventListener('webglcontextrestored', () => show(true));
        }}
      >
        {/* Fluidité mesurée → un palier de plus ou de moins. Image fixe : rien à mesurer. */}
        {!reduce && (
          <PerformanceMonitor
            bounds={(refresh) => (refresh > 90 ? [50, 90] : [45, 58])}
            flipflops={Infinity}
            onIncline={() => setTier((t) => Math.min(maxTier, t + 1))}
            onDecline={() => setTier((t) => Math.max(0, t - 1))}
          />
        )}
        <Driver state={state} />
        <Studio />
        <Backdrop title={title} state={state} />
        <Gem state={state} quality={quality} coarse={coarse} />
        {!reduce && <Sparkles count={coarse ? 40 : 90} scale={[9, 6, 4]} size={1.6} speed={0.25} opacity={0.5} color={SAGE} noise={0.6} />}
        <Ready onReady={() => show(true)} />
      </Canvas>
    </div>
  );
}
