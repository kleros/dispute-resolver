/**
 * Class names shared by the crowdfunding cards. The library `Card` is a fixed 328×200 box; a card here fills its grid
 * cell. A card and its list item span two rows of the cards grid and share them through subgrid: the head (the title)
 * and the funding. The funding bars of a row of cards then line up, and a card that grows under its bar (a
 * contribution's field error) leaves the others' extra height below their Fund button rather than above their bar. The
 * "Latest jury decision" tag is out of the flow, over the card's top edge, so a tagged card's head is as tall as any
 * other title; the top padding holds the half of the tag inside the card.
 */
export const CARD_CLASS = "relative row-span-2 grid h-auto w-full min-w-0 grid-cols-1 grid-rows-subgrid gap-4 p-4 pt-6";
/** Straddles the card's top edge, left-aligned with the title: half of its 28 px is outside the card. */
export const CARD_TAG_CLASS = "absolute top-0 left-4 -translate-y-1/2";
export const CARD_TITLE_CLASS = "text-base leading-6 font-semibold [overflow-wrap:anywhere]";
/**
 * The composer's and the free-input card: a row of their own, one column, then the entry beside the funding from `lg`.
 * The base classes leave out `flex` and `gap-4`: the library's stylesheet declares those utilities after the app's, so
 * they would win over `lg:` variants.
 */
export const WIDE_CARD_CLASS = "grid h-auto w-full min-w-0 gap-y-4 p-4 pt-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] lg:gap-x-8";
export const WIDE_CARD_ITEM_CLASS = "flex min-w-0 md:col-span-2 lg:col-span-3";
export const WIDE_CARD_FUNDING_CLASS = "flex min-w-0 flex-col gap-4 lg:border-l lg:border-klerosUIComponentsStroke lg:pl-8";
/** A list item of the cards grid; `min-w-0` lets the grid track shrink below the content's preferred width. */
export const CARD_ITEM_CLASS = "row-span-2 grid min-w-0 grid-cols-1 grid-rows-subgrid";
export const CARD_HEAD_CLASS = "flex min-w-0 flex-col gap-4";
export const CARD_FOOTER_CLASS = "flex min-w-0 flex-col gap-4";
export const BODY_TEXT_CLASS = "text-klerosUIComponentsPrimaryText";
