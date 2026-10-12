'use client';

import React, { useEffect, useRef } from 'react';

/*
 * Le cristal Kalyx : une vraie scène 3D, rendue par la carte graphique (WebGL, sans
 * bibliothèque). Un seul triangle plein écran ; le fragment shader lance un rayon par
 * pixel (raymarching de champs de distance) et dessine :
 *  - une forme qui se métamorphose au fil du film : gemme → sphère liquide → coffre
 *    (cadre + cœur) → gemme, pilotée par le défilement ;
 *  - des facettes irisées (Fresnel + palette cosinus), une lumière intérieure qui
 *    imite la réfraction, un anneau en orbite et un halo sauge autour.
 * Décor pur (aria-hidden) : le contenu reste lisible et navigable sans lui.
 * « Réduire les animations » : une seule image fixe. Onglet masqué : rendu suspendu.
 */

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uMouse;
uniform float uMorph;
uniform vec2 uCenter;
uniform float uScale;
uniform float uFade;

const vec3 INK = vec3(0.031, 0.039, 0.035);
const vec3 SAGE = vec3(0.561, 0.678, 0.604);
const vec3 PAPER = vec3(0.953, 0.937, 0.902);

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

float sdOcta(vec3 p, float s) { p = abs(p); return (p.x + p.y + p.z - s) * 0.57735027; }

float sdTorus(vec3 p, vec2 t) { vec2 q = vec2(length(p.xz) - t.x, p.y); return length(q) - t.y; }

float sdBoxFrame(vec3 p, vec3 b, float e) {
  p = abs(p) - b;
  vec3 q = abs(p + e) - e;
  return min(min(
    length(max(vec3(p.x, q.y, q.z), 0.0)) + min(max(p.x, max(q.y, q.z)), 0.0),
    length(max(vec3(q.x, p.y, q.z), 0.0)) + min(max(q.x, max(p.y, q.z)), 0.0)),
    length(max(vec3(q.x, q.y, p.z), 0.0)) + min(max(q.x, max(q.y, p.z)), 0.0));
}

// Les trois états du cristal, fondus l'un dans l'autre selon uMorph (0 → 3, boucle).
float shape(vec3 p) {
  float gem = sdOcta(p, 1.05) - 0.015;
  float wob = sin(p.x * 3.7 + uTime * 0.9) * sin(p.y * 4.1 + uTime * 1.1) * sin(p.z * 3.3 + uTime * 0.7);
  float orb = length(p) - 0.82 + wob * 0.06;
  vec3 pc = p;
  pc.xy *= rot(uTime * 0.4);
  float vault = smin(sdBoxFrame(p, vec3(0.7), 0.035), sdOcta(pc, 0.42), 0.12);
  float m = mod(uMorph, 3.0);
  float a = smoothstep(0.0, 1.0, clamp(m, 0.0, 1.0));
  float b = smoothstep(0.0, 1.0, clamp(m - 1.0, 0.0, 1.0));
  float c = smoothstep(0.0, 1.0, clamp(m - 2.0, 0.0, 1.0));
  float d = mix(gem, orb, a);
  d = mix(d, vault, b);
  return mix(d, gem, c);
}

vec2 map(vec3 p) {
  p.xz *= rot(uTime * 0.16 + uMouse.x * 0.9 + uMorph * 1.3);
  p.yz *= rot(-uMouse.y * 0.6 + sin(uTime * 0.13) * 0.18);
  float s = shape(p);
  vec3 q = p;
  q.xy *= rot(0.42);
  q.yz *= rot(uTime * 0.21);
  float ring = sdTorus(q, vec2(1.55, 0.011));
  return s < ring ? vec2(s, 0.0) : vec2(ring, 1.0);
}

vec3 normalAt(vec3 p) {
  const vec2 k = vec2(1.0, -1.0);
  const float h = 0.0012;
  return normalize(
    k.xyy * map(p + k.xyy * h).x + k.yyx * map(p + k.yyx * h).x +
    k.yxy * map(p + k.yxy * h).x + k.xxx * map(p + k.xxx * h).x);
}

vec3 iridescence(float t) {
  return 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.0, 0.33, 0.67)));
}

void main() {
  vec2 uv = (gl_FragCoord.xy - uCenter * uRes) / uRes.y / uScale;
  vec3 ro = vec3(0.0, 0.0, 4.3);
  vec3 rd = normalize(vec3(uv, -1.65));

  float t = 0.0;
  float glow = 0.0;
  vec2 hit = vec2(-1.0);
  for (int i = 0; i < 80; i++) {
    vec3 p = ro + rd * t;
    vec2 h = map(p);
    glow += exp(-h.x * 9.0) * 0.012;
    if (h.x < 0.0012) { hit = vec2(t, h.y); break; }
    t += h.x * 0.9;
    if (t > 8.0) break;
  }

  vec3 col = vec3(0.0);
  float alpha = 0.0;
  if (hit.x > 0.0) {
    vec3 p = ro + rd * hit.x;
    vec3 n = normalAt(p);
    vec3 l = normalize(vec3(-0.5, 0.8, 0.6));
    float dif = max(dot(n, l), 0.0);
    float fres = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);
    float spec = pow(max(dot(reflect(rd, n), l), 0.0), 48.0);
    if (hit.y > 0.5) {
      col = mix(SAGE, PAPER, 0.4) * (0.6 + 0.6 * dif) + spec;
    } else {
      vec3 irid = iridescence(fres * 0.9 + dot(n, vec3(0.25, 0.45, 0.2)) + uTime * 0.04);
      vec3 rr = refract(rd, n, 0.72);
      float inner = pow(max(sin(dot(rr, vec3(7.0, 9.0, 6.0)) + uTime * 0.8), 0.0), 10.0);
      inner += pow(max(sin(dot(rr, vec3(-5.0, 6.0, 11.0)) - uTime * 0.6), 0.0), 14.0) * 0.7;
      col = INK * 1.6 + SAGE * dif * 0.28;
      col += mix(SAGE, irid, 0.55) * fres * 1.1;
      col += mix(SAGE, PAPER, 0.5) * inner * 0.55;
      col += PAPER * spec * 0.9;
    }
    alpha = 1.0;
  }

  // Halo : la lumière accumulée près de la surface, même là où le rayon la manque.
  vec3 halo = SAGE * glow;
  col += halo;
  alpha = max(alpha, clamp(glow * 1.4, 0.0, 1.0));

  // Vignette douce autour du cristal, puis fondu global (moins présent derrière le texte).
  float vig = 1.0 - smoothstep(0.2, 1.9, length(uv));
  alpha *= vig * uFade;
  col *= vig * uFade;
  gl_FragColor = vec4(col, alpha);
}
`;

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const s = gl.createShader(type);
  if (!s) return null;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.warn('[crystal] shader', gl.getShaderInfoLog(s));
    gl.deleteShader(s);
    return null;
  }
  return s;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (v: number) => v * v * (3 - 2 * v);

export function Crystal3D() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, powerPreference: 'high-performance' });
    if (!gl) return; // pas de WebGL : le site reste complet, sans le cristal

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;
    const prog = gl.createProgram();
    if (!prog) return;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const u = (n: string) => gl.getUniformLocation(prog, n);
    const uRes = u('uRes'), uTime = u('uTime'), uMouse = u('uMouse'), uMorph = u('uMorph');
    const uCenter = u('uCenter'), uScale = u('uScale'), uFade = u('uFade');

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    // Résolution de rendu : le shader coûte par pixel. Adaptée en continu à la machine.
    /*
     * Résolution dynamique : on vise la fréquence RÉELLE de l'écran (60, 120 Hz…) à la
     * plus haute définition tenable. `quality` = fraction de la définition native
     * (densité d'écran jusqu'à 3×, donc net jusqu'aux écrans 4K/8K). Si les images
     * arrivent à l'heure pendant ~1,5 s, on monte d'un cran ; si elles traînent, on
     * redescend et ce palier devient le plafond pour ne pas osciller.
     */
    const MIN_Q = 0.3;
    let quality = coarse ? 0.55 : 0.7;
    let ceiling = 1;
    let budget = 1000 / 60; // affiné à la fréquence mesurée
    const deltas: number[] = [];
    let windowSum = 0;
    let windowCount = 0;
    let goodWindows = 0;
    let justRaised = false;

    const target = { x: 0, y: 0 };
    const mouse = { x: 0, y: 0 };
    const state = { morph: 0, cx: 0.5, cy: 0.5, fade: 0.6 };
    let scroll = { morph: 0, cx: 0.5, cy: 0.5, fade: 0.6, scale: 1 };

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const w = Math.max(1, Math.round(window.innerWidth * dpr * quality));
      const h = Math.max(1, Math.round(window.innerHeight * dpr * quality));
      if (canvas!.width !== w || canvas!.height !== h) {
        canvas!.width = w;
        canvas!.height = h;
        gl!.viewport(0, 0, w, h);
      }
    }

    // Où en est le film : avancement global (métamorphose) et présence du prologue
    // (le cristal se range derrière le téléphone, à droite, et s'illumine).
    // Lu au défilement seulement : jamais de mesure de mise en page dans la boucle d'image.
    function readScroll() {
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const progress = clamp01(window.scrollY / max);
      const hero = document.getElementById('prologue');
      let heroIn = 0;
      if (hero) {
        const r = hero.getBoundingClientRect();
        const mid = r.top + r.height / 2 - window.innerHeight / 2;
        heroIn = smooth(clamp01(1 - Math.abs(mid) / window.innerHeight));
      }
      const wide = window.innerWidth >= 1024;
      scroll = {
        morph: progress * 6,
        cx: wide ? 0.5 + 0.22 * heroIn : 0.5,
        cy: wide ? 0.5 : 0.5 - 0.14 * heroIn, // WebGL : y vers le haut ; sur mobile, le téléphone est en bas
        fade: 0.45 + 0.55 * heroIn,
        scale: wide ? 1 : 0.78,
      };
    }

    function onPointer(e: PointerEvent) {
      if (e.pointerType !== 'mouse') return;
      target.x = (e.clientX / window.innerWidth) * 2 - 1;
      target.y = (e.clientY / window.innerHeight) * 2 - 1;
    }

    let raf = 0;
    let last = performance.now();
    const start = last;

    function draw(now: number, dt: number) {
      // Lissage exponentiel en fonction du temps écoulé : même vitesse à 60 et à 120 Hz.
      const k = reduce ? 1 : 1 - Math.exp(-dt * 3.6);
      const km = 1 - Math.exp(-dt * 3);
      state.morph += (scroll.morph - state.morph) * k;
      state.cx += (scroll.cx - state.cx) * k;
      state.cy += (scroll.cy - state.cy) * k;
      state.fade += (scroll.fade - state.fade) * k;
      mouse.x += (target.x - mouse.x) * km;
      mouse.y += (target.y - mouse.y) * km;
      gl!.uniform2f(uRes, canvas!.width, canvas!.height);
      gl!.uniform1f(uTime, reduce ? 12 : (now - start) / 1000);
      gl!.uniform2f(uMouse, mouse.x, mouse.y);
      gl!.uniform1f(uMorph, state.morph);
      gl!.uniform2f(uCenter, state.cx, state.cy);
      gl!.uniform1f(uScale, scroll.scale);
      gl!.uniform1f(uFade, state.fade);
      gl!.drawArrays(gl!.TRIANGLES, 0, 3);
    }

    function setQuality(q: number) {
      quality = Math.max(MIN_Q, Math.min(ceiling, q));
      resize();
    }

    function adapt(dtMs: number) {
      // 1) Fréquence de l'écran : médiane des 30 premières images.
      if (deltas.length < 30) {
        deltas.push(dtMs);
        if (deltas.length === 30) {
          const sorted = [...deltas].sort((a, b) => a - b);
          budget = sorted[15];
        }
        return;
      }
      // 2) Fenêtres de 12 images : à l'heure → on monte ; en retard → on descend.
      windowSum += dtMs;
      windowCount++;
      if (windowCount < 12) return;
      const avg = windowSum / windowCount;
      windowSum = 0;
      windowCount = 0;
      if (avg > budget * 1.2) {
        if (justRaised) ceiling = quality / 1.15; // le dernier palier ne tenait pas
        setQuality(quality * 0.85);
        goodWindows = 0;
        justRaised = false;
      } else if (avg < budget * 1.06) {
        justRaised = false;
        if (++goodWindows >= (budget < 10 ? 12 : 6) && quality < ceiling) {
          setQuality(quality * 1.15);
          goodWindows = 0;
          justRaised = true;
        }
      }
    }

    function loop(now: number) {
      const dtMs = Math.min(100, now - last);
      last = now;
      adapt(dtMs);
      draw(now, dtMs / 1000);
      raf = requestAnimationFrame(loop);
    }

    function onVisibility() {
      cancelAnimationFrame(raf);
      if (!document.hidden && !reduce) {
        last = performance.now();
        raf = requestAnimationFrame(loop);
      }
    }

    const redraw = () => {
      readScroll();
      draw(performance.now(), 1);
    };
    const onResize = () => {
      resize();
      readScroll();
    };
    resize();
    readScroll();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', readScroll, { passive: true });
    if (reduce) {
      redraw();
      window.addEventListener('resize', redraw);
      window.addEventListener('scroll', redraw, { passive: true });
    } else {
      window.addEventListener('pointermove', onPointer, { passive: true });
      document.addEventListener('visibilitychange', onVisibility);
      raf = requestAnimationFrame(loop);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', readScroll);
      window.removeEventListener('resize', redraw);
      window.removeEventListener('scroll', redraw);
      window.removeEventListener('pointermove', onPointer);
      document.removeEventListener('visibilitychange', onVisibility);
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden className="pointer-events-none fixed inset-0 -z-10 h-full w-full [transform:translateZ(0)]" />;
}
