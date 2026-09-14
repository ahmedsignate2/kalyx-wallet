jest.mock('react-native', () => ({
  Platform: {
    OS: 'ios',
    Version: '17.0',
    select: jest.fn((dict: any) => dict.ios || dict.default),
  },
  Linking: {
    canOpenURL: jest.fn().mockResolvedValue(true),
    openURL: jest.fn().mockResolvedValue(true),
  },
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
  removeItem: jest.fn().mockResolvedValue(undefined),
}));

import { useTicketHistoryStore, parseTicketContent, type StoredTicket } from '../../../lib/ticketHistoryStore';
import { buildSupportTicketContent, normalizeSupportTicket } from '../../../lib/telegramSupport';

describe('Ticket History Store & Interception System', () => {
  beforeEach(() => {
    useTicketHistoryStore.getState().clearTickets();
  });

  describe('parseTicketContent', () => {
    it('correctly parses structured fields from ticket content', () => {
      const content = `🎫 [TICKET SUPPORT KALYX]\n• ID : KX-20260914-12345\n• Version : Kalyx v0.0.1\n• Problème : Échec de signature\n• Réseau : Sepolia\n• Erreur détectée : RPC timeout\n• Montant visé : 0.5 ETH\n• Logs récents :\n[RPC] eth_sendRawTransaction`;
      const parsed = parseTicketContent(content);

      expect(parsed.id).toBe('KX-20260914-12345');
      expect(parsed.problem).toBe('Échec de signature');
      expect(parsed.network).toBe('Sepolia');
      expect(parsed.detectedError).toBe('RPC timeout');
      expect(parsed.content).toBe(content);
    });

    it('falls back to default values when fields are absent', () => {
      const content = 'Simple raw support message';
      const parsed = parseTicketContent(content, 'Ethereum');

      expect(parsed.id).toMatch(/^KX-\d{8}-\d{5}$/);
      expect(parsed.problem).toBe("Demande d'assistance");
      expect(parsed.network).toBe('Ethereum');
      expect(parsed.detectedError).toBeUndefined();
    });
  });

  describe('useTicketHistoryStore actions', () => {
    it('adds a ticket to history', () => {
      const ticket = useTicketHistoryStore.getState().addTicket({
        id: 'KX-20260914-00001',
        problem: 'Frais de gas trop élevés',
        network: 'Arbitrum',
        content: 'Ticket text',
      });

      expect(ticket.id).toBe('KX-20260914-00001');
      const stored = useTicketHistoryStore.getState().tickets;
      expect(stored.length).toBe(1);
      expect(stored[0].id).toBe('KX-20260914-00001');
      expect(stored[0].network).toBe('Arbitrum');
    });

    it('deduplicates tickets with the same ID', () => {
      useTicketHistoryStore.getState().addTicket({
        id: 'KX-20260914-DUP01',
        problem: 'Premier signalement',
        content: 'Content 1',
      });

      useTicketHistoryStore.getState().addTicket({
        id: 'KX-20260914-DUP01',
        problem: 'Signalement mis à jour',
        content: 'Content 2',
      });

      const stored = useTicketHistoryStore.getState().tickets;
      expect(stored.length).toBe(1);
      expect(stored[0].problem).toBe('Signalement mis à jour');
      expect(stored[0].content).toBe('Content 2');
    });

    it('limits history to the 50 most recent tickets (FIFO trimming)', () => {
      for (let i = 1; i <= 60; i++) {
        useTicketHistoryStore.getState().addTicket({
          id: `KX-20260914-${String(i).padStart(5, '0')}`,
          problem: `Ticket numéro ${i}`,
          content: `Contenu du ticket ${i}`,
        });
      }

      const stored = useTicketHistoryStore.getState().tickets;
      expect(stored.length).toBe(50);
      // Le plus récent (n°60) doit être en tête
      expect(stored[0].id).toBe('KX-20260914-00060');
      // Le plus ancien conservé doit être le n°11
      expect(stored[49].id).toBe('KX-20260914-00011');
    });

    it('removes a ticket by ID', () => {
      useTicketHistoryStore.getState().addTicket({ id: 'KX-1', problem: 'P1', content: 'C1' });
      useTicketHistoryStore.getState().addTicket({ id: 'KX-2', problem: 'P2', content: 'C2' });

      useTicketHistoryStore.getState().removeTicket('KX-1');
      const stored = useTicketHistoryStore.getState().tickets;
      expect(stored.length).toBe(1);
      expect(stored[0].id).toBe('KX-2');
    });

    it('clears all tickets', () => {
      useTicketHistoryStore.getState().addTicket({ id: 'KX-1', problem: 'P1', content: 'C1' });
      useTicketHistoryStore.getState().addTicket({ id: 'KX-2', problem: 'P2', content: 'C2' });

      useTicketHistoryStore.getState().clearTickets();
      expect(useTicketHistoryStore.getState().tickets.length).toBe(0);
    });
  });

  describe('Automatic ticket creation interception', () => {
    it('intercepts and saves ticket created via buildSupportTicketContent', () => {
      const ticket = buildSupportTicketContent({
        ticketId: 'KX-20260914-99999',
        problem: 'Problème de broadcast',
        network: 'Base',
        detectedError: 'Nonce too low',
      });

      expect(ticket).toContain('KX-20260914-99999');
      const stored = useTicketHistoryStore.getState().tickets;
      expect(stored.some((t) => t.id === 'KX-20260914-99999')).toBe(true);
      const found = stored.find((t) => t.id === 'KX-20260914-99999');
      expect(found?.network).toBe('Base');
      expect(found?.detectedError).toBe('Nonce too low');
    });

    it('intercepts and saves ticket normalized via normalizeSupportTicket', () => {
      // L'ID n'est conservé que s'il date d'aujourd'hui : on le construit dynamiquement.
      const d = new Date();
      const todayId = `KX-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-88888`;
      const raw = `🎫 [TICKET SUPPORT KALYX]\n• ID : ${todayId}\n• Version : Kalyx v0.0.1\n• Problème : Erreur swap\n• Réseau : Polygon\n• Erreur détectée : Insufficient output`;
      const normalized = normalizeSupportTicket(raw);

      expect(normalized).toContain(todayId);
      const stored = useTicketHistoryStore.getState().tickets;
      expect(stored.some((t) => t.id === todayId)).toBe(true);
      const found = stored.find((t) => t.id === todayId);
      expect(found?.problem).toBe('Erreur swap');
      expect(found?.network).toBe('Polygon');
    });
  });
});
