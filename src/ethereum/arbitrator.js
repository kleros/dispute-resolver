import Arbitrator from '../../node_modules/@kleros/erc-792/build/contracts/Arbitrator.json'
import web3 from './web3'

export const contractInstance = address =>
  new web3.eth.Contract(Arbitrator.abi, address)

export const arbitrationCost = (instanceAddress, arbitratorExtraData) =>
  contractInstance(instanceAddress)
    .methods.arbitrationCost(arbitratorExtraData)
    .call()
