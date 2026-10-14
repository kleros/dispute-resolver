// Public surface of `wallet` (owner: wallet; ARCHITECTURE.md §2.3, §6).
export type * from "./types";
export type { ConnectUnavailableReason, ConnectWallet } from "./useConnectWallet";
export type { WalletSetupProviderProps } from "./WalletProvider";
export type { NetworkSwitch, NetworkSwitchState } from "./switchChain";
export { ChainIndicator } from "./ChainIndicator";
export { SmartContractWalletWarning } from "./SmartContractWalletWarning";
export { WalletControl } from "./WalletControl";
export { WalletProvider, WalletSetupProvider } from "./WalletProvider";
export { WriteStatusNotice } from "./WriteStatusNotice";
export { createWalletSetup } from "./setup";
export { isUserRejection } from "./errors";
export { useConnectWallet } from "./useConnectWallet";
export { useNetworkSwitch } from "./switchChain";
export { useWallet } from "./useWallet";
export { useWrite } from "./useWrite";
export { useWriteSequence } from "./useWriteSequence";
