import { z } from 'zod';
import type { Clock } from '../../shared/clock/clock.js';
import { IdFactory } from '../../shared/ids/ids.js';
import type { Dataset, StopListItem } from '../dataset/loader.js';
import { FaultEngine } from '../faults/faults.js';
import { loadScenarios, type ScenarioDefinition } from '../scenarios/scenarios.js';

export const WireOrderStatus = z.enum(['Unconfirmed', 'WaitCooking', 'ReadyForCooking', 'CookingStarted', 'CookingCompleted', 'Waiting', 'OnWay', 'Delivered', 'Closed', 'Cancelled']);
export type WireOrderStatus = z.infer<typeof WireOrderStatus>;
export type NormalizedOrderStatus = 'created' | 'accepted' | 'cooking' | 'ready' | 'completed' | 'cancelled';

export interface AuthToken {
  token: string;
  expiresAt: number;
  mode: 'legacy' | 'current';
}

export interface SimOrderItem {
  productId: string;
  amount: number;
  price: number;
  modifiers: Array<{ productId: string; amount: number; price: number }>;
}

export interface SimOrder {
  id: string;
  externalNumber: string | null;
  sourceKey: string | null;
  organizationId: string;
  terminalGroupId: string | null;
  orderTypeId: string | null;
  phone: string;
  customerName: string | null;
  items: SimOrderItem[];
  sum: number;
  paymentTypeId: string | null;
  paymentKind: string | null;
  createdAt: string;
  timestamp: number;
  status: WireOrderStatus;
  creationStatus: 'Success' | 'InProgress' | 'Error';
  history: Array<{ status: WireOrderStatus; at: string }>;
  acceptedAt: number | null;
  cookingStartedAt: number | null;
  cookingCompletedAt: number | null;
  closedAt: number | null;
  cancelledAt: number | null;
}

export interface CommandState {
  correlationId: string;
  organizationId: string;
  state: 'InProgress' | 'Success' | 'Error';
  orderId: string | null;
}

export class SimulatorState {
  readonly ids: IdFactory;
  readonly faults = new FaultEngine();
  readonly scenarios = loadScenarios();
  readonly tokens = new Map<string, AuthToken>();
  readonly orders = new Map<string, SimOrder>();
  readonly commands = new Map<string, CommandState>();
  private readonly initialStopList: StopListItem[];
  private stopItems: StopListItem[];
  private scenario: ScenarioDefinition;
  private scenarioName = 'happy';
  private rateWindowStartedAt = 0;
  private rateWindowCount = 0;

  public constructor(readonly dataset: Dataset, readonly clock: Clock, deterministicIds: boolean) {
    this.ids = new IdFactory(deterministicIds);
    this.initialStopList = dataset.stopList.items.map((item) => ({ ...item }));
    this.stopItems = this.initialStopList.map((item) => ({ ...item }));
    this.scenario = this.scenarios.happy as ScenarioDefinition;
  }

  get currentScenario(): string { return this.scenarioName; }
  get currentScenarioDefinition(): ScenarioDefinition { return this.scenario; }
  get stopList(): StopListItem[] { return this.stopItems.map((item) => ({ ...item })); }

  reset(): void {
    this.ids.reset();
    this.tokens.clear();
    this.orders.clear();
    this.commands.clear();
    this.faults.clear();
    this.stopItems = this.initialStopList.map((item) => ({ ...item }));
    this.rateWindowStartedAt = 0;
    this.rateWindowCount = 0;
    this.applyScenario('happy');
  }

  applyScenario(name: string): void {
    const definition = this.scenarios[name];
    if (!definition) throw new Error(`Unknown scenario: ${name}`);
    this.scenarioName = name;
    this.scenario = definition;
    this.stopItems = this.initialStopList.map((item) => ({ ...item }));
    if (definition.stopAllProducts) {
      this.stopItems = this.dataset.products.filter((product) => !product.isDeleted && !product.isHidden).map((product) => this.makeStopItem(product.id, 0));
    } else if (definition.stopProductId) {
      this.stopItems.push(this.makeStopItem(definition.stopProductId, 0));
    }
  }

  setStop(productId: string, balance = 0): StopListItem {
    const existing = this.stopItems.find((item) => item.productId === productId);
    const item = existing ?? this.makeStopItem(productId, balance);
    item.balance = balance;
    if (!existing) this.stopItems.push(item);
    return { ...item };
  }

  clearStop(productId: string): void {
    this.stopItems = this.stopItems.filter((item) => item.productId !== productId);
  }

  terminalAlive(terminalGroupId: string): boolean {
    return this.scenario.terminalAlive && this.dataset.terminalGroups.some((terminal) => terminal.id === terminalGroupId && !terminal.isDisabled);
  }

  organizationEnabled(organizationId: string): boolean {
    return this.scenario.organizationEnabled && this.dataset.organization.id === organizationId && !this.dataset.organization.isDisabled;
  }

  isRateLimited(requests = 60, windowMs = 60_000): boolean {
    const now = this.clock.nowMs();
    if (now - this.rateWindowStartedAt >= windowMs) {
      this.rateWindowStartedAt = now;
      this.rateWindowCount = 0;
    }
    this.rateWindowCount += 1;
    return this.rateWindowCount > requests;
  }

  transitionOrder(orderId: string, requested: NormalizedOrderStatus): SimOrder {
    const order = this.orders.get(orderId);
    if (!order) throw new Error('Order not found');
    const target = normalizedToWire(requested);
    const allowed: Record<WireOrderStatus, WireOrderStatus[]> = {
      Unconfirmed: ['WaitCooking', 'Cancelled'],
      WaitCooking: ['CookingStarted', 'Cancelled'],
      ReadyForCooking: ['CookingStarted', 'Cancelled'],
      CookingStarted: ['CookingCompleted', 'Cancelled'],
      CookingCompleted: ['Closed', 'Cancelled'],
      Waiting: ['Closed', 'Cancelled'],
      OnWay: ['Delivered', 'Cancelled'],
      Delivered: ['Closed', 'Cancelled'],
      Closed: [],
      Cancelled: []
    };
    if (order.status !== target && !allowed[order.status].includes(target)) throw new Error(`Invalid order transition ${order.status} -> ${target}`);
    if (order.status !== target) {
      const transitionAt = this.clock.nowMs();
      order.status = target;
      order.history.push({ status: target, at: new Date(transitionAt).toISOString() });
      if (target === 'WaitCooking') order.acceptedAt = transitionAt;
      if (target === 'CookingStarted') order.cookingStartedAt = transitionAt;
      if (target === 'CookingCompleted') order.cookingCompletedAt = transitionAt;
      if (target === 'Closed') order.closedAt = transitionAt;
      if (target === 'Cancelled') order.cancelledAt = transitionAt;
    }
    return order;
  }

  private makeStopItem(productId: string, balance: number): StopListItem {
    return { productId, balance, sizeId: null, sku: null, dateAdd: this.clock.now().toISOString().replace('T', ' ').replace('Z', '') };
  }
}

function normalizedToWire(status: NormalizedOrderStatus): WireOrderStatus {
  switch (status) {
    case 'created': return 'Unconfirmed';
    case 'accepted': return 'WaitCooking';
    case 'cooking': return 'CookingStarted';
    case 'ready': return 'CookingCompleted';
    case 'completed': return 'Closed';
    case 'cancelled': return 'Cancelled';
  }
}
