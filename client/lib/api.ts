const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const TOKEN_KEY = "lab_attendance_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api<T = unknown>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  const text = await res.text();

  // Parse defensively: an error response may not be JSON (e.g. a proxy/HTML
  // 404 or 500). Crashing here with a SyntaxError would mask the real HTTP
  // error and surface as a generic failure, so fall back to the raw text.
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }

  if (!res.ok) {
    const fromJson =
      body && typeof body === "object" && "error" in body
        ? String((body as { error: unknown }).error)
        : null;
    const msg = fromJson || (body === null && text) || `Request failed (${res.status})`;
    throw new ApiError(res.status, msg);
  }
  return body as T;
}
