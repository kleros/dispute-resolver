import KlerosCore from "../contracts/KlerosCore.json";
import DisputeKit from "../contracts/DisputeKitClassic.json";
import IArbitrator from "../contracts/IArbitrator.json";
import IArbitrable from "../contracts/IArbitrable.json";
import IEvidence from "../contracts/IEvidence.json";
import IMetaEvidence from "../contracts/IMetaEvidence.json";
import PolicyRegistry from "../contracts/PolicyRegistry.json";
import DisputeResolver from "../contracts/DisputeResolver.json";

import web3 from "./web3";

const imports = {
  KlerosCore,
  DisputeKit,
  DisputeResolver,
  IArbitrator,
  IArbitrable,
  IEvidence,
  IMetaEvidence,
  PolicyRegistry,
};

export const contractInstance = (interfaceName, address) => new web3.eth.Contract(imports[interfaceName].abi, address);

export const call = (interfaceName, instanceAddress, method, ...args) =>
  contractInstance(interfaceName, instanceAddress)
    .methods[method](...args).call()

export const send = (interfaceName, instanceAddress, from, value, method, ...args) =>
  contractInstance(interfaceName, instanceAddress)
    .methods[method](...args)
    .send({ from, value });

export const estimateGas = (interfaceName, instanceAddress, from, value, method, ...args) =>
  contractInstance(interfaceName, instanceAddress)
    .methods[method](...args)
    .estimateGas({ from, value });
