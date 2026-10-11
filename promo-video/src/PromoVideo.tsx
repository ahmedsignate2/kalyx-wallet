import React from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { SCENES } from "./timeline";

const C = {
  ink: "#06070d",
  night: "#0e1019",
  orbit: "#161926",
  text: "#f2f4fa",
  mist: "#9499ab",
  ash: "#5d6275",
  gold: "#ddb565",
  goldDeep: "#b8863a",
  green: "#3cd98a",
};

const SPRING = { damping: 22, stiffness: 170, mass: 0.92 } as const;

const clamp = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

function springAt(frame: number, start: number, config: { damping: number; stiffness: number; mass: number } = SPRING) {
  if (frame < start) return 0;
  return spring({ frame: frame - start, fps: 60, config });
}

function sceneOpacity(frame: number, duration: number) {
  return interpolate(frame, [0, 24, duration - 30, duration], [0, 1, 1, 0], clamp);
}

function Ambient({ frame }: { frame: number }) {
  const drift = interpolate(frame, [0, 3600], [-28, 24]);
  const starPoints = [
    [112, 202], [892, 140], [946, 310], [121, 482], [997, 723], [74, 816],
    [1001, 1031], [88, 1197], [978, 1330], [148, 1512], [918, 1666], [96, 1788],
    [726, 254], [344, 1770], [1040, 890], [39, 1020],
  ];
  return (
    <AbsoluteFill style={{ overflow: "hidden", pointerEvents: "none" }}>
      <div style={{
        position: "absolute", inset: "-10%", transform: `translate3d(0, ${drift}px, 0)`,
        background: "radial-gradient(ellipse 37% 31% at 50% 43%, rgba(221,181,101,0.095) 0%, rgba(221,181,101,0.028) 42%, rgba(6,7,13,0) 100%)",
      }} />
      <svg width="1080" height="1920" viewBox="0 0 1080 1920" style={{ position: "absolute", inset: 0 }} aria-hidden>
        {starPoints.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={i % 4 === 0 ? 2 : 1.25} fill={i % 5 === 0 ? C.gold : C.text} opacity={i % 3 === 0 ? 0.24 : 0.1} />
        ))}
        <path d="M-180 1380 C 110 1100, 250 1030, 540 1030 S 960 930, 1250 580" fill="none" stroke="rgba(221,181,101,0.07)" strokeWidth="1" />
      </svg>
    </AbsoluteFill>
  );
}

function KalyxMark({ size, frame, start = 0, animate = true }: { size: number; frame: number; start?: number; animate?: boolean }) {
  const spokes = Array.from({ length: 16 }, (_, index) => {
    const angle = (360 / 16) * index;
    const radians = (angle * Math.PI) / 180;
    const outer = 38 + 6 * Math.cos(radians);
    const length = outer - 20;
    const p = animate ? springAt(frame, start + index * 2, { damping: 14, stiffness: 180, mass: 0.7 }) : 1;
    const h = Math.max(0.1, length * p);
    return (
      <rect key={index} x={-2.75} y={-(20 + h)} width={5.5} height={h} rx={2.75}
        transform={`rotate(${angle})`} fill="url(#kalyx-gold)" opacity={Math.min(1, p * 1.5)} />
    );
  });
  return (
    <svg width={size} height={size} viewBox="-50 -50 100 100" aria-label="Kalyx" role="img">
      <defs>
        <linearGradient id="kalyx-gold" x1="0" y1="-1" x2="0" y2="1">
          <stop offset="0%" stopColor={C.gold} />
          <stop offset="100%" stopColor={C.goldDeep} />
        </linearGradient>
        <radialGradient id="kalyx-halo">
          <stop offset="0%" stopColor={C.gold} stopOpacity="0.28" />
          <stop offset="100%" stopColor={C.gold} stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle r="48" fill="url(#kalyx-halo)" />
      {spokes}
      <circle r="8" fill={`url(#kalyx-gold)`} opacity={animate ? springAt(frame, start + 10) : 1} />
    </svg>
  );
}

function OrbitGraphic({ frame }: { frame: number }) {
  const rotate = interpolate(frame, [0, 600], [-10, 10]);
  const glowScale = 0.96 + Math.sin(frame / 58) * 0.025;
  return (
    <div style={{ position: "absolute", width: 800, height: 800, left: 140, top: 330, transform: `rotate(${rotate}deg) scale(${glowScale})` }}>
      <div style={{ position: "absolute", inset: 100, border: "1px solid rgba(221,181,101,0.13)", borderRadius: "50%" }} />
      <div style={{ position: "absolute", inset: 188, border: "1px solid rgba(242,244,250,0.07)", borderRadius: "50%" }} />
      <div style={{ position: "absolute", width: 10, height: 10, borderRadius: "50%", background: C.gold, top: 74, left: 392, boxShadow: "0 0 28px rgba(221,181,101,.75)" }} />
      <div style={{ position: "absolute", width: 6, height: 6, borderRadius: "50%", background: C.text, bottom: 96, right: 156, opacity: 0.72 }} />
    </div>
  );
}

type Chapter = {
  frame: number;
  duration: number;
  number: string;
  label: string;
  title: string;
  subtitle: string;
  screen: string;
  deviceScale?: number;
  tilt?: number;
};

function Phone({ frame, duration, screen, tilt = -4, deviceScale = 1 }: Pick<Chapter, "frame" | "duration" | "screen" | "tilt" | "deviceScale">) {
  const enter = springAt(frame, 8, { damping: 20, stiffness: 130, mass: 0.8 });
  const rise = interpolate(enter, [0, 1], [190, 0]);
  const scale = interpolate(enter, [0, 1], [0.91, deviceScale]);
  const rotateY = interpolate(frame, [0, duration], [tilt + 3, tilt - 2]);
  const rotateX = interpolate(frame, [0, duration], [3.5, -2]);
  const float = Math.sin(frame / 95) * 7;
  return (
    <div style={{
      position: "absolute", top: 632, left: "50%", width: 610, aspectRatio: "9 / 16",
      padding: 12, borderRadius: 76, overflow: "hidden", background: "#090b12",
      border: "1.5px solid rgba(242,244,250,0.3)",
      boxShadow: "0 46px 100px rgba(0,0,0,.62), 0 0 90px rgba(221,181,101,.11), inset 0 1px rgba(255,255,255,.45)",
      transform: `translate3d(-50%, ${rise + float}px, 0) perspective(1500px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(${scale})`,
      transformStyle: "preserve-3d",
    }}>
      <Img src={staticFile(`screens/${screen}.jpg`)} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", borderRadius: 63, backgroundColor: C.ink }} />
      <div style={{ position: "absolute", inset: 13, borderRadius: 62, pointerEvents: "none", background: "linear-gradient(110deg, rgba(255,255,255,.085), transparent 15%, transparent 73%, rgba(221,181,101,.045))" }} />
      <div style={{ position: "absolute", top: 60, bottom: 60, left: -18, width: 13, borderRadius: 99, background: "rgba(255,255,255,.1)", filter: "blur(5px)" }} />
    </div>
  );
}

function ChapterScene(props: Chapter) {
  const frame = useCurrentFrame();
  const enter = springAt(frame, 0);
  const titleY = interpolate(enter, [0, 1], [42, 0]);
  const opacity = sceneOpacity(frame, props.duration);
  return (
    <AbsoluteFill style={{ opacity }}>
      <OrbitGraphic frame={frame} />
      <div style={{ position: "absolute", top: 147, left: 0, width: "100%", textAlign: "center", opacity: interpolate(enter, [0, 0.7], [0, 1], clamp) }}>
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 18, color: C.gold, fontSize: 22, lineHeight: "28px", fontWeight: 600, letterSpacing: "0.22em" }}>
          <span style={{ width: 42, height: 1, background: "rgba(221,181,101,.68)" }} />
          {props.label}
          <span style={{ width: 42, height: 1, background: "rgba(221,181,101,.68)" }} />
        </div>
        <h1 style={{
          margin: "42px auto 0", width: 960, whiteSpace: "pre-line", color: C.text,
          fontSize: 76, lineHeight: 1.06, letterSpacing: "-0.055em", fontWeight: 600,
          transform: `translateY(${titleY}px)`,
        }}>{props.title}</h1>
        <p style={{
          margin: "24px auto 0", width: 880, color: C.mist, fontSize: 29,
          lineHeight: 1.35, fontWeight: 400, letterSpacing: "-0.015em",
        }}>{props.subtitle}</p>
      </div>
      <Phone {...props} frame={frame} />
      <div style={{ position: "absolute", bottom: 111, left: 0, right: 0, textAlign: "center", color: C.ash, fontSize: 18, letterSpacing: "0.08em", opacity: sceneOpacity(frame, props.duration) }}>
        KALYX WALLET <span style={{ color: C.gold, margin: "0 12px" }}>·</span> {props.number}
      </div>
    </AbsoluteFill>
  );
}

function Opening() {
  const frame = useCurrentFrame();
  const brand = springAt(frame, 16, { damping: 14, stiffness: 180, mass: 0.8 });
  const title = springAt(frame, 95, { damping: 23, stiffness: 150, mass: 0.9 });
  const headlineY = interpolate(title, [0, 1], [55, 0]);
  const halo = 0.75 + Math.sin(frame / 36) * 0.05;
  return (
    <AbsoluteFill>
      <OrbitGraphic frame={frame} />
      <div style={{ position: "absolute", left: "50%", top: 390, width: 520, height: 520, transform: `translateX(-50%) scale(${0.92 + brand * 0.08})`, filter: `drop-shadow(0 0 44px rgba(221,181,101,${halo}))` }}>
        <KalyxMark size={520} frame={frame} start={22} />
      </div>
      <div style={{ position: "absolute", top: 1075, left: 0, right: 0, textAlign: "center", opacity: brand }}>
        <p style={{ margin: 0, color: C.gold, fontSize: 21, letterSpacing: "0.25em", fontWeight: 600 }}>KALYX WALLET</p>
        <h1 style={{ margin: "31px auto 0", color: C.text, fontWeight: 500, fontSize: 81, lineHeight: 1.07, letterSpacing: "-0.055em", transform: `translateY(${headlineY}px)` }}>
          Tes cryptos.<br />Ton contrôle.
        </h1>
        <p style={{ margin: "28px auto 0", color: C.mist, fontSize: 29, lineHeight: 1.4, opacity: title }}>
          Un wallet non custodial, pensé pour toi.
        </p>
      </div>
      <div style={{ position: "absolute", bottom: 148, left: 0, right: 0, textAlign: "center", color: C.ash, fontSize: 16, letterSpacing: "0.22em", opacity: title }}>
        LA LUMIÈRE COMME MATIÈRE
      </div>
    </AbsoluteFill>
  );
}

function Outro() {
  const frame = useCurrentFrame();
  const logoSpring = springAt(frame, 8, { damping: 15, stiffness: 180, mass: 0.72 });
  const wordSpring = springAt(frame, 32, { damping: 22, stiffness: 160, mass: 0.9 });
  const wordY = interpolate(wordSpring, [0, 1], [34, 0]);
  const lineSpring = springAt(frame, 72);
  const betaSpring = springAt(frame, 122, { damping: 18, stiffness: 220, mass: 0.72 });
  const wordOpacity = interpolate(wordSpring, [0, 0.4], [0, 1], clamp);
  const betaScale = interpolate(betaSpring, [0, 1], [0.82, 1]);
  return (
    <AbsoluteFill>
      <OrbitGraphic frame={frame} />
      <div style={{ position: "absolute", top: 275, left: "50%", width: 256, height: 256, transform: `translateX(-50%) scale(${interpolate(logoSpring, [0, 1], [0.78, 1])})`, filter: "drop-shadow(0 0 54px rgba(221,181,101,.36))" }}>
        <KalyxMark size={256} frame={frame} start={10} />
      </div>
      <div style={{ position: "absolute", top: 640, left: 0, right: 0, textAlign: "center", opacity: wordOpacity, transform: `translateY(${wordY}px)` }}>
        <div style={{ color: C.text, fontSize: 134, lineHeight: 1, fontWeight: 500, letterSpacing: "-0.08em" }}>Kalyx</div>
        <div style={{ color: C.mist, fontSize: 42, lineHeight: 1.2, fontWeight: 400, letterSpacing: "0.08em", marginTop: 15 }}>WALLET</div>
      </div>
      <div style={{ position: "absolute", top: 958, left: 0, right: 0, textAlign: "center", color: C.text, fontSize: 36, lineHeight: 1.35, opacity: lineSpring }}>
        Tes clés restent sur ton appareil.
      </div>
      <div style={{ position: "absolute", top: 1115, left: "50%", padding: "20px 36px", borderRadius: 999, border: "1px solid rgba(221,181,101,.58)", background: "rgba(221,181,101,.08)", color: C.gold, fontSize: 21, fontWeight: 600, letterSpacing: "0.24em", transform: `translateX(-50%) scale(${betaScale})`, opacity: betaSpring }}>
        EN BÊTA
      </div>
      <div style={{ position: "absolute", top: 1260, left: 120, right: 120, textAlign: "center", color: C.mist, fontSize: 26, lineHeight: 1.42, opacity: lineSpring }}>
        Découvre Kalyx Wallet.<br />La maîtrise, entre tes mains.
      </div>
      <div style={{ position: "absolute", bottom: 148, left: 0, right: 0, textAlign: "center", color: C.ash, fontSize: 17, letterSpacing: "0.16em", opacity: lineSpring }}>
        PORTEFEUILLE CRYPTO NON CUSTODIAL
      </div>
    </AbsoluteFill>
  );
}

export const PromoVideo: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ backgroundColor: C.ink, color: C.text, overflow: "hidden" }}>
      <Ambient frame={frame} />
      <Sequence from={SCENES[0].from} durationInFrames={SCENES[0].duration} name={SCENES[0].title}>
        <Opening />
      </Sequence>
      <Sequence from={SCENES[1].from} durationInFrames={SCENES[1].duration} name={SCENES[1].title}>
        <ChapterScene frame={0} duration={SCENES[1].duration} number="01" label="PORTEFEUILLE" title={"Tout ton portefeuille.\nEn un seul regard."} subtitle="Une vue claire de tes actifs, réunis dans Kalyx." screen="home" tilt={-5} />
      </Sequence>
      <Sequence from={SCENES[2].from} durationInFrames={SCENES[2].duration} name={SCENES[2].title}>
        <ChapterScene frame={0} duration={SCENES[2].duration} number="02" label="MULTI-RÉSEAUX" title={"Bitcoin, Solana,\nEVM et TON."} subtitle="Tes actifs, sur les réseaux pris en charge." screen="send" tilt={5} deviceScale={0.97} />
      </Sequence>
      <Sequence from={SCENES[3].from} durationInFrames={SCENES[3].duration} name={SCENES[3].title}>
        <ChapterScene frame={0} duration={SCENES[3].duration} number="03" label="SWAP" title={"Échange tes actifs\nen quelques gestes."} subtitle="Montants et frais réseau visibles avant le devis." screen="swap" tilt={-3} />
      </Sequence>
      <Sequence from={SCENES[4].from} durationInFrames={SCENES[4].duration} name={SCENES[4].title}>
        <ChapterScene frame={0} duration={SCENES[4].duration} number="04" label="RENDEMENT" title={"Suis tes positions\nau même endroit."} subtitle="Staking et rendement DeFi, selon les réseaux disponibles." screen="earn" tilt={4} deviceScale={0.96} />
      </Sequence>
      <Sequence from={SCENES[5].from} durationInFrames={SCENES[5].duration} name={SCENES[5].title}>
        <ChapterScene frame={0} duration={SCENES[5].duration} number="05" label="SÉCURITÉ" title={"Comprends avant\nde signer."} subtitle="Le domaine, la transaction et son impact sont expliqués." screen="browser" tilt={-5} />
      </Sequence>
      <Sequence from={SCENES[6].from} durationInFrames={SCENES[6].duration} name={SCENES[6].title}>
        <Outro />
      </Sequence>
      <Audio src={staticFile("kalyx-score.wav")} volume={0.52} />
    </AbsoluteFill>
  );
};
