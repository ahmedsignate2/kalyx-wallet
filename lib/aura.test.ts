import { useAura, aura, __resetAura } from './aura';

/*
 * L'arbitrage est la seule logique non triviale du moteur, et c'est celle qui
 * se casse en silence : un halo qui clignote ne lève aucune exception.
 */
describe('Aura — arbitrage des impulsions', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(0);
    __resetAura();
  });
  afterEach(() => jest.useRealTimers());

  it('abandonne une impulsion quand le halo n’est pas visible (jamais de file)', () => {
    expect(aura.pulse('success')).toBe(false);
    expect(useAura.getState().event).toBeNull();
  });

  describe('halo visible', () => {
    beforeEach(() => useAura.getState().setVisible(true));

    it('retient la première impulsion', () => {
      expect(aura.pulse('receive')).toBe(true);
      expect(useAura.getState().event).toMatchObject({ kind: 'receive' });
    });

    it('coalesce deux réceptions rapprochées en une seule', () => {
      expect(aura.pulse('receive')).toBe(true);
      const seq = useAura.getState().event!.seq;
      jest.setSystemTime(400); // < COALESCE_MS
      expect(aura.pulse('receive')).toBe(false);
      expect(useAura.getState().event!.seq).toBe(seq);
    });

    it('accepte la même impulsion une fois la fenêtre de coalescence passée', () => {
      aura.pulse('receive');
      jest.setSystemTime(800); // > COALESCE_MS et > MIN_GAP_MS
      expect(aura.pulse('receive')).toBe(true);
    });

    it('refuse une impulsion de priorité inférieure ou égale trop tôt', () => {
      aura.pulse('success');
      jest.setSystemTime(200);
      expect(aura.pulse('receive')).toBe(false); // receive < success
      expect(aura.pulse('unlock')).toBe(false);
      expect(useAura.getState().event).toMatchObject({ kind: 'success' });
    });

    it('laisse une erreur interrompre un succès en cours', () => {
      aura.pulse('success');
      jest.setSystemTime(200);
      expect(aura.pulse('error')).toBe(true); // error > success
      expect(useAura.getState().event).toMatchObject({ kind: 'error' });
    });

    it('retombe au repos après l’impulsion', () => {
      aura.pulse('error');
      expect(useAura.getState().event).not.toBeNull();
      jest.advanceTimersByTime(1000);
      expect(useAura.getState().event).toBeNull();
    });

    it('ne retombe pas au repos si une impulsion est arrivée entre-temps', () => {
      aura.pulse('receive');
      jest.setSystemTime(800);
      jest.advanceTimersByTime(0);
      aura.pulse('error');
      // Le minuteur de la première impulsion arrive à échéance…
      jest.advanceTimersByTime(200);
      // …mais la seconde est encore en cours : le halo ne s’éteint pas.
      expect(useAura.getState().event).toMatchObject({ kind: 'error' });
    });
  });
});

describe('Aura — ambiance', () => {
  beforeEach(__resetAura);

  it('démarre au repos', () => {
    expect(useAura.getState().ambient).toBe('rest');
  });

  it('ne déclare que des ambiances adossées à une donnée réelle', () => {
    // Garde-fou volontaire : « réseau chargé » n’existe pas tant que
    // gasTrackerStore renvoie du Math.random() (docs/08 §2.6, §21.3).
    const allowed = ['rest', 'sync', 'offline'];
    for (const a of allowed) {
      aura.setAmbient(a as 'rest');
      expect(useAura.getState().ambient).toBe(a);
    }
  });
});
