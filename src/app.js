import React from 'react'
import Container from 'react-bootstrap/Container'
import Row from 'react-bootstrap/Row'
import Col from 'react-bootstrap/Col'
import './app.css'
import CreateDispute from './containers/create-dispute'
import Interact from './containers/interact'
import { BrowserRouter, NavLink, Route, Switch } from 'react-router-dom'

import * as BinaryArbitrableProxy from './ethereum/binary-arbitrable-proxy'
import * as Arbitrator from './ethereum/arbitrator'
import * as KlerosLiquid from './ethereum/kleros-liquid'

import networkMap from './ethereum/network-contract-mapping'
import ipfsPublish from './ipfs-publish'

import './app.css'

class App extends React.Component {
  constructor(props) {
    super(props)
    this.state = {
      activeAddress: '0x0000000000000000000000000000000000000000',
      network: '1',
      lastDisputeID: ''
    }
    this.encoder = new TextEncoder()
  }

  async componentDidMount() {
    console.debug(process.env)

    if (typeof window.ethereum !== 'undefined') {
      this.setState({ network: window.ethereum.networkVersion })

      this.setState({ activeAddress: window.ethereum.selectedAddress })

      window.ethereum.on('accountsChanged', accounts => {
        this.setState({ activeAddress: accounts[0] })
      })

      window.ethereum.on('networkChanged', network => {
        this.setState({ network })
      })
    } else console.error('MetaMask not detected :(')
  }

  getArbitrationCost = (arbitratorAddress, extraData) =>
    Arbitrator.arbitrationCost(arbitratorAddress, extraData)

  getDispute = async disputeID =>
    KlerosLiquid.disputes(
      networkMap[this.state.network].KLEROS_LIQUID,
      disputeID
    )

  updateLastDisputeID = async newDisputeID =>
    this.setState({ lastDisputeID: newDisputeID })

  onPublish = async (filename, fileBuffer) => {
    return await ipfsPublish(filename, fileBuffer)
  }

  generateArbitratorExtraData = (subcourtID, initialNumberOfJurors) =>
    '0x' +
    (subcourtID.padStart(64, '0') + initialNumberOfJurors.padStart(64, '0'))

  appeal = async disputeID => {
    const { activeAddress, network } = this.state

    const appealCost = await Arbitrator.appealCost(
      networkMap[network].KLEROS_LIQUID,
      disputeID,
      '0x0'
    )

    await Arbitrator.appeal(
      networkMap[network].KLEROS_LIQUID,
      activeAddress,
      appealCost,
      disputeID,
      '0x0'
    )
  }

  createDispute = async ({
    subcourtID,
    initialNumberOfJurors,
    category,
    title,
    description,
    question,
    firstRulingOption,
    secondRulingOption,
    firstRulingDescription,
    secondRulingDescription,
    primaryFileURI,
    value
  }) => {
    const { activeAddress, network } = this.state
    const arbitrator = networkMap[network].KLEROS_LIQUID

    const arbitratorExtraData = this.generateArbitratorExtraData(
      subcourtID,
      initialNumberOfJurors
    )

    const metaevidence = {
      category,
      title,
      description,
      question,
      rulingOptions: {
        type: 'single-select',
        titles: [firstRulingOption, secondRulingOption],
        descriptions: [firstRulingDescription, secondRulingDescription]
      },
      fileURI: primaryFileURI
    }

    const ipfsHashMetaEvidenceObj = await ipfsPublish(
      'metaEvidence.json',
      this.encoder.encode(JSON.stringify(metaevidence))
    )

    const metaevidenceURI =
      '/ipfs/' +
      ipfsHashMetaEvidenceObj[1]['hash'] +
      ipfsHashMetaEvidenceObj[0]['path']

    console.log(metaevidence)

    let arbitrationCost = await this.getArbitrationCost(
      arbitrator,
      arbitratorExtraData
    )

    return await BinaryArbitrableProxy.createDispute(
      networkMap[network].BINARY_ARBITRABLE_PROXY,
      activeAddress,
      arbitrationCost,
      arbitrator,
      arbitratorExtraData,
      metaevidenceURI
    )
  }

  submitEvidence = async ({ disputeID, evidenceFileURI }) => {
    const { activeAddress, network } = this.state

    const evidence = {
      name: 'name',
      description: 'description',
      fileURI: evidenceFileURI
    }
    console.log(
      await BinaryArbitrableProxy.contractInstance(
        networkMap[network].BINARY_ARBITRABLE_PROXY
      )
    )
    const localDisputeID = await BinaryArbitrableProxy.externalIDtoLocalID(
      networkMap[network].BINARY_ARBITRABLE_PROXY,
      disputeID
    )

    const ipfsHashEvidenceObj = await ipfsPublish(
      'evidence.json',
      this.encoder.encode(JSON.stringify(evidence))
    )

    const evidenceURI =
      '/ipfs/' + ipfsHashEvidenceObj[1]['hash'] + ipfsHashEvidenceObj[0]['path']

    return await BinaryArbitrableProxy.submitEvidence(
      networkMap[network].BINARY_ARBITRABLE_PROXY,
      activeAddress,
      localDisputeID,
      evidenceURI
    )
  }

  render() {
    console.debug(this.state)

    const { lastDisputeID } = this.state

    return (
      <Container fluid="true">
        <BrowserRouter>
          <Switch>
            <Route
              exact
              path="/"
              render={props => (
                <CreateDispute
                  createDisputeCallback={this.createDispute}
                  publishCallback={this.onPublish}
                />
              )}
            />
            <Route
              exact
              path="/interact"
              render={props => (
                <Interact
                  publishCallback={this.onPublish}
                  submitEvidenceCallback={this.submitEvidence}
                  disputeID={lastDisputeID}
                  getDisputeCallback={this.getDispute}
                  appealCallback={this.appeal}
                  newDisputeCallback={this.updateLastDisputeID}
                />
              )}
            />
          </Switch>
        </BrowserRouter>
      </Container>
    )
  }
}
export default App
