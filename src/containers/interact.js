import React from "react";
import PropTypes from "prop-types";
import { Form, FormControl, Spinner } from "react-bootstrap";
import DisputeSummary from "components/disputeSummary";
import DisputeDetails from "components/disputeDetails";
import AlertMessage from "components/alertMessage";
import { isGovernorWithEvidenceSupport } from "ethereum/network-contract-mapping";
import { ReactComponent as Magnifier } from "../assets/images/magnifier.svg";
import { ReactComponent as ScalesSVG } from "../assets/images/scales.svg";

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
      //The dispute shown or being loaded; the search box has its own value until it is submitted.
      arbitratorDisputeID: this.getRouteDisputeID(),
      searchQuery: this.getRouteDisputeID(),
      loading: false,
      //True once every read the page shows has finished, so the case renders in one go instead of section by section.
      ready: false,
      loadError: null,
      notFound: false,
      //The last write action (fund, withdraw, submit evidence) and how it went, shown next to its section until dismissed.
      writeStatus: null,
      ...EMPTY_CASE,
    };
    //Bumped on every load and navigation so a slow earlier response can never overwrite a newer one.
    this.loadVersion = 0;
    //Bumped whenever the page changes case or is left, so the outcome of a write started on another case is dropped.
    this.caseVersion = 0;
  }

  getRouteDisputeID = (route = this.props.route) => route?.match?.params?.id ?? "";

  componentDidMount() {
    const arbitratorDisputeID = this.getRouteDisputeID();
    if (arbitratorDisputeID) this.load(arbitratorDisputeID);
  }

  componentDidUpdate(previousProperties) {
    const arbitratorDisputeID = this.getRouteDisputeID();

    if (arbitratorDisputeID !== this.getRouteDisputeID(previousProperties.route)) {
      this.setState({ arbitratorDisputeID, searchQuery: arbitratorDisputeID });
      if (arbitratorDisputeID) this.load(arbitratorDisputeID);
      else this.clear();
      return;
    }

    if (this.props.network !== previousProperties.network && arbitratorDisputeID) this.load(arbitratorDisputeID);
  }

  componentWillUnmount() {
    this.loadVersion++;
    this.caseVersion++;
  }

  sumObjectsByKey(...objs) {
    return objs.reduce((a, b) => {
      for (let k in b) {
        if (b.hasOwnProperty(k)) a[k] = (a[k] || 0) + b[k];
      }
      return a;
    }, {});
  }

  //The feedback of a write belongs to the case it was started on (its caseVersion); a stale outcome is dropped.
  setWriteStatus = (version, action, status, details = {}) => {
    if (version === this.caseVersion) this.setState({ writeStatus: { action, status, ...details } });
  };

  dismissWriteStatus = () => this.setState({ writeStatus: null });

  submitEvidence = async (evidence) => {
    const version = this.caseVersion;
    this.setWriteStatus(version, "evidence", "pending");
    let receipt;
    try {
      receipt = await this.props.submitEvidenceCallback(this.state.arbitrated, {
        disputeID: this.state.arbitrableDisputeID,
        evidenceDescription: evidence.evidenceDescription,
        evidenceDocument: evidence.evidenceDocument,
        evidenceTitle: evidence.evidenceTitle,
        supportingSide: evidence.supportingSide,
      });
    } catch (error) {
      this.setWriteStatus(version, "evidence", "failure", { error: error?.message ?? String(error) });
      throw error;
    }
    if (version !== this.caseVersion) return;
    await this.reload();
    this.setWriteStatus(version, "evidence", "success", { hash: receipt?.hash });
  };

  //App.appeal resolves null instead of rejecting when the transaction failed; the case is reloaded either way, as before.
  //A rejected call (for example a transaction refused in the wallet) is reported as a failure and, as before, not reloaded.
  appeal = async (party, contribution) => {
    const version = this.caseVersion;
    this.setWriteStatus(version, "fund", "pending");
    let receipt;
    try {
      receipt = await this.props.appealCallback(this.state.arbitrated, this.state.arbitrableDisputeID, party, contribution);
    } catch (error) {
      this.setWriteStatus(version, "fund", "failure", { error: error?.message ?? String(error) });
      throw error;
    }
    if (version !== this.caseVersion) return receipt;
    if (!receipt) this.setWriteStatus(version, "fund", "failure");
    await this.reload();
    if (receipt) this.setWriteStatus(version, "fund", "success", { hash: receipt.hash });
    return receipt;
  };

  withdraw = async () => {
    // Guard against null or undefined selectedContribution
    if (this.state.selectedContribution == null) {
      console.error('Cannot withdraw: no valid ruling found');
      return;
    }

    const version = this.caseVersion;
    this.setWriteStatus(version, "withdraw", "pending");
    //As before, only a call that throws is retried with the alternative signature; a rejected transaction is not sent again.
    let attempt;
    try {
      // function signature withdrawFeesAndRewardsForAllRounds(uint256 _localDisputeID, address payable _contributor, uint256 _ruling);
      attempt = this.props.withdrawCallback(this.state.arbitrated, this.state.arbitrableDisputeID, this.state.selectedContribution, this.state.arbitrated);
    } catch (err) {
      // function signature withdrawFeesAndRewardsForAllRounds(uint256 _localDisputeID, address payable _contributor, uint256[] memory _contributedTo);
      console.error('First withdraw attempt failed, trying alternative signature:', err);
      attempt = this.props.withdrawCallback(this.state.arbitrated, this.state.arbitrableDisputeID, this.state.selectedContribution, this.state.arbitrated);
    }

    let receipt;
    try {
      receipt = await attempt;
    } catch (error) {
      this.setWriteStatus(version, "withdraw", "failure", { error: error?.message ?? String(error) });
      return;
    }
    //App.withdrawFeesAndRewardsForAllRounds resolves null when the transaction failed.
    if (receipt) this.setWriteStatus(version, "withdraw", "success", { hash: receipt.hash });
    else this.setWriteStatus(version, "withdraw", "failure");
  };

  //Typing only edits the search box; nothing else changes until the search is submitted.
  onDisputeIDChange = event => this.setState({ searchQuery: event.target.value });

  //Enter or the search button opens the typed case as a new history entry, so Back returns to the previous case.
  //With a router the URL changes and componentDidUpdate loads the case; without one (unit tests) the case is loaded directly.
  onSearchSubmit = event => {
    event.preventDefault();
    const arbitratorDisputeID = this.state.searchQuery.trim();
    if (!arbitratorDisputeID || arbitratorDisputeID === this.getRouteDisputeID()) return;

    const history = this.props.route?.history;
    if (history) history.push(`/${this.props.network}/cases/${arbitratorDisputeID}`);
    else this.load(arbitratorDisputeID);
  };

  clear = () => {
    this.loadVersion++;
    this.caseVersion++;
    this.setState({ loading: false, ready: false, loadError: null, notFound: false, writeStatus: null, ...EMPTY_CASE });
  };

  //Loads the case of the given arbitrator dispute ID. A missing dispute and a failed read are different states.
  //A silent load (after a write) keeps the page as it is and updates it in place.
  load = async (arbitratorDisputeID, { silent = false } = {}) => {
    const version = ++this.loadVersion;
    if (!silent) {
      this.caseVersion++;
      this.setState({ arbitratorDisputeID, loading: true, ready: false, loadError: null, notFound: false, writeStatus: null, ...EMPTY_CASE });
    }

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

  //The states without a case (not found, failed) keep the search box so another ID can be tried right away.
  renderNoDisputeFound = () => (
    <div className={styles.casePage}>
      <div className={styles.content}>
        {this.renderSearchForm()}
        <div className={styles.feedback}>
          <ScalesSVG className={styles.feedbackIcon} aria-hidden="true" />
          <h2>Dispute with ID {this.state.arbitratorDisputeID} does not exist on this network.</h2>
          <p>Check the ID, or pick a case from the list of open disputes.</p>
          <div className={styles.feedbackActions}>
            <button type="button" className={styles.action} onClick={() => window.location.href = `/${this.props.network}/ongoing`}>
              View Ongoing Disputes
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  renderLoadError = () => {
    const { arbitratorDisputeID, loadError } = this.state;

    return (
      <div className={styles.casePage}>
        <div className={styles.content}>
          {this.renderSearchForm()}
          <div className={styles.feedback} role="alert">
            <ScalesSVG className={styles.feedbackIcon} aria-hidden="true" />
            <h2>Failed to load dispute with ID {arbitratorDisputeID}.</h2>
            <p>There may be a problem with the RPC endpoint. Please try again.</p>
            <p><small>{loadError}</small></p>
            <div className={styles.feedbackActions}>
              <button type="button" className={styles.action} onClick={() => this.load(arbitratorDisputeID)}>
                Try again
              </button>
              <button type="button" className={styles.secondaryAction} onClick={() => window.location.href = `/${this.props.network}/ongoing`}>
                View Ongoing Disputes
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  //The landing of /cases/ without an ID: a dispute is opened by its arbitrator dispute ID.
  renderLanding = () => (
    <main className={styles.casePage}>
      <div className={styles.content}>
        <section className={styles.landing}>
          <ScalesSVG className={styles.feedbackIcon} aria-hidden="true" />
          <h1>Find a dispute</h1>
          {this.renderSearchForm({ landing: true })}
        </section>
      </div>
    </main>
  );

  renderIncompatibleWarning = () => {
    const { metaevidence, arbitrated } = this.state;
    const isGenericMetaEvidence = metaevidence?.metaEvidenceJSON?.category === "Non-Standard Contract";

    if (isGenericMetaEvidence) {
      return (
        <AlertMessage
          type="warning"
          extraClass={styles.warning}
          title="Non-standard contract"
          content={
            <>
              This arbitrable contract doesn't follow standard Kleros patterns. The dispute information shown is generic. Limited functionality is available - you may not be able
              to submit evidence or fund appeals through this interface.
              <br />
              <small>Contract: {arbitrated}</small>
            </>
          }
        />
      );
    }

    return (
      <AlertMessage
        type="warning"
        extraClass={styles.warning}
        title="View mode only"
        content="The arbitrable contract of this dispute is not compatible with the interface of Dispute Resolver. You can't submit evidence or fund an appeal here. You can do these on the arbitrable application, if implemented."
      />
    );
  };

  renderSearchForm = ({ landing = false } = {}) => (
    <Form onSubmit={this.onSearchSubmit} className={landing ? styles.landingForm : styles.toolbar} role="search">
      <div className={styles.searchRow}>
        <div className={styles.searchControl}>
          <Magnifier aria-hidden="true" />
          <FormControl
            className={styles.search}
            placeholder="Dispute ID"
            aria-label="Dispute ID from Court"
            autoComplete="off"
            onChange={this.onDisputeIDChange}
            type="number"
            min="0"
            value={this.state.searchQuery}
            id="arbitratorDisputeID"
          />
        </div>
        <button type="submit" className={styles.action}>
          Open dispute
        </button>
      </div>
    </Form>
  );

  //Placeholders in the shape of the case, shown until every core read has finished.
  renderLoadingCase = () => (
    <>
      <div className={styles.loadingStatus} role="status" aria-live="polite">
        <Spinner as="span" animation="border" size="sm" aria-hidden="true" />
        <span>Fetching dispute #{this.state.arbitratorDisputeID}…</span>
      </div>
      <div aria-hidden="true">
        <div className={styles.skeletonCard}>
          <span className={`skeleton ${styles.skeletonPill}`} />
          <span className={`skeleton ${styles.skeletonTitle}`} />
          <div className={styles.skeletonRow}>
            <span className={`skeleton ${styles.skeletonFact}`} />
            <span className={`skeleton ${styles.skeletonFact}`} />
            <span className={`skeleton ${styles.skeletonFact}`} />
          </div>
          <span className={`skeleton ${styles.skeletonLine}`} />
        </div>
        <div className={styles.skeletonCard}>
          <span className={`skeleton ${styles.skeletonHeading}`} />
          <span className={`skeleton ${styles.skeletonLine}`} />
          <span className={`skeleton ${styles.skeletonLine}`} />
          <span className={`skeleton ${styles.skeletonShortLine}`} />
        </div>
        <div className={styles.skeletonCard}>
          <span className={`skeleton ${styles.skeletonHeading}`} />
          <span className={`skeleton ${styles.skeletonLine}`} />
          <span className={`skeleton ${styles.skeletonShortLine}`} />
        </div>
      </div>
    </>
  );

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
    const { loading, ready, loadError, notFound, arbitrated, incompatible, metaevidence } = this.state;

    if (notFound) return this.renderNoDisputeFound();
    if (loadError) return this.renderLoadError();
    if (!this.getRouteDisputeID() && !loading && !ready) return this.renderLanding();

    const isGenericMetaEvidence = metaevidence?.metaEvidenceJSON?.category === "Non-Standard Contract";
    const shouldShowWarning = ready && (incompatible || isGenericMetaEvidence);

    return (
      <main className={styles.casePage} aria-busy={loading}>
        <div className={styles.content}>
          {this.renderSearchForm()}
          {shouldShowWarning && this.renderIncompatibleWarning()}
          {loading && !ready && this.renderLoadingCase()}
          {ready && arbitrated && this.renderCase()}
        </div>
      </main>
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
      arbitrated,
      writeStatus,
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

    const summary = (
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
    );

    return (
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
        summary={summary}
        writeStatus={writeStatus}
        onDismissWriteStatus={this.dismissWriteStatus}
      />
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
