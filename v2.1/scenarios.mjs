/**
 * Scripted Blackjack scenarios for v2.1
 *
 * Each scenario fixes two things that are random in a normal run:
 *
 *  1. deck:  the exact order cards leave the deck. Codes are face + suit, with
 *            suits h = hearts, d = diamonds, s = spades, c = clovers.
 *            Initial deal order for N players is:
 *              P1, P2 ... PN, Dealer (first card), P1, P2 ... PN, Dealer (second card)
 *            After that, cards are drawn in the order the game calls for them
 *            (splits, doubles, hits), player by player, then the dealer.
 *
 *  2. rolls: the answer to every decision the simulation would otherwise make
 *            at random, in the order the simulation asks. Each entry is a whole
 *            number from 0 to n - 1, where n is the number of choices:
 *              insurance / surrender prompt (n = 3): 0 = buy insurance, 1 = surrender, 2 = neither
 *              hit or stand                 (n = 2): 0 = Hit, 1 = Stand
 *              double down prompt           (n = 2): 0 = no, 1 = yes
 *              dealer hit or stand          (n = 2): 0 = Stand, 1 = Hit
 *            The insurance / surrender prompt only appears when the dealer's
 *            visible card is a ten-value card or an Ace. The double down prompt
 *            only appears when a hand totals 9, 10 or 11.
 *            Against a ten-value or Ace upcard, a hand totalling 10 or less is forced to hit.
 *
 * `expect` is what a correct run must produce. After the round, the simulation compares
 * the real results with it and exits with code 1 on any difference:
 *   outcomes:   result string per hand, keyed Player_N (first hand) or Player_N/2 (second hand)
 *   surrenders: result of a surrender call, same keys
 *   reclaims:   amount reclaimed after a voided round, same keys
 *   bank:       the contract's bank balance once the round is settled
 *
 * Bank figures assume the defaults in index.mjs: bank 9000, base bet 100.
 */
export const scenarios = {
	'split-eights-double': {
		description:
			'A pair of 8s is split, the first hand doubles down and wins, the second hand loses to the dealer, and a second player pushes',
		players: 2,
		deck: [
			'8h', '10h', '6s', // first card: Player_1, Player_2, Dealer
			'8d', '9c', '10d', // second card: Player_1, Player_2, Dealer
			'3c', 'Qs', // split: Player_1 first hand gets 3 (11), second hand gets Q (18)
			'Kh', // Player_1 doubles down on 11 and receives K (21)
			'3d', // Dealer hits 16 and receives 3 (19)
		],
		rolls: [
			0, 1, // Player_1 first hand: hit/stand ignored, then double down
			1, // Player_1 second hand: stand on 18
			1, // Player_2: stand on 19
			1, 0, // Dealer: hit on 16, then stand on 19
		],
		expect: {
			outcomes: {
				Player_1: 'Player Wins',
				'Player_1/2': 'Dealer Wins',
				Player_2: 'Push',
			},
			bank: 8900,
		},
	},

	'insured-dealer-natural': {
		description:
			'The dealer shows an Ace and holds a natural. The insured player gets their stake back (Retrieve), the uninsured player loses',
		players: 2,
		deck: [
			'10h', '7h', 'As', // first card: Player_1, Player_2, Dealer
			'9h', '8h', 'Kh', // second card: Player_1, Player_2, Dealer (natural)
		],
		rolls: [
			0, 1, // Player_1: buys insurance, then stands on 19
			2, 1, // Player_2: no insurance or surrender, then stands on 15
		],
		expect: {
			outcomes: {
				Player_1: 'Retrieve',
				Player_2: 'Dealer Wins',
			},
			bank: 9100,
		},
	},

	'split-insured-dealer-natural': {
		description:
			'A pair of 8s is split and insurance is bought on both hands against a dealer natural, so both hands are retrieved',
		players: 1,
		deck: [
			'8h', 'Ks', // first card: Player_1, Dealer
			'8d', 'Ad', // second card: Player_1, Dealer (natural)
			'3c', '10h', // split: first hand gets 3 (11), second hand gets 10 (18)
		],
		rolls: [
			0, 1, 0, // first hand: buys insurance, stands, declines to double down
			0, 1, // second hand: buys insurance, stands on 18
		],
		expect: {
			outcomes: {
				Player_1: 'Retrieve',
				'Player_1/2': 'Retrieve',
			},
			bank: 9000,
		},
	},

	'split-aces-twentyone': {
		description:
			'A pair of Aces is split and the first hand is dealt a King for 21. That hand must still be submitted and settled',
		players: 1,
		deck: [
			'Ah', '6s', // first card: Player_1, Dealer
			'As', '10d', // second card: Player_1, Dealer (16)
			'Kc', '5h', // split: first hand gets K (21), second hand gets 5 (soft 16)
			'5c', // second hand hits and receives 5 (21)
		],
		rolls: [
			0, // second hand: hit
			0, // Dealer: stand on 16
		],
		expect: {
			// The contract counts any two-card 21 as Blackjack, so a 21 on a split Ace pays 2.5x
			outcomes: {
				Player_1: 'Blackjack',
				'Player_1/2': 'Player Wins',
			},
			bank: 8750,
		},
	},

	'surrender-voids-round': {
		description:
			'The dealer holds a natural and a player surrenders, so the round is voided and the remaining players reclaim their full stakes',
		players: 3,
		deck: [
			'10h', '7d', '5c', 'Ks', // first card: Player_1, Player_2, Player_3, Dealer
			'9h', '8c', '4d', 'Ad', // second card: Player_1, Player_2, Player_3, Dealer (natural)
		],
		rolls: [
			0, 1, // Player_1: buys insurance, stands on 19
			1, // Player_2: surrenders (Player_3 never takes a turn)
		],
		expect: {
			surrenders: { Player_2: 'End' },
			reclaims: { Player_1: 200, Player_3: 100 },
			bank: 9050,
		},
	},
}
