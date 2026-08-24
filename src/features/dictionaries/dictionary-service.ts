import type { UpstreamValidator } from '../../shared/validation/upstream.js';
import { SimulatorHttpError } from '../../shared/errors/errors.js';
import type { SimulatorState } from '../../simulator/state/state.js';

export class DictionaryService {
  public constructor(private readonly state: SimulatorState, private readonly validator: UpstreamValidator) {}

  organizations(body: unknown): Record<string, unknown> {
    this.validator.request('/api/1/organizations', body);
    const request = body as { organizationIds?: string[] | null; returnAdditionalInfo?: boolean; includeDisabled?: boolean; returnExternalData?: string[] | null };
    const requested = request.organizationIds?.length ? request.organizationIds : [this.state.dataset.organization.id];
    if (requested.some((id) => id !== this.state.dataset.organization.id)) return this.organizationError();
    if (!request.includeDisabled && !this.state.organizationEnabled(this.state.dataset.organization.id)) {
      const response = { correlationId: this.state.ids.next('correlation'), organizations: [] };
      this.validator.response('/api/1/organizations', response);
      return response;
    }
    const organization = request.returnAdditionalInfo ? this.extendedOrganization() : this.simpleOrganization(request.returnExternalData);
    const response = { correlationId: this.state.ids.next('correlation'), organizations: [organization] };
    this.validator.response('/api/1/organizations', response);
    return response;
  }

  simpleOrganizations(): Record<string, unknown> {
    const response = { correlationId: this.state.ids.next('correlation'), organizations: [this.simpleOrganization(null)] };
    this.validator.response('/api/1/organizations', response, '200');
    return response;
  }

  terminalGroups(body: unknown): Record<string, unknown> {
    this.validator.request('/api/1/terminal_groups', body);
    const request = body as { organizationIds: string[]; includeDisabled?: boolean; returnExternalData?: string[] | null };
    if (request.organizationIds.some((id) => id !== this.state.dataset.organization.id)) return this.organizationError();
    const terminals = this.state.dataset.terminalGroups.filter((terminal) => request.includeDisabled || !terminal.isDisabled);
    const response = {
      correlationId: this.state.ids.next('correlation'),
      terminalGroups: [{ organizationId: this.state.dataset.organization.id, items: terminals.map((terminal) => this.terminalWire(terminal, request.returnExternalData)) }],
      terminalGroupsInSleep: []
    };
    this.validator.response('/api/1/terminal_groups', response);
    return response;
  }

  terminalGroupsAlive(body: unknown): Record<string, unknown> {
    this.validator.request('/api/1/terminal_groups/is_alive', body);
    const request = body as { organizationIds: string[]; terminalGroupIds: string[] };
    if (request.organizationIds.some((id) => id !== this.state.dataset.organization.id)) return this.organizationError();
    const response = {
      correlationId: this.state.ids.next('correlation'),
      isAliveStatus: request.terminalGroupIds.map((terminalGroupId) => ({
        isAlive: this.state.terminalAlive(terminalGroupId),
        terminalGroupId,
        organizationId: this.state.dataset.organization.id
      }))
    };
    this.validator.response('/api/1/terminal_groups/is_alive', response);
    return response;
  }

  orderTypes(body: unknown): Record<string, unknown> {
    this.validator.request('/api/1/deliveries/order_types', body);
    const request = body as { organizationIds: string[] };
    if (request.organizationIds.some((id) => id !== this.state.dataset.organization.id)) return this.organizationError();
    const response = {
      correlationId: this.state.ids.next('correlation'),
      orderTypes: [{ organizationId: this.state.dataset.organization.id, items: this.state.dataset.orderTypes.map(({ id, name, orderServiceType, isDeleted, externalRevision, isDefault }) => ({ id, name, orderServiceType, isDeleted, externalRevision, isDefault })) }]
    };
    this.validator.response('/api/1/deliveries/order_types', response);
    return response;
  }

  paymentTypes(body: unknown): Record<string, unknown> {
    this.validator.request('/api/1/payment_types', body);
    const request = body as { organizationIds: string[] };
    if (request.organizationIds.some((id) => id !== this.state.dataset.organization.id)) return this.organizationError();
    const terminalGroups = this.state.dataset.terminalGroups.map((terminal) => this.terminalWire(terminal, null));
    const response = {
      correlationId: this.state.ids.next('correlation'),
      paymentTypes: this.state.dataset.paymentTypes.map(({ id, code, name, comment, combinable, externalRevision, applicableMarketingCampaigns, isDeleted, printCheque, paymentProcessingType, paymentTypeKind }) => ({ id, code, name, comment, combinable, externalRevision, applicableMarketingCampaigns, isDeleted, printCheque, paymentProcessingType, paymentTypeKind, terminalGroups }))
    };
    this.validator.response('/api/1/payment_types', response);
    return response;
  }

  stopLists(body: unknown): Record<string, unknown> {
    this.validator.request('/api/1/stop_lists', body);
    const request = body as { organizationIds: string[]; terminalGroupsIds?: string[] | null };
    if (request.organizationIds.some((id) => id !== this.state.dataset.organization.id)) return this.organizationError();
    const terminalIds = request.terminalGroupsIds?.length ? request.terminalGroupsIds : this.state.dataset.terminalGroups.map((terminal) => terminal.id);
    const response = {
      correlationId: this.state.ids.next('correlation'),
      terminalGroupStopLists: [{ organizationId: this.state.dataset.organization.id, items: terminalIds.map((terminalGroupId) => ({ terminalGroupId, items: this.state.stopList })) }]
    };
    this.validator.response('/api/1/stop_lists', response);
    return response;
  }

  nomenclature(body: unknown): Record<string, unknown> {
    this.validator.request('/api/1/nomenclature', body);
    const request = body as { organizationId: string; startRevision?: number | null };
    if (request.organizationId !== this.state.dataset.organization.id) return this.organizationError();
    const unchanged = request.startRevision === 1;
    const response = {
      correlationId: this.state.ids.next('correlation'),
      groups: unchanged ? [] : this.state.dataset.categories.map((category, index) => ({ imageLinks: [], parentGroup: null, order: index, isIncludedInMenu: true, isGroupModifier: false, id: category.id, code: null, name: category.name, description: null, additionalInfo: null, tags: null, isDeleted: category.isDeleted, seoDescription: null, seoText: null, seoKeywords: null, seoTitle: null })),
      productCategories: unchanged ? [] : this.state.dataset.categories.map(({ id, name, isDeleted }) => ({ id, name, isDeleted })),
      products: unchanged ? [] : this.state.dataset.products.map((product, index) => ({
        id: product.id, name: product.name, description: product.description, additionalInfo: null, code: null, fatAmount: null, proteinsAmount: null, carbohydratesAmount: null, energyAmount: null,
        fatFullAmount: null, proteinsFullAmount: null, carbohydratesFullAmount: null, energyFullAmount: null, weight: product.weight, groupId: null, productCategoryId: product.categoryId, type: 'dish', orderItemType: 'Product', modifierSchemaId: null, modifierSchemaName: null,
        splittable: false, measureUnit: product.measureUnit, sizePrices: [{ sizeId: null, price: { currentPrice: product.price, isIncludedInMenu: !product.isHidden, nextIncludedInMenu: false, nextPrice: null, nextDatePrice: null } }], modifiers: [], groupModifiers: product.modifierGroupIds.map((id) => ({ id, minAmount: 0, maxAmount: 1, required: false, childModifiersHaveMinMaxRestrictions: false, childModifiers: this.state.dataset.modifiers.filter((modifier) => modifier.groupId === id).map((modifier) => ({ id: modifier.id, minAmount: 0, maxAmount: 1, required: false, defaultAmount: 0, hideIfDefaultAmount: false, splittable: false, freeOfChargeAmount: 0 })), hideIfDefaultAmount: false, defaultAmount: 0, splittable: false, freeOfChargeAmount: 0 })), imageLinks: [], doNotPrintInCheque: false, parentGroup: product.categoryId, order: index, fullNameEnglish: null, useBalanceForSell: false, canSetOpenPrice: false, paymentSubject: null, isDeleted: product.isDeleted, seoDescription: null, seoText: null, seoKeywords: null, seoTitle: null, tags: null
      })),
      sizes: [], revision: 1
    };
    this.validator.response('/api/1/nomenclature', response);
    return response;
  }

  menus(): Record<string, unknown> {
    const response = { correlationId: this.state.ids.next('correlation'), externalMenus: [{ id: this.state.dataset.menu.externalMenuId, name: this.state.dataset.menu.name }], priceCategories: [{ id: this.state.dataset.menu.priceCategoryId, name: 'Demo default price category' }] };
    this.validator.response('/api/2/menu', response);
    return response;
  }

  menuById(body: unknown): Record<string, unknown> {
    this.validator.request('/api/2/menu/by_id', body);
    const request = body as { externalMenuId: string; organizationIds: string[]; version?: number | null };
    if (request.externalMenuId !== this.state.dataset.menu.externalMenuId || request.organizationIds.some((id) => id !== this.state.dataset.organization.id)) return this.organizationError();
    const response = { id: 1, name: this.state.dataset.menu.name, description: null, buttonImageUrl: null, revision: 1, formatVersion: request.version ?? 2, intervals: [], productCategories: this.state.dataset.categories.map(({ id, name, isDeleted }) => ({ id, name, isDeleted })), customerTagGroups: [], itemCategories: [], comboCategories: [{ id: '80000000-0000-4000-8000-000000000001', name: null, combos: [] }] };
    this.validator.response('/api/2/menu/by_id', response);
    return response;
  }

  private simpleOrganization(returnExternalData: string[] | null | undefined): Record<string, unknown> {
    const externalData = returnExternalData?.map((key) => ({ key, value: `demo-${key}` })) ?? undefined;
    return { responseType: 'Simple', id: this.state.dataset.organization.id, name: this.state.dataset.organization.name, code: this.state.dataset.organization.code, ...(externalData ? { externalData } : {}) };
  }

  private extendedOrganization(): Record<string, unknown> {
    return { ...this.simpleOrganization(null), responseType: 'Extended', country: 'Russia', restaurantAddress: this.state.dataset.organization.address, latitude: 45.0448, longitude: 38.976, useUaeAddressingSystem: false, version: 'simulator-9.8.2.2', currencyIsoName: 'RUB', currencyMinimumDenomination: 0.01, countryPhoneCode: '+7', marketingSourceRequiredInDelivery: false, defaultDeliveryCityId: null, deliveryCityIds: [], deliveryServiceType: 'SelfServiceOnly', deliveryOrderPaymentSettings: null, defaultCallCenterPaymentTypeId: null, orderItemCommentEnabled: true, inn: null, addressFormatType: 'City', isConfirmationEnabled: false, confirmAllowedIntervalInMinutes: null, isCloud: true, isAnonymousGuestsAllowed: true, addressLookup: [] };
  }

  private terminalWire(terminal: { id: string; organizationId: string; name: string; address: string; timeZone: string; posVersion: string }, returnExternalData: string[] | null | undefined): Record<string, unknown> {
    const externalData = returnExternalData?.map((key) => ({ key, value: `demo-${key}` })) ?? undefined;
    return { id: terminal.id, organizationId: terminal.organizationId, name: terminal.name, address: terminal.address, timeZone: terminal.timeZone, posVersion: terminal.posVersion, ...(externalData ? { externalData } : {}) };
  }

  private organizationError(): never {
    throw new SimulatorHttpError(400, 'Organization is not available in simulator dataset', 'OrganizationUnregistered');
  }
}
