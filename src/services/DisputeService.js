/**
 * Dispute Service
 * Handles dispute-specific business logic and orchestrates contract interactions
 * Provides higher-level operations for dispute management
 */

import Archon from "@kleros/archon";
import ipfsPublish from "../ipfs-publish.js";
import { urlNormalize } from "../urlNormalizer.js";
import { 
  BLOCK_SEARCH_RANGE, 
  BLOCK_SEARCH_WINDOW, 
  EXCEPTIONAL_CONTRACT_ADDRESSES,
  DISPUTE_PERIODS,
  CACHE_TTL,
  IPFS_GATEWAY
} from '../constants/blockchain.js';
import { handleUserError, handleContractError, debug } from '../utils/errorHandler.js';
import { BigIntUtils } from '../utils/blockchain.js';
import * as EthereumInterface from '../ethereum/interface.js';
import networkMap from '../ethereum/network-contract-mapping.js';

export class DisputeService {
  constructor(contractService, provider, network) {
    this.contractService = contractService;
    this.provider = provider;
    this.network = network;
    this.networkConfig = networkMap[network];
    this.archon = new Archon(provider, IPFS_GATEWAY);
    this.encoder = new TextEncoder();
  }

  /**
   * Updates the provider and network configuration
   */
  updateProvider(provider, network) {
    this.provider = provider;
    this.network = network;
    this.networkConfig = networkMap[network];
    this.archon = new Archon(provider, IPFS_GATEWAY);
    debug('dispute-service', 'Provider updated', { network });
  }

  /**
   * Creates a complete dispute with metadata
   */
  async createDispute(disputeOptions) {
    try {
      debug('dispute-service', 'Creating dispute', { disputeOptions });

      // Prepare metadata
      const metaevidence = {
        title: disputeOptions.title,
        category: disputeOptions.category,
        description: disputeOptions.description,
        aliases: disputeOptions.aliases,
        question: disputeOptions.question,
        rulingOptions: disputeOptions.rulingOptions,
        fileURI: disputeOptions.primaryDocument,
        dynamicScriptURI: "/ipfs/QmZZHwVaXWtvChdFPG4UeXStKaC9aHamwQkNTEAfRmT2Fj",
      };

      // Upload metadata to IPFS
      const metaevidenceURI = await ipfsPublish(
        "metaEvidence.json", 
        this.encoder.encode(JSON.stringify(metaevidence))
      );

      // Create dispute on blockchain
      const result = await this.contractService.createDispute({
        ...disputeOptions,
        metaevidenceURI
      });

      debug('dispute-service', 'Dispute created successfully', { 
        disputeID: result.disputeID,
        arbitrationCost: result.arbitrationCost 
      });

      return result;
    } catch (error) {
      throw handleUserError(error, 'dispute-creation', 'Failed to create dispute. Please check your inputs and try again.');
    }
  }

  /**
   * Submits evidence for a dispute
   */
  async submitEvidence(arbitrableAddress, evidenceData, value = "0") {
    try {
      debug('dispute-service', 'Submitting evidence', { arbitrableAddress, disputeID: evidenceData.disputeID });

      // Prepare evidence metadata
      const evidence = {
        name: evidenceData.evidenceTitle,
        description: evidenceData.evidenceDescription,
        fileURI: evidenceData.evidenceDocument,
        evidenceSide: evidenceData.supportingSide
      };

      // Upload evidence metadata to IPFS
      const evidenceURI = await ipfsPublish(
        "evidence.json",
        this.encoder.encode(JSON.stringify(evidence))
      );

      // Submit evidence to blockchain
      const result = await this.contractService.submitEvidence(
        arbitrableAddress,
        { ...evidenceData, evidenceURI },
        value
      );

      debug('dispute-service', 'Evidence submitted successfully', { 
        transactionHash: result.transactionHash 
      });

      return result;
    } catch (error) {
      throw handleUserError(error, 'evidence-submission', 'Failed to submit evidence. Please try again.');
    }
  }

  /**
   * Gets comprehensive dispute information
   */
  async getDisputeDetails(arbitrableAddress, arbitratorDisputeID) {
    try {
      debug('dispute-service', 'Fetching dispute details', { arbitrableAddress, arbitratorDisputeID });

      // Get basic dispute information
      const [arbitratorDispute, arbitratorDisputeDetails] = await Promise.all([
        this.contractService.getArbitratorDispute(arbitratorDisputeID),
        this.contractService.getArbitratorDisputeDetails(arbitratorDisputeID)
      ]);

      if (!arbitratorDispute || !arbitratorDisputeDetails) {
        throw new Error('Dispute not found');
      }

      // Get arbitrable dispute ID
      const arbitrableDisputeID = await this.contractService.getArbitrableDisputeID(
        arbitrableAddress, 
        arbitratorDisputeID
      );

      // Get additional dispute data
      const [metaEvidence, evidences, multipliers, currentRuling] = await Promise.all([
        this.getMetaEvidence(arbitrableAddress, arbitratorDisputeID),
        this.getEvidences(arbitrableAddress, arbitratorDisputeID),
        this.contractService.getMultipliers(arbitrableAddress).catch(() => null),
        this.contractService.getCurrentRuling(arbitratorDisputeID).catch(() => null)
      ]);

      const disputeDetails = {
        arbitratorDispute,
        arbitratorDisputeDetails,
        arbitrableDisputeID,
        metaEvidence,
        evidences,
        multipliers,
        currentRuling,
        arbitrableAddress,
        arbitratorDisputeID
      };

      debug('dispute-service', 'Dispute details fetched successfully', { 
        disputeID: arbitratorDisputeID,
        hasMetaEvidence: !!metaEvidence,
        evidenceCount: evidences?.length || 0
      });

      return disputeDetails;
    } catch (error) {
      throw handleUserError(error, 'dispute-details-fetch', 'Failed to load dispute details. Please try again.');
    }
  }

  /**
   * Gets meta evidence for a dispute
   */
  async getMetaEvidence(arbitrableAddress, arbitratorDisputeID) {
    try {
      // Check cache first
      const cacheKey = `${this.network}${arbitratorDisputeID.toString()}`;
      const cachedItem = localStorage.getItem(cacheKey);
      
      if (cachedItem && cachedItem !== "undefined") {
        debug('dispute-service', 'Meta evidence found in cache', { arbitratorDisputeID });
        return JSON.parse(cachedItem);
      }

      debug('dispute-service', 'Fetching meta evidence', { arbitrableAddress, arbitratorDisputeID });

      // Get dispute information
      const dispute = await this.archon.arbitrable.getDispute(
        arbitrableAddress,
        this.networkConfig.KLEROS_LIQUID,
        arbitratorDisputeID
      );

      // Try using Archon first
      try {
        const scriptParameters = {
          disputeID: arbitratorDisputeID,
          arbitrableContractAddress: arbitrableAddress,
          arbitratorContractAddress: this.networkConfig.KLEROS_LIQUID,
          arbitratorChainID: this.network,
          chainID: this.network,
          arbitratorJsonRpcUrl: this.networkConfig.WEB3_PROVIDER,
        };

        const options = {
          strict: true,
          scriptParameters
        };

        const metaEvidence = await this.archon.arbitrable.getMetaEvidence(
          arbitrableAddress,
          dispute.metaEvidenceID,
          options
        );

        // Cache the result
        localStorage.setItem(cacheKey, JSON.stringify(metaEvidence));
        return metaEvidence;

      } catch (archonError) {
        debug('dispute-service', 'Archon failed, trying direct contract call', { error: archonError.message });

        // Fallback to direct contract call
        const contract = EthereumInterface.getContract(
          "IEvidence",
          arbitrableAddress,
          this.provider
        );

        const filter = contract.filters.MetaEvidence(dispute.metaEvidenceID);
        const events = await contract.queryFilter(
          filter,
          this.networkConfig.QUERY_FROM_BLOCK,
          dispute.blockNumber
        );

        if (events.length > 0) {
          const metaEvidenceURI = events[0].args._evidence;
          const response = await fetch(urlNormalize(metaEvidenceURI));
          const payload = await response.json();

          // Cache the result
          localStorage.setItem(cacheKey, JSON.stringify(payload));
          return payload;
        }

        throw new Error('Meta evidence not found');
      }
    } catch (error) {
      debug('dispute-service', 'Failed to fetch meta evidence', { error: error.message });
      throw handleContractError(error, 'DisputeService', 'getMetaEvidence', { arbitrableAddress, arbitratorDisputeID });
    }
  }

  /**
   * Gets evidences for a dispute
   */
  async getEvidences(arbitrableAddress, arbitratorDisputeID) {
    try {
      debug('dispute-service', 'Fetching evidences', { arbitrableAddress, arbitratorDisputeID });

      const dispute = await this.archon.arbitrable.getDispute(
        arbitrableAddress, 
        this.networkConfig.KLEROS_LIQUID, 
        arbitratorDisputeID
      );

      const evidences = await this.archon.arbitrable.getEvidence(
        arbitrableAddress, 
        this.networkConfig.KLEROS_LIQUID, 
        dispute.evidenceGroupID
      );

      debug('dispute-service', 'Evidences fetched successfully', { 
        evidenceCount: evidences?.length || 0 
      });

      return evidences || [];
    } catch (error) {
      debug('dispute-service', 'Failed to fetch evidences', { error: error.message });
      return []; // Return empty array on error to avoid breaking UI
    }
  }

  /**
   * Gets contributions for a dispute round
   */
  async getContributions(arbitrableDisputeID, round, arbitrableContractAddress, period, searchFrom) {
    try {
      debug('dispute-service', 'Fetching contributions', { 
        arbitrableDisputeID, 
        round, 
        arbitrableContractAddress 
      });

      // Handle exceptional contracts
      let _round = round;
      if (EXCEPTIONAL_CONTRACT_ADDRESSES.includes(arbitrableContractAddress)) {
        if (period < DISPUTE_PERIODS.EXECUTION) _round++;
      }

      const contract = EthereumInterface.getContract(
        "IDisputeResolver",
        arbitrableContractAddress,
        this.provider
      );

      const contributionFilter = contract.filters.Contribution(
        arbitrableDisputeID,
        _round,
        null // any contributor
      );

      const currentBlock = await this.provider.getBlockNumber();
      const fromBlock = searchFrom ?? Math.max(
        this.networkConfig.QUERY_FROM_BLOCK || 0,
        currentBlock - BLOCK_SEARCH_RANGE
      );
      const toBlock = searchFrom ? searchFrom + BLOCK_SEARCH_WINDOW : "latest";

      const events = await contract.queryFilter(contributionFilter, fromBlock, toBlock);

      const contributionsForEachRuling = events.reduce((acc, event) => {
        const ruling = event.args.ruling.toString();
        const amount = event.args._amount.toString();

        acc[ruling] = acc[ruling] || "0";
        acc[ruling] = (BigInt(acc[ruling]) + BigInt(amount)).toString();

        return acc;
      }, {});

      debug('dispute-service', 'Contributions fetched successfully', { 
        contributionsCount: Object.keys(contributionsForEachRuling).length 
      });

      return contributionsForEachRuling;
    } catch (error) {
      debug('dispute-service', 'Failed to fetch contributions', { error: error.message });
      return {};
    }
  }

  /**
   * Gets ruling funded events for a dispute round
   */
  async getRulingFunded(arbitrableDisputeID, round, arbitrableContractAddress, searchFrom) {
    try {
      debug('dispute-service', 'Fetching ruling funded events', { 
        arbitrableDisputeID, 
        round, 
        arbitrableContractAddress 
      });

      let _round = round;
      if (EXCEPTIONAL_CONTRACT_ADDRESSES.includes(arbitrableContractAddress)) {
        _round++;
      }

      const contract = EthereumInterface.getContract(
        "IDisputeResolver",
        arbitrableContractAddress,
        this.provider
      );

      const rulingFundedFilter = contract.filters.RulingFunded(
        arbitrableDisputeID,
        _round,
        null // any ruling
      );

      const currentBlock = await this.provider.getBlockNumber();
      const fromBlock = searchFrom ?? Math.max(
        this.networkConfig.QUERY_FROM_BLOCK || 0,
        currentBlock - BLOCK_SEARCH_RANGE
      );
      const toBlock = searchFrom ? searchFrom + BLOCK_SEARCH_WINDOW : "latest";

      const events = await contract.queryFilter(rulingFundedFilter, fromBlock, toBlock);
      const rulings = events.map((event) => event.args._ruling.toString());

      debug('dispute-service', 'Ruling funded events fetched successfully', { 
        rulingsCount: rulings.length 
      });

      return rulings;
    } catch (error) {
      debug('dispute-service', 'Failed to fetch ruling funded events', { error: error.message });
      return [];
    }
  }

  /**
   * Gets appeal decisions for a dispute
   */
  async getAppealDecisions(arbitratorDisputeID, disputedAtBlockNumber) {
    try {
      debug('dispute-service', 'Fetching appeal decisions', { arbitratorDisputeID });

      if (!this.networkConfig?.KLEROS_LIQUID) {
        return [];
      }

      const contract = EthereumInterface.getContract(
        "KlerosLiquid",
        this.networkConfig.KLEROS_LIQUID,
        this.provider
      );

      const appealDecisionFilter = contract.filters.AppealDecision(arbitratorDisputeID);
      const appealDecisionEvents = await contract.queryFilter(
        appealDecisionFilter,
        disputedAtBlockNumber,
        "latest"
      );

      const blockPromises = appealDecisionEvents.map((event) =>
        this.provider.getBlock(event.blockNumber)
      );

      const blocks = await Promise.all(blockPromises);

      const appealDecisions = blocks.map((block) => ({
        appealedAt: block.timestamp,
        appealedAtBlockNumber: block.number
      }));

      debug('dispute-service', 'Appeal decisions fetched successfully', { 
        appealCount: appealDecisions.length 
      });

      return appealDecisions;
    } catch (error) {
      debug('dispute-service', 'Failed to fetch appeal decisions', { error: error.message });
      return [];
    }
  }

  /**
   * Gets total withdrawable amount for a user
   */
  async getTotalWithdrawableAmount(arbitrableDisputeID, contributedTo, arbitrated, activeAddress) {
    try {
      debug('dispute-service', 'Fetching withdrawable amount', { 
        arbitrableDisputeID, 
        arbitrated 
      });

      let amount = 0;
      let contract = EthereumInterface.getContract(
        "IDisputeResolver",
        arbitrated,
        this.provider
      );

      try {
        // Try v2 interface first
        let counter = 0;
        while (counter < contributedTo.length) {
          amount = await contract.getTotalWithdrawableAmount(
            arbitrableDisputeID,
            activeAddress || ethers.ZeroAddress,
            contributedTo[counter]
          );

          if (amount != 0) break;
          counter++;
        }

        return { amount: amount, ruling: contributedTo[counter] };
      } catch (v2Error) {
        // Fallback to v1 interface
        contract = EthereumInterface.getContract(
          "IDisputeResolver_v1",
          arbitrated,
          this.provider
        );

        amount = await contract.getTotalWithdrawableAmount(
          arbitrableDisputeID,
          activeAddress || ethers.ZeroAddress,
          contributedTo
        );

        return { amount: amount, ruling: contributedTo };
      }
    } catch (error) {
      debug('dispute-service', 'Failed to fetch withdrawable amount', { error: error.message });
      return { amount: 0, ruling: null };
    }
  }

  /**
   * Gets ruling from archon
   */
  async getRuling(arbitrableAddress, arbitratorDisputeID) {
    try {
      return await this.archon.arbitrable.getRuling(
        arbitrableAddress, 
        this.networkConfig.KLEROS_LIQUID, 
        arbitratorDisputeID
      );
    } catch (error) {
      debug('dispute-service', 'Failed to fetch ruling', { error: error.message });
      return null;
    }
  }

  /**
   * Gets dispute event from archon
   */
  async getDisputeEvent(arbitrableAddress, disputeID) {
    try {
      return await this.archon.arbitrable.getDispute(
        arbitrableAddress,
        this.networkConfig.KLEROS_LIQUID,
        disputeID
      );
    } catch (error) {
      debug('dispute-service', 'Failed to fetch dispute event', { error: error.message });
      return null;
    }
  }
}