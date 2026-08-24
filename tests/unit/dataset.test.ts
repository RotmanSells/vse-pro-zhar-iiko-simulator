import { describe, expect, it } from 'vitest';
import { loadDataset } from '../../src/simulator/dataset/loader.js';

describe('dataset', () => {
  it('keeps canonical facts and simulation-only fixtures separate', () => {
    const dataset = loadDataset();
    expect(dataset.organization.address).toBe('Краснодар, ул. Бабушкина, 181');
    expect(dataset.organization.currencyIsoName).toBe('RUB');
    expect(dataset.organization.timeZone).toBe('Europe/Moscow');
    expect(dataset.products.every((product) => product.simulationOnly)).toBe(true);
  });
});
