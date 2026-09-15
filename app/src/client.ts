import { createClient } from '@solana/kit';
import { solanaRpc } from '@solana/kit-plugin-rpc';
import { walletSigner } from '@solana/kit-plugin-wallet';

import { RPC_URL, WS_URL } from './config';

// Cookie Chain is an SVM chain that wallets reach through a custom RPC, so the
// wallet only signs. Planning, simulation, sending and confirmation all go
// through the Cookie Chain RPC below, never through the wallet's own network.
export const client = createClient()
    .use(walletSigner({ chain: 'solana:mainnet' }))
    .use(solanaRpc({ rpcUrl: RPC_URL, rpcSubscriptionsUrl: WS_URL }));

export type AppClient = typeof client;
