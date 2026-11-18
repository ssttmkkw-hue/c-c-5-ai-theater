/**
 * Known roles for the bundled samples and a pasted Shakespeare scene.
 * Anyone not listed is still created — they just get a palette color,
 * a cycled costume, and a pitched voice.
 */

export const PALETTE = [
  '#3b5b8c',
  '#d46b8a',
  '#d0dce8',
  '#8d2f36',
  '#d4b06a',
  '#3f7d5a',
  '#7a5a3a',
  '#5c4d86',
  '#3d7f8c',
  '#c46a3a',
  '#6b7c3a',
  '#8c5a78',
];

const voice = (pitch, rate, lang = 'en-GB') => ({ lang, pitch, rate });

export const PRESETS = {
  hamlet: {
    name: 'Hamlet',
    color: '#3b5b8c',
    costume: 'prince',
    skin: '#e0b394',
    hair: '#241c16',
    voice: voice(0.84, 0.9),
    aliases: ['Prince', 'Lord Hamlet'],
  },
  ophelia: {
    name: 'Ophelia',
    color: '#e7b4c4',
    costume: 'maiden',
    skin: '#f2cbb8',
    hair: '#a85a32',
    voice: voice(1.32, 1.02),
  },
  ghost: {
    name: 'Ghost',
    color: '#c5d8e4',
    costume: 'ghost',
    skin: '#d7e7f0',
    hair: '#a9c0cc',
    voice: voice(0.5, 0.74),
    aliases: ["Father's Spirit", 'Spirit'],
  },
  king: {
    name: 'King',
    color: '#8d2f36',
    costume: 'king',
    skin: '#d7b094',
    hair: '#5c5854',
    voice: voice(0.76, 0.94),
    aliases: ['Claudius'],
  },
  claudius: {
    name: 'Claudius',
    color: '#8d2f36',
    costume: 'king',
    skin: '#d7b094',
    hair: '#5c5854',
    voice: voice(0.76, 0.94),
    aliases: ['King'],
  },
  queen: {
    name: 'Queen',
    color: '#c6a15b',
    costume: 'queen',
    skin: '#f0c8b4',
    hair: '#3a2a22',
    voice: voice(1.16, 0.96),
    aliases: ['Gertrude'],
  },
  gertrude: {
    name: 'Gertrude',
    color: '#c6a15b',
    costume: 'queen',
    skin: '#f0c8b4',
    hair: '#3a2a22',
    voice: voice(1.16, 0.96),
    aliases: ['Queen'],
  },
  polonius: {
    name: 'Polonius',
    color: '#7a5a3a',
    costume: 'courtier',
    skin: '#d2a888',
    hair: '#6a625c',
    voice: voice(0.96, 0.98),
  },
  horatio: {
    name: 'Horatio',
    color: '#3f7d5a',
    costume: 'traveler',
    skin: '#d2a888',
    hair: '#2c241c',
    voice: voice(1.0, 0.98),
  },
  laertes: {
    name: 'Laertes',
    color: '#3d7f8c',
    costume: 'prince',
    skin: '#e0b394',
    hair: '#3a2c22',
    voice: voice(1.02, 1.02),
  },
  player: {
    name: 'Player',
    color: '#5c4d86',
    costume: 'courtier',
    skin: '#e0b394',
    hair: '#241c16',
    voice: voice(1.05, 1.0),
  },
  lila: {
    name: 'Lila',
    color: '#d46b8a',
    costume: 'maiden',
    skin: '#f0c2a8',
    hair: '#6b3a2a',
    voice: voice(1.28, 1.04, 'en-US'),
  },
  jon: {
    name: 'Jon',
    color: '#3f6f4a',
    costume: 'traveler',
    skin: '#d2a888',
    hair: '#2c241c',
    voice: voice(0.9, 0.98, 'en-US'),
  },
};

const COSTUME_CYCLE = ['courtier', 'traveler', 'prince', 'maiden', 'king', 'queen'];

export function costumeForIndex(index) {
  return COSTUME_CYCLE[index % COSTUME_CYCLE.length];
}
