import PolicyRegistry from '../../node_modules/@kleros/kleros/build/contracts/PolicyRegistry.json'
import web3 from './web3'

export const contractInstance = address =>
  new web3.eth.Contract(PolicyRegistry.abi, address)

export const policies = (instanceAddress, subcourtID) =>
  contractInstance(instanceAddress)
    .methods.policies(subcourtID)
    .call()
