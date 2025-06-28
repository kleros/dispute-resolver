import React from "react";
import { Col, Form, Row, InputGroup, FormControl } from "react-bootstrap";
import DisputeSummary from "components/disputeSummary";
import DisputeDetails from "components/disputeDetails";
import debounce from "lodash.debounce";
import { ReactComponent as Magnifier } from "../assets/images/magnifier.svg";

import { Redirect } from "react-router-dom";

import styles from "containers/styles/interact.module.css";
import { debug } from "prettier/doc";

class Interact extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      arbitratorDisputeID: (this.props.route && this.props.route.match.params.id) || 0,
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
      
      if (!dispute && !dispute?.arbitrated) {
        window.location.reload();
      }
      this.setState({ arbitrated: dispute.arbitrated });
    }

    if (this.props.disputeID !== previousProperties.disputeID) {
      this.setState({ arbitrableDisputeID: this.props.disputeID });
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
    console.debug(`Withdrawing these rulings: ${[Object.keys(this.state.contributions).map((key) => parseInt(key))]}`);
    try {
      // function signature withdrawFeesAndRewardsForAllRounds(uint256 _localDisputeID, address payable _contributor, uint256 _ruling);
      this.props.withdrawCallback(this.state.arbitrated, this.state.arbitrableDisputeID, this.state.selectedContribution, this.state.arbitrated);
    } catch {
      // function signature withdrawFeesAndRewardsForAllRounds(uint256 _localDisputeID, address payable _contributor, uint256[] memory _contributedTo);
      this.props.withdrawCallback(this.state.arbitrated, this.state.arbitrableDisputeID, this.state.selectedContribution, this.state.arbitrated);
    }
  };

  onDisputeIDChange = async (e) => {
    const arbitratorDisputeID = e.target.value;
    this.setState({
      metaevidence: undefined,
      arbitratorDisputeID: arbitratorDisputeID,
      loading: true,
      arbitrableDisputeID: null,
      arbitratorDispute: null,
    });
    await this.debouncedRetrieveUsingArbitratorID.cancel();
    await this.debouncedRetrieveUsingArbitratorID(arbitratorDisputeID);
  };

  getCurrentRuling = async (disputeIDOnArbitratorSide) => {
    try {
      return await this.props.getCurrentRulingCallback(disputeIDOnArbitratorSide);
    } catch (err) {
      console.error(err);
    }
  };

  getRuling = async (arbitrableAddress, disputeIDOnArbitratorSide) => {
    try {
      return await this.props.getRulingCallback(arbitrableAddress, disputeIDOnArbitratorSide);
    } catch (err) {
    }
  };

  retrieveDisputeDetailsUsingArbitratorID = async (arbitratorDisputeID) => {
    try {
      const { arbitrated } = await this.props.getArbitratorDisputeCallback(arbitratorDisputeID);

      if(!arbitrated) return;

      this.setState({ arbitrated });
      await this.commonFetchRoutine(arbitrated, arbitratorDisputeID);
    } catch (error) {
      console.error('Failed to retrieve dispute details:', error);
    } finally {
      this.setState({ loading: false });
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
        this.props.getArbitratorDisputeCallback(arbitratorDisputeID),
        this.props.getMetaEvidenceCallback(arbitrated, arbitratorDisputeID),
        this.props.getArbitratorDisputeDetailsCallback(arbitratorDisputeID),
        this.getRuling(arbitrated, arbitratorDisputeID),
        this.getCurrentRuling(arbitratorDisputeID),
        this.props.getDisputeEventCallback(arbitrated, arbitratorDisputeID),
        this.props.getDisputeCallback(arbitratorDisputeID),
        this.props.getEvidencesCallback(arbitrated, arbitratorDisputeID),
        this.props.getMultipliersCallback(arbitrated)
      ]);

      this.setState({
        arbitrableDisputeID,
        arbitratorDispute,
        arbitratorDisputeDetails,
        arbitratorDisputeID,
        metaevidence,
        ruling,
        currentRuling,
        disputeEvent,
        getDisputeResult,
        evidences,
        multipliers
      });

      const appealDecisions = await this.props.getAppealDecisionCallback(
        arbitratorDisputeID,
        disputeEvent.blockNumber
      );

      console.log('DEBUG - appealDecisions:', appealDecisions);
      console.log('DEBUG - appealDecisions.length:', appealDecisions.length);

      const [contributions, rulingFunded] = await Promise.all([
        this.props.getContributionsCallback(
          arbitrableDisputeID,
          appealDecisions.length,
          arbitrated,
          arbitratorDispute.period,
          appealDecisions.slice(-1)?.appealedAtBlockNumber
        ),
        this.props.getRulingFundedCallback(
          arbitrableDisputeID,
          appealDecisions.length,
          arbitrated,
          appealDecisions.slice(-1)?.appealedAtBlockNumber
        )
      ]);

      console.log('DEBUG - contributions:', contributions);
      console.log('DEBUG - rulingFunded from round', appealDecisions.length, ':', rulingFunded);

      // Let's also check if there are rulingFunded events in other rounds
      if (appealDecisions.length > 0) {
        for (let round = 0; round < appealDecisions.length; round++) {
          const rulingFundedInRound = await this.props.getRulingFundedCallback(
            arbitrableDisputeID,
            round,
            arbitrated,
            appealDecisions[round]?.appealedAtBlockNumber
          );
          console.log(`DEBUG - rulingFunded in round ${round}:`, rulingFundedInRound);
        }
      }

      this.setState({ contributions, appealDecisions, rulingFunded });

      if (parseInt(arbitratorDispute.period) >= 3) {
        const [appealCost, appealPeriod] = await Promise.all([
          this.props.getAppealCostCallback(arbitratorDisputeID),
          this.props.getAppealPeriodCallback(arbitratorDisputeID)
        ]);
        this.setState({ appealCost, appealPeriod });
      }

      if (parseInt(arbitratorDispute.period) === 4) {
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

    } catch (err) {
      console.error("Error in commonFetchRoutine:", err);
      this.setState({ incompatible: true });
    }
  };

  reload = async () => {
    const { arbitrated, arbitratorDisputeID, arbitrableDisputeID } = this.state;

    try {
      const [
        arbitratorDispute,
        evidences,
        appealDecisions,
        arbitratorDisputeDetails
      ] = await Promise.all([
        this.props.getArbitratorDisputeCallback(arbitratorDisputeID),
        this.props.getEvidencesCallback(arbitrated, arbitratorDisputeID),
        this.props.getAppealDecisionCallback(arbitratorDisputeID),
        this.props.getArbitratorDisputeDetailsCallback(arbitratorDisputeID)
      ]);

      console.debug("Reloading dispute data:", {
        arbitratorDisputeID,
        arbitrated,
        arbitratorDispute,
        evidences,
        appealDecisions,
        arbitratorDisputeDetails
      });

      const contributions = await this.props.getContributionsCallback(
        arbitrableDisputeID,
        appealDecisions.length,
        arbitrated,
        arbitratorDispute.period
      );

      this.setState({
        arbitratorDispute,
        evidences,
        appealDecisions,
        arbitratorDisputeDetails,
        contributions
      });

    } catch (err) {
      console.error('Failed to reload dispute data:', err);
    }
  };

  render() {
    const {
      arbitrated,
      arbitratorDispute,
      arbitratorDisputeDetails,
      appealCost,
      appealPeriod,
      arbitratorDisputeID,
      metaevidence,
      multipliers,
      evidences,
      currentRuling,
      disputeEvent,
      appealDecisions,
      contributions,
      rulingFunded,
      incompatible,
      totalWithdrawable,
      loading,
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

    if (!loading && !arbitrated) {
      return (
      <div style={{ 
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '2rem'
      }}>
        <h2 style={{fontSize:"18px"}}>Dispute with ID {arbitratorDisputeID} does not exist on this network.</h2>
        <button 
        className="btn btn-primary"
        onClick={() => window.location.href = `/${network}/ongoing`}
        >
        View Ongoing Disputes
        </button>
      </div>
      );
    }

    return (
      <>
        {Boolean(activeAddress) && incompatible && (
          <div style={{ padding: "1rem 2rem", fontSize: "14px", background: "#fafafa" }}>
            <b>View mode only:</b> the arbitrable contract of this dispute is not compatible with the interface of Dispute Resolver. You can't submit evidence or fund appeal on
            this interface. You can do these on the arbitrable application, if implemented.
          </div>
        )}
        {arbitrated && (
          <main className={styles.interact}>
            {arbitratorDisputeID && <Redirect to={`/${network}/cases/${arbitratorDisputeID}`} />}
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
            <DisputeSummary
              metaevidenceJSON={metaevidence && metaevidence.metaEvidenceJSON}
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
              metaevidenceJSON={metaevidence && metaevidence.metaEvidenceJSON}
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
              currentRuling={
                metaevidence?.metaEvidenceJSON?.rulingOptions?.type === "hash" 
                  ? currentRuling 
                  : parseInt(currentRuling)
              }
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
        )}
      </>
    );
  }
}

export default Interact;
