import { MPC_DEFAULT_STOCK, MPC_IMAGE_SUBDIR, mpcBracket } from '@shared/mpc'

/** One card's placement in an MPC order, with its already-assigned slot indices. */
export interface MpcXmlCard {
  /** Front image file name (basename); the image lives in the `cards/` subfolder. */
  fileName: string
  /** Search query text (the card name). */
  query: string
  /** Global slot indices this card's copies occupy. */
  slots: number[]
  /** Back image file name for double-faced cards; omitted for single-faced cards. */
  backFileName?: string
}

/**
 * The path the MPC Autofill tool resolves an image by. It reads `<id>` (and the
 * `<cardback>`) as a file path first, so a `cards/<file>` relative path matches
 * the on-disk layout directly — this is also what makes the common card back
 * resolve, which a bare filename does not.
 */
function imagePath(fileName: string): string {
  return `${MPC_IMAGE_SUBDIR}/${fileName}`
}

/** Escapes a string for inclusion in XML text/attribute content. */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function cardElement(fileName: string, query: string, slots: number[]): string {
  const name = escapeXml(fileName)
  return [
    '    <card>',
    `      <id>${escapeXml(imagePath(fileName))}</id>`,
    `      <slots>${slots.join(',')}</slots>`,
    `      <name>${name}</name>`,
    `      <query>${escapeXml(query)}</query>`,
    '    </card>'
  ].join('\n')
}

/**
 * Builds an MPC Autofill `order.xml` from cards with pre-assigned slots. Each
 * front card lists every slot its copies occupy; double-faced cards add a
 * matching `<backs>` entry on the same slots, and single-faced backs are filled
 * by the common `<cardback>`.
 */
export function buildMpcOrderXml(
  cards: MpcXmlCard[],
  cardBackFileName: string,
  stock: string = MPC_DEFAULT_STOCK
): string {
  const quantity = cards.reduce((sum, card) => sum + card.slots.length, 0)
  const fronts = cards.map((card) => cardElement(card.fileName, card.query, card.slots)).join('\n')
  const backs = cards
    .filter((card) => card.backFileName)
    .map((card) => cardElement(card.backFileName!, card.query, card.slots))
    .join('\n')

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<order>',
    '  <details>',
    `    <quantity>${quantity}</quantity>`,
    `    <bracket>${mpcBracket(quantity)}</bracket>`,
    `    <stock>${escapeXml(stock)}</stock>`,
    '    <foil>false</foil>',
    '  </details>',
    '  <fronts>',
    fronts,
    '  </fronts>',
    '  <backs>',
    backs,
    '  </backs>',
    `  <cardback>${escapeXml(imagePath(cardBackFileName))}</cardback>`,
    '</order>',
    ''
  ].join('\n')
}
