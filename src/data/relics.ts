/** AFRO RELICS — rare story collectibles. Add future relics here. */
export interface RelicDef {
  id: string;
  name: string;
  description: string;
  /** Inline SVG markup used as the relic's icon in the UI. */
  icon: string;
  world: string;
  level: string;
}

const gearIcon = `<svg viewBox="0 0 64 64"><g fill="none" stroke="#ffc21a" stroke-width="4"><circle cx="32" cy="32" r="12"/><path d="M32 6v10M32 48v10M6 32h10M48 32h10M13 13l7 7M44 44l7 7M51 13l-7 7M20 44l-7 7"/></g><circle cx="32" cy="32" r="5" fill="#5ff7ff"/></svg>`;
const beaconIcon = `<svg viewBox="0 0 64 64"><path d="M32 54V26" stroke="#ffc21a" stroke-width="4"/><circle cx="32" cy="22" r="7" fill="#5ff7ff"/><g fill="none" stroke="#5ff7ff" stroke-width="3" opacity=".8"><path d="M18 12a20 20 0 0 0 0 20M46 12a20 20 0 0 1 0 20"/><path d="M11 6a30 30 0 0 0 0 32M53 6a30 30 0 0 1 0 32" opacity=".5"/></g><rect x="22" y="52" width="20" height="6" rx="2" fill="#ffc21a"/></svg>`;
const glyphIcon = `<svg viewBox="0 0 64 64"><path d="M32 4l24 14v28L32 60 8 46V18z" fill="#3b2a5a" stroke="#ffc21a" stroke-width="3"/><circle cx="32" cy="28" r="7" fill="none" stroke="#5ff7ff" stroke-width="3"/><path d="M24 18l4 5M40 18l-4 5M32 14v5M22 46h20M26 40h12" stroke="#5ff7ff" stroke-width="3"/></svg>`;

export const RELICS: RelicDef[] = [
  {
    id: 'relic-gear',
    name: 'ANCIENT GEAR FRAGMENT',
    description: 'A fragment of an ancient machine. Its technology looks strangely familiar.',
    icon: gearIcon,
    world: 'lagos',
    level: 'lagos-run',
  },
  {
    id: 'relic-transmitter',
    name: 'SILENT TRANSMITTER',
    description: 'Still humming on a frequency nobody uses anymore. It seems to be calling for someone.',
    icon: beaconIcon,
    world: 'lagos',
    level: 'lagos-run',
  },
  {
    id: 'relic-glyph',
    name: 'CROWN GLYPH STONE',
    description: 'A carving of a small figure with a crown of light, standing before many gates.',
    icon: glyphIcon,
    world: 'lagos',
    level: 'lagos-run',
  },
];

export const relicById = (id: string) => RELICS.find((r) => r.id === id);
