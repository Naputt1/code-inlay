import type {
  LoginAuthRequest,
  LoginAuthResponse,
  RegisterAuthRequest,
  RegisterAuthResponse,
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

  async Register(params: RegisterAuthRequest, options?: RequestInit): Promise<RegisterAuthResponse> {
    return this.request<RegisterAuthResponse>(`/api/v1/auth/register`, {
      method: "POST",
      body: JSON.stringify(params),
      ...options,
    });
  }

}
