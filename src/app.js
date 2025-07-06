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

import * as EthereumInterface from "./ethereum/interface";
import networkMap, { getReadOnlyRpcUrl } from "./ethereum/network-contract-mapping";
import ipfsPublish from "./ipfs-publish";
import Archon from "@kleros/archon";
import UnsupportedNetwork from "./components/unsupportedNetwork";
import { urlNormalize } from "./urlNormalizer";

// Constants to avoid magic numbers
const HEX_PADDING_WIDTH = 64;
const BLOCK_SEARCH_RANGE = 1_000_000;
const BLOCK_SEARCH_WINDOW = 100_000;
const DISPUTE_PERIOD_EXECUTION = 4;

const IPFS_GATEWAY = "https://cdn.kleros.link";
const EXCEPTIONAL_CONTRACT_ADDRESSES = ['0xe0e1bc8C6cd1B81993e2Fcfb80832d814886eA38', '0xb9f9B5eee2ad29098b9b3Ea0B401571F5dA4AD81']
const CACHE_INVALIDATION_PERIOD_FOR_SUBCOURTS_MS = 3 * 60 * 60 * 1000
const CACHE_INVALIDATION_PERIOD_FOR_DISPUTES_MS = 1 * 60 * 1000

const safeJSONStringify = obj => {
  return JSON.stringify(obj, (_, value) => {
    if (typeof value === 'bigint') {
      return value.toString();
    }
    if (value && typeof value === 'object' && value._isBigNumber) {
      return value.toString();
    }
    if (value && typeof value === 'object' && typeof value.toString === 'function' && (value.type === 'BigNumber' || value._hex !== undefined)) {
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

  loadSubcourtData = async () => {
    const { network } = this.state;

    console.debug(`Loading subcourts for network: ${network}`);

    const parsedSubcourts = safeLocalStorageGet(`${network}Subcourts`);
    const parsedSubcourtDetails = safeLocalStorageGet(`${network}SubcourtDetails`);
    const lastModified = localStorage.getItem(`${network}LastModified`);

    // Check cache validity
    if (lastModified &&
      parsedSubcourts &&
      parsedSubcourtDetails &&
      parsedSubcourts.length > 0 &&
      parsedSubcourtDetails.length > 0 &&
      new Date().getTime() < CACHE_INVALIDATION_PERIOD_FOR_SUBCOURTS_MS + parseInt(lastModified, 10)) {
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

    let counter = 0, subcourts = [], subcourtURIs = [];

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

    this.setState({
      subcourtDetails: await Promise.all(subcourtURIs.map(promise => promise.then(subcourtURI => {
        console.log({ subcourtURI })
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

    const contract = EthereumInterface.getContract(
      "KlerosLiquid",
      networkMap[this.state.network].KLEROS_LIQUID,
      this.state.provider
    );

    const currentBlock = await this.state.provider.getBlockNumber();
    const startingBlock = Math.max(0, currentBlock - BLOCK_SEARCH_RANGE);

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
    const contract = EthereumInterface.getContract(
      "IDisputeResolver",
      arbitrableAddress,
      this.state.provider
    );

    try {
      return await contract.externalIDtoLocalID.staticCall(arbitratorDisputeID);
    } catch (error) {
      console.error(`Error fetching dispute ID for arbitrabe ${arbitrableAddress}:`, error);
      return null;
    }
  }

  getArbitrationCost = async (arbitratorAddress, extraData) => {
    const contract = EthereumInterface.getContract(
      "IArbitrator",
      arbitratorAddress,
      this.state.provider
    );

    try {
      return await contract.arbitrationCost(extraData)
    } catch (error) {
      console.error(`Error fetching arbitration cost for arbitrator ${arbitratorAddress}:`, error);
      return null;
    }
  }

  getArbitrationCostWithCourtAndNoOfJurors = async (subcourtID, noOfJurors) => {
    if (!networkMap[this.state.network]?.KLEROS_LIQUID) return null;

    const contract = EthereumInterface.getContract(
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
      const contract = EthereumInterface.getContract(
        "KlerosLiquid",
        networkMap[this.state.network].KLEROS_LIQUID,
        this.state.provider
      );

      return await contract.getSubcourt.estimateGas(subcourtID);
    } catch (error) {
      console.warn(`Error estimating gas for subcourt ${subcourtID}:`, error);
      throw error;
    }
  };

  getSubcourt = async subcourtID => {
    if (!networkMap[this.state.network]?.KLEROS_LIQUID) return null;

    const contract = EthereumInterface.getContract(
      "KlerosLiquid",
      networkMap[this.state.network].KLEROS_LIQUID,
      this.state.provider
    );

    try {
      return await contract.getSubcourt(subcourtID);
    } catch (error) {
      console.error("Error fetching subcourt details: ", error)
      return null;
    }
  };

  getSubCourtDetails = async subcourtID => {
    if (!networkMap[this.state.network]?.POLICY_REGISTRY) return null;

    const contract = EthereumInterface.getContract(
      "PolicyRegistry",
      networkMap[this.state.network].POLICY_REGISTRY,
      this.state.provider
    );

    try {
      return await contract.policies(subcourtID);
    } catch (error) {
      console.error(`Error fetching subcourt details for court ${subcourtID}:`, error);
      return null;
    }
  };

  getArbitratorDispute = async arbitratorDisputeID => {
    if (!networkMap[this.state.network]?.KLEROS_LIQUID) return null;

    const contract = EthereumInterface.getContract(
      "KlerosLiquid",
      networkMap[this.state.network].KLEROS_LIQUID,
      this.state.provider
    );

    try {
      return await contract.disputes(arbitratorDisputeID);
    } catch (error) {
      console.error(`Error fetching dispute ${arbitratorDisputeID}:`, error);
      return null;
    }
  };

  getArbitratorDisputeDetails = async arbitratorDisputeID => {
    if (!networkMap[this.state.network]?.KLEROS_LIQUID) return null;

    const contract = EthereumInterface.getContract(
      "KlerosLiquid",
      networkMap[this.state.network].KLEROS_LIQUID,
      this.state.provider
    );

    try {
      return await contract.getDispute(arbitratorDisputeID);
    } catch (error) {
      console.error(`Error fetching dispute details ${arbitratorDisputeID}:`, error);
      return null;
    }
  }

  getMultipliers = async arbitrableAddress => {
    const contract = EthereumInterface.getContract(
      "IDisputeResolver",
      arbitrableAddress,
      this.state.provider
    );

    try {
      return await contract.getMultipliers()
    } catch (error) {
      console.error(`Error fetching multipliers for arbitrable ${arbitrableAddress}:`, error);
      return null
    }
  }


  onPublish = async (filename, fileBuffer) => await ipfsPublish(filename, fileBuffer);

  generateArbitratorExtraData = (subcourtID, noOfVotes) => `0x${parseInt(subcourtID, 10).toString(16).padStart(HEX_PADDING_WIDTH, "0") + parseInt(noOfVotes, 10).toString(16).padStart(HEX_PADDING_WIDTH, "0")}`;

  getAppealCost = async arbitratorDisputeID => {
    if (!networkMap[this.state.network]?.KLEROS_LIQUID) return null;

    const contract = EthereumInterface.getContract(
      "IArbitrator",
      networkMap[this.state.network].KLEROS_LIQUID,
      this.state.provider
    );

    try {
      return await contract.appealCost(arbitratorDisputeID, ethers.ZeroHash);
    } catch (error) {
      console.error(`Error fetching appeal cost for dispute ID ${arbitratorDisputeID}:`, error);
      return null
    }
  }

  getAppealCostOnArbitrable = async (arbitrableDisputeID, ruling) => {
    if (!networkMap[this.state.network]?.ARBITRABLE_PROXY) return null;

    const contract = EthereumInterface.getContract(
      "IDisputeResolver",
      networkMap[this.state.network].ARBITRABLE_PROXY,
      this.state.provider
    );

    try {
      return await contract.appealCost(arbitrableDisputeID, ruling);
    } catch (error) {
      console.error(`Error fetching appeal cost for dispute ID ${arbitrableDisputeID}:`, error);
      return null;
    }
  }

  getAppealPeriod = async arbitratorDisputeID => {
    if (!networkMap[this.state.network]?.KLEROS_LIQUID) return null;

    const contract = EthereumInterface.getContract(
      "KlerosLiquid",
      networkMap[this.state.network].KLEROS_LIQUID,
      this.state.provider
    );

    try {
      return await contract.appealPeriod(arbitratorDisputeID);
    } catch (error) {
      console.error(`Error fetching appeal period for dispute ID ${arbitratorDisputeID}:`, error);
      return null;
    }
  }

  getCurrentRuling = async arbitratorDisputeID => {
    if (!networkMap[this.state.network]?.KLEROS_LIQUID) return null;

    const contract = EthereumInterface.getContract(
      "KlerosLiquid",
      networkMap[this.state.network].KLEROS_LIQUID,
      this.state.provider
    );

    try {
      return await contract.currentRuling(arbitratorDisputeID);
    } catch (error) {
      console.error(`Error fetching current ruling for dispute ID ${arbitratorDisputeID}:`, error);
      return null;
    }
  }

  getDisputeEvent = async (arbitrableAddress, disputeID) => await this.state.archon.arbitrable.getDispute(arbitrableAddress, // arbitrable contract address
    networkMap[this.state.network].KLEROS_LIQUID, // arbitrator contract address
    disputeID // dispute unique identifier
  );

  getMetaEvidence = async (arbitrableAddress, arbitratorDisputeID) => {
    try {
      const dispute = await this.state.archon.arbitrable.getDispute(
        arbitrableAddress,
        networkMap[this.state.network].KLEROS_LIQUID,
        arbitratorDisputeID
      );
      console.log({ dispute })

      const scriptParameters = {
        disputeID: arbitratorDisputeID,
        arbitrableContractAddress: arbitrableAddress,
        arbitratorContractAddress: networkMap[this.state.network].KLEROS_LIQUID,
        arbitratorChainID: this.state.network,
        chainID: this.state.network,
        arbitratorJsonRpcUrl: networkMap[this.state.network].WEB3_PROVIDER,
      };

      const options = {
        strict: true,
        getJsonRpcUrl: chainId => getReadOnlyRpcUrl({ chainId }),
        scriptParameters
      };

      return await this.state.archon.arbitrable.getMetaEvidence(
        arbitrableAddress,
        dispute.metaEvidenceID,
        options
      );

    } catch (error) {
      console.error('Error fetching meta evidence:', error);
      return null;
    }
  };

  // Using Archon, parallel calls occasionally fail.
  getMetaEvidenceParallelizeable = async (arbitrableAddress, arbitratorDisputeID) => {
    const { network } = this.state;

    const item = localStorage.getItem(`${network}${arbitratorDisputeID.toString()}`);
    if (item && item !== "undefined") {
      console.debug(`Found metaevidence of ${arbitratorDisputeID} skipping fetch.`);
      return JSON.parse(item);
    }
    console.debug(`Fetching ${arbitratorDisputeID}...`);

    try {
      const dispute = await this.state.archon.arbitrable.getDispute(
        arbitrableAddress,
        networkMap[this.state.network].KLEROS_LIQUID,
        arbitratorDisputeID
      );

      const contract = EthereumInterface.getContract(
        "IEvidence",
        arbitrableAddress,
        this.state.provider
      );

      const filter = contract.filters.MetaEvidence(dispute.metaEvidenceID);
      const events = await contract.queryFilter(
        filter,
        networkMap[this.state.network].QUERY_FROM_BLOCK,
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

    const contract = EthereumInterface.getContract(
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

    const contract = EthereumInterface.getContract(
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
      const fromBlock = searchFrom ?? Math.max(
        networkMap[this.state.network].QUERY_FROM_BLOCK || 0,
        currentBlock - BLOCK_SEARCH_RANGE  // Search last 1M blocks to catch recent events
      );
      const toBlock = searchFrom ? searchFrom + BLOCK_SEARCH_WINDOW : "latest";

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

    const contract = EthereumInterface.getContract(
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
      const fromBlock = searchFrom ?? Math.max(
        networkMap[this.state.network].QUERY_FROM_BLOCK || 0,
        currentBlock - BLOCK_SEARCH_RANGE  // Search last 1M blocks to catch recent events
      );
      const toBlock = searchFrom ? searchFrom + BLOCK_SEARCH_WINDOW : "latest";

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

  getTotalWithdrawableAmount = async (arbitrableDisputeID, contributedTo, arbitrated) => {
    let amount = 0;

    let contract = EthereumInterface.getContract(
      "IDisputeResolver",
      arbitrated,
      this.state.provider
    )
    try {
      // targeting v2;
      let counter = 0;

      while (counter < contributedTo.length) {
        amount = await contract.getTotalWithdrawableAmount(
          arbitrableDisputeID,
          this.state.activeAddress ?? ethers.ZeroAddress,
          contributedTo[counter]
        );

        if (amount != 0) break;
        counter++;
      }

      return { amount, ruling: contributedTo[counter] };
    } catch {
      // targeting v1
      contract = EthereumInterface.getContract(
        "IDisputeResolver_v1",
        arbitrated,
        this.state.provider
      )
      try {
        amount = await contract.getTotalWithdrawableAmount(
          arbitrableDisputeID,
          this.state.activeAddress ?? ethers.ZeroAddress,
          contributedTo
        );

        return { amount, ruling: contributedTo };
      } catch (v1Error) {
        console.error('Error fetching withdrawable amount:', v1Error);
        return { amount: 0, ruling: contributedTo };
      }
    }
  };

  getDispute = async arbitratorDisputeID => {
    if (!networkMap[this.state.network]?.KLEROS_LIQUID) return null;

    const contract = EthereumInterface.getContract(
      "KlerosLiquid",
      networkMap[this.state.network].KLEROS_LIQUID,
      this.state.provider
    );

    try {
      return await contract.getDispute(arbitratorDisputeID);
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

    const contract = await EthereumInterface.getSignableContract(
      "ArbitrableProxy",
      arbitrableAddress,
      this.state.provider
    );

    try {
      const tx = await contract.submitEvidence(disputeID, evidenceURI, {
        value: ethers.parseEther(value)
      });

      return await tx.wait();
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

    const contract = await EthereumInterface.getSignableContract(
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
    const contract = await EthereumInterface.getSignableContract(
      "IDisputeResolver",
      arbitrableAddress,
      this.state.provider
    );

    try {
      const tx = await contract.fundAppeal(arbitrableDisputeID, party, {
        value: ethers.parseEther(contribution)
      })

      return await tx.wait()
    } catch (error) {
      console.error("Error executing Appeal transaction: ", error)
      return null
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

    const contract = await EthereumInterface.getSignableContract(
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

      return await tx.wait();
    } catch (error) {
      console.log("Error executing withdrawFeesAndRewardsForAllRounds transaction: ", error)
      return null
    }
  }

  renderUnsupportedNetwork = route => (
    <>
      <Header viewOnly={!this.state.activeAddress} route={route} />
      <UnsupportedNetwork network={this.state.network} networkMap={networkMap} />
      <Footer networkMap={networkMap} network={this.state.network} />
    </>
  );

  renderRedirect = () => <Redirect to={`${this.state.network}/ongoing`} />;

  renderOpenDisputes = route => (
    <>
      <Header viewOnly={!this.state.activeAddress} route={route} />
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
      <Header viewOnly={!this.state.activeAddress} route={route} />
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
      <Header viewOnly={!this.state.activeAddress} route={route} />
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
      <Header viewOnly={!this.state.activeAddress} route={route} />
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
