import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Address } from '@solana/kit';
import { useConnect, useConnectedWallet, useDisconnect, useWallets, useWalletStatus } from '@solana/kit-plugin-wallet/react';

import { useBalance, useChainNow, useOven } from './chain';
import { chain, client, unusableWallets } from './client';
import { addressUrl, BRIDGE_URL, NIGHTLY_URL, REPO_URL, SYSTEM_PROGRAM, txUrl } from './config';
import { explain, type Friendly } from './errors';
import { ago, cook, countdown, short } from './format';
import {
    getBakeInstructionAsync,
    getSettleInstruction,
    LAST_BATCH_PROGRAM_ADDRESS,
    type BakeEntry,
    type Oven,
    type WinnerEntry,
} from './generated';

type Phase = 'cold' | 'running' | 'done';

type TxState =
    | { kind: 'idle' }
    | { kind: 'working'; label: string }
    | { kind: 'confirmed'; label: string; signature?: string; ms: number }
    | { kind: 'failed'; error: Friendly };

export default function App() {
    const ovenState = useOven();
    const chainNow = useChainNow();
    const connected = useConnectedWallet(client);
    const [tx, setTx] = useState<TxState>({ kind: 'idle' });
    const me = connected?.account.address as Address | undefined;
    const balance = useBalance(me, tx.kind === 'confirmed' ? tx.signature : null);

    return (
        <div className="page">
            <header className="top">
                <a className="wordmark" href="/" aria-label="Last Batch home">
                    Last Batch
                </a>
                <WalletControl balance={balance} />
            </header>

            <main>
                {ovenState.status === 'ready' ? (
                    <Game
                        oven={ovenState.oven}
                        ovenAddress={ovenState.address}
                        chainNow={chainNow}
                        me={me}
                        balance={balance}
                        tx={tx}
                        setTx={setTx}
                    />
                ) : (
                    <section className="oven oven--quiet" aria-live="polite">
                        <div className="window">
                            <p className="window-note">
                                {ovenState.status === 'loading' && 'Heating up the oven…'}
                                {ovenState.status === 'missing' && 'This oven has not been lit yet.'}
                                {ovenState.status === 'error' && 'Cookie Chain is not answering right now. Retrying.'}
                            </p>
                        </div>
                    </section>
                )}
            </main>

            <footer className="foot">
                <p>
                    Runs entirely on Cookie Chain. Program{' '}
                    <a href={addressUrl(LAST_BATCH_PROGRAM_ADDRESS)} target="_blank" rel="noreferrer">
                        {short(LAST_BATCH_PROGRAM_ADDRESS)}
                    </a>
                    , source on{' '}
                    <a href={REPO_URL} target="_blank" rel="noreferrer">
                        GitHub
                    </a>
                    . Need COOK?{' '}
                    <a href={BRIDGE_URL} target="_blank" rel="noreferrer">
                        Bridge it from Solana
                    </a>
                    .
                </p>
            </footer>
        </div>
    );
}

function Game({
    oven,
    ovenAddress,
    chainNow,
    me,
    balance,
    tx,
    setTx,
}: {
    oven: Oven;
    ovenAddress: Address;
    chainNow: number;
    me: Address | undefined;
    balance: bigint | undefined;
    tx: TxState;
    setTx: (t: TxState) => void;
}) {
    const connected = useConnectedWallet(client);
    const deadline = Number(oven.deadline);
    const roundSecs = Number(oven.roundSecs);
    const phase: Phase = oven.roundBakes === 0 ? 'cold' : chainNow > deadline ? 'done' : 'running';
    const left = phase === 'running' ? deadline - chainNow : phase === 'cold' ? roundSecs : 0;
    const heat = phase === 'cold' ? 0.12 : phase === 'done' ? 1 : Math.min(1, Math.max(0.2, 1 - left / roundSecs));
    const leading = !!me && oven.lastBaker === me && phase !== 'cold';
    const winnerPrize = oven.pot - (oven.pot * BigInt(oven.carryBps)) / 10_000n;
    const carry = oven.pot - winnerPrize;
    const jarCut = (oven.bakePrice * BigInt(oven.jarBps)) / 10_000n;
    const busy = tx.kind === 'working';
    const short_on_cook = balance !== undefined && balance < oven.bakePrice + 10_000n;

    const bakes = oven.recentBakes.filter(b => b.baker !== SYSTEM_PROGRAM);
    const winners = oven.recentWinners.filter(w => w.winner !== SYSTEM_PROGRAM);

    // A short rise on the pot figure whenever a new bake lands.
    const [bump, setBump] = useState(0);
    const lastPot = useRef(oven.pot);
    useEffect(() => {
        if (oven.pot > lastPot.current) setBump(b => b + 1);
        lastPot.current = oven.pot;
    }, [oven.pot]);

    const send = async (label: string, done: string, withSettle: boolean, withBake: boolean) => {
        const signer = connected?.signer;
        if (!signer) {
            setTx({ kind: 'failed', error: { message: 'This wallet account cannot sign transactions. Reconnect Nightly.' } });
            return;
        }
        const started = performance.now();
        setTx({ kind: 'working', label });
        try {
            const instructions = [];
            if (withSettle) {
                instructions.push(
                    getSettleInstruction({ cranker: signer, oven: ovenAddress, winner: oven.lastBaker }),
                );
            }
            if (withBake) {
                instructions.push(await getBakeInstructionAsync({ baker: signer, jar: oven.jar }));
            }
            const result = await client.sendTransaction(instructions);
            setTx({ kind: 'confirmed', label: done, signature: findSignature(result), ms: performance.now() - started });
        } catch (e) {
            console.error(e);
            setTx({ kind: 'failed', error: explain(e) });
        }
    };

    const status =
        phase === 'cold'
            ? `Round ${oven.round} is waiting for its first bake.`
            : phase === 'done'
              ? `${oven.lastBaker === me ? 'You' : short(oven.lastBaker)} won ${cook(winnerPrize)} COOK in round ${oven.round}.`
              : leading
                ? 'You baked last. Hold the oven until the timer runs out.'
                : `${short(oven.lastBaker)} baked last.`;

    return (
        <>
            <section
                className={`oven oven--${phase}${leading ? ' oven--leading' : ''}`}
                style={{ '--heat': heat } as CSSProperties}
                aria-label={`Round ${oven.round}`}
            >
                <div className="panel">
                    <p className="round">
                        Round {oven.round}
                        <span className="round-bakes">
                            {oven.roundBakes} {oven.roundBakes === 1 ? 'bake' : 'bakes'}
                        </span>
                    </p>
                    <p className="clock" role="timer" aria-live="off" aria-label={`${countdown(left)} left`}>
                        {countdown(left)}
                    </p>
                </div>

                <div className="window">
                    <div className="glow" aria-hidden="true" />
                    <p className="pot-label">In the pot</p>
                    <p className="pot" key={bump}>
                        {cook(oven.pot)} <span className="unit">COOK</span>
                    </p>
                    <PotLine bakes={bakes} />
                    <p className="window-note" aria-live="polite">
                        {status}
                    </p>
                </div>

                <div className="controls">
                    {!connected ? (
                        <p className="hint">Connect Nightly to bake.</p>
                    ) : phase === 'done' ? (
                        <div className="buttons">
                            <button className="bake" disabled={busy} onClick={() => send('Paying the winner and baking…', 'You paid the winner and baked first', true, true)}>
                                Pay the winner and bake round {Number(oven.round) + 1}
                            </button>
                            <button className="plain" disabled={busy} onClick={() => send('Paying the winner…', 'Winner paid', true, false)}>
                                Only pay the winner
                            </button>
                        </div>
                    ) : (
                        <button className="bake" disabled={busy} onClick={() => send('Baking…', 'You baked', false, true)}>
                            {leading ? 'Bake again' : 'Bake'} for {cook(oven.bakePrice)} COOK
                        </button>
                    )}

                    <TxLine tx={tx} />
                    {connected && short_on_cook && tx.kind !== 'failed' && (
                        <p className="hint">
                            This wallet has {cook(balance ?? 0n)} COOK.{' '}
                            <a href={BRIDGE_URL} target="_blank" rel="noreferrer">
                                Bridge COOK from Solana
                            </a>{' '}
                            to play.
                        </p>
                    )}
                </div>
            </section>

            <section className="rules">
                <p>
                    Each bake costs {cook(oven.bakePrice)} COOK and resets the timer to {countdown(roundSecs)}. When it
                    runs out, the last baker takes {100 - oven.carryBps / 100}% of the pot. The other{' '}
                    {oven.carryBps / 100}% stays in the oven for the next round, and {cook(jarCut)} COOK of every bake
                    goes to the{' '}
                    <a href={addressUrl(oven.jar)} target="_blank" rel="noreferrer">
                        Cookie Jar
                    </a>{' '}
                    that funds Cookie Chain builders.
                </p>
                {phase === 'done' && (
                    <p>
                        Paying the winner sends {cook(winnerPrize)} COOK to {short(oven.lastBaker)} and carries{' '}
                        {cook(carry)} COOK into round {Number(oven.round) + 1}. Anyone can do it.
                    </p>
                )}
            </section>

            <section className="ledger">
                <div>
                    <h2>This round</h2>
                    {bakes.length === 0 ? (
                        <p className="empty">No bakes yet. The first one starts the timer.</p>
                    ) : (
                        <ol className="rows">
                            {bakes.map((b, i) => (
                                <BakeRow key={`${b.baker}-${b.at}-${i}`} bake={b} me={me} now={chainNow} />
                            ))}
                        </ol>
                    )}
                </div>
                <div>
                    <h2>Past rounds</h2>
                    {winners.length === 0 ? (
                        <p className="empty">Nobody has taken a pot yet.</p>
                    ) : (
                        <ol className="rows">
                            {winners.map(w => (
                                <WinnerRow key={String(w.round)} winner={w} me={me} now={chainNow} />
                            ))}
                        </ol>
                    )}
                </div>
                <dl className="totals">
                    <div>
                        <dt>Bakes, all rounds</dt>
                        <dd>{String(oven.totalBakes)}</dd>
                    </div>
                    <div>
                        <dt>Paid to winners</dt>
                        <dd>{cook(oven.totalPaid)} COOK</dd>
                    </div>
                    <div>
                        <dt>Sent to the Cookie Jar</dt>
                        <dd>{cook(oven.totalToJar)} COOK</dd>
                    </div>
                </dl>
            </section>
        </>
    );
}

function BakeRow({ bake, me, now }: { bake: BakeEntry; me?: Address; now: number }) {
    return (
        <li>
            <a href={addressUrl(bake.baker)} target="_blank" rel="noreferrer">
                {bake.baker === me ? 'You' : short(bake.baker)}
            </a>
            <span className="row-mid">pot {cook(bake.potAfter)}</span>
            <span className="row-end">{ago(Number(bake.at), now)}</span>
        </li>
    );
}

function WinnerRow({ winner, me, now }: { winner: WinnerEntry; me?: Address; now: number }) {
    return (
        <li>
            <span>
                Round {String(winner.round)}:{' '}
                <a href={addressUrl(winner.winner)} target="_blank" rel="noreferrer">
                    {winner.winner === me ? 'you' : short(winner.winner)}
                </a>
            </span>
            <span className="row-mid">
                {cook(winner.prize)} COOK, {winner.bakes} {winner.bakes === 1 ? 'bake' : 'bakes'}
            </span>
            <span className="row-end">{ago(Number(winner.at), now)}</span>
        </li>
    );
}

/** Pot growth across this round's recent bakes, oldest to newest. */
function PotLine({ bakes }: { bakes: BakeEntry[] }) {
    const points = useMemo(() => bakes.map(b => Number(b.potAfter)).reverse(), [bakes]);
    if (points.length < 2) return <div className="potline potline--empty" aria-hidden="true" />;
    const w = 240;
    const h = 44;
    const min = Math.min(...points);
    const max = Math.max(...points);
    const span = max - min || 1;
    const xy = points.map((p, i) => [(i / (points.length - 1)) * w, h - 4 - ((p - min) / span) * (h - 8)] as const);
    let d = `M0 ${xy[0][1].toFixed(1)}`;
    for (let i = 1; i < xy.length; i++) d += ` H${xy[i][0].toFixed(1)} V${xy[i][1].toFixed(1)}`;
    return (
        <svg className="potline" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label={`Pot over the last ${points.length} bakes`}>
            <path d={`${d} V${h} H0 Z`} className="potline-fill" />
            <path d={d} className="potline-stroke" />
        </svg>
    );
}

function TxLine({ tx }: { tx: TxState }) {
    if (tx.kind === 'idle') return null;
    if (tx.kind === 'working') {
        return (
            <p className="tx tx--working" aria-live="polite">
                {tx.label} Approve it in Nightly.
            </p>
        );
    }
    if (tx.kind === 'confirmed') {
        return (
            <p className="tx tx--ok" aria-live="polite">
                {tx.label}. Confirmed in {(tx.ms / 1000).toFixed(1)}s
                {tx.signature && (
                    <>
                        {' '}
                        <a href={txUrl(tx.signature)} target="_blank" rel="noreferrer">
                            view on Cookiescan
                        </a>
                    </>
                )}
                .
            </p>
        );
    }
    return (
        <p className="tx tx--failed" role="alert">
            {tx.error.message}
            {tx.error.needsCook && (
                <>
                    {' '}
                    <a href={BRIDGE_URL} target="_blank" rel="noreferrer">
                        Bridge COOK from Solana
                    </a>
                    .
                </>
            )}
        </p>
    );
}

function WalletControl({ balance }: { balance: bigint | undefined }) {
    const status = useWalletStatus(client);
    const wallets = useWallets(client);
    const connected = useConnectedWallet(client);
    const { dispatch: connect, isRunning } = useConnect(client);
    const { dispatch: disconnect } = useDisconnect(client);

    if (status === 'pending' || status === 'reconnecting') return <span className="wallet-wait">Wallet…</span>;

    if (connected) {
        return (
            <div className="wallet">
                <span className="wallet-who">
                    {short(connected.account.address)}
                    {balance !== undefined && <span className="wallet-bal">{cook(balance)} COOK</span>}
                </span>
                <button className="plain" onClick={() => disconnect()}>
                    Disconnect
                </button>
            </div>
        );
    }

    const sorted = [...wallets].sort((a, b) => Number(/nightly/i.test(b.name)) - Number(/nightly/i.test(a.name)));
    const unusable = unusableWallets();
    if (sorted.length === 0) {
        return (
            <div className="wallet">
                <a className="connect" href={NIGHTLY_URL} target="_blank" rel="noreferrer">
                    Install Nightly
                </a>
                {unusable.length > 0 && (
                    <span className="wallet-note">
                        {unusable.map(w => w.name).join(', ')} cannot sign for {chain}
                    </span>
                )}
            </div>
        );
    }
    return (
        <div className="wallet">
            {sorted.slice(0, 3).map(w => (
                <button key={w.name} className="connect" disabled={isRunning} onClick={() => connect(w)}>
                    Connect {w.name}
                </button>
            ))}
            {unusable.length > 0 && (
                <span className="wallet-note">
                    {unusable.map(w => w.name).join(', ')} cannot sign for {chain}
                </span>
            )}
        </div>
    );
}

function findSignature(result: unknown): string | undefined {
    const seen = new Set<unknown>();
    const visit = (v: unknown, depth: number): string | undefined => {
        if (!v || typeof v !== 'object' || seen.has(v) || depth > 6) return;
        seen.add(v);
        const sig = (v as { signature?: unknown }).signature;
        if (typeof sig === 'string') return sig;
        for (const value of Object.values(v)) {
            const found = visit(value, depth + 1);
            if (found) return found;
        }
    };
    return visit(result, 0);
}
