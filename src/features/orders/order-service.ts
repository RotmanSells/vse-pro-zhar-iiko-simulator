import { z } from 'zod';
import type { UpstreamValidator } from '../../shared/validation/upstream.js';
import { SimulatorHttpError } from '../../shared/errors/errors.js';
import type { SimulatorState, SimOrder, WireOrderStatus, NormalizedOrderStatus } from '../../simulator/state/state.js';

const Uuid = z.string().uuid();
const CreateModifier = z.object({ productId: Uuid, amount: z.number(), price: z.number().nullable().optional(), productGroupId: Uuid.nullable().optional() }).passthrough();
const CreateItem = z.object({ type: z.string(), amount: z.number(), productId: Uuid, price: z.number(), modifiers: z.array(CreateModifier).nullable().optional(), comment: z.string().nullable().optional() }).passthrough();
const CreatePayment = z.object({ paymentTypeKind: z.string(), sum: z.number(), paymentTypeId: Uuid, isProcessedExternally: z.boolean().optional() }).passthrough();
const CreateOrder = z.object({
  id: Uuid.nullable().optional(), externalNumber: z.string().nullable().optional(), sourceKey: z.string().nullable().optional(), phone: z.string(), orderTypeId: Uuid.nullable().optional(), orderServiceType: z.enum(['DeliveryByCourier', 'DeliveryByClient']).nullable().optional(),
  customer: z.object({ type: z.string(), name: z.string().nullable().optional() }).passthrough().nullable().optional(), items: z.array(CreateItem), payments: z.array(CreatePayment).nullable().optional()
}).passthrough();
const CreateRequest = z.object({ organizationId: Uuid, terminalGroupId: Uuid.nullable().optional(), order: CreateOrder }).passthrough();
const OrdersByIdRequest = z.object({ organizationId: Uuid, orderIds: z.array(Uuid).nullable().optional(), posOrderIds: z.array(Uuid).nullable().optional(), sourceKeys: z.array(z.string()).nullable().optional() }).passthrough();

type CreateRequest = z.infer<typeof CreateRequest>;

export class OrderService {
  public constructor(private readonly state: SimulatorState, private readonly validator: UpstreamValidator) {}

  create(body: unknown): Record<string, unknown> {
    this.validator.request('/api/1/deliveries/create', body);
    const request = CreateRequest.parse(body);
    const correlationId = this.state.ids.next('correlation');
    const failure = this.validateBusinessInput(request);
    if (failure) {
      const response = { correlationId, orderInfo: { id: request.order.id ?? this.state.ids.next('rejected-order'), externalNumber: request.order.externalNumber ?? null, organizationId: request.organizationId, timestamp: this.state.clock.nowMs(), creationStatus: 'Error', errorInfo: { code: failure.code } } };
      this.validator.response('/api/1/deliveries/create', response);
      return response;
    }
    const orderId = request.order.id ?? this.state.ids.next('order');
    const timestamp = this.state.clock.nowMs();
    const items = request.order.items.map((item) => ({
      productId: item.productId,
      amount: item.amount,
      price: item.price,
      modifiers: (item.modifiers ?? []).map((modifier) => {
        const data = this.state.dataset.modifiers.find((candidate) => candidate.id === modifier.productId);
        return { productId: modifier.productId, amount: modifier.amount, price: modifier.price ?? data?.price ?? 0 };
      })
    }));
    const sum = items.reduce((total, item) => total + item.amount * item.price + item.modifiers.reduce((modifierTotal, modifier) => modifierTotal + modifier.amount * modifier.price, 0), 0);
    const creationStatus = this.state.currentScenarioDefinition.orderCreationStatus;
    const order: SimOrder = {
      id: orderId,
      externalNumber: request.order.externalNumber ?? null,
      sourceKey: request.order.sourceKey ?? null,
      organizationId: request.organizationId,
      terminalGroupId: request.terminalGroupId ?? this.state.dataset.terminalGroups[0]?.id ?? null,
      orderTypeId: request.order.orderTypeId ?? this.state.dataset.orderTypes[0]?.id ?? null,
      phone: request.order.phone,
      customerName: request.order.customer?.name ?? null,
      items,
      sum,
      paymentTypeId: request.order.payments?.[0]?.paymentTypeId ?? null,
      paymentKind: request.order.payments?.[0]?.paymentTypeKind ?? null,
      createdAt: this.formatTime(timestamp),
      timestamp,
      status: 'Unconfirmed',
      creationStatus,
      history: [{ status: 'Unconfirmed', at: new Date(timestamp).toISOString() }],
      acceptedAt: null,
      cookingStartedAt: null,
      cookingCompletedAt: null,
      closedAt: null,
      cancelledAt: null
    };
    this.state.orders.set(orderId, order);
    if (creationStatus === 'InProgress') this.state.commands.set(correlationId, { correlationId, organizationId: request.organizationId, state: 'InProgress', orderId });
    if (creationStatus === 'Error') this.state.commands.set(correlationId, { correlationId, organizationId: request.organizationId, state: 'Error', orderId });
    const response = { correlationId, orderInfo: this.orderInfo(order) };
    this.validator.response('/api/1/deliveries/create', response);
    return response;
  }

  byId(body: unknown): Record<string, unknown> {
    this.validator.request('/api/1/deliveries/by_id', body);
    const request = OrdersByIdRequest.parse(body);
    const ids = request.orderIds ?? [];
    if (!request.orderIds && !request.posOrderIds && !request.sourceKeys) throw new SimulatorHttpError(400, 'One order selector is required', 'Common');
    const orders = [...this.state.orders.values()].filter((order) => order.organizationId === request.organizationId && (ids.includes(order.id) || request.posOrderIds?.includes(order.id) || (order.sourceKey !== null && request.sourceKeys?.includes(order.sourceKey))));
    const response = { correlationId: this.state.ids.next('correlation'), orders: orders.map((order) => this.orderInfo(order)) };
    this.validator.response('/api/1/deliveries/by_id', response);
    return response;
  }

  setStatus(orderId: string, status: NormalizedOrderStatus): Record<string, unknown> {
    const order = this.state.transitionOrder(orderId, status);
    const response = { correlationId: this.state.ids.next('correlation'), orderInfo: this.orderInfo(order) };
    this.validator.response('/api/1/deliveries/create', response);
    return response;
  }

  private validateBusinessInput(request: CreateRequest): { code: 'OrganizationUnregistered' | 'TerminalGroupUnregistered' | 'TerminalGroupDisabled' | 'OrderTypeNotFound' | 'PaymentTypeNotFound' | 'ProductNotFound' | 'ProductSizeNotFound' | 'OrderItemsNotExists' | 'InvalidPhone' | 'DuplicatedOrderId' | 'Incorrect' } | null {
    if (!this.state.organizationEnabled(request.organizationId)) return { code: 'OrganizationUnregistered' };
    const terminalGroupId = request.terminalGroupId ?? this.state.dataset.terminalGroups[0]?.id;
    if (!terminalGroupId || !this.state.dataset.terminalGroups.some((terminal) => terminal.id === terminalGroupId && terminal.organizationId === request.organizationId)) return { code: 'TerminalGroupUnregistered' };
    if (!this.state.terminalAlive(terminalGroupId)) return { code: 'TerminalGroupDisabled' };
    if (!request.order.phone.startsWith('+') || request.order.phone.replace(/\D/g, '').length < 8) return { code: 'InvalidPhone' };
    if (request.order.orderTypeId && !this.state.dataset.orderTypes.some((type) => type.id === request.order.orderTypeId && type.orderServiceType === 'DeliveryPickUp')) return { code: 'OrderTypeNotFound' };
    if (request.order.orderServiceType && request.order.orderServiceType !== 'DeliveryByClient') return { code: 'Incorrect' };
    const payment = request.order.payments?.[0];
    if (!payment || payment.paymentTypeKind !== 'External' || !payment.isProcessedExternally || !this.state.dataset.paymentTypes.some((type) => type.id === payment.paymentTypeId && type.paymentTypeKind === 'External')) return { code: 'PaymentTypeNotFound' };
    if (request.order.items.length === 0) return { code: 'OrderItemsNotExists' };
    if (request.order.id && this.state.orders.has(request.order.id)) return { code: 'DuplicatedOrderId' };
    for (const item of request.order.items) {
      if (item.type !== 'Product') return { code: 'Incorrect' };
      const product = this.state.dataset.products.find((candidate) => candidate.id === item.productId && !candidate.isDeleted && !candidate.isHidden);
      if (!product || !product.available || this.state.stopList.some((stop) => stop.productId === item.productId && stop.balance <= 0)) return { code: 'ProductNotFound' };
      for (const modifier of item.modifiers ?? []) {
        const modifierData = this.state.dataset.modifiers.find((candidate) => candidate.id === modifier.productId);
        if (!modifierData || !modifierData.available || !product.modifierGroupIds.includes(modifierData.groupId) || this.state.stopList.some((stop) => stop.productId === modifier.productId && stop.balance <= 0)) return { code: 'ProductNotFound' };
      }
    }
    return this.state.currentScenarioDefinition.orderCreationStatus === 'Error' ? { code: 'Incorrect' } : null;
  }

  private orderInfo(order: SimOrder): Record<string, unknown> {
    const orderType = this.state.dataset.orderTypes.find((type) => type.id === order.orderTypeId);
    const paymentType = this.state.dataset.paymentTypes.find((type) => type.id === order.paymentTypeId);
    const productItems = order.items.map((item) => {
      const product = this.state.dataset.products.find((candidate) => candidate.id === item.productId);
      return {
        type: 'Product', status: this.itemStatus(order.status), amount: item.amount, comment: null, whenPrinted: null, size: null, comboInformation: null,
        product: { id: item.productId, name: product?.name ?? 'Unknown product' },
        modifiers: item.modifiers.map((modifier) => ({ product: { id: modifier.productId, name: this.state.dataset.modifiers.find((candidate) => candidate.id === modifier.productId)?.name ?? 'Unknown modifier' }, amount: modifier.amount, amountIndependentOfParentAmount: false, codes: null, productGroup: null, price: modifier.price, pricePredefined: true, resultSum: modifier.price * modifier.amount, deleted: null, positionId: null, defaultAmount: 0, hideIfDefaultAmount: false, taxPercent: null, freeOfChargeAmount: 0 })),
        codes: null, price: item.price, cost: item.price * item.amount, pricePredefined: true, positionId: null, taxPercent: null, resultSum: item.price * item.amount
      };
    });
    const wireOrder = {
      phone: order.phone, status: order.status, completeBefore: this.formatTime(order.timestamp + 30 * 60_000), whenCreated: order.createdAt, whenConfirmed: order.acceptedAt === null ? null : this.formatTime(order.acceptedAt), whenPrinted: null, whenCookingCompleted: order.cookingCompletedAt === null ? null : this.formatTime(order.cookingCompletedAt), whenSended: null, whenDelivered: null, comment: null, problem: { hasProblem: false }, operator: null, marketingSource: null, deliveryDuration: null, indexInCourierRoute: null, cookingStartTime: this.formatTime(order.cookingStartedAt ?? order.timestamp), isDeleted: false, whenReceivedByApi: order.createdAt, whenReceivedFromFront: null, movedFromDeliveryId: null, movedFromTerminalGroupId: null, movedFromOrganizationId: null, externalCourierService: null, movedToDeliveryId: null, movedToTerminalGroupId: null, movedToOrganizationId: null, menuId: null, deliveryZone: null, lockedAt: null, estimatedTime: null, isAsap: true, whenPacked: null, priceCategory: null, trackingLink: null, sum: order.sum, number: 1, sourceKey: order.sourceKey, whenBillPrinted: null, whenClosed: order.closedAt === null ? null : this.formatTime(order.closedAt), conception: null, guestsInfo: { count: 1, splitBetweenPersons: false }, items: productItems, combos: null,
      payments: paymentType ? [{ paymentType: { id: paymentType.id, name: paymentType.name, kind: 'External' }, sum: order.sum, isPreliminary: false, isExternal: true, isProcessedExternally: true, isFiscalizedExternally: false, isPrepay: true }] : [], tips: null, discounts: null, orderType: orderType ? { id: orderType.id, name: orderType.name, orderServiceType: 'DeliveryByClient' } : null, terminalGroupId: order.terminalGroupId, processedPaymentsSum: order.sum, loyaltyInfo: null, externalData: null,
      customer: { type: 'regular', id: '90000000-0000-4000-8000-000000000001', name: order.customerName ?? 'Demo customer', surname: null, comment: null, gender: null, inBlacklist: false, blacklistReason: null, birthdate: null }, deliveryPoint: null, phoneExtension: null, parentDeliveryId: null
    };
    return { id: order.id, posId: null, externalNumber: order.externalNumber, organizationId: order.organizationId, timestamp: order.timestamp, creationStatus: order.creationStatus, errorInfo: null, order: wireOrder };
  }

  private itemStatus(status: WireOrderStatus): string {
    if (status === 'CookingStarted') return 'CookingStarted';
    if (status === 'CookingCompleted' || status === 'Closed') return 'CookingCompleted';
    return 'Added';
  }

  private formatTime(timestamp: number): string {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(timestamp));
    const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${value.year}-${value.month}-${value.day} ${value.hour}:${value.minute}:${value.second}.000`;
  }
}
