/**
 * INFORMATIONS DU PAYEUR, saisies une fois et réutilisées.
 *
 * WalletConnect Pay demande, pour certains marchands, l'identité du payeur
 * (nom, date de naissance…) dans un formulaire hébergé dont les champs sont
 * décrits par un schéma JSON. Le formulaire accepte un `prefill` : ce module
 * lit le schéma, dit quels champs l'app sait proposer, et choisit les valeurs
 * enregistrées à envoyer — seulement celles que le schéma demande.
 */

export interface PrefillField {
  key: string;
  required: boolean;
  kind: 'date' | 'text';
  /** Titre fourni par le schéma, s'il y en a un. */
  title?: string;
}

const MAX_VALUE = 200;

/** Champs du formulaire, lus depuis son schéma (chaîne JSON). Vide si illisible. */
export function prefillFields(schema: string | undefined | null): PrefillField[] {
  if (!schema) return [];
  let parsed: { properties?: Record<string, { type?: unknown; format?: unknown; title?: unknown }>; required?: unknown };
  try {
    parsed = JSON.parse(schema);
  } catch {
    return [];
  }
  const required = new Set(Array.isArray(parsed?.required) ? parsed.required.filter((x): x is string => typeof x === 'string') : []);
  const props = parsed?.properties && typeof parsed.properties === 'object' ? parsed.properties : {};
  const keys = [...new Set([...required, ...Object.keys(props)])];
  return keys
    .filter((k) => /^[A-Za-z][A-Za-z0-9_]{0,40}$/.test(k))
    .filter((k) => {
      // Champs texte seulement : un objet ou une liste ne se préremplit pas ici.
      const type = props[k]?.type;
      return type === undefined || type === 'string';
    })
    .map((k) => {
      const p = props[k] ?? {};
      const kind: PrefillField['kind'] = p.format === 'date' || /^(dob|dateOfBirth|birthDate)$/i.test(k) ? 'date' : 'text';
      return { key: k, required: required.has(k), kind, ...(typeof p.title === 'string' && p.title.trim() ? { title: p.title.trim().slice(0, 60) } : {}) };
    });
}

/** Date AAAA-MM-JJ réelle, dans le passé, après 1900. */
export function isValidDob(v: string, now = new Date()): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return false;
  return y >= 1900 && dt.getTime() < now.getTime();
}

/** Valeur acceptable pour ce champ. */
export function validField(f: PrefillField, v: string | undefined): boolean {
  const s = (v ?? '').trim();
  if (!s) return !f.required;
  if (s.length > MAX_VALUE) return false;
  return f.kind === 'date' ? isValidDob(s) : true;
}

/** Valeurs enregistrées à envoyer : seulement les champs du schéma, valides et non vides. */
export function prefillFor(fields: readonly PrefillField[], saved: Record<string, string> | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields) {
    const v = saved?.[f.key]?.trim();
    if (v && validField(f, v)) out[f.key] = v;
  }
  return out;
}

/** Tout ce qui est obligatoire est déjà enregistré : le formulaire natif peut être sauté. */
export function prefillComplete(fields: readonly PrefillField[], saved: Record<string, string> | null | undefined): boolean {
  if (!fields.some((f) => f.required)) return false;
  const p = prefillFor(fields, saved);
  return fields.every((f) => !f.required || !!p[f.key]);
}

/** Adresse e-mail plausible (même règle que le serveur d'achat). */
export function isValidEmail(v: string): boolean {
  const s = v.trim();
  return s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}
