import KlerosLiquid from "../../node_modules/@kleros/kleros/build/contracts/KlerosLiquid.json";
import BinaryArbitrableProxy from "../../node_modules/@kleros/binary-arbitrable-proxy-contract/build/contracts/BinaryArbitrableProxy.json";
import IArbitrator from "../../node_modules/@kleros/binary-arbitrable-proxy-contract/build/contracts/IArbitrator.json";
import IArbitrable from "../../node_modules/@kleros/binary-arbitrable-proxy-contract/build/contracts/IArbitrable.json";
import IEvidence from "../../node_modules/@kleros/binary-arbitrable-proxy-contract/build/contracts/IEvidence.json";
import PolicyRegistry from "../../node_modules/@kleros/kleros/build/contracts/PolicyRegistry.json";
import web3 from "./web3";

const imports = {
  KlerosLiquid,
  BinaryArbitrableProxy,
  IArbitrator,
  IArbitrable,
  IEvidence,
  PolicyRegistry
};

export const contractInstance = (interfaceName, address) =>
  new web3.eth.Contract(imports[interfaceName].abi, address);

export const call = (interfaceName, instanceAddress, method, ...args) =>
  contractInstance(interfaceName, instanceAddress)
    .methods[method](...args)
    .call();

export const send = (
  interfaceName,
  instanceAddress,
  from,
  value,
  method,
  ...args
) =>
  contractInstance(interfaceName, instanceAddress)
    .methods[method](...args)
    .send({ from, value });

export const estimateGas = (
  interfaceName,
  instanceAddress,
  from,
  value,
  method,
  ...args
) =>
  contractInstance(interfaceName, instanceAddress)
    .methods[method](...args)
    .estimateGas({ from, value });
