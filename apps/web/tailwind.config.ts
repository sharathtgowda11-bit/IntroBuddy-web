import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

// Every color is a CSS custom property (defined in src/index.css) so both
// shadcn/ui's own components and our own custom ones read from the exact
// same palette -- confirmed with the user: brand (plum) and primary
// button (dark slate) are deliberately different tokens, so no red-family
// hue ever appears as an interactive affordance.
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // Brand-specific tokens beyond shadcn's default set.
        brand: "hsl(var(--brand))",
        "brand-accent": "hsl(var(--brand-accent))",
        success: "hsl(var(--success))",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        marquee: { to: { transform: "translateX(-50%)" } },
      },
      animation: {
        // The track renders its item list twice back-to-back, so a 50%
        // translate is exactly one full loop with no visible seam.
        marquee: "marquee 28s linear infinite",
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;
