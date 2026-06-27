export class ApiError extends Error {
  constructor(public status: number, body: string) {
    super(`API error ${status}: ${body}`);
  }
}

export class BaseApiClient {
  constructor(protected baseUrl: string, protected headers?: Record<string, string>) {}

  protected async request<T>(path: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...this.headers, ...options?.headers },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new ApiError(res.status, body);
    }
    return res.json() as Promise<T>;
  }
}
