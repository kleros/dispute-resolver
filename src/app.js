import React from "react";
import { Col, Container, Row } from "react-bootstrap";
import "./app.css";
import CreateDispute from "./containers/create-dispute";
import _404 from "./containers/404";
import Interact from "./containers/interact";
import { BrowserRouter, Route, Switch } from "react-router-dom";
import TopBanner from "./components/top-banner";
import Footer from "./components/footer";
import IPFS from "./components/ipfs";
import Web3 from "./ethereum/web3";
import * as EthereumInterface from "./ethereum/interface";
import networkMap from "./ethereum/network-contract-mapping";
import ipfsPublish from "./ipfs-publish";
import Archon from "@kleros/archon";

class App extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      activeAddress: "",
      network: "",
      lastDisputeID: ""
    };
    this.encoder = new TextEncoder();
  }

  async componentDidMount() {
    console.log(networkMap);
    console.debug(process.env);

    if (typeof window.ethereum !== "undefined") {
      console.log(window.ethereum);
      this.setState({ network: window.ethereum.networkVersion });

      this.setState({ activeAddress: window.ethereum.selectedAddress });
      this.setState({
        archon: new Archon(window.ethereum, "https://ipfs.kleros.io")
      });
      window.ethereum.on("accountsChanged", accounts => {
        this.setState({ activeAddress: accounts[0] });
      });

      window.ethereum.on("networkChanged", network => {
        this.setState({ network });
      });
    } else console.error("MetaMask not detected :(");
  }

  getArbitrableDisputeID = async (
    arbitrableAddress,
    arbitratorAddress,
    arbitratorDisputeID
  ) =>
    EthereumInterface.call(
      "BinaryArbitrableProxy",
      arbitrableAddress,
      "arbitratorExternalIDtoLocalID",
      arbitratorAddress,
      arbitratorDisputeID
    );

  getArbitrationCost = (arbitratorAddress, extraData) =>
    EthereumInterface.call(
      "Arbitrator",
      arbitratorAddress,
      "arbitrationCost",
      extraData
    );

  getArbitrationCostWithCourtAndNoOfJurors = async (subcourtID, noOfJurors) =>
    Web3.utils.fromWei(
      await EthereumInterface.call(
        "Arbitrator",
        networkMap[this.state.network].KLEROS_LIQUID,
        "arbitrationCost",
        this.generateArbitratorExtraData(subcourtID, noOfJurors)
      ),

      "ether"
    );

  getSubCourtDetails = async subcourtID =>
    EthereumInterface.call(
      "PolicyRegistry",
      networkMap[this.state.network].POLICY_REGISTRY,
      "policies",
      subcourtID
    );

  getArbitratorDispute = async arbitratorDisputeID =>
    EthereumInterface.call(
      "KlerosLiquid",
      networkMap[this.state.network].KLEROS_LIQUID,
      "disputes",
      arbitratorDisputeID
    );

  getArbitrableDispute = async arbitrableDisputeID =>
    EthereumInterface.call(
      "BinaryArbitrableProxy",
      networkMap[this.state.network].BINARY_ARBITRABLE_PROXY,
      "disputes",
      arbitrableDisputeID
    );

  getArbitrableDisputeStruct = async (arbitrableAddress, arbitrableDisputeID) =>
    EthereumInterface.call(
      "BinaryArbitrableProxy",
      arbitrableAddress,
      "disputes",
      arbitrableDisputeID
    );

  getArbitratorDisputeStruct = async arbitratorDisputeID =>
    EthereumInterface.call(
      "KlerosLiquid",
      networkMap[this.state.network].KLEROS_LIQUID,
      "disputes",
      arbitratorDisputeID
    );

  getCrowdfundingStatus = async (arbitrableAddress, arbitrableDisputeID) =>
    EthereumInterface.call(
      "BinaryArbitrableProxy",
      arbitrableAddress,
      "crowdfundingStatus",
      arbitrableDisputeID
    );

  updateLastDisputeID = async newDisputeID =>
    this.setState({ lastDisputeID: newDisputeID });

  onPublish = async (filename, fileBuffer) =>
    await ipfsPublish(filename, fileBuffer);

  generateArbitratorExtraData = (subcourtID, noOfJurors) =>
    `0x${parseInt(subcourtID, 16)
      .toString()
      .padStart(64, "0") +
      parseInt(noOfJurors, 16)
        .toString()
        .padStart(64, "0")}`;

  getAppealCost = async arbitratorDisputeID =>
    EthereumInterface.call(
      "Arbitrator",
      networkMap[this.state.network].KLEROS_LIQUID,
      "appealCost",
      arbitratorDisputeID,
      "0x0"
    );

  createDispute = async options => {
    console.log("CALLBACK CREATE DISPUTE");
    const { activeAddress, network } = this.state;
    const arbitrator = networkMap[network].KLEROS_LIQUID;
    console.log(options.selectedSubcourt);
    const arbitratorExtraData = this.generateArbitratorExtraData(
      options.selectedSubcourt,
      options.initialNumberOfJurors
    );
    console.log("CALLBACK CREATE DISPUTE");

    console.log(`ex data ${arbitratorExtraData}`);

    const metaevidence = {
      category: "unused",
      title: options.title,
      description: options.description,
      question: options.question,
      rulingOptions: {
        type: "single-select",
        titles: [options.firstRulingOption, options.secondRulingOption],
        descriptions: [
          options.firstRulingDescription,
          options.secondRulingDescription
        ]
      },
      fileURI: options.primaryDocument
    };

    const ipfsHashMetaEvidenceObj = await ipfsPublish(
      "metaEvidence.json",
      this.encoder.encode(JSON.stringify(metaevidence))
    );

    console.log(ipfsHashMetaEvidenceObj);

    const metaevidenceURI = `/ipfs/${ipfsHashMetaEvidenceObj[1].hash}${
      ipfsHashMetaEvidenceObj[0].path
    }`;

    console.log(metaevidenceURI);

    const arbitrationCost = await this.getArbitrationCost(
      arbitrator,
      arbitratorExtraData
    );

    return EthereumInterface.send(
      "BinaryArbitrableProxy",
      networkMap[network].BINARY_ARBITRABLE_PROXY,
      activeAddress,
      arbitrationCost,
      "createDispute",
      arbitrator,
      arbitratorExtraData,
      metaevidenceURI
    );
  };

  getDisputeEvent = async (arbitrableAddress, disputeID) =>
    await this.state.archon.arbitrable.getDispute(
      arbitrableAddress, // arbitrable contract address
      networkMap[this.state.network].KLEROS_LIQUID, // arbitrator contract address
      disputeID // dispute unique identifier
    );

  getMetaEvidence = async (arbitrableAddress, disputeID) =>
    await this.state.archon.arbitrable.getMetaEvidence(
      arbitrableAddress, // arbitrable contract address
      disputeID
    );

  getEvidences = async (arbitrableAddress, arbitrableDisputeID) =>
    await this.state.archon.arbitrable.getEvidence(
      arbitrableAddress,
      networkMap[this.state.network].KLEROS_LIQUID,
      arbitrableDisputeID
    );

  getContractInstance = (interfaceName, address) =>
    EthereumInterface.contractInstance(interfaceName, address);

  submitEvidence = async ({
    disputeID,
    evidenceTitle,
    evidenceDescription,
    evidenceFileURI
  }) => {
    const { activeAddress, network } = this.state;

    const evidence = {
      name: evidenceTitle,
      description: evidenceDescription,
      fileURI: evidenceFileURI
    };

    console.log(`evidence: ${JSON.stringify(evidence)}`);

    const ipfsHashEvidenceObj = await ipfsPublish(
      "evidence.json",
      this.encoder.encode(JSON.stringify(evidence))
    );

    const evidenceURI = `/ipfs/${ipfsHashEvidenceObj[1].hash}${
      ipfsHashEvidenceObj[0].path
    }`;

    console.log(evidenceURI);

    return await EthereumInterface.send(
      "BinaryArbitrableProxy",
      networkMap[network].BINARY_ARBITRABLE_PROXY,
      activeAddress,
      0,
      "submitEvidence",
      disputeID,
      evidenceURI
    );
  };

  render() {
    console.debug(this.state);

    const { activeAddress, network, lastDisputeID } = this.state;

    if (!network || !activeAddress)
      return (
        <Container fluid="true">
          <TopBanner description="description" title="title" />
          <_404 />
          <Footer description="description" title="title" />
        </Container>
      );
    else
      return (
        <Container fluid="true">
          <BrowserRouter>
            <Switch>
              <Route
                exact
                path="(/|/create)"
                render={route => (
                  <>
                    <TopBanner pathname={route.location.pathname} />
                    <CreateDispute
                      route={route}
                      createDisputeCallback={this.createDispute}
                      getArbitrationCostCallback={
                        this.getArbitrationCostWithCourtAndNoOfJurors
                      }
                      getSubCourtDetailsCallback={this.getSubCourtDetails}
                      publishCallback={this.onPublish}
                    />
                  </>
                )}
              />
              <Route
                exact
                path="/interact/:id?"
                render={route => (
                  <>
                    <TopBanner pathname={route.location.pathname} />
                    <Interact
                      route={route}
                      getAppealCostCallback={this.getAppealCost}
                      disputeID={lastDisputeID}
                      getContractInstanceCallback={this.getContractInstance}
                      getArbitratorDisputeCallback={this.getArbitratorDispute}
                      getArbitrableDisputeCallback={this.getArbitrableDispute}
                      getArbitratorDisputeStructCallback={
                        this.getArbitratorDisputeStruct
                      }
                      getArbitrableDisputeStructCallback={
                        this.getArbitrableDisputeStruct
                      }
                      getCrowdfundingStatusCallback={this.getCrowdfundingStatus}
                      getEvidencesCallback={this.getEvidences}
                      getMetaEvidenceCallback={this.getMetaEvidence}
                      getSubCourtDetailsCallback={this.getSubCourtDetails}
                      publishCallback={this.onPublish}
                      submitEvidenceCallback={this.submitEvidence}
                    />
                  </>
                )}
              />
            </Switch>
          </BrowserRouter>
          <Footer description="description" title="title" />
        </Container>
      );
  }
}
export default App;
