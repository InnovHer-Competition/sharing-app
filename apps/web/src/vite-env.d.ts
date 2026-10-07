/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the API server, e.g. https://api.example.com */
  readonly VITE_API_URL?: string;
  /** Set to "false" to hide the demo account shortcuts on the sign-in page. */
  readonly VITE_SHOW_DEMO_ACCOUNTS?: string;
}
