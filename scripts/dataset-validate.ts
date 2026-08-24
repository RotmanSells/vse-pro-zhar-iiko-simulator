import { loadDataset } from '../src/simulator/dataset/loader.js';

const dataset = loadDataset();
if (dataset.organization.simulationOnly !== true || dataset.products.some((product) => product.simulationOnly !== true) || dataset.modifiers.some((modifier) => modifier.simulationOnly !== true)) {
  throw new Error('Every simulation fixture must be explicitly marked simulationOnly=true');
}
if (dataset.organization.address !== 'Краснодар, ул. Бабушкина, 181' || dataset.organization.currencyIsoName !== 'RUB' || dataset.organization.timeZone !== 'Europe/Moscow') throw new Error('Canonical restaurant facts drifted');
const ids = [...dataset.products.map((product) => product.id), ...dataset.modifiers.map((modifier) => modifier.id)];
if (new Set(ids).size !== ids.length) throw new Error('Dataset contains duplicate product/modifier UUIDs');
console.log(JSON.stringify({ valid: true, organization: dataset.organization.name, products: dataset.products.length, modifiers: dataset.modifiers.length, categories: dataset.categories.length }));
