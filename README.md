# Blackjack on Algorand (Reach)

A multiplayer Blackjack game written as a [Reach](https://docs.reach.sh) smart contract, with a Node.js simulation that plays full rounds against it on a Reach devnet. A dealer funds a **bank**, players bet against it, and the contract holds the money and pays out according to the rules of the game.

The repository holds three iterations of the contract. Each lives in its own folder with its own `index.rsh` (contract), `index.mjs` (simulation) and a saved compiler log, so you can see how the design evolved.

| Version | Folder | Summary |
| --- | --- | --- |
| v1 | `v1/` | Stateless prototype. One `getOutcome` call carries the player's whole hand and bet choices and settles immediately. |
| v2 | `v2/` | Stateful redesign. The contract tracks every player's bets and hands, and adds splitting, a dealer round cycle, and a solvency check. |
| **v2.1** | `v2.1/` | Current version. Same game as v2 with the close-out workaround removed; compiler verification passes, but close-out and bytecode-size warnings remain. <!-- coderabbit-ai-generated:v1 --> <!-- coderabbit-ai-generated-section:v1:1cb4fd636f55a577add7450d973c0addbbdc6b816bb23eb5b06d41354b9dbd2f --> <!-- /coderabbit-ai-generated:v1 --> |

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

For **Player Wins** and **Push**, the insurance stake is forfeited and not returned. For **Blackjack**, the payout is 2.5× the full recorded stake, including insurance: a 100 ALGO base bet with 100 ALGO insurance pays 500 ALGO. <!-- coderabbit-ai-generated:v1 --> <!-- coderabbit-ai-generated-section:v1:228be372e6d98f4aeacd176e054d8535b75980362b10d6e857ff3a4cf59a8165 --> <!-- /coderabbit-ai-generated:v1 -->

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
3. **Play** – players act, optionally calling `doubleDown` or `buyInsurance`, then `Player.submitHand` with their final value and card count. Surrender is a separate path: first call `Dealer.submitHand` so surrender can account for a dealer natural, then call `Player.surrender` for the player’s hand. Surrender settles and removes that hand immediately; do not subsequently pass it to `Player.submitHand` or settle it again with `getOutcome`. <!-- coderabbit-ai-generated:v1 --> <!-- coderabbit-ai-generated-section:v1:21e5e5a4c4452d4fc0b690f5ce1b11d5086194a82e447d39c74937acf4797dba --> <!-- /coderabbit-ai-generated:v1 -->
4. **Dealer** – if not already submitted for surrender, the Dealer calls `submitHand`, which sets `hasDealt`. <!-- coderabbit-ai-generated:v1 --> <!-- coderabbit-ai-generated-section:v1:1420719a3a0d38d3313760d99e64b8ef691d7b27ef40942670037e6deab219b4 --> <!-- /coderabbit-ai-generated:v1 -->
5. **Settle** – each player calls `getOutcome` for each remaining, unsurrendered hand; the contract computes the result with the pure `getOutcome` function, transfers any winnings, removes the player's entries and decrements `pendingPayouts`. <!-- coderabbit-ai-generated:v1 --> <!-- coderabbit-ai-generated-section:v1:6cfb28f1b8ad7a80e8ccd94e6b60ce7cc95ef64eb9fd66fad625879b9c0d534b --> <!-- /coderabbit-ai-generated:v1 -->
6. **Next** – when `pendingPayouts == 0` the Dealer can call `newRound` (resets the dealer hand) or `endGame` (withdraws the remaining bank and exits).

### Safeguards

- **Solvency:** after every settlement the loop only continues if the bank holds at least 250% of the base bet (`minimumBankBalance`), the largest single payout the contract can owe (a blackjack).
- **Access control:** player APIs reject the dealer address, and dealer APIs reject everyone else.
- **State checks:** you cannot double down or buy insurance twice, settle before the dealer has submitted, or surrender after raising your bet.
- **Voided rounds (`reclaim`):** if a player surrendered and the dealer actually has a natural, the round ends as `END`, `playerSurrendered` is set, and every other seated player can call `reclaim` to take their full stake back.
- **Round integrity:** `newRound` and `endGame` both require `pendingPayouts == 0`. However, the solvency threshold above only governs continuation: settlement can reduce the bank below that threshold and trigger automatic exit, transferring the remaining bank to the dealer even while a hand remains pending. The pending-payout check in `endGame` does not protect against this automatic exit. <!-- coderabbit-ai-generated:v1 --> <!-- coderabbit-ai-generated-section:v1:ec599a094a739e308b87e73caf90dd10e6f334dc72c88b74734fd2e1aa41ed4e --> <!-- /coderabbit-ai-generated:v1 -->

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
- Compiler verification passes (1858 theorems, no failures), but `v2.1/compile_v2.1.txt` still records an Algorand close-out warning about Map entries and Solidity bytecode-size warnings (63,070 and 31,084 bytes versus the 24,576-byte limit). <!-- coderabbit-ai-generated:v1 --> <!-- coderabbit-ai-generated-section:v1:056a871062154d1df44518bbba01ea77265cd12ebec66e5a48d516bd29b482c1 --> <!-- /coderabbit-ai-generated:v1 -->

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

## Scripted scenarios (v2.1)

A normal run is random, so rare paths can go unexercised: none of the 32 saved v2.1 runs contains a split or a Retrieve. Scenario mode removes the luck. It replaces the shuffle with a fixed deck order and replaces every random decision (hit or stand, double down, insurance, surrender, the dealer's moves) with a script. After the round, the simulation compares the results with what the scenario expects and exits with code 1 on any difference.

| Scenario | What it exercises | Expected |
| --- | --- | --- |
| `split-eights-double` | Split a pair of 8s, double down on one split hand, a second player pushes | Player_1: Player Wins and Dealer Wins; Player_2: Push; bank 8,900 |
| `insured-dealer-natural` | Dealer Ace up with a natural, one insured player and one not | Player_1: Retrieve; Player_2: Dealer Wins; bank 9,100 |
| `split-insured-dealer-natural` | Split 8s with insurance bought on both hands against a dealer natural | Both hands Retrieve; bank 9,000 |
| `split-aces-twentyone` | Split Aces where the first hand is dealt a King for 21 | Blackjack and Player Wins; bank 8,750 |
| `surrender-voids-round` | Surrender against a dealer natural voids the round, so the other players `reclaim` | Surrender result End; reclaims of 200 and 100; bank 9,050 |

Scenarios live in `scenarios.mjs`, which documents the deck order and the meaning of each scripted decision. To add one, give it a deck, a list of rolls and an `expect` block.

**Running one on a devnet:**

```bash
BJ_SCENARIO=split-eights-double ../reach run
```

The name can also be passed as the first argument. I haven't confirmed that `reach run` forwards either one to the script. If neither arrives, set `requested` near the top of `index.mjs` to the scenario name.

**Checking scenarios without Reach:**

```bash
node dry-run.mjs                      # every scenario
node dry-run.mjs split-aces-twentyone # one scenario
```

The dry run replaces the Reach library and compiled backend with a small JavaScript model of `index.rsh`. It confirms that each script drives the simulation into the intended situation and that the expected results follow the rules as written in the contract. It does not test the compiled contract, which only a `reach run` can do.

### What building the suite found

When a split hand is dealt 21 on its first extra card, which can only happen after splitting Aces, the simulation logged "dealt a natural" but never submitted the hand. In `index.rsh` an unsubmitted hand is stored as value 0, so in the dry-run model the winning 21 settles as Dealer Wins. `split-aces-twentyone` shows this: without the fix it ends with bank 9,000 instead of 8,750. `index.mjs` now submits that hand. This comes from reading the code and the model, and hasn't been confirmed on a devnet.

Other changes to `index.mjs` are listed in `index.mjs.patch`: the scenario hooks, and the split step's empty `catch` block now logs its error instead of hiding it.

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
    ├── index.rsh      # contract
    ├── index.mjs      # simulation, with scenario mode
    ├── scenarios.mjs  # scripted scenarios and expected results
    └── dry-run.mjs    # runs the scenarios against a JavaScript model, no Reach needed
```

---

## Known limitations

These are worth knowing before treating this as more than a demo.

- **Cards are not dealt on-chain.** The deck and shuffle live in the off-chain script. Players and the dealer submit their own `cardValue` and `cardCount`, and the contract trusts them. A player could report a better hand than they hold. A production version would need a commit-reveal scheme or another verifiable randomness approach.
- **Simplified rules.** The dealer's hit or stand is chosen at random (run 28 has the dealer hitting on 18), where standard rules fix it by total. A single 52-card deck is used per run. In the simulation only pairs of 8s or Aces are split (run 31 has a player standing on 7-7).
- **Loose action timing.** The contract doesn't limit double down to the opening two cards (run 28 doubles after a hit) and doesn't check the dealer's visible card before accepting insurance. The simulation offers insurance only against a ten-value card or an Ace, where standard rules allow it against an Ace only. Insurance pays out only when the dealer's 21 is a two-card natural.
- **Split 21 pays as Blackjack.** The contract treats any two-card 21 as Blackjack (2.5×), including one made on a split hand (an Ace and a ten-value card after splitting Aces). Many casinos pay such a hand at 1:1.
- **Devnet only.** The simulation relies on faucet funding.
- **Fixed bet size.** Every bet equals the base bet chosen by the dealer at deployment.
