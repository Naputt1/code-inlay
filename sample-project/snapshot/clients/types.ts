export interface LoginAuthBody {
  email: string;
  password: string;
}

export interface LoginAuthRequest {
  email: string;
  password: string;
}

export interface LoginAuthResponse {
  status: boolean;
  data: {
    token: string;
    user: {
      id: string;
      name: string;
      email: string;
      roles: string[];
    };
  };
}

export interface LogoutAuthResponse {
  status: boolean;
  data: unknown;
}

export interface RegisterAuthBody {
  name: string;
  email: string;
  password: string;
  referralCode?: string | undefined;
}

export interface RegisterAuthRequest {
  name: string;
  email: string;
  password: string;
  referralCode?: string | undefined;
}

export interface RegisterAuthResponse {
  status: boolean;
  data: {
    id: string;
    name: string;
    email: string;
    createdAt: string;
  };
}

export interface AdminListAllOrdersQuery {
  page?: unknown | undefined;
  pageSize?: unknown | undefined;
}

export interface AdminListAllOrdersRequest {
  page?: unknown | undefined;
  pageSize?: unknown | undefined;
}

export interface AdminListAllOrdersResponse {
  success: boolean;
  result: {
    id: string;
    totalPrice: number;
    status: string;
    userId: string;
  }[];
}

export interface CancelOrdersBody {
  reason?: string | undefined;
}

export interface CancelOrdersRequest {
  reason?: string | undefined;
}

export interface CancelOrdersResponse {
  status: boolean;
  data: unknown;
}

export interface CreateOrdersBody {
  productId: string;
  quantity: unknown;
  shippingAddress: {
    street: string;
    city: string;
    zipCode: string;
    country?: string | undefined;
  };
  notes?: string | undefined;
  couponCode?: string | undefined;
}

export interface CreateOrdersRequest {
  productId: string;
  quantity: unknown;
  shippingAddress: {
    street: string;
    city: string;
    zipCode: string;
    country?: string | undefined;
  };
  notes?: string | undefined;
  couponCode?: string | undefined;
}

export interface CreateOrdersResponse {
  success: boolean;
  result: {
    id: string;
    totalPrice: number;
    status: string;
    estimatedDelivery?: unknown | undefined;
  };
}

export interface GetOrdersResponse {
  success: boolean;
  result: {
    id: string;
    totalPrice: number;
    status: string;
    items: {
      productId: string;
      productName: string;
      quantity: unknown;
      unitPrice: number;
    }[];
    shippingAddress: {
      street: string;
      city: string;
      zipCode: string;
    };
    createdAt: string;
    updatedAt?: string | undefined;
  };
}

export interface ListOrdersQuery {
  page?: unknown | undefined;
  pageSize?: unknown | undefined;
  status?: string | undefined;
}

export interface ListOrdersRequest {
  page?: unknown | undefined;
  pageSize?: unknown | undefined;
  status?: string | undefined;
}

export interface ListOrdersResponse {
  success: boolean;
  result: {
    id: string;
    totalPrice: number;
    status: string;
    createdAt: string;
    itemCount: unknown;
  }[];
}

export interface CreateProductsBody {
  name: string;
  price: number;
  category: "electronics" | "clothing" | "food";
  tags?: string[] | undefined;
  active?: boolean | undefined;
  metadata?: {} | undefined;
}

export interface CreateProductsRequest {
  name: string;
  price: number;
  category: "electronics" | "clothing" | "food";
  tags?: string[] | undefined;
  active?: boolean | undefined;
  metadata?: {} | undefined;
}

export interface CreateProductsResponse {
  status: boolean;
  data: {
    id: string;
    name: string;
    price: number;
  };
}

export interface GetProductsResponse {
  status: boolean;
  data: {
    id: string;
    name: string;
    price: number;
    category: string;
    tags?: string[] | undefined;
    description?: string | undefined;
    ratings?:
      | {
          userId: string;
          score: unknown;
          comment?: string | undefined;
        }[]
      | undefined;
  };
}

export interface ListProductsQuery {
  page?: unknown | undefined;
  limit?: unknown | undefined;
  category?: string | undefined;
}

export interface ListProductsRequest {
  page?: unknown | undefined;
  limit?: unknown | undefined;
  category?: string | undefined;
}

export interface ListProductsResponse {
  status: boolean;
  data: {
    id: string;
    name: string;
    price: number;
    category: string;
  }[];
}

export interface RemoveProductsQuery {
  reason?: string | undefined;
}

export interface RemoveProductsRequest {
  reason?: string | undefined;
}

export interface RemoveProductsResponse {
  status: boolean;
  data: unknown;
}

export interface UpdateProductsBody {
  name?: string | undefined;
  price?: number | undefined;
  category?: "electronics" | "clothing" | "food" | undefined;
  tags?: string[] | undefined;
  active?: boolean | undefined;
  metadata?: {} | undefined;
}

export interface UpdateProductsRequest {
  name?: string | undefined;
  price?: number | undefined;
  category?: "electronics" | "clothing" | "food" | undefined;
  tags?: string[] | undefined;
  active?: boolean | undefined;
  metadata?: {} | undefined;
}

export interface UpdateProductsResponse {
  status: boolean;
  data: unknown;
}
