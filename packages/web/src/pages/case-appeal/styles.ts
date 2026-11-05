/**
 * Class names shared by the crowdfunding cards. The library `Card` is a fixed 328×200 box; a card here fills its grid
 * cell. A card and its list item span two rows of the cards grid and share them through subgrid: the head (title, entry
 * fields) and the funding. The funding bars of a row of cards then line up, and a card that grows under its bar (a write
 * notice) leaves the others' extra height below their Fund button rather than above their bar.
 */
export const CARD_CLASS = "row-span-2 grid h-auto w-full min-w-0 grid-cols-1 grid-rows-subgrid gap-4 p-4";
export const CARD_TITLE_CLASS = "text-base leading-6 font-semibold [overflow-wrap:anywhere]";
/**
 * The composer's card: one column, then the options beside the funding from `lg`. Its base classes leave out `flex` and
 * `gap-4`: the library's stylesheet declares those utilities after the app's, so they would win over `lg:` variants.
 */
export const COMPOSER_CARD_CLASS = "grid h-auto w-full min-w-0 gap-y-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] lg:gap-x-8";
/** A list item of the cards grid; `min-w-0` lets the grid track shrink below the content's preferred width. */
export const CARD_ITEM_CLASS = "row-span-2 grid min-w-0 grid-cols-1 grid-rows-subgrid";
export const CARD_HEAD_CLASS = "flex min-w-0 flex-col gap-4";
export const CARD_FOOTER_CLASS = "flex min-w-0 flex-col gap-4";
export const BODY_TEXT_CLASS = "text-klerosUIComponentsPrimaryText";
