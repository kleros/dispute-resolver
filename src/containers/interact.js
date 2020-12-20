import React from "react";
import ReactDOM from "react-dom";
import { Card, Col, Container, Form, Row, Button, InputGroup, FormControl, Accordion } from "react-bootstrap";
import Appeal from "components/appeal";
import QuestionDisplay from "components/question-display";
import DisputeSummary from "components/disputeSummary";
import DisputeDetails from "components/disputeDetails";
import debounce from "lodash.debounce";
import ReactMarkdown from "react-markdown";
import { ReactComponent as GavelSVG } from "../assets/images/gavel.svg";
import { ReactComponent as AttachmentSVG } from "../assets/images/attachment.svg";
import { ReactComponent as Magnifier } from "../assets/images/magnifier.svg";

import { Redirect, Link } from "react-router-dom";
import Countdown from "react-countdown";
import BigNumber from "bignumber.js";

import styles from "containers/styles/interact.module.css";

const FALLBACK_ACTIVATION_DELAY_SECONDS = {
  1: 900, // Mainnet, 15 minutes
  42: 240, // Kovan, 4 minutes
};

class Interact extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      arbitratorDisputeID: this.props.route && this.props.route.match.params.id,
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

    this.debouncedRetrieveUsingArbitratorID = debounce(this.retrieveDisputeDetailsUsingArbitratorID, 500, { leading: false, trailing: true });
  }

  componentDidMount() {
    if (this.state.arbitratorDisputeID) this.debouncedRetrieveUsingArbitratorID(this.state.arbitratorDisputeID);
  }

  async componentDidUpdate(previousProperties) {
    if (this.props.disputeID !== previousProperties.disputeID) await this.setState({ arbitrableDisputeID: this.props.disputeID });
  }

  PERIODS = (periodNumber) => {
    const strings = [
      "Evidence Period",
      "Commit Period",
      "Vote Period",
      "Appeal Period",
      "Execution Period",
      "Greek gods having trouble finding this dispute...",
      `Dispute #${this.state.arbitratorDisputeID} doesn't belong to this arbitrable contract.`,
      `There is no such dispute. Are you in the correct network?`,
    ];

    return strings[periodNumber];
  };

  MESSAGES = (code) => {
    const strings = [`Fetching #${this.state.arbitratorDisputeID}`, "Failed to fetch, perhaps wrong network?"];

    return strings[code];
  };

  submitEvidence = async (evidence) => {
    console.log(this.state);
    await this.props.submitEvidenceCallback(this.state.arbitrated, {
      disputeID: this.state.arbitrableDisputeID,
      evidenceDescription: evidence.evidenceDescription,
      evidenceDocument: evidence.evidenceDocument,
      evidenceTitle: evidence.evidenceTitle,
      supportingSide: evidence.supportingSide,
    });
    console.log("submitted");
    new Promise(() => setTimeout(2000)).then(this.reload());
  };

  onDrop = async (acceptedFiles) => {
    this.setState({ fileInput: acceptedFiles[0] });

    var reader = new FileReader();
    reader.readAsArrayBuffer(acceptedFiles[0]);
    reader.addEventListener("loadend", async () => {
      const buffer = Buffer.from(reader.result);

      const result = await this.props.publishCallback(acceptedFiles[0].name, buffer);

      await this.setState({
        primaryDocument: `/ipfs/${result[1].hash}${result[0].path}`,
      });
    });
  };

  onModalShow = (e) => this.setState({ modalShow: true });
  onContributeModalShow = (e) => this.setState({ contributeModalShow: true });

  onControlChange = (e) => this.setState({ [e.target.id]: e.target.value });
  onInput = (e) => {
    this.setState({ evidenceFileURI: "" });
    this.setState({ fileInput: e.target.files[0] });
  };

  onContributeButtonClick = (e) => this.setState({ contributeModalShow: true });

  appeal = async (party, contribution) => this.props.appealCallback(this.state.arbitrated, this.state.arbitrableDisputeID, party, contribution);

  getWinnerMultiplier = async (arbitrableAddress) => {
    const winnerMultiplier = await this.props.getWinnerMultiplierCallback(arbitrableAddress);

    return winnerMultiplier;
  };

  onDisputeIDChange = async (e) => {
    const arbitratorDisputeID = e.target.value;

    await this.setState({ arbitratorDisputeID: arbitratorDisputeID, loading: true });

    await this.setState({
      arbitrableDisputeID: null,
      arbitrableDispute: null,
      arbitratorDispute: null,
    });
    await this.debouncedRetrieveUsingArbitratorID(arbitratorDisputeID);
  };

  getCurrentRuling = async (disputeIDOnArbitratorSide) => {
    let currentRuling;
    try {
      currentRuling = await this.props.getCurrentRulingCallback(disputeIDOnArbitratorSide);
    } catch (err) {
      console.error(err);
    } finally {
      return currentRuling;
    }
  };

  getRuling = async (arbitrableAddress, disputeIDOnArbitratorSide) => {
    let ruling;
    try {
      ruling = await this.props.getRulingCallback(arbitrableAddress, disputeIDOnArbitratorSide);
    } catch (err) {
    } finally {
      return ruling;
    }
  };

  retrieveDisputeDetailsUsingArbitratorID = async (arbitratorDisputeID) => {
    let arbitrated;

    this.setState({ interactionState: 0 });
    try {
      arbitrated = (await this.props.getArbitratorDisputeCallback(arbitratorDisputeID)).arbitrated;
      this.setState({ arbitrated });
    } catch (e) {
      console.error(e);
      this.setState({ interactionState: 1 });
      return;
    }

    this.setState({ arbitrated });

    await this.commonFetchRoutine(arbitrated, arbitratorDisputeID);
  };

  commonFetchRoutine = async (arbitrated, arbitratorDisputeID) => {
    let arbitratorDispute;
    let subcourtURI;
    let subcourt;
    let appealCost;

    try {
      arbitratorDispute = await this.props.getArbitratorDisputeCallback(arbitratorDisputeID);
      this.setState({
        arbitratorDispute,
        arbitratorDisputeDetails: await this.props.getArbitratorDisputeDetailsCallback(arbitratorDisputeID),
        arbitratorDisputeID,
        metaevidence: await this.props.getMetaEvidenceCallback(arbitrated, arbitratorDisputeID),
        evidences: await this.props.getEvidencesCallback(arbitrated, arbitratorDisputeID),
        ruling: await this.getRuling(arbitrated, arbitratorDisputeID),
        currentRuling: await this.getCurrentRuling(arbitratorDisputeID),
        disputeEvent: await this.props.getDisputeEventCallback(arbitrated, arbitratorDisputeID),
        getDisputeResult: await this.props.getDisputeCallback(arbitratorDisputeID),
        appealCost: await this.props.getAppealCostCallback(arbitratorDisputeID),
        appealPeriod: await this.props.getAppealPeriodCallback(arbitratorDisputeID),
      });
    } catch (err) {
      console.error(err.message);
      this.setState({ interactionState: 1 });
    } finally {
    }

    let arbitrableDisputeID;
    let arbitrableDispute;
    let multipliers;
    let withdrewAlready;
    let crowdfundingStatus;

    try {
      arbitrableDisputeID = await this.props.getArbitrableDisputeIDCallback(arbitrated, arbitratorDisputeID);
      arbitrableDispute = await this.props.getArbitrableDisputeCallback(arbitrated, arbitrableDisputeID);
      multipliers = await this.props.getMultipliersCallback(arbitrated);

      await this.setState({
        arbitrableDisputeID,
        arbitrableDispute,
        multipliers,
      });
    } catch (err) {
      console.error(err.message);
    }

    try {
      this.setState({ canPassPhase: await this.props.estimateGasOfPassPhaseCallback() });
    } catch {
      this.setState({ canPassPhase: false });
    }

    try {
      this.setState({ canPassPeriod: await this.props.estimateGasOfPassPeriodCallback(arbitratorDisputeID) });
    } catch {
      this.setState({ canPassPeriod: false });
    }

    try {
      this.setState({ canDrawJurors: await this.props.estimateGasOfDrawJurorsCallback(arbitratorDisputeID) });
    } catch {
      this.setState({ canDrawJurors: false });
    }

    this.setState({ appealDecisions: await this.props.getAppealDecisionCallback(arbitratorDisputeID) });

    this.setState({ loading: false });
  };

  reload = async () => {
    const { arbitrated, arbitratorDisputeID, arbitrableDisputeID } = this.state;
    this.setState({
      arbitratorDispute: await this.props.getArbitratorDisputeCallback(arbitratorDisputeID),
      evidences: await this.props.getEvidencesCallback(arbitrated, arbitratorDisputeID),
      appealDecisions: await this.props.getAppealDecisionCallback(arbitratorDisputeID),
    });

    try {
      this.setState({
        crowdfundingStatus: await this.props.getCrowdfundingStatusCallback(arbitrated, arbitrableDisputeID),
        withdrewAlready: await this.props.withdrewAlreadyCallback(arbitrated, arbitrableDisputeID),
      });
    } catch (error) {
      console.error(error);
    }

    try {
      this.setState({ canPassPhase: await this.props.estimateGasOfPassPhaseCallback() });
    } catch {
      this.setState({ canPassPhase: false });
    }

    try {
      this.setState({ canPassPeriod: await this.props.estimateGasOfPassPeriodCallback(arbitratorDisputeID) });
    } catch {
      this.setState({ canPassPeriod: false });
    }

    try {
      this.setState({ canDrawJurors: await this.props.estimateGasOfDrawJurorsCallback(arbitratorDisputeID) });
    } catch {
      this.setState({ canDrawJurors: false });
    }
  };

  getHumanReadablePeriod = (period) => this.PERIODS(period);

  render() {
    console.debug(this.props);
    console.debug(this.state);

    const {
      arbitrated,
      arbitrableDisputeID,
      arbitratorDispute,
      arbitratorDisputeDetails,
      arbitrableDispute,
      crowdfundingStatus,
      appealCost,
      arbitratorDisputeID,
      metaevidence,
      multipliers,
      evidences,
      currentRuling,
      ruling,
      withdrewAlready,
      getDisputeResult,
      disputeEvent,
      canPassPhase,
      canPassPeriod,
      canDrawJurors,
      appealPeriod,
    } = this.state;

    const {
      arbitratorAddress,
      activeAddress,
      publishCallback,
      withdrawFeesAndRewardsCallback,
      getCrowdfundingStatusCallback,
      getAppealPeriodCallback,
      getCurrentRulingCallback,
      passPhaseCallback,
      passPeriodCallback,
      drawJurorsCallback,
      subcourts,
      subcourtDetails,
      network,
    } = this.props;

    return (
      <>
        {Boolean(activeAddress) && !this.state.arbitrableDispute && !this.state.loading && (
          <div style={{ padding: "1.1em 1.5em", fontSize: "13px", background: "#ffe03d" }}>View mode only: This is a 3rd party arbitrable contract, evidence submission and crowdfunding appeals is not available.</div>
        )}
        <main className={styles.interact}>
          {arbitratorDisputeID && <Redirect to={`/cases/${arbitratorDisputeID}`} />}
          <div>
            <Row>
              <Col>
                <Form.Label>Search Disputes on Court</Form.Label>
                <InputGroup className={styles.search} size="md">
                  <InputGroup.Prepend>
                    <InputGroup.Text>
                      <Magnifier />
                    </InputGroup.Text>
                  </InputGroup.Prepend>
                  <FormControl className="purple-inverted" placeholder="Dispute ID" aria-label="Input dispute number from Court" aria-describedby="search" onChange={this.onDisputeIDChange} type="number" min="0" value={arbitratorDisputeID} id="arbitratorDisputeID" />
                </InputGroup>
              </Col>
            </Row>
          </div>
          <DisputeSummary metaevidenceJSON={metaevidence.metaEvidenceJSON} ipfsGateway="https://ipfs.kleros.io" arbitrated={arbitrated} arbitratorAddress={arbitratorAddress} arbitratorDisputeID={arbitratorDisputeID} />
          <DisputeDetails
            metaevidenceJSON={metaevidence.metaEvidenceJSON}
            evidences={evidences}
            ipfsGateway="https://ipfs.kleros.io"
            arbitrated={arbitrated}
            arbitratorAddress={arbitratorAddress}
            arbitratorDisputeID={arbitratorDisputeID}
            arbitratorDispute={arbitratorDispute}
            arbitratorDisputeDetails={arbitratorDisputeDetails}
            subcourts={subcourts}
            subcourtDetails={subcourtDetails}
            currentRuling={currentRuling}
            disputeEvent={disputeEvent}
            publishCallback={publishCallback}
            submitEvidenceCallback={this.submitEvidence}
          />
        </main>
      </>
    );
  }
}

export default Interact;
