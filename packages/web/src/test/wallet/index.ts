// Test doubles of `wallet` (ARCHITECTURE.md §1.5). Imported only by tests and other test doubles (C9, lint rule 5).
export { installOfflineAppKitEnvironment } from "./appKitEnvironment";
export { fakeWriteController, type FakeWriteController, type FakeWriteOptions } from "./fakeWriteController";
export { TestWalletProvider, type TestWalletProviderProps } from "./TestWalletProvider";
export { walletWrapper } from "./walletWrapper";
export { TEST_WALLET_ACCOUNT, TEST_WALLET_ADDRESS, UNCONFIGURED_CHAIN_ID, createTestWallet, type FakeWalletModal, type TestWallet, type TestWalletOptions } from "./testWallet";
export { TEST_REPLACEMENT_TX_HASH, TEST_TX_HASH, testReceipt, testReplacementReceipt, testWriteBuild } from "./writeFixtures";
