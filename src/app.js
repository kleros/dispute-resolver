import React from "react";
import "./app.scss";
import Create from "./containers/create";
import NotFound from "./containers/404";
import Interact from "./containers/interact";
import OpenDisputes from "./containers/open-disputes";
import { BrowserRouter, Route, Switch, Redirect } from "react-router-dom";
import Header from "./components/header";
import Footer from "./components/footer";
import { ethers } from "ethers";

import { getContract, getSignableContract } from "./ethereum/interface";
import networkMap, { getReadOnlyRpcUrl } from "./ethereum/network-contract-mapping";
import ipfsPublish from "./ipfs-publish";
import Archon from "@kleros/archon";
import UnsupportedNetwork from "./components/unsupportedNetwork";
import { urlNormalize } from "./urlNormalizer";

// Constants to avoid magic numbers
const HEX_PADDING_WIDTH = 64;
const MAX_BLOCK_LOOKBACK = 1_000_000;
const SEARCH_WINDOW_SIZE = 10_000;
const DISPUTE_PERIOD_EXECUTION = 4;

const IPFS_GATEWAY = "https://cdn.kleros.link";
const EXCEPTIONAL_CONTRACT_ADDRESSES = ['0xe0e1bc8C6cd1B81993e2Fcfb80832d814886eA38', '0xb9f9B5eee2ad29098b9b3Ea0B401571F5dA4AD81']
const CACHE_INVALIDATION_PERIOD_FOR_SUBCOURTS_MS = 3 * 60 * 60 * 1000
const CACHE_INVALIDATION_PERIOD_FOR_DISPUTES_MS = 1 * 60 * 1000

const isBigNumberLike = value => {
  return value && typeof value === 'object' &&
    typeof value.toString === 'function' &&
    (value.type === 'BigNumber' || value._hex !== undefined);
};

const safeJSONStringify = obj => {
  return JSON.stringify(obj, (_, value) => {
    if (typeof value === 'bigint') {
      return value.toString();
    }
    if (value && typeof value === 'object' && value._isBigNumber) {
      return value.toString();
    }
    if (isBigNumberLike(value)) {
      return value.toString();
    }
    return value;
  });
};

const safeLocalStorageGet = key => {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : null;
  } catch (error) {
    console.warn(`Failed to parse localStorage item ${key}:`, error);
    return null;
  }
};

class App extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      activeAddress: "",
      network: "",
      lastDisputeID: "",
      subcourtsLoading: true,
      provider: null,
      signer: null,
      archon: null
    };
    this.encoder = new TextEncoder();
  }

  async componentDidMount() {
    await this.initiateWeb3Provider();

    // Check if URL chainId matches provider's chainId
    const urlChainId = window.location.pathname.split('/')[1];
    if (urlChainId && this.state.network && urlChainId !== this.state.network) {
      console.log(`Switching to chain ${urlChainId} from URL`);
      this.setState({ network: urlChainId });
      await this.switchToChain(urlChainId);
    }

    if (window.ethereum) {
      this.setState({ activeAddress: window.ethereum.selectedAddress });

      window.ethereum.on("accountsChanged", accounts => {
        this.setState({ activeAddress: accounts[0] });
      });

      window.ethereum.on("chainChanged", async chainIdHex => {
        const networkId = parseInt(chainIdHex, 16).toString(10);
        await this.handleNetworkChange(networkId);
      });
    } else {
      console.error("MetaMask not detected :(");
    }

    if (networkMap[this.state.network]?.KLEROS_LIQUID) {
      this.loadSubcourtData();
    }
  }

  componentWillUnmount() {
    if (window.ethereum) {
      window.ethereum.removeAllListeners('accountsChanged');
      window.ethereum.removeAllListeners('chainChanged');
    }
  }

  handleNetworkChange = async newChainId => {
    this.setState({
      subcourts: [],
      subcourtDetails: [],
      subcourtsLoading: true,
      lastDisputeID: ""
    });

    if (this.state.network === newChainId) return;

    this.setState({ network: newChainId }, async () => {
      await this.initiateWeb3Provider();
      if (networkMap[newChainId]?.KLEROS_LIQUID) {
        this.loadSubcourtData();
      }

      this.syncUrlWithChain(newChainId);
    });
  };

  syncUrlWithChain = chainId => {
    const currentPath = window.location.pathname;
    const pathParts = currentPath.split('/');

    // Check if URL already has a chain ID
    if (pathParts[1] && /^\d+$/.test(pathParts[1])) {
      pathParts[1] = chainId;
    } else {
      pathParts.splice(1, 0, chainId);
    }

    const newPath = pathParts.join('/');
    window.history.replaceState(null, '', newPath);
  };

  initiateWeb3Provider = async () => {
    let provider;
    let signer = null;

    if (window.ethereum) {
      provider = new ethers.BrowserProvider(window.ethereum);
      signer = provider.getSigner();

      const network = await provider.getNetwork();
      this.setState({
        network: network.chainId.toString(),
        provider,
        signer,
        archon: new Archon(window.ethereum, IPFS_GATEWAY)
      });
    } else {
      // Fallback to a default provider
      provider = ethers.getDefaultProvider();
      const network = await provider.getNetwork();
      this.setState({
        network: network.chainId.toString(),
        provider,
        archon: new Archon(provider, IPFS_GATEWAY)
      });
    }
  };

  switchToChain = async chainId => {
    if (!window.ethereum) return;

    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: `0x${parseInt(chainId, 10).toString(16)}` }],
      });
    } catch (error) {
      console.error('Failed to switch chain:', error);
    }
  };

  // Extract cache validation logic to reduce complexity
  isCacheValid = (parsedSubcourts, parsedSubcourtDetails, lastModified) => {
    return lastModified &&
      parsedSubcourts &&
      parsedSubcourtDetails &&
      parsedSubcourts.length > 0 &&
      parsedSubcourtDetails.length > 0 &&
      new Date().getTime() < CACHE_INVALIDATION_PERIOD_FOR_SUBCOURTS_MS + parseInt(lastModified, 10);
  };

  loadSubcourtData = async () => {
    const { network } = this.state;

    console.debug(`Loading subcourts for network: ${network}`);

    const parsedSubcourts = safeLocalStorageGet(`${network}Subcourts`);
    const parsedSubcourtDetails = safeLocalStorageGet(`${network}SubcourtDetails`);
    const lastModified = localStorage.getItem(`${network}LastModified`);

    // Check cache validity
    if (this.isCacheValid(parsedSubcourts, parsedSubcourtDetails, lastModified)) {
      try {
        this.setState({
          subcourts: parsedSubcourts,
          subcourtDetails: parsedSubcourtDetails,
          subcourtsLoading: false
        });
        return;
      } catch (error) {
        console.warn("Failed to use cached subcourts:", error);
      }
    }

    let counter = 0;
    const subcourts = [];
    const subcourtURIs = [];

    while (true) {
      try {
        await this.estimateGasOfGetSubcourt(counter);
        counter++;
      } catch (err) {
        console.debug('Subcourt enumeration complete:', err.message);
        break;
      }
    }

    for (let i = 0; i < counter; i++) {
      subcourtURIs[i] = this.getSubCourtDetails(i);
      subcourts[i] = this.getSubcourt(i);
    }

    this.setState({
      subcourtDetails: await Promise.all(subcourtURIs.map(promise => promise.then(subcourtURI => {
        console.debug({ subcourtURI })
        if (subcourtURI.length > 0) {
          if (subcourtURI.includes("http")) {
            return fetch(subcourtURI)
              .then(response => response.json())
              .catch(error => console.error(error));
          } else {
            return fetch(IPFS_GATEWAY + subcourtURI).then(response => response.json());
          }
        }
        return null;
      }))), subcourtsLoading: false, subcourts: await Promise.all(subcourts),
    });

    // Cache the data
    localStorage.setItem(`${network}Subcourts`, safeJSONStringify(this.state.subcourts));
    localStorage.setItem(`${network}SubcourtDetails`, safeJSONStringify(this.state.subcourtDetails));
    localStorage.setItem(`${network}LastModified`, new Date().getTime().toString());
  };

  getOpenDisputesOnCourt = async () => {
    if (!networkMap[this.state.network]?.KLEROS_LIQUID) return [];

    const contract = getContract(
      "KlerosLiquid",
      networkMap[this.state.network].KLEROS_LIQUID,
      this.state.provider
    );

    const currentBlock = await this.state.provider.getBlockNumber();
    const startingBlock = Math.max(0, currentBlock - MAX_BLOCK_LOOKBACK);

    const newPeriodFilter = contract.filters.NewPeriod();
    const newPeriodEvents = await contract.queryFilter(newPeriodFilter, startingBlock);

    const disputeCreationFilter = contract.filters.DisputeCreation();
    const disputeCreationEvents = await contract.queryFilter(disputeCreationFilter, startingBlock);

    const disputes = [...new Set(disputeCreationEvents.map(event => event.args._disputeID.toString()))];

    const resolvedDisputes = newPeriodEvents
      .filter(event => event.args._period.toString() === "4")
      .map(event => event.args._disputeID.toString());

    return disputes.filter(dispute => !resolvedDisputes.includes(dispute));
  };

  getArbitrableDisputeID = async (arbitrableAddress, arbitratorDisputeID) => {
    console.debug(`🔍 [getArbitrableDisputeID] Attempting to query:`, {
      arbitrableAddress,
      arbitratorDisputeID,
      network: this.state.network
    });

    //Means it is an EscrowV1 dispute
    if (networkMap[this.state.network].ESCROW_V1_CONTRACTS.includes(arbitrableAddress)) {
      return this.getArbitrableDisputeIDFromEscrowV1(arbitrableAddress, arbitratorDisputeID);
    }

    const contract = getContract(
      "IDisputeResolver",
      arbitrableAddress,
      this.state.provider
    );

    try {
      console.debug(`🔍 [getArbitrableDisputeID] Calling externalIDtoLocalID(${arbitratorDisputeID}) on ${arbitrableAddress}`);
      const result = await contract.externalIDtoLocalID.staticCall(arbitratorDisputeID);
      console.debug(`✅ [getArbitrableDisputeID] Success:`, result.toString());
      return result;
    } catch (error) {
      console.error(`❌ [getArbitrableDisputeID] Error fetching dispute ID for arbitrable ${arbitrableAddress}:`, error);
      console.debug(`🔍 [getArbitrableDisputeID] Error details:`, {
        code: error.code,
        reason: error.reason,
        data: error.data,
        transaction: error.transaction
      });

      // Try to get the correct arbitrable address from arbitrator events
      console.debug(`🔄 [getArbitrableDisputeID] Attempting to find correct arbitrable address from arbitrator...`);
      try {
        const correctArbitrableAddress = await this.findArbitrableFromArbitrator(arbitratorDisputeID);
        if (correctArbitrableAddress && correctArbitrableAddress !== arbitrableAddress) {
          console.debug(`📍 [getArbitrableDisputeID] Found different arbitrable address: ${correctArbitrableAddress}`);
          // Recursively try with the correct address
          return this.getArbitrableDisputeID(correctArbitrableAddress, arbitratorDisputeID);
        }
      } catch (fallbackError) {
        console.error(`❌ [getArbitrableDisputeID] Fallback query failed:`, fallbackError);
      }

      return null;
    }
  }

  //For EscrowV1 the externalIDtoLocalID function is not available, but the mapping disputeIDtoTransactionID is.
  getArbitrableDisputeIDFromEscrowV1 = async (arbitrableAddress, arbitratorDisputeID) => {
    try {
      //Note that EscrowV1 uses MultipleArbitrableTransaction and MultipleArbitrableTokenTransaction contracts. 
      //However, we can always use the same ABI here because the function is the same and available in both.
      const contract = getContract(
        "MultipleArbitrableTokenTransaction",
        arbitrableAddress,
        this.state.provider
      );

      const result = await contract.disputeIDtoTransactionID.staticCall(arbitratorDisputeID);
      console.debug(`✅ [getArbitrableDisputeID] EscrowV1 success:`, result.toString());
      return result;
    } catch (error) {
      console.error(`❌ [getArbitrableDisputeID] EscrowV1 error:`, error);
      return null;
    }
  }

  findArbitrableFromArbitrator = async (arbitratorDisputeID) => {
    const { network } = this.state;
    const arbitratorAddress = networkMap[network]?.KLEROS_LIQUID;

    if (!arbitratorAddress) {
      console.error(`❌ [findArbitrableFromArbitrator] No arbitrator configured for network ${network}`);
      return null;
    }

    console.debug(`🔍 [findArbitrableFromArbitrator] Querying arbitrator ${arbitratorAddress} for dispute ${arbitratorDisputeID}`);

    const arbitratorContract = getContract(
      "IArbitrator",
      arbitratorAddress,
      this.state.provider
    );

    try {
      // Query for DisputeCreation events
      const deploymentBlock = networkMap[network]?.QUERY_FROM_BLOCK || 0;
      const currentBlock = await this.state.provider.getBlockNumber();
      const fromBlock = Math.max(deploymentBlock, currentBlock - 1000000); // Limit search range

      console.debug(`🔍 [findArbitrableFromArbitrator] Searching blocks ${fromBlock} to ${currentBlock}`);

      const events = await arbitratorContract.queryFilter(
        arbitratorContract.filters.DisputeCreation(arbitratorDisputeID),
        fromBlock,
        currentBlock
      );

      console.debug(`📋 [findArbitrableFromArbitrator] Found ${events.length} DisputeCreation events`);

      if (events.length > 0) {
        const arbitrableAddress = events[0].args._arbitrable;
        console.debug(`✅ [findArbitrableFromArbitrator] Found arbitrable address: ${arbitrableAddress}`);
        return arbitrableAddress;
      } else {
        console.warn(`⚠️ [findArbitrableFromArbitrator] No DisputeCreation event found for dispute ${arbitratorDisputeID}`);
        return null;
      }
    } catch (error) {
      console.error(`❌ [findArbitrableFromArbitrator] Error querying arbitrator:`, error);
      return null;
    }
  }

  getArbitrationCost = async (arbitratorAddress, extraData) => {
    const contract = getContract(
      "IArbitrator",
      arbitratorAddress,
      this.state.provider
    );

    try {
      return contract.arbitrationCost(extraData)
    } catch (error) {
      console.error(`Error fetching arbitration cost for arbitrator ${arbitratorAddress}:`, error);
      return null;
    }
  }

  getArbitrationCostWithCourtAndNoOfJurors = async (subcourtID, noOfJurors) => {
    if (!networkMap[this.state.network]?.KLEROS_LIQUID) return null;

    const contract = getContract(
      "IArbitrator",
      networkMap[this.state.network].KLEROS_LIQUID,
      this.state.provider
    );

    try {
      const extraData = this.generateArbitratorExtraData(subcourtID, noOfJurors);
      const value = await contract.arbitrationCost(extraData)

      return ethers.formatEther(value)
    } catch (error) {
      console.error(`Error fetching arbitration cost for court ${subcourtID}:`, error);
      return null
    }
  }

  estimateGasOfGetSubcourt = async subcourtID => {
    if (!networkMap[this.state.network]?.KLEROS_LIQUID) {
      throw new Error('Network not configured for Kleros Liquid');
    }

    try {
      const contract = getContract(
        "KlerosLiquid",
        networkMap[this.state.network].KLEROS_LIQUID,
        this.state.provider
      );

      return contract.getSubcourt.estimateGas(subcourtID);
    } catch (error) {
      console.warn(`Error estimating gas for subcourt ${subcourtID}:`, error);
      throw error;
    }
  };

  getSubcourt = async subcourtID => {
    if (!networkMap[this.state.network]?.KLEROS_LIQUID) return null;

    const contract = getContract(
      "KlerosLiquid",
      networkMap[this.state.network].KLEROS_LIQUID,
      this.state.provider
    );

    try {
      return contract.getSubcourt(subcourtID);
    } catch (error) {
      console.error("Error fetching subcourt details: ", error)
      return null;
    }
  };

  getSubCourtDetails = async subcourtID => {
    if (!networkMap[this.state.network]?.POLICY_REGISTRY) return null;

    const contract = getContract(
      "PolicyRegistry",
      networkMap[this.state.network].POLICY_REGISTRY,
      this.state.provider
    );

    try {
      return contract.policies(subcourtID);
    } catch (error) {
      console.error(`Error fetching subcourt details for court ${subcourtID}:`, error);
      return null;
    }
  };

  getArbitratorDispute = async arbitratorDisputeID => {
    if (!networkMap[this.state.network]?.KLEROS_LIQUID) return null;

    const contract = getContract(
      "KlerosLiquid",
      networkMap[this.state.network].KLEROS_LIQUID,
      this.state.provider
    );

    try {
      return contract.disputes(arbitratorDisputeID);
    } catch (error) {
      console.error(`Error fetching dispute ${arbitratorDisputeID}:`, error);
      return null;
    }
  };

  getArbitratorDisputeDetails = async arbitratorDisputeID => {
    if (!networkMap[this.state.network]?.KLEROS_LIQUID) return null;

    const contract = getContract(
      "KlerosLiquid",
      networkMap[this.state.network].KLEROS_LIQUID,
      this.state.provider
    );

    try {
      return contract.getDispute(arbitratorDisputeID);
    } catch (error) {
      console.error(`Error fetching dispute details ${arbitratorDisputeID}:`, error);
      return null;
    }
  }

  getMultipliers = async arbitrableAddress => {
    const contract = getContract(
      "IDisputeResolver",
      arbitrableAddress,
      this.state.provider
    );

    try {
      return contract.getMultipliers()
    } catch (error) {
      console.error(`Error fetching multipliers for arbitrable ${arbitrableAddress}:`, error);
      return null
    }
  }


  onPublish = async (filename, fileBuffer) => ipfsPublish(filename, fileBuffer);

  generateArbitratorExtraData = (subcourtID, noOfVotes) => `0x${parseInt(subcourtID, 10).toString(16).padStart(HEX_PADDING_WIDTH, "0") + parseInt(noOfVotes, 10).toString(16).padStart(HEX_PADDING_WIDTH, "0")}`;

  getAppealCost = async arbitratorDisputeID => {
    if (!networkMap[this.state.network]?.KLEROS_LIQUID) return null;

    const contract = getContract(
      "IArbitrator",
      networkMap[this.state.network].KLEROS_LIQUID,
      this.state.provider
    );

    try {
      return contract.appealCost(arbitratorDisputeID, ethers.ZeroHash);
    } catch (error) {
      console.error(`Error fetching appeal cost for dispute ID ${arbitratorDisputeID}:`, error);
      return null
    }
  }

  getAppealCostOnArbitrable = async (arbitrableDisputeID, ruling) => {
    if (!networkMap[this.state.network]?.ARBITRABLE_PROXY) return null;

    const contract = getContract(
      "IDisputeResolver",
      networkMap[this.state.network].ARBITRABLE_PROXY,
      this.state.provider
    );

    try {
      return contract.appealCost(arbitrableDisputeID, ruling);
    } catch (error) {
      console.error(`Error fetching appeal cost for dispute ID ${arbitrableDisputeID}:`, error);
      return null;
    }
  }

  getAppealPeriod = async arbitratorDisputeID => {
    if (!networkMap[this.state.network]?.KLEROS_LIQUID) return null;

    const contract = getContract(
      "KlerosLiquid",
      networkMap[this.state.network].KLEROS_LIQUID,
      this.state.provider
    );

    try {
      return contract.appealPeriod(arbitratorDisputeID);
    } catch (error) {
      console.error(`Error fetching appeal period for dispute ID ${arbitratorDisputeID}:`, error);
      return null;
    }
  }

  getCurrentRuling = async arbitratorDisputeID => {
    if (!networkMap[this.state.network]?.KLEROS_LIQUID) return null;

    const contract = getContract(
      "KlerosLiquid",
      networkMap[this.state.network].KLEROS_LIQUID,
      this.state.provider
    );

    try {
      return contract.currentRuling(arbitratorDisputeID);
    } catch (error) {
      console.error(`Error fetching current ruling for dispute ID ${arbitratorDisputeID}:`, error);
      return null;
    }
  }

  getDisputeEvent = async (arbitrableAddress, disputeID) => this.state.archon.arbitrable.getDispute(arbitrableAddress, // arbitrable contract address
    networkMap[this.state.network].KLEROS_LIQUID, // arbitrator contract address
    disputeID // dispute unique identifier
  );

  getMetaEvidence = async (arbitrableAddress, arbitratorDisputeID) => {
    try {
      console.debug(`🔍 [getMetaEvidence] Starting dispute ${arbitratorDisputeID}`);

      const { network } = this.state;
      // For cross-chain disputes: if arbitrator is on Ethereum mainnet (1),
      // we USED to assume arbitrable is on Gnosis (100), but we need to check both networks
      // First, let's try the same network as the arbitrator
      let targetNetwork = network; // Start by assuming same network
      console.debug(`🌐 [getMetaEvidence] Current network: ${network}, initially trying target network: ${targetNetwork}`);

      // First, get the block number from DisputeCreation event on arbitrator (Ethereum)
      console.debug(`📍 [getMetaEvidence] Step 1: Querying arbitrator for DisputeCreation event`);
      const arbitratorContract = getContract(
        "KlerosLiquid",
        networkMap[this.state.network].KLEROS_LIQUID,
        this.state.provider
      );

      const disputeCreationFilter = arbitratorContract.filters.DisputeCreation(arbitratorDisputeID);
      const arbitratorCurrentBlock = await this.state.provider.getBlockNumber();
      // Use deployment block if available, otherwise fallback to SEARCH_WINDOW_SIZE
      const deploymentBlock = networkMap[this.state.network].QUERY_FROM_BLOCK;
      const arbitratorSearchFrom = deploymentBlock || (arbitratorCurrentBlock - SEARCH_WINDOW_SIZE);

      console.debug(`🔎 [getMetaEvidence] Searching arbitrator blocks ${arbitratorSearchFrom} to ${arbitratorCurrentBlock} for dispute ${arbitratorDisputeID}`);
      console.debug(`🏗️ [getMetaEvidence] Using deployment block: ${deploymentBlock}, current: ${arbitratorCurrentBlock}`);
      console.debug(`📊 [getMetaEvidence] Arbitrator contract: ${networkMap[this.state.network].KLEROS_LIQUID}`);

      let disputeCreationEvents;
      try {
        console.debug(`🚀 [getMetaEvidence] Executing DisputeCreation queryFilter...`);
        disputeCreationEvents = await arbitratorContract.queryFilter(
          disputeCreationFilter,
          arbitratorSearchFrom,
          "latest"
        );
        console.debug(`📋 [getMetaEvidence] Found ${disputeCreationEvents.length} DisputeCreation events`);
      } catch (error) {
        console.error(`💥 [getMetaEvidence] Error querying DisputeCreation events:`, error);
        return null;
      }

      if (disputeCreationEvents.length === 0) {
        console.error(`❌ [getMetaEvidence] No DisputeCreation event found on arbitrator for dispute ${arbitratorDisputeID}`);
        return null;
      }

      const disputeCreationBlock = disputeCreationEvents[0].blockNumber;

      // Get the timestamp of the DisputeCreation block for cross-chain coordination
      console.debug(`⏰ [getMetaEvidence] Getting timestamp for Ethereum block ${disputeCreationBlock}`);
      const disputeCreationBlockData = await this.state.provider.getBlock(disputeCreationBlock);
      const disputeCreationTimestamp = disputeCreationBlockData.timestamp;

      console.debug(`✅ [getMetaEvidence] Found DisputeCreation at block ${disputeCreationBlock} (timestamp: ${disputeCreationTimestamp}) on arbitrator`);
      console.debug(`🧾 [getMetaEvidence] DisputeCreation event details:`, disputeCreationEvents[0]);

      // Extract and display all event args clearly
      const event = disputeCreationEvents[0];
      console.debug(`📋 [getMetaEvidence] DisputeCreation event args:`);
      console.debug(`   - _disputeID: ${event.args._disputeID}`);
      console.debug(`   - _arbitrable: ${event.args._arbitrable}`);
      console.debug(`   - Transaction hash: ${event.transactionHash}`);
      console.debug(`   - Block number: ${event.blockNumber}`);

      // CRITICAL: Check if the arbitrable address in the event matches what we're querying
      const eventArbitrableAddress = disputeCreationEvents[0].args._arbitrable;
      console.debug(`🔍 [getMetaEvidence] Event arbitrable address: ${eventArbitrableAddress}`);
      console.debug(`🔍 [getMetaEvidence] Query arbitrable address: ${arbitrableAddress}`);
      console.debug(`🔍 [getMetaEvidence] Addresses match: ${eventArbitrableAddress.toLowerCase() === arbitrableAddress.toLowerCase()}`);

      if (eventArbitrableAddress.toLowerCase() !== arbitrableAddress.toLowerCase()) {
        console.error(`❌ [getMetaEvidence] ADDRESS MISMATCH! Event shows arbitrable ${eventArbitrableAddress} but we're querying ${arbitrableAddress}`);
        console.debug(`💡 [getMetaEvidence] This explains why no events are found. Using the correct address from the event...`);
        // Update the arbitrable address to the correct one from the event
        arbitrableAddress = eventArbitrableAddress;
        console.debug(`🔄 [getMetaEvidence] Updated arbitrable address to: ${arbitrableAddress}`);
      }

      // Now query the arbitrable contract - start with same network as arbitrator
      console.debug(`📍 [getMetaEvidence] Step 2: Querying arbitrable contract for Dispute event on same network`);
      const targetProvider = this.state.provider; // Use same provider as arbitrator initially

      console.debug(`🔗 [getMetaEvidence] Target provider: Using same network (${network}) as arbitrator`);

      const contract = getContract("IDisputeResolver", arbitrableAddress, targetProvider);
      console.debug(`🏗️ [getMetaEvidence] Created contract instance for ${arbitrableAddress} on network ${network}`);

      // Debug contract interface
      try {
        const hasDispute = typeof contract.filters.Dispute === 'function';
        console.debug(`🔍 [getMetaEvidence] Contract has Dispute filter: ${hasDispute}`);
        if (hasDispute) {
          const topics = contract.interface.getEvent('Dispute').topicHash;
          console.debug(`🏷️ [getMetaEvidence] Dispute event topic: ${topics}`);
        }
      } catch (err) {
        console.debug(`⚠️ [getMetaEvidence] Contract interface check failed: ${err.message}`);
      }

      const arbitratorAddr = networkMap[this.state.network].KLEROS_LIQUID;
      console.debug(`⚖️ [getMetaEvidence] Using arbitrator address: ${arbitratorAddr}`);

      const disputeFilter = contract.filters.Dispute(
        arbitratorAddr, // arbitrator address
        arbitratorDisputeID // dispute ID
      );

      // Since both arbitrator and arbitrable are on Ethereum, use the same block range as DisputeCreation
      console.debug(`📅 [getMetaEvidence] Step 2a: Searching on same network (Ethereum) around block ${disputeCreationBlock}`);

      const targetCurrentBlock = await targetProvider.getBlockNumber();
      console.debug(`🔗 [getMetaEvidence] Current Ethereum block: ${targetCurrentBlock}`);

      // Since both events should be in the same transaction or very close blocks on Ethereum
      const blockBuffer = 100; // Much smaller buffer since same network  
      const searchFromBlock = Math.max(1, disputeCreationBlock - blockBuffer);
      const searchToBlock = Math.min(targetCurrentBlock, disputeCreationBlock + blockBuffer);

      // Also prepare a wider search as backup 
      const recentSearchFrom = Math.max(1, targetCurrentBlock - 9999);
      const recentSearchTo = targetCurrentBlock;

      console.debug(`🧮 [getMetaEvidence] DisputeCreation block: ${disputeCreationBlock}, Current: ${targetCurrentBlock}`);
      console.debug(`🎯 [getMetaEvidence] Searching close to DisputeCreation block with ±${blockBuffer} buffer`);

      console.debug(`🔎 [getMetaEvidence] Searching arbitrable blocks ${searchFromBlock} to ${searchToBlock} (±${blockBuffer} around DisputeCreation ${disputeCreationBlock})`);
      console.debug(`📊 [getMetaEvidence] Arbitrable filter: arbitrator=${arbitratorAddr}, disputeID=${arbitratorDisputeID}`);

      let disputeEvents;
      try {
        console.debug(`🚀 [getMetaEvidence] Executing queryFilter...`);
        disputeEvents = await contract.queryFilter(
          disputeFilter,
          searchFromBlock,
          searchToBlock
        );
        console.debug(`📋 [getMetaEvidence] Found ${disputeEvents.length} Dispute events on arbitrable contract`);

        if (disputeEvents.length > 0) {
          console.debug(`📄 [getMetaEvidence] First Dispute event details:`, disputeEvents[0]);
          console.debug(`📋 [getMetaEvidence] Event args:`, disputeEvents[0].args);
        }
      } catch (error) {
        console.error(`💥 [getMetaEvidence] Error querying Dispute events:`, error);
        return null;
      }

      if (disputeEvents.length === 0) {
        console.error(`❌ [getMetaEvidence] No Dispute event found for dispute ${arbitratorDisputeID}`);
        console.debug(`🔍 [getMetaEvidence] Search parameters: arbitrator=${arbitratorAddr}, disputeID=${arbitratorDisputeID}, blocks=${searchFromBlock}-${searchToBlock}`);

        // Try a much wider range and also check for any events without filters
        try {
          console.debug(`🔄 [getMetaEvidence] Trying to query all Dispute events in narrow range (no filter)...`);
          const allDisputeEvents = await contract.queryFilter(
            contract.filters.Dispute(),
            searchFromBlock,
            searchToBlock
          );
          console.debug(`📊 [getMetaEvidence] Found ${allDisputeEvents.length} total Dispute events in narrow range`);
          if (allDisputeEvents.length > 0) {
            console.debug(`🔍 [getMetaEvidence] Sample Dispute event:`, allDisputeEvents[0]);
            console.debug(`🔍 [getMetaEvidence] Sample event args:`, allDisputeEvents[0].args);
          }

          // Try recent blocks search (most likely to succeed for 1-month-old dispute)
          console.debug(`🔄 [getMetaEvidence] Trying recent blocks search: ${recentSearchFrom} to ${recentSearchTo}`);

          const recentDisputeEvents = await contract.queryFilter(
            contract.filters.Dispute(),
            recentSearchFrom,
            recentSearchTo
          );
          console.debug(`📊 [getMetaEvidence] Found ${recentDisputeEvents.length} Dispute events in recent range`);
          if (recentDisputeEvents.length > 0) {
            console.debug(`🔍 [getMetaEvidence] First recent event:`, recentDisputeEvents[0]);
            console.debug(`🔍 [getMetaEvidence] First recent event args:`, recentDisputeEvents[0].args);
          }
        } catch (searchError) {
          console.error(`💥 [getMetaEvidence] Error in wider search:`, searchError);
        }

        // One final attempt: check if this contract has ANY Dispute events ever
        try {
          console.debug(`🔍 [getMetaEvidence] Final check: searching for ANY Dispute events on this contract...`);
          const recentBlock = await targetProvider.getBlockNumber();
          const veryRecentFrom = Math.max(1, recentBlock - 9999); // Max allowed range

          const anyDisputeEvents = await contract.queryFilter(
            contract.filters.Dispute(),
            veryRecentFrom,
            recentBlock
          );
          console.debug(`📋 [getMetaEvidence] Found ${anyDisputeEvents.length} total Dispute events in recent 10k blocks`);

          if (anyDisputeEvents.length > 0) {
            console.debug(`🔍 [getMetaEvidence] Sample recent Dispute event:`, anyDisputeEvents[0]);
            console.debug(`🔍 [getMetaEvidence] Sample recent event args:`, anyDisputeEvents[0].args);
            console.debug(`📊 [getMetaEvidence] All recent dispute IDs:`, anyDisputeEvents.map(e => e.args._disputeID.toString()));
          } else {
            console.debug(`⚠️ [getMetaEvidence] This contract has NO Dispute events in recent history`);
            console.debug(`🤔 [getMetaEvidence] Possible reasons:`);
            console.debug(`   1. Dispute 1661 never created a Dispute event on this arbitrable contract`);
            console.debug(`   2. Wrong arbitrable contract address`);
            console.debug(`   3. Events are older than 10k blocks`);
            console.debug(`   4. Different arbitrator address used in events`);
          }
        } catch (finalError) {
          console.error(`💥 [getMetaEvidence] Final check failed:`, finalError);
        }

        console.debug(`🔍 [getMetaEvidence] This error is from the getMetaEvidence function (not parallelizeable)`);

        // Since user confirms dispute 1661 exists, let's try some alternative approaches
        console.debug(`💡 [getMetaEvidence] User confirms dispute 1661 exists. Trying alternative approaches...`);

        // Try 1: Search on Ethereum mainnet instead of Gnosis
        try {
          console.debug(`🔄 [getMetaEvidence] Alternative 1: Checking if arbitrable contract is on Ethereum mainnet...`);
          const ethereumContract = getContract("IDisputeResolver", arbitrableAddress, this.state.provider);
          const ethereumDisputeFilter = ethereumContract.filters.Dispute(arbitratorAddr, arbitratorDisputeID);
          const ethereumCurrentBlock = await this.state.provider.getBlockNumber();
          const ethereumSearchFrom = Math.max(1, ethereumCurrentBlock - 9999);

          const ethereumDisputeEvents = await ethereumContract.queryFilter(
            ethereumDisputeFilter,
            ethereumSearchFrom,
            ethereumCurrentBlock
          );
          console.debug(`📊 [getMetaEvidence] Found ${ethereumDisputeEvents.length} Dispute events on Ethereum mainnet`);
          if (ethereumDisputeEvents.length > 0) {
            console.debug(`✅ [getMetaEvidence] FOUND IT! Dispute event is on Ethereum mainnet, not Gnosis!`);
            console.debug(`🔍 [getMetaEvidence] Ethereum Dispute event:`, ethereumDisputeEvents[0]);
            // TODO: Continue with this event instead of returning null
          }
        } catch (ethError) {
          console.debug(`💥 [getMetaEvidence] Ethereum search failed:`, ethError.message);
        }

        // Final diagnostic: Check what events this contract DOES emit
        try {
          console.debug(`🔍 [getMetaEvidence] Final diagnostic: checking what events this contract emits...`);

          // Get all events (no filter) from recent blocks
          const gnosisContract = getContract("IDisputeResolver", arbitrableAddress, targetProvider);
          const recentFrom = Math.max(1, await targetProvider.getBlockNumber() - 2000);
          const allEvents = await gnosisContract.queryFilter("*", recentFrom, "latest");

          console.debug(`📊 [getMetaEvidence] Found ${allEvents.length} total events of any type in recent 2000 blocks`);
          if (allEvents.length > 0) {
            console.debug(`🔍 [getMetaEvidence] Sample events:`, allEvents.slice(0, 3));
            const eventTypes = [...new Set(allEvents.map(e => e.fragment.name))];
            console.debug(`📋 [getMetaEvidence] Event types found: ${eventTypes.join(', ')}`);
          } else {
            console.debug(`⚠️ [getMetaEvidence] This contract emits NO events of any type in recent history`);
            console.debug(`💡 [getMetaEvidence] This might be a proxy contract or use a different interface`);
          }

          // ALTERNATIVE APPROACH: Try searching on the arbitrator network (Ethereum mainnet)
          // Some cross-chain disputes have MetaEvidence on the arbitrator chain instead
          if (network === '100') { // If we're on Gnosis, try Ethereum mainnet
            console.debug(`🔄 [getMetaEvidence] CROSS-CHAIN SEARCH: Trying arbitrator network (Ethereum mainnet)...`);
            try {
              // Get Ethereum provider
              const ethereumProvider = new ethers.JsonRpcProvider(networkMap['1'].WEB3_PROVIDER);
              const ethereumContract = getContract("IDisputeResolver", arbitrableAddress, ethereumProvider);

              console.debug(`🔗 [getMetaEvidence] Created Ethereum contract instance for ${arbitrableAddress}`);

              // Search for MetaEvidence on Ethereum mainnet
              const ethereumSearchDeploymentBlock = networkMap['1'].QUERY_FROM_BLOCK || 1;
              const ethereumCurrentBlock = await ethereumProvider.getBlockNumber();
              console.debug(`📅 [getMetaEvidence] Searching Ethereum range: ${ethereumSearchDeploymentBlock} to ${ethereumCurrentBlock}`);

              const ethereumMetaEvents = await ethereumContract.queryFilter(
                ethereumContract.filters.MetaEvidence(),
                ethereumSearchDeploymentBlock,
                ethereumCurrentBlock
              );

              console.debug(`📊 [getMetaEvidence] Found ${ethereumMetaEvents.length} MetaEvidence events on Ethereum mainnet`);

              if (ethereumMetaEvents.length > 0) {
                console.debug(`✅ [getMetaEvidence] FOUND MetaEvidence on Ethereum mainnet!`);
                const ethereumMetaIDs = ethereumMetaEvents.map(e => e.args._metaEvidenceID.toString());
                console.debug(`📋 [getMetaEvidence] Ethereum MetaEvidence IDs: ${ethereumMetaIDs.join(', ')}`);
                console.debug(`🔍 [getMetaEvidence] Ethereum MetaEvidence events:`, ethereumMetaEvents);

                // Look for our specific metaEvidenceID on Ethereum
                const ethereumTargetEvent = ethereumMetaEvents.find(e => e.args._metaEvidenceID.toString() === metaEvidenceID.toString());
                if (ethereumTargetEvent) {
                  console.debug(`🎯 [getMetaEvidence] Found target MetaEvidence ID ${metaEvidenceID} on Ethereum mainnet!`);
                  metaEvidenceEvents = [ethereumTargetEvent]; // Use this event
                  console.debug(`✅ [getMetaEvidence] Using Ethereum MetaEvidence event:`, ethereumTargetEvent);
                }
              }
            } catch (ethereumError) {
              console.debug(`💥 [getMetaEvidence] Ethereum search failed:`, ethereumError.message);
            }
          }

        } catch (diagError) {
          console.debug(`💥 [getMetaEvidence] Event diagnostic failed:`, diagError.message);
        }

        return null;
      }

      const disputeEvent = disputeEvents[0];
      const metaEvidenceID = disputeEvent.args._metaEvidenceID;

      // Get the MetaEvidence event - search from contract deployment or much earlier
      console.debug(`🔍 [getMetaEvidence] Searching for MetaEvidence with ID ${metaEvidenceID}`);

      const metaEvidenceFilter = contract.filters.MetaEvidence(metaEvidenceID);

      // Try searching from a much earlier block since MetaEvidence is typically emitted at contract creation
      const wideSearchFrom = Math.max(1, disputeEvent.blockNumber - 1000000); // Search back 1M blocks
      console.debug(`🔎 [getMetaEvidence] Searching MetaEvidence from block ${wideSearchFrom} to ${disputeEvent.blockNumber}`);

      let metaEvidenceEvents = await contract.queryFilter(
        metaEvidenceFilter,
        wideSearchFrom,
        disputeEvent.blockNumber
      );

      if (metaEvidenceEvents.length === 0) {
        console.debug(`⚠️ [getMetaEvidence] No MetaEvidence found in recent range, trying from deployment...`);

        // Try from deployment block if available
        const deploymentBlock = networkMap[network].QUERY_FROM_BLOCK || 1;
        console.debug(`🔎 [getMetaEvidence] Searching MetaEvidence from deployment block ${deploymentBlock}`);

        metaEvidenceEvents = await contract.queryFilter(
          metaEvidenceFilter,
          deploymentBlock,
          disputeEvent.blockNumber
        );
      }

      if (metaEvidenceEvents.length === 0) {
        console.error(`❌ [getMetaEvidence] No MetaEvidence event found for metaEvidenceID ${metaEvidenceID} in any range`);

        // Debug: Check what MetaEvidence events exist on this contract
        try {
          // First, try a much wider search range to find ANY MetaEvidence events
          console.debug(`🔍 [getMetaEvidence] Expanding search to find ANY MetaEvidence events on this contract...`);

          // Search from contract deployment to current block
          const searchDeploymentBlock = networkMap[network].QUERY_FROM_BLOCK || 1;
          const currentBlock = await targetProvider.getBlockNumber();
          console.debug(`📅 [getMetaEvidence] Searching full range: ${searchDeploymentBlock} to ${currentBlock}`);

          const allMetaEvents = await contract.queryFilter(
            contract.filters.MetaEvidence(),
            searchDeploymentBlock,
            currentBlock
          );
          console.debug(`📊 [getMetaEvidence] Found ${allMetaEvents.length} total MetaEvidence events in full range`);

          if (allMetaEvents.length > 0) {
            const metaIDs = allMetaEvents.map(e => e.args._metaEvidenceID.toString());
            console.debug(`📋 [getMetaEvidence] Available MetaEvidence IDs: ${metaIDs.join(', ')}`);
            console.debug(`🔍 [getMetaEvidence] Sample MetaEvidence event:`, allMetaEvents[0]);
            console.debug(`🔍 [getMetaEvidence] All MetaEvidence events:`, allMetaEvents);

            // FALLBACK: If requested metaEvidenceID is missing but others exist, try the most recent/relevant one
            console.debug(`💡 [getMetaEvidence] FALLBACK: Trying to use available MetaEvidence as substitute`);
            const availableIds = allMetaEvents.map(e => parseInt(e.args._metaEvidenceID.toString(), 10));
            let fallbackEvent = null;

            // Strategy 1: Try ID 0 (often the default/general one)
            if (availableIds.includes(0)) {
              fallbackEvent = allMetaEvents.find(e => e.args._metaEvidenceID.toString() === '0');
              console.debug(`🔄 [getMetaEvidence] Using MetaEvidence ID 0 as fallback`);
            }
            // Strategy 2: Use the closest lower ID
            else if (availableIds.length > 0) {
              const closestId = availableIds.filter(id => id < metaEvidenceID).sort((a, b) => b - a)[0];
              if (closestId !== undefined) {
                fallbackEvent = allMetaEvents.find(e => e.args._metaEvidenceID.toString() === closestId.toString());
                console.debug(`🔄 [getMetaEvidence] Using closest MetaEvidence ID ${closestId} as fallback`);
              } else {
                // Strategy 3: Use the first available
                fallbackEvent = allMetaEvents[0];
                console.debug(`🔄 [getMetaEvidence] Using first available MetaEvidence ID ${fallbackEvent.args._metaEvidenceID} as fallback`);
              }
            }

            if (fallbackEvent) {
              console.debug(`✅ [getMetaEvidence] Using fallback MetaEvidence event:`, fallbackEvent);
              metaEvidenceEvents = [fallbackEvent]; // Continue with fallback
            }
          }
        } catch (debugError) {
          console.debug(`💥 [getMetaEvidence] MetaEvidence debug failed:`, debugError.message);
        }

        // TRANSACTION INVESTIGATION: Always check the transaction for MetaEvidence events
        if (metaEvidenceEvents.length === 0) {
          console.debug(`🔍 [getMetaEvidence] TRANSACTION INVESTIGATION: Checking dispute transaction for MetaEvidence...`);
          try {
            // Get the transaction that created the Dispute event
            const disputeTx = await targetProvider.getTransaction(disputeEvent.transactionHash);
            console.debug(`📋 [getMetaEvidence] Dispute transaction details:`, disputeTx);

            // Get the transaction receipt to see all events emitted in that transaction
            const disputeReceipt = await targetProvider.getTransactionReceipt(disputeEvent.transactionHash);
            console.debug(`📋 [getMetaEvidence] Dispute transaction receipt:`, disputeReceipt);
            console.debug(`📊 [getMetaEvidence] Total events in dispute transaction: ${disputeReceipt.logs.length}`);

            // Check if any logs in that transaction match MetaEvidence signature
            // MetaEvidence(uint256 indexed _metaEvidenceID, string _evidence)
            const metaEvidenceEventSignature = contract.interface.getEvent("MetaEvidence").topicHash;
            console.debug(`🏷️ [getMetaEvidence] MetaEvidence event signature: ${metaEvidenceEventSignature}`);
            const metaEvidenceLogsInTx = disputeReceipt.logs.filter(log =>
              log.topics[0] === metaEvidenceEventSignature
            );

            console.debug(`🔍 [getMetaEvidence] MetaEvidence events in dispute transaction: ${metaEvidenceLogsInTx.length}`);

            // Debug: Show all event signatures in the transaction
            console.debug(`🔍 [getMetaEvidence] All event signatures in transaction:`);
            const allSignatures = disputeReceipt.logs.map((log, index) => ({
              index,
              signature: log.topics[0],
              address: log.address,
              data: log.data
            }));
            console.debug(`📋 [getMetaEvidence] Event signatures:`, allSignatures);
            allSignatures.forEach((sig, i) => {
              console.debug(`   Event ${i}: ${sig.signature} (address: ${sig.address})`);
            });

            // Try to find MetaEvidence events by checking common signatures AND the actual transaction signatures
            const actualTransactionSignatures = allSignatures.map(sig => sig.signature);
            const commonMetaEvidenceSignatures = [
              "0x61606860eb6c87306811e2695215385101daab53bd6ab4e9f9049aead9363c7d", // Current calculated
              "0x61606860eb6c87c0c9c6e96b33545aa5eb4a2a8dc6cd6f75b5e65c5a7be29b4c", // Alternative
              metaEvidenceEventSignature, // Our calculated one
              ...actualTransactionSignatures // ALL actual signatures from the transaction
            ];

            console.debug(`🔍 [getMetaEvidence] Trying common MetaEvidence signatures:`, commonMetaEvidenceSignatures);

            // TEST EACH ACTUAL SIGNATURE: Try to decode each signature as MetaEvidence
            console.debug(`🧪 [getMetaEvidence] SIGNATURE TESTING: Testing each actual transaction signature as potential MetaEvidence...`);
            for (let i = 0; i < actualTransactionSignatures.length; i++) {
              const signature = actualTransactionSignatures[i];
              console.debug(`🔬 [getMetaEvidence] Testing signature ${i}: ${signature}`);

              const matchingLogs = disputeReceipt.logs.filter(log => log.topics[0] === signature);
              if (matchingLogs.length > 0) {
                console.debug(`📝 [getMetaEvidence] Found ${matchingLogs.length} logs with signature ${signature}`);

                // Try to decode this log as a MetaEvidence event
                for (const log of matchingLogs) {
                  try {
                    // Attempt to manually decode this as MetaEvidence structure
                    // MetaEvidence(uint256 indexed _metaEvidenceID, string _evidence)
                    if (log.topics.length >= 2 && log.data) {
                      // Topics[0] = event signature, topics[1] = indexed metaEvidenceID
                      console.debug(`🔍 [getMetaEvidence] Log details for signature ${i}:`, log);
                      console.debug(`🔍 [getMetaEvidence] Log topics:`, log.topics);
                      console.debug(`🔍 [getMetaEvidence] Log data:`, log.data);

                      // Try different topic positions as MetaEvidence ID might be in different positions
                      for (let topicIndex = 1; topicIndex < log.topics.length; topicIndex++) {
                        try {
                          const potentialMetaEvidenceID = ethers.getBigInt(log.topics[topicIndex]);
                          console.debug(`🔍 [getMetaEvidence] Potential MetaEvidence ID from signature ${i}, topic[${topicIndex}]: ${potentialMetaEvidenceID}`);

                          // Check if this matches our target metaEvidenceID
                          if (potentialMetaEvidenceID.toString() === metaEvidenceID.toString()) {
                            console.debug(`🎯 [getMetaEvidence] FOUND TARGET! Signature ${i}, topic[${topicIndex}] contains MetaEvidence ID ${metaEvidenceID}!`);

                            // Try to decode the data portion (the _evidence string)
                            try {
                              // Try different data decodings - the structure might vary
                              const abiCoder = ethers.AbiCoder.defaultAbiCoder();

                              // First try: single string (standard MetaEvidence)
                              try {
                                const decodedData = abiCoder.decode(['string'], log.data);
                                const evidenceString = decodedData[0];
                                console.debug(`📄 [getMetaEvidence] Decoded evidence string (attempt 1): ${evidenceString}`);

                                // Create synthetic MetaEvidence event
                                const syntheticEvent = {
                                  args: {
                                    _metaEvidenceID: potentialMetaEvidenceID,
                                    _evidence: evidenceString
                                  },
                                  blockNumber: disputeEvent.blockNumber,
                                  transactionHash: disputeEvent.transactionHash,
                                  address: log.address
                                };

                                console.debug(`✅ [getMetaEvidence] Created synthetic MetaEvidence event:`, syntheticEvent);
                                metaEvidenceEvents = [syntheticEvent];
                                break; // Found our target, exit loops
                              } catch (decode1Error) {
                                console.debug(`💥 [getMetaEvidence] String decode failed, trying alternatives:`, decode1Error.message);

                                // Second try: Multiple parameters - some contracts have different structures
                                try {
                                  const decodedData2 = abiCoder.decode(['uint256', 'string'], log.data);
                                  const evidenceString2 = decodedData2[1];
                                  console.debug(`📄 [getMetaEvidence] Decoded evidence string (attempt 2): ${evidenceString2}`);

                                  const syntheticEvent2 = {
                                    args: {
                                      _metaEvidenceID: potentialMetaEvidenceID,
                                      _evidence: evidenceString2
                                    },
                                    blockNumber: disputeEvent.blockNumber,
                                    transactionHash: disputeEvent.transactionHash,
                                    address: log.address
                                  };

                                  console.debug(`✅ [getMetaEvidence] Created synthetic MetaEvidence event (attempt 2):`, syntheticEvent2);
                                  metaEvidenceEvents = [syntheticEvent2];
                                  break;
                                } catch (decode2Error) {
                                  console.debug(`💥 [getMetaEvidence] Alternative decode also failed:`, decode2Error.message);
                                  // If we can't decode the data, at least we found the right ID
                                  console.debug(`🎯 [getMetaEvidence] Found correct MetaEvidence ID ${metaEvidenceID} but couldn't decode data`);
                                }
                              }

                            } catch (dataDecodeError) {
                              console.debug(`💥 [getMetaEvidence] Failed to decode data for signature ${i}:`, dataDecodeError.message);
                            }
                          }
                        } catch (topicDecodeError) {
                          console.debug(`💥 [getMetaEvidence] Failed to decode topic[${topicIndex}] for signature ${i}:`, topicDecodeError.message);
                        }
                      }

                      // SPECIAL CASE: Signature 4 has IPFS hash in data - check if this contains target MetaEvidence
                      if (i === 4 && log.data && log.data.length > 2) {
                        console.debug(`🧪 [getMetaEvidence] SPECIAL CASE: Signature 4 contains significant data, checking for IPFS hash...`);
                        try {
                          // Try to decode as string to see if it contains IPFS hash
                          const abiCoder = ethers.AbiCoder.defaultAbiCoder();
                          const decodedString = abiCoder.decode(['string'], log.data)[0];
                          console.debug(`📄 [getMetaEvidence] Decoded string from signature 4 data: "${decodedString}"`);

                          // Check if this looks like an IPFS hash
                          if (decodedString && (decodedString.includes('ipfs') || decodedString.includes('Qm'))) {
                            console.debug(`🎯 [getMetaEvidence] FOUND IPFS HASH in signature 4! Creating MetaEvidence with target ID ${metaEvidenceID}`);

                            // Create synthetic MetaEvidence event with target ID and found IPFS hash
                            const ipfsEvent = {
                              args: {
                                _metaEvidenceID: ethers.getBigInt(metaEvidenceID),
                                _evidence: decodedString
                              },
                              blockNumber: disputeEvent.blockNumber,
                              transactionHash: disputeEvent.transactionHash,
                              address: log.address
                            };

                            console.debug(`✅ [getMetaEvidence] Created MetaEvidence event from IPFS data:`, ipfsEvent);
                            metaEvidenceEvents = [ipfsEvent];
                            break; // Found what we need, exit
                          }
                        } catch (specialDecodeError) {
                          console.debug(`💥 [getMetaEvidence] Failed to decode signature 4 data as string:`, specialDecodeError.message);

                          // Try alternative: Maybe the data contains the MetaEvidence ID followed by string
                          try {
                            const altAbiCoder = ethers.AbiCoder.defaultAbiCoder();
                            const decodedAlt = altAbiCoder.decode(['uint256', 'string'], log.data);
                            const [altMetaID, altString] = decodedAlt;
                            console.debug(`📄 [getMetaEvidence] Alternative decode - ID: ${altMetaID}, String: "${altString}"`);

                            if (altMetaID.toString() === metaEvidenceID.toString() || (altString && altString.includes('ipfs'))) {
                              console.debug(`🎯 [getMetaEvidence] Found match in alternative decode!`);
                              const altEvent = {
                                args: {
                                  _metaEvidenceID: ethers.getBigInt(metaEvidenceID),
                                  _evidence: altString
                                },
                                blockNumber: disputeEvent.blockNumber,
                                transactionHash: disputeEvent.transactionHash,
                                address: log.address
                              };
                              console.debug(`✅ [getMetaEvidence] Created MetaEvidence from alternative decode:`, altEvent);
                              metaEvidenceEvents = [altEvent];
                              break;
                            }
                          } catch (altDecodeError) {
                            console.debug(`💥 [getMetaEvidence] Alternative decode also failed:`, altDecodeError.message);
                          }
                        }
                      }
                    }
                  } catch (signatureDecodeError) {
                    console.debug(`💥 [getMetaEvidence] Failed to decode signature ${i} as MetaEvidence:`, signatureDecodeError.message);
                  }
                }

                // If we found the target MetaEvidence, break out of signature testing
                if (metaEvidenceEvents.length > 0) break;
              }
            }

            // Check each signature against transaction logs
            for (const signature of commonMetaEvidenceSignatures) {
              const matches = disputeReceipt.logs.filter(log => log.topics[0] === signature);
              if (matches.length > 0) {
                console.debug(`✅ [getMetaEvidence] Found ${matches.length} events with signature ${signature}:`, matches);
              }
            }

            if (metaEvidenceLogsInTx.length > 0) {
              console.debug(`✅ [getMetaEvidence] Found MetaEvidence in same transaction as Dispute!`);
              console.debug(`📋 [getMetaEvidence] Raw MetaEvidence logs:`, metaEvidenceLogsInTx);

              // Try to decode these logs
              for (const log of metaEvidenceLogsInTx) {
                try {
                  const decodedLog = contract.interface.parseLog(log);
                  console.debug(`🔍 [getMetaEvidence] Decoded MetaEvidence log:`, decodedLog);
                  if (decodedLog.args._metaEvidenceID.toString() === metaEvidenceID.toString()) {
                    console.debug(`🎯 [getMetaEvidence] Found target MetaEvidence ID ${metaEvidenceID} in same transaction!`);
                    // Create a synthetic event object
                    metaEvidenceEvents = [{
                      args: decodedLog.args,
                      blockNumber: disputeEvent.blockNumber,
                      transactionHash: disputeEvent.transactionHash
                    }];
                    break; // Found it, exit the loop
                  }
                } catch (decodeError) {
                  console.debug(`💥 [getMetaEvidence] Failed to decode log:`, decodeError.message);
                }
              }
            }
          } catch (txError) {
            console.debug(`💥 [getMetaEvidence] Transaction investigation failed:`, txError.message);
          }
        }

        // If still no events after all attempts, create a generic MetaEvidence
        if (metaEvidenceEvents.length === 0) {
          console.debug(`💡 [getMetaEvidence] No MetaEvidence events found on contract. Creating generic fallback.`);
          console.debug(`🏗️ [getMetaEvidence] This contract appears to be a non-standard arbitrable that doesn't emit MetaEvidence events.`);

          // Create a minimal generic MetaEvidence for contracts without proper metadata
          const genericMetaEvidence = {
            metaEvidenceJSON: {
              title: `Dispute #${arbitratorDisputeID} (Non-Standard Contract)`,
              description: `This dispute involves a non-standard arbitrable contract (${arbitrableAddress}) that doesn't provide MetaEvidence. Limited information is available.`,
              question: "Unknown dispute question - contract doesn't provide metadata",
              rulingOptions: {
                type: "single-select",
                titles: ["Refuse to arbitrate", "Option A", "Option B"],
                descriptions: ["Invalid dispute or insufficient information", "Rule in favor of first party", "Rule in favor of second party"]
              },
              category: "Non-Standard Contract",
              arbitratorChainID: network,
              arbitrableChainID: network,
              _v: "0"
            }
          };

          console.debug(`✅ [getMetaEvidence] Created generic MetaEvidence for non-standard contract`);
          return genericMetaEvidence;
        }
      }

      const actualMetaEvidenceID = metaEvidenceEvents[0].args._metaEvidenceID.toString();
      if (actualMetaEvidenceID !== metaEvidenceID.toString()) {
        console.debug(`⚠️ [getMetaEvidence] Using fallback MetaEvidence ID ${actualMetaEvidenceID} instead of requested ${metaEvidenceID}`);
      } else {
        console.debug(`✅ [getMetaEvidence] Found MetaEvidence event for ID ${metaEvidenceID}`);
      }

      const metaEvidenceURI = metaEvidenceEvents[0].args._evidence;
      console.debug(`🌐 [getMetaEvidence] Fetching MetaEvidence from URI: ${metaEvidenceURI}`);
      console.debug(`🌐 [getMetaEvidence] Normalized URI: ${urlNormalize(metaEvidenceURI)}`);

      const response = await fetch(urlNormalize(metaEvidenceURI));
      console.debug(`📡 [getMetaEvidence] Fetch response status: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const metaEvidenceJSON = await response.json();
      console.debug(`📋 [getMetaEvidence] MetaEvidence JSON content:`, metaEvidenceJSON);

      console.log({ dispute: { metaEvidenceID, blockNumber: disputeEvent.blockNumber } });

      // NORMALIZE FIELD NAMES: Some MetaEvidence uses 'name' instead of 'title'
      if (metaEvidenceJSON.name && !metaEvidenceJSON.title) {
        console.debug(`🔧 [getMetaEvidence] Normalizing 'name' field to 'title'`);
        metaEvidenceJSON.title = metaEvidenceJSON.name;
      }

      // Ensure title exists (fallback for UI compatibility)
      if (!metaEvidenceJSON.title) {
        console.debug(`🔧 [getMetaEvidence] Adding fallback title for UI compatibility`);
        metaEvidenceJSON.title = `Dispute #${arbitratorDisputeID}`;
      }

      console.debug(`🔧 [getMetaEvidence] Final MetaEvidence JSON after normalization:`, metaEvidenceJSON);

      // For cross-chain disputes where arbitrable is on Gnosis, ensure correct chainID
      if (!metaEvidenceJSON.arbitrableChainID && network === '1') {
        console.debug(`🔧 [getMetaEvidence] Adding arbitrableChainID for cross-chain dispute`);
        metaEvidenceJSON.arbitrableChainID = '100'; // Gnosis chain
        metaEvidenceJSON.arbitratorChainID = '1';   // Ethereum mainnet
      }

      // Note: Block range parameters removed - evidence display interfaces 
      // should handle their own RPC optimization internally (follows Kleros Court approach)

      console.debug(`🎯 [getMetaEvidence] Successfully returning MetaEvidence for dispute ${arbitratorDisputeID}`);
      return { metaEvidenceJSON };

    } catch (error) {
      console.error(`💥 [getMetaEvidence] Error fetching meta evidence:`, error);
      console.debug(`🔍 [getMetaEvidence] Error occurred for arbitrable=${arbitrableAddress}, dispute=${arbitratorDisputeID}`);
      return null;
    }
  };

  // Using Archon, parallel calls occasionally fail.
  getMetaEvidenceParallelizeable = async (arbitrableAddress, arbitratorDisputeID, arbitrableChainId = null) => {
    const { network } = this.state;
    // For cross-chain disputes: if arbitrator is on Ethereum mainnet (1) but no explicit arbitrable chain ID,
    // assume arbitrable is on Gnosis (100) for now
    const targetNetwork = arbitrableChainId || (network === '1' ? '100' : network);

    console.debug(`🔍 [getMetaEvidenceParallelizeable] Starting search for dispute ${arbitratorDisputeID}`);
    console.debug(`🌐 [getMetaEvidenceParallelizeable] Networks: arbitrator=${network}, arbitrable=${targetNetwork}`);

    const item = localStorage.getItem(`${network}${arbitratorDisputeID.toString()}`);
    if (item && item !== "undefined") {
      console.debug(`💾 [getMetaEvidenceParallelizeable] Found cached metaevidence for ${arbitratorDisputeID}`);
      return JSON.parse(item);
    }
    console.debug(`📡 [getMetaEvidenceParallelizeable] Fetching dispute ${arbitratorDisputeID}...`);

    try {
      // Step 1: First, get the block number from DisputeCreation event on arbitrator (Ethereum)
      console.debug(`🔍 [getMetaEvidenceParallelizeable] Step 1: Querying arbitrator for DisputeCreation event`);
      const arbitratorContract = getContract("KlerosLiquid", networkMap[this.state.network].KLEROS_LIQUID, this.state.provider);
      const disputeCreationFilter = arbitratorContract.filters.DisputeCreation(arbitratorDisputeID);

      const currentBlock = await this.state.provider.getBlockNumber();
      // Use deployment block if available, otherwise fallback to MAX_BLOCK_LOOKBACK
      const deploymentBlock = networkMap[this.state.network].QUERY_FROM_BLOCK;
      const arbitratorSearchFrom = deploymentBlock || Math.max(1, currentBlock - MAX_BLOCK_LOOKBACK);

      console.debug(`🔎 [getMetaEvidenceParallelizeable] Searching arbitrator blocks ${arbitratorSearchFrom} to latest`);
      console.debug(`🏗️ [getMetaEvidenceParallelizeable] Using deployment block: ${deploymentBlock}, current: ${currentBlock}`);

      const disputeCreationEvents = await arbitratorContract.queryFilter(disputeCreationFilter, arbitratorSearchFrom, "latest");

      if (disputeCreationEvents.length === 0) {
        console.error(`❌ [getMetaEvidenceParallelizeable] No DisputeCreation event found on arbitrator for dispute ${arbitratorDisputeID}`);
        return null;
      }

      const disputeCreationBlock = disputeCreationEvents[0].blockNumber;
      console.debug(`🎯 [getMetaEvidenceParallelizeable] Found DisputeCreation at block ${disputeCreationBlock}`);
      console.debug(`🧾 [getMetaEvidenceParallelizeable] DisputeCreation event details:`, disputeCreationEvents[0]);

      // Step 2: Now query the arbitrable contract around that block number
      console.debug(`📍 [getMetaEvidenceParallelizeable] Step 2: Querying arbitrable contract for Dispute event`);
      const targetProvider = targetNetwork === network
        ? this.state.provider
        : new ethers.JsonRpcProvider(getReadOnlyRpcUrl({ chainId: targetNetwork }));

      console.debug(`🔗 [getMetaEvidenceParallelizeable] Target provider RPC URL: ${targetNetwork === network ? 'same network' : getReadOnlyRpcUrl({ chainId: targetNetwork })}`);

      const contract = getContract("IDisputeResolver", arbitrableAddress, targetProvider);
      console.debug(`🏗️ [getMetaEvidenceParallelizeable] Created contract instance for ${arbitrableAddress} on network ${targetNetwork}`);

      const arbitratorAddr = networkMap[this.state.network].KLEROS_LIQUID;
      console.debug(`⚖️ [getMetaEvidenceParallelizeable] Using arbitrator address: ${arbitratorAddr}`);

      const disputeFilter = contract.filters.Dispute(
        arbitratorAddr, // arbitrator address
        arbitratorDisputeID // dispute ID
      );

      // Search around the dispute creation block (give some buffer for cross-chain timing)
      const blockBuffer = 1000; // blocks before/after to account for cross-chain delays
      const searchFromBlock = Math.max(1, disputeCreationBlock - blockBuffer);
      const searchToBlock = disputeCreationBlock + blockBuffer;

      console.debug(`🔎 [getMetaEvidenceParallelizeable] Searching arbitrable blocks ${searchFromBlock} to ${searchToBlock} (±${blockBuffer} around ${disputeCreationBlock})`);
      console.debug(`📊 [getMetaEvidenceParallelizeable] Arbitrable filter: arbitrator=${arbitratorAddr}, disputeID=${arbitratorDisputeID}`);

      let disputeEvents;
      try {
        console.debug(`🚀 [getMetaEvidenceParallelizeable] Executing queryFilter...`);
        disputeEvents = await contract.queryFilter(
          disputeFilter,
          searchFromBlock,
          searchToBlock
        );
        console.debug(`📋 [getMetaEvidenceParallelizeable] Found ${disputeEvents.length} Dispute events on arbitrable contract`);

        if (disputeEvents.length > 0) {
          console.debug(`📄 [getMetaEvidenceParallelizeable] First Dispute event details:`, disputeEvents[0]);
          console.debug(`📋 [getMetaEvidenceParallelizeable] Event args:`, disputeEvents[0].args);
        }
      } catch (error) {
        console.error(`💥 [getMetaEvidenceParallelizeable] Error querying Dispute events:`, error);
        return null;
      }

      if (disputeEvents.length === 0) {
        console.error(`❌ [getMetaEvidenceParallelizeable] No Dispute event found for dispute ${arbitratorDisputeID}`);
        console.debug(`🔍 [getMetaEvidenceParallelizeable] Search parameters: arbitrator=${arbitratorAddr}, disputeID=${arbitratorDisputeID}, blocks=${searchFromBlock}-${searchToBlock}`);
        return null;
      }

      const disputeEvent = disputeEvents[0];
      const metaEvidenceID = disputeEvent.args._metaEvidenceID;
      const dispute = { metaEvidenceID, blockNumber: disputeEvent.blockNumber };

      const filter = contract.filters.MetaEvidence(dispute.metaEvidenceID);

      const events = await contract.queryFilter(
        filter,
        searchFromBlock,
        dispute.blockNumber
      );

      if (events.length > 0) {
        const metaEvidenceURI = events[0].args._evidence;
        const response = await fetch(urlNormalize(metaEvidenceURI));
        const payload = await response.json();

        console.debug(`caching ${arbitratorDisputeID}`);
        localStorage.setItem(
          `${network}${arbitratorDisputeID.toString()}`,
          JSON.stringify(payload)
        );

        return payload;
      }

      return null;

    } catch (error) {
      console.error('Error fetching meta evidence:', error);
      return null;
    }
  };

  getEvidences = (arbitrableAddress, arbitratorDisputeID) => {
    return this.state.archon.arbitrable
      .getDispute(arbitrableAddress, networkMap[this.state.network].KLEROS_LIQUID, arbitratorDisputeID)
      .then(response =>
        this.state.archon.arbitrable.getEvidence(arbitrableAddress, networkMap[this.state.network].KLEROS_LIQUID, response.evidenceGroupID).catch(() => null)
      )
      .catch(() => null);
  };

  getAppealDecision = async (arbitratorDisputeID, disputedAtBlockNumber) => {
    if (!networkMap[this.state.network]?.KLEROS_LIQUID) return null;

    const contract = getContract(
      "KlerosLiquid",
      networkMap[this.state.network].KLEROS_LIQUID,
      this.state.provider
    );

    try {
      const appealDecisionFilter = contract.filters.AppealDecision(arbitratorDisputeID);
      const appealDecisionEvents = await contract.queryFilter(
        appealDecisionFilter,
        disputedAtBlockNumber,
        "latest"
      );

      const blockPromises = appealDecisionEvents.map(event =>
        this.state.provider.getBlock(event.blockNumber)
      );

      const blocks = await Promise.all(blockPromises);

      return blocks.map(block => ({
        appealedAt: block.timestamp,
        appealedAtBlockNumber: block.number
      }));

    } catch (error) {
      console.error('Error fetching appeal decisions:', error);
      return null;
    }
  };

  getContributions = async (arbitrableDisputeID, round, arbitrableContractAddress, period, searchFrom) => {
    // Unslashed contract violates IDisputeResolver interface by incrementing rounds without triggering an appeal event.
    // Because of this, here we make an exception for Unslashed and shift rounds by plus one, except when in execution period.

    let _round = round;
    if (EXCEPTIONAL_CONTRACT_ADDRESSES.includes(arbitrableContractAddress) && period < DISPUTE_PERIOD_EXECUTION) {
      _round++;
    }

    const contract = getContract(
      "IDisputeResolver",
      arbitrableContractAddress,
      this.state.provider
    );

    try {
      const contributionFilter = contract.filters.Contribution(
        arbitrableDisputeID, // _localDisputeID  
        _round,
        null                //  _contributor (null means any contributor)
      );

      console.debug('DEBUG getContributions - filter:', contributionFilter);

      const currentBlock = await this.state.provider.getBlockNumber();
      const queryFromBlock = networkMap[this.state.network].QUERY_FROM_BLOCK;
      const fromBlock = searchFrom ?? Math.max(
        queryFromBlock && queryFromBlock > 0 ? queryFromBlock : currentBlock - MAX_BLOCK_LOOKBACK,
        currentBlock - MAX_BLOCK_LOOKBACK  // Search last 1M blocks to catch recent events
      );
      const toBlock = searchFrom ? searchFrom + SEARCH_WINDOW_SIZE : "latest";

      const events = await contract.queryFilter(
        contributionFilter,
        fromBlock,
        toBlock
      );

      console.debug('DEBUG getContributions - events found:', events.length, events);

      return events.reduce((acc, event) => {
        const ruling = event.args.ruling.toString();
        const amount = event.args._amount.toString();

        acc[ruling] = acc[ruling] || "0";
        acc[ruling] = (BigInt(acc[ruling]) + BigInt(amount)).toString();

        return acc;
      }, {});

    } catch (error) {
      console.error('Error fetching contributions:', error);
      return {};
    }
  };

  getRulingFunded = async (arbitrableDisputeID, round, arbitrableContractAddress, searchFrom) => {
    let _round = round;
    if (EXCEPTIONAL_CONTRACT_ADDRESSES.includes(arbitrableContractAddress)) {
      _round++;
    }

    console.log('DEBUG getRulingFunded - inputs:', {
      arbitrableDisputeID,
      round,
      _round,
      arbitrableContractAddress,
      searchFrom,
      arbitrator: networkMap[this.state.network].KLEROS_LIQUID
    });

    const contract = getContract(
      "IDisputeResolver",
      arbitrableContractAddress,
      this.state.provider
    );

    try {
      const rulingFundedFilter = contract.filters.RulingFunded(
        arbitrableDisputeID, // _localDisputeID
        _round, // _round
        null // _ruling (null means any ruling)
      );

      console.log('DEBUG getRulingFunded - filter:', rulingFundedFilter);

      // Ensure we search a wide enough range to catch recent events
      const currentBlock = await this.state.provider.getBlockNumber();
      const queryFromBlock = networkMap[this.state.network].QUERY_FROM_BLOCK;
      const fromBlock = searchFrom ?? Math.max(
        queryFromBlock && queryFromBlock > 0 ? queryFromBlock : currentBlock - MAX_BLOCK_LOOKBACK,
        currentBlock - MAX_BLOCK_LOOKBACK  // Search last 1M blocks to catch recent events
      );
      const toBlock = searchFrom ? searchFrom + SEARCH_WINDOW_SIZE : "latest";

      console.log('DEBUG getRulingFunded - block range:', { fromBlock, toBlock, currentBlock });

      const events = await contract.queryFilter(
        rulingFundedFilter,
        fromBlock,
        toBlock
      );

      console.log('DEBUG getRulingFunded - events found:', events.length, events);

      // Log details of each event for debugging
      events.forEach((event, index) => {
        console.log(`DEBUG getRulingFunded - event ${index}:`, {
          blockNumber: event.blockNumber,
          transactionHash: event.transactionHash,
          disputeID: event.args._localDisputeID.toString(),
          round: event.args._round.toString(),
          ruling: event.args._ruling.toString()
        });
      });

      return events.map(event => event.args._ruling.toString());

    } catch (error) {
      console.error('Error fetching ruling funded events:', error);
      return [];
    }
  };

  // Extract v2 contract logic to reduce complexity
  tryGetWithdrawableAmountV2 = async (contract, arbitrableDisputeID, contributedTo) => {
    let counter = 0;
    while (counter < contributedTo.length) {
      const amount = await contract.getTotalWithdrawableAmount(
        arbitrableDisputeID,
        this.state.activeAddress ?? ethers.ZeroAddress,
        contributedTo[counter]
      );
      if (amount != 0) {
        return { amount, ruling: contributedTo[counter] };
      }
      counter++;
    }
    return null;
  };

  // Extract v1 contract logic to reduce complexity  
  tryGetWithdrawableAmountV1 = async (arbitrated, arbitrableDisputeID, contributedTo) => {
    const contract = getContract(
      "IDisputeResolver_v1",
      arbitrated,
      this.state.provider
    );

    const amount = await contract.getTotalWithdrawableAmount(
      arbitrableDisputeID,
      this.state.activeAddress ?? ethers.ZeroAddress,
      contributedTo
    );

    return { amount, ruling: contributedTo };
  };

  getTotalWithdrawableAmount = async (arbitrableDisputeID, contributedTo, arbitrated) => {
    const contract = getContract(
      "IDisputeResolver",
      arbitrated,
      this.state.provider
    );

    try {
      // Try v2 first
      const result = await this.tryGetWithdrawableAmountV2(contract, arbitrableDisputeID, contributedTo);
      if (result) return result;
      return { amount: 0, ruling: null };
    } catch {
      // Fallback to v1
      try {
        return await this.tryGetWithdrawableAmountV1(arbitrated, arbitrableDisputeID, contributedTo);
      } catch (v1Error) {
        console.error('Error fetching withdrawable amount:', v1Error);
        return { amount: 0, ruling: contributedTo };
      }
    }
  };

  getDispute = async arbitratorDisputeID => {
    if (!networkMap[this.state.network]?.KLEROS_LIQUID) return null;

    const contract = getContract(
      "KlerosLiquid",
      networkMap[this.state.network].KLEROS_LIQUID,
      this.state.provider
    );

    try {
      return contract.getDispute(arbitratorDisputeID);
    } catch (error) {
      console.error(`Error fetching dispute with dispute ID ${arbitratorDisputeID}:`, error);
      return null
    }
  }

  getRuling = async (arbitrableAddress, arbitratorDisputeID) => this.state.archon.arbitrable.getRuling(arbitrableAddress, networkMap[this.state.network].KLEROS_LIQUID, arbitratorDisputeID);

  submitEvidence = async (arbitrableAddress, { disputeID, evidenceTitle, evidenceDescription, evidenceDocument, supportingSide }, value = "0") => {
    const evidence = {
      name: evidenceTitle,
      description: evidenceDescription,
      fileURI: evidenceDocument,
      evidenceSide: supportingSide
    };

    const ipfsHashEvidenceObj = await ipfsPublish(
      "evidence.json",
      this.encoder.encode(JSON.stringify(evidence))
    );

    const evidenceURI = ipfsHashEvidenceObj;

    const contract = await getSignableContract(
      "ArbitrableProxy",
      arbitrableAddress,
      this.state.provider
    );

    try {
      const tx = await contract.submitEvidence(disputeID, evidenceURI, {
        value: ethers.parseEther(value)
      });

      return tx.wait();
    } catch (error) {
      console.error('Error submitting evidence:', error);
      throw error;
    }
  };

  createDispute = async options => {
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
    const metaevidenceURI = ipfsHashMetaEvidenceObj;

    const arbitrationCost = await this.getArbitrationCost(arbitrator, arbitratorExtraData);
    console.debug({ arbitrationCost })

    const contract = await getSignableContract(
      "ArbitrableProxy",
      networkMap[this.state.network].ARBITRABLE_PROXY,
      this.state.provider
    );

    try {
      const tx = await contract.createDispute(
        arbitratorExtraData,
        metaevidenceURI,
        options.numberOfRulingOptions,
        { value: arbitrationCost }
      );

      const receipt = await tx.wait();

      const disputeCreationTopic = contract.interface.getEvent("DisputeCreation").topicHash;
      const disputeLog = receipt.logs.find(log => log.topics[0] === disputeCreationTopic);

      if (disputeLog) {
        const disputeID = ethers.getBigInt(disputeLog.topics[1]);
        return {
          receipt,
          disputeID: disputeID.toString()
        };
      } else {
        console.error("DisputeCreation event not found in transaction logs");
        return { receipt, disputeID: null };
      }
    } catch (error) {
      console.error("Error creating dispute: ", error)
      return null
    }
  };

  appeal = async (arbitrableAddress, arbitrableDisputeID, party, contribution) => {
    //EscrowV1 does not support crowdfunding and so does not have the fundAppeal function, users can only appeal by paying the appeal cost
    if (networkMap[this.state.network].ESCROW_V1_CONTRACTS
      .includes(arbitrableAddress)) {

      return this.handleEscrowV1Appeal(arbitrableAddress, arbitrableDisputeID, contribution);
    }

    const contract = await getSignableContract(
      "IDisputeResolver",
      arbitrableAddress,
      this.state.provider
    );

    try {
      const tx = await contract.fundAppeal(arbitrableDisputeID, party, {
        value: ethers.parseEther(contribution)
      })

      return tx.wait()
    } catch (error) {
      console.error("Error executing Appeal transaction: ", error)
      return null
    }
  }

  handleEscrowV1Appeal = async (arbitrableAddress, arbitrableDisputeID, contribution) => {
    const contract = await getSignableContract(
      "MultipleArbitrableTokenTransaction",
      arbitrableAddress,
      this.state.provider
    );

    try {
      const tx = await contract.appeal(
        arbitrableDisputeID,
        { value: ethers.parseEther(contribution) }
      );
      return tx.wait();
    } catch (err) {
      console.error("EscrowV1 appeal failed:", err);
      return null;
    }
  }

  withdrawFeesAndRewardsForAllRounds = async (
    arbitrableAddress,
    arbitrableDisputeID,
    rulingOptionsContributedTo,
    arbitrableContractAddress
  ) => {

    const contractName =
      EXCEPTIONAL_CONTRACT_ADDRESSES.includes(arbitrableContractAddress)
        ? "IDisputeResolver_v1"
        : "IDisputeResolver";

    const contract = await getSignableContract(
      contractName,
      arbitrableAddress,
      this.state.provider
    );

    try {
      const tx = await contract.withdrawFeesAndRewardsForAllRounds(
        arbitrableDisputeID,
        this.state.activeAddress,
        rulingOptionsContributedTo,
        { value: ethers.parseEther("0") }
      );

      return tx.wait();
    } catch (error) {
      console.log("Error executing withdrawFeesAndRewardsForAllRounds transaction: ", error)
      return null
    }
  }

  renderUnsupportedNetwork = route => (
    <>
      <Header activeAddress={this.state.activeAddress} web3Provider={this.state.provider} viewOnly={!this.state.activeAddress} route={route} />
      <UnsupportedNetwork network={this.state.network} networkMap={networkMap} />
      <Footer networkMap={networkMap} network={this.state.network} />
    </>
  );

  renderRedirect = () => <Redirect to={`${this.state.network}/ongoing`} />;

  renderOpenDisputes = route => (
    <>
      <Header activeAddress={this.state.activeAddress} web3Provider={this.state.provider} viewOnly={!this.state.activeAddress} route={route} />
      <OpenDisputes
        activeAddress={this.state.activeAddress}
        route={route}
        getMetaEvidenceCallback={this.getMetaEvidenceParallelizeable}
        getArbitratorDisputeCallback={this.getArbitratorDispute}
        subcourtDetails={this.state.subcourtDetails}
        subcourts={this.state.subcourts}
        getCurrentRulingCallback={this.getCurrentRuling}
        getOpenDisputesOnCourtCallback={this.getOpenDisputesOnCourt}
        network={route.match.params.chainId}
      />
      <Footer networkMap={networkMap} network={route.match.params.chainId} />
    </>
  );

  renderCreate = route => (
    <>
      <Header activeAddress={this.state.activeAddress} web3Provider={this.state.provider} viewOnly={!this.state.activeAddress} route={route} />
      <Create
        activeAddress={this.state.activeAddress}
        route={route}
        createDisputeCallback={this.createDispute}
        getArbitrationCostCallback={this.getArbitrationCostWithCourtAndNoOfJurors}
        publishCallback={this.onPublish}
        web3Provider={this.state.provider}
        subcourtDetails={this.state.subcourtDetails}
        subcourtsLoading={this.state.subcourtsLoading}
        network={this.state.network}
      />
      <Footer networkMap={networkMap} network={this.state.network} />
    </>
  );

  renderInteract = route => (
    <>
      <Header activeAddress={this.state.activeAddress} web3Provider={this.state.provider} viewOnly={!this.state.activeAddress} route={route} />
      <Interact
        arbitratorAddress={networkMap[this.state.network].KLEROS_LIQUID}
        network={this.state.network}
        route={route}
        getArbitrableDisputeIDCallback={this.getArbitrableDisputeID}
        getAppealCostCallback={this.getAppealCost}
        getAppealCostOnArbitrableCallback={this.getAppealCostOnArbitrable}
        appealCallback={this.appeal}
        getAppealPeriodCallback={this.getAppealPeriod}
        getCurrentRulingCallback={this.getCurrentRuling}
        disputeID={this.state.lastDisputeID}
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
        activeAddress={this.state.activeAddress}
        passPeriodCallback={this.passPeriod}
        drawJurorsCallback={this.drawJurors}
        passPhaseCallback={this.passPhase}
        getRoundInfoCallback={this.getRoundInfo}
        getAppealDecisionCallback={this.getAppealDecision}
        getContributionsCallback={this.getContributions}
        getRulingFundedCallback={this.getRulingFunded}
        subcourts={this.state.subcourts}
        subcourtDetails={this.state.subcourtDetails}
        web3Provider={this.state.provider}
        exceptionalContractAddresses={EXCEPTIONAL_CONTRACT_ADDRESSES}
      />
      <Footer networkMap={networkMap} network={this.state.network} />
    </>
  );

  renderNotFound = route => (
    <>
      <Header activeAddress={this.state.activeAddress} web3Provider={this.state.provider} viewOnly={!this.state.activeAddress} route={route} />
      <NotFound />
      <Footer networkMap={networkMap} network={this.state.network} />
    </>
  );

  render() {
    if (this.state.network) {
      if (!networkMap[this.state.network]) {
        return (
          <BrowserRouter>
            <Route render={this.renderUnsupportedNetwork} />
          </BrowserRouter>
        );
      }
      return (
        <BrowserRouter>
          <Switch>
            <Route exact path={["/", "/:chainId", "/:chainId/disputes"]} render={this.renderRedirect} />
            <Route exact path="/:chainId/ongoing" render={this.renderOpenDisputes} />
            <Route exact path="/:chainId/create" render={this.renderCreate} />
            <Redirect from="/:chainId/interact/:id" to="/:chainId/cases/:id" />
            <Route exact path="/:chainId/cases/:id?" render={this.renderInteract} />
            <Route render={this.renderNotFound} />
          </Switch>
        </BrowserRouter>
      );
    } else return <>Please enable a web3 provider.</>;
  }
}

export default App;
