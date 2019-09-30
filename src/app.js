import React from 'react'
import { Container, Row, Col } from 'react-bootstrap'

import './app.css'
import CreateDispute from './containers/create-dispute'
import _404 from './containers/404'
import Interact from './containers/interact'
import { BrowserRouter, Route, Switch } from 'react-router-dom'
import TopBanner from './components/top-banner'
import Footer from './components/footer'

import IPFS from './components/ipfs'

import Web3 from './ethereum/web3'
import * as EthereumInterface from './ethereum/interface'

import networkMap from './ethereum/network-contract-mapping'
import ipfsPublish from './ipfs-publish'
import Archon from '@kleros/archon'

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
      this.setState({
        archon: new Archon(window.ethereum, 'https://ipfs.kleros.io')
      })
      window.ethereum.on('accountsChanged', accounts => {
        this.setState({ activeAddress: accounts[0] })
      })

      window.ethereum.on('networkChanged', network => {
        this.setState({ network })
      })
    } else console.error('MetaMask not detected :(')
  }

  getArbitrationCost = (arbitratorAddress, extraData) =>
    EthereumInterface.call(
      'Arbitrator',
      arbitratorAddress,
      'arbitrationCost',
      extraData
    )

  getArbitrationCostWithCourtAndNoOfJurors = async (subcourtID, noOfJurors) =>
    Web3.utils.fromWei(
      await EthereumInterface.call(
        'Arbitrator',
        networkMap[this.state.network].KLEROS_LIQUID,
        'arbitrationCost',
        this.generateArbitratorExtraData(subcourtID, noOfJurors)
      ),

      'ether'
    )

  getSubCourtDetails = async subcourtID =>
    await EthereumInterface.call(
      'PolicyRegistry',
      networkMap[this.state.network].POLICY_REGISTRY,
      'policies',
      subcourtID
    )

  getDispute = async disputeID =>
    EthereumInterface.call(
      'KlerosLiquid',
      networkMap[this.state.network].KLEROS_LIQUID,
      'disputes',
      disputeID
    )

  updateLastDisputeID = async newDisputeID =>
    this.setState({ lastDisputeID: newDisputeID })

  onPublish = async (filename, fileBuffer) => {
    return await ipfsPublish(filename, fileBuffer)
  }

  generateArbitratorExtraData = (subcourtID, noOfJurors) =>
    '0x' +
    (parseInt(subcourtID, 16)
      .toString()
      .padStart(64, '0') +
      parseInt(noOfJurors, 16)
        .toString()
        .padStart(64, '0'))

  appeal = async disputeID => {
    const { activeAddress, network } = this.state

    const appealCost = await EthereumInterface.call(
      'Arbitrator',
      networkMap[network].KLEROS_LIQUID,
      'appealCost',
      disputeID,
      '0x0'
    )

    await EthereumInterface.send(
      'Arbitrator',
      networkMap[network].KLEROS_LIQUID,
      activeAddress,
      appealCost,
      'appeal',
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
      category: 'unused',
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

    console.log(ipfsHashMetaEvidenceObj)

    const metaevidenceURI =
      '/ipfs/' +
      ipfsHashMetaEvidenceObj[1]['hash'] +
      ipfsHashMetaEvidenceObj[0]['path']

    console.log(metaevidenceURI)

    let arbitrationCost = await this.getArbitrationCost(
      arbitrator,
      arbitratorExtraData
    )

    return EthereumInterface.send(
      'BinaryArbitrableProxy',
      networkMap[network].BINARY_ARBITRABLE_PROXY,
      activeAddress,
      arbitrationCost,
      'createDispute',
      arbitrator,
      arbitratorExtraData,
      metaevidenceURI
    )
  }

  getDisputeEvent = async (arbitrableAddress, disputeID) =>
    await this.state.archon.arbitrable.getDispute(
      arbitrableAddress, // arbitrable contract address
      networkMap[this.state.network].KLEROS_LIQUID, // arbitrator contract address
      disputeID // dispute unique identifier
    )

  getMetaEvidence = async (arbitrableAddress, disputeID) =>
    await this.state.archon.arbitrable.getMetaEvidence(
      arbitrableAddress, // arbitrable contract address
      (await this.getDisputeEvent(arbitrableAddress, disputeID)).metaEvidenceID
    )

  getEvidences = async (arbitrableAddress, disputeID) => {
    return await this.state.archon.arbitrable.getEvidence(
      arbitrableAddress,
      networkMap[this.state.network].KLEROS_LIQUID,
      (await this.getDisputeEvent(arbitrableAddress, disputeID)).evidenceGroupID
    )
  }

  getContractInstance = (interfaceName, address) =>
    EthereumInterface.contractInstance(interfaceName, address)

  submitEvidence = async ({ disputeID, evidenceFileURI }) => {
    const { activeAddress, network } = this.state

    const evidence = {
      name: 'name',
      description: 'description',
      fileURI: evidenceFileURI
    }

    const localDisputeID = await EthereumInterface.call(
      'BinaryArbitrableProxy',
      networkMap[network].BINARY_ARBITRABLE_PROXY,
      'externalIDtoLocalID',
      disputeID
    )

    const ipfsHashEvidenceObj = await ipfsPublish(
      'evidence.json',
      this.encoder.encode(JSON.stringify(evidence))
    )

    const evidenceURI =
      '/ipfs/' + ipfsHashEvidenceObj[1]['hash'] + ipfsHashEvidenceObj[0]['path']

    return await EthereumInterface.send(
      'BinaryArbitrableProxy',
      networkMap[network].BINARY_ARBITRABLE_PROXY,
      activeAddress,
      0,
      'submitEvidence',
      localDisputeID,
      evidenceURI
    )
  }

  render() {
    console.debug(this.state)

    const { activeAddress, network, lastDisputeID } = this.state

    if (!network || !activeAddress)
      return (
        <Container fluid="true">
          <TopBanner title="title" description="description" />
          <_404 />
          <Footer title="title" description="description" />
        </Container>
      )
    else
      return (
        <Container fluid="true">
          <TopBanner title="title" description="description" />
          <BrowserRouter>
            <Switch>
              <Route
                exact
                path="(/|/create)"
                render={props => (
                  <React.Fragment>
                    <CreateDispute
                      createDisputeCallback={this.createDispute}
                      publishCallback={this.onPublish}
                      getSubCourtDetailsCallback={this.getSubCourtDetails}
                      getArbitrationCostCallback={
                        this.getArbitrationCostWithCourtAndNoOfJurors
                      }
                    />
                  </React.Fragment>
                )}
              />
              <Route
                exact
                path="/interact/:id?"
                render={props => (
                  <React.Fragment>
                    <Interact
                      getEvidencesCallback={this.getEvidences}
                      getSubCourtDetailsCallback={this.getSubCourtDetails}
                      getMetaEvidenceCallback={this.getMetaEvidence}
                      getContractInstanceCallback={this.getContractInstance}
                      publishCallback={this.onPublish}
                      submitEvidenceCallback={this.submitEvidence}
                      disputeID={lastDisputeID}
                      getDisputeCallback={this.getDispute}
                      appealCallback={this.appeal}
                      newDisputeCallback={this.updateLastDisputeID}
                    />
                  </React.Fragment>
                )}
              />
            </Switch>
          </BrowserRouter>
          <IPFS publishCallback={this.onPublish} />
          <Footer title="title" description="description" />
        </Container>
      )
  }
}
export default App
