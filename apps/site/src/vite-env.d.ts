/// <reference types="vite/client" />
interface ImportMetaEnv {
  /** Where the Ask Paul API is deployed. Defaults to http://localhost:8787. */
  readonly VITE_API_URL?: string;
  readonly VITE_PORTFOLIO_URL?: string;
  readonly VITE_SOURCE_URL?: string;
}
