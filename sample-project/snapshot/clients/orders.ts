import type {
  AdminListAllOrdersOrdersRequest,
  AdminListAllOrdersOrdersResponse,
  CancelOrdersRequest,
  CreateOrdersRequest,
  CreateOrdersResponse,
  GetOrdersResponse,
  ListOrdersRequest,
  ListOrdersResponse,
  TrackOrderMessage,
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
      .filter(([k]) => ["page", "pageSize", "status"].includes(k))
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

  TrackOrder(onEvent: (event: TrackOrderEvent) => void): {
    send(msg: TrackOrderMessage): void;
    close(): void;
  } {
    const protocol = this.baseUrl.startsWith("https") ? "wss" : "ws";
    const url = `${protocol}://${this.baseUrl.replace(/^https?:\x2f\x2f/, "")}/api/v1/orders/track-ws`;
    const ws = new WebSocket(url);
    ws.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data) as TrackOrderEvent;
        onEvent(data);
      } catch {
        /* ignore parse errors */
      }
    };
    return {
      send(msg: TrackOrderMessage) {
        ws.send(JSON.stringify(msg));
      },
      close() {
        ws.close();
      },
    };
  }

  async AdminListAllOrders(
    params: AdminListAllOrdersOrdersRequest,
    options?: RequestInit,
  ): Promise<AdminListAllOrdersOrdersResponse> {
    const query = Object.entries(params)
      .filter(([k]) => ["page", "pageSize"].includes(k))
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join("&");
    const url = query ? `/api/v1/orders/admin/all?${query}` : `/api/v1/orders/admin/all`;
    return this.request<AdminListAllOrdersOrdersResponse>(url, { method: "GET", ...options });
  }
}
