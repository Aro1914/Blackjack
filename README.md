# Blackjack on Algorand (Reach)

A multiplayer Blackjack game written as a [Reach](https://docs.reach.sh) smart contract, with a Node.js simulation that plays full rounds against it on a Reach devnet. A dealer funds a **bank**, players bet against it, and the contract holds the money and pays out according to the rules of the game.

The repository holds three iterations of the contract. Each lives in its own folder with its own `index.rsh` (contract), `index.mjs` (simulation) and a saved compiler log, so you can see how the design evolved.

| Version | Folder | Summary |
| --- | --- | --- |
| v1 | `v1/` | Stateless prototype. One `getOutcome` call carries the player's whole hand and bet choices and settles immediately. |
| v2 | `v2/` | Stateful redesign. The contract tracks every player's bets and hands, and adds splitting, a dealer round cycle, and a solvency check. |
| **v2.1** | `v2.1/` | Current version. Same game as v2 with a cleaner close-out (no workaround step) and a clean compile. |

---

## Game rules implemented

**Card values:** 2–10 at face value, J/Q/K = 10, Ace = 1 or 11 (whichever is better without busting).

**Player actions**

- **Place bet** – stake the table's fixed base bet.
- **Hit / Stand** – take another card, or keep the current hand.
- **Double down** – add a second stake equal to the base bet (bet becomes 2×).
- **Buy insurance** – add a stake equal to the base bet as a side bet against a dealer natural.
- **Surrender** – give up the hand for half the bet back.
- **Split** – a pair is split into two hands, each with its own bet, and each can be played, doubled and insured independently (v2 and later).

**Outcomes**

| Outcome | When | Payout |
| --- | --- | --- |
| Player Wins | Player beats the dealer, or the dealer busts | Bet back plus an equal amount (2× bet) |
| Blackjack | Player has a two-card 21 and the dealer does not have 21 | 2.5× bet (bet plus 1.5× winnings) |
| Dealer Wins | Player busts or has the lower hand | Bet is lost |
| Push | Equal totals | Bet returned |
| Retrieve | Player bought insurance and the dealer has a natural | Full stake (bet plus insurance) returned |
| End | Player surrendered and the dealer turns out to have a natural | Round is voided, see below |

When a player wins or pushes with insurance bought, the insurance stake is forfeited and not returned.

---

## How the contract works (v2.1)

### Participants and views

- **`D` (Dealer)** deploys the contract, deposits the **bank** (`bankAmount`) and publishes the base **bet** (`betAmount`).
- **`Player` API** – `placeBet`, `doubleDown`, `buyInsurance`, `surrender`, `submitHand`, `getOutcome`, `reclaim`. Each takes an `isFirstHand` flag so the same address can play two hands after a split.
- **`Dealer` API** – `submitHand`, `newRound`, `endGame`.
- **`Bank` view** – exposes the current bank balance.

### State

The contract runs a `parallelReduce` loop whose state is:

`[bank, keepGoing, dealerHand, dealerCount, hasDealt, playerSurrendered, pendingPayouts]`

Per-player data is stored in Reach `Map`s: `players1stBet`, `players2ndBet`, `players1stHand`, `players2ndHand`, plus a `Set` of seated players. A hand records `cardValue`, `cardCount`, `boughtInsurance`, `surrendered` and `doubledDown`.

### Round lifecycle

1. **Deploy** – Dealer publishes the bank and base bet and pays the bank into the contract.
2. **Bets** – each player calls `placeBet` (`pendingPayouts` goes up by one).
3. **Play** – players act, optionally calling `doubleDown`, `buyInsurance` or `surrender`, then `submitHand` with their final value and card count.
4. **Dealer** – the Dealer calls `submitHand`, which sets `hasDealt`.
5. **Settle** – each player calls `getOutcome`; the contract computes the result with the pure `getOutcome` function, transfers any winnings, removes the player's entries and decrements `pendingPayouts`.
6. **Next** – when `pendingPayouts == 0` the Dealer can call `newRound` (resets the dealer hand) or `endGame` (withdraws the remaining bank and exits).

### Safeguards

- **Solvency:** after every settlement the loop only continues if the bank holds at least 250% of the base bet (`minimumBankBalance`), the largest single payout the contract can owe (a blackjack).
- **Access control:** player APIs reject the dealer address, and dealer APIs reject everyone else.
- **State checks:** you cannot double down or buy insurance twice, settle before the dealer has submitted, or surrender after raising your bet.
- **Voided rounds (`reclaim`):** if a player surrendered and the dealer actually has a natural, the round ends as `END`, `playerSurrendered` is set, and every other seated player can call `reclaim` to take their full stake back.
- **Round integrity:** `newRound` and `endGame` both require `pendingPayouts == 0`, so the dealer cannot walk away while players are still owed a result.

### Verification

`getOutcome` is covered by 12 compile-time `assert` cases (blackjack, bust, insurance, push, surrender) and a `forall` property proving the function always returns a valid outcome for any inputs. The Reach compiler verifies the contract on every compile:

| Version | Theorems checked | Result |
| --- | --- | --- |
| v1 | 108 | No failures |
| v2 | 1864 | No failures |
| v2.1 | 1858 | No failures |

---

## Version history

### v1 → v2

- **Stateless to stateful.** v1 had a single `Player.getOutcome(cardValue, cardCount, boughtInsurance, surrendered, doubledDown)` call that took payment and settled in one step. v2 splits the game into separate calls (`placeBet`, `doubleDown`, `buyInsurance`, `surrender`, `submitHand`, `getOutcome`) and keeps each player's bets and hands on-chain in Maps.
- **Splitting** support via first/second hand storage.
- **Dealer controls:** `newRound` and `endGame`, gated by `pendingPayouts`.
- **Reclaim path** for rounds voided by a surrender against a dealer natural.
- **`Bytes(20)` to `Bytes(11)`** for the outcome string.

### v2 → v2.1

- Removed the `touch` API and the trailing empty `parallelReduce` that v2 used as a fix for failing close-outs caused by Map usage.
- In `placeBet`, hand initialisation now happens inside the branch for the hand being placed, instead of resetting both hands on every call.
- The compile log is clean: v2's Algorand close-out and Solidity bytecode-size warnings no longer appear.

---

## The simulation (`index.mjs`)

Each version has an off-chain script that deploys the contract to a Reach **devnet** and plays a full game.

- **Deck:** four 13-card suits (hearts, diamonds, spades, clovers) shuffled into a 52-card deck.
- **Hand scoring:** `cardValue()` handles aces as 1 or 11.
- **Table size:** `maxPlayers()` caps the table at 6 players, and fewer if the bank cannot cover that many worst-case payouts.
- **Funding (defaults):** dealer account 10,000, bank is 90% of that (9,000), base bet 100. Each player is funded with `6 × bet + 100`, enough for the worst case of a split, double down and insurance on both hands, with a small amount for fees.
- **Players:** moves are chosen at random (hit or stand, double down, insurance), and a pair of 8s or Aces is split.
- **Flow:** seat players, take bets, deal, play each player's turn, play the dealer, settle every hand, handle any `reclaim`, then the Dealer ends the game.

### Sample output

`output_files/` contains captured logs of full runs (22 for v1, 31 for v2, 32 for v2.1). A typical v2.1 ending looks like this:

```
[+] The outcome for Player_4 is: [ 'Player Wins' ]
[+] The Round has ended
[+] The Bank is left with 9100 ALGO
[+] The Dealer has ended the game, retrieving the bank balance of 9100 ALGO
```

### What the v2.1 runs show

The last five v2.1 runs (28–32) each seat 6 players with 700 ALGO against a 9,000 ALGO bank and a 100 ALGO bet. In every run, the final bank balance reconciles exactly with the bets taken in and the payouts made:

| Run | Bank at end | Highlights |
| --- | --- | --- |
| 28 | 9,550 | Surrender (player gets 50 back), insurance lost because the dealer's 21 was three cards, double down ending in a push |
| 29 | 9,200 | Two wins, one bust, three losses |
| 30 | 8,750 | Blackjack paid 250 on a 100 bet, dealer bust, three wins |
| 31 | 9,600 | Push, double down lost |
| 32 | 9,100 | Double down lost, three wins |

Across all 32 v2.1 logs, none shows an error. The `reclaim` path (surrender against a dealer natural) appears in runs 20 and 25. **No v2.1 log shows a split or a Retrieve (insurance paying out against a dealer natural).** Those paths exist in the contract and are covered by the compiler's verification, but the saved runs don't demonstrate them.

---

## Running it

You need Docker and the Reach CLI. The repo includes the `reach` launcher script.

```bash
git clone https://github.com/Aro1914/Blackjack.git
cd Blackjack/v2.1

# Compile and verify the contract
../reach compile

# Run the simulation on a local devnet
../reach run
```

`reach run` compiles the contract and runs `index.mjs` against a devnet. The script funds accounts from a faucet, so it only works on devnets.

The `.gitignore` excludes `build/`, `.reach/`, `package.json` and `Dockerfile`, so these are generated when you run the project.

---

## Repository layout

```
Blackjack/
├── reach              # Reach CLI launcher
├── README.md
├── v1/
│   ├── index.rsh      # contract (stateless prototype)
│   ├── index.mjs      # simulation
│   ├── compile.txt    # compiler log
│   └── output_files/  # sample run logs
├── v2/                # stateful contract with split + dealer round cycle
└── v2.1/              # current version
```

---

## Known limitations

These are worth knowing before treating this as more than a demo.

- **Cards are not dealt on-chain.** The deck and shuffle live in the off-chain script. Players and the dealer submit their own `cardValue` and `cardCount`, and the contract trusts them. A player could report a better hand than they hold. A production version would need a commit-reveal scheme or another verifiable randomness approach.
- **Simplified rules.** The dealer's hit or stand is chosen at random (run 28 has the dealer hitting on 18), where standard rules fix it by total. A single 52-card deck is used per run. In the simulation only pairs of 8s or Aces are split (run 31 has a player standing on 7-7).
- **Loose action timing.** The contract doesn't limit double down to the opening two cards (run 28 doubles after a hit), and insurance can be bought whatever the dealer's visible card is (run 28 buys it against a jack). It only pays out when the dealer's 21 is a two-card natural.
- **Devnet only.** The simulation relies on faucet funding.
- **Fixed bet size.** Every bet equals the base bet chosen by the dealer at deployment.
