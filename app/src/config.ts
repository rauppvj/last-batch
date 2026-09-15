export const RPC_URL = import.meta.env.VITE_RPC_URL ?? 'https://rpc.cookiescan.io';
// wss.cookiescan.io does not upgrade to a WebSocket; the RPC host serves both.
export const WS_URL = import.meta.env.VITE_WS_URL ?? 'wss://rpc.cookiescan.io';
export const EXPLORER = 'https://cookiescan.io';
export const BRIDGE_URL = 'https://hyperlane.cookiescan.io';
export const NIGHTLY_URL = 'https://nightly.app';
export const REPO_URL = import.meta.env.VITE_REPO_URL ?? 'https://github.com/rauppvj/last-batch';

export const LAMPORTS_PER_COOK = 1_000_000_000n;
export const SYSTEM_PROGRAM = '11111111111111111111111111111111';

export const txUrl = (signature: string) => `${EXPLORER}/tx/${signature}`;
export const addressUrl = (address: string) => `${EXPLORER}/address/${address}`;
