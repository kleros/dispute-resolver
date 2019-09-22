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
import * as PolicyRegistry from './ethereum/policy-registry'

import networkMap from './ethereum/network-contract-mapping'
import ipfsPublish from './ipfs-publish'

import './app.css'

class App extends React.Component {
  constructor(props) {
    super(props)
    this.state = {
      activeAddress: '',
      network: '',
      lastDisputeID: ''
    }
    this.encoder = new TextEncoder()
  }

  async componentDidMount() {
    console.debug(process.env)

    if (typeof window.ethereum !== 'undefined') {
      console.log(window.ethereum)
      this.setState({ network: window.ethereum.networkVersion })

      this.setState({ activeAddress: window.ethereum.selectedAddress })

      window.ethereum.on('accountsChanged', accounts => {
        console.log('ACCOUNT CHANGED')
        this.setState({ activeAddress: accounts[0] })
      })

      window.ethereum.on('networkChanged', network => {
        console.log(`network CHANGED ${network}`)
        this.setState({ network })
      })
    } else console.error('MetaMask not detected :(')

    console.log(networkMap)
    console.log(this.state.network)
  }

  getArbitrationCost = (arbitratorAddress, extraData) =>
    Arbitrator.arbitrationCost(arbitratorAddress, extraData)

  getSubCourtDetails = async subcourtID => {
    console.log(`Got ${this.state.network}`)
    return await PolicyRegistry.policies(
      networkMap[this.state.network].POLICY_REGISTRY,
      subcourtID
    )
  }

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
    (parseInt(subcourtID, 16)
      .toString()
      .padStart(64, '0') +
      parseInt(initialNumberOfJurors, 16)
        .toString()
        .padStart(64, '0'))

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

  createDispute = async options => {
    console.log('CALLBACK CREATE DISPUTE')
    const { activeAddress, network } = this.state
    const arbitrator = networkMap[network].KLEROS_LIQUID
    console.log(options.selectedSubcourt)
    const arbitratorExtraData = this.generateArbitratorExtraData(
      options.selectedSubcourt,
      options.initialNumberOfJurors
    )
    console.log('CALLBACK CREATE DISPUTE')

    console.log(`ex data ${arbitratorExtraData}`)

    const metaevidence = {
      category: options.category,
      title: options.title,
      description: options.description,
      question: options.question,
      rulingOptions: {
        type: 'single-select',
        titles: [options.firstRulingOption, options.secondRulingOption],
        descriptions: [
          options.firstRulingDescription,
          options.secondRulingDescription
        ]
      },
      fileURI: options.primaryDocument
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
    console.log('HELLOOOO')
    return BinaryArbitrableProxy.createDispute(
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

    const { activeAddress, network, lastDisputeID } = this.state

    if (!network || !activeAddress) return <>WAIT A MINUTE</>
    else
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
                    getSubCourtDetailsCallback={this.getSubCourtDetails}
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
