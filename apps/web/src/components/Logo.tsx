import { Landmark } from "lucide-react";

/**
 * IntroBuddy logomark -- the institution (Landmark) icon in the brand
 * maroon (text-brand, #6B2545), with no background badge. Shared across
 * the sidebar (all roles) and the login page so the mark stays consistent.
 */
export function Logo({ className = "h-9 w-9" }: { className?: string }) {
  return <Landmark className={`shrink-0 text-brand ${className}`} strokeWidth={2} role="img" aria-label="IntroBuddy" />;
}
