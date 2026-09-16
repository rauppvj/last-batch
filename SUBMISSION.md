# Submission notes

Draft material for the Superteam Earn bounty "Create an App on Cookie Chain".
Deadline: 22 September 2026, 21:59 UTC (18:59 in Brasília).

## Earn form

| Field | Value |
| --- | --- |
| Live application URL | https://last-batch.vercel.app |
| GitHub repository | https://github.com/rauppvj/last-batch |
| Relevant addresses | Program `BakeGjtjwhpaZ8bwqDjGR4KeRZ2jBPLia4XJdbNaJsXP`, oven `FLfdfiziHhrjC5n6vyMnegFvscHWgKSUbTdDUPHbXHap` |
| X thread | https://x.com/therppx/status/2100057580949164281 |

Verified live on Cookie Chain on 16 September 2026, before submitting:

- Phantom bakes and signs (confirmed in 11.2 s), even though it cannot add the Cookie Chain RPC:
  it signs through Wallet Standard and the app sends to `rpc.cookiescan.io`.
- Nightly bakes and signs (confirmed in 10.1 s) and shows the transfer as COOK.
- Round 1 paid its winner 1,089 COOK, 1 COOK reached the Cookie Jar, and round 2 opened with the
  carried pot — settle and bake ran in a single transaction.

Screenshots for the thread: `media/oven.jpg` (mid-round) and `media/rounds.jpg` (history and totals).

## X thread — posted 16 September 2026

https://x.com/therppx/status/2100057580949164281 (7 posts). Still to do: share that link in the
Cookie Chain Telegram, then submit on Earn.

Text as published:

**1/**
Last Batch is live on Cookie Chain 🍪

Every bake drops COOK into a shared pot and restarts a 3-minute timer.
When it hits zero, whoever baked last takes the pot.

Play: last-batch.vercel.app

_[attach: media/oven.jpg]_

**2/**
How a round goes:

· bake for 10 COOK → the timer goes back to 3:00 and you are the leader
· somebody else bakes → you lose the lead, the pot grows
· timer hits zero → the last baker takes 90% of the pot

10% stays in the oven so the next round never starts empty.

**3/**
5% of every bake goes to the Cookie Jar, the community vault that funds Cookie Chain builders.

The app shows what it sent there, all-time, straight from the chain. Round 1 has already paid out:
1,089 COOK to the last baker.

_[attach: media/rounds.jpg]_

**4/**
Nobody has to trust me to run it.

Paying the winner is permissionless — anyone can call it when the timer runs out, and the program
can only send the pot to the address it recorded as the last baker. There is no admin instruction
that moves the pot or changes the rules.

**5/**
Works with Nightly and with wallets that cannot add a custom network: the wallet signs, and the app
sends the transaction to Cookie Chain. Bakes confirmed in about 10 seconds in both.

**6/**
Built as a Cookie Chain cApp:

· Anchor program, one account holds the whole game
· Nightly through Wallet Standard; Cookie Chain RPC simulates, sends and confirms
· the page streams the oven account over WebSocket, so the pot and feed move without an indexer
· open source, MIT

github.com/rauppvj/last-batch

**7/**
New to Cookie Chain? Add the RPC to Nightly (rpc.cookiescan.io) and bridge COOK from Solana at
hyperlane.cookiescan.io.

Then come take my pot.

_[attach: short screen recording of a bake confirming]_
