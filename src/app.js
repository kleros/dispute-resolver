import React from "react";
import { Container, Spinner } from "react-bootstrap";
import "./app.css";
import styled from "styled-components/macro";
import CreateDispute from "./containers/create-dispute";
import _404 from "./containers/404";
import Interact from "./containers/interact";
import OpenDisputes from "./containers/open-disputes";
import { BrowserRouter, Route, Switch, Link, Redirect } from "react-router-dom";
import TopBanner from "./components/top-banner";
import { Footer } from "@kleros/react-components";
import Web3 from "./ethereum/web3";
import * as EthereumInterface from "./ethereum/interface";
import networkMap from "./ethereum/network-contract-mapping";
import ipfsPublish from "./ipfs-publish";
import Archon from "@kleros/archon";

const SpinnerContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: ${"calc(100vh - 64px)"};
`;

const ADDRESS_ZERO = "0x0000000000000000000000000000000000000000";

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
  ETHERSCAN_STRINGS = Object.freeze({ "1": "", "42": "kovan." });

  interactWithKlerosLiquid = async (interactionType, txValue, methodName, ...args) => this.interactWithContract("KlerosLiquid", networkMap[this.state.network].KLEROS_LIQUID, interactionType, txValue, methodName, ...args);

  interactWithBinaryArbitrableProxy = async (interactionType, txValue, methodName, ...args) => this.interactWithContract("BinaryArbitrableProxy", networkMap[this.state.network].BINARY_ARBITRABLE_PROXY, interactionType, txValue, methodName, ...args);

  interactWithContract = async (contractName, contractAddress, interactionType, txValue, methodName, ...args) => {
    if (interactionType === "call") {
      return EthereumInterface.call(contractName, contractAddress, methodName, ...args);
    } else if (interactionType === "send") {
      return EthereumInterface.send(contractName, contractAddress, this.state.activeAddress, txValue, methodName, ...args);
    } else {
      return;
    }
  };

  async componentDidMount() {
    const self = this;
    if (Web3) {
      this.setState({ network: await Web3.eth.net.getId() });
      this.setState({
        archon: new Archon(Web3.currentProvider.host ? Web3.currentProvider.host : window.ethereum, "https://ipfs.kleros.io"),
      });
    }

    if (typeof window.ethereum !== "undefined") {
      this.setState({ activeAddress: window.ethereum.selectedAddress });
      window.ethereum.on("accountsChanged", (accounts) => {
        this.setState({ activeAddress: accounts[0] });
      });

      window.ethereum.on("networkChanged", (network) => {
        this.setState({ network });
      });

      window.ethereum.on("data", (data) => {
        console.log("TX CONFIRMED");
        self.forceUpdate();
      });
    } else console.error("MetaMask not detected :(");
  }

  getOpenDisputes = async () => this.interactWithBinaryArbitrableProxy("call", "unused", "getOpenDisputes", 0, 0);

  getArbitrableDisputeID = async (arbitratorDisputeID) => this.interactWithBinaryArbitrableProxy("call", "unused", "externalIDtoLocalID", arbitratorDisputeID);

  getArbitrationCost = (arbitratorAddress, extraData) => EthereumInterface.call("IArbitrator", arbitratorAddress, "arbitrationCost", extraData);

  getArbitrationCostWithCourtAndNoOfJurors = async (subcourtID, noOfJurors) => Web3.utils.fromWei(await EthereumInterface.call("IArbitrator", networkMap[this.state.network].KLEROS_LIQUID, "arbitrationCost", this.generateArbitratorExtraData(subcourtID, noOfJurors)), "ether");

  getSubcourt = async (subcourtID) => this.interactWithKlerosLiquid("call", "unused", "getSubcourt", subcourtID);

  getSubCourtDetails = async (subcourtID) => EthereumInterface.call("PolicyRegistry", networkMap[this.state.network].POLICY_REGISTRY, "policies", subcourtID);

  getArbitratorDispute = async (arbitratorDisputeID) => this.interactWithKlerosLiquid("call", "unused", "disputes", arbitratorDisputeID);

  getArbitrableDispute = async (arbitrableDisputeID) => this.interactWithBinaryArbitrableProxy("call", "unused", "disputes", arbitrableDisputeID);

  getArbitrableDisputeStruct = async (arbitrableAddress, arbitrableDisputeID) => this.interactWithBinaryArbitrableProxy("call", "unused", "disputes", arbitrableDisputeID);

  getArbitratorDisputeStruct = async (arbitratorDisputeID) => this.interactWithKlerosLiquid("call", "unused", "disputes", arbitratorDisputeID);

  getCrowdfundingStatus = async (arbitrableDisputeID) => this.interactWithBinaryArbitrableProxy("call", "unused", "crowdfundingStatus", arbitrableDisputeID, this.state.activeAddress ? this.state.activeAddress : ADDRESS_ZERO);

  getRoundInfo = async (arbitrableDisputeID, round) => this.interactWithBinaryArbitrableProxy("call", "unused", "getRoundInfo", arbitrableDisputeID, round);

  getMultipliers = async () => this.interactWithBinaryArbitrableProxy("call", "unused", "getMultipliers");

  withdrewAlready = async (arbitrableDisputeID) => this.interactWithBinaryArbitrableProxy("call", "unused", "withdrewAlready", arbitrableDisputeID, this.state.activeAddress ? this.state.activeAddress : ADDRESS_ZERO);

  updateLastDisputeID = async (newDisputeID) => this.setState({ lastDisputeID: newDisputeID });

  onPublish = async (filename, fileBuffer) => await ipfsPublish(filename, fileBuffer);

  generateArbitratorExtraData = (subcourtID, noOfJurors) => `0x${parseInt(subcourtID, 10).toString(16).padStart(64, "0") + parseInt(noOfJurors, 10).toString(16).padStart(64, "0")}`;

  withdrawFeesAndRewardsForAllRounds = async (arbitrableDispute) => this.interactWithBinaryArbitrableProxy("send", "0", "withdrawFeesAndRewardsForAllRounds", arbitrableDispute, this.state.activeAddress);

  getAppealCost = async (arbitratorDisputeID) => EthereumInterface.call("IArbitrator", networkMap[this.state.network].KLEROS_LIQUID, "appealCost", arbitratorDisputeID, "0x0");

  appeal = async (arbitrableDisputeID, party, contribution) => this.interactWithBinaryArbitrableProxy("send", contribution, "fundAppeal", arbitrableDisputeID, party);

  getAppealPeriod = async (arbitratorDisputeID) => this.interactWithKlerosLiquid("call", "unused", "appealPeriod", arbitratorDisputeID);

  passPeriod = async (arbitratorDisputeID) => this.interactWithKlerosLiquid("send", 0, "passPeriod", arbitratorDisputeID);

  estimateGasOfPassPeriod = async (arbitratorDisputeID) => EthereumInterface.estimateGas("KlerosLiquid", networkMap[this.state.network].KLEROS_LIQUID, this.state.activeAddress, 0, "passPeriod", arbitratorDisputeID);

  drawJurors = async (arbitratorDisputeID) => this.interactWithKlerosLiquid("send", 0, "drawJurors", arbitratorDisputeID, 1000);
  estimateGasOfDrawJurors = async (arbitratorDisputeID) => EthereumInterface.estimateGas("KlerosLiquid", networkMap[this.state.network].KLEROS_LIQUID, this.state.activeAddress, 0, "drawJurors", arbitratorDisputeID, 1000);

  passPhase = async () => this.interactWithKlerosLiquid("send", 0, "passPhase");

  getCurrentRuling = async (arbitratorDisputeID) => this.interactWithKlerosLiquid("call", "unused", "currentRuling", arbitratorDisputeID);

  createDispute = async (options) => {
    const { network } = this.state;
    const arbitrator = networkMap[network].KLEROS_LIQUID;
    const arbitratorExtraData = this.generateArbitratorExtraData(options.selectedSubcourt, options.initialNumberOfJurors);

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
      dynamicScriptURI: "/ipfs/QmZZHwVaXWtvChdFPG4UeXStKaC9aHamwQkNTEAfRmT2Fj",
    };

    const ipfsHashMetaEvidenceObj = await ipfsPublish("metaEvidence.json", this.encoder.encode(JSON.stringify(metaevidence)));

    const metaevidenceURI = `/ipfs/${ipfsHashMetaEvidenceObj[1].hash}${ipfsHashMetaEvidenceObj[0].path}`;

    const arbitrationCost = await this.getArbitrationCost(arbitrator, arbitratorExtraData);

    return this.interactWithBinaryArbitrableProxy("send", arbitrationCost, "createDispute", arbitratorExtraData, metaevidenceURI);
  };

  getDisputeEvent = async (arbitrableAddress, disputeID) =>
    await this.state.archon.arbitrable.getDispute(
      arbitrableAddress, // arbitrable contract address
      networkMap[this.state.network].KLEROS_LIQUID, // arbitrator contract address
      disputeID // dispute unique identifier
    );

  getMetaEvidence = async (disputeID) =>
    await this.state.archon.arbitrable.getMetaEvidence(
      networkMap[this.state.network].BINARY_ARBITRABLE_PROXY, // arbitrable contract address
      disputeID
    );

  getAppealDecision = async (arbitratorDisputeID) => {
    const contractInstance = EthereumInterface.contractInstance("KlerosLiquid", networkMap[this.state.network].KLEROS_LIQUID);
    const appealDecisionLog = await contractInstance.getPastEvents("AppealDecision", { fromBlock: 7303699, toBlock: "latest", filter: { _disputeID: arbitratorDisputeID } });
    const blockNumbers = await Promise.all(appealDecisionLog.map((appealDecision) => Web3.eth.getBlock(appealDecision.blockNumber)));
    return blockNumbers.map((blockNumber) => {
      return { appealedAt: blockNumber.timestamp };
    });
  };

  getDispute = async (disputeID) => this.interactWithKlerosLiquid("call", "unused", "getDispute", disputeID);

  getMetaEvidenceWithArbitratorDisputeID = async (arbitratorDisputeID) => this.state.archon.arbitrable.getMetaEvidence(networkMap[this.state.network].BINARY_ARBITRABLE_PROXY, await this.getArbitrableDisputeID(arbitratorDisputeID));

  getEvidences = async (arbitrableAddress, arbitrableDisputeID) => await this.state.archon.arbitrable.getEvidence(arbitrableAddress, networkMap[this.state.network].KLEROS_LIQUID, arbitrableDisputeID);

  getRuling = async (arbitrableAddress, arbitratorDisputeID) => await this.state.archon.arbitrable.getRuling(arbitrableAddress, networkMap[this.state.network].KLEROS_LIQUID, arbitratorDisputeID);

  getContractInstance = (interfaceName, address) => EthereumInterface.contractInstance(interfaceName, address);

  submitEvidence = async ({ disputeID, evidenceTitle, evidenceDescription, evidenceDocument, supportingSide }) => {
    const evidence = {
      name: evidenceTitle,
      description: evidenceDescription,
      fileURI: evidenceDocument,
      evidenceSide: supportingSide,
    };

    const ipfsHashEvidenceObj = await ipfsPublish("evidence.json", this.encoder.encode(JSON.stringify(evidence)));

    const evidenceURI = `/ipfs/${ipfsHashEvidenceObj[1].hash}${ipfsHashEvidenceObj[0].path}`;

    await this.interactWithBinaryArbitrableProxy("send", 0, "submitEvidence", disputeID, evidenceURI);
  };

  render() {
    const { activeAddress, network, lastDisputeID } = this.state;

    if (!network)
      return (
        <Container fluid="true" style={{ position: "relative", minHeight: "100vh" }}>
          <Container fluid="true">
            <BrowserRouter>
              <TopBanner description="description" title="title" viewOnly={!activeAddress} />
              <_404 Web3={true} />
            </BrowserRouter>
          </Container>
          <Footer appName="Dispute Resolver" contractExplorerURL={`https://${this.ETHERSCAN_STRINGS[1]}etherscan.io/address/${networkMap[1].BINARY_ARBITRABLE_PROXY}#code`} repository={"https://github.com/kleros/dispute-resolver"} />
        </Container>
      );

    if (!activeAddress)
      return (
        <Container fluid="true" style={{ position: "relative", minHeight: "100vh" }}>
          <Container fluid="true">
            <BrowserRouter>
              <Switch>
                <Route
                  exact
                  path="(/|/disputes/)"
                  render={(route) => (
                    <>
                      <TopBanner viewOnly={!activeAddress} route={route} />
                      <OpenDisputes activeAddress={activeAddress} route={route} getOpenDisputesCallback={this.getOpenDisputes} getMetaEvidenceCallback={this.getMetaEvidenceWithArbitratorDisputeID} />
                    </>
                  )}
                />

                <Route exact path="(/create/)" render={(route) => <Redirect to="/disputes/" />} />

                <Route
                  exact
                  path="/interact/:id?"
                  render={(route) => (
                    <>
                      <TopBanner viewOnly={!activeAddress} route={route} />

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
                        getDisputeCallback={this.getDispute}
                        getDisputeEventCallback={this.getDisputeEvent}
                        getMultipliersCallback={this.getMultipliers}
                        withdrewAlreadyCallback={this.withdrewAlready}
                        withdrawFeesAndRewardsCallback={this.withdrawFeesAndRewardsForAllRounds}
                        activeAddress={activeAddress}
                        getSubcourtCallback={this.getSubcourt}
                        passPeriodCallback={this.passPeriod}
                        drawJurorsCallback={this.drawJurors}
                        passPhaseCallback={this.passPhase}
                        estimateGasOfPassPeriodCallback={this.estimateGasOfPassPeriod}
                        estimateGasOfDrawJurorsCallback={this.estimateGasOfDrawJurors}
                        getRoundInfoCallback={this.getRoundInfo}
                        getAppealDecisionCallback={this.getAppealDecision}
                      />
                    </>
                  )}
                />

                <Route
                  render={(route) => (
                    <>
                      <TopBanner viewOnly={!activeAddress} route={route} />

                      <_404 />
                    </>
                  )}
                />
              </Switch>
            </BrowserRouter>
          </Container>
          <Footer appName="Dispute Resolver" contractExplorerURL={`https://${this.ETHERSCAN_STRINGS[1]}etherscan.io/address/${networkMap[1].BINARY_ARBITRABLE_PROXY}#code`} repository={"https://github.com/kleros/dispute-resolver"} />
        </Container>
      );

    return (
      <Container fluid="true" style={{ position: "relative", minHeight: "100vh" }}>
        <Container fluid="true" style={{ paddingBottom: "7rem" }}>
          <BrowserRouter>
            <Switch>
              <Route
                exact
                path="(/|/disputes/)"
                render={(route) => (
                  <>
                    <TopBanner viewOnly={!activeAddress} route={route} />
                    <OpenDisputes activeAddress={activeAddress} route={route} getOpenDisputesCallback={this.getOpenDisputes} getMetaEvidenceCallback={this.getMetaEvidenceWithArbitratorDisputeID} />
                  </>
                )}
              />

              <Route
                exact
                path="(/create/)"
                render={(route) => (
                  <>
                    <TopBanner viewOnly={!activeAddress} route={route} />
                    <CreateDispute
                      activeAddress={activeAddress}
                      route={route}
                      createDisputeCallback={this.createDispute}
                      getArbitrationCostCallback={this.getArbitrationCostWithCourtAndNoOfJurors}
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
                render={(route) => (
                  <>
                    <TopBanner viewOnly={!activeAddress} route={route} />

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
                      getDisputeCallback={this.getDispute}
                      getDisputeEventCallback={this.getDisputeEvent}
                      getMultipliersCallback={this.getMultipliers}
                      withdrewAlreadyCallback={this.withdrewAlready}
                      withdrawFeesAndRewardsCallback={this.withdrawFeesAndRewardsForAllRounds}
                      activeAddress={activeAddress}
                      getSubcourtCallback={this.getSubcourt}
                      passPeriodCallback={this.passPeriod}
                      drawJurorsCallback={this.drawJurors}
                      passPhaseCallback={this.passPhase}
                      estimateGasOfPassPeriodCallback={this.estimateGasOfPassPeriod}
                      estimateGasOfDrawJurorsCallback={this.estimateGasOfDrawJurors}
                      getRoundInfoCallback={this.getRoundInfo}
                      getAppealDecisionCallback={this.getAppealDecision}
                    />
                  </>
                )}
              />
              <Route
                render={(route) => (
                  <>
                    <TopBanner viewOnly={!activeAddress} route={route} />

                    <_404 />
                  </>
                )}
              />
            </Switch>
          </BrowserRouter>
        </Container>
        <Footer appName="Dispute Resolver" contractExplorerURL={`https://${this.ETHERSCAN_STRINGS[this.state.network]}etherscan.io/address/${networkMap[this.state.network].BINARY_ARBITRABLE_PROXY}#code`} repository={"https://github.com/kleros/dispute-resolver"} />
      </Container>
    );
  }
}
export default App;
