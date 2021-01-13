import React from "react";
import ReactDOM from "react-dom";
import { Card, Col, Container, Form, Row, Button, InputGroup, FormControl, Accordion } from "react-bootstrap";
import Appeal from "components/appeal";
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
import { combinations } from "utils/combinations";

import styles from "containers/styles/interact.module.css";

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

  onControlChange = (e) => this.setState({ [e.target.id]: e.target.value });
  onInput = (e) => {
    this.setState({ evidenceFileURI: "" });
    this.setState({ fileInput: e.target.files[0] });
  };

  onContributeButtonClick = (e) => this.setState({ contributeModalShow: true });

  appeal = async (party, contribution) => this.props.appealCallback(this.state.arbitrated, this.state.arbitrableDisputeID, party, contribution).then(this.reload);

  withdraw = async () => {
    console.log([Object.keys(this.state.contributions).map((key) => parseInt(key))]);
    this.props.withdrawCallback(
      this.state.arbitrated,
      this.state.arbitrableDisputeID,
      Object.keys(this.state.contributions).map((key) => parseInt(key))
    );
  };

  getWithdrawAmount = async () =>
    this.props.getTotalWithdrawableAmountCallback(
      this.state.arbitrableDisputeID,
      Object.keys(this.state.contributions).map((key) => parseInt(key))
    );

  getWinnerMultiplier = async (arbitrableAddress) => {
    const winnerMultiplier = await this.props.getWinnerMultiplierCallback(arbitrableAddress);

    return winnerMultiplier;
  };

  onDisputeIDChange = async (e) => {
    const arbitratorDisputeID = e.target.value;

    await this.setState({ arbitratorDisputeID: arbitratorDisputeID, loading: true });

    await this.setState({
      arbitrableDisputeID: null,
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

    try {
      arbitrated = (await this.props.getArbitratorDisputeCallback(arbitratorDisputeID)).arbitrated;
      this.setState({ arbitrated });
    } catch (e) {
      console.log("err2");
      console.error(e);
      return;
    }

    this.setState({ arbitrated });

    await this.commonFetchRoutine(arbitrated, arbitratorDisputeID).then(this.setState({ loading: false }));
  };

  commonFetchRoutine = async (arbitrated, arbitratorDisputeID) => {
    // Optimize this function: too many awaits, you can parallelize some calls.

    let arbitratorDispute;
    let subcourtURI;
    let subcourt;
    let metaevidence;

    try {
      arbitratorDispute = await this.props.getArbitratorDisputeCallback(arbitratorDisputeID);
      metaevidence = await this.props.getMetaEvidenceCallback(arbitrated, arbitratorDisputeID);
      this.setState({
        arbitratorDispute,
        arbitratorDisputeDetails: await this.props.getArbitratorDisputeDetailsCallback(arbitratorDisputeID),
        arbitratorDisputeID,
        metaevidence,
        ruling: await this.getRuling(arbitrated, arbitratorDisputeID),
        currentRuling: await this.getCurrentRuling(arbitratorDisputeID),
        disputeEvent: await this.props.getDisputeEventCallback(arbitrated, arbitratorDisputeID),
        getDisputeResult: await this.props.getDisputeCallback(arbitratorDisputeID),
      });
    } catch (err) {
      console.log("err");
      console.error(err.message);
    } finally {
    }

    console.log("There");
    try {
      this.setState({
        evidences: await this.props.getEvidencesCallback(arbitrated, arbitratorDisputeID),
      });
    } catch (err) {
      console.log("err");
      console.error(err.message);
    } finally {
    }

    let arbitrableDisputeID;
    let multipliers;

    try {
      arbitrableDisputeID = await this.props.getArbitrableDisputeIDCallback(arbitrated, arbitratorDisputeID);
      multipliers = await this.props.getMultipliersCallback(arbitrated);

      await this.setState({
        arbitrableDisputeID,
        multipliers,
      });
    } catch (err) {
      console.error(err.message);
    }

    const appealDecisions = await this.props.getAppealDecisionCallback(arbitratorDisputeID);
    const contributions = await this.props.getContributionsCallback(arbitrableDisputeID, appealDecisions.length);
    const totalWithdrawable = await this.props.getTotalWithdrawableAmountCallback(
      arbitrableDisputeID,
      Object.keys(contributions).map((key) => parseInt(key))
    );
    await this.setState({ contributions, appealDecisions, totalWithdrawable });

    try {
      const rulingOptionType = metaevidence.metaEvidenceJSON.rulingOptions.type;
      console.log(rulingOptionType);
      let appealDeadlines = { 0: await this.props.getAppealPeriodCallback(arbitrableDisputeID, 0) },
        appealCosts = { 0: await this.props.getAppealCostOnArbitrableCallback(arbitrableDisputeID, 0) };

      switch (rulingOptionType) {
        case "single-select":
          await metaevidence.metaEvidenceJSON.rulingOptions.titles.map(async (key, index) => {
            appealDeadlines[index + 1] = await this.props.getAppealPeriodCallback(arbitrableDisputeID, index + 1);
            appealCosts[index + 1] = await this.props.getAppealCostOnArbitrableCallback(arbitrableDisputeID, index + 1);
          });
          break;

        case "multiple-select":
          Array.from(Array(2 ** metaevidence.metaEvidenceJSON.rulingOptions.titles.length).keys()).map(async (key) => {
            appealDeadlines[key + 1] = await this.props.getAppealPeriodCallback(arbitrableDisputeID, key + 1);
            appealCosts[key + 1] = await this.props.getAppealCostOnArbitrableCallback(arbitrableDisputeID, key + 1);
          });
          break;
        case "uint":
        case "int":
        case "string":
          Object.keys(contributions).map(async (key) => {
            appealDeadlines[key] = await this.props.getAppealPeriodCallback(arbitrableDisputeID, key);
            appealCosts[key] = await this.props.getAppealCostOnArbitrableCallback(arbitrableDisputeID, key);
          });
          break;
      }

      await this.setState({ appealDeadlines, appealCosts });
    } catch (err) {
      this.setState({ incompatible: true });
    }
  };

  reload = async () => {
    const { arbitrated, arbitratorDisputeID, arbitrableDisputeID } = this.state;
    this.setState({
      arbitratorDispute: await this.props.getArbitratorDisputeCallback(arbitratorDisputeID),
      evidences: await this.props.getEvidencesCallback(arbitrated, arbitratorDisputeID),
      appealDecisions: await this.props.getAppealDecisionCallback(arbitratorDisputeID),
    });

    try {
      const appealDeadlines = ["Refused to Rule"].concat(metaevidence.metaEvidenceJSON.rulingOptions.titles).map((title, index) => this.props.getAppealPeriodCallback(arbitrableDisputeID, index));
      const appealCosts = ["Refused to Rule"].concat(metaevidence.metaEvidenceJSON.rulingOptions.titles).map((title, index) => this.props.getAppealCostOnArbitrableCallback(arbitrableDisputeID, index));

      await this.setState({ appealDeadlines: await Promise.all(appealDeadlines), appealCosts: await Promise.all(appealCosts) });
    } catch (err) {
      console.error(err);
    }

    const appealDecisions = await this.props.getAppealDecisionCallback(arbitratorDisputeID);
    this.setState({ appealDecisions });
    await this.setState({ contributions: await this.props.getContributionsCallback(arbitrableDisputeID, appealDecisions.length) });
  };

  render() {
    console.debug(this.props);
    console.debug(this.state);

    const {
      arbitrated,
      arbitrableDisputeID,
      arbitratorDispute,
      arbitratorDisputeDetails,
      crowdfundingStatus,
      appealCosts,
      arbitratorDisputeID,
      metaevidence,
      multipliers,
      evidences,
      currentRuling,
      ruling,
      getDisputeResult,
      disputeEvent,
      appealDeadlines,
      appealDecisions,
      contributions,
      incompatible,
      totalWithdrawable,
    } = this.state;

    const { arbitratorAddress, activeAddress, appealCallback, publishCallback, withdrawCallback, getCrowdfundingStatusCallback, getAppealPeriodCallback, getCurrentRulingCallback, subcourts, subcourtDetails, network, getTotalWithdrawableAmountCallback } = this.props;

    return (
      <>
        {Boolean(activeAddress) && incompatible && (
          <div style={{ padding: "1rem 2rem", fontSize: "14px", background: "#ff9900", color: "white" }}>
            <b>View mode only:</b> the arbitrable contract of this dispute is not compatible with the interface of Dispute Resolver. You can't submit evidence or appeal.
          </div>
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
            activeAddress={activeAddress}
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
            getAppealPeriodCallback={getAppealPeriodCallback}
            appealDeadlines={appealDeadlines}
            appealCosts={appealCosts}
            appealDecisions={appealDecisions}
            appealCallback={this.appeal}
            contributions={contributions}
            multipliers={multipliers}
            withdrawCallback={this.withdraw}
            totalWithdrawable={totalWithdrawable}
          />
        </main>
      </>
    );
  }
}

export default Interact;
