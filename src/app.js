import React from 'react'
import Container from 'react-bootstrap/Container'
import Jumbotron from 'react-bootstrap/Jumbotron'
import Button from 'react-bootstrap/Button'
import Form from 'react-bootstrap/Form'
import Row from 'react-bootstrap/Row'
import Col from 'react-bootstrap/Col'
import './app.css'
import CreateDispute from './create-dispute'

import * as BinaryArbitrableProxy from './ethereum/binary-arbitrable-proxy'
import * as Arbitrator from './ethereum/arbitrator'

import web3 from './ethereum/web3'
import networkMap from './ethereum/network-contract-mapping'
import ipfsPublish from './ipfs-publish'

class App extends React.Component {
  constructor(props) {
    super(props)
    this.state = {
      activeAddress: '0x0000000000000000000000000000000000000000',
      network: '1'
    }
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

  arbitrationCost = (arbitratorAddress, extraData) =>
    Arbitrator.arbitrationCost(arbitratorAddress, extraData)

  publishPrimaryDocument = async (filename, fileBuffer) => {
    return await ipfsPublish(filename, fileBuffer)
  }

  createDispute = async (
    value,
    arbitratorAddress,
    arbitratorExtraData,
    metaevidenceURI
  ) => {
    const { activeAddress, network } = this.state
    await BinaryArbitrableProxy.createDispute(
      networkMap[network].BINARY_ARBITRABLE_PROXY,
      activeAddress,
      value,
      arbitratorAddress,
      web3.utils.bytesToHex(arbitratorExtraData),
      metaevidenceURI
    )
  }

  render() {
    console.debug(this.state)

    return (
      <Container>
        <Row>
          <Col>
            <h1 className="text-center my-5">Binary Arbitrable Proxy</h1>
          </Col>
        </Row>

        <Row>
          <CreateDispute
            network={this.state.network}
            createDisputeCallback={this.createDispute}
            arbitrationCostCallback={this.arbitrationCost}
            publishPrimaryDocumentCallback={this.publishPrimaryDocument}
          />
        </Row>
      </Container>
    )
  }
}

export default App
