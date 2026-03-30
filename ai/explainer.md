# Trust Oracle -- How It Works

## What is Trust Oracle?

Imagine you're hiring someone on Fiverr. You'd check their reviews and star rating before paying, right? You wouldn't just send money to a random person with no reviews.

Trust Oracle is the same thing, but for AI agents paying for API services. An API is just a service that one computer calls to ask another computer to do something -- like "search the web for me" or "generate an image." With x402 (a Coinbase protocol), agents pay a tiny amount of real money every time they make one of these calls. But there's no Yelp or Google Reviews for these services. Trust Oracle is that missing review system.

---

## How do probes work?

Think of it like a health check at the doctor, but for websites.

Every 5 minutes, Trust Oracle pings each of the 8 services it monitors. It's basically asking: "Hey, are you alive? How fast did you respond?"

Three things can happen:
- The service responds quickly -- great, it's healthy
- The service responds with a 402 ("pay me first") -- that's actually healthy too, because x402 services are *supposed* to say that. It means the door is locked but the lights are on.
- The service doesn't respond, or returns a 500 error -- it's down

Each ping records two things: **did it work?** (yes/no) and **how long did it take?** (in milliseconds). These records pile up over 24 hours and that's what the scores are based on.

---

## How does scoring work?

There are three ingredients that mix together into one final trust score (0 to 100):

### Ingredient 1: Uptime (how often is it alive?)

If we pinged a service 288 times in 24 hours (every 5 min = 288 pings) and 280 of those succeeded, the uptime is 280/288 = 97%. Simple division.

### Ingredient 2: Latency (how fast does it respond?)

We don't use the average because one slow response can hide behind 99 fast ones. Instead we use the **p95** -- sort all response times from fastest to slowest, then pick the one at the 95th percentile. That tells you "95% of the time, it responds faster than this."

Then we convert that to a score:
- 100 milliseconds or less = perfect score of 100
- 5000 milliseconds (5 seconds) = worst score of 0
- Everything between is a straight line

### Ingredient 3: Human ratings (what do real people think?)

Humans can rate services 1-5 stars, like an app store. We average those and convert to 0-100.

### The recipe

If no humans have rated the service yet:

> **70% uptime + 30% latency = trust score**

Once humans start rating:

> **50% uptime + 20% latency + 30% human ratings = trust score**

Human opinions get a big chunk (30%) because automated probes can only tell you "it's online and fast." Humans can tell you "the results are garbage" or "it's amazing."

---

## How does payment work?

The basic dashboard showing trust scores is free. Anyone can see it.

But the detailed breakdown (latency numbers, p95, score components) costs money. Specifically $0.001 -- one tenth of one cent -- in USDC (a stablecoin pegged to the US dollar) on Base (a blockchain network).

When an agent hits the paid endpoint without paying, it gets back a 402 response that says "here's how to pay me." The agent's wallet automatically pays, and then the data comes through. No signup, no subscription, no API key. Just pay and get.

We tested this 4 times with real money on the real blockchain. Not testnet. Real USDC.

---

## How does World ID work?

The problem with letting anyone submit ratings is bots. Someone could write a script to submit 10,000 five-star ratings for their own service.

World ID solves this. It's a system by Worldcoin that proves you're a real, unique human. When you submit a rating, you:

1. Connect your MetaMask wallet (like a crypto login)
2. Sign a message that proves you own that wallet
3. World ID's AgentKit checks if that wallet belongs to a verified human

One human = one vote. No duplicates, no bots.

---

## What's the XMTP agent?

XMTP is like iMessage but for crypto wallets. Instead of sending a text to a phone number, you send a message to a wallet address.

Trust Oracle has a bot that listens on XMTP. Another AI agent can message it and say `score https://stableenrich.dev/exa-search` and get back the trust score. It's a way for agents to check reliability without even opening a` web browser.

---

## One-sentence version

"Trust Oracle is a credit score for AI services -- automated monitoring plus human reviews, monetized through the same pay-per-call protocol it monitors."

---

## Live Links

- Dashboard: https://trust-oracle.onrender.com
- Report page: https://trust-oracle.onrender.com/report
- API docs: https://trust-oracle.onrender.com/api/docs
- GitHub: https://github.com/Yonkoo11/trust-oracle
