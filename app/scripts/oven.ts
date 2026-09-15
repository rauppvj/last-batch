// Operator CLI for the Last Batch oven.
//
//   pnpm oven status                      read the oven
//   pnpm oven init --jar <address>        create the oven (once per program)
//   pnpm oven sweeten --amount 500        add COOK to the pot
//   pnpm oven bake                        bake with the keypair (testing)
//   pnpm oven settle                      pay the winner once the timer ran out
//
// Options: --rpc <url> (default Cookie Chain), --keypair <path>
// (default ~/.config/solana/id.json). Writes to Cookie Chain need --yes.
import { homedir } from 'node:os';
import { parseArgs } from 'node:util';
import { address, createClient, lamports, type Instruction } from '@solana/kit';
import { solanaRpc } from '@solana/kit-plugin-rpc';
import { signerFromFile } from '@solana/kit-plugin-signer';

import {
    fetchMaybeOven,
    findOvenPda,
    getBakeInstructionAsync,
    getInitializeInstructionAsync,
    getSettleInstruction,
    getSweetenInstructionAsync,
    LAST_BATCH_PROGRAM_ADDRESS,
} from '../src/generated';

const COOK = 1_000_000_000n;
const COOKIE_RPC = 'https://rpc.cookiescan.io';
const COOKIE_JAR = '568tU9FMksJDxjkLBjWisSA4J4C5uPH87NCCkyREwrxe';

const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
        rpc: { type: 'string', default: COOKIE_RPC },
        ws: { type: 'string' },
        keypair: { type: 'string', default: `${homedir()}/.config/solana/id.json` },
        jar: { type: 'string', default: COOKIE_JAR },
        price: { type: 'string', default: '10' },
        secs: { type: 'string', default: '180' },
        'jar-bps': { type: 'string', default: '500' },
        'carry-bps': { type: 'string', default: '1000' },
        amount: { type: 'string' },
        yes: { type: 'boolean', default: false },
    },
});

const command = positionals[0] ?? 'status';
const rpcUrl = values.rpc!;
const wsUrl = values.ws ?? (rpcUrl.includes('cookiescan.io') ? 'wss://rpc.cookiescan.io' : rpcUrl.replace(/^http/, 'ws').replace(':8899', ':8900'));
const toCook = (v: bigint) => `${(Number(v) / Number(COOK)).toLocaleString('en-US')} COOK`;

const client = await createClient()
    .use(signerFromFile(values.keypair!))
    .use(solanaRpc({ rpcUrl, rpcSubscriptionsUrl: wsUrl }));

const [ovenAddress] = await findOvenPda();

async function status() {
    const oven = await fetchMaybeOven(client.rpc, ovenAddress);
    const { value: balance } = await client.rpc.getBalance(client.payer.address).send();
    console.log(`rpc       ${rpcUrl}`);
    console.log(`program   ${LAST_BATCH_PROGRAM_ADDRESS}`);
    console.log(`oven      ${ovenAddress}`);
    console.log(`keypair   ${client.payer.address} (${toCook(balance)})`);
    if (!oven.exists) {
        console.log('state     not initialized');
        return;
    }
    const o = oven.data;
    const now = Math.floor(Date.now() / 1000);
    console.log(`rules     ${toCook(o.bakePrice)} per bake, ${o.roundSecs}s timer, jar ${o.jarBps} bps, carry ${o.carryBps} bps`);
    console.log(`jar       ${o.jar}`);
    console.log(`round     ${o.round}: ${o.roundBakes} bakes, pot ${toCook(o.pot)}`);
    if (o.roundBakes > 0) {
        const left = Number(o.deadline) - now;
        console.log(`leader    ${o.lastBaker}, ${left > 0 ? `${left}s left` : `timer ran out ${-left}s ago`}`);
    }
    console.log(`totals    ${o.totalBakes} bakes, ${toCook(o.totalPaid)} paid, ${toCook(o.totalToJar)} to jar`);
}

async function send(label: string, instructions: Instruction[]) {
    if (rpcUrl.includes('cookiescan.io') && !values.yes) {
        console.error(`Refusing to ${label} on Cookie Chain without --yes.`);
        process.exit(1);
    }
    const result = await client.sendTransaction(instructions);
    const signature = (result as { context?: { signature?: string } }).context?.signature;
    console.log(`${label}: confirmed${signature ? ` ${signature}` : ''}`);
}

switch (command) {
    case 'status':
        await status();
        break;
    case 'init':
        await send('init', [
            await getInitializeInstructionAsync({
                authority: client.payer,
                jar: address(values.jar!),
                bakePrice: lamports(BigInt(values.price!) * COOK),
                roundSecs: BigInt(values.secs!),
                jarBps: Number(values['jar-bps']),
                carryBps: Number(values['carry-bps']),
            }),
        ]);
        await status();
        break;
    case 'sweeten': {
        if (!values.amount) throw new Error('--amount is required');
        await send('sweeten', [
            await getSweetenInstructionAsync({ donor: client.payer, amount: BigInt(values.amount) * COOK }),
        ]);
        await status();
        break;
    }
    case 'bake': {
        const oven = await fetchMaybeOven(client.rpc, ovenAddress);
        if (!oven.exists) throw new Error('oven not initialized');
        await send('bake', [await getBakeInstructionAsync({ baker: client.payer, jar: oven.data.jar })]);
        await status();
        break;
    }
    case 'settle': {
        const oven = await fetchMaybeOven(client.rpc, ovenAddress);
        if (!oven.exists) throw new Error('oven not initialized');
        await send('settle', [
            getSettleInstruction({ cranker: client.payer, oven: ovenAddress, winner: oven.data.lastBaker }),
        ]);
        await status();
        break;
    }
    default:
        console.error(`unknown command: ${command}`);
        process.exit(1);
}
process.exit(0);
