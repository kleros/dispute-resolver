const VISIBLE_TEXT = /\S/;

export function hasVisibleText(text: string): boolean {
  return VISIBLE_TEXT.test(text);
}
