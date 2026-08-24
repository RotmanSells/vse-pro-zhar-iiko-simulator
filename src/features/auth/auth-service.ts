import type { IncomingHttpHeaders } from 'node:http';
import type { Config } from '../../app/config.js';
import { SimulatorHttpError, type ErrorCode } from '../../shared/errors/errors.js';
import type { UpstreamValidator } from '../../shared/validation/upstream.js';
import type { SimulatorState, AuthToken } from '../../simulator/state/state.js';

export class AuthService {
  public constructor(private readonly state: SimulatorState, private readonly config: Config, private readonly validator: UpstreamValidator) {}

  accessToken(mode: 'legacy' | 'current', body: unknown): Record<string, unknown> {
    const path = mode === 'legacy' ? '/api/1/access_token' : '/api/v2/access_token';
    this.validator.request(path, body);
    const valid = mode === 'legacy'
      ? this.isLegacyCredentials(body)
      : this.isCurrentCredentials(body);
    if (!valid) throw new SimulatorHttpError(401, 'Invalid credentials', null);
    const correlationId = this.state.ids.next('correlation');
    const token = this.state.ids.next('access-token');
    const record: AuthToken = { token, expiresAt: this.state.clock.nowMs() + this.config.tokenTtlMs, mode };
    this.state.tokens.set(token, record);
    const response = { correlationId, token };
    this.validator.response(path, response);
    return response;
  }

  requireAuth(headers: IncomingHttpHeaders): AuthToken {
    const authorization = headers.authorization;
    const correlationId = this.state.ids.next('correlation');
    if (!authorization || !authorization.startsWith('Bearer ') || authorization.length <= 7) {
      throw new SimulatorHttpError(401, 'Authorization header is missing or malformed', null);
    }
    const token = authorization.slice(7);
    const record = this.state.tokens.get(token);
    if (!record || record.expiresAt <= this.state.clock.nowMs() || this.state.currentScenario === 'expired-token' || this.state.currentScenario === 'invalid-token') {
      throw new SimulatorHttpError(401, 'Invalid or expired token', null);
    }
    void correlationId;
    return record;
  }

  isLegacyCredentials(body: unknown): boolean {
    return typeof body === 'object' && body !== null && 'apiLogin' in body && body.apiLogin === this.config.legacyApiLogin;
  }

  isCurrentCredentials(body: unknown): boolean {
    return typeof body === 'object' && body !== null && 'apiKey' in body && 'appId' in body && 'clientSecret' in body
      && body.apiKey === this.config.v2ApiKey && body.appId === this.config.v2AppId && body.clientSecret === this.config.v2ClientSecret;
  }

  errorCodeForStatus(status: number): ErrorCode | null {
    return status === 401 ? null : 'Common';
  }
}
