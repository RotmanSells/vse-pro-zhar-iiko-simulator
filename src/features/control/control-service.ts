import { z } from 'zod';
import { SimulatorHttpError } from '../../shared/errors/errors.js';
import type { SimulatorState, NormalizedOrderStatus } from '../../simulator/state/state.js';

const ScenarioRequest = z.object({ name: z.string().min(1) });
const StopRequest = z.object({ productId: z.string().uuid(), balance: z.number().default(0) });
const OrderStatusRequest = z.object({ orderId: z.string().uuid(), status: z.enum(['created', 'accepted', 'cooking', 'ready', 'completed', 'cancelled']) });

export class ControlService {
  public constructor(private readonly state: SimulatorState) {}

  reset(): Record<string, unknown> {
    this.state.reset();
    return this.status();
  }

  scenario(body: unknown): Record<string, unknown> {
    const request = ScenarioRequest.parse(body);
    this.state.applyScenario(request.name);
    return this.status();
  }

  stop(body: unknown): Record<string, unknown> {
    const request = StopRequest.parse(body);
    if (!this.state.dataset.products.some((product) => product.id === request.productId) && !this.state.dataset.modifiers.some((modifier) => modifier.id === request.productId)) throw new SimulatorHttpError(404, 'Product is not in the dataset', 'ProductNotFound');
    return { stopped: this.state.setStop(request.productId, request.balance) };
  }

  unstop(body: unknown): Record<string, unknown> {
    const request = z.object({ productId: z.string().uuid() }).parse(body);
    this.state.clearStop(request.productId);
    return { productId: request.productId, stopped: false };
  }

  orderStatus(body: unknown): Record<string, unknown> {
    const request = OrderStatusRequest.parse(body);
    const order = this.state.transitionOrder(request.orderId, request.status as NormalizedOrderStatus);
    return { orderId: order.id, status: order.status, history: order.history };
  }

  status(): Record<string, unknown> {
    return {
      scenario: this.state.currentScenario,
      organizationId: this.state.dataset.organization.id,
      terminalAlive: this.state.currentScenarioDefinition.terminalAlive,
      organizationEnabled: this.state.currentScenarioDefinition.organizationEnabled,
      stoppedProducts: this.state.stopList,
      orders: [...this.state.orders.values()].map((order) => ({ id: order.id, status: order.status, creationStatus: order.creationStatus })),
      faults: this.state.faults.list()
    };
  }
}
