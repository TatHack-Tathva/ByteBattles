import { request, tokenStore, type Tokens } from "./api";

export interface Me {
  username: string;
  email: string;
  created_at: string;
  is_verified: boolean;
  user_type: "USER" | "ADMIN";
}

// The backend uses OAuth2PasswordRequestForm, so login is form-encoded, not JSON.
export async function login(username: string, password: string): Promise<Tokens> {
  const tokens = await request<Tokens>("/auth/login", { method: "POST", body: new URLSearchParams({ username, password }) });
  tokenStore.set(tokens);
  return tokens;
}

export const register = (username: string, email: string, password: string, conf_password: string) =>
  request<{ username: string }>("/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, email, password, conf_password }),
  });

export const bootstrapAdmin = (launch_code: string) =>
  request<{ detail: string }>(`/auth/bootstrap-admin?launch_code=${encodeURIComponent(launch_code)}`, { method: "POST" });

export const fetchMe = () => request<Me>("/users/me");
export const logout = () => tokenStore.clear();
