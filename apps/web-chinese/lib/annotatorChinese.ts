/**
 * 身份（与英文主控制台对齐，存 localStorage）
 */
const USER_ROLE_KEY = "synglyph_chinese_user_role";

export type UserRole = "default" | "admin";

export function getUserRole(): UserRole {
  if (typeof window === "undefined") return "default";
  const v = localStorage.getItem(USER_ROLE_KEY);
  return v === "admin" ? "admin" : "default";
}

export function setUserRole(role: UserRole): void {
  localStorage.setItem(USER_ROLE_KEY, role);
}

export function effectiveOwner(role: UserRole): string {
  return role === "admin" ? "admin" : "default";
}
