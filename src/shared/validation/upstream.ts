import { Ajv, type ErrorObject, type ValidateFunction } from 'ajv';
import * as AjvFormatsModule from 'ajv-formats';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SimulatorHttpError } from '../errors/errors.js';

type OpenApiOperation = {
  requestBody?: { content?: { 'application/json'?: { schema?: unknown } } };
  responses?: Record<string, { content?: { 'application/json'?: { schema?: unknown } } }>;
};

type OpenApiDocument = {
  paths: Record<string, Record<string, OpenApiOperation>>;
  components: { schemas: Record<string, unknown> };
};

function loadDocument(): OpenApiDocument {
  const file = resolve(process.cwd(), 'contracts/upstream/iiko-openapi.json');
  return JSON.parse(readFileSync(file, 'utf8')) as OpenApiDocument;
}

function normalizeOpenApi(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => normalizeOpenApi(item));
  if (value === null || typeof value !== 'object') return value;
  const source = value as Record<string, unknown>;
  const normalized: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(source)) {
    if (key === 'discriminator' || key === 'nullable') continue;
    normalized[key] = normalizeOpenApi(child);
  }
  if (typeof source.type === 'string') {
    const customType = source.type;
    if (customType === 'uuid') { normalized.type = 'string'; normalized.format = 'uuid'; }
    else if (customType === 'bool') normalized.type = 'boolean';
    else if (customType === 'float') normalized.type = 'number';
    else if (customType === 'int' || customType.startsWith('integer ')) normalized.type = 'integer';
    else if (customType === 'enum' || customType.startsWith('constant string')) normalized.type = 'string';
    else if (customType.startsWith('Array of strings')) { normalized.type = 'array'; normalized.items = { type: 'string', ...(customType.includes('uuid') ? { format: 'uuid' } : {}) }; }
  }
  if (source.nullable === true) {
    if (typeof normalized.type === 'string') normalized.type = [normalized.type, 'null'];
    else return { anyOf: [normalized, { type: 'null' }] };
  }
  // The upstream OpenAPI uses inheritance via allOf with additionalProperties:false
  // on both the base and derived DTOs. JSON Schema evaluates those scopes separately,
  // which would reject legitimate derived fields. Keep the upstream shape pinned and
  // relax only polymorphic inheritance scopes for a faithful runtime boundary.
  if (source.additionalProperties === false && (source.allOf || source.discriminator)) normalized.additionalProperties = true;
  return normalized;
}

function formatMessage(errors: ErrorObject[] | null | undefined): string {
  return errors?.map((error) => `${error.instancePath || '/'} ${error.message ?? 'invalid'}`).join('; ') ?? 'schema validation failed';
}

export class UpstreamValidator {
  private readonly document = normalizeOpenApi(loadDocument()) as OpenApiDocument;
  private readonly ajv: Ajv;
  private readonly cache = new Map<string, ValidateFunction>();

  public constructor() {
    this.ajv = new Ajv({ allErrors: true, strict: false, validateFormats: false, discriminator: false });
    const addFormats = (AjvFormatsModule as unknown as { default: (ajv: Ajv) => Ajv }).default;
    addFormats(this.ajv);
    this.ajv.addFormat('date-span', /^[A-Za-z_\/]+$/);
    this.ajv.addFormat('yyyy-MM-dd HH:mm:ss.fff', /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/);
    this.ajv.addSchema(this.document as never, 'iiko-openapi');
  }

  private compile(kind: 'request' | 'response', path: string, status = '200'): ValidateFunction {
    const key = `${kind}:${path}:${status}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const operation = this.document.paths[path]?.post;
    if (!operation) throw new Error(`Upstream path is not pinned: ${path}`);
    const schema = kind === 'request'
      ? operation.requestBody?.content?.['application/json']?.schema
      : operation.responses?.[status]?.content?.['application/json']?.schema;
    if (!schema) throw new Error(`Upstream ${kind} schema is not pinned: ${path} ${status}`);
    const validate = this.ajv.compile({ $schema: 'http://json-schema.org/draft-07/schema#', ...(schema as object), components: this.document.components } as never);
    this.cache.set(key, validate);
    return validate;
  }

  request(path: string, payload: unknown): void {
    const validate = this.compile('request', path);
    if (!validate(payload)) throw new SimulatorHttpError(400, formatMessage(validate.errors), 'Common');
  }

  response(path: string, payload: unknown, status = '200'): void {
    const validate = this.compile('response', path, status);
    if (!validate(payload)) throw new Error(`Simulator response violates upstream schema for ${path}: ${formatMessage(validate.errors)}`);
  }

  responseErrors(path: string, payload: unknown, status: number): void {
    this.response(path, payload, String(status));
  }

  fixedArrayPaths(path: string, status = '200'): ReadonlySet<string> {
    const operation = this.document.paths[path]?.post;
    const schema = operation?.responses?.[status]?.content?.['application/json']?.schema;
    const fixed = new Set<string>();
    const visit = (node: unknown, currentPath: string, seenRefs: Set<string>): void => {
      if (!node || typeof node !== 'object') return;
      const object = node as Record<string, unknown>;
      const ref = typeof object.$ref === 'string' ? object.$ref : null;
      if (ref) {
        if (seenRefs.has(ref)) return;
        const name = ref.split('/').pop();
        const referenced = name ? this.document.components.schemas[name] : undefined;
        if (referenced) visit(referenced, currentPath, new Set([...seenRefs, ref]));
      }
      if (object.type === 'array') {
        const minItems = typeof object.minItems === 'number' ? object.minItems : undefined;
        const maxItems = typeof object.maxItems === 'number' ? object.maxItems : undefined;
        if (object.prefixItems || (minItems !== undefined && maxItems !== undefined && minItems === maxItems)) fixed.add(currentPath);
        if (object.items) visit(object.items, `${currentPath}[]`, seenRefs);
      }
      if (object.properties && typeof object.properties === 'object') for (const [key, child] of Object.entries(object.properties)) visit(child, `${currentPath}/${key}`, seenRefs);
      for (const key of ['allOf', 'anyOf', 'oneOf']) if (Array.isArray(object[key])) for (const child of object[key]) visit(child, currentPath, seenRefs);
    };
    visit(schema, '', new Set());
    return fixed;
  }
}
