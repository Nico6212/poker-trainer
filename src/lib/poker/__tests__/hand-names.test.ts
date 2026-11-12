import { describe, expect, it } from 'vitest';
import { translateHandName } from '../hand-names';

describe('translateHandName — abattage en français', () => {
  it('hauteur', () => {
    expect(translateHandName('A High')).toBe('Hauteur As');
    expect(translateHandName('9 High')).toBe('Hauteur 9');
  });

  it('paire', () => {
    expect(translateHandName('Pair, A\'s')).toBe('Paire d’As');
    expect(translateHandName('Pair, K\'s')).toBe('Paire de Rois');
    expect(translateHandName('Pair, 7\'s')).toBe('Paire de 7');
  });

  it('deux paires', () => {
    expect(translateHandName('Two Pair, 9\'s & 8\'s')).toBe('Deux paires, 9 et 8');
    expect(translateHandName('Two Pair, A\'s & K\'s')).toBe('Deux paires, As et Rois');
  });

  it('brelan', () => {
    expect(translateHandName('Three of a Kind, 5\'s')).toBe('Brelan de 5');
    expect(translateHandName('Three of a Kind, A\'s')).toBe('Brelan d’As');
  });

  it('quinte', () => {
    expect(translateHandName('Straight, K High')).toBe('Quinte au Roi');
    expect(translateHandName('Straight, 9 High')).toBe('Quinte au 9');
    expect(translateHandName('Straight, Wheel')).toBe('Quinte au 5');
  });

  it('couleur', () => {
    expect(translateHandName('Flush, Ah High')).toBe('Couleur');
  });

  it('full', () => {
    expect(translateHandName('Full House, Q\'s over 4\'s')).toBe('Full aux Dames par les 4');
    expect(translateHandName('Full House, A\'s over K\'s')).toBe('Full aux As par les Rois');
  });

  it('carré', () => {
    expect(translateHandName('Four of a Kind, A\'s')).toBe('Carré d’As');
    expect(translateHandName('Four of a Kind, 8\'s')).toBe('Carré de 8');
  });

  it('quinte flush et quinte flush royale', () => {
    expect(translateHandName('Straight Flush, Kh High')).toBe('Quinte flush au Roi');
    expect(translateHandName('Royal Flush')).toBe('Quinte flush royale');
  });

  it('repli : rend la chaîne telle quelle si non reconnue', () => {
    expect(translateHandName('Something Else')).toBe('Something Else');
  });
});
