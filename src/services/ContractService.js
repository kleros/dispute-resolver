/**
 * Contract Service
 * Handles all blockchain contract interactions
 * Extracted from App.js to provide clean separation of concerns
 */

import { ethers } from 'ethers';
import * as EthereumInterface from '../ethereum/interface.js';
import networkMap from '../ethereum/network-contract-mapping.js';
import { 
  HEX_PADDING_WIDTH, 
  BLOCK_SEARCH_RANGE, 
  BLOCK_SEARCH_WINDOW,
  EXCEPTIONAL_CONTRACT_ADDRESSES,
  DISPUTE_PERIODS,
  NETWORK_TIMEOUTS
} from '../constants/blockchain.js';
import { handleContractError, handleNetworkError, debug } from '../utils/errorHandler.js';
import { RetryUtils } from '../utils/blockchain.js';

export class ContractService {
  constructor(provider, network) {
    this.provider = provider;
    this.network = network;
    this.networkConfig = networkMap[network];
  }

  /**
   * Updates the provider and network configuration
   */
  updateProvider(provider, network) {
    this.provider = provider;
    this.network = network;
    this.networkConfig = networkMap[network];
    debug('contract-service', 'Provider updated', { network });
  }

  /**
   * Generates arbitrator extra data for Kleros
   */
  generateArbitratorExtraData(subcourtID, numberOfVotes) {
    try {
      const courtHex = parseInt(subcourtID, 10).toString(16).padStart(HEX_PADDING_WIDTH, "0");
      const votesHex = parseInt(numberOfVotes, 10).toString(16).padStart(HEX_PADDING_WIDTH, "0");
      return `0x${courtHex}${votesHex}`;
    } catch (error) {
      throw new Error(`Failed to generate extra data: ${error.message}`);
    }
  }

  /**
   * Gets arbitration cost for given parameters
   */
  async getArbitrationCost(arbitratorAddress, extraData) {
    if (!this.networkConfig?.KLEROS_LIQUID) {
      throw new Error('Network not configured for Kleros Liquid');
    }

    const operation = async () => {
      const contract = EthereumInterface.getContract(
        "IArbitrator",
        arbitratorAddress,
        this.provider
      );
      return await contract.arbitrationCost(extraData);
    };

    try {
      return await RetryUtils.withExponentialBackoff(operation);
    } catch (error) {
      throw handleContractError(error, 'IArbitrator', 'arbitrationCost', { arbitratorAddress, extraData });
    }
  }

  /**
   * Gets arbitration cost with court and number of jurors
   */
  async getArbitrationCostWithCourtAndNoOfJurors(subcourtID, noOfJurors) {
    if (!this.networkConfig?.KLEROS_LIQUID) {
      throw new Error('Network not configured for Kleros Liquid');
    }

    try {
      const extraData = this.generateArbitratorExtraData(subcourtID, noOfJurors);
      const cost = await this.getArbitrationCost(this.networkConfig.KLEROS_LIQUID, extraData);
      return ethers.formatEther(cost);
    } catch (error) {
      throw handleContractError(error, 'ContractService', 'getArbitrationCostWithCourtAndNoOfJurors', { subcourtID, noOfJurors });
    }
  }

  /**
   * Gets subcourt information
   */
  async getSubcourt(subcourtID) {
    if (!this.networkConfig?.KLEROS_LIQUID) {
      throw new Error('Network not configured for Kleros Liquid');
    }

    const operation = async () => {
      const contract = EthereumInterface.getContract(
        "KlerosLiquid",
        this.networkConfig.KLEROS_LIQUID,
        this.provider
      );
      return await contract.getSubcourt(subcourtID);
    };

    try {
      return await RetryUtils.withExponentialBackoff(operation);
    } catch (error) {
      throw handleContractError(error, 'KlerosLiquid', 'getSubcourt', { subcourtID });
    }
  }

  /**
   * Gets subcourt details from policy registry
   */
  async getSubCourtDetails(subcourtID) {
    if (!this.networkConfig?.POLICY_REGISTRY) {
      throw new Error('Network not configured for Policy Registry');
    }

    const operation = async () => {
      const contract = EthereumInterface.getContract(
        "PolicyRegistry",
        this.networkConfig.POLICY_REGISTRY,
        this.provider
      );
      return await contract.policies(subcourtID);
    };

    try {
      return await RetryUtils.withExponentialBackoff(operation);
    } catch (error) {
      throw handleContractError(error, 'PolicyRegistry', 'policies', { subcourtID });
    }
  }

  /**
   * Estimates gas for subcourt operation
   */
  async estimateGasOfGetSubcourt(subcourtID) {
    if (!this.networkConfig?.KLEROS_LIQUID) {
      throw new Error('Network not configured for Kleros Liquid');
    }

    const operation = async () => {
      const contract = EthereumInterface.getContract(
        "KlerosLiquid",
        this.networkConfig.KLEROS_LIQUID,
        this.provider
      );
      return await contract.getSubcourt.estimateGas(subcourtID);
    };

    try {
      return await RetryUtils.withExponentialBackoff(operation);
    } catch (error) {
      throw handleContractError(error, 'KlerosLiquid', 'estimateGas', { subcourtID });
    }
  }

  /**
   * Gets arbitrator dispute information
   */
  async getArbitratorDispute(arbitratorDisputeID) {
    if (!this.networkConfig?.KLEROS_LIQUID) {
      throw new Error('Network not configured for Kleros Liquid');
    }

    const operation = async () => {
      const contract = EthereumInterface.getContract(
        "KlerosLiquid",
        this.networkConfig.KLEROS_LIQUID,
        this.provider
      );
      return await contract.disputes(arbitratorDisputeID);
    };

    try {
      return await RetryUtils.withExponentialBackoff(operation);
    } catch (error) {
      throw handleContractError(error, 'KlerosLiquid', 'disputes', { arbitratorDisputeID });
    }
  }

  /**
   * Gets detailed arbitrator dispute information
   */
  async getArbitratorDisputeDetails(arbitratorDisputeID) {
    if (!this.networkConfig?.KLEROS_LIQUID) {
      throw new Error('Network not configured for Kleros Liquid');
    }

    const operation = async () => {
      const contract = EthereumInterface.getContract(
        "KlerosLiquid",
        this.networkConfig.KLEROS_LIQUID,
        this.provider
      );
      return await contract.getDispute(arbitratorDisputeID);
    };

    try {
      return await RetryUtils.withExponentialBackoff(operation);
    } catch (error) {
      throw handleContractError(error, 'KlerosLiquid', 'getDispute', { arbitratorDisputeID });
    }
  }

  /**
   * Gets multipliers from arbitrable contract
   */
  async getMultipliers(arbitrableAddress) {
    const operation = async () => {
      const contract = EthereumInterface.getContract(
        "IDisputeResolver",
        arbitrableAddress,
        this.provider
      );
      return await contract.getMultipliers();
    };

    try {
      return await RetryUtils.withExponentialBackoff(operation);
    } catch (error) {
      throw handleContractError(error, 'IDisputeResolver', 'getMultipliers', { arbitrableAddress });
    }
  }

  /**
   * Gets current ruling for a dispute
   */
  async getCurrentRuling(arbitratorDisputeID) {
    if (!this.networkConfig?.KLEROS_LIQUID) {
      throw new Error('Network not configured for Kleros Liquid');
    }

    const operation = async () => {
      const contract = EthereumInterface.getContract(
        "KlerosLiquid",
        this.networkConfig.KLEROS_LIQUID,
        this.provider
      );
      return await contract.currentRuling(arbitratorDisputeID);
    };

    try {
      return await RetryUtils.withExponentialBackoff(operation);
    } catch (error) {
      throw handleContractError(error, 'KlerosLiquid', 'currentRuling', { arbitratorDisputeID });
    }
  }

  /**
   * Gets appeal cost for a dispute
   */
  async getAppealCost(arbitratorDisputeID) {
    if (!this.networkConfig?.KLEROS_LIQUID) {
      throw new Error('Network not configured for Kleros Liquid');
    }

    const operation = async () => {
      const contract = EthereumInterface.getContract(
        "IArbitrator",
        this.networkConfig.KLEROS_LIQUID,
        this.provider
      );
      return await contract.appealCost(arbitratorDisputeID, ethers.ZeroHash);
    };

    try {
      return await RetryUtils.withExponentialBackoff(operation);
    } catch (error) {
      throw handleContractError(error, 'IArbitrator', 'appealCost', { arbitratorDisputeID });
    }
  }

  /**
   * Gets appeal period for a dispute
   */
  async getAppealPeriod(arbitratorDisputeID) {
    if (!this.networkConfig?.KLEROS_LIQUID) {
      throw new Error('Network not configured for Kleros Liquid');
    }

    const operation = async () => {
      const contract = EthereumInterface.getContract(
        "KlerosLiquid",
        this.networkConfig.KLEROS_LIQUID,
        this.provider
      );
      return await contract.appealPeriod(arbitratorDisputeID);
    };

    try {
      return await RetryUtils.withExponentialBackoff(operation);
    } catch (error) {
      throw handleContractError(error, 'KlerosLiquid', 'appealPeriod', { arbitratorDisputeID });
    }
  }

  /**
   * Gets arbitrable dispute ID from arbitrator dispute ID
   */
  async getArbitrableDisputeID(arbitrableAddress, arbitratorDisputeID) {
    const operation = async () => {
      const contract = EthereumInterface.getContract(
        "IDisputeResolver",
        arbitrableAddress,
        this.provider
      );
      return await contract.externalIDtoLocalID.staticCall(arbitratorDisputeID);
    };

    try {
      return await RetryUtils.withExponentialBackoff(operation);
    } catch (error) {
      throw handleContractError(error, 'IDisputeResolver', 'externalIDtoLocalID', { arbitrableAddress, arbitratorDisputeID });
    }
  }

  /**
   * Creates a new dispute
   */
  async createDispute(options) {
    if (!this.networkConfig?.ARBITRABLE_PROXY) {
      throw new Error('Network not configured for Arbitrable Proxy');
    }

    try {
      const arbitrator = this.networkConfig.KLEROS_LIQUID;
      const arbitratorExtraData = this.generateArbitratorExtraData(
        options.selectedSubcourt, 
        options.initialNumberOfJurors
      );

      const arbitrationCost = await this.getArbitrationCost(arbitrator, arbitratorExtraData);
      
      const contract = await EthereumInterface.getSignableContract(
        "ArbitrableProxy",
        this.networkConfig.ARBITRABLE_PROXY,
        this.provider
      );

      const tx = await contract.createDispute(
        arbitratorExtraData,
        options.metaevidenceURI,
        options.numberOfRulingOptions,
        { value: arbitrationCost }
      );

      const receipt = await tx.wait();

      // Extract dispute ID from transaction logs
      const disputeCreationTopic = contract.interface.getEvent("DisputeCreation").topicHash;
      const disputeLog = receipt.logs.find((log) => log.topics[0] === disputeCreationTopic);

      if (disputeLog) {
        const disputeID = ethers.getBigInt(disputeLog.topics[1]);
        return {
          receipt,
          disputeID: disputeID.toString(),
          arbitrationCost: ethers.formatEther(arbitrationCost)
        };
      } else {
        throw new Error("DisputeCreation event not found in transaction logs");
      }
    } catch (error) {
      throw handleContractError(error, 'ArbitrableProxy', 'createDispute', options);
    }
  }

  /**
   * Submits evidence for a dispute
   */
  async submitEvidence(arbitrableAddress, evidenceData, value = "0") {
    try {
      const contract = await EthereumInterface.getSignableContract(
        "ArbitrableProxy",
        arbitrableAddress,
        this.provider
      );

      const tx = await contract.submitEvidence(
        evidenceData.disputeID, 
        evidenceData.evidenceURI, 
        {
          value: ethers.parseEther(value)
        }
      );

      return await tx.wait();
    } catch (error) {
      throw handleContractError(error, 'ArbitrableProxy', 'submitEvidence', evidenceData);
    }
  }

  /**
   * Funds an appeal
   */
  async fundAppeal(arbitrableAddress, arbitrableDisputeID, party, contribution) {
    try {
      const contract = await EthereumInterface.getSignableContract(
        "IDisputeResolver",
        arbitrableAddress,
        this.provider
      );

      const tx = await contract.fundAppeal(arbitrableDisputeID, party, {
        value: ethers.parseEther(contribution)
      });

      return await tx.wait();
    } catch (error) {
      throw handleContractError(error, 'IDisputeResolver', 'fundAppeal', { arbitrableDisputeID, party, contribution });
    }
  }

  /**
   * Withdraws fees and rewards for all rounds
   */
  async withdrawFeesAndRewardsForAllRounds(arbitrableAddress, arbitrableDisputeID, rulingOptionsContributedTo, arbitrableContractAddress) {
    try {
      const contractName = EXCEPTIONAL_CONTRACT_ADDRESSES.includes(arbitrableContractAddress)
        ? "IDisputeResolver_v1"
        : "IDisputeResolver";

      const contract = await EthereumInterface.getSignableContract(
        contractName,
        arbitrableAddress,
        this.provider
      );

      const tx = await contract.withdrawFeesAndRewardsForAllRounds(
        arbitrableDisputeID,
        await (await this.provider.getSigner()).getAddress(),
        rulingOptionsContributedTo,
        { value: ethers.parseEther("0") }
      );

      return await tx.wait();
    } catch (error) {
      throw handleContractError(error, 'IDisputeResolver', 'withdrawFeesAndRewardsForAllRounds', { arbitrableDisputeID });
    }
  }

  /**
   * Gets open disputes on court
   */
  async getOpenDisputesOnCourt() {
    if (!this.networkConfig?.KLEROS_LIQUID) {
      return [];
    }

    try {
      const contract = EthereumInterface.getContract(
        "KlerosLiquid",
        this.networkConfig.KLEROS_LIQUID,
        this.provider
      );

      const currentBlock = await this.provider.getBlockNumber();
      const startingBlock = Math.max(0, currentBlock - BLOCK_SEARCH_RANGE);

      const [newPeriodEvents, disputeCreationEvents] = await Promise.all([
        contract.queryFilter(contract.filters.NewPeriod(), startingBlock),
        contract.queryFilter(contract.filters.DisputeCreation(), startingBlock)
      ]);

      const disputes = [...new Set(disputeCreationEvents.map((event) => event.args._disputeID.toString()))];

      const resolvedDisputes = newPeriodEvents
        .filter((event) => event.args._period.toString() === DISPUTE_PERIODS.EXECUTION.toString())
        .map((event) => event.args._disputeID.toString());

      return disputes.filter((dispute) => !resolvedDisputes.includes(dispute));
    } catch (error) {
      throw handleContractError(error, 'KlerosLiquid', 'getOpenDisputesOnCourt', {});
    }
  }
}