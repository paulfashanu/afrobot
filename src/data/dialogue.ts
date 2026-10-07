/** Short, playful lines. Speaker 'AFROBOT' always says "..." — the strong silent type. */
export interface Line { speaker: string; text: string }

export const DIALOGUE: Record<string, Line[]> = {
  'lagos-bot-street': [
    { speaker: 'LAGOS BOT', text: 'You dey find your way?' },
    { speaker: 'AFROBOT', text: '...' },
    { speaker: 'LAGOS BOT', text: 'Keep moving. The city remembers.' },
  ],
  'lagos-bot-roof': [
    { speaker: 'LAGOS BOT', text: 'Na you be the small one wey dey glow?' },
    { speaker: 'AFROBOT', text: '...' },
    { speaker: 'LAGOS BOT', text: 'That Gate don sleep for long time. Maybe e dey wait for you.' },
  ],
  'market-bot': [
    { speaker: 'MARKET BOT', text: 'Fresh cores! Sweet cores! ...Ah, you no get money?' },
    { speaker: 'AFROBOT', text: '...' },
    { speaker: 'MARKET BOT', text: 'No wahala. Free tip: some walls for this market no strong at all. Check the gap by the water.' },
  ],
  'terminal-pedestal': [
    { speaker: 'UNKNOWN TRANSMISSION', text: '...SIGNAL RESTORED... PROTOTYPE A-01: STATUS UNKNOWN.' },
    { speaker: 'UNKNOWN TRANSMISSION', text: 'IF FOUND, RETURN IT TO THE GATE.' },
  ],
  'terminal-roof': [
    { speaker: 'ARCHIVE FRAGMENT', text: 'The builders sealed every Gate the day the sky went quiet.' },
    { speaker: 'ARCHIVE FRAGMENT', text: 'Only a core-bearer can open them again.' },
  ],
  'mural-den': [
    { speaker: 'OLD MURAL', text: 'A painting of many small robots carrying light across a river. One of them has an afro.' },
  ],
  'mural-shrine': [
    { speaker: 'OLD MURAL', text: 'Six gates in a circle. Beneath each one, a symbol you have never seen... and yet you know them.' },
  ],
  'broken-robot': [
    { speaker: 'DORMANT ROBOT', text: '...a...one...?' },
    { speaker: 'AFROBOT', text: '...' },
    { speaker: 'DORMANT ROBOT', text: '...' },
  ],
  'glyph-hint': [
    { speaker: 'ANCIENT DEVICE', text: 'The symbols are dark. It seems to be waiting for a burst of energy.' },
  ],
  'door-hint': [
    { speaker: 'ENERGY DOOR', text: 'The door hums. Nothing you push will move it. Maybe a PULSE would.' },
  ],
};
