import { getAbiItem } from "viem";
import { realityAbi, realityProxyAbi } from "../abi";

/** Single-chain proxies (Realitio_v2_1_ArbitratorWithAppeals, RealitioArbitratorProxy...). */
export const DISPUTE_ID_TO_QUESTION_ID = getAbiItem({ abi: realityProxyAbi, name: "DisputeIDToQuestionID" });
/** Cross-chain foreign proxies (RealitioForeignArbitrationProxy...). */
export const ARBITRATION_CREATED = getAbiItem({ abi: realityProxyAbi, name: "ArbitrationCreated" });
/** Reality.eth v2 and v3. */
export const LOG_NEW_QUESTION = getAbiItem({ abi: realityAbi, name: "LogNewQuestion" });
export const LOG_NEW_TEMPLATE = getAbiItem({ abi: realityAbi, name: "LogNewTemplate" });
