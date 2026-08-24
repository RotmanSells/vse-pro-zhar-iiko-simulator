export type ErrorCode =
  | 'Common'
  | 'OrganizationUnregistered'
  | 'OrganizationDisabled'
  | 'TerminalGroupDisabled'
  | 'TerminalGroupUnregistered'
  | 'ProductNotFound'
  | 'ProductSizeNotFound'
  | 'PaymentTypeNotFound'
  | 'OrderTypeNotFound'
  | 'DuplicatedOrderId'
  | 'InvalidPhone'
  | 'OrderItemsNotExists'
  | 'Incorrect'
  | 'InternalServerError'
  | 'UnknownError';

export class SimulatorHttpError extends Error {
  public constructor(
    public readonly status: number,
    message: string,
    public readonly code: ErrorCode | null = 'Common'
  ) {
    super(message);
    this.name = 'SimulatorHttpError';
  }
}

export function errorBody(correlationId: string, errorDescription: string, error: ErrorCode | null = 'Common'): Record<string, unknown> {
  return { correlationId, errorDescription, error };
}
