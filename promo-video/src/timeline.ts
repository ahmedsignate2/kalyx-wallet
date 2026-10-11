export const FPS = 60;
export const WIDTH = 1080;
export const HEIGHT = 1920;
export const TOTAL_FRAMES = 60 * FPS;

export const SCENES = [
  { id: "opening", title: "Ouverture", from: 0, duration: 300 },
  { id: "overview", title: "Vue d’ensemble", from: 300, duration: 540 },
  { id: "networks", title: "Réseaux", from: 840, duration: 540 },
  { id: "swap", title: "Swap", from: 1380, duration: 540 },
  { id: "earn", title: "Rendement", from: 1920, duration: 480 },
  { id: "security", title: "Signature vérifiée", from: 2400, duration: 600 },
  { id: "outro", title: "Bêta", from: 3000, duration: 600 },
] as const;

if (SCENES.reduce((sum, scene) => sum + scene.duration, 0) !== TOTAL_FRAMES) {
  throw new Error("La durée du montage doit être exactement de 3 600 images.");
}
