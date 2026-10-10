// web3 1.10 hashes strings through node Buffers, and the hashing library checks them with `instanceof Uint8Array`.
// Under jsdom that check fails because the test realm has its own Uint8Array, so the node one is used instead.
global.Uint8Array = Object.getPrototypeOf(Buffer.prototype).constructor;
