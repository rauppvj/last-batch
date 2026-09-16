# Submission notes

Draft material for the Superteam Earn bounty "Create an App on Cookie Chain".
Deadline: 22 September 2026, 21:59 UTC (18:59 in Brasília).

## Earn form

| Field | Value |
| --- | --- |
| Live application URL | https://last-batch.vercel.app |
| GitHub repository | https://github.com/rauppvj/last-batch |
| Relevant addresses | Program `BakeGjtjwhpaZ8bwqDjGR4KeRZ2jBPLia4XJdbNaJsXP`, oven `FLfdfiziHhrjC5n6vyMnegFvscHWgKSUbTdDUPHbXHap` |

## X thread (draft — post from the personal account, then share the link in the Cookie Chain Telegram)

**1/**
Last Batch is live on Cookie Chain 🍪

Every bake drops COOK into a shared pot and restarts a 3-minute timer.
When it hits zero, whoever baked last takes the pot.

Play: last-batch.vercel.app

_[attach: screenshot of the oven with a running timer]_

**2/**
How a round goes:

· bake for 10 COOK → the timer goes back to 3:00 and you are the leader
· somebody else bakes → you lose the lead, the pot grows
· timer hits zero → the last baker takes 90% of the pot

10% stays in the oven so the next round never starts empty.

**3/**
5% of every bake goes to the Cookie Jar, the community vault that funds Cookie Chain builders.

The app shows what it sent there, all-time, straight from the chain.

_[attach: screenshot of the totals row]_

**4/**
Nobody has to trust me to run it.

Paying the winner is permissionless — anyone can call it when the timer runs out, and the program
can only send the pot to the address it recorded as the last baker. There is no admin instruction
that moves the pot or changes the rules.

**5/**
Built as a Cookie Chain cApp:

· Anchor program, one account holds the whole game
· Nightly through Wallet Standard; Cookie Chain RPC simulates, sends and confirms
· the page streams the oven account over WebSocket, so the pot and feed move without an indexer
· open source, MIT

github.com/rauppvj/last-batch

**6/**
New to Cookie Chain? Add the RPC to Nightly (rpc.cookiescan.io) and bridge COOK from Solana at
hyperlane.cookiescan.io.

Then come take my pot.

_[attach: short screen recording of a bake confirming]_
