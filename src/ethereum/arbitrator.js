import Arbitrator from '../../node_modules/@kleros/erc-792/build/contracts/Arbitrator.json'
import web3 from './web3'

export const contractInstance = address =>
  new web3.eth.Contract(Arbitrator.abi, address)

export const arbitrationCost = (instanceAddress, arbitratorExtraData) =>
  contractInstance(instanceAddress)
    .methods.arbitrationCost(arbitratorExtraData)
    .call()

export const appealCost = (instanceAddress, disputeID, extraData) =>
  contractInstance(instanceAddress)
    .methods.appealCost(disputeID, extraData)
    .call()

export const appeal = (
  instanceAddress,
  senderAddress,
  value,
  disputeID,
  extraData
) =>
  contractInstance(instanceAddress)
    .methods.appeal(disputeID, extraData)
    .send({ from: senderAddress, value })
