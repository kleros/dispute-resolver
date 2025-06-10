import KlerosLiquid from "../../node_modules/@kleros/kleros/build/contracts/KlerosLiquid.json";
import IArbitrator from "../../node_modules/@kleros/arbitrable-proxy-contracts/build/contracts/IArbitrator.json";
import IArbitrable from "../../node_modules/@kleros/arbitrable-proxy-contracts/build/contracts/IArbitrable.json";
import IEvidence from "../../node_modules/@kleros/arbitrable-proxy-contracts/build/contracts/IEvidence.json";
import PolicyRegistry from "../../node_modules/@kleros/kleros/build/contracts/PolicyRegistry.json";
import ArbitrableProxy from "../../node_modules/@kleros/arbitrable-proxy-contracts/build/contracts/ArbitrableProxy.json";
import IDisputeResolver_v2_0_0 from "../../node_modules/IDRv2/build/contracts/IDisputeResolver.json";
import IDisputeResolver_v1_0_2 from "../../node_modules/IDRv1/build/contracts/IDisputeResolver.json";

import { ethers } from "ethers";

const contractABIs = {
  KlerosLiquid,
  IDisputeResolver: IDisputeResolver_v2_0_0,
  IDisputeResolver_v1: IDisputeResolver_v1_0_2,
  ArbitrableProxy,
  IArbitrator,
  IArbitrable,
  IEvidence,
  PolicyRegistry,
};

export const getContract = (contractName, address, provider) => {
  if (!contractABIs[contractName]) {
    throw new Error(`ABI for contract ${contractName} not found`);
  }

  return new ethers.Contract(
    address,
    contractABIs[contractName].abi,
    provider
  );
};

export const getSignableContract = async (contractName, address, provider) => {
  if (!provider) {
    throw new Error("Provider is required for signable contract");
  }
  
  const signer = await provider.getSigner();
  
  return getContract(contractName, address, signer);
};