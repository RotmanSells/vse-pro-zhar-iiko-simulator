import { z } from 'zod';

export const MappingRole = z.enum(['organizationIds', 'terminalGroupIds', 'orderTypeIds', 'paymentTypeIds', 'productIds', 'modifierIds']);
export type MappingRole = z.infer<typeof MappingRole>;

const MappingEntry = z.union([z.string(), z.object({ simulatorId: z.string(), label: z.string().optional() })]);
export const IdentifierMappingSchema = z.object({
  version: z.number().int().positive(),
  organizationIds: z.record(MappingEntry),
  terminalGroupIds: z.record(MappingEntry),
  orderTypeIds: z.record(MappingEntry),
  paymentTypeIds: z.record(MappingEntry),
  productIds: z.record(MappingEntry),
  modifierIds: z.record(MappingEntry)
});
export type IdentifierMapping = z.infer<typeof IdentifierMappingSchema>;

export type IdentifierRef = { role: MappingRole; value: string; path: string };

export const EmptyIdentifierMapping: IdentifierMapping = {
  version: 1,
  organizationIds: {},
  terminalGroupIds: {},
  orderTypeIds: {},
  paymentTypeIds: {},
  productIds: {},
  modifierIds: {}
};

const keyToRole: Record<string, MappingRole> = {
  organizationId: 'organizationIds', organizationIds: 'organizationIds',
  terminalGroupId: 'terminalGroupIds', terminalGroupIds: 'terminalGroupIds', terminalGroupsIds: 'terminalGroupIds',
  orderTypeId: 'orderTypeIds', orderTypeIds: 'orderTypeIds',
  paymentTypeId: 'paymentTypeIds', paymentTypeIds: 'paymentTypeIds',
  productId: 'productIds', productIds: 'productIds',
  modifierId: 'modifierIds', modifierIds: 'modifierIds'
};

function mappingTarget(mapping: IdentifierMapping, role: MappingRole, value: string): string | null {
  const entry = mapping[role][value];
  if (typeof entry === 'string') return entry || null;
  return entry?.simulatorId || null;
}

function mappingLabel(mapping: IdentifierMapping, role: MappingRole, value: string): string | null {
  const entry = mapping[role][value];
  return typeof entry === 'object' ? entry.label ?? null : null;
}

export function remapRequestIdentifiers<T>(request: T, mapping: IdentifierMapping): { value: T; missing: IdentifierRef[] } {
  const missing: IdentifierRef[] = [];
  const walk = (value: unknown, key: string, path: string): unknown => {
    const role = keyToRole[key];
    if (typeof value === 'string' && role) {
      const target = mappingTarget(mapping, role, value);
      if (!target) missing.push({ role, value, path });
      return target ?? value;
    }
    if (Array.isArray(value)) return value.map((item, index) => walk(item, key, `${path}/${index}`));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [childKey, walk(childValue, childKey, `${path}/${childKey}`)]));
    return value;
  };
  return { value: walk(request, '', '') as T, missing };
}

function idRoleForPath(endpoint: string, key: string, path: string): MappingRole | null {
  const direct = keyToRole[key];
  if (direct) return direct;
  if (key !== 'id') return null;
  const segments = path.split('/').filter(Boolean);
  if (endpoint === '/api/1/organizations' && segments.includes('organizations')) return 'organizationIds';
  if (endpoint === '/api/1/terminal_groups' && segments.includes('terminalGroups') && segments.includes('items')) return 'terminalGroupIds';
  if (endpoint === '/api/1/payment_types' && segments.includes('terminalGroups')) return 'terminalGroupIds';
  if (endpoint === '/api/1/deliveries/order_types' && segments.includes('orderTypes') && segments.includes('items')) return 'orderTypeIds';
  if (endpoint === '/api/1/payment_types' && segments.includes('paymentTypes')) return 'paymentTypeIds';
  if (endpoint === '/api/1/nomenclature' && segments.includes('products')) return 'productIds';
  if (endpoint === '/api/1/nomenclature' && (segments.includes('modifiers') || segments.includes('childModifiers'))) return 'modifierIds';
  if (segments.includes('product') || segments.includes('modifier')) return segments.includes('modifier') ? 'modifierIds' : 'productIds';
  return null;
}

export function collectIdentifiers(endpoint: string, value: unknown): IdentifierRef[] {
  const found: IdentifierRef[] = [];
  const walk = (current: unknown, key: string, path: string): void => {
    const role = idRoleForPath(endpoint, key, path);
    if (typeof current === 'string' && role) found.push({ role, value: current, path });
    if (Array.isArray(current)) current.forEach((item, index) => walk(item, key, `${path}/${index}`));
    else if (current && typeof current === 'object') Object.entries(current).forEach(([childKey, childValue]) => walk(childValue, childKey, `${path}/${childKey}`));
  };
  walk(value, '', '');
  return found;
}

export function missingMappings(refs: IdentifierRef[], mapping: IdentifierMapping): IdentifierRef[] {
  return refs.filter((ref) => !mappingTarget(mapping, ref.role, ref.value));
}

export function mappingTargetForTest(mapping: IdentifierMapping, role: MappingRole, value: string): string | null {
  return mappingTarget(mapping, role, value);
}

function canonicalIdentifier(value: string, mapping: IdentifierMapping): string | null {
  const placeholders: Record<MappingRole, string> = {
    organizationIds: '<ORGANIZATION_ID>',
    terminalGroupIds: '<TERMINAL_GROUP_ID>',
    orderTypeIds: '<ORDER_TYPE_ID>',
    paymentTypeIds: '<PAYMENT_TYPE_ID>',
    productIds: '<PRODUCT_ID>',
    modifierIds: '<MODIFIER_ID>'
  };
  for (const role of MappingRole.options) {
    if (mappingTarget(mapping, role, value)) {
      const label = mappingLabel(mapping, role, value);
      return `${placeholders[role].slice(0, -1)}${label ? `:${label}` : ''}>`;
    }
    for (const [realValue, entry] of Object.entries(mapping[role])) {
      const target = typeof entry === 'string' ? entry : entry.simulatorId;
      if (target === value) {
        const label = mappingLabel(mapping, role, realValue);
        return `${placeholders[role].slice(0, -1)}${label ? `:${label}` : ''}>`;
      }
    }
  }
  return null;
}

export function normalizeForCompare(value: unknown, mapping: IdentifierMapping, key = '', path = ''): unknown {
  if (Array.isArray(value)) return value.map((item, index) => normalizeForCompare(item, mapping, key, `${path}/${index}`));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [childKey, normalizeForCompare(childValue, mapping, childKey, `${path}/${childKey}`)]));
  if (typeof value !== 'string' && typeof value !== 'number') return value;
  if (/^(correlationId|token|authorization)$/i.test(key)) return key.toLowerCase() === 'token' ? '<TOKEN>' : '<CORRELATION_ID>';
  if (/^(timestamp|when[A-Z]|cookingStartTime|completeBefore|dateAdd|.*At)$/.test(key)) return '<TIMESTAMP>';
  if (typeof value === 'string') return canonicalIdentifier(value, mapping) ?? (key === 'id' && /(^|\/)(orders?|orderInfo)(\/|$)/.test(path) ? '<ORDER_ID>' : value);
  return value;
}

export interface ShapeOptions {
  fixedArrayPaths?: ReadonlySet<string>;
}

export function shape(value: unknown, path = '', options: ShapeOptions = {}): unknown {
  if (Array.isArray(value)) {
    if (options.fixedArrayPaths?.has(path)) return { kind: 'tuple', items: value.map((item, index) => shape(item, `${path}/${index}`, options)) };
    const unique = new Map<string, unknown>();
    for (const item of value) {
      const itemShape = shape(item, `${path}[]`, options);
      unique.set(JSON.stringify(itemShape), itemShape);
    }
    return { kind: 'collection', items: [...unique.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, itemShape]) => itemShape) };
  }
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, shape(child, `${path}/${key}`, options)]));
  return typeof value;
}

export type EnumValue = { path: string; field: string; value: string };

export function enumValues(value: unknown, key = '', path = ''): EnumValue[] {
  const knownEnumKeys = new Set(['status', 'creationStatus', 'orderServiceType', 'paymentTypeKind', 'paymentProcessingType', 'state', 'type']);
  if (Array.isArray(value)) return uniqueEnumValues(value.flatMap((item) => enumValues(item, key, `${path}[]`)));
  if (value && typeof value === 'object') return uniqueEnumValues(Object.entries(value).flatMap(([childKey, childValue]) => enumValues(childValue, childKey, `${path}/${childKey}`)));
  return knownEnumKeys.has(key) && typeof value === 'string' ? [{ path, field: key, value }] : [];
}

function uniqueEnumValues(values: EnumValue[]): EnumValue[] {
  const unique = new Map<string, EnumValue>();
  for (const value of values) unique.set(`${value.path}|${value.field}|${value.value}`, value);
  return [...unique.values()].sort((left, right) => `${left.path}|${left.field}|${left.value}`.localeCompare(`${right.path}|${right.field}|${right.value}`));
}

export function mappingTargetsAreAllowed(mapping: IdentifierMapping, allowed: Record<MappingRole, Set<string>>): boolean {
  return MappingRole.options.every((role) => Object.values(mapping[role]).every((entry) => allowed[role].has(typeof entry === 'string' ? entry : entry.simulatorId)));
}
