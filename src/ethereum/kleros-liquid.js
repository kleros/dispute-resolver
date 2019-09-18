import KlerosLiquid from '../../node_modules/@kleros/kleros/build/contracts/KlerosLiquid.json'
import web3 from './web3'

export const contractInstance = address =>
  new web3.eth.Contract(KlerosLiquid.abi, address)

export const disputes = (instanceAddress, disputeID) =>
  contractInstance(instanceAddress)
    .methods.disputes(disputeID)
    .call()
