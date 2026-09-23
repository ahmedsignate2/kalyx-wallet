import { useToastStore, toast } from './toast';

const reset = () => useToastStore.setState({ current: null, queue: [] });

describe('file d’attente des toasts (§12.2)', () => {
  beforeEach(reset);

  it('affiche immédiatement le premier', () => {
    toast.success('Copié');
    expect(useToastStore.getState().current).toMatchObject({ title: 'Copié' });
    expect(useToastStore.getState().queue).toHaveLength(0);
  });

  it('met le second en attente au lieu d’écraser le premier', () => {
    // C’était le défaut : deux événements rapprochés — une transaction qui part
    // puis se confirme — et le premier message n’était jamais lu.
    toast.info('C’est parti');
    toast.success('C’est arrivé');
    expect(useToastStore.getState().current).toMatchObject({ title: 'C’est parti' });
    expect(useToastStore.getState().queue).toHaveLength(1);
  });

  it('passe au suivant à la fermeture', () => {
    toast.info('Un');
    toast.success('Deux');
    useToastStore.getState().hide();
    expect(useToastStore.getState().current).toMatchObject({ title: 'Deux' });
    expect(useToastStore.getState().queue).toHaveLength(0);
  });

  it('se vide complètement', () => {
    toast.info('Un');
    useToastStore.getState().hide();
    expect(useToastStore.getState().current).toBeNull();
  });

  it('ignore un doublon exact du bandeau affiché', () => {
    toast.error('Échec', 'réseau');
    toast.error('Échec', 'réseau');
    expect(useToastStore.getState().queue).toHaveLength(0);
  });

  it('garde un même titre s’il change de type', () => {
    toast.info('Envoi');
    toast.error('Envoi');
    expect(useToastStore.getState().queue).toHaveLength(1);
  });

  it('plafonne la file et garde les plus RÉCENTS', () => {
    toast.info('affiché');
    for (const n of ['a', 'b', 'c', 'd']) toast.info(n);
    const q = useToastStore.getState().queue;
    expect(q).toHaveLength(3);
    expect(q.map((t) => t.title)).toEqual(['b', 'c', 'd']);
  });

  it('attribue des identifiants distincts', () => {
    toast.info('un');
    toast.info('deux');
    const ids = [useToastStore.getState().current!.id, ...useToastStore.getState().queue.map((t) => t.id)];
    expect(new Set(ids).size).toBe(ids.length);
  });
});
