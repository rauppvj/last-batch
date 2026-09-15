import {
    isSolanaError,
    SOLANA_ERROR__INSTRUCTION_ERROR__CUSTOM,
    SOLANA_ERROR__INSTRUCTION_ERROR__INSUFFICIENT_FUNDS,
    SOLANA_ERROR__TRANSACTION_ERROR__INSUFFICIENT_FUNDS_FOR_FEE,
    SOLANA_ERROR__TRANSACTION_ERROR__INSUFFICIENT_FUNDS_FOR_RENT,
} from '@solana/kit';

import {
    LAST_BATCH_ERROR__NO_BAKES,
    LAST_BATCH_ERROR__ROUND_NOT_OVER,
    LAST_BATCH_ERROR__ROUND_OVER,
} from './generated';

// Anchor's own constraint failures.
const ANCHOR_CONSTRAINT_MUT = 2000;
const ANCHOR_CONSTRAINT_ADDRESS = 2012;

export type Friendly = { message: string; needsCook?: boolean };

/** Every error nested inside a Kit error: causes, plan results, arrays. */
function* walk(value: unknown, seen = new Set<unknown>(), depth = 0): Generator<unknown> {
    if (!value || typeof value !== 'object' || seen.has(value) || depth > 8) return;
    seen.add(value);
    yield value;
    for (const key of Object.getOwnPropertyNames(value)) {
        if (key === 'stack' || key === 'message') continue;
        yield* walk((value as Record<string, unknown>)[key], seen, depth + 1);
    }
}

export function explain(error: unknown): Friendly {
    for (const e of walk(error)) {
        if (isSolanaError(e, SOLANA_ERROR__INSTRUCTION_ERROR__CUSTOM)) {
            switch (e.context.code) {
                case LAST_BATCH_ERROR__ROUND_OVER:
                    return { message: 'The timer ran out while you were signing. Pay the winner to open the next round.' };
                case LAST_BATCH_ERROR__ROUND_NOT_OVER:
                    return { message: 'Someone baked right before you, so the round is still on. Bake again to take the lead.' };
                case LAST_BATCH_ERROR__NO_BAKES:
                case ANCHOR_CONSTRAINT_MUT:
                case ANCHOR_CONSTRAINT_ADDRESS:
                    return { message: 'Someone already paid the winner and opened the next round. Bake again to lead it.' };
            }
        }
        if (
            isSolanaError(e, SOLANA_ERROR__INSTRUCTION_ERROR__INSUFFICIENT_FUNDS) ||
            isSolanaError(e, SOLANA_ERROR__TRANSACTION_ERROR__INSUFFICIENT_FUNDS_FOR_FEE) ||
            isSolanaError(e, SOLANA_ERROR__TRANSACTION_ERROR__INSUFFICIENT_FUNDS_FOR_RENT)
        ) {
            return { message: 'Not enough COOK in this wallet for the bake and its fee.', needsCook: true };
        }
    }

    const text = String((error as Error)?.message ?? error);
    if (/reject|denied|cancel|declined|4001/i.test(text)) {
        return { message: 'Nightly closed without signing. Nothing was sent.' };
    }
    if (/insufficient (funds|lamports)|debit an account/i.test(text)) {
        return { message: 'Not enough COOK in this wallet for the bake and its fee.', needsCook: true };
    }
    if (/block ?height|expired/i.test(text)) {
        return { message: 'The transaction expired before it landed. Bake again.' };
    }
    return { message: `The transaction failed: ${text}` };
}
