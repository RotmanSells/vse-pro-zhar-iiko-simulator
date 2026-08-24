import type { UpstreamValidator } from '../../shared/validation/upstream.js';
import { SimulatorHttpError } from '../../shared/errors/errors.js';
import type { SimulatorState } from '../../simulator/state/state.js';

export class CommandService {
  public constructor(private readonly state: SimulatorState, private readonly validator: UpstreamValidator) {}

  status(body: unknown): Record<string, unknown> {
    this.validator.request('/api/1/commands/status', body);
    const request = body as { organizationId: string; correlationId: string };
    const command = this.state.commands.get(request.correlationId);
    if (!command || command.organizationId !== request.organizationId) throw new SimulatorHttpError(410, 'Command is not available', 'Common');
    if (this.state.currentScenario === 'command-success') command.state = 'Success';
    if (this.state.currentScenario === 'command-failed') command.state = 'Error';
    const response = command.state === 'Error' ? { state: 'Error', exception: null, errorReason: 'Simulated command failure' } : { state: command.state };
    this.validator.response('/api/1/commands/status', response);
    return response;
  }
}
