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
import networkMap, { getReadOnlyRpcUrl, isTestnet } from "./ethereum/network-contract-mapping";
import ipfsPublish from "./ipfs-publish";
import Archon from "@kleros/archon";
import UnsupportedNetwork from "./components/unsupportedNetwork";
import { urlNormalize } from "./urlNormalizer";
import { fetchDataFromScript } from "./utils";

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

  //Testnets have lower limits due to RPC restrictions
  getMaxLookback = () => networkMap[this.state.network]?.MAX_LOOKBACK || MAX_BLOCK_LOOKBACK;

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
    const startingBlock = Math.max(0, currentBlock - this.getMaxLookback());

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
      const fromBlock = Math.max(deploymentBlock, currentBlock - this.getMaxLookback());

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

  getDisputeEvent = async (arbitrableAddress, disputeID) => {
    const fromBlock = isTestnet(this.state.network) ? Math.max(0, await this.state.provider.getBlockNumber() - this.getMaxLookback()) : 0;
    return this.state.archon.arbitrable.getDispute(arbitrableAddress, networkMap[this.state.network].KLEROS_LIQUID, disputeID, { fromBlock }
    );
  }

  processDynamicScript = async (metaEvidenceJSON, chainID, disputeId, arbitrated, arbitrator) => {
    const scriptURI =
      chainID === "1" && disputeId === "1621"
        ? urlNormalize("/ipfs/Qmf1k727vP7qZv21MDB8vwL6tfVEKPCUQAiw8CTfHStkjf")
        : urlNormalize(metaEvidenceJSON.dynamicScriptURI);

    console.info("🧾 [getMetaEvidence] Fetching dynamic script file at", scriptURI);

    const fileResponse = await fetch(scriptURI);
    if (!fileResponse.ok) {
      console.error(`💥 [getMetaEvidence] Unable to fetch dynamic script file at ${scriptURI}.`);
      return null;
    }
    const scriptData = await fileResponse.text();

    const injectedParameters = {
      arbitratorChainID: metaEvidenceJSON.arbitratorChainID || chainID,
      arbitrableChainID: metaEvidenceJSON.arbitrableChainID || chainID,
      disputeID: disputeId,
      arbitrableContractAddress: arbitrated,
    };

    injectedParameters.arbitratorJsonRpcUrl =
      injectedParameters.arbitratorJsonRpcUrl || getReadOnlyRpcUrl({ chainId: injectedParameters.arbitratorChainID });
    injectedParameters.arbitrableChainID = injectedParameters.arbitrableChainID || arbitrator;
    injectedParameters.arbitrableJsonRpcUrl =
      injectedParameters.arbitrableJsonRpcUrl || getReadOnlyRpcUrl({ chainId: injectedParameters.arbitrableChainID });

    if (injectedParameters.arbitratorChainID !== undefined && injectedParameters.arbitratorJsonRpcUrl === undefined) {
      console.warn(`Could not obtain a valid 'arbitratorJsonRpcUrl' for chain ID ${injectedParameters.arbitratorChainID}`);
    }

    if (injectedParameters.arbitrableChainID !== undefined && injectedParameters.arbitrableJsonRpcUrl === undefined) {
      console.warn(`Could not obtain a valid 'arbitrableJsonRpcUrl' for chain ID ${injectedParameters.arbitrableChainID}`);
    }

    return fetchDataFromScript(scriptData, injectedParameters);
  };

  getMetaEvidence = async (arbitrated, disputeId) => {
    const chainID = this.state.network;
    const arbitrator = networkMap[this.state.network].KLEROS_LIQUID;
    const startTime = Date.now();
    const maxTime = 120000;
    const waitTime = 5000;

    while (Date.now() - startTime < maxTime) {
      try {
        const metaEvidenceUriData = await fetch(
          `${process.env.REACT_APP_METAEVIDENCE_URL}?chainId=${chainID}&disputeId=${disputeId}`
        ).then(response => response.json());

        const uri = metaEvidenceUriData.metaEvidenceUri;
        if (!uri) {
          console.error(`💥 [getMetaEvidence] No MetaEvidence log for disputeId ${disputeId} on chainID ${chainID}`);
          return null;
        }

        let metaEvidenceJSON = await fetch(urlNormalize(uri)).then(response => response.json());

        const updateDict = {
          evidenceDisplayInterfaceURL: "evidenceDisplayInterfaceURI",
          evidenceDisplayInterfaceURLHash: "evidenceDisplayInterfaceHash",
        };

        for (const [legacyKey, updatedKey] of Object.entries(updateDict)) {
          if (!metaEvidenceJSON[legacyKey]) continue;
          const value = metaEvidenceJSON[legacyKey];
          delete metaEvidenceJSON[legacyKey];
          metaEvidenceJSON[updatedKey] = value;
        }

        if (metaEvidenceJSON.rulingOptions && !metaEvidenceJSON.rulingOptions.type) {
          metaEvidenceJSON.rulingOptions.type = "single-select";
        }

        if (metaEvidenceJSON.dynamicScriptURI) {
          const metaEvidenceEdits = await this.processDynamicScript(metaEvidenceJSON, chainID, disputeId, arbitrated, arbitrator);
          metaEvidenceJSON = { ...metaEvidenceJSON, ...metaEvidenceEdits };
        }

        return { metaEvidenceJSON };
      } catch (err) {
        await new Promise((r) => setTimeout(() => r(), waitTime));
        console.warn(`💥 [getMetaEvidence] Failed to get the evidence:`, err);
      }
    }

    return {
      description:
        "In case you have an AdBlock enabled, please disable it and refresh the page. It may be preventing the correct working of the page. If that's not the case, the data for this case is not formatted correctly or has been tampered since the time of its submission. Please refresh the page and refuse to arbitrate if the problem persists.",
      title: "Invalid or tampered case data, refuse to arbitrate.",
    };
  }

  getMetaEvidenceParallelizeable = async (arbitrableAddress, arbitratorDisputeID) => {
    const { network } = this.state;

    const item = localStorage.getItem(`${network}${arbitratorDisputeID.toString()}`);
    if (item && item !== "undefined") {
      return JSON.parse(item);
    }

    const result = await this.getMetaEvidence(arbitrableAddress, arbitratorDisputeID);

    //Unwrap, cache, and return raw as previous function did
    const metaEvidenceJSON = result?.metaEvidenceJSON;
    if (metaEvidenceJSON) {
      localStorage.setItem(`${network}${arbitratorDisputeID.toString()}`, JSON.stringify(metaEvidenceJSON));
    }

    return metaEvidenceJSON;
  }

  getEvidences = async (arbitrableAddress, arbitratorDisputeID) => {
    const fromBlock = isTestnet(this.state.network) ? Math.max(0, await this.state.provider.getBlockNumber() - this.getMaxLookback()) : 0;
    return this.state.archon.arbitrable
      .getDispute(arbitrableAddress, networkMap[this.state.network].KLEROS_LIQUID, arbitratorDisputeID, { fromBlock })
      .then(response =>
        this.state.archon.arbitrable.getEvidence(arbitrableAddress, networkMap[this.state.network].KLEROS_LIQUID, response.evidenceGroupID, { fromBlock }).catch(() => null)
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
      const maxLookback = this.getMaxLookback();
      const fromBlock = searchFrom ?? Math.max(
        queryFromBlock && queryFromBlock > 0 ? queryFromBlock : currentBlock - maxLookback,
        currentBlock - maxLookback
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
      const maxLookback = this.getMaxLookback();
      const fromBlock = searchFrom ?? Math.max(
        queryFromBlock && queryFromBlock > 0 ? queryFromBlock : currentBlock - maxLookback,
        currentBlock - maxLookback
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

  getRuling = async (arbitrableAddress, arbitratorDisputeID) => {
    const fromBlock = isTestnet(this.state.network) ? Math.max(0, await this.state.provider.getBlockNumber() - this.getMaxLookback()) : 0;
    return this.state.archon.arbitrable.getRuling(arbitrableAddress, networkMap[this.state.network].KLEROS_LIQUID, arbitratorDisputeID, { fromBlock });
  }

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

      const disputeCreationTopic = ethers.id("DisputeCreation(uint256,address)");
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
