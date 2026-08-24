import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

const Uuid = z.string().uuid();
const ProductSchema = z.object({
  id: Uuid, categoryId: Uuid, name: z.string(), description: z.string(), price: z.number(), weight: z.number(), measureUnit: z.string(),
  available: z.boolean(), isDeleted: z.boolean(), isHidden: z.boolean(), simulationOnly: z.literal(true), modifierGroupIds: z.array(Uuid)
});
const ModifierSchema = z.object({ id: Uuid, groupId: Uuid, name: z.string(), price: z.number(), available: z.boolean(), simulationOnly: z.literal(true) });
const OrganizationSchema = z.object({
  id: Uuid, name: z.string(), code: z.string(), address: z.string(), city: z.string(), country: z.string(), currencyIsoName: z.string(), timeZone: z.string(),
  workingHours: z.object({ from: z.string(), to: z.string(), days: z.array(z.number()) }), isDisabled: z.boolean(), isCloud: z.boolean(), simulationOnly: z.literal(true)
});
const TerminalSchema = z.object({ id: Uuid, organizationId: Uuid, name: z.string(), address: z.string(), timeZone: z.string(), posVersion: z.string(), isAlive: z.boolean(), isDisabled: z.boolean(), simulationOnly: z.literal(true) });
const OrderTypeSchema = z.object({ id: Uuid, organizationId: Uuid, name: z.string(), orderServiceType: z.enum(['Common', 'DeliveryByCourier', 'DeliveryPickUp']), isDeleted: z.boolean(), isDefault: z.boolean(), externalRevision: z.number(), simulationOnly: z.literal(true) });
const PaymentTypeSchema = z.object({ id: Uuid, organizationId: Uuid, code: z.string(), name: z.string(), comment: z.string(), combinable: z.boolean(), externalRevision: z.number(), applicableMarketingCampaigns: z.array(Uuid), isDeleted: z.boolean(), printCheque: z.boolean(), paymentProcessingType: z.enum(['External', 'Internal', 'Both']), paymentTypeKind: z.enum(['Unknown', 'Cash', 'Card', 'Credit', 'Writeoff', 'Voucher', 'External', 'IikoCard']), simulationOnly: z.literal(true) });
const StopListSchema = z.object({ organizationId: Uuid, terminalGroupId: Uuid, items: z.array(z.object({ productId: Uuid, sizeId: Uuid.nullable(), balance: z.number(), sku: z.string().nullable(), dateAdd: z.string().nullable() })) });
const CategorySchema = z.object({ id: Uuid, name: z.string(), isDeleted: z.boolean(), simulationOnly: z.literal(true) });
const MenuSchema = z.object({ externalMenuId: z.string(), name: z.string(), priceCategoryId: z.string(), revision: z.number(), version: z.number(), simulationOnly: z.literal(true) });

export type Product = z.infer<typeof ProductSchema>;
export type Modifier = z.infer<typeof ModifierSchema>;
export type Organization = z.infer<typeof OrganizationSchema>;
export type TerminalGroup = z.infer<typeof TerminalSchema>;
export type OrderType = z.infer<typeof OrderTypeSchema>;
export type PaymentType = z.infer<typeof PaymentTypeSchema>;
export type StopListItem = z.infer<typeof StopListSchema>['items'][number];
export type Category = z.infer<typeof CategorySchema>;
export type MenuConfig = z.infer<typeof MenuSchema>;

export interface Dataset {
  organization: Organization;
  terminalGroups: TerminalGroup[];
  orderTypes: OrderType[];
  paymentTypes: PaymentType[];
  products: Product[];
  modifiers: Modifier[];
  categories: Category[];
  stopList: z.infer<typeof StopListSchema>;
  menu: MenuConfig;
}

function readJson(name: string): unknown {
  return JSON.parse(readFileSync(resolve(process.cwd(), 'datasets/vse-pro-zhar', name), 'utf8')) as unknown;
}

export function loadDataset(): Dataset {
  return {
    organization: OrganizationSchema.parse(readJson('organization.json')),
    terminalGroups: z.array(TerminalSchema).parse(readJson('terminal-groups.json')),
    orderTypes: z.array(OrderTypeSchema).parse(readJson('order-types.json')),
    paymentTypes: z.array(PaymentTypeSchema).parse(readJson('payment-types.json')),
    products: z.array(ProductSchema).parse(readJson('products.json')),
    modifiers: z.array(ModifierSchema).parse(readJson('modifiers.json')),
    categories: z.array(CategorySchema).parse(readJson('categories.json')),
    stopList: StopListSchema.parse(readJson('stop-lists.json')),
    menu: MenuSchema.parse(readJson('menu.json'))
  };
}
