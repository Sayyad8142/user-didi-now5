import { normalizePhone } from "@/features/profile/ensureProfile";

export function isAdminPhone(phone?: string | null): boolean {
  const env = import.meta.env.VITE_ADMIN_PHONES ?? "";
  const target = normalizePhone(phone ?? "");
  if (!target) return false;
  const list = env.split(",").map(s => normalizePhone(s.trim())).filter(Boolean);
  return list.includes(target);
}