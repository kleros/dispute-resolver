import React from "react";
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
import networkMap, { getReadOnlyRpcUrl } from "./ethereum/network-contract-mapping";
import ipfsPublish from "./ipfs-publish";
import Archon from "@shotaronowhere/archon";
import UnsupportedNetwork from "./components/unsupportedNetwork";

const ADDRESS_ZERO = "0x0000000000000000000000000000000000000000";
const IPFS_GATEWAY = "https://ipfs.kleros.io";
const EXCEPTIONAL_CONTRACT_ADDRESSES = ["0xe0e1bc8C6cd1B81993e2Fcfb80832d814886eA38", "0xb9f9B5eee2ad29098b9b3Ea0B401571F5dA4AD81"];
const CACHE_INVALIDATION_PERIOD_FOR_SUBCOURTS_MS = 3 * 60 * 60 * 1000;
const CACHE_INVALIDATION_PERIOD_FOR_DISPUTES_MS = 1 * 60 * 1000;

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
        archon: new Archon(Web3.currentProvider ? Web3.currentProvider : window.ethereum, IPFS_GATEWAY),
      });
    }

    if (typeof window.ethereum !== "undefined") {
      await this.setState({ activeAddress: window.ethereum.selectedAddress });
      window.ethereum.on("accountsChanged", (accounts) => {
        this.setState({ activeAddress: accounts[0] });
      });

      window.ethereum.on("chainChanged", async (network) => {
        await this.setState({ network: parseInt(network).toString(10) });
        if (networkMap[network]?.KLEROS_LIQUID) this.loadSubcourtData();
      });
    } else console.error("MetaMask not detected :(");
    if (networkMap[this.state.network]?.KLEROS_LIQUID) this.loadSubcourtData();
  }

  loadSubcourtData = async () => {
    const { network } = this.state;

    if (
      new Date().getTime() < CACHE_INVALIDATION_PERIOD_FOR_SUBCOURTS_MS + parseInt(localStorage.getItem(`${network}LastModified`)) &&
      localStorage.getItem(`${network}Subcourts`) &&
      localStorage.getItem(`${network}SubcourtDetails`)
    ) {
      await this.setState({
        subcourts: JSON.parse(localStorage.getItem(`${network}Subcourts`)),
        subcourtDetails: JSON.parse(localStorage.getItem(`${network}SubcourtDetails`)),
        subcourtsLoading: false,
      });

      return;
    }

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

    for (let i = 0; i < counter - 1; i++) {
      subcourtURIs[i] = this.getSubCourtDetails(i);
      subcourts[i] = this.getSubcourt(i);
    }

    await this.setState({
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

    localStorage.setItem(`${network}Subcourts`, JSON.stringify(this.state.subcourts));
    localStorage.setItem(`${network}SubcourtDetails`, JSON.stringify(this.state.subcourtDetails));
    localStorage.setItem(`${network}LastModified`, new Date().getTime());
  };

  getOpenDisputesOnCourt = async () => {
    const subgraph = networkMap[this.state.network].SUBGRAPH;

    if (subgraph) {
      const query = {
        query: `
          {
            disputes(last: 500, where: { period_not: "EXECUTED" }, orderBy: id, orderDirection: desc) {
              id
            }
          }
        `,
      };
      const openDisputes = (await (await fetch(subgraph, { method: "POST", body: JSON.stringify(query) })).json())?.data?.disputes;
      if (!openDisputes) return await getOpenDisputesOnCourtFallback();
      const openDisputeIDs = openDisputes.map((obj) => obj.id);
      return openDisputeIDs;
    } else {
      return await getOpenDisputesOnCourtFallback();
    }
  };

  getOpenDisputesOnCourtFallback = async () => {
    const newPeriodEvents = await contractInstance.getPastEvents("NewPeriod", { fromBlock: startingBlock, toBlock: "latest" });
    const disputeCreationEvents = await contractInstance.getPastEvents("DisputeCreation", { fromBlock: startingBlock, toBlock: "latest" });
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

  getArbitratorDispute = async (arbitratorDisputeID) => {
    const arbitratorDispute = await EthereumInterface.call("KlerosLiquid", networkMap[this.state.network].KLEROS_LIQUID, "disputes", arbitratorDisputeID);
    return arbitratorDispute;
  };

  getArbitratorDisputeDetails = async (arbitratorDisputeID) =>
    EthereumInterface.call("KlerosLiquid", networkMap[this.state.network].KLEROS_LIQUID, "getDispute", arbitratorDisputeID);

  getMultipliers = (arbitrableAddress) => EthereumInterface.call("IDisputeResolver", arbitrableAddress, "getMultipliers");

  onPublish = async (filename, fileBuffer) => await ipfsPublish(filename, fileBuffer);

  generateArbitratorExtraData = (subcourtID, noOfVotes) => `0x${parseInt(subcourtID, 10).toString(16).padStart(64, "0") + parseInt(noOfVotes, 10).toString(16).padStart(64, "0")}`;

  withdrawFeesAndRewardsForAllRounds = (arbitrableAddress, arbitrableDisputeID, rulingOptionsContributedTo, arbitrableContractAddress) => {
    if (EXCEPTIONAL_CONTRACT_ADDRESSES.includes(arbitrableContractAddress))
      return EthereumInterface.send(
        "IDisputeResolver_v1",
        arbitrableAddress,
        this.state.activeAddress,
        "0",
        "withdrawFeesAndRewardsForAllRounds",
        arbitrableDisputeID,
        this.state.activeAddress,
        rulingOptionsContributedTo
      );
    else
      return EthereumInterface.send(
        "IDisputeResolver",
        arbitrableAddress,
        this.state.activeAddress,
        "0",
        "withdrawFeesAndRewardsForAllRounds",
        arbitrableDisputeID,
        this.state.activeAddress,
        rulingOptionsContributedTo
      );
  };

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
    this.state.archon.arbitrable.getMetaEvidenceFromDisputeID(arbitrableAddress, arbitratorDisputeID, this.state.network, {
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
    });

  //Using Archon, parallel calls occasionally fail.
  getMetaEvidenceParallelizeable = (arbitrableAddress, arbitratorDisputeID) => {
    const { network } = this.state;

    if (localStorage.getItem(`${network}${arbitratorDisputeID.toString()}`)) {
      console.log(`Found metaevidence of ${arbitratorDisputeID} skipping fetch.`);
      return JSON.parse(localStorage.getItem(`${network}${arbitratorDisputeID.toString()}`));
    }

    console.log(`Fetching ${arbitratorDisputeID}...`);

    return fetch(`${process.env.REACT_APP_METAEVIDENCE_URL}?chainId=${this.state.network}&disputeId=${arbitratorDisputeID}`)
      .then((response) => response.json())
      .catch((error) => {
        console.error(
          `Failed to fetch metaevidence of ${arbitratorDisputeID} at ${process.env.REACT_APP_METAEVIDENCE_URL}?chainId=${this.state.network}&disputeId=${arbitratorDisputeID}`
        );
        return this.getMetaEvidenceFallback(arbitrableAddress, arbitratorDisputeID);
      })
      .then((payload) => {
        const uri = payload.metaEvidenceUri;
        return fetch(IPFS_GATEWAY + uri)
          .then((response) => response.json())
          .catch((error) => {
            console.error(`Failed to fetch metaevidence of ${arbitratorDisputeID} at ${IPFS_GATEWAY + metaevidence[0].returnValues._evidence}`);
          })
          .then((payload) => {
            console.log(`caching ${arbitratorDisputeID}`);
            console.log(JSON.stringify(payload));
            localStorage.setItem(`${this.state.network}${arbitratorDisputeID.toString()}`, JSON.stringify(payload));
            return payload;
          });
      })
      .catch((error) => {
        console.error(
          `Failed to fetch metaevidence of ${arbitratorDisputeID} at ${process.env.REACT_APP_METAEVIDENCE_URL}?chainId=${this.state.network}&disputeId=${arbitratorDisputeID}`
        );
        return this.getMetaEvidenceFallback(arbitrableAddress, arbitratorDisputeID);
      });
  };

  getMetaEvidenceFallback = (arbitrableAddress, arbitratorDisputeID) => {
    return this.state.archon.arbitrable
      .getDispute(arbitrableAddress, networkMap[this.state.network].KLEROS_LIQUID, arbitratorDisputeID)
      .then((response) =>
        EthereumInterface.contractInstance("IEvidence", arbitrableAddress).getPastEvents("MetaEvidence", {
          fromBlock: networkMap[this.state.network].QUERY_FROM_BLOCK,

          toBlock: response.blockNumber,

          filter: { _metaEvidenceID: response.metaEvidenceID },
        })
      )
      .then((metaevidence) => {
        if (metaevidence.length > 0) {
          fetch(IPFS_GATEWAY + metaevidence[0].returnValues._evidence)
            .then((response) => response.json())
            .catch((error) => {
              console.error(`Failed to fetch metaevidence of ${arbitratorDisputeID} at ${IPFS_GATEWAY + metaevidence[0].returnValues._evidence}`);
            })
            .then((payload) => {
              console.log(`caching ${arbitratorDisputeID}`);
              localStorage.setItem(`${this.state.network}${arbitratorDisputeID.toString()}`, JSON.stringify(payload));
              return payload;
            });
        }
      });
  };

  getEvidences = async (arbitrableAddress, arbitratorDisputeID) => {
    const subgraph = networkMap[this.state.network].SUBGRAPH;
    if (subgraph) {
      return this.state.archon.arbitrable.getEvidenceFromDisputeID(arbitratorDisputeID, this.state.network).catch(console.error);
    } else {
      this.state.archon.arbitrable
        .getDispute(arbitrableAddress, networkMap[this.state.network].KLEROS_LIQUID, arbitratorDisputeID)
        .then((response) => {
          return this.state.archon.arbitrable.getEvidence(arbitrableAddress, networkMap[this.state.network].KLEROS_LIQUID, response.evidenceGroupID).catch(console.error);
        })
        .catch(console.error);
    }
  };

  getAppealDecision = async (arbitratorDisputeID, disputedAtBlockNumber) => {
    const contractInstance = EthereumInterface.contractInstance("KlerosLiquid", networkMap[this.state.network].KLEROS_LIQUID);


    const appealDecisionLog = await contractInstance.getPastEvents("AppealDecision", {
      fromBlock: disputedAtBlockNumber,
      toBlock: "latest",
      filter: { _disputeID: arbitratorDisputeID },
    });
    const blockNumbers = await Promise.all(appealDecisionLog.map((appealDecision) => Web3.eth.getBlock(appealDecision.blockNumber)));
    return blockNumbers.map((blockNumber) => {
      return { appealedAt: blockNumber.timestamp, appealedAtBlockNumber: blockNumber.number };
    });
  };

  getContributions = async (arbitrableDisputeID, round, arbitrableContractAddress, period, searchFrom) => {
    // Unslashed contract violates IDisputeResolver interface by incrementing rounds without triggering an appeal event.
    // Because of this, here we make an exception for Unslashed and shift rounds by plus one, except when in execution period.

    let _round = round;
    if (EXCEPTIONAL_CONTRACT_ADDRESSES.includes(arbitrableContractAddress)) {
      if (period < 4) _round++;
    }

    const contractInstance = EthereumInterface.contractInstance("IDisputeResolver", arbitrableContractAddress);
    const contributionLogs = await contractInstance.getPastEvents("Contribution", {
      fromBlock: searchFrom ?? networkMap[this.state.network].QUERY_FROM_BLOCK,
      toBlock: searchFrom ? searchFrom + 100_000 : "latest",
      filter: { arbitrator: networkMap[this.state.network].KLEROS_LIQUID, _localDisputeID: arbitrableDisputeID, _round },
    });

    let contributionsForEachRuling = {};
    contributionLogs.map((log) => {
      contributionsForEachRuling[log.returnValues.ruling] = contributionsForEachRuling[log.returnValues.ruling] || 0;
      contributionsForEachRuling[log.returnValues.ruling] = parseInt(contributionsForEachRuling[log.returnValues.ruling]) + parseInt(log.returnValues._amount);
    });
    return contributionsForEachRuling;
  };

  getRulingFunded = async (arbitrableDisputeID, round, arbitrableContractAddress, searchFrom) => {
    let _round = round;
    if (EXCEPTIONAL_CONTRACT_ADDRESSES.includes(arbitrableContractAddress)) {
      _round++;
    }

    const contractInstance = EthereumInterface.contractInstance("IDisputeResolver", arbitrableContractAddress);
    const rulingFundedLogs = await contractInstance.getPastEvents("RulingFunded", {
      fromBlock: searchFrom ?? networkMap[this.state.network].QUERY_FROM_BLOCK,
      toBlock: searchFrom ? searchFrom + 100_000 : "latest",
      filter: { arbitrator: networkMap[this.state.network].KLEROS_LIQUID, _localDisputeID: arbitrableDisputeID, _round },
    });
    let ruling = rulingFundedLogs.map((log) => log.returnValues._ruling);

    return ruling;
  };

  getTotalWithdrawableAmount = async (arbitrableDisputeID, contributedTo, arbitrated) => {
    let amount = 0;

    try {
      // targeting v2;
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
      // targeting v1
      amount = await EthereumInterface.call(
        "IDisputeResolver_v1",
        arbitrated,
        "getTotalWithdrawableAmount",
        arbitrableDisputeID,
        this.state.activeAddress ? this.state.activeAddress : ADDRESS_ZERO,
        contributedTo
      );

      return { amount: amount, ruling: contributedTo };
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
    if (network) {
      if (!networkMap[network]) {
        return (
          <BrowserRouter>
            <Route
              render={(route) => (
                <>
                  <Header viewOnly={!activeAddress} route={route} />
                  <UnsupportedNetwork network={network} networkMap={networkMap} />
                  <Footer networkMap={networkMap} network={network} />
                </>
              )}
            ></Route>
          </BrowserRouter>
        );
      }
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
                    network={network}
                  />
                  <Footer networkMap={networkMap} network={network} />
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
                    network={network}
                  />
                  <Footer networkMap={networkMap} network={network} />
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
                    exceptionalContractAddresses={EXCEPTIONAL_CONTRACT_ADDRESSES}
                  />
                  <Footer networkMap={networkMap} network={network} />
                </>
              )}
            />
            <Route
              render={(route) => (
                <>
                  <Header viewOnly={!activeAddress} route={route} />

                  <_404 />
                  <Footer networkMap={networkMap} network={network} />
                </>
              )}
            />
          </Switch>
        </BrowserRouter>
      );
    } else return <>Please enable a web3 provider.</>;
  }
}

export default App;
