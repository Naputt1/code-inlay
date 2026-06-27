import type {
  AdminListAllOrdersRequest,
  AdminListAllOrdersResponse,
  CancelOrdersRequest,
  CreateOrdersRequest,
  CreateOrdersResponse,
  GetOrdersResponse,
  ListOrdersRequest,
  ListOrdersResponse,
} from "./types.js";

import { BaseApiClient } from "./base.js";

export class OrdersClient extends BaseApiClient {
  async Create(params: CreateOrdersRequest, options?: RequestInit): Promise<CreateOrdersResponse> {
    return this.request<CreateOrdersResponse>(`/api/v1/orders`, {
      method: "POST",
      body: JSON.stringify(params),
      ...options,
    });
  }

  async List(params: ListOrdersRequest, options?: RequestInit): Promise<ListOrdersResponse> {
    const query = Object.entries(params)
      .filter(([k]) => ["page","pageSize","status"].includes(k))
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join("&");
    const url = query ? `/api/v1/orders?${query}` : `/api/v1/orders`;
    return this.request<ListOrdersResponse>(url, { method: "GET", ...options });
  }

  async Get(params: { id: string }, options?: RequestInit): Promise<GetOrdersResponse> {
    const url = `/api/v1/orders/${params.id}`;
    return this.request<GetOrdersResponse>(url, { method: "GET", ...options });
  }

  async Cancel(params: CancelOrdersRequest, options?: RequestInit): Promise<void> {
    return this.request<void>(`/api/v1/orders/${params.id}/cancel`, {
      method: "POST",
      body: JSON.stringify(params),
      ...options,
    });
  }

  async AdminListAll(params: AdminListAllOrdersRequest, options?: RequestInit): Promise<AdminListAllOrdersResponse> {
    const query = Object.entries(params)
      .filter(([k]) => ["page","pageSize"].includes(k))
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join("&");
    const url = query ? `/api/v1/orders/admin/all?${query}` : `/api/v1/orders/admin/all`;
    return this.request<AdminListAllOrdersResponse>(url, { method: "GET", ...options });
  }

}
