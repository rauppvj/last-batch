import { getWallets } from '@wallet-standard/app';
import { createClient } from '@solana/kit';
import { solanaRpc } from '@solana/kit-plugin-rpc';
import { walletSigner } from '@solana/kit-plugin-wallet';

import { RPC_URL, WS_URL } from './config';

/**
 * Wallet Standard names a custom SVM cluster after its genesis hash, so a wallet
 * that knows Cookie Chain advertises this chain. Wallets that only know the
 * Solana clusters advertise `solana:mainnet` instead — both can sign here,
 * because the wallet only signs and this app sends to the Cookie Chain RPC.
 */
const COOKIE_CHAIN = 'solana:9wDaBRDgArEUpvhHxGguNkwozsZh4UpG';
const FALLBACK_CHAIN = 'solana:mainnet';

type Chain = Parameters<typeof walletSigner>[0]['chain'];

function build(chain: Chain) {
    return createClient()
        .use(walletSigner({ chain }))
        .use(solanaRpc({ rpcUrl: RPC_URL, rpcSubscriptionsUrl: WS_URL }));
}

export type AppClient = ReturnType<typeof build>;

/** Assigned by `startClient()` before the app renders. */
export let client: AppClient;

/** Wallets found in the browser, whatever chains they advertise. */
export type Detected = { name: string; chains: readonly string[] };
export let detected: Detected[] = [];

/** The chain the client was built for. */
export let chain: Chain = FALLBACK_CHAIN;

function readRegistry(): Detected[] {
    return getWallets()
        .get()
        .map(w => ({ name: w.name, chains: w.chains }));
}

function pickChain(wallets: Detected[]): Chain {
    const chains = new Set(wallets.flatMap(w => w.chains));
    if (chains.has(COOKIE_CHAIN)) return COOKIE_CHAIN;
    if (chains.has(FALLBACK_CHAIN)) return FALLBACK_CHAIN;
    const anySolana = [...chains].find(c => c.startsWith('solana:')) as Chain | undefined;
    return anySolana ?? FALLBACK_CHAIN;
}

/**
 * Wallet extensions register themselves as the page loads, so wait briefly for
 * them before choosing the chain the client will ask for.
 */
export async function startClient(): Promise<void> {
    const registry = getWallets();
    await new Promise<void>(resolve => {
        if (registry.get().length > 0) return resolve();
        const stop = registry.on('register', () => {
            clearTimeout(timer);
            stop();
            // Give siblings registering in the same tick a chance to land.
            setTimeout(resolve, 50);
        });
        const timer = setTimeout(() => {
            stop();
            resolve();
        }, 600);
    });

    detected = readRegistry();
    chain = pickChain(detected);
    client = build(chain);
}

/** Wallets that exist in the browser but cannot sign for the chosen chain. */
export function unusableWallets(): Detected[] {
    return readRegistry().filter(w => !w.chains.includes(chain));
}
