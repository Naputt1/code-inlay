import type {
  LoginAuthRequest,
  LoginAuthResponse,
  RegisterAuthRequest,
  RegisterAuthResponse,
  StreamAuthEventsEvent,
} from "./types.js";

import { BaseApiClient } from "./base.js";

export class AuthClient extends BaseApiClient {
  async Login(params: LoginAuthRequest, options?: RequestInit): Promise<LoginAuthResponse> {
    return this.request<LoginAuthResponse>(`/api/v1/auth/login`, {
      method: "POST",
      body: JSON.stringify(params),
      ...options,
    });
  }

  async Logout(options?: RequestInit): Promise<void> {
    const url = `/api/v1/auth/logout`;
    return this.request<void>(url, { method: "POST", ...options });
  }

  async Register(
    params: RegisterAuthRequest,
    options?: RequestInit,
  ): Promise<RegisterAuthResponse> {
    return this.request<RegisterAuthResponse>(`/api/v1/auth/register`, {
      method: "POST",
      body: JSON.stringify(params),
      ...options,
    });
  }

  StreamAuthEvents(
    onEvent: (event: StreamAuthEventsEvent) => void,
    options?: { reconnect?: boolean },
  ): EventSource {
    const es = new EventSource(`${this.baseUrl}/api/v1/auth/events`);
    es.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data) as StreamAuthEventsEvent;
        onEvent(data);
      } catch {
        /* ignore parse errors */
      }
    };
    return es;
  }
}
