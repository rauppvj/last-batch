import { LAMPORTS_PER_COOK } from './config';

const whole = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const fine = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

export function cook(lamports: bigint): string {
    const units = Number(lamports) / Number(LAMPORTS_PER_COOK);
    return units >= 1000 ? whole.format(units) : fine.format(units);
}

export function short(address: string): string {
    return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

export function countdown(seconds: number): string {
    const s = Math.max(0, Math.floor(seconds));
    const m = Math.floor(s / 60);
    return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function ago(unixSeconds: number, nowSeconds: number): string {
    const d = Math.max(0, Math.round(nowSeconds - unixSeconds));
    if (d < 60) return `${d}s ago`;
    if (d < 3600) return `${Math.floor(d / 60)}m ago`;
    if (d < 86_400) return `${Math.floor(d / 3600)}h ago`;
    return `${Math.floor(d / 86_400)}d ago`;
}
