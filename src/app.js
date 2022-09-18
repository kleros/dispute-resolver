import React from "react";
import ReactDOM from "react-dom";
import { Container } from "react-bootstrap";
import "./app.scss";
import Create from "./containers/create";
import _404 from "./containers/404";
import Interact from "./containers/interact";
import OpenDisputes from "./containers/open-disputes";
import { BrowserRouter, Route, Switch, Redirect } from "react-router-dom";
import Header from "./components/header";
import Footer from "./components/footer";
import Web3 from "./ethereum/web3";
import * as EthereumInterface from "./ethereum/interface";
import networkMap from "./ethereum/network-contract-mapping";
import { getReadOnlyRpcUrl } from "./ethereum/network-contract-mapping";
import ipfsPublish from "./ipfs-publish";
import Archon from "@kleros/archon";

const ADDRESS_ZERO = "0x0000000000000000000000000000000000000000";
const IPFS_GATEWAY = "https://ipfs.kleros.io";
const QUERY_FROM_BLOCK = 7303699; // For performance.

class App extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      activeAddress: "",
      network: "",
      lastDisputeID: "",
      subcourtsLoading: true,
    };
    this.encoder = new TextEncoder();
  }

  async componentDidMount() {
    if (Web3) {
      this.setState({ network: await Web3.eth.net.getId() });
      this.setState({
        archon: new Archon(Web3.currentProvider.host ? Web3.currentProvider.host : window.ethereum, IPFS_GATEWAY),
      });
    }

    if (typeof window.ethereum !== "undefined") {
      await this.setState({ activeAddress: window.ethereum.selectedAddress });
      window.ethereum.on("accountsChanged", (accounts) => {
        this.setState({ activeAddress: accounts[0] });
      });

      window.ethereum.on("chainChanged", async (network) => {
        await this.setState({ network });
        if(networkMap[network].KLEROS_LIQUID)
        this.loadSubcourtData();
      });
    } else console.error("MetaMask not detected :(");
    if(networkMap[this.state.network].KLEROS_LIQUID)
    this.loadSubcourtData();
  }

  loadSubcourtData = async () => {
    let counter = 0,
      subcourts = [],
      subcourtURIs = [];

    while (true) {
      try {
        await this.estimateGasOfGetSubcourt(counter++);
      } catch (err) {
        break;
      }
    }

    for (var i = 0; i < counter - 1; i++) {
      subcourtURIs[i] = this.getSubCourtDetails(i);
      subcourts[i] = this.getSubcourt(i);
    }

    this.setState({
      subcourtDetails: await Promise.all(
        subcourtURIs.map((promise) =>
          promise.then((subcourtURI) => {
            if (subcourtURI.length > 0) {
              if (subcourtURI.includes("http")) {
                return fetch(subcourtURI)
                  .then((response) => response.json())
                  .catch((error) => console.error(error));
              } else {
                return fetch("https://ipfs.kleros.io" + subcourtURI).then((response) => response.json());
              }
            }
          })
        )
      ),
      subcourtsLoading: false,
      subcourts: await Promise.all(subcourts),
    });
  };

  getOpenDisputesOnCourt = async () => {
    const contractInstance = EthereumInterface.contractInstance("KlerosLiquid", networkMap[this.state.network].KLEROS_LIQUID);

    const newPeriodEvents = await contractInstance.getPastEvents("NewPeriod", { fromBlock: QUERY_FROM_BLOCK, toBlock: "latest" });
    const disputeCreationEvents = await contractInstance.getPastEvents("DisputeCreation", { fromBlock: QUERY_FROM_BLOCK, toBlock: "latest" });
    const disputes = [...new Set(disputeCreationEvents.map((result) => result.returnValues._disputeID))];
    const resolvedDisputes = newPeriodEvents.filter((result) => result.returnValues._period == 4).map((result) => result.returnValues._disputeID);

    const openDisputes = disputes.filter((dispute) => !resolvedDisputes.includes(dispute));

    return openDisputes;
  };

  getArbitrableDisputeID = async (arbitrableAddress, arbitratorDisputeID) =>
    EthereumInterface.call("IDisputeResolver", arbitrableAddress, "externalIDtoLocalID", arbitratorDisputeID);

  getArbitrationCost = (arbitratorAddress, extraData) => EthereumInterface.call("IArbitrator", arbitratorAddress, "arbitrationCost", extraData);

  getArbitrationCostWithCourtAndNoOfJurors = async (subcourtID, noOfJurors) =>
    Web3.utils.fromWei(
      await EthereumInterface.call("IArbitrator", networkMap[this.state.network].KLEROS_LIQUID, "arbitrationCost", this.generateArbitratorExtraData(subcourtID, noOfJurors)),
      "ether"
    );

  estimateGasOfGetSubcourt = (subcourtID) =>
    EthereumInterface.estimateGas("KlerosLiquid", networkMap[this.state.network].KLEROS_LIQUID, this.activeAddress, 0, "getSubcourt", subcourtID);

  getSubcourt = async (subcourtID) => EthereumInterface.call("KlerosLiquid", networkMap[this.state.network].KLEROS_LIQUID, "getSubcourt", subcourtID);

  getSubCourtDetails = async (subcourtID) => EthereumInterface.call("PolicyRegistry", networkMap[this.state.network].POLICY_REGISTRY, "policies", subcourtID);

  getArbitratorDispute = async (arbitratorDisputeID) => EthereumInterface.call("KlerosLiquid", networkMap[this.state.network].KLEROS_LIQUID, "disputes", arbitratorDisputeID);

  getArbitratorDisputeDetails = async (arbitratorDisputeID) =>
    EthereumInterface.call("KlerosLiquid", networkMap[this.state.network].KLEROS_LIQUID, "getDispute", arbitratorDisputeID);

  getMultipliers = (arbitrableAddress) => EthereumInterface.call("IDisputeResolver", arbitrableAddress, "getMultipliers");

  updateLastDisputeID = async (newDisputeID) => this.setState({ lastDisputeID: newDisputeID });

  onPublish = async (filename, fileBuffer) => await ipfsPublish(filename, fileBuffer);

  generateArbitratorExtraData = (subcourtID, noOfVotes) => `0x${parseInt(subcourtID, 10).toString(16).padStart(64, "0") + parseInt(noOfVotes, 10).toString(16).padStart(64, "0")}`;

  withdrawFeesAndRewardsForAllRounds = (arbitrableAddress, arbitrableDisputeID, rulingOptionsContributedTo) =>
    EthereumInterface.send(
      "IDisputeResolver",
      arbitrableAddress,
      this.state.activeAddress,
      "0",
      "withdrawFeesAndRewardsForAllRounds",
      arbitrableDisputeID,
      this.state.activeAddress,
      rulingOptionsContributedTo
    );

  getAppealCost = async (arbitratorDisputeID) => EthereumInterface.call("IArbitrator", networkMap[this.state.network].KLEROS_LIQUID, "appealCost", arbitratorDisputeID, "0x0");
  getAppealCostOnArbitrable = async (arbitrableDisputeID, ruling) =>
    EthereumInterface.call("IDisputeResolver", networkMap[this.state.network].ARBITRABLE_PROXY, "appealCost", arbitrableDisputeID, ruling);

  appeal = (arbitrableAddress, arbitrableDisputeID, party, contribution) =>
    EthereumInterface.send("IDisputeResolver", arbitrableAddress, this.state.activeAddress, contribution, "fundAppeal", arbitrableDisputeID, party);

  getAppealPeriod = async (arbitratorDisputeID) => EthereumInterface.call("KlerosLiquid", networkMap[this.state.network].KLEROS_LIQUID, "appealPeriod", arbitratorDisputeID);

  getCurrentRuling = async (arbitratorDisputeID) => EthereumInterface.call("KlerosLiquid", networkMap[this.state.network].KLEROS_LIQUID, "currentRuling", arbitratorDisputeID);

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
      rulingOptions: options.rulingOptions,
      fileURI: options.primaryDocument,
      dynamicScriptURI: "/ipfs/QmZZHwVaXWtvChdFPG4UeXStKaC9aHamwQkNTEAfRmT2Fj",
    };

    const ipfsHashMetaEvidenceObj = await ipfsPublish("metaEvidence.json", this.encoder.encode(JSON.stringify(metaevidence)));

    const metaevidenceURI = `/ipfs/${ipfsHashMetaEvidenceObj[1].hash}${ipfsHashMetaEvidenceObj[0].path}`;

    const arbitrationCost = await this.getArbitrationCost(arbitrator, arbitratorExtraData);
    return EthereumInterface.send(
      "ArbitrableProxy",
      networkMap[this.state.network].ARBITRABLE_PROXY,
      this.state.activeAddress,
      arbitrationCost,
      "createDispute",
      arbitratorExtraData,
      metaevidenceURI,
      options.numberOfRulingOptions
    );
  };

  getDisputeEvent = async (arbitrableAddress, disputeID) =>
    await this.state.archon.arbitrable.getDispute(
      arbitrableAddress, // arbitrable contract address
      networkMap[this.state.network].KLEROS_LIQUID, // arbitrator contract address
      disputeID // dispute unique identifier
    );

  getMetaEvidence = (arbitrableAddress, arbitratorDisputeID) =>
    this.state.archon.arbitrable.getDispute(arbitrableAddress, networkMap[this.state.network].KLEROS_LIQUID, arbitratorDisputeID).then((response) =>
      this.state.archon.arbitrable.getMetaEvidence(arbitrableAddress, response.metaEvidenceID, {
        strict: true,
        getJsonRpcUrl: (chainId) => getReadOnlyRpcUrl({ chainId }),
        scriptParameters: {
          disputeID: arbitratorDisputeID,
          arbitrableContractAddress: arbitrableAddress,
          arbitratorContractAddress: networkMap[this.state.network].KLEROS_LIQUID,
          arbitratorChainID: this.state.network,
          chainID: this.state.network,
          arbitratorJsonRpcUrl: networkMap[this.state.network].WEB3_PROVIDER,
        },
      })
    );

  //Using Archon, parallel calls occasionally fail.
  getMetaEvidenceParallelizeable = (arbitrableAddress, arbitratorDisputeID) =>
    this.state.archon.arbitrable
      .getDispute(arbitrableAddress, networkMap[this.state.network].KLEROS_LIQUID, arbitratorDisputeID)
      .then((response) =>
        EthereumInterface.contractInstance("IEvidence", arbitrableAddress).getPastEvents("MetaEvidence", {
          fromBlock: QUERY_FROM_BLOCK,
          toBlock: "latest",
          filter: { _metaEvidenceID: response.metaEvidenceID },
        })
      )
      .then((metaevidence) => {
        if (metaevidence.length > 0) {
          return fetch(IPFS_GATEWAY + metaevidence[0].returnValues._evidence).then((response) => response.json());
        }
      });

  getEvidences = (arbitrableAddress, arbitratorDisputeID) => {
    return this.state.archon.arbitrable
      .getDispute(arbitrableAddress, networkMap[this.state.network].KLEROS_LIQUID, arbitratorDisputeID)
      .then((response) => {
        return this.state.archon.arbitrable.getEvidence(arbitrableAddress, networkMap[this.state.network].KLEROS_LIQUID, response.evidenceGroupID).catch(console.error);
      })
      .catch(console.error);
  };

  getAppealDecision = async (arbitratorDisputeID) => {
    const contractInstance = EthereumInterface.contractInstance("KlerosLiquid", networkMap[this.state.network].KLEROS_LIQUID);
    const appealDecisionLog = await contractInstance.getPastEvents("AppealDecision", {
      fromBlock: QUERY_FROM_BLOCK,
      toBlock: "latest",
      filter: { _disputeID: arbitratorDisputeID },
    });
    const blockNumbers = await Promise.all(appealDecisionLog.map((appealDecision) => Web3.eth.getBlock(appealDecision.blockNumber)));
    return blockNumbers.map((blockNumber) => {
      return { appealedAt: blockNumber.timestamp };
    });
  };

  getContributions = async (arbitrableDisputeID, round, arbitrableContractAddress, period) => {
    const contractInstance = EthereumInterface.contractInstance("IDisputeResolver", arbitrableContractAddress);
    const contributionLogs = await contractInstance.getPastEvents("Contribution", {
      fromBlock: QUERY_FROM_BLOCK,
      toBlock: "latest",
      filter: { arbitrator: networkMap[this.state.network].KLEROS_LIQUID, _localDisputeID: arbitrableDisputeID, _round: period == 4 ? round : round + 1 },
    });

    let contributionsForEachRuling = {};
    contributionLogs.map((log) => {
      contributionsForEachRuling[log.returnValues.ruling] = contributionsForEachRuling[log.returnValues.ruling] || 0;
      contributionsForEachRuling[log.returnValues.ruling] = parseInt(contributionsForEachRuling[log.returnValues.ruling]) + parseInt(log.returnValues._amount);
    });
    console.log(contributionsForEachRuling);
    return contributionsForEachRuling;
  };

  getRulingFunded = async (arbitrableDisputeID, round, arbitrableContractAddress) => {
    const contractInstance = EthereumInterface.contractInstance("IDisputeResolver", arbitrableContractAddress);
    const rulingFundedLogs = await contractInstance.getPastEvents("RulingFunded", {
      fromBlock: QUERY_FROM_BLOCK,
      toBlock: "latest",
      filter: { arbitrator: networkMap[this.state.network].KLEROS_LIQUID, _localDisputeID: arbitrableDisputeID, _round: round },
    });
    let ruling = rulingFundedLogs.map((log) => log.returnValues._ruling);

    return ruling;
  };

  getTotalWithdrawableAmount = async (arbitrableDisputeID, contributedTo, arbitrated) => {
    let amount = 0;

    try {
      // function signature withdrawFeesAndRewardsForAllRounds(uint256 _localDisputeID, address payable _contributor, uint256 _ruling);
      let counter = 0;
      while (counter < contributedTo.length) {
        amount = await EthereumInterface.call(
          "IDisputeResolver",
          arbitrated,
          "getTotalWithdrawableAmount",
          arbitrableDisputeID,
          this.state.activeAddress ? this.state.activeAddress : ADDRESS_ZERO,
          contributedTo[counter]
        );
        if (amount != 0) break;
        counter++;
      }
      return { amount: amount, ruling: contributedTo[counter] };
    } catch {
      // function signature withdrawFeesAndRewardsForAllRounds(uint256 _localDisputeID, address payable _contributor, uint256[] memory _contributedTo);
      amount = amount = await EthereumInterface.call(
        "IDisputeResolver",
        arbitrated,
        "getTotalWithdrawableAmount",
        arbitrableDisputeID,
        this.state.activeAddress ? this.state.activeAddress : ADDRESS_ZERO,
        contributedTo
      );

      return { amount: amount, ruling: 0 };
    }
  };

  getDispute = async (arbitratorDisputeID) => EthereumInterface.call("KlerosLiquid", networkMap[this.state.network].KLEROS_LIQUID, "getDispute", arbitratorDisputeID);

  getRuling = async (arbitrableAddress, arbitratorDisputeID) =>
    await this.state.archon.arbitrable.getRuling(arbitrableAddress, networkMap[this.state.network].KLEROS_LIQUID, arbitratorDisputeID);

  getContractInstance = (interfaceName, address) => EthereumInterface.contractInstance(interfaceName, address);

  submitEvidence = async (arbitrableAddress, { disputeID, evidenceTitle, evidenceDescription, evidenceDocument, supportingSide }) => {
    const evidence = {
      name: evidenceTitle,
      description: evidenceDescription,
      fileURI: evidenceDocument,
      evidenceSide: supportingSide,
    };

    const ipfsHashEvidenceObj = await ipfsPublish("evidence.json", this.encoder.encode(JSON.stringify(evidence)));

    const evidenceURI = `/ipfs/${ipfsHashEvidenceObj[1].hash}${ipfsHashEvidenceObj[0].path}`;

    await EthereumInterface.send("ArbitrableProxy", arbitrableAddress, this.state.activeAddress, 0, "submitEvidence", disputeID, evidenceURI);
  };

  render() {
    const { activeAddress, network, lastDisputeID, subcourts, subcourtDetails, subcourtsLoading } = this.state;

    if (this.state.network)
      return (
        <BrowserRouter>
          <Switch>
            <Route exact path="(/disputes/)" render={() => <Redirect to={`/ongoing/`} />} />
            <Route
              exact
              path="(/|/ongoing/|)"
              render={(route) => (
                <>
                  <Header viewOnly={!activeAddress} route={route} />
                  <OpenDisputes
                    activeAddress={activeAddress}
                    route={route}
                    getMetaEvidenceCallback={this.getMetaEvidenceParallelizeable}
                    getArbitratorDisputeCallback={this.getArbitratorDispute}
                    subcourtDetails={subcourtDetails}
                    subcourts={subcourts}
                    getCurrentRulingCallback={this.getCurrentRuling}
                    getOpenDisputesOnCourtCallback={this.getOpenDisputesOnCourt}
                    network={this.state.network}
                  />
                  <Footer networkMap={networkMap} network={this.state.network} />
                </>
              )}
            />

            <Route
              exact
              path="(/create/)"
              render={(route) => (
                <>
                  <Header viewOnly={!activeAddress} route={route} />
                  <Create
                    activeAddress={activeAddress}
                    route={route}
                    createDisputeCallback={this.createDispute}
                    getArbitrationCostCallback={this.getArbitrationCostWithCourtAndNoOfJurors}
                    publishCallback={this.onPublish}
                    web3={Web3}
                    subcourtDetails={subcourtDetails}
                    subcourtsLoading={subcourtsLoading}
                    network={this.state.network}
                  />
                  <Footer networkMap={networkMap} network={this.state.network} />
                </>
              )}
            />

            <Redirect from="/interact/:id" to="/cases/:id" />
            <Route
              exact
              path="/cases/:id?"
              render={(route) => (
                <>
                  <Header viewOnly={!activeAddress} route={route} />

                  <Interact
                    arbitratorAddress={networkMap[network].KLEROS_LIQUID}
                    network={network}
                    route={route}
                    getArbitrableDisputeIDCallback={this.getArbitrableDisputeID}
                    getAppealCostCallback={this.getAppealCost}
                    getAppealCostOnArbitrableCallback={this.getAppealCostOnArbitrable}
                    appealCallback={this.appeal}
                    getAppealPeriodCallback={this.getAppealPeriod}
                    getCurrentRulingCallback={this.getCurrentRuling}
                    disputeID={lastDisputeID}
                    getContractInstanceCallback={this.getContractInstance}
                    getArbitratorDisputeCallback={this.getArbitratorDispute}
                    getArbitratorDisputeDetailsCallback={this.getArbitratorDisputeDetails}
                    getArbitratorDisputeStructCallback={this.getArbitratorDispute}
                    getArbitrableDisputeStructCallback={this.getArbitrableDispute}
                    getCrowdfundingStatusCallback={this.getCrowdfundingStatus}
                    getRulingCallback={this.getRuling}
                    getEvidencesCallback={this.getEvidences}
                    getMetaEvidenceCallback={this.getMetaEvidence}
                    publishCallback={this.onPublish}
                    submitEvidenceCallback={this.submitEvidence}
                    getDisputeCallback={this.getDispute}
                    getDisputeEventCallback={this.getDisputeEvent}
                    getMultipliersCallback={this.getMultipliers}
                    withdrawCallback={this.withdrawFeesAndRewardsForAllRounds}
                    getTotalWithdrawableAmountCallback={this.getTotalWithdrawableAmount}
                    activeAddress={activeAddress}
                    passPeriodCallback={this.passPeriod}
                    drawJurorsCallback={this.drawJurors}
                    passPhaseCallback={this.passPhase}
                    getRoundInfoCallback={this.getRoundInfo}
                    getAppealDecisionCallback={this.getAppealDecision}
                    getContributionsCallback={this.getContributions}
                    getRulingFundedCallback={this.getRulingFunded}
                    subcourts={subcourts}
                    subcourtDetails={subcourtDetails}
                    web3Provider={networkMap[network].WEB3_PROVIDER}
                  />
                  <Footer networkMap={networkMap} network={this.state.network} />
                </>
              )}
            />
            <Route
              render={(route) => (
                <>
                  <Header viewOnly={!activeAddress} route={route} />

                  <_404 />
                  <Footer networkMap={networkMap} network={this.state.network} />
                </>
              )}
            />
          </Switch>
        </BrowserRouter>
      );
    else return <>Please enable a web3 provider.</>;
  }
}
export default App;
