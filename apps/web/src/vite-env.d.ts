/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Full API origin in production (e.g. https://api.introbuddy.com). Unset in dev -- requests stay relative and the Vite dev-server proxy forwards them. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
