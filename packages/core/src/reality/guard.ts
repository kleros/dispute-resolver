/**
 * Injected by the script runner before a Reality renderer script: it makes `JSON.parse` reject documents with duplicate
 * keys inside the sandbox and records the rejection in `window.__klerosJsonDuplicateKeys`, so the host can refuse the
 * script's output. Valid JSON is first parsed natively, so the key scan only ever runs on well-formed JSON. Only the
 * runner page evaluates it.
 */
export const JSON_DUPLICATE_KEY_GUARD = String.raw`(function jsonDuplicateKeyGuard() {
    const nativeParse = JSON.parse;
    const hasDuplicateKeys = (text) => {
      const stack = [];
      let i = 0;
      while (i < text.length) {
        const c = text[i];
        if (c === '"') {
          let j = i + 1;
          while (j < text.length && text[j] !== '"') j += text[j] === "\\" ? 2 : 1;
          const token = text.slice(i, j + 1);
          i = j + 1;
          let k = i;
          while (k < text.length && " \t\n\r".includes(text[k])) k++;
          const keys = stack[stack.length - 1];
          if (text[k] === ":" && keys) {
            const key = nativeParse(token);
            if (keys.has(key)) return true;
            keys.add(key);
          }
          continue;
        }
        if (c === "{") stack.push(new Set());
        else if (c === "[") stack.push(null);
        else if (c === "}" || c === "]") stack.pop();
        i++;
      }
      return false;
    };
    JSON.parse = function (text, reviver) {
      const result = nativeParse.call(JSON, text, reviver);
      if (typeof text === "string" && hasDuplicateKeys(text)) {
        window.__klerosJsonDuplicateKeys = true;
        throw new SyntaxError("Duplicate keys in JSON document");
      }
      return result;
    };
  })();`;

/** reality-eth-lib's template population pastes the question parameters into the template unescaped. */
export function isRealityScript(scriptText: string): boolean {
  return scriptText.includes("populatedJSONForTemplate");
}
