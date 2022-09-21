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
      this.setState({
        disputeKitClassic: (await EthereumInterface.call("KlerosCore", networkMap[this.state.network].KLEROS_CORE, "disputeKitNodes", 1)).disputeKit,
      });
      console.log("disputeKitClassic: %O", this.state.disputeKitClassic);
    }

    if (typeof window.ethereum !== "undefined") {
      await this.setState({ activeAddress: window.ethereum.selectedAddress });
      window.ethereum.on("accountsChanged", (accounts) => {
        this.setState({ activeAddress: accounts[0] });
      });

      window.ethereum.on("chainChanged", async (network) => {
        await this.setState({ network });
        if (networkMap[network].KLEROS_CORE) {
          this.loadSubcourtData();
        }
      });
    } else {
      console.error("MetaMask not detected :(");
    }
    if (networkMap[this.state.network].KLEROS_CORE) {
      this.loadSubcourtData();
    }
  }

  loadSubcourtData = async () => {
    // let counter = 1;
    // while (true) {
    //   try {
    //     await this.estimateGasOfGetSubcourt(counter++);
    //   } catch (err) {
    //     break;
    //   }
    // }

    let subcourts = [];
    let subcourtURIs = [];
    for (var i = 1; i < 6; i++) {
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

    console.log("subcourts: %O", this.state.subcourts);
  };

  getDisputeKitClassic = async () => {
    const disputeKitNode = await EthereumInterface.call("KlerosCore", networkMap[this.state.network].KLEROS_CORE, "disputeKitNodes", 1);
    return disputeKitNode.disputeKit;
  };

  getOpenDisputesOnCourt = async () => {
    const contractInstance = EthereumInterface.contractInstance("KlerosCore", networkMap[this.state.network].KLEROS_CORE);

    console.log("SubcourtCreated=%O", await contractInstance.getPastEvents("SubcourtCreated", { fromBlock: 15295899, toBlock: "latest" }));
    console.log("PolicyRegistry=%O", await EthereumInterface.call("PolicyRegistry", networkMap[this.state.network].POLICY_REGISTRY, "policies", 1));

    const newPeriodEvents = await contractInstance.getPastEvents("NewPeriod", { fromBlock: QUERY_FROM_BLOCK, toBlock: "latest" });
    const disputeCreationEvents = await contractInstance.getPastEvents("DisputeCreation", { fromBlock: QUERY_FROM_BLOCK, toBlock: "latest" });
    const disputes = [...new Set(disputeCreationEvents.map((result) => result.returnValues._disputeID))];
    const resolvedDisputes = newPeriodEvents.filter((result) => result.returnValues._period == 4).map((result) => result.returnValues._disputeID);

    const openDisputes = disputes.filter((dispute) => !resolvedDisputes.includes(dispute));

    return openDisputes;
  };

  getArbitrableDisputeID = async (arbitrableAddress, arbitratorDisputeID) =>
    EthereumInterface.call("DisputeResolver", arbitrableAddress, "externalIDtoLocalID", arbitratorDisputeID);

  getArbitrationCost = (arbitratorAddress, extraData) => EthereumInterface.call("IArbitrator", arbitratorAddress, "arbitrationCost", extraData);

  getArbitrationCostWithCourtAndNoOfJurors = async (subcourtID, noOfJurors) =>
    Web3.utils.fromWei(
      await EthereumInterface.call("IArbitrator", networkMap[this.state.network].KLEROS_CORE, "arbitrationCost", this.generateArbitratorExtraData(subcourtID, noOfJurors)),
      "ether"
    );

  estimateGasOfGetSubcourt = (subcourtID) => EthereumInterface.estimateGas("KlerosCore", networkMap[this.state.network].KLEROS_CORE, this.activeAddress, 0, "courts", subcourtID);

  getTimesPerPeriod = async (subcourtID) => EthereumInterface.call("KlerosCore", networkMap[this.state.network].KLEROS_CORE, "getTimesPerPeriod", subcourtID);

  getSubcourt = async (subcourtID) => {
    const subcourt = await EthereumInterface.call("KlerosCore", networkMap[this.state.network].KLEROS_CORE, "courts", subcourtID);
    const timesPerPeriod = await this.getTimesPerPeriod(subcourtID);
    return { ...subcourt, timesPerPeriod: timesPerPeriod };
  };

  getSubCourtDetails = async (subcourtID) => EthereumInterface.call("PolicyRegistry", networkMap[this.state.network].POLICY_REGISTRY, "policies", subcourtID);

  getArbitratorDispute = async (arbitratorDisputeID) => EthereumInterface.call("KlerosCore", networkMap[this.state.network].KLEROS_CORE, "disputes", arbitratorDisputeID);

  getArbitratorDisputeDetails = async (arbitratorDisputeID) => {
    const roundInfo = await EthereumInterface.call("KlerosCore", networkMap[this.state.network].KLEROS_CORE, "getRoundInfo", arbitratorDisputeID, 0);
    const nbVotes = await EthereumInterface.call("KlerosCore", networkMap[this.state.network].KLEROS_CORE, "getNumberOfVotes", arbitratorDisputeID);
    return {
      votesLengths: [nbVotes],
      tokensAtStakePerJuror: [roundInfo.tokensAtStakePerJuror],
      totalFeesForJurors: [roundInfo.totalFeesForJurors],
      votesInEachRound: [0], // TODO: fix me
      repartitionsInEachRound: [roundInfo.repartitions],
      penaltiesInEachRound: [roundInfo.penalties],
    };
  };

  getMultipliers = (arbitrableAddress) => {
    return [
      EthereumInterface.call("DisputeKit", this.state.disputeKitClassic, "WINNER_STAKE_MULTIPLIER"),
      EthereumInterface.call("DisputeKit", this.state.disputeKitClassic, "LOSER_STAKE_MULTIPLIER"),
      EthereumInterface.call("DisputeKit", this.state.disputeKitClassic, "LOSER_APPEAL_PERIOD_MULTIPLIER"),
      EthereumInterface.call("DisputeKit", this.state.disputeKitClassic, "ONE_BASIS_POINT"),
    ];
  };
  // TODO: call KC.disputes(x).rounds(lastOne).disputeKitID -> KC.disputeKitNodes(y).disputeKit -> DK.*_MULTIPLIER()

  updateLastDisputeID = async (newDisputeID) => this.setState({ lastDisputeID: newDisputeID });

  onPublish = async (filename, fileBuffer) => await ipfsPublish(filename, fileBuffer);

  generateArbitratorExtraData = (subcourtID, noOfVotes) => `0x${parseInt(subcourtID, 10).toString(16).padStart(64, "0") + parseInt(noOfVotes, 10).toString(16).padStart(64, "0")}`;

  withdrawFeesAndRewardsForAllRounds = (arbitrableAddress, arbitrableDisputeID, rulingOptionsContributedTo) => 0;
  // EthereumInterface.send(
  //   "DisputeResolver",
  //   arbitrableAddress,
  //   this.state.activeAddress,
  //   "0",
  //   "withdrawFeesAndRewardsForAllRounds",
  //   arbitrableDisputeID,
  //   this.state.activeAddress,
  //   rulingOptionsContributedTo
  // );
  // TODO: call DK.withdrawFeesAndRewards()

  getAppealCost = async (arbitratorDisputeID) => EthereumInterface.call("IArbitrator", networkMap[this.state.network].KLEROS_CORE, "appealCost", arbitratorDisputeID, "0x0");

  appeal = (arbitrableAddress, arbitrableDisputeID, party, contribution) => {
    false;
  };
  // EthereumInterface.send("DisputeResolver", arbitrableAddress, this.state.activeAddress, contribution, "fundAppeal", arbitrableDisputeID, party);
  // TODO: call DK.fundAppeal()

  getAppealPeriod = async (arbitratorDisputeID) => EthereumInterface.call("KlerosCore", networkMap[this.state.network].KLEROS_CORE, "appealPeriod", arbitratorDisputeID);

  getCurrentRuling = async (arbitratorDisputeID) => EthereumInterface.call("KlerosCore", networkMap[this.state.network].KLEROS_CORE, "currentRuling", arbitratorDisputeID);

  createDispute = async (options) => {
    const { network } = this.state;
    const arbitrator = networkMap[network].KLEROS_CORE;
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
      "DisputeResolver",
      networkMap[this.state.network].DISPUTE_RESOLVER,
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
      networkMap[this.state.network].KLEROS_CORE, // arbitrator contract address
      disputeID // dispute unique identifier
    );

  getMetaEvidence = (arbitrableAddress, arbitratorDisputeID) =>
    this.state.archon.arbitrable.getDispute(arbitrableAddress, networkMap[this.state.network].KLEROS_CORE, arbitratorDisputeID).then((response) =>
      this.state.archon.arbitrable.getMetaEvidence(arbitrableAddress, response.metaEvidenceID, {
        strict: true,
        getJsonRpcUrl: (chainId) => getReadOnlyRpcUrl({ chainId }),
        scriptParameters: {
          disputeID: arbitratorDisputeID,
          arbitrableContractAddress: arbitrableAddress,
          arbitratorContractAddress: networkMap[this.state.network].KLEROS_CORE,
          arbitratorChainID: this.state.network,
          chainID: this.state.network,
          arbitratorJsonRpcUrl: networkMap[this.state.network].WEB3_PROVIDER,
        },
      })
    );

  //Using Archon, parallel calls occasionally fail.
  getMetaEvidenceParallelizeable = (arbitrableAddress, arbitratorDisputeID) =>
    this.state.archon.arbitrable
      .getDispute(arbitrableAddress, networkMap[this.state.network].KLEROS_CORE, arbitratorDisputeID)
      .then((response) =>
        EthereumInterface.contractInstance("IMetaEvidence", arbitrableAddress).getPastEvents("MetaEvidence", {
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

  // TODO: fix me, call DK instead of Arbitrable
  getEvidences = (arbitrableAddress, arbitratorDisputeID) => {
    return this.state.archon.arbitrable
      .getDispute(arbitrableAddress, networkMap[this.state.network].KLEROS_CORE, arbitratorDisputeID)
      .then((response) => {
        return this.state.archon.arbitrable.getEvidence(this.state.disputeKitClassic, networkMap[this.state.network].KLEROS_CORE, response.evidenceGroupID).catch(console.error);
      })
      .catch(console.error);
  };

  getAppealDecision = async (arbitratorDisputeID) => {
    const contractInstance = EthereumInterface.contractInstance("KlerosCore", networkMap[this.state.network].KLEROS_CORE);
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

  // TODO: fix me, use the DK instead of the DisputeResolver
  getContributions = async (arbitrableDisputeID, round, arbitrableContractAddress, period) => {
    const contractInstance = EthereumInterface.contractInstance("DisputeKit", this.state.disputeKitClassic);
    const contributionLogs = await contractInstance.getPastEvents("Contribution", {
      fromBlock: QUERY_FROM_BLOCK,
      toBlock: "latest",
      filter: { arbitrator: networkMap[this.state.network].KLEROS_CORE, _coreDisputeID: arbitrableDisputeID, _coreRoundID: period == 4 ? round : round + 1 },
    });

    let contributionsForEachRuling = {};
    contributionLogs.map((log) => {
      contributionsForEachRuling[log.returnValues._choice] = contributionsForEachRuling[log.returnValues._choice] || 0;
      contributionsForEachRuling[log.returnValues._choice] = parseInt(contributionsForEachRuling[log.returnValues._choice]) + parseInt(log.returnValues._amount);
    });
    console.log("contributionsForEachRuling: %O", contributionsForEachRuling);
    return contributionsForEachRuling;
  };

  // TODO: fix me, use the DK instead of the DisputeResolver
  getRulingFunded = async (arbitrableDisputeID, round, arbitrableContractAddress) => {
    const contractInstance = EthereumInterface.contractInstance("DisputeKit", this.state.disputeKitClassic);
    const rulingFundedLogs = await contractInstance.getPastEvents("ChoiceFunded", {
      fromBlock: QUERY_FROM_BLOCK,
      toBlock: "latest",
      filter: { arbitrator: networkMap[this.state.network].KLEROS_CORE, _coreDisputeID: arbitrableDisputeID, _coreRoundID: round },
    });
    let ruling = rulingFundedLogs.map((log) => log.returnValues._choice);
    console.log("rulingFunded: %O", ruling);
    return ruling;
  };

  // TODO: fix me
  getTotalWithdrawableAmount = async (arbitrableDisputeID, contributedTo, arbitrated) => {
    let amount = 0;
    try {
      // function signature withdrawFeesAndRewardsForAllRounds(uint256 _localDisputeID, address payable _contributor, uint256 _ruling);
      let counter = 0;
      while (counter < contributedTo.length) {
        amount = await EthereumInterface.call(
          "DisputeResolver",
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
        "DisputeResolver",
        arbitrated,
        "getTotalWithdrawableAmount",
        arbitrableDisputeID,
        this.state.activeAddress ? this.state.activeAddress : ADDRESS_ZERO,
        contributedTo
      );

      return { amount: amount, ruling: 0 };
    }
  };

  // TODO: missing view
  getDispute = async (arbitratorDisputeID) => ({
    0: [],
    1: [],
    2: [],
    3: [],
    4: [],
    5: [],
    votesLengths: [],
    tokensAtStakePerJuror: [],
    totalFeesForJurors: [],
    votesInEachRound: [],
    repartitionsInEachRound: [],
    penaltiesInEachRound: [],
  }); // TODO: fix me, missing view
  // EthereumInterface.call("KlerosCore", networkMap[this.state.network].KLEROS_CORE, "getDispute", arbitratorDisputeID);

  getRuling = async (arbitrableAddress, arbitratorDisputeID) =>
    await this.state.archon.arbitrable.getRuling(arbitrableAddress, networkMap[this.state.network].KLEROS_CORE, arbitratorDisputeID);

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

    await EthereumInterface.send("DisputeKit", this.state.disputeKitClassic, this.state.activeAddress, 0, "submitEvidence", disputeID, evidenceURI);
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
                    getTimesPerPeriodCallback={this.getTimesPerPeriod}
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
                    arbitratorAddress={networkMap[network].KLEROS_CORE}
                    network={network}
                    route={route}
                    getArbitrableDisputeIDCallback={this.getArbitrableDisputeID}
                    getAppealCostCallback={this.getAppealCost}
                    appealCallback={this.appeal}
                    getAppealPeriodCallback={this.getAppealPeriod}
                    getCurrentRulingCallback={this.getCurrentRuling}
                    disputeID={lastDisputeID}
                    getContractInstanceCallback={this.getContractInstance}
                    getArbitratorDisputeCallback={this.getArbitratorDispute}
                    getArbitratorDisputeDetailsCallback={this.getArbitratorDisputeDetails}
                    getArbitratorDisputeStructCallback={this.getArbitratorDispute}
                    getArbitrableDisputeStructCallback={this.getArbitrableDispute}
                    getTimesPerPeriodCallback={this.getTimesPerPeriod}
                    getCrowdfundingStatusCallback={this.getCrowdfundingStatus}
                    getRulingCallback={this.getRuling}
                    getEvidencesCallback={this.getEvidences}
                    getMetaEvidenceCallback={this.getMetaEvidenceParallelizeable}
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
