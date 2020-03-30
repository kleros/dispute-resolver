import React from "react";
import { Container } from "react-bootstrap";
import "./app.css";
import CreateDispute from "./containers/create-dispute";
import _404 from "./containers/404";
import Interact from "./containers/interact";
import { BrowserRouter, Route, Switch } from "react-router-dom";
import TopBanner from "./components/top-banner";
import { Footer } from "@kleros/react-components";
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
      lastDisputeID: "",
      dummy: "",
    };
    this.encoder = new TextEncoder();
  }
  ETHERSCAN_STRINGS = { "1": "", "42": "kovan." };

  async componentDidMount() {
    console.log(Footer);
    console.log(networkMap);
    console.debug(process.env);

    if (Web3) {
      this.setState({ network: await Web3.eth.net.getId() });   
      this.setState({
        archon: new Archon(Web3.currentProvider.host, "https://ipfs.kleros.io")
      });
    }

    if (typeof window.ethereum !== "undefined") {
      this.setState({ activeAddress: window.ethereum.selectedAddress });
      window.ethereum.on("accountsChanged", accounts => {
        this.setState({ activeAddress: accounts[0] });
      });

      window.ethereum.on("networkChanged", (network) => {
        this.setState({ network });
      });

      window.ethereum.on("data", (data) => {});
    } else console.error("MetaMask not detected :(");
  }

  getArbitrableDisputeID = async (arbitratorDisputeID) => EthereumInterface.call("BinaryArbitrableProxy", networkMap[this.state.network].BINARY_ARBITRABLE_PROXY, "externalIDtoLocalID", arbitratorDisputeID);

  getArbitrationCost = (arbitratorAddress, extraData) => EthereumInterface.call("IArbitrator", arbitratorAddress, "arbitrationCost", extraData);

  getArbitrationCostWithCourtAndNoOfJurors = async (subcourtID, noOfJurors) =>
    Web3.utils.fromWei(
      await EthereumInterface.call("IArbitrator", networkMap[this.state.network].KLEROS_LIQUID, "arbitrationCost", this.generateArbitratorExtraData(subcourtID, noOfJurors)),

      "ether"
    );

  getSubCourtDetails = async (subcourtID) => EthereumInterface.call("PolicyRegistry", networkMap[this.state.network].POLICY_REGISTRY, "policies", subcourtID);

  getArbitratorDispute = async (arbitratorDisputeID) => EthereumInterface.call("KlerosLiquid", networkMap[this.state.network].KLEROS_LIQUID, "disputes", arbitratorDisputeID);

  getArbitrableDispute = async (arbitrableDisputeID) => EthereumInterface.call("BinaryArbitrableProxy", networkMap[this.state.network].BINARY_ARBITRABLE_PROXY, "disputes", arbitrableDisputeID);

  getArbitrableDisputeStruct = async (arbitrableAddress, arbitrableDisputeID) => EthereumInterface.call("BinaryArbitrableProxy", arbitrableAddress, "disputes", arbitrableDisputeID);

  getArbitratorDisputeStruct = async (arbitratorDisputeID) => EthereumInterface.call("KlerosLiquid", networkMap[this.state.network].KLEROS_LIQUID, "disputes", arbitratorDisputeID);

  getCrowdfundingStatus = async (arbitrableDisputeID) => EthereumInterface.call("BinaryArbitrableProxy", networkMap[this.state.network].BINARY_ARBITRABLE_PROXY, "crowdfundingStatus", arbitrableDisputeID, this.state.activeAddress);

  getMultipliers = async () => this.interactWithBinaryArbitrableProxy("call", "unused", "getMultipliers");

  withdrewAlready = async (arbitrableDisputeID) => this.interactWithBinaryArbitrableProxy("call", "unused", "withdrewAlready", arbitrableDisputeID, this.state.activeAddress);

  updateLastDisputeID = async (newDisputeID) => this.setState({ lastDisputeID: newDisputeID });

  onPublish = async (filename, fileBuffer) => await ipfsPublish(filename, fileBuffer);

  generateArbitratorExtraData = (subcourtID, noOfJurors) => `0x${parseInt(subcourtID, 10).toString(16).padStart(64, "0") + parseInt(noOfJurors, 10).toString(16).padStart(64, "0")}`;

  getWinnerMultiplier = async (arbitrableAddress) => EthereumInterface.call("BinaryArbitrableProxy", arbitrableAddress, "winnerStakeMultiplier");

  getLoserMultiplier = async (arbitrableAddress) => EthereumInterface.call("BinaryArbitrableProxy", arbitrableAddress, "loserStakeMultiplier");

  getSharedMultiplier = async (arbitrableAddress) => EthereumInterface.call("BinaryArbitrableProxy", arbitrableAddress, "sharedStakeMultiplier");

  getMultiplierDivisor = async (arbitrableAddress) => EthereumInterface.call("BinaryArbitrableProxy", arbitrableAddress, "MULTIPLIER_DIVISOR");

  withdrawFeesAndRewards = async (arbitrableDispute, roundNumber) =>
    EthereumInterface.send("BinaryArbitrableProxy", networkMap[this.state.network].BINARY_ARBITRABLE_PROXY, this.state.activeAddress, 0, "withdrawFeesAndRewards", arbitrableDispute, this.state.activeAddress, roundNumber);

  withdrawFeesAndRewardsForAllRounds = async (arbitrableDispute) => this.interactWithBinaryArbitrableProxy("send", "0", "withdrawFeesAndRewardsForAllRounds", arbitrableDispute, this.state.activeAddress);

  getAppealCost = async (arbitratorDisputeID) => EthereumInterface.call("IArbitrator", networkMap[this.state.network].KLEROS_LIQUID, "appealCost", arbitratorDisputeID, "0x0");

  appeal = async (arbitrableDisputeID, party, contribution) => EthereumInterface.send("BinaryArbitrableProxy", networkMap[this.state.network].BINARY_ARBITRABLE_PROXY, this.state.activeAddress, contribution, "fundAppeal", arbitrableDisputeID, party);

  getAppealPeriod = async (arbitratorDisputeID) => EthereumInterface.call("KlerosLiquid", networkMap[this.state.network].KLEROS_LIQUID, "appealPeriod", arbitratorDisputeID);

  interactWithKlerosLiquid = async (interactionType, txValue, methodName, ...args) => {
    if (interactionType === "call") {
      return EthereumInterface.call("KlerosLiquid", networkMap[this.state.network].KLEROS_LIQUID, methodName, ...args);
    } else if (interactionType === "send") {
      return EthereumInterface.send("KlerosLiquid", networkMap[this.state.network].KLEROS_LIQUID, this.state.activeAddress, txValue, methodName, ...args);
    } else {
      return;
    }
  };

  interactWithBinaryArbitrableProxy = async (interactionType, txValue, methodName, ...args) => {
    if (interactionType === "call") {
      return EthereumInterface.call("BinaryArbitrableProxy", networkMap[this.state.network].BINARY_ARBITRABLE_PROXY, methodName, ...args);
    } else if (interactionType === "send") {
      return EthereumInterface.send("BinaryArbitrableProxy", networkMap[this.state.network].BINARY_ARBITRABLE_PROXY, this.state.activeAddress, txValue, methodName, ...args);
    } else {
      return;
    }
  };

  getCurrentRuling = async (arbitratorDisputeID) => EthereumInterface.call("KlerosLiquid", networkMap[this.state.network].KLEROS_LIQUID, "currentRuling", arbitratorDisputeID);

  createDispute = async (options) => {
    console.log("CALLBACK CREATE DISPUTE");
    const { activeAddress, network } = this.state;
    const arbitrator = networkMap[network].KLEROS_LIQUID;
    console.log(options.selectedSubcourt);
    const arbitratorExtraData = this.generateArbitratorExtraData(options.selectedSubcourt, options.initialNumberOfJurors);
    console.log("CALLBACK CREATE DISPUTE");

    console.log(`ex data ${arbitratorExtraData}`);

    const metaevidence = {
      title: options.title,
      category: options.category,
      description: options.description,
      aliases: options.aliases,
      question: options.question,
      rulingOptions: {
        type: "single-select",
        titles: [options.firstRulingOption, options.secondRulingOption],
        descriptions: [options.firstRulingDescription, options.secondRulingDescription],
      },
      fileURI: options.primaryDocument,
    };

    const ipfsHashMetaEvidenceObj = await ipfsPublish("metaEvidence.json", this.encoder.encode(JSON.stringify(metaevidence)));

    console.log(ipfsHashMetaEvidenceObj);

    const metaevidenceURI = `/ipfs/${ipfsHashMetaEvidenceObj[1].hash}${ipfsHashMetaEvidenceObj[0].path}`;

    console.log(metaevidenceURI);

    const arbitrationCost = await this.getArbitrationCost(arbitrator, arbitratorExtraData);

    return EthereumInterface.send("BinaryArbitrableProxy", networkMap[network].BINARY_ARBITRABLE_PROXY, activeAddress, arbitrationCost, "createDispute", arbitratorExtraData, metaevidenceURI);
  };

  getDisputeEvent = async (arbitrableAddress, disputeID) =>
    await this.state.archon.arbitrable.getDispute(
      arbitrableAddress, // arbitrable contract address
      networkMap[this.state.network].KLEROS_LIQUID, // arbitrator contract address
      disputeID // dispute unique identifier
    );

  getDispute = async disputeID =>
    EthereumInterface.call(
      "KlerosLiquid",
      networkMap[this.state.network].KLEROS_LIQUID,
      "getDispute",
      disputeID
    );

  getMetaEvidence = async (arbitrableAddress, disputeID) =>
    await this.state.archon.arbitrable.getMetaEvidence(
      arbitrableAddress, // arbitrable contract address
      disputeID
    );

  getEvidences = async (arbitrableAddress, arbitrableDisputeID) => await this.state.archon.arbitrable.getEvidence(arbitrableAddress, networkMap[this.state.network].KLEROS_LIQUID, arbitrableDisputeID);

  getRuling = async (arbitrableAddress, arbitratorDisputeID) => await this.state.archon.arbitrable.getRuling(arbitrableAddress, networkMap[this.state.network].KLEROS_LIQUID, arbitratorDisputeID);

  getContractInstance = (interfaceName, address) => EthereumInterface.contractInstance(interfaceName, address);

  submitEvidence = async ({ disputeID, evidenceTitle, evidenceDescription, evidenceDocument, supportingSide }) => {
    const { activeAddress, network } = this.state;

    const evidence = {
      name: evidenceTitle,
      description: evidenceDescription,
      fileURI: evidenceDocument,
      evidenceSide: supportingSide,
    };

    console.log(`evidence: ${JSON.stringify(evidence)}`);

    const ipfsHashEvidenceObj = await ipfsPublish("evidence.json", this.encoder.encode(JSON.stringify(evidence)));

    const evidenceURI = `/ipfs/${ipfsHashEvidenceObj[1].hash}${ipfsHashEvidenceObj[0].path}`;

    console.log(evidenceURI);

    await EthereumInterface.send("BinaryArbitrableProxy", networkMap[network].BINARY_ARBITRABLE_PROXY, activeAddress, 0, "submitEvidence", disputeID, evidenceURI);
  };

  render() {
    console.debug(this.state);

    const { activeAddress, network, lastDisputeID } = this.state;

    if (!network)
      return (
        <Container fluid="true" style={{ position: "relative" }}>
          <Container fluid="true">
            <TopBanner description="description" title="title" />
            <_404 Web3={true} />
          </Container>
          <Footer appName="Dispute Resolver" contractExplorerURL={`https://${this.ETHERSCAN_STRINGS[1]}etherscan.io/address/${networkMap[1].BINARY_ARBITRABLE_PROXY}#code`} repository={"https://github.com/kleros/binary-arbitrable-proxy"} />
        </Container>
      );
    else
      return (
        <Container fluid="true" style={{ position: "relative", minHeight: "100vh" }}>
          <Container fluid="true" style={{ paddingBottom: "7rem" }}>
            <BrowserRouter>
              <Switch>
                <Route
                  exact
                  path="(/|/create/)"
                  render={(route) => (
                    <>
                      <TopBanner route={route} />
                      <CreateDispute
                        activeAddress={activeAddress}
                        route={route}
                        createDisputeCallback={this.createDispute}
                        getArbitrationCostCallback={this.getArbitrationCostWithCourtAndNoOfJurors}
                        getSubCourtDetailsCallback={this.getSubCourtDetails}
                        publishCallback={this.onPublish}
                        web3={Web3}
                        interactWithKlerosLiquidCallback={this.interactWithKlerosLiquid}
                        interactWithBinaryArbitrableProxyCallback={this.interactWithBinaryArbitrableProxy}
                      />
                    </>
                  )}
                />
                <Route
                  exact
                  path="/interact/:id?"
                  render={(route) => (
                    <>
                      <TopBanner route={route} />
                      <Interact
                        arbitrableAddress={networkMap[network].BINARY_ARBITRABLE_PROXY}
                        route={route}
                        getArbitrableDisputeIDCallback={this.getArbitrableDisputeID}
                        getAppealCostCallback={this.getAppealCost}
                        appealCallback={this.appeal}
                        getAppealPeriodCallback={this.getAppealPeriod}
                        getCurrentRulingCallback={this.getCurrentRuling}
                        disputeID={lastDisputeID}
                        getContractInstanceCallback={this.getContractInstance}
                        getArbitratorDisputeCallback={this.getArbitratorDispute}
                        getArbitrableDisputeCallback={this.getArbitrableDispute}
                        getArbitratorDisputeStructCallback={this.getArbitratorDisputeStruct}
                        getArbitrableDisputeStructCallback={this.getArbitrableDisputeStruct}
                        getCrowdfundingStatusCallback={this.getCrowdfundingStatus}
                        getRulingCallback={this.getRuling}
                        getEvidencesCallback={this.getEvidences}
                        getMetaEvidenceCallback={this.getMetaEvidence}
                        getSubCourtDetailsCallback={this.getSubCourtDetails}
                        publishCallback={this.onPublish}
                        submitEvidenceCallback={this.submitEvidence}
                        getDisputeEventCallback={this.getDisputeEvent}

                        getMultipliersCallback={this.getMultipliers}
                        withdrawFeesAndRewardsCallback={this.withdrawFeesAndRewardsForAllRounds}
                        withdrewAlreadyCallback={this.withdrewAlready}
                        interactWithKlerosLiquidCallback={this.interactWithKlerosLiquid}
                        interactWithBinaryArbitrableProxyCallback={this.interactWithBinaryArbitrableProxy}

                        getDisputeCallback={this.getDispute}

                        withdrawFeesAndRewardsCallback={
                          this.withdrawFeesAndRewards
                        }

                      />
                    </>
                  )}
                />
                <Route component={_404} />
              </Switch>
            </BrowserRouter>
          </Container>
          <Footer appName="Dispute Resolver" contractExplorerURL={`https://${this.ETHERSCAN_STRINGS[this.state.network]}etherscan.io/address/${networkMap[this.state.network].BINARY_ARBITRABLE_PROXY}#code`} repository={"https://github.com/kleros/dispute-resolver"} />
        </Container>
      );
  }
}
export default App;
