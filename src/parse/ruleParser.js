/**
 * Offline rule parser. Script text in, Performance JSON out.
 * The scanner lives in scan.js so a full parse and a live stream share one pass.
 */

export { parseScript, streamScript, RuleParser } from './scan.js';
