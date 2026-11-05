export type ShipIdentity = {
    id: string;
    handle: string;
};
export type ShipCommand = {
    verb: string;
    args: string[];
    flags: Record<string, string>;
};
export type ShipOutcome = {
    line: string;
    ok: boolean;
    message: string;
};
/**
 * One transcript entry for all the SHIP: results of a reply, flattened and bounded so a reply
 * can neither flood the context window nor fake transcript lines.
 * @param {string} handle
 * @param {ShipOutcome[]} outcomes
 */
export function shipLogText(handle: string, outcomes: ShipOutcome[]): string;
export const MAX_COMMANDS_PER_REPLY: 5;
/**
 * @typedef {{ id: string, handle: string }} ShipIdentity
 * @typedef {{ verb: string, args: string[], flags: Record<string, string> }} ShipCommand
 * @typedef {{ line: string, ok: boolean, message: string }} ShipOutcome
 */
/**
 * The `SHIP:` lines of a reply, at most five. Syntax lines echoed from the prompt are skipped.
 * @param {string} text
 * @returns {string[]}
 */
export function extractShipLines(text: string): string[];
/**
 * Splits a command line into words, keeping quoted text together.
 * @param {string} line
 * @returns {string[]}
 */
export function tokenize(line: string): string[];
/**
 * @param {string} line - the text after `SHIP:`
 * @returns {ShipCommand}
 */
export function parseShipCommand(line: string): ShipCommand;
/** Compares actor names, ignoring case and a leading at-sign. */
export function actorKey(value: unknown): string;
/**
 * Runs the `SHIP:` lines of a bot reply against the ledger.
 * @param {import('../shipping/shipping-ledger').ShippingLedger} ledger
 * @param {string} text - the reply
 * @param {ShipIdentity} identity - the replying bot, attested by the room
 * @returns {ShipOutcome[]}
 */
export function applyShipCommands(ledger: import("../shipping/shipping-ledger").ShippingLedger, text: string, identity: ShipIdentity): ShipOutcome[];
/**
 * The shipping block of a member prompt: the command syntax and the squares assigned to the bot.
 * @param {import('../shipping/shipping-ledger').ShippingLedger} ledger
 * @param {ShipIdentity} identity
 * @returns {string[]} one prompt block
 */
export function shipPromptSection(ledger: import("../shipping/shipping-ledger").ShippingLedger, identity: ShipIdentity): string[];
