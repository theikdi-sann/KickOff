export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "KO";
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function displayName(user: {
  email?: string | null;
  user_metadata?: Record<string, unknown>;
}): string {
  const fullName = user.user_metadata?.full_name;
  if (typeof fullName === "string" && fullName.trim().length > 0) return fullName.trim();
  return user.email ?? "Club staff";
}

