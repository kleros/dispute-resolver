/**
 * Text from a wallet or a node may end without a full stop; the result ends a sentence, so another can follow it. Any
 * sentence terminator, in any script, or an ellipsis already ends one, also inside closing quotes or brackets. Pi is
 * there because German closes quotes with “ and «, and the space because French sets one before ».
 */
export function asSentence(text: string): string {
  const trimmed = text.trim();
  return /[\p{Sentence_Terminal}…][\s\p{Pe}\p{Pf}\p{Pi}"']*$/u.test(trimmed) ? trimmed : `${trimmed}.`;
}
