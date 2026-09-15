import { useEffect, useState } from 'react';
import { getBase64Encoder, type Address } from '@solana/kit';

import { client } from './client';
import { findOvenPda, getOvenDecoder, type Oven } from './generated';

export type OvenState =
    | { status: 'loading' }
    | { status: 'missing'; address: Address }
    | { status: 'error'; message: string }
    | { status: 'ready'; address: Address; oven: Oven; updatedAt: number };

const POLL_MS = 8_000;

/**
 * Live view of the single on-chain oven account: an account subscription for
 * instant updates, plus a slow poll in case the socket drops.
 */
export function useOven(): OvenState {
    const [state, setState] = useState<OvenState>({ status: 'loading' });

    useEffect(() => {
        const abort = new AbortController();
        const decoder = getOvenDecoder();
        const base64 = getBase64Encoder();
        let address: Address | undefined;

        const apply = (base64Data: string | null) => {
            if (abort.signal.aborted || !address) return;
            if (base64Data === null) {
                setState({ status: 'missing', address });
                return;
            }
            const oven = decoder.decode(base64.encode(base64Data));
            setState({ status: 'ready', address, oven, updatedAt: Date.now() });
        };

        const fetchOnce = async () => {
            if (!address) return;
            try {
                const { value } = await client.rpc
                    .getAccountInfo(address, { encoding: 'base64', commitment: 'confirmed' })
                    .send({ abortSignal: abort.signal });
                apply(value ? value.data[0] : null);
            } catch (e) {
                if (!abort.signal.aborted) {
                    setState(s => (s.status === 'ready' ? s : { status: 'error', message: String(e) }));
                }
            }
        };

        const subscribe = async () => {
            if (!address) return;
            try {
                const notifications = await client.rpcSubscriptions
                    .accountNotifications(address, { encoding: 'base64', commitment: 'confirmed' })
                    .subscribe({ abortSignal: abort.signal });
                for await (const n of notifications) apply(n.value.data[0]);
            } catch {
                // The poll keeps the view fresh while the socket is down.
            }
        };

        let timer: ReturnType<typeof setInterval> | undefined;
        (async () => {
            [address] = await findOvenPda();
            await fetchOnce();
            void subscribe();
            timer = setInterval(fetchOnce, POLL_MS);
        })();

        return () => {
            abort.abort();
            if (timer) clearInterval(timer);
        };
    }, []);

    return state;
}

/**
 * Seconds on the chain's clock. The program compares deadlines against the
 * cluster's unix timestamp, which can drift from this device's clock, so the
 * countdown uses the offset between the latest block time and local time.
 */
export function useChainNow(): number {
    const [offset, setOffset] = useState(0);
    const [now, setNow] = useState(() => Date.now() / 1000);

    useEffect(() => {
        let cancelled = false;
        const sync = async () => {
            try {
                const slot = await client.rpc.getSlot({ commitment: 'confirmed' }).send();
                const blockTime = await client.rpc.getBlockTime(slot).send();
                if (!cancelled && blockTime !== null) setOffset(Number(blockTime) - Date.now() / 1000);
            } catch {
                // Keep the previous offset.
            }
        };
        void sync();
        const resync = setInterval(sync, 60_000);
        const tick = setInterval(() => setNow(Date.now() / 1000), 250);
        return () => {
            cancelled = true;
            clearInterval(resync);
            clearInterval(tick);
        };
    }, []);

    return now + offset;
}

export function useBalance(address: Address | undefined, refreshKey: unknown): bigint | undefined {
    const [balance, setBalance] = useState<bigint>();

    useEffect(() => {
        if (!address) {
            setBalance(undefined);
            return;
        }
        let cancelled = false;
        const load = async () => {
            try {
                const { value } = await client.rpc.getBalance(address, { commitment: 'confirmed' }).send();
                if (!cancelled) setBalance(value);
            } catch {
                // Leave the last known balance on screen.
            }
        };
        void load();
        const timer = setInterval(load, 15_000);
        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, [address, refreshKey]);

    return balance;
}
