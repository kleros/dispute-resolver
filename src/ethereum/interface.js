import KlerosLiquid from '../../node_modules/@kleros/kleros/build/contracts/KlerosLiquid.json'
import BinaryArbitrableProxy from '../../node_modules/@kleros/binary-arbitrable-proxy-contract/build/contracts/BinaryArbitrableProxy.json'
import Arbitrator from '../../node_modules/@kleros/erc-792/build/contracts/Arbitrator.json'
import PolicyRegistry from '../../node_modules/@kleros/kleros/build/contracts/PolicyRegistry.json'
import web3 from './web3'

const imports = {
  KlerosLiquid,
  BinaryArbitrableProxy,
  Arbitrator,
  PolicyRegistry
}

export const contractInstance = (name, address) =>
  new web3.eth.Contract(imports[name].abi, address)

export const call = (contractName, instanceAddress, method, ...args) =>
  contractInstance(contractName, instanceAddress)
    .methods[method](...args)
    .call()

export const send = (
  contractName,
  instanceAddress,
  from,
  value,
  method,
  ...args
) =>
  contractInstance(contractName, instanceAddress)
    .methods[method](...args)
    .send({ from, value })
