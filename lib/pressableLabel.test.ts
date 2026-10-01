jest.mock('react-native-reanimated', () => ({ __esModule: true, default: { createAnimatedComponent: (c: unknown) => c }, createAnimatedComponent: (c: unknown) => c, useAnimatedStyle: () => ({}), useSharedValue: (v: unknown) => ({ value: v }), withSequence: jest.fn(), withSpring: jest.fn(), withTiming: jest.fn(), useReducedMotion: () => false }));
jest.mock('react-native', () => ({ Pressable: 'Pressable' }));
jest.mock('./debugJournal', () => ({ journal: jest.fn() }));
jest.mock('./haptics', () => ({ haptic: { light: jest.fn(), selection: jest.fn() } }));
jest.mock('../ui/tokens', () => ({ springs: {}, durations: {}, PRESS_SCALE: 0.96 }));
import React from 'react';
import { firstText, journalLabel } from '../ui/kit/Pressable';

const h = React.createElement;

describe('libellé d’un bouton sans accessibilityLabel (journal)', () => {
  it('prend le PREMIER texte : le titre, pas le solde qui suit', () => {
    const row = h('View', null, h('Icon', { name: 'x' }), h('View', null, h('Text', null, 'Compte 2'), h('Text', null, '1,23 SOL')));
    expect(firstText(row)).toBe('Compte 2');
  });

  it('lit les composants qui reçoivent leur texte en propriété (ListRow, Chip)', () => {
    expect(firstText(h('ListRow', { title: 'Réseaux' }))).toBe('Réseaux');
    expect(firstText(h('Chip', { label: 'Tout' }))).toBe('Tout');
  });

  it('rien à lire (icône seule) : null', () => {
    expect(firstText(h('Icon', { name: 'close' }))).toBeNull();
  });

  it('masque adresses et hachages, borne la longueur', () => {
    expect(journalLabel('Envoyer à 0x4999a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6b05E')).toBe('Envoyer à …');
    expect(journalLabel('x'.repeat(10) + ' ' + 'y'.repeat(60)).length).toBeLessThanOrEqual(48);
  });
});
