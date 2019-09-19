import BinaryArbitrableProxy from '../../node_modules/@kleros/binary-arbitrable-proxy-contract/build/contracts/BinaryArbitrableProxy.json'
import web3 from './web3'

export const contractInstance = address =>
  new web3.eth.Contract(BinaryArbitrableProxy.abi, address)

export const deploy = sender =>
  new web3.eth.Contract(BinaryArbitrableProxy.abi)
    .deploy({
      arguments: [],
      data: BinaryArbitrableProxy.bytecode
    })
    .send({ from: sender })

export const createDispute = (
  instanceAddress,
  senderAddress,
  value,
  arbitratorAddress,
  arbitratorExtraData,
  metaevidenceURI
) =>
  contractInstance(instanceAddress)
    .methods.createDispute(
      arbitratorAddress,
      arbitratorExtraData,
      metaevidenceURI
    )
    .send({ from: senderAddress, value })

export const appeal = (instanceAddress, senderAddress, value, localDisputeID) =>
  contractInstance(instanceAddress)
    .methods.appeal(localDisputeID)
    .send({ from: senderAddress, value })

export const submitEvidence = (
  instanceAddress,
  senderAddress,
  disputeID,
  evidenceURI
) =>
  contractInstance(instanceAddress)
    .methods.submitEvidence(disputeID, evidenceURI)
    .send({ from: senderAddress })

export const externalIDtoLocalID = (instanceAddress, externalDisputeID) =>
  contractInstance(instanceAddress)
    .methods.externalIDtoLocalID(externalDisputeID)
    .call()
