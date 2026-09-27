import fs from 'fs';
import path from 'path';
import { NATIVE_MODULE, NATIVE_MODULE_PACKAGE } from './nativeModules';

/** Tous les noms que le paquet passe à requireNativeModule / requireOptionalNativeModule. */
function registeredNames(pkg: string): Set<string> {
  const root = path.join(__dirname, '../node_modules', pkg);
  const names = new Set<string>();
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(ts|tsx|js)$/.test(e.name) && !e.name.endsWith('.d.ts')) {
        for (const m of fs.readFileSync(p, 'utf8').matchAll(/require(?:Optional)?NativeModule\(\s*['"]([A-Za-z]+)['"]\s*\)/g)) names.add(m[1]);
      }
    }
  };
  walk(path.join(root, 'src'));
  walk(path.join(root, 'build'));
  return names;
}

describe('gardes de modules natifs', () => {
  /*
   * La garde du sélecteur d'images cherchait « ExpoImagePicker » alors que le
   * paquet enregistre « ExponentImagePicker » : le choix d'une photo était
   * indisponible sur tous les builds. Ce test compare chaque nom au code
   * RÉELLEMENT installé.
   */
  it.each(Object.keys(NATIVE_MODULE) as (keyof typeof NATIVE_MODULE)[])('%s : le nom gardé est celui que le paquet enregistre', (k) => {
    const names = registeredNames(NATIVE_MODULE_PACKAGE[k]);
    expect(names.size).toBeGreaterThan(0);
    expect([...names]).toContain(NATIVE_MODULE[k]);
  });
});
