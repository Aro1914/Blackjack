/**
 * Dry run for the scenario suite. Needs only Node.js, no Reach or Docker.
 *
 *   node dry-run.mjs                 run every scenario
 *   node dry-run.mjs <scenario>      run one scenario
 *
 * It copies index.mjs and scenarios.mjs into a temp folder, swaps the Reach
 * standard library and compiled backend for a small JavaScript model of
 * index.rsh, and runs each scenario against it.
 *
 * What this checks: that the scripted decks and decisions drive the simulation
 * into the intended situation, and that the expected results match the rules
 * as written in index.rsh.
 * What it does not check: the compiled contract itself. Only `reach run`
 * with BJ_SCENARIO set does that.
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const { scenarios } = await import(join(here, 'scenarios.mjs'))

const mockStdlib = `
const DISCONNECT = Symbol('disconnect')
const BET = 100
const PAD = (s) => s.padEnd(11, '\\u0000')
const state = {
	bank: 0, dealerHand: 0, dealerCount: 0, hasDealt: false,
	playerSurrendered: false, pending: 0, keepGoing: true,
	bet1: new Map(), bet2: new Map(), hand1: new Map(), hand2: new Map(),
}
const defaultHand = () => ({ cardValue: 0, cardCount: 0, boughtInsurance: false, surrendered: false, doubledDown: false })
const fail = (m) => { throw new Error(m) }

// Port of getOutcome in index.rsh
const getOutcome = (dealerHand, dealerCount, cardValue, cardCount, insured, surrendered) => {
	if (dealerHand == 21) {
		if (insured && dealerCount == 2) return 'RETRIEVE'
		if (surrendered && dealerCount == 2) return 'END'
		return cardValue == dealerHand ? 'PUSH' : 'D_WINS'
	}
	if (surrendered) return 'D_WINS'
	if (dealerHand > 21) {
		if (cardValue < 22) return cardValue == 21 && cardCount == 2 ? 'BLACKJACK' : 'P_WINS'
		return 'D_WINS'
	}
	if (dealerHand < 21) {
		if (dealerHand > cardValue) return 'D_WINS'
		if (cardValue > dealerHand) {
			if (cardValue == 21 && cardCount == 2) return 'BLACKJACK'
			return cardValue < 22 ? 'P_WINS' : 'D_WINS'
		}
		return 'PUSH'
	}
	return 'D_WINS'
}

const accounts = []
const makeAccount = (bal) => {
	const acc = { bal, id: accounts.length, isDealer: false }
	acc.contract = (backend, info) => {
		if (info === undefined) acc.isDealer = true
		const bets = (first) => (first ? state.bet1 : state.bet2)
		const hands = (first) => (first ? state.hand1 : state.hand2)
		const betOf = (first) => bets(first).get(acc.id) ?? 0
		const handOf = (first) => hands(first).get(acc.id) ?? defaultHand()
		const member = () => state.bet1.has(acc.id) || state.bet2.has(acc.id)
		const notDealer = () => { if (acc.isDealer) fail('You are not authorized to make this call') }
		const pay = (n) => { if (state.bank >= n) { acc.bal += n; state.bank -= n } }
		const cleanup = (first) => { bets(first).delete(acc.id); hands(first).delete(acc.id) }
		const intoBank = (n) => { acc.bal -= n; state.bank += n }
		return {
			getInfo: () => 'mock-contract',
			v: { bank: async () => ['Some', state.bank] },
			p: {
				D: async (interact) => {
					acc.isDealer = true
					acc.bal -= interact.bankAmount
					state.bank = interact.bankAmount
					await interact.deployed(interact.betAmount)
				},
			},
			apis: {
				Player: {
					placeBet: async (first) => {
						notDealer()
						if (betOf(first) !== 0) fail("You've placed a bet already")
						intoBank(BET)
						bets(first).set(acc.id, BET)
						hands(first).set(acc.id, defaultHand())
						state.pending++
						return BET
					},
					doubleDown: async (first) => {
						notDealer()
						if (!member()) fail('You did not place a bet on this game')
						const h = handOf(first)
						if (h.doubledDown) fail('You cannot double down twice')
						intoBank(BET)
						const total = BET + betOf(first)
						bets(first).set(acc.id, total)
						hands(first).set(acc.id, { ...h, doubledDown: true })
						return total
					},
					buyInsurance: async (first) => {
						notDealer()
						if (!member()) fail('You did not place a bet on this game')
						const h = handOf(first)
						if (h.boughtInsurance) fail('You cannot buy insurance twice')
						intoBank(BET)
						const total = BET + betOf(first)
						bets(first).set(acc.id, total)
						hands(first).set(acc.id, { ...h, boughtInsurance: true })
						return total
					},
					surrender: async (first, cardValue, cardCount) => {
						notDealer()
						if (!member()) fail('You did not place a bet on this game')
						if (betOf(first) !== BET) fail('You are not allowed to surrender at this point')
						const result = getOutcome(state.dealerHand, state.dealerCount, cardValue, cardCount, false, true)
						pay(BET / 2)
						cleanup(first)
						state.playerSurrendered = result == 'END'
						state.pending--
						return PAD(result == 'D_WINS' ? 'Dealer Wins' : 'End')
					},
					submitHand: async (first, cardValue, cardCount) => {
						notDealer()
						if (!member()) fail('You did not place a bet on this game')
						if (!(cardCount > 0 && cardValue > 0)) fail('Invalid submission')
						hands(first).set(acc.id, { ...handOf(first), cardValue, cardCount })
						return betOf(first)
					},
					getOutcome: async (first) => {
						notDealer()
						if (!member()) fail('You did not place a bet on this game')
						if (!state.hasDealt) fail('The Dealer is yet to submit his hand')
						const bet = betOf(first)
						const h = handOf(first)
						const r = getOutcome(state.dealerHand, state.dealerCount, h.cardValue, h.cardCount, h.boughtInsurance, h.surrendered)
						let text
						if (r == 'P_WINS') { pay((bet - (h.boughtInsurance ? BET : 0)) * 2); text = 'Player Wins' }
						else if (r == 'D_WINS') text = 'Dealer Wins'
						else if (r == 'PUSH') { pay(bet - (h.boughtInsurance ? BET : 0)); text = 'Push' }
						else if (r == 'BLACKJACK') { pay((bet / 100) * 250); text = 'Blackjack' }
						else { pay(bet); text = 'Retrieve' }
						cleanup(first)
						state.pending--
						return PAD(text)
					},
					reclaim: async (first) => {
						if (!state.playerSurrendered) fail('No one has surrendered with the Dealer having a natural yet')
						if (!member()) fail('You do not have a bet in this game')
						notDealer()
						const bet = betOf(first)
						pay(bet)
						cleanup(first)
						state.pending--
						return bet
					},
				},
				Dealer: {
					submitHand: async (cardValue, cardCount) => {
						if (!(cardCount > 0 && cardValue > 0)) fail('Invalid submission')
						if (!acc.isDealer) fail('You are not authorized to make this call')
						state.dealerHand = cardValue
						state.dealerCount = cardCount
						state.hasDealt = true
						return null
					},
					newRound: async () => {
						if (state.pending !== 0) fail('There are still pending payouts to be made for this round')
						state.dealerHand = 0; state.dealerCount = 0; state.hasDealt = false; state.playerSurrendered = false
						return null
					},
					endGame: async () => {
						if (state.pending !== 0) fail('There are still pending payouts to be made for this round')
						const bank = state.bank
						acc.bal += bank
						state.bank = 0
						return bank
					},
				},
			},
		}
	}
	accounts.push(acc)
	return acc
}

export const loadStdlib = () => ({
	standardUnit: 'ALGO',
	newTestAccount: async (bal) => makeAccount(bal),
	parseCurrency: (x) => x,
	formatCurrency: (x) => String(x),
	balanceOf: async (acc) => acc.bal,
	withDisconnect: async (fn) => {
		try { await fn() } catch (e) { if (e !== DISCONNECT) throw e }
	},
	disconnect: () => { throw DISCONNECT },
})
`

const work = mkdtempSync(join(tmpdir(), 'bj-dry-'))
mkdirSync(join(work, 'node_modules/@reach-sh/stdlib'), { recursive: true })
mkdirSync(join(work, 'build'), { recursive: true })
writeFileSync(join(work, 'node_modules/@reach-sh/stdlib/package.json'), '{"name":"@reach-sh/stdlib","type":"module","main":"index.mjs"}')
writeFileSync(join(work, 'node_modules/@reach-sh/stdlib/index.mjs'), mockStdlib)
writeFileSync(join(work, 'build/index.main.mjs'), 'export {}\n')
writeFileSync(join(work, 'package.json'), '{"type":"module"}')
copyFileSync(join(here, process.env.BJ_HARNESS || 'index.mjs'), join(work, 'index.mjs'))
copyFileSync(join(here, 'scenarios.mjs'), join(work, 'scenarios.mjs'))

const wanted = process.argv[2] ? [process.argv[2]] : Object.keys(scenarios)
let failed = 0
for (const name of wanted) {
	if (!scenarios[name]) {
		console.log(`Unknown scenario "${name}". Available: ${Object.keys(scenarios).join(', ')}`)
		process.exit(1)
	}
	const run = spawnSync('node', ['index.mjs'], {
		cwd: work,
		env: { ...process.env, BJ_SCENARIO: name },
		encoding: 'utf8',
	})
	const out = run.stdout + run.stderr
	const ok = run.status === 0 && out.includes('SCENARIO PASSED')
	if (!ok) failed++
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
	if (!ok || process.env.VERBOSE) console.log(out.split('\n').map((l) => '      ' + l).join('\n'))
}
console.log(failed ? `\n${failed} scenario(s) failed` : '\nAll scenarios passed')
process.exitCode = failed ? 1 : 0
