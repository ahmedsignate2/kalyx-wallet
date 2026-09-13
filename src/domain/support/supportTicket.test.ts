jest.mock('react-native', () => ({
  Linking: {
    canOpenURL: jest.fn().mockResolvedValue(true),
    openURL: jest.fn().mockResolvedValue(true),
  },
}));

import { detectSensitiveSecrets, sanitizeSecrets } from '../../../lib/secretDetector';
import {
  recordTechnicalLog,
  getRecentTechnicalLogs,
  getFormattedTechnicalLogs,
  clearTechnicalLogs,
} from '../../../lib/technicalLogger';
import {
  buildSupportTicketContent,
  openTelegramTicket,
  generateTicketId,
  getClientEnvironmentInfo,
  normalizeSupportTicket,
} from '../../../lib/telegramSupport';

describe('Support Ticket & Secret Detector System', () => {
  describe('detectSensitiveSecrets', () => {
    it('detects a 64-character hex private key', () => {
      const hexKey = '4f3edf983ac636a65a842ce7c78d3270fad549dd77323e07581132bce2ea5606';
      const text = `Voici ma clé: ${hexKey} s'il vous plaît aidez-moi`;
      const res = detectSensitiveSecrets(text);
      expect(res.hasSecret).toBe(true);
      expect(res.reason).toBe('hex_key');
    });

    it('detects a 0x-prefixed 64-character hex private key', () => {
      const hexKey = '0x4f3edf983ac636a65a842ce7c78d3270fad549dd77323e07581132bce2ea5606';
      const text = `Clé privée: ${hexKey}`;
      const res = detectSensitiveSecrets(text);
      expect(res.hasSecret).toBe(true);
      expect(res.reason).toBe('hex_key');
    });

    it('detects a 12-word BIP-39 mnemonic phrase', () => {
      const phrase = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
      const text = `Mon wallet: ${phrase}`;
      const res = detectSensitiveSecrets(text);
      expect(res.hasSecret).toBe(true);
      expect(res.reason).toBe('mnemonic');
    });

    it('does not flag normal messages without secrets', () => {
      const text = 'Bonjour, ma transaction sur Sepolia échoue avec une erreur RPC 400.';
      const res = detectSensitiveSecrets(text);
      expect(res.hasSecret).toBe(false);
    });

    it('does not flag standard 20-byte EVM addresses', () => {
      const text = 'Mon adresse est 0x71C7656EC7ab88b098defB751B7401B5f6d8976F';
      const res = detectSensitiveSecrets(text);
      expect(res.hasSecret).toBe(false);
    });
  });

  describe('sanitizeSecrets', () => {
    it('redacts hex private keys', () => {
      const hexKey = '4f3edf983ac636a65a842ce7c78d3270fad549dd77323e07581132bce2ea5606';
      const text = `Erreur avec clé ${hexKey} lors de la signature`;
      const sanitized = sanitizeSecrets(text);
      expect(sanitized).not.toContain(hexKey);
      expect(sanitized).toContain('[CLÉ_HEX_MASQUÉE]');
    });
  });

  describe('technicalLogger', () => {
    beforeEach(() => {
      clearTechnicalLogs();
    });

    it('records and formats logs up to 60 items without exceeding limit', () => {
      for (let i = 1; i <= 70; i++) {
        recordTechnicalLog('RPC', `Appel RPC n°${i}`);
      }
      const logs = getRecentTechnicalLogs(100);
      expect(logs.length).toBe(60);
      // Le plus ancien conservé doit être le n°11
      expect(logs[0]).toContain('Appel RPC n°11');
      expect(logs[59]).toContain('Appel RPC n°70');
    });

    it('sanitizes secrets before recording them in technical logs', () => {
      const secret = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      recordTechnicalLog('SIGN', `Signature échouée avec ${secret}`);
      const logs = getRecentTechnicalLogs();
      expect(logs[0]).not.toContain(secret);
      expect(logs[0]).toMatch(/\[CLÉ_(?:PRIVÉE|HEX)_MASQUÉE\]/);
    });

    it('formats recent logs into multiline string', () => {
      recordTechnicalLog('TX', 'Tx broadcasted');
      recordTechnicalLog('RPC', 'Block 12345 confirmed');
      const formatted = getFormattedTechnicalLogs(2);
      expect(formatted).toContain('[TX]');
      expect(formatted).toContain('Tx broadcasted');
      expect(formatted).toContain('[RPC]');
      expect(formatted).toContain('Block 12345 confirmed');
    });
  });

  describe('buildSupportTicketContent & openTelegramTicket', () => {
    it('generates a valid ticket ID matching KX-YYYYMMDD-XXXXX pattern', () => {
      const id = generateTicketId();
      expect(id).toMatch(/^KX-\d{8}-\d{5}$/);
    });

    it('returns client environment info with version', () => {
      const info = getClientEnvironmentInfo();
      expect(info).toMatch(/^Kalyx v[0-9.]+/);
    });

    it('normalizes a support ticket by injecting ID and Version if missing', () => {
      const raw = `🎫 [TICKET SUPPORT NOVA]\n• Problème : Erreur d'envoi\n• Réseau : Sepolia`;
      const normalized = normalizeSupportTicket(raw);
      expect(normalized).toMatch(/• ID : KX-\d{8}-\d{5}/);
      expect(normalized).toContain('• Version : Kalyx v');
      expect(normalized).toContain('• Problème : Erreur d\'envoi');
    });

    it('replaces placeholder ID with real unique ticket ID during normalization', () => {
      const raw = `🎫 [TICKET SUPPORT NOVA]\n• ID : KX-YYYYMMDD-XXXXX\n• Version : Kalyx v0.0.1\n• Problème : Bug`;
      const normalized = normalizeSupportTicket(raw);
      expect(normalized).not.toContain('KX-YYYYMMDD-XXXXX');
      expect(normalized).toMatch(/• ID : KX-\d{8}-\d{5}/);
    });

    it('builds a properly formatted Nova support ticket with ID and Version', () => {
      const ticket = buildSupportTicketContent({
        problem: 'Échec broadcast transaction',
        network: 'Sepolia',
        detectedError: 'RPC 400 - Solde insuffisant',
        targetAmount: '0.000038 ETH',
        userDescription: 'Mon transfert ne part pas',
        recentLogs: '[12:00:00] [TX] Error 400',
      });

      expect(ticket).toContain('🎫 [TICKET SUPPORT NOVA]');
      expect(ticket).toMatch(/• ID : KX-\d{8}-\d{5}/);
      expect(ticket).toContain('• Version : Kalyx v');
      expect(ticket).toContain('• Problème : Échec broadcast transaction');
      expect(ticket).toContain('• Réseau : Sepolia');
      expect(ticket).toContain('• Erreur détectée : RPC 400 - Solde insuffisant');
      expect(ticket).toContain('• Montant visé : 0.000038 ETH');
      expect(ticket).toContain('• Description utilisateur : "Mon transfert ne part pas"');
      expect(ticket).toContain('[12:00:00] [TX] Error 400');
    });

    it('throws when trying to open Telegram with a ticket containing secrets', async () => {
      const dangerousTicket = `🎫 [TICKET SUPPORT NOVA]\n• Seed: abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about`;
      await expect(openTelegramTicket(dangerousTicket)).rejects.toThrow(
        /Attention : ton message contient une clé privée/
      );
    });
  });
});
