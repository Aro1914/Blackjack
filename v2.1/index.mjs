import { loadStdlib } from '@reach-sh/stdlib'
import * as backend from './build/index.main.mjs'
import { scenarios } from './scenarios.mjs'
const reach = loadStdlib({ REACH_NO_WARN: 'Y' })

// Scenario mode ---------------------------------------
// Set BJ_SCENARIO=<name> (or pass the name as the first argument) to replay a
// scripted game: a fixed deck order and fixed player/dealer decisions.
// Without it, the game is fully random, exactly as before.
const requested = process.env.BJ_SCENARIO || process.argv[2]
if (requested && !Object.prototype.hasOwnProperty.call(scenarios, requested)) {
	console.log(
		`[!] Unknown scenario "${requested}". Available: ${Object.keys(
			scenarios
		).join(', ')}`
	)
	process.exit(1)
}
const scenario = requested ? scenarios[requested] : null
const scriptedRolls = scenario ? [...scenario.rolls] : null
const record = { outcomes: {}, reclaims: {}, surrenders: {}, bank: null }

/**
 * Picks a whole number from 0 to n - 1.
 * Random normally, but read from the scenario's script in scenario mode.
 * @param {Number} n The number of possible results
 * @returns A whole number from 0 to n - 1
 */
const roll = (n) => {
	if (!scriptedRolls) return Math.floor(Math.random() * n)
	if (!scriptedRolls.length)
		throw new Error(`Scenario "${requested}" ran out of scripted rolls`)
	const r = scriptedRolls.shift()
	if (!(Number.isInteger(r) && r >= 0 && r < n))
		throw new Error(`Scripted roll ${r} is not valid for a choice of ${n}`)
	return r
}

/**
 * Converts a Byte input to String, stripping it of any null character
 * @param {Byte} byte A Byte value
 * @returns A String value without null characters
 */
const noneNull = (byte) => {
	let string = '',
		i = 0
	const len = byte.length
	for (i; i < len; i++) {
		if (String(byte[i]) !== String('\u0000')) {
			string += byte[i]
		}
	}
	return string
}

const hearts = {
	A: '+',
	2: 2,
	3: 3,
	4: 4,
	5: 5,
	6: 6,
	7: 7,
	8: 8,
	9: 9,
	10: 10,
	J: 10,
	K: 10,
	Q: 10,
}

const diamonds = {
	A: '+',
	2: 2,
	3: 3,
	4: 4,
	5: 5,
	6: 6,
	7: 7,
	8: 8,
	9: 9,
	10: 10,
	J: 10,
	K: 10,
	Q: 10,
}

const spades = {
	A: '+',
	2: 2,
	3: 3,
	4: 4,
	5: 5,
	6: 6,
	7: 7,
	8: 8,
	9: 9,
	10: 10,
	J: 10,
	K: 10,
	Q: 10,
}

const clovers = {
	A: '+',
	2: 2,
	3: 3,
	4: 4,
	5: 5,
	6: 6,
	7: 7,
	8: 8,
	9: 9,
	10: 10,
	J: 10,
	K: 10,
	Q: 10,
}

const choices = ['Hit', 'Stand']
/**
 * Hit:
 * Take a card from the deck,
 * with the hopes of making the sum of card values closer to 21
 */

/**
 * Stand:
 * End a turn, and keep the cards dealt
 */

/**
 * Double Down:
 * A player doubles his bet, then is dealt an additional card, and is made to stand
 */

const outcomes = ['Player Wins', 'Dealer Wins', 'Push', 'Blackjack', 'Retrieve']
/**
 * Player Wins:
 * A player's cards is equal or closer to 21 than the dealer's,
 * then the player gets back his bet amount and additional equal amount
 */

/**
 * Dealer Wins:
 * The dealer's cards is equal or closer to 21 then the player's,
 * the the player loses his bet
 */

/**
 * Push:
 * The dealer's cards is equal to a player's cards,
 * then there are no exchange of bets
 */

/**
 * Blackjack:
 * A player is dealt a natural with the Dealer not having one upon reveal,
 * then the player gets back his bet amount,
 * and an amount equal to one and half his bet amount
 */

/**
 * Retrieve:
 * A player pays insurance and the Dealer does have a natural,
 * so his bet plus insurance is returned
 */

const events = ['Bust', 'Split']
/**
 * Bust:
 * A player's or dealer's cards value exceeded 21
 */

/**
 * Split:
 * When a player is dealt a pair of cards,
 * the cards are split, each with it's own bet,
 * then the player is dealt 2 more additional cards,
 * 1 for each hand
 */

/**
 * Takes in four stacks of 13 unique cards each and shuffles then into a deck of 52 cards
 * @param {Object} hearts An Object representing a stack of Hearts
 * @param {Object} diamonds An Object representing a stack of Diamonds
 * @param {Object} spades An Object representing a stack of Spades
 * @param {Object} clovers An Object representing a stack of Clovers
 * @returns An array representing a shuffled deck of 52 cards if the length of each stack were exactly 13, else returns an empty array
 */
const shuffleDeck = (hearts, diamonds, spades, clovers) => {
	const heartKeys = Object.keys(hearts)
	const diamondKeys = Object.keys(diamonds)
	const spadeKeys = Object.keys(spades)
	const cloverKeys = Object.keys(clovers)

	if (
		heartKeys.length != 13 ||
		diamondKeys.length != 13 ||
		spadeKeys.length != 13 ||
		cloverKeys.length != 13
	)
		return []

	const newDeck = []
	let deckLength =
		heartKeys.length + diamondKeys.length + spadeKeys.length + cloverKeys.length
	const deck = [heartKeys, diamondKeys, spadeKeys, cloverKeys]
	const deckMap = ['hearts', 'diamonds', 'spades', 'clovers']
	for (deckLength; deckLength > 0; deckLength--) {
		let cardType = Math.floor(Math.random() * deck.length)
		const faceIndex = Math.floor(Math.random() * deck[cardType].length)
		newDeck.push([deck[cardType][faceIndex], deckMap[cardType]])
		deck[cardType].splice(faceIndex, 1)
		if (!deck[cardType].length) {
			deck.splice(cardType, 1)
			deckMap.splice(cardType, 1)
		}
	}
	return newDeck
}

/**
 * Builds a deck in an exact order from short card codes, e.g. ['8h', '10d', 'As'].
 * Suits: h = hearts, d = diamonds, s = spades, c = clovers.
 * @param {Array[String]} codes The cards in the order they will be dealt
 * @returns An array of cards, in the same shape shuffleDeck returns
 */
const buildDeck = (codes) => {
	const suits = { h: 'hearts', d: 'diamonds', s: 'spades', c: 'clovers' }
	const faces = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
	const seen = new Set()
	return codes.map((code) => {
		const face = code.slice(0, -1)
		const suit = suits[code.slice(-1)]
		if (!faces.includes(face) || !suit)
			throw new Error(`Invalid card code "${code}"`)
		if (seen.has(code)) throw new Error(`Card "${code}" appears twice`)
		seen.add(code)
		return [face, suit]
	})
}

const shuffledDeck = scenario
	? buildDeck(scenario.deck)
	: shuffleDeck(hearts, diamonds, spades, clovers)

/**
 * Formats BigNumber microalgos to Algos in String
 * @param {BigNumber} x A BigNumber value of microalgos
 * @returns A formatted Algo value in String
 */
const fmt = (x) => reach.formatCurrency(x, 4)

/**
 * Retrieves the balance of an account
 * @param {Object} who An account
 * @returns A formatted Algo value in String
 */
const balOf = async (who) => fmt(await reach.balanceOf(who))

/**
 * Calculates the value of a Player's cards at hand
 * @param {Array[Array[Number | String]]} cards An array of arrays representing a player's cards
 * @returns The value of a Player's cards at hand
 */
const cardValue = (cards) => {
	if (!cards.length) return cards.length
	const faces = {
		2: 2,
		3: 3,
		4: 4,
		5: 5,
		6: 6,
		7: 7,
		8: 8,
		9: 9,
		10: 10,
		J: 10,
		K: 10,
		Q: 10,
	}
	let value = 0
	const As = {
		count: 0,
	}
	const cardLength = cards.length
	let i = 0
	for (i; i < cardLength; i++) {
		const card = cards[i]
		if (card[0] == 'A') {
			As.count++
			continue
		} else {
			value += faces[card[0]]
		}
	}
	const aCount = As.count
	let i_ = 0
	value += As.count
	if (value == 21) return value
	for (i_; i_ < aCount; i_++) {
		if (value + 10 == 21) return value + 10
		else if (value + 10 < 21) value += 10
		else break
	}
	return value
}

// Game Flow---------------------------------------------
const dealerStartingBal = 10000
const accDealer = await reach.newTestAccount(
	reach.parseCurrency(dealerStartingBal)
)

/**
 * Calculates a 90 percent value of the dealer's account balance for the bank amount
 * @param {Number} dealerStartingBal The dealer's starting balance
 * @returns 90 percent of the dealer's balance
 */
const bankAmount = (dealerStartingBal) => (dealerStartingBal / 100) * 90
const betAmount = 100

/**
 * Calculates the maximum amount of players for a game, based off the bank balance and relative to the internal maximumAccommodationRecommended
 * @param {Number} bankAmount The amount held in the bank
 * @param {Number} betAmount The base bet amount
 * @returns The maximum allowed number of players, a value not exceeding the internal maximumAccommodationRecommended
 */
const maxPlayers = (bankAmount, betAmount) => {
	const maximumAccommodationByBankBalance = Math.floor(
		bankAmount / ((betAmount / 100) * 250)
	)
	const maximumAccommodationRecommended = 6 // Must be hardcoded,
	// in consideration of the amount of players a deck can accommodate after deals have been made
	return maximumAccommodationByBankBalance > maximumAccommodationRecommended
		? maximumAccommodationRecommended
		: maximumAccommodationByBankBalance
}
const startingBalance = reach.parseCurrency(betAmount * 6 + 100) // This is because
// the maximum possible bet paid by a player can only be from
// a player who splits, and then also doubles down and
// pays insurance for both hands.
// The additional 100 is just for fees, can be conveniently reduced to as little as 5.
const ctc = accDealer.contract(backend)
let playerSurrendered = false
console.log("[+] Welcome to Apostrophe's Blackjack Game")
const dealer = {
	account: accDealer,
	ctc,
	balance: async () => await balOf(accDealer),
	cards: [],
}
console.log('[+] The Dealer is ready')

/**
 * Generates any amount of Players for the game
 * @param {Number} amount The amount of players to be generated
 * @returns An array of player objects
 */
const generatePlayers = async (amount) => {
	const players = []
	let i = 0
	for (i; i < amount; i++) {
		const acc = await reach.newTestAccount(startingBalance)
		const ctc = acc.contract(backend, dealer.ctc.getInfo())
		players.push({
			account: acc,
			ctc,
			balance: async () => await balOf(acc),
			cards: [],
			cards_: [],
			surrendered: false,
			surrendered_: false,
		})
	}
	return players
}

/**
 * Simulates play for a Player at the Table
 * @param {Object} player A player object representing a player on the table
 * @param {String} who The player identifier
 * @returns True if the player surrendered, but if not, false
 */
const play = async (player, who) => {
	let result = false
	if (cardValue(player.cards) == 21) {
		try {
			console.log(`[+] ${who} was dealt a natural`)
			await player.ctc.apis.Player.submitHand(
				true,
				cardValue(player.cards),
				player.cards.length
			)
			console.log(`[-] ${who} has submitted his hand`)
			console.log('')
		} catch (error) {
			console.log({ error })
		}
		// Possible blackjack win
		return result
	}
	if (
		(player.cards[0][0] == '8' || player.cards[0][0] == 'A') &&
		player.cards[0][0] == player.cards[1][0]
	) {
		// A split must occur
		try {
			console.log(`[+] ${who} decides to split his identical cards`)
			const totalBet = fmt(await player.ctc.apis.Player.placeBet(false))
			player.cards_.push(player.cards.pop())
			console.log(
				`[+] ${who} has paid for his second hand an extra: ${totalBet} ${reach.standardUnit}`
			)
			console.log(`[+] Dealing ${who} extra cards for both hands`)
			dealCard(player.cards, 1)
			console.log(
				`[-] ${who} was dealt:`,
				player.cards[player.cards.length - 1]
			)
			dealCard(player.cards_, 1)
			console.log(
				`[-] ${who}'s second hand was dealt:`,
				player.cards_[player.cards_.length - 1]
			)
		} catch (error) {
			console.log({ error })
		}
	}
	const dealerFirstCard = dealer.cards[0][0]
	const tenCardsNA = {
		J: 'J',
		Q: 'Q',
		K: 'K',
		A: 'A',
		10: '10',
	}
	if (cardValue(player.cards) != 21) {
		if (dealerFirstCard in tenCardsNA) {
			const move = roll(3)
			if (move == 0 && !playerSurrendered) {
				try {
					const totalBet = fmt(await player.ctc.apis.Player.buyInsurance(true))
					console.log(
						`[+] ${who} bought insurance, making his total bet: ${totalBet} ${reach.standardUnit}`
					)
				} catch (error) {
					console.log({ error })
				}
			} else if (move == 1 && !playerSurrendered) {
				player.surrendered = true
				result = true
				playerSurrendered = true
			}
		}
		if (!player.surrendered) {
			let hasDecided = false
			let value = cardValue(player.cards)
			while (value < 21) {
				const choice = choices[roll(choices.length)]
				if (
					cardValue(player.cards) == 9 ||
					cardValue(player.cards) == 10 ||
					(cardValue(player.cards) == 11 && hasDecided == false)
				) {
					const doubleDown = roll(2)
					if (doubleDown) {
						try {
							const totalBet = fmt(
								await player.ctc.apis.Player.doubleDown(true)
							)
							dealCard(player.cards, 1)
							console.log(
								`[+] ${who} doubled down, making his total bet: ${totalBet} ${reach.standardUnit}`
							)
							console.log(
								`[-] ${who} was dealt:`,
								player.cards[player.cards.length - 1]
							)
						} catch (error) {
							console.log({ error })
						}
						value = cardValue(player.cards)
						break
					}
				}
				if (
					choice == 'Hit' ||
					(dealerFirstCard in tenCardsNA && cardValue(player.cards) <= 10)
				) {
					if (cardValue(player.cards) == 20) {
						console.log(`[+] ${who} stood`)
						break
					}
					dealCard(player.cards, 1)
					console.log(`[+] ${who} called for a hit`)
					console.log(
						`[-] ${who} was dealt:`,
						player.cards[player.cards.length - 1]
					)
					value = cardValue(player.cards)
				} else if (choice == 'Stand') {
					console.log(`[+] ${who} stood`)
					value = cardValue(player.cards)
					break
				}
				hasDecided == true
			}
			try {
				console.log(`[+] ${who} submits his hand`)
				await player.ctc.apis.Player.submitHand(
					true,
					cardValue(player.cards),
					player.cards.length
				)
			} catch (error) {
				console.log({ error })
			}
			console.log(
				`[+] ${who}'s card value is ${value}${
					value > 21 ? `, It's a Bust!` : ''
				}`
			)
			console.log('')
		}
	} else {
		console.log(`[+] ${who} was dealt a natural`)
		// A split hand that reaches 21 on its first extra card must still be submitted,
		// otherwise the contract has no hand on record for it
		try {
			await player.ctc.apis.Player.submitHand(
				true,
				cardValue(player.cards),
				player.cards.length
			)
			console.log(`[-] ${who} has submitted his hand`)
		} catch (error) {
			console.log({ error })
		}
		console.log('')
	}
	if (player.cards_.length) {
		if (cardValue(player.cards_) != 21) {
			if (dealerFirstCard in tenCardsNA) {
				const move = roll(3)
				if (move == 0) {
					try {
						const totalBet = fmt(
							await player.ctc.apis.Player.buyInsurance(false)
						)
						console.log(
							`[+] ${who} bought insurance for his second hand, making his total bet: ${totalBet} ${reach.standardUnit}`
						)
					} catch (error) {
						console.log({ error })
					}
				} else if (move == 1 && !playerSurrendered) {
					player.surrendered_ = true
					result = true
					playerSurrendered = true
				}
			}
			if (!player.surrendered_) {
				let hasDecided = false
				let value = cardValue(player.cards_)
				while (value < 21) {
					const choice = choices[roll(choices.length)]
					if (
						cardValue(player.cards_) == 9 ||
						cardValue(player.cards_) == 10 ||
						(cardValue(player.cards_) == 11 && hasDecided == false)
					) {
						const doubleDown = roll(2)
						if (doubleDown) {
							try {
								const totalBet = fmt(
									await player.ctc.apis.Player.doubleDown(false)
								)
								dealCard(player.cards_, 1)
								console.log(
									`[+] ${who} doubled down on his second hand, making his total bet: ${totalBet} ${reach.standardUnit}`
								)
								console.log(
									`[-] ${who}'s second hand was dealt:`,
									player.cards_[player.cards_.length - 1]
								)
							} catch (error) {
								console.log({ error })
							}
							value = cardValue(player.cards_)
							break
						}
					}
					if (
						choice == 'Hit' ||
						(dealerFirstCard in tenCardsNA && cardValue(player.cards_) <= 10)
					) {
						if (cardValue(player.cards_) == 20) break
						dealCard(player.cards_, 1)
						console.log(`[+] ${who} called for a hit on his second hand`)
						console.log(
							`[-] ${who} was dealt:`,
							player.cards_[player.cards_.length - 1]
						)
						value = cardValue(player.cards_)
					} else if (choice == 'Stand') {
						console.log(`[+] ${who} stood his second hand`)
						value = cardValue(player.cards_)
						break
					}
					hasDecided = true
				}
				try {
					console.log(`[+] ${who} submits his second hand`)
					await player.ctc.apis.Player.submitHand(
						false,
						cardValue(player.cards_),
						player.cards_.length
					)
				} catch (error) {
					console.log({ error })
				}
				console.log(
					`[+] ${who}'s second hand card value is ${value}${
						value > 21 ? `, It's a Bust!` : ''
					}`
				)
				console.log('')
			}
		} else {
			console.log(`[+] ${who} was dealt a natural on his second hand`)
			try {
				await player.ctc.apis.Player.submitHand(
					false,
					cardValue(player.cards_),
					player.cards_.length
				)
				console.log(`[-] ${who} has submitted his second hand`)
			} catch (error) {
				console.log({ error })
			}
			console.log('')
		}
	}
	return result
}

/**
 * Simulates play for the Dealer
 * @param {Object} dealer A dealer object representing the Dealer
 * @param {Boolean} onSurrender A boolean indicating if the Dealer was called to check his cards due a player surrendering
 * @returns True if the Dealer had a natural, but if not, false
 */
const playDealer = async (dealer, onSurrender = false) => {
	if (onSurrender) {
		try {
			await dealer.ctc.apis.Dealer.submitHand(
				cardValue(dealer.cards),
				dealer.cards.length
			)
		} catch (error) {
			console.log({ error })
		}
		return false
	}
	if (cardValue(dealer.cards) == 21) {
		// Possible blackjack win
		try {
			await dealer.ctc.apis.Dealer.submitHand(
				cardValue(dealer.cards),
				dealer.cards.length
			)
			console.log(
				`[+] Dealer has a natural, as his second card is:`,
				dealer.cards[1]
			)
			console.log(
				`[+] Dealer's card value is`,
				String(cardValue(dealer.cards)),
				`${Number(cardValue(dealer.cards)) > 21 ? `, It's a Bust!` : ''}`
			)
		} catch (error) {
			console.log({ error })
		}
		return true
	} else {
		console.log(`[+] Dealer now reveals his second card:`, dealer.cards[1])
		let value = cardValue(dealer.cards)
		let keepPlaying = true
		while (keepPlaying && value < 21) {
			const choice = roll(2)
			if (choice) {
				dealCard(dealer.cards, 1)
				console.log(`[+] Dealer called for a hit`)
				console.log(
					`[-] Dealer was dealt:`,
					dealer.cards[dealer.cards.length - 1]
				)
			} else {
				console.log(`[+] Dealer stood`)
				break
			}
			value = cardValue(dealer.cards)
		}
		try {
			await dealer.ctc.apis.Dealer.submitHand(
				cardValue(dealer.cards),
				dealer.cards.length
			)
			console.log(
				`[+] Dealer's card value is`,
				String(cardValue(dealer.cards)),
				`${value > 21 ? `, It's a Bust!` : ''}`
			)
		} catch (error) {
			console.log({ error })
		}
		return false
	}
}

/**
 * Gets the outcome of a player's submission
 * @param {Object} player A player object representing a player on the table
 * @param {String} who The player identifier
 * @param {Boolean} isFirstHand An indicator as which hand is being evaluated
 * @returns A string array representing the outcome of a player's submission
 */
const getOutcome = async (player, who, isFirstHand = true) => {
	const outcome = []
	if (!player.cards_.length) {
		try {
			console.log(`[-] ${who}'s hand is:`, player.cards)
			const byteResponse = await player.ctc.apis.Player.getOutcome(isFirstHand)
			console.log(`[-] ${who} awaits his outcome`)
			const response = noneNull(byteResponse)
			outcome.push(response)
		} catch (error) {
			console.log({ error })
		}
	} else {
		try {
			if (isFirstHand) {
				console.log(`[-] ${who}'s hand is:`, player.cards)
				const byteResponse = await player.ctc.apis.Player.getOutcome(
					isFirstHand
				)
				console.log(`[-] ${who} awaits his outcome`)
				const response = noneNull(byteResponse)
				outcome.push(response)
			} else {
				console.log(`[-] ${who}'s second hand is:`, player.cards_)
				const byteResponse_ = await player.ctc.apis.Player.getOutcome(
					isFirstHand
				)
				console.log(`[-] ${who} awaits his second outcome`)
				const response_ = noneNull(byteResponse_)
				outcome.push(response_)
			}
		} catch (error) {
			console.log({ error })
		}
	}
	if (outcome.length) record.outcomes[`${who}${isFirstHand ? '' : '/2'}`] = outcome[0]
	return outcome
}

/**
 * Deals cards to those at the table
 * @param {Array[Array[Number | String]]} cards An array of arrays representing a player's cards
 * @param {Number} amount The amount of cards to be dealt at a time
 */
const dealCard = (cards = [], amount = 1) => {
	let i = 0
	for (i; i < amount; i++) {
		if (!shuffledDeck.length)
			throw new Error('The deck ran out of cards')
		cards.push(shuffledDeck.shift())
	}
}

/**
 * Simulates the Game
 * @param {Number} playerCount The number of players to be simulated for the game
 * @returns undefined
 */
const simulatePlay = async (playerCount = 4) => {
	const cardCount = 2
	let i = 0,
		o = 0,
		gameEnded = false
	const players = await generatePlayers(playerCount)
	console.log(`[+] The players are taking their seat at the table`)
	for (i; i < playerCount; i++) {
		const player = players[i]
		try {
			console.log(
				`[-] Player_${
					i + 1
				} comes in with a balance of: ${await player.balance()} ${
					reach.standardUnit
				}`
			)
		} catch (error) {
			console.log({ error })
		}
	}
	i = 0
	console.log('')
	console.log('[+] Players are seated')
	for (i; i < playerCount; i++) {
		const player = players[i]
		try {
			await player.ctc.apis.Player.placeBet(true)
			console.log(
				`[-] Player_${
					i + 1
				} has placed his bet, with a resulting balance of: ${await player.balance()} ${
					reach.standardUnit
				}`
			)
		} catch (error) {
			console.log({ error })
		}
	}
	i = 0
	console.log('')
	console.log('[+] Dealing their cards')
	for (o; o < cardCount; o++) {
		for (i; i < playerCount; i++) {
			const player = players[i]
			dealCard(player.cards, 1)
			console.log(
				`[-] Player_${i + 1} was dealt:`,
				player.cards[player.cards.length - 1]
			)
		}
		i = 0
		console.log('[+] Dealing the Dealer')
		dealCard(dealer.cards, 1)
	}
	console.log('[+] Dealing complete')
	console.log('')
	console.log('[+] These are the initial cards')
	for (i; i < playerCount; i++) {
		const player = players[i]
		console.log(`[-] Player_${i + 1} has:`, player.cards)
	}
	console.log(`[+] The Dealer's visible card is:`, dealer.cards[0])
	i = 0
	console.log('')
	console.log('[+] Players can now have their turns')
	for (i; i < playerCount; i++) {
		const player = players[i]
		const playerSurrendered = await play(player, `Player_${i + 1}`)
		if (playerSurrendered) {
			await playDealer(dealer, true)
			const balBefore = await player.balance()
			if (player.surrendered) {
				console.log(
					`[-] Player_${
						i + 1
					} surrendered, his current balance is: ${balBefore} ${
						reach.standardUnit
					}`
				)
				const outcome = noneNull(
					await player.ctc.apis.Player.surrender(
						true,
						cardValue(player.cards),
						player.cards.length
					)
				)

				record.surrenders[`Player_${i + 1}`] = outcome
				if (outcome == 'End') {
					console.log(
						`[-] Player_${
							i + 1
						} surrendered with the Dealer actually having a natural`
					)
					console.log("[+] The Dealer's hand", dealer.cards)
					console.log(
						`[-] Player_${i + 1}'s balance after viewing his outcome is:`,
						await player.balance(),
						reach.standardUnit
					)
					console.log('')
					gameEnded = true
					break
				} else {
					console.log(`[+] Dealer does not have a natural`)
					console.log(
						`[-] Player_${i + 1}'s balance after viewing his outcome is:`,
						await player.balance(),
						reach.standardUnit
					)
					console.log('[+] The Game continues')
					console.log('')
				}
			} else {
				console.log(
					`[-] Player_${
						i + 1
					} surrendered his second hand, his current balance is: ${balBefore} ${
						reach.standardUnit
					}`
				)
				const outcome = noneNull(
					await player.ctc.apis.Player.surrender(
						false,
						cardValue(player.cards_),
						player.cards_.length
					)
				)
				record.surrenders[`Player_${i + 1}/2`] = outcome
				if (outcome == 'End') {
					console.log(
						`[-] Player_${
							i + 1
						} surrendered his second hand with the Dealer actually having a natural`
					)
					console.log("[+] The Dealer's hand", dealer.cards)
					console.log(
						`[-] Player_${
							i + 1
						}'s balance after viewing the outcome of his second hand is:`,
						await player.balance(),
						reach.standardUnit
					)
					console.log('')
					gameEnded = true
					break
				} else {
					console.log(`[+] Dealer does not have a natural`)
					console.log(
						`[-] Player_${
							i + 1
						}'s balance after viewing the outcome of his second hand is:`,
						await player.balance(),
						reach.standardUnit
					)
					console.log('[+] The Game continues')
					console.log('')
				}
			}
		}
	}
	if (!gameEnded) {
		i = 0
		await playDealer(dealer, false)
		console.log("[+] The Dealer's hand", dealer.cards)
		console.log('')
		for (i; i < playerCount; i++) {
			const player = players[i]
			if (player.cards_.length) {
				if (player.surrendered && player.surrendered_) continue
			} else {
				if (player.surrendered) continue
			}
			console.log(
				`[-] Player_${i + 1}'s balance before his getting outcome:`,
				await player.balance(),
				reach.standardUnit
			)
			const result = await getOutcome(player, `Player_${i + 1}`, true)
			console.log(`[+] The outcome for Player_${i + 1} is:`, result)
			console.log(
				`[-] Player_${i + 1}'s balance after viewing his outcome:`,
				await player.balance(),
				reach.standardUnit
			)
			console.log('')
			if (player.cards_.length) {
				const result = await getOutcome(player, `Player_${i + 1}`, false)
				console.log(
					`[+] The outcome for Player_${i + 1}'s second hand is:`,
					result
				)
				console.log(
					`[-] Player_${
						i + 1
					}'s balance after viewing the outcome of his second hand:`,
					await player.balance(),
					reach.standardUnit
				)
				console.log('')
			}
		}
	} else {
		console.log(`[+] Every other player must now reclaim their bets`)
		i = 0
		for (i; i < playerCount; i++) {
			const player = players[i]
			if (player.cards_.length) {
				if (player.surrendered && player.surrendered_) continue
			} else {
				if (player.surrendered) continue
			}
			console.log(
				`[-] Player_${i + 1}'s balance before making a reclaim:`,
				await player.balance(),
				reach.standardUnit
			)
			const totalBet = fmt(await player.ctc.apis.Player.reclaim(true))
			record.reclaims[`Player_${i + 1}`] = Number(totalBet)
			console.log(
				`[+] Player_${i + 1} reclaimed: ${totalBet} ${reach.standardUnit}`
			)
			console.log(
				`[-] Player_${i + 1}'s balance after the reclaim:`,
				await player.balance(),
				reach.standardUnit
			)
			console.log('')
			if (player.cards_.length) {
				const totalBet = fmt(await player.ctc.apis.Player.reclaim(false))
				record.reclaims[`Player_${i + 1}/2`] = Number(totalBet)
				console.log(
					`[+] Player_${i + 1} reclaimed for his second hand: ${totalBet} ${
						reach.standardUnit
					}`
				)
				console.log(
					`[-] Player_${
						i + 1
					}'s balance after the reclaim for his second hand:`,
					await player.balance(),
					reach.standardUnit
				)
				console.log('')
			}
		}
	}
}
/**
 * Compares what happened in a scenario run with what the scenario expects,
 * and fails the run (exit code 1) if anything differs
 */
const verifyScenario = () => {
	const problems = []
	const expected = scenario.expect
	const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
	if (!same(record.outcomes, expected.outcomes || {}))
		problems.push(
			`outcomes: expected ${JSON.stringify(expected.outcomes || {})}, got ${JSON.stringify(record.outcomes)}`
		)
	if (!same(record.surrenders, expected.surrenders || {}))
		problems.push(
			`surrenders: expected ${JSON.stringify(expected.surrenders || {})}, got ${JSON.stringify(record.surrenders)}`
		)
	if (!same(record.reclaims, expected.reclaims || {}))
		problems.push(
			`reclaims: expected ${JSON.stringify(expected.reclaims || {})}, got ${JSON.stringify(record.reclaims)}`
		)
	if (record.bank !== expected.bank)
		problems.push(`bank: expected ${expected.bank}, got ${record.bank}`)
	if (scriptedRolls.length)
		problems.push(`${scriptedRolls.length} scripted roll(s) were never used`)
	console.log('')
	if (problems.length) {
		console.log(`[x] SCENARIO FAILED: ${requested}`)
		problems.forEach((p) => console.log(`    - ${p}`))
		process.exitCode = 1
	} else {
		console.log(`[✓] SCENARIO PASSED: ${requested}`)
	}
}
console.log('[+] Starting the Game...')
reach.withDisconnect(async () =>
	dealer.ctc.p.D({
		bankAmount: reach.parseCurrency(
			bankAmount(Math.ceil(Number(await dealer.balance())))
		),
		betAmount: reach.parseCurrency(betAmount),
		deployed: async (betAmount) => {
			console.log('[+] Blackjack started')
			const initialBankView = fmt((await dealer.ctc.v.bank())[1])
			console.log(
				'[+] The Bank currently has',
				initialBankView,
				reach.standardUnit
			)
			console.log('')
			console.log(
				`[+] The Dealer publishes the base bet: ${fmt(betAmount)} ${
					reach.standardUnit
				}`
			)
			console.log('')
			await simulatePlay(
				scenario
					? scenario.players
					: maxPlayers(bankAmount(Number(initialBankView)), Number(fmt(betAmount)))
			)
			console.log(`[+] The Round has ended`)
			console.log(
				'[+] The Bank is left with',
				fmt((await dealer.ctc.v.bank())[1]),
				reach.standardUnit
			)
			if (scenario) {
				record.bank = Number(fmt((await dealer.ctc.v.bank())[1]))
				verifyScenario()
			}
			console.log('')
			try {
				const bankBal = fmt(await dealer.ctc.apis.Dealer.endGame())
				console.log(
					`[+] The Dealer has ended the game, retrieving the bank balance of ${bankBal} ${reach.standardUnit}`
				)
			} catch (error) {
				console.log({ error })
			}
			reach.disconnect(null)
		},
	})
)
