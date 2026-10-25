/**
 * SÉLECTEUR KALYX — remplace les <select> du navigateur (dessinés à sa façon,
 * et très mal sur iPhone et Android) partout dans l'extension et la webapp.
 *
 * Un bouton montre le choix courant (logo, libellé) ; il ouvre une feuille
 * avec la liste : logos, détail en petit, choix courant coché, recherche dès
 * que la liste est longue, flèches du clavier, Entrée, Échap.
 *
 * Le bouton se comporte comme un <select> pour le code qui l'utilise : sa
 * propriété `value` donne le choix, un événement `change` part quand il
 * change, et `setOptions` remplace la liste (listes qui dépendent d'un autre
 * choix : tokens d'un réseau…).
 */
import { h } from './dom';
import { glyph } from './glyph';
import { openSheet } from './sheet';
import { t } from './i18n';

export interface PickOption {
  value: string;
  label: string;
  /** Petite ligne sous le libellé (solde, réseau…). */
  sub?: string;
  /** Logo : URL d'image, ou un nœud (glyphe, pastille). */
  icon?: string | Node;
  /** À droite de la ligne (montant…). */
  end?: string;
  /** Attribut lang du libellé (noms de langues écrits dans leur langue). */
  lang?: string;
  disabled?: boolean;
}

export interface PickerOpts {
  /** Titre de la feuille et nom accessible du bouton. */
  label: string;
  options: PickOption[];
  value?: string;
  testid?: string;
  /** « inline » : petite pilule à droite d'une ligne de réglage. Sinon : champ pleine largeur. */
  inline?: boolean;
  /** Recherche : par défaut dès 8 options. */
  search?: boolean;
  /** Texte quand rien n'est choisi (liste vide). */
  placeholder?: string;
}

export type Picker = HTMLButtonElement & { setOptions(options: PickOption[], value?: string): void; options_: PickOption[] };

const iconOf = (icon: string | Node | undefined, size: number): Node | null => {
  if (!icon) return null;
  if (typeof icon !== 'string') return icon.cloneNode(true);
  const img = h('img', { class: 'pk-logo', src: icon, alt: '', width: size, height: size, referrerPolicy: 'no-referrer', decoding: 'async' });
  img.addEventListener('error', () => img.replaceWith(h('span', { class: 'pk-logo pk-letter' })), { once: true });
  return img;
};

export function picker(o: PickerOpts): Picker {
  const face = h('span', { class: 'pk-face' });
  const btn = h(
    'button',
    { class: `picker${o.inline ? ' inline' : ''}`, type: 'button', 'aria-haspopup': 'listbox', 'aria-label': o.label, 'data-testid': o.testid ?? false },
    face,
    glyph('caretDown', 14),
  ) as Picker;
  btn.options_ = o.options;
  // `value` comme un <select> : lu par le code, écrit par lui sans événement (comme `select.value = …`).
  let current = '';
  Object.defineProperty(btn, 'value', {
    get: () => current,
    set: (v: string) => {
      current = String(v);
      paint();
    },
  });
  const paint = () => {
    const cur = btn.options_.find((x) => x.value === current);
    btn.disabled = !btn.options_.length;
    btn.dataset.count = String(btn.options_.length);
    face.replaceChildren(...[cur && iconOf(cur.icon, 20), h('span', { class: 'pk-text' }, cur?.label ?? o.placeholder ?? '—')].filter((x): x is Node => !!x));
    btn.title = cur?.label ?? '';
  };
  btn.setOptions = (options, value) => {
    btn.options_ = options;
    const keep = value ?? current;
    btn.value = options.some((x) => x.value === keep) ? keep : (options.find((x) => !x.disabled)?.value ?? '');
  };
  btn.value = o.value !== undefined && o.options.some((x) => x.value === o.value) ? o.value : (o.options.find((x) => !x.disabled)?.value ?? '');

  const choose = (v: string) => {
    if (v === current) return;
    btn.value = v;
    btn.dispatchEvent(new Event('change', { bubbles: true }));
  };

  btn.addEventListener('click', () => {
    const opts = btn.options_;
    const searchable = o.search ?? opts.length >= 8;
    const list = h('div', { class: 'picker-list', role: 'listbox', 'aria-label': o.label });
    const empty = h('p', { class: 'small muted pk-empty', hidden: true }, t('pkNoMatch'));
    const rows = opts.map((x) => {
      const on = x.value === btn.value;
      const row = h(
        'button',
        { class: `pk-row${on ? ' on' : ''}`, type: 'button', role: 'option', 'aria-selected': String(on), 'data-value': x.value, disabled: !!x.disabled },
        iconOf(x.icon, 32) ?? h('span', { class: 'pk-logo pk-none', 'aria-hidden': 'true' }),
        h('span', { class: 'grow' }, h('strong', x.lang ? { lang: x.lang } : {}, x.label), x.sub ? h('small', {}, x.sub) : null),
        x.end ? h('span', { class: 'pk-end' }, x.end) : null,
        on ? h('span', { class: 'tick' }, glyph('check', 18)) : null,
      );
      row.addEventListener('click', () => {
        sheet.close();
        choose(x.value);
      });
      return row;
    });
    list.append(...rows);
    const query = searchable ? h('input', { class: 'pk-search', type: 'search', placeholder: t('pkSearch'), 'aria-label': t('pkSearch'), autocomplete: 'off', spellcheck: false }) : null;
    query?.addEventListener('input', () => {
      const q = query.value.trim().toLowerCase();
      let shown = 0;
      opts.forEach((x, i) => {
        const hit = !q || `${x.label} ${x.sub ?? ''} ${x.value}`.toLowerCase().includes(q);
        rows[i].hidden = !hit;
        if (hit) shown++;
      });
      empty.hidden = shown > 0;
    });
    // Flèches : d'une option à l'autre (les masquées par la recherche sont sautées) ; Entrée : choisir.
    list.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      const live = rows.filter((r) => !r.hidden && !r.disabled);
      const i = live.indexOf(document.activeElement as HTMLButtonElement);
      live[Math.max(0, Math.min(live.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]?.focus();
    });
    query?.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') (e.preventDefault(), rows.find((r) => !r.hidden && !r.disabled)?.focus());
      if (e.key === 'Enter') {
        e.preventDefault();
        rows.find((r) => !r.hidden && !r.disabled)?.click();
      }
    });
    const sheet = openSheet(o.label, query, list, empty);
    sheet.body.closest('.modal')?.classList.add('picker-sheet');
    // Le choix courant en vue, et le focus dessus (ou sur la recherche).
    requestAnimationFrame(() => {
      const cur = rows.find((r) => r.classList.contains('on'));
      cur?.scrollIntoView({ block: 'center' });
      (query ?? cur ?? rows[0])?.focus();
    });
  });
  return btn;
}
