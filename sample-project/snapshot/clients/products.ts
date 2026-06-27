import type {
  CreateProductsRequest,
  CreateProductsResponse,
  GetProductsResponse,
  ListProductsRequest,
  ListProductsResponse,
  RemoveProductsRequest,
  UpdateProductsRequest,
} from "./types.js";

import { BaseApiClient } from "./base.js";

export class ProductsClient extends BaseApiClient {
  async Create(params: CreateProductsRequest, options?: RequestInit): Promise<CreateProductsResponse> {
    return this.request<CreateProductsResponse>(`/api/v1/products`, {
      method: "POST",
      body: JSON.stringify(params),
      ...options,
    });
  }

  async List(params: ListProductsRequest, options?: RequestInit): Promise<ListProductsResponse> {
    const query = Object.entries(params)
      .filter(([k]) => ["page","limit","category"].includes(k))
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join("&");
    const url = query ? `/api/v1/products?${query}` : `/api/v1/products`;
    return this.request<ListProductsResponse>(url, { method: "GET", ...options });
  }

  async Get(params: { id: string }, options?: RequestInit): Promise<GetProductsResponse> {
    const url = `/api/v1/products/${params.id}`;
    return this.request<GetProductsResponse>(url, { method: "GET", ...options });
  }

  async Update(params: UpdateProductsRequest, options?: RequestInit): Promise<void> {
    return this.request<void>(`/api/v1/products/${params.id}`, {
      method: "PUT",
      body: JSON.stringify(params),
      ...options,
    });
  }

  async Remove(params: RemoveProductsRequest, options?: RequestInit): Promise<void> {
    const query = Object.entries(params)
      .filter(([k]) => ["reason"].includes(k))
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join("&");
    const url = query ? `/api/v1/products/${params.id}?${query}` : `/api/v1/products/${params.id}`;
    return this.request<void>(url, { method: "DELETE", ...options });
  }

}
