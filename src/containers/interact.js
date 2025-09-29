import React from "react";
import { Col, Form, Row, InputGroup, FormControl } from "react-bootstrap";
import DisputeSummary from "components/disputeSummary";
import DisputeDetails from "components/disputeDetails";
import debounce from "lodash.debounce";
import { ReactComponent as Magnifier } from "../assets/images/magnifier.svg";

import { Redirect } from "react-router-dom";

import styles from "containers/styles/interact.module.css";

class Interact extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      arbitratorDisputeID: this.props.route?.match?.params?.id || 0,
      fileInput: "",
      evidenceFileURI: "",
      metaevidence: "",
      evidences: [],
      modalShow: false,
      evidenceTitle: "",
      evidenceDescription: "",
      contributeModalShow: false,
      submitting: false,
      fetchingString: "",
      currentRuling: "",
      loading: true,
    };

    this.debouncedRetrieveUsingArbitratorID = debounce(this.retrieveDisputeDetailsUsingArbitratorID, 750, { leading: false, trailing: true });
  }

  async componentDidMount() {
    if (this.state.arbitratorDisputeID) if (this.state.arbitratorDisputeID) this.debouncedRetrieveUsingArbitratorID.cancel();
    this.debouncedRetrieveUsingArbitratorID(this.state.arbitratorDisputeID);
  }

  async componentDidUpdate(previousProperties) {
    if (this.props.network !== previousProperties.network) {
      const dispute = await this.props.getArbitratorDisputeCallback(this.state.arbitratorDisputeID);

      if (!dispute) {
        window.location.reload();
      }
      this.setState(() => ({ arbitrated: dispute.arbitrated }));
    }

    if (this.props.disputeID !== previousProperties.disputeID) {
      this.setState(() => ({ arbitrableDisputeID: this.props.disputeID }));
      this.reload();
    }
  }

  sumObjectsByKey(...objs) {
    return objs.reduce((a, b) => {
      for (let k in b) {
        if (b.hasOwnProperty(k)) a[k] = (a[k] || 0) + b[k];
      }
      return a;
    }, {});
  }

  submitEvidence = async (evidence) => {
    await this.props.submitEvidenceCallback(this.state.arbitrated, {
      disputeID: this.state.arbitrableDisputeID,
      evidenceDescription: evidence.evidenceDescription,
      evidenceDocument: evidence.evidenceDocument,
      evidenceTitle: evidence.evidenceTitle,
      supportingSide: evidence.supportingSide,
    });
    new Promise(() => setTimeout(2000)).then(this.reload());
  };



  appeal = async (party, contribution) => this.props.appealCallback(this.state.arbitrated, this.state.arbitrableDisputeID, party, contribution).then(this.reload);

  withdraw = async () => {
    // Guard against null or undefined selectedContribution
    if (this.state.selectedContribution == null) {
      console.error('Cannot withdraw: no valid ruling found');
      return;
    }

    try {
      // function signature withdrawFeesAndRewardsForAllRounds(uint256 _localDisputeID, address payable _contributor, uint256 _ruling);
      this.props.withdrawCallback(this.state.arbitrated, this.state.arbitrableDisputeID, this.state.selectedContribution, this.state.arbitrated);
    } catch (err) {
      // function signature withdrawFeesAndRewardsForAllRounds(uint256 _localDisputeID, address payable _contributor, uint256[] memory _contributedTo);
      console.error('First withdraw attempt failed, trying alternative signature:', err);
      this.props.withdrawCallback(this.state.arbitrated, this.state.arbitrableDisputeID, this.state.selectedContribution, this.state.arbitrated);
    }
  };

  onDisputeIDChange = async (e) => {
    const arbitratorDisputeID = e.target.value;
    this.setState(() => ({
      metaevidence: null,
      arbitratorDisputeID,
      loading: true,
      arbitrableDisputeID: null,
      arbitratorDispute: null,
    }));
    await this.debouncedRetrieveUsingArbitratorID.cancel();
    await this.debouncedRetrieveUsingArbitratorID(arbitratorDisputeID);
  };

  getCurrentRuling = async (disputeIDOnArbitratorSide) => {
    try {
      return await this.props.getCurrentRulingCallback(disputeIDOnArbitratorSide);
    } catch (err) {
      console.error(err);
      return null;
    }
  };

  getRuling = async (arbitrableAddress, disputeIDOnArbitratorSide) => {
    try {
      return await this.props.getRulingCallback(arbitrableAddress, disputeIDOnArbitratorSide);
    } catch (err) {
      console.error('Failed to get ruling:', err);
      return null;
    }
  };

  retrieveDisputeDetailsUsingArbitratorID = async (arbitratorDisputeID) => {
    try {
      const { arbitrated } = await this.props.getArbitratorDisputeCallback(arbitratorDisputeID);

      if (!arbitrated) return;

      this.setState({ arbitrated });
      await this.commonFetchRoutine(arbitrated, arbitratorDisputeID);
    } catch (error) {
      console.error('Failed to retrieve dispute details:', error);
    } finally {
      this.setState({ loading: false });
    }
  };

  fetchInitialDisputeData = async (arbitrated, arbitratorDisputeID) => {
    // Make each promise resilient by catching individual errors
    const [
      arbitratorDispute,
      metaevidence,
      arbitratorDisputeDetails,
      ruling,
      currentRuling,
      disputeEvent,
      getDisputeResult,
      evidences,
      multipliers
    ] = await Promise.all([
      this.props.getArbitratorDisputeCallback(arbitratorDisputeID).catch(err => {
        console.warn('getArbitratorDisputeCallback failed:', err.message);
        return {
          period: "0",
          lastPeriodChange: "0",
          subcourtID: "0",
          numberOfChoices: "2"
        };
      }),
      this.props.getMetaEvidenceCallback(arbitrated, arbitratorDisputeID).catch(err => {
        console.warn('getMetaEvidenceCallback failed:', err.message);
        return null;
      }),
      this.props.getArbitratorDisputeDetailsCallback(arbitratorDisputeID).catch(err => {
        console.warn('getArbitratorDisputeDetailsCallback failed:', err.message);
        return {
          0: "0", // appeal cost
          1: "0", // appeal period
          2: ["0", "0", "0", "0"] // times per period
        };
      }),
      this.getRuling(arbitrated, arbitratorDisputeID).catch(err => {
        console.warn('getRuling failed:', err.message);
        return null;
      }),
      this.getCurrentRuling(arbitratorDisputeID).catch(err => {
        console.warn('getCurrentRuling failed:', err.message);
        return null;
      }),
      this.props.getDisputeEventCallback(arbitrated, arbitratorDisputeID).catch(err => {
        console.warn('getDisputeEventCallback failed:', err.message);
        return {
          blockNumber: 0,
          args: {
            _arbitrator: arbitrated,
            _disputeID: arbitratorDisputeID,
            _metaEvidenceID: 0,
            _evidenceGroupID: 0
          }
        };
      }),
      this.props.getDisputeCallback(arbitratorDisputeID).catch(err => {
        console.warn('getDisputeCallback failed:', err.message);
        return {
          id: arbitratorDisputeID,
          arbitrated: arbitrated,
          period: "0",
          lastPeriodChange: "0",
          numberOfChoices: "2"
        };
      }),
      this.props.getEvidencesCallback(arbitrated, arbitratorDisputeID).catch(err => {
        console.warn('getEvidencesCallback failed:', err.message);
        return [];
      }),
      this.props.getMultipliersCallback(arbitrated).catch(err => {
        console.warn('getMultipliersCallback failed:', err.message);
        return {
          winnerStakeMultiplier: 10000n,
          loserStakeMultiplier: 10000n,
          loserAppealPeriodMultiplier: 10000n,
          denominator: 10000n
        }
      })
    ]);

    return {
      arbitratorDispute,
      metaevidence,
      arbitratorDisputeDetails,
      ruling,
      currentRuling,
      disputeEvent,
      getDisputeResult,
      evidences,
      multipliers
    };
  };

  handleAppealPeriodLogic = async (arbitratorDispute, arbitratorDisputeID) => {
    if (parseInt(arbitratorDispute.period, 10) >= 3) {
      const [appealCost, appealPeriod] = await Promise.all([
        this.props.getAppealCostCallback(arbitratorDisputeID),
        this.props.getAppealPeriodCallback(arbitratorDisputeID)
      ]);
      this.setState({ appealCost, appealPeriod });
    }
  };

  handleExecutionPeriodLogic = async (arbitratorDispute, arbitrableDisputeID, arbitrated, appealDecisions, disputeEvent, contributions) => {
    if (parseInt(arbitratorDispute.period, 10) === 4) {
      const contributionPromises = Array.from(
        { length: appealDecisions.length },
        (_, i) => this.props.getContributionsCallback(
          arbitrableDisputeID,
          i,
          arbitrated,
          arbitratorDispute.period,
          disputeEvent.blockNumber
        )
      );

      const contributionsOfPastRounds = await Promise.all(contributionPromises);
      const aggregatedContributions = this.sumObjectsByKey(...contributionsOfPastRounds, contributions);

      try {
        const totalWithdrawable = await this.props.getTotalWithdrawableAmountCallback(
          arbitrableDisputeID,
          Object.keys(aggregatedContributions),
          arbitrated
        );
        this.setState({
          totalWithdrawable: totalWithdrawable.amount,
          aggregatedContributions,
          selectedContribution: totalWithdrawable.ruling
        });
      } catch (err) {
        console.error("Failed to get withdrawable amount:", err);
      }
    }
  };

  commonFetchRoutine = async (arbitrated, arbitratorDisputeID) => {
    try {
      const arbitrableDisputeID = await this.props.getArbitrableDisputeIDCallback(arbitrated, arbitratorDisputeID)
        .catch(err => {
          console.error("Failed to get arbitrable dispute id. Incompatible with IDisputeResolver.");
          this.setState({ incompatible: true });
          throw err;
        });

      const disputeData = await this.fetchInitialDisputeData(arbitrated, arbitratorDisputeID);

      this.setState({
        arbitrableDisputeID,
        arbitratorDisputeID,
        ...disputeData
      });

      // Make appeal-related calls more resilient
      const appealDecisions = await this.props.getAppealDecisionCallback(
        arbitratorDisputeID,
        disputeData.disputeEvent?.blockNumber || 0
      ).catch(err => {
        console.warn("getAppealDecisionCallback failed:", err.message);
        return [];
      });

      const [contributions, rulingFunded] = await Promise.all([
        this.props.getContributionsCallback(
          arbitrableDisputeID,
          appealDecisions.length,
          arbitrated,
          disputeData.arbitratorDispute?.period,
          appealDecisions.slice(-1)?.appealedAtBlockNumber
        ).catch(err => {
          console.warn("getContributionsCallback failed:", err.message);
          return {};
        }),
        this.props.getRulingFundedCallback(
          arbitrableDisputeID,
          appealDecisions.length,
          arbitrated,
          appealDecisions.slice(-1)?.appealedAtBlockNumber
        ).catch(err => {
          console.warn("getRulingFundedCallback failed:", err.message);
          return {};
        })
      ]);

      this.setState({ contributions, appealDecisions, rulingFunded });

      // Make these optional operations more resilient
      try {
        if (disputeData.arbitratorDispute) {
          await this.handleAppealPeriodLogic(disputeData.arbitratorDispute, arbitratorDisputeID);
        }
      } catch (err) {
        console.warn("handleAppealPeriodLogic failed:", err.message);
      }

      try {
        if (disputeData.arbitratorDispute && disputeData.disputeEvent) {
          await this.handleExecutionPeriodLogic(disputeData.arbitratorDispute, arbitrableDisputeID, arbitrated, appealDecisions, disputeData.disputeEvent, contributions);
        }
      } catch (err) {
        console.warn("handleExecutionPeriodLogic failed:", err.message);
      }

    } catch (err) {
      console.error("Error in commonFetchRoutine:", err);
      // Only set incompatible if critical operations fail
      // If we have MetaEvidence, don't mark as incompatible
      if (!this.state.metaevidence) {
        this.setState({ incompatible: true });
      }
    }
  };

  reload = async () => {
    try {
      const [
        arbitratorDispute,
        evidences,
        appealDecisions,
        arbitratorDisputeDetails
      ] = await Promise.all([
        this.props.getArbitratorDisputeCallback(this.state.arbitratorDisputeID),
        this.props.getEvidencesCallback(this.state.arbitrated, this.state.arbitratorDisputeID),
        this.props.getAppealDecisionCallback(this.state.arbitratorDisputeID),
        this.props.getArbitratorDisputeDetailsCallback(this.state.arbitratorDisputeID)
      ]);

      const contributions = await this.props.getContributionsCallback(
        this.state.arbitrableDisputeID,
        appealDecisions.length,
        this.state.arbitrated,
        arbitratorDispute.period
      );

      this.setState(() => ({
        arbitratorDispute,
        evidences,
        appealDecisions,
        arbitratorDisputeDetails,
        contributions
      }));

    } catch (err) {
      console.error('Failed to reload dispute data:', err);
    }
  };

  renderNoDisputeFound = () => {
    const { arbitratorDisputeID } = this.state;
    const { network } = this.props;

    return (
      <div style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '2rem'
      }}>
        <h2 style={{ fontSize: "18px" }}>Dispute with ID {arbitratorDisputeID} does not exist on this network.</h2>
        <button
          className="btn btn-primary"
          onClick={() => window.location.href = `/${network}/ongoing`}
        >
          View Ongoing Disputes
        </button>
      </div>
    );
  };

  renderIncompatibleWarning = () => {
    const { metaevidence } = this.state;
    const isGenericMetaEvidence = metaevidence?.metaEvidenceJSON?.category === "Non-Standard Contract";

    return (
      <div style={{
        padding: "1rem 2rem",
        fontSize: "14px",
        background: isGenericMetaEvidence ? "#fff3cd" : "#fafafa",
        border: isGenericMetaEvidence ? "1px solid #ffeaa7" : "none",
        borderRadius: "4px",
        marginBottom: "1rem"
      }}>
        {isGenericMetaEvidence ? (
          <>
            <b>⚠️ Non-Standard Contract:</b> This arbitrable contract doesn't follow standard Kleros patterns.
            The dispute information shown is generic. Limited functionality is available - you may not be able to submit evidence
            or fund appeals through this interface.
            <br />
            <small style={{ color: "#856404", marginTop: "0.5rem", display: "block" }}>
              Contract: {this.state.arbitrated}
            </small>
          </>
        ) : (
          <>
            <b>View mode only:</b> the arbitrable contract of this dispute is not compatible with the interface of Dispute Resolver.
            You can't submit evidence or fund appeal on this interface. You can do these on the arbitrable application, if implemented.
          </>
        )}
      </div>
    );
  };

  renderSearchForm = () => {
    const { arbitratorDisputeID } = this.state;

    return (
      <div>
        <Row>
          <Col>
            <Form.Label>
              Search Disputes on <a href={`https://court.kleros.io/cases/${arbitratorDisputeID}`}>Court</a>
            </Form.Label>
            <InputGroup className={styles.search} size="md">
              <InputGroup.Prepend>
                <InputGroup.Text>
                  <Magnifier />
                </InputGroup.Text>
              </InputGroup.Prepend>
              <FormControl
                className="purple-inverted"
                placeholder="Dispute ID"
                aria-label="Input dispute number from Court"
                aria-describedby="search"
                onChange={this.onDisputeIDChange}
                type="number"
                min="0"
                value={arbitratorDisputeID}
                id="arbitratorDisputeID"
              />
            </InputGroup>
          </Col>
        </Row>
      </div>
    );
  };

  getCurrentRulingValue = () => {
    const { metaevidence, currentRuling } = this.state;
    if (!currentRuling) return "0";

    // Always return string for consistent type handling (TypeScript preparation)
    // Hash types: convert to string to preserve precision for large numbers
    // Non-hash types: apply parseInt then convert to string to maintain processing logic
    if (metaevidence?.metaEvidenceJSON?.rulingOptions?.type === "hash") {
      return String(currentRuling); // Preserve precision by converting to string
    } else {
      return String(parseInt(currentRuling, 10)); // Apply parseInt logic then convert to string
    }
  };

  render() {
    const { arbitrated, loading, incompatible, metaevidence } = this.state;
    const { activeAddress } = this.props;

    if (!loading && !arbitrated) {
      return this.renderNoDisputeFound();
    }

    const isGenericMetaEvidence = metaevidence?.metaEvidenceJSON?.category === "Non-Standard Contract";
    const shouldShowWarning = incompatible || isGenericMetaEvidence;

    return (
      <>
        {shouldShowWarning && this.renderIncompatibleWarning()}
        {arbitrated && this.renderMainContent()}
      </>
    );
  }

  renderMainContent = () => {
    const {
      arbitratorDispute,
      arbitratorDisputeDetails,
      appealCost,
      appealPeriod,
      arbitratorDisputeID,
      metaevidence,
      multipliers,
      evidences,
      disputeEvent,
      appealDecisions,
      contributions,
      rulingFunded,
      incompatible,
      totalWithdrawable,
      loading,
      arbitrated
    } = this.state;

    const {
      arbitratorAddress,
      activeAddress,
      publishCallback,
      getAppealPeriodCallback,
      subcourts,
      subcourtDetails,
      network,
      web3Provider,
    } = this.props;

    return (
      <main className={styles.interact}>
        {arbitratorDisputeID && <Redirect to={`/${network}/cases/${arbitratorDisputeID}`} />}
        {this.renderSearchForm()}
        <DisputeSummary
          metaevidenceJSON={metaevidence?.metaEvidenceJSON}
          ipfsGateway="https://cdn.kleros.link"
          arbitrated={arbitrated}
          arbitratorAddress={arbitratorAddress}
          arbitratorDisputeID={arbitratorDisputeID}
          arbitrableChainID={metaevidence?.metaEvidenceJSON?.arbitrableChainID ?? network}
          arbitratorChainID={metaevidence?.metaEvidenceJSON?.arbitratorChainID ?? network}
          chainID={network}
          web3Provider={web3Provider}
          loading={loading}
        />
        <DisputeDetails
          activeAddress={activeAddress}
          network={network}
          metaevidenceJSON={metaevidence?.metaEvidenceJSON}
          evidences={evidences}
          ipfsGateway="https://cdn.kleros.link"
          arbitrated={arbitrated}
          arbitratorAddress={arbitratorAddress}
          arbitratorDisputeID={arbitratorDisputeID}
          arbitratorDispute={arbitratorDispute}
          arbitratorDisputeDetails={arbitratorDisputeDetails}
          subcourts={subcourts}
          subcourtDetails={subcourtDetails}
          incompatible={incompatible}
          currentRuling={this.getCurrentRulingValue()}
          disputeEvent={disputeEvent}
          publishCallback={publishCallback}
          submitEvidenceCallback={this.submitEvidence}
          getAppealPeriodCallback={getAppealPeriodCallback}
          appealCost={appealCost}
          appealPeriod={appealPeriod}
          appealDecisions={appealDecisions}
          appealCallback={this.appeal}
          contributions={contributions}
          rulingFunded={rulingFunded}
          multipliers={multipliers}
          withdrawCallback={this.withdraw}
          totalWithdrawable={totalWithdrawable}
          exceptionalContractAddresses={this.props.exceptionalContractAddresses}
        />
      </main>
    );
  };
}

export default Interact;
