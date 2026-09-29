// Jest's jsdom environment (jsdom 16) does not expose TextEncoder/TextDecoder,
// but jsdom 20 (loaded by isomorphic-dompurify via @reality.eth/reality-eth-lib)
// needs them at import time.
import { TextEncoder, TextDecoder } from "util";

if (typeof global.TextEncoder === "undefined") {
  global.TextEncoder = TextEncoder;
}
if (typeof global.TextDecoder === "undefined") {
  global.TextDecoder = TextDecoder;
}

//jsdom has no Web Crypto; the dynamic script runner draws its request ids from it. Node's implementation stands in.
if (!globalThis.crypto?.getRandomValues) {
  Object.defineProperty(globalThis, "crypto", { value: require("crypto").webcrypto, configurable: true });
}
