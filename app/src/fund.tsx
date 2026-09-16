// A plain COOK transfer on Cookie Chain, for wallets that cannot add a custom
// network. The wallet only signs; the transfer is sent through the Cookie Chain
// RPC, the same path the game uses.
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { address, lamports, type Address } from '@solana/kit';
import { getTransferSolInstruction } from '@solana-program/system';
import { useConnect, useConnectedWallet, useDisconnect, useWallets, useWalletStatus } from '@solana/kit-plugin-wallet/react';
import '@fontsource/big-shoulders-display/700';
import '@fontsource/big-shoulders-display/800';
import '@fontsource/big-shoulders-display/900';
import '@fontsource/figtree/400';
import '@fontsource/figtree/700';
import './index.css';

import { useBalance } from './chain';
import { client } from './client';
import { LAMPORTS_PER_COOK, NIGHTLY_URL, txUrl } from './config';
import { explain } from './errors';
import { cook, short } from './format';

function Fund() {
    const status = useWalletStatus(client);
    const wallets = useWallets(client);
    const connected = useConnectedWallet(client);
    const { dispatch: connect, isRunning } = useConnect(client);
    const { dispatch: disconnect } = useDisconnect(client);
    const [to, setTo] = useState('');
    const [amount, setAmount] = useState('');
    const [state, setState] = useState<{ kind: 'idle' | 'working' } | { kind: 'sent'; signature?: string } | { kind: 'failed'; message: string }>({ kind: 'idle' });
    const balance = useBalance(connected?.account.address as Address | undefined, state.kind === 'sent' ? state.signature : null);

    const send = async () => {
        const signer = connected?.signer;
        if (!signer) return;
        setState({ kind: 'working' });
        try {
            const units = Number(amount);
            if (!Number.isFinite(units) || units <= 0) throw new Error('Enter how much COOK to send.');
            const ix = getTransferSolInstruction({
                source: signer,
                destination: address(to.trim()),
                amount: lamports(BigInt(Math.round(units * Number(LAMPORTS_PER_COOK)))),
            });
            const result = await client.sendTransaction([ix]);
            const signature = (result as { context?: { signature?: string } }).context?.signature;
            setState({ kind: 'sent', signature });
        } catch (e) {
            console.error(e);
            setState({ kind: 'failed', message: explain(e).message });
        }
    };

    return (
        <div className="page">
            <header className="top">
                <span className="wordmark">Send COOK</span>
            </header>
            <section className="oven">
                <div className="controls">
                    <p className="rules">
                        Sends native COOK on Cookie Chain. Use it when your wallet cannot add the Cookie Chain RPC
                        itself: it signs here, and this page sends the transaction to <code>rpc.cookiescan.io</code>.
                    </p>

                    {status === 'pending' || status === 'reconnecting' ? (
                        <p className="hint">Looking for wallets…</p>
                    ) : connected ? (
                        <>
                            <p className="hint">
                                {short(connected.account.address)} · {balance === undefined ? '…' : `${cook(balance)} COOK`}{' '}
                                <button className="plain" onClick={() => disconnect()}>
                                    Disconnect
                                </button>
                            </p>
                            <label className="field">
                                Send to
                                <input value={to} onChange={e => setTo(e.target.value)} placeholder="Cookie Chain address" spellCheck={false} />
                            </label>
                            <label className="field">
                                Amount in COOK
                                <input value={amount} onChange={e => setAmount(e.target.value)} placeholder="900" inputMode="decimal" />
                            </label>
                            <button className="bake" disabled={state.kind === 'working' || !to || !amount} onClick={send}>
                                Send COOK
                            </button>
                        </>
                    ) : wallets.length === 0 ? (
                        <p className="hint">
                            No wallet found.{' '}
                            <a href={NIGHTLY_URL} target="_blank" rel="noreferrer">
                                Install Nightly
                            </a>
                            .
                        </p>
                    ) : (
                        <div className="buttons">
                            {wallets.map(w => (
                                <button key={w.name} className="connect" disabled={isRunning} onClick={() => connect(w)}>
                                    Connect {w.name}
                                </button>
                            ))}
                        </div>
                    )}

                    {state.kind === 'working' && <p className="tx tx--working">Approve it in your wallet.</p>}
                    {state.kind === 'sent' && (
                        <p className="tx tx--ok">
                            Sent.{' '}
                            {state.signature && (
                                <a href={txUrl(state.signature)} target="_blank" rel="noreferrer">
                                    View on Cookiescan
                                </a>
                            )}
                        </p>
                    )}
                    {state.kind === 'failed' && <p className="tx tx--failed">{state.message}</p>}
                </div>
            </section>
        </div>
    );
}

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <Fund />
    </StrictMode>,
);
