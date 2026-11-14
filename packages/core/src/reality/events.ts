import { getAbiItem } from "viem";
import { realityAbi, realityProxyAbi } from "../abi";

export const DISPUTE_ID_TO_QUESTION_ID = getAbiItem({ abi: realityProxyAbi, name: "DisputeIDToQuestionID" });
export const ARBITRATION_CREATED = getAbiItem({ abi: realityProxyAbi, name: "ArbitrationCreated" });
export const LOG_NEW_QUESTION = getAbiItem({ abi: realityAbi, name: "LogNewQuestion" });
export const LOG_NEW_TEMPLATE = getAbiItem({ abi: realityAbi, name: "LogNewTemplate" });
