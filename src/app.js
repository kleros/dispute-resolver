import React from "react";
import { Container } from "react-bootstrap";
import "./app.css";
import CreateDispute from "./containers/create-dispute";
import _404 from "./containers/404";
import Interact from "./containers/interact";
import { BrowserRouter, Route, Switch } from "react-router-dom";
import TopBanner from "./components/top-banner";
import { default as Footer } from "@kleros/react-components/dist/footer";
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
    console.log(Footer);
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

      window.ethereum.on("data", data => {
        console.log(data);
        this.forceUpdate();
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
      arbitrableDisputeID,
      this.state.activeAddress
    );

  updateLastDisputeID = async newDisputeID =>
    this.setState({ lastDisputeID: newDisputeID });

  onPublish = async (filename, fileBuffer) =>
    await ipfsPublish(filename, fileBuffer);

  generateArbitratorExtraData = (subcourtID, noOfJurors) =>
    `0x${parseInt(subcourtID, 10)
      .toString(16)
      .padStart(64, "0") +
      parseInt(noOfJurors, 10)
        .toString(16)
        .padStart(64, "0")}`;

  getAppealCost = async arbitratorDisputeID =>
    EthereumInterface.call(
      "Arbitrator",
      networkMap[this.state.network].KLEROS_LIQUID,
      "appealCost",
      arbitratorDisputeID,
      "0x0"
    );

  appeal = async (arbitrableDisputeID, party, contribution) =>
    EthereumInterface.send(
      "BinaryArbitrableProxy",
      networkMap[this.state.network].BINARY_ARBITRABLE_PROXY,
      this.state.activeAddress,
      contribution,
      "appeal",
      arbitrableDisputeID,
      party
    );

  getAppealPeriod = async arbitratorDisputeID =>
    EthereumInterface.call(
      "KlerosLiquid",
      networkMap[this.state.network].KLEROS_LIQUID,
      "appealPeriod",
      arbitratorDisputeID
    );

  getCurrentRuling = async arbitratorDisputeID =>
    EthereumInterface.call(
      "KlerosLiquid",
      networkMap[this.state.network].KLEROS_LIQUID,
      "currentRuling",
      arbitratorDisputeID
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
      category: options.category,
      description: options.description,
      aliases: options.aliases,
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
    evidenceDocument
  }) => {
    const { activeAddress, network } = this.state;

    const evidence = {
      name: evidenceTitle,
      description: evidenceDescription,
      fileURI: evidenceDocument
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
          <_404 Web3={true} />
          <Footer description="description" title="title" />
        </Container>
      );
    else
      return (
        <Container fluid="true" style={{ height: "-webkit-fill-available" }}>
          <BrowserRouter>
            <Switch>
              <Route
                exact
                path="(/|/create)"
                render={route => (
                  <>
                    <TopBanner pathname={route.location.pathname} />
                    <CreateDispute
                      activeAddress={this.state.activeAddress}
                      route={route}
                      createDisputeCallback={this.createDispute}
                      getArbitrationCostCallback={
                        this.getArbitrationCostWithCourtAndNoOfJurors
                      }
                      getSubCourtDetailsCallback={this.getSubCourtDetails}
                      publishCallback={this.onPublish}
                      web3={Web3}
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
                      appealCallback={this.appeal}
                      getAppealPeriodCallback={this.getAppealPeriod}
                      getCurrentRulingCallback={this.getCurrentRuling}
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
              <Route component={_404} />
            </Switch>
          </BrowserRouter>
          <Footer
            appName="Binary Arbitrable Proxy"
            contractAddress={
              networkMap[this.state.network].BINARY_ARBITRABLE_PROXY
            }
            repository={"https://github.com/kleros/binary-arbitrable-proxy"}
            style={{ marginTop: "40px" }}
          />
        </Container>
      );
  }
}
export default App;
