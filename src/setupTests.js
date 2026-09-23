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
