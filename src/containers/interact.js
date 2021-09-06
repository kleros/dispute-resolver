import React from "react";
import ReactDOM from "react-dom";
import { Card, Col, Container, Form, Row, Button, InputGroup, FormControl, Accordion } from "react-bootstrap";
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

class Interact extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      arbitratorDisputeID: (this.props.route && this.props.route.match.params.id) || 700,
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

  componentDidUpdate(previousProperties) {
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
    console.debug(this.state);
    await this.props.submitEvidenceCallback(this.state.arbitrated, {
      disputeID: this.state.arbitrableDisputeID,
      evidenceDescription: evidence.evidenceDescription,
      evidenceDocument: evidence.evidenceDocument,
      evidenceTitle: evidence.evidenceTitle,
      supportingSide: evidence.supportingSide,
    });
    console.debug("submitted");
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

  appeal = async (party, contribution) => await this.props.appealCallback(this.state.arbitrated, this.state.arbitrableDisputeID, party, contribution).then(this.reload);

  withdraw = async () => {
    console.debug([Object.keys(this.state.contributions).map((key) => parseInt(key))]);
    this.props.withdrawCallback(this.state.arbitrated, this.state.arbitrableDisputeID, this.state.selectedContribution);
  };

  getWithdrawAmount = async () =>
    this.props.getTotalWithdrawableAmountCallback(
      this.state.arbitratorDisputeID,
      Object.keys(this.state.contributions).map((key) => parseInt(key)),
      this.state.arbitrated
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
      console.debug("err2");
      console.error(e);
      return;
    }

    await this.setState({ arbitrated });

    await this.commonFetchRoutine(arbitrated, arbitratorDisputeID).then(this.setState({ loading: false }));
  };

  commonFetchRoutine = async (arbitrated, arbitratorDisputeID) => {
    // Optimize this function: too many awaits, you can parallelize some calls.

    let arbitratorDispute;
    let subcourtURI;
    let subcourt;
    let metaevidence;
    let arbitrableDisputeID;

    try {
      arbitrableDisputeID = await this.props.getArbitrableDisputeIDCallback(arbitrated, arbitratorDisputeID);
      this.setState({ arbitrableDisputeID });
    } catch {
      console.error("Failed to get arbitrable dispute id. Incompatible with IDisputeResolver.");
      this.setState({ incompatible: true });
    }

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
      console.debug("err");
      console.error(err.message);
    } finally {
    }

    console.debug("There");
    try {
      this.setState({
        evidences: await this.props.getEvidencesCallback(arbitrated, arbitratorDisputeID),
      });
    } catch (err) {
      console.debug("err");
      console.error(err.message);
    } finally {
    }

    let multipliers;

    try {
      multipliers = await this.props.getMultipliersCallback(arbitrated);

      await this.setState({
        multipliers,
      });
    } catch (err) {
      console.error(err.message);
    }

    let appealDecisions, contributions, totalWithdrawable;
    try {
      appealDecisions = await this.props.getAppealDecisionCallback(arbitratorDisputeID);
      contributions = await this.props.getContributionsCallback(arbitrableDisputeID, appealDecisions.length, arbitrated);
      console.debug(contributions);

      await this.setState({ contributions, appealDecisions });
    } catch (err) {
      console.error("incompatible contract");
      console.error(err);
      this.setState({ incompatible: true });
    }

    if (arbitratorDispute.period >= 3) {
      await this.setState({ appealCost: await this.props.getAppealCostCallback(arbitratorDisputeID) });
      await this.setState({ appealPeriod: await this.props.getAppealPeriodCallback(arbitratorDisputeID) });
    }

    if (arbitratorDispute.period == 4) {
      let contributionsOfPastRounds = [];
      for (let i = 0; i < appealDecisions.length; i++) contributionsOfPastRounds[i] = await this.props.getContributionsCallback(arbitrableDisputeID, i, arbitrated);

      const aggregatedContributions = this.sumObjectsByKey(...contributionsOfPastRounds, contributions);
      console.log(`agregated ${aggregatedContributions}`);
      console.log(aggregatedContributions);

      try {
        totalWithdrawable = await this.props.getTotalWithdrawableAmountCallback(
          arbitrableDisputeID,
          Object.keys(aggregatedContributions).map((key) => key),
          arbitrated
        );
        await this.setState({ totalWithdrawable: totalWithdrawable.amount, aggregatedContributions, selectedContribution: totalWithdrawable.ruling });
      } catch (err) {
        console.log("can't get totalWithdrawable");
        console.error(err);
        this.setState({ incompatible: true }); //If ruling is not executed, this reverts.
      }
    }
  };

  reload = async () => {
    const { arbitrated, arbitratorDisputeID, arbitrableDisputeID, metaevidence } = this.state;
    this.setState({
      arbitratorDispute: await this.props.getArbitratorDisputeCallback(arbitratorDisputeID),
      evidences: await this.props.getEvidencesCallback(arbitrated, arbitratorDisputeID),
      appealDecisions: await this.props.getAppealDecisionCallback(arbitratorDisputeID),
      arbitratorDisputeDetails: await this.props.getArbitratorDisputeDetailsCallback(arbitratorDisputeID),
    });

    const appealDecisions = await this.props.getAppealDecisionCallback(arbitratorDisputeID);

    await this.setState({ appealDecisions, contributions: await this.props.getContributionsCallback(arbitrableDisputeID, appealDecisions.length, arbitrated) });
  };

  render() {
    console.debug(this.props);
    console.debug(this.state);

    const {
      arbitrated,
      arbitrableDisputeID,
      arbitratorDispute,
      arbitratorDisputeDetails,
      appealCost,
      appealPeriod,
      crowdfundingStatus,
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
      aggregatedContributions,
    } = this.state;
    console.log(arbitrated);

    const { arbitratorAddress, activeAddress, appealCallback, publishCallback, withdrawCallback, getCrowdfundingStatusCallback, getAppealPeriodCallback, getCurrentRulingCallback, subcourts, subcourtDetails, network, getTotalWithdrawableAmountCallback } = this.props;

    return (
      <>
        {Boolean(activeAddress) && incompatible && (
          <div style={{ padding: "1rem 2rem", fontSize: "14px", background: "#fafafa" }}>
            <b>View mode only:</b> the arbitrable contract of this dispute is not compatible with the interface of Dispute Resolver. You can't submit evidence or fund appeal on this interface. You can do these on the arbitrable application, if implemented.
          </div>
        )}
        {arbitrated && (
          <main className={styles.interact}>
            {arbitratorDisputeID && <Redirect to={`/cases/${arbitratorDisputeID}`} />}
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
              incompatible={incompatible}
              currentRuling={currentRuling}
              disputeEvent={disputeEvent}
              publishCallback={publishCallback}
              submitEvidenceCallback={this.submitEvidence}
              getAppealPeriodCallback={getAppealPeriodCallback}
              appealCost={appealCost}
              appealPeriod={appealPeriod}
              appealDecisions={appealDecisions}
              appealCallback={this.appeal}
              contributions={contributions}
              multipliers={multipliers}
              withdrawCallback={this.withdraw}
              totalWithdrawable={totalWithdrawable}
            />
          </main>
        )}
      </>
    );
  }
}

export default Interact;
