import React from "react";
import PropTypes from "prop-types";
import { Col, Form, Row, InputGroup, FormControl } from "react-bootstrap";
import DisputeSummary from "components/disputeSummary";
import DisputeDetails from "components/disputeDetails";
import { isGovernorWithEvidenceSupport } from "ethereum/network-contract-mapping";
import { ReactComponent as Magnifier } from "../assets/images/magnifier.svg";

import styles from "containers/styles/interact.module.css";

const DISPUTE_PERIOD_APPEAL = 3;
const DISPUTE_PERIOD_EXECUTION = 4;

//Everything the page knows about one case. null marks data that could not be loaded, which renders as unavailable rather than as a default.
const EMPTY_CASE = {
  arbitrated: null,
  arbitrableDisputeID: null,
  incompatible: false,
  arbitratorDispute: null,
  metaevidence: null,
  arbitratorDisputeDetails: null,
  ruling: null,
  currentRuling: null,
  disputeEvent: null,
  evidences: null,
  multipliers: null,
  appealDecisions: null,
  contributions: null,
  rulingFunded: null,
  appealCost: null,
  appealPeriod: null,
  totalWithdrawable: null,
  aggregatedContributions: null,
  selectedContribution: null,
};

//Resolves null instead of rejecting so that one failed read only hides its own section.
const unavailable = async (read, name) => {
  try {
    return await read();
  } catch (error) {
    console.warn(`${name} failed:`, error?.message ?? error);
    return null;
  }
};

class Interact extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      arbitratorDisputeID: this.getRouteDisputeID(),
      loading: false,
      //True once every read the page shows has finished, so the case renders in one go instead of section by section.
      ready: false,
      loadError: null,
      notFound: false,
      ...EMPTY_CASE,
    };
    //Bumped on every load and navigation so a slow earlier response can never overwrite a newer one.
    this.loadVersion = 0;
  }

  getRouteDisputeID = (route = this.props.route) => route?.match?.params?.id ?? "";

  componentDidMount() {
    const arbitratorDisputeID = this.getRouteDisputeID();
    if (arbitratorDisputeID) this.load(arbitratorDisputeID);
  }

  componentDidUpdate(previousProperties) {
    const arbitratorDisputeID = this.getRouteDisputeID();

    if (arbitratorDisputeID !== this.getRouteDisputeID(previousProperties.route)) {
      this.setState({ arbitratorDisputeID });
      if (arbitratorDisputeID) this.load(arbitratorDisputeID);
      else this.clear();
      return;
    }

    if (this.props.network !== previousProperties.network && arbitratorDisputeID) this.load(arbitratorDisputeID);
  }

  componentWillUnmount() {
    this.loadVersion++;
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
    await this.reload();
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

  //Typing only edits the search box. The dispute ID in the URL decides which case is shown.
  onDisputeIDChange = event => this.setState({ arbitratorDisputeID: event.target.value });

  //Enter or the search button opens the typed case as a new history entry, so Back returns to the previous case.
  //With a router the URL changes and componentDidUpdate loads the case; without one (unit tests) the case is loaded directly.
  onSearchSubmit = event => {
    event.preventDefault();
    const arbitratorDisputeID = this.state.arbitratorDisputeID.trim();
    if (!arbitratorDisputeID || arbitratorDisputeID === this.getRouteDisputeID()) return;

    const history = this.props.route?.history;
    if (history) history.push(`/${this.props.network}/cases/${arbitratorDisputeID}`);
    else this.load(arbitratorDisputeID);
  };

  clear = () => {
    this.loadVersion++;
    this.setState({ loading: false, ready: false, loadError: null, notFound: false, ...EMPTY_CASE });
  };

  //Loads the case of the given arbitrator dispute ID. A missing dispute and a failed read are different states.
  //A silent load (after a write) keeps the page as it is and updates it in place.
  load = async (arbitratorDisputeID, { silent = false } = {}) => {
    const version = ++this.loadVersion;
    if (!silent) this.setState({ loading: true, ready: false, loadError: null, notFound: false, ...EMPTY_CASE });

    let arbitratorDispute;
    try {
      arbitratorDispute = await this.props.getArbitratorDisputeCallback(arbitratorDisputeID);
    } catch (error) {
      console.error(`Failed to load dispute ${arbitratorDisputeID}:`, error);
      if (version === this.loadVersion) this.setState({ loading: false, ready: false, loadError: error?.message || String(error), ...EMPTY_CASE });
      return;
    }
    if (version !== this.loadVersion) return;

    if (!arbitratorDispute) {
      this.setState({ loading: false, ready: false, notFound: true, ...EMPTY_CASE });
      return;
    }

    const arbitrated = arbitratorDispute.arbitrated;
    if (typeof arbitrated !== "string" || !arbitrated) {
      this.setState({ loading: false, ready: false, loadError: "The arbitrator returned a dispute without an arbitrable contract address.", ...EMPTY_CASE });
      return;
    }

    //Everything the page shows is read before it renders, so it appears at once.
    const coreData = await this.loadCoreData(arbitrated, arbitratorDisputeID);
    if (version !== this.loadVersion) return;
    this.setState({ arbitrated, arbitratorDispute, ...coreData, ready: true });

    //The appeal card keeps its placeholder until the crowdfunding reads finish, then updates once.
    const appealData = await this.loadAppealData(arbitrated, arbitratorDisputeID, arbitratorDispute, coreData);
    if (version !== this.loadVersion) return;
    this.setState({ ...appealData, loading: false });
  };

  reload = async () => {
    if (this.state.arbitratorDisputeID) await this.load(this.state.arbitratorDisputeID, { silent: true });
  };

  //The reads behind every section of the page, in parallel. The appeal decisions follow the dispute event they start from.
  loadCoreData = async (arbitrated, arbitratorDisputeID) => {
    const { network } = this.props;

    const disputeEventAndAppeals = unavailable(() => this.props.getDisputeEventCallback(arbitrated, arbitratorDisputeID), "getDisputeEventCallback").then(async disputeEvent => ({
      disputeEvent,
      appealDecisions: await unavailable(() => this.props.getAppealDecisionCallback(arbitratorDisputeID, disputeEvent?.blockNumber || 0), "getAppealDecisionCallback"),
    }));

    const [arbitrableDisputeID, metaevidence, arbitratorDisputeDetails, ruling, currentRuling, { disputeEvent, appealDecisions }, evidences, multipliers] = await Promise.all([
      unavailable(() => this.props.getArbitrableDisputeIDCallback(arbitrated, arbitratorDisputeID), "getArbitrableDisputeIDCallback"),
      unavailable(() => this.props.getMetaEvidenceCallback(arbitrated, arbitratorDisputeID), "getMetaEvidenceCallback"),
      unavailable(() => this.props.getArbitratorDisputeDetailsCallback(arbitratorDisputeID), "getArbitratorDisputeDetailsCallback"),
      unavailable(() => this.props.getRulingCallback(arbitrated, arbitratorDisputeID), "getRulingCallback"),
      unavailable(() => this.props.getCurrentRulingCallback(arbitratorDisputeID), "getCurrentRulingCallback"),
      disputeEventAndAppeals,
      unavailable(() => this.props.getEvidencesCallback(arbitrated, arbitratorDisputeID), "getEvidencesCallback"),
      unavailable(() => this.props.getMultipliersCallback(arbitrated), "getMultipliersCallback"),
    ]);

    //getArbitrableDisputeIDCallback resolves null when the arbitrable does not implement IDisputeResolver.
    //Evidence submission then is currently only supported for governor contracts.
    const incompatible = arbitrableDisputeID == null && !isGovernorWithEvidenceSupport(network, arbitrated);

    return { arbitrableDisputeID, incompatible, metaevidence, arbitratorDisputeDetails, ruling, currentRuling, disputeEvent, appealDecisions, evidences, multipliers };
  };

  //The crowdfunding state of the current round and, from the appeal period on, the appeal cost and period.
  loadAppealData = async (arbitrated, arbitratorDisputeID, arbitratorDispute, { arbitrableDisputeID, appealDecisions, disputeEvent }) => {
    const period = Number.parseInt(arbitratorDispute.period, 10);
    //Without the appeal history the current round is unknown, so the crowdfunding state cannot be read either.
    const hasAppealHistory = Array.isArray(appealDecisions);
    const searchFrom = appealDecisions?.at(-1)?.appealedAtBlockNumber;

    const [contributions, rulingFunded, appealCost, appealPeriod] = await Promise.all([
      hasAppealHistory
        ? unavailable(() => this.props.getContributionsCallback(arbitrableDisputeID, appealDecisions.length, arbitrated, arbitratorDispute.period, searchFrom), "getContributionsCallback")
        : null,
      hasAppealHistory
        ? unavailable(() => this.props.getRulingFundedCallback(arbitrableDisputeID, appealDecisions.length, arbitrated, searchFrom), "getRulingFundedCallback")
        : null,
      period >= DISPUTE_PERIOD_APPEAL ? unavailable(() => this.props.getAppealCostCallback(arbitratorDisputeID), "getAppealCostCallback") : null,
      period >= DISPUTE_PERIOD_APPEAL ? unavailable(() => this.props.getAppealPeriodCallback(arbitratorDisputeID), "getAppealPeriodCallback") : null,
    ]);

    const withdrawable =
      period === DISPUTE_PERIOD_EXECUTION && hasAppealHistory && contributions
        ? await this.loadWithdrawableAmount(arbitrated, arbitrableDisputeID, arbitratorDispute, appealDecisions, disputeEvent, contributions)
        : {};

    return { contributions, rulingFunded, appealCost, appealPeriod, ...withdrawable };
  };

  //Resolves the withdrawable amount of the connected account, or nothing when a contribution round could not be read.
  loadWithdrawableAmount = async (arbitrated, arbitrableDisputeID, arbitratorDispute, appealDecisions, disputeEvent, contributions) => {
    const contributionsOfPastRounds = await Promise.all(
      Array.from({ length: appealDecisions.length }, (_, round) =>
        unavailable(() => this.props.getContributionsCallback(arbitrableDisputeID, round, arbitrated, arbitratorDispute.period, disputeEvent?.blockNumber), "getContributionsCallback")
      )
    );
    if (contributionsOfPastRounds.some(roundContributions => roundContributions == null)) return {};

    const aggregatedContributions = this.sumObjectsByKey(...contributionsOfPastRounds, contributions);
    const totalWithdrawable = await unavailable(
      () => this.props.getTotalWithdrawableAmountCallback(arbitrableDisputeID, Object.keys(aggregatedContributions), arbitrated),
      "getTotalWithdrawableAmountCallback"
    );

    return {
      totalWithdrawable: totalWithdrawable?.amount ?? null,
      aggregatedContributions,
      selectedContribution: totalWithdrawable?.ruling ?? null,
    };
  };

  getFeedbackStyle = () => ({
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '2rem'
  });

  renderNoDisputeFound = () => {
    const { arbitratorDisputeID } = this.state;
    const { network } = this.props;

    return (
      <div style={this.getFeedbackStyle()}>
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

  renderLoadError = () => {
    const { arbitratorDisputeID, loadError } = this.state;
    const { network } = this.props;

    return (
      <div style={this.getFeedbackStyle()} role="alert">
        <h2 style={{ fontSize: "18px" }}>Failed to load dispute with ID {arbitratorDisputeID}.</h2>
        <p>There may be a problem with the RPC endpoint. Please try again.</p>
        <p><small>{loadError}</small></p>
        <div>
          <button className="btn btn-primary mr-3" onClick={() => this.load(arbitratorDisputeID)}>
            Try again
          </button>
          <button className="btn btn-secondary" onClick={() => window.location.href = `/${network}/ongoing`}>
            View Ongoing Disputes
          </button>
        </div>
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

  renderSearchForm = (network) => {
    const { arbitratorDisputeID } = this.state;
    const courtURL = new URL(`https://court.kleros.io/cases/${encodeURIComponent(arbitratorDisputeID)}`);
    courtURL.searchParams.set("requiredChainId", network ?? "1");

    return (
      <Form onSubmit={this.onSearchSubmit}>
        <Row>
          <Col>
            <Form.Label htmlFor="arbitratorDisputeID">
              Search Disputes on <a href={courtURL.toString()} target="_blank" rel="noreferrer noopener">Court</a>
            </Form.Label>
            <InputGroup className={styles.search} size="md">
              <InputGroup.Prepend>
                <InputGroup.Text as="button" type="submit" aria-label="Open dispute">
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
      </Form>
    );
  };

  //The current ruling as the string DisputeDetails expects, or null when it could not be read.
  getCurrentRulingValue = () => {
    const { metaevidence, currentRuling } = this.state;
    if (currentRuling == null) return null;

    // Always return string for consistent type handling (TypeScript preparation)
    // Hash types: convert to string to preserve precision for large numbers
    if (metaevidence?.metaEvidenceJSON?.rulingOptions?.type === "hash") {
      return String(currentRuling); // Preserve precision by converting to string
    }

    //Rulings are uint256 values; free-value questions use the whole range, which parseInt would round.
    try {
      return BigInt(currentRuling).toString();
    } catch {
      const parsed = Number.parseInt(currentRuling, 10);
      return Number.isNaN(parsed) ? null : String(parsed);
    }
  };

  render() {
    const { arbitratorDisputeID, loading, ready, loadError, notFound, arbitrated, incompatible, metaevidence } = this.state;
    const { network } = this.props;

    if (notFound) return this.renderNoDisputeFound();
    if (loadError) return this.renderLoadError();

    const isGenericMetaEvidence = metaevidence?.metaEvidenceJSON?.category === "Non-Standard Contract";
    const shouldShowWarning = ready && (incompatible || isGenericMetaEvidence);

    return (
      <>
        {shouldShowWarning && this.renderIncompatibleWarning()}
        <main className={styles.interact} aria-busy={loading}>
          {this.renderSearchForm(network)}
          {loading && !ready && <div role="status" aria-live="polite">Fetching dispute #{arbitratorDisputeID}…</div>}
          {ready && arbitrated && this.renderCase()}
        </main>
      </>
    );
  }

  renderCase = () => {
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
      subcourtsLoading,
      network,
      web3Provider,
      isAuthenticated,
      isSigningIn,
      onSignIn,
      now,
    } = this.props;

    return (
      <>
        <DisputeSummary
          metaevidenceJSON={metaevidence?.metaEvidenceJSON}
          arbitrated={arbitrated}
          arbitratorAddress={arbitratorAddress}
          arbitratorDisputeID={arbitratorDisputeID}
          arbitrableChainID={metaevidence?.metaEvidenceJSON?.arbitrableChainID ?? network}
          arbitratorChainID={metaevidence?.metaEvidenceJSON?.arbitratorChainID ?? network}
          chainID={network}
          web3Provider={web3Provider}
        />
        <DisputeDetails
          activeAddress={activeAddress}
          network={network}
          metaevidenceJSON={metaevidence?.metaEvidenceJSON}
          evidences={evidences}
          arbitrated={arbitrated}
          arbitratorAddress={arbitratorAddress}
          arbitratorDisputeID={arbitratorDisputeID}
          arbitratorDispute={arbitratorDispute}
          arbitratorDisputeDetails={arbitratorDisputeDetails}
          loading={loading}
          subcourts={subcourts}
          subcourtDetails={subcourtDetails}
          subcourtsLoading={subcourtsLoading}
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
          isAuthenticated={isAuthenticated}
          isSigningIn={isSigningIn}
          onSignIn={onSignIn}
          now={now}
        />
      </>
    );
  };
}

Interact.propTypes = {
  isAuthenticated: PropTypes.bool.isRequired,
  isSigningIn: PropTypes.bool.isRequired,
  onSignIn: PropTypes.func.isRequired,
  subcourtsLoading: PropTypes.bool,
  now: PropTypes.func,
};

export default Interact;
