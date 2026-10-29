/** Class names shared by the crowdfunding cards. The library `Card` is a fixed 328×200 box; a card here fills its grid cell. */
export const CARD_CLASS = "flex h-auto w-full min-w-0 flex-col gap-4 p-4";
export const CARD_TITLE_CLASS = "text-base leading-6 font-semibold [overflow-wrap:anywhere]";
/**
 * The composer's card: one column, then the options beside the funding from `lg`. Its base classes leave out `flex` and
 * `gap-4`: the library's stylesheet declares those utilities after the app's, so they would win over `lg:` variants.
 */
export const COMPOSER_CARD_CLASS = "grid h-auto w-full min-w-0 gap-y-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] lg:gap-x-8";
/** A list item of the cards grid; `min-w-0` lets the grid track shrink below the content's preferred width. */
export const CARD_ITEM_CLASS = "flex min-w-0";
/** The funding part of a card, pushed to the bottom so cards of one row line up whatever their title's length. */
export const CARD_FOOTER_CLASS = "mt-auto flex flex-col gap-4";
export const BODY_TEXT_CLASS = "text-klerosUIComponentsPrimaryText";
