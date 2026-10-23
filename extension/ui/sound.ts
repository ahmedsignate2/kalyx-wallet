/**
 * SONS DISCRETS, coupés par défaut (Réglages › Apparence). Synthétisés sur
 * place (Web Audio) : aucun fichier, aucun réseau. Courts, bas, doux — une
 * confirmation qu'on entend à peine, jamais une alarme.
 */
import { soundsOn } from './prefs';

type Cue = 'success' | 'error' | 'tap';

/** Notes (Hz), durée par note (s) : deux notes qui montent, une qui descend, un clic. */
const CUES: Record<Cue, { notes: number[]; step: number; gain: number }> = {
  success: { notes: [660, 990], step: 0.09, gain: 0.05 },
  error: { notes: [330, 247], step: 0.12, gain: 0.05 },
  tap: { notes: [1200], step: 0.03, gain: 0.025 },
};

let ctx: AudioContext | null = null;

export function play(cue: Cue): void {
  if (!soundsOn()) return;
  try {
    ctx ??= new AudioContext();
    const c = CUES[cue];
    const t0 = ctx.currentTime;
    c.notes.forEach((f, i) => {
      const osc = ctx!.createOscillator();
      const g = ctx!.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      const s = t0 + i * c.step;
      // Attaque et extinction douces : pas de « clic » à l'ouverture ni à la coupure.
      g.gain.setValueAtTime(0, s);
      g.gain.linearRampToValueAtTime(c.gain, s + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, s + c.step + 0.08);
      osc.connect(g).connect(ctx!.destination);
      osc.start(s);
      osc.stop(s + c.step + 0.1);
    });
  } catch {
    /* audio indisponible : silence */
  }
}
