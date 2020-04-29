import React from "react";
import ReactDOM from "react-dom";
import { Card, Col, Container, Form, Row, Button, InputGroup, FormControl, Accordion } from "react-bootstrap";
import Appeal from "../components/appeal";
import QuestionDisplay from "../components/question-display";
import debounce from "lodash.debounce";
import IPFS from "../components/ipfs";
import ReactMarkdown from "react-markdown";
import { ReactComponent as GavelSVG } from "../assets/images/gavel.svg";
import { ReactComponent as AttachmentSVG } from "../assets/images/attachment.svg";
import { EvidenceTimeline } from "@kleros/react-components";
import { Redirect, Link } from "react-router-dom";
import Countdown from "react-countdown-now";
import BigNumber from "bignumber.js";

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

    this.iframe = React.createRef();
  }

  componentDidMount() {
    if (this.state.arbitratorDisputeID) this.debouncedRetrieveUsingArbitratorID(this.state.arbitratorDisputeID);
    console.log(this.iframe.current);
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

  onSubmitButtonClick = async (e) => {
    e.preventDefault();
    const { arbitrableDisputeID, fileInput, evidenceTitle, evidenceDescription } = this.state;

    var reader = new FileReader();
    reader.readAsArrayBuffer(fileInput);
    reader.addEventListener("loadend", async () => {
      const buffer = Buffer.from(reader.result);

      const result = await this.props.publishCallback(fileInput.name, buffer);

      await this.setState({ evidenceFileURI: `/ipfs/${result[0].hash}` });

      const { evidenceFileURI } = this.state;
      const receipt = await this.props.submitEvidenceCallback({
        arbitrableDisputeID,
        evidenceTitle,
        evidenceDescription,
        evidenceFileURI,
      });
    });
  };

  appeal = async (party, contribution) => this.props.appealCallback(this.state.arbitrated, this.state.arbitrableDisputeID, party, contribution);

  getWinnerMultiplier = async (arbitrableAddress) => {
    const winnerMultiplier = await this.props.getWinnerMultiplierCallback(arbitrableAddress);

    return winnerMultiplier;
  };

  onDisputeIDChange = async (e) => {
    const arbitratorDisputeID = e.target.value;

    await this.setState({ arbitratorDisputeID: arbitratorDisputeID, loading: true });

    await this.setState({
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
      withdrewAlready = await this.props.withdrewAlreadyCallback(arbitrated, arbitrableDisputeID);
      crowdfundingStatus = await this.props.getCrowdfundingStatusCallback(arbitrated, arbitrableDisputeID);

      await this.setState({
        arbitrableDisputeID,
        arbitrableDispute,
        crowdfundingStatus,
        multipliers,
        withdrewAlready,
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

    const { arbitratorAddress, activeAddress, publishCallback, withdrawFeesAndRewardsCallback, getCrowdfundingStatusCallback, getAppealPeriodCallback, getCurrentRulingCallback, passPhaseCallback, passPeriodCallback, drawJurorsCallback, subcourts, network } = this.props;

    return (
      <>
        {Boolean(activeAddress) && !this.state.arbitrableDispute && !this.state.loading && (
          <div style={{ padding: "1.1em 1.5em", fontSize: "13px", background: "#ffe03d" }}>View mode only: This is a 3rd party arbitrable contract, evidence submission and crowdfunding appeals is not available.</div>
        )}
        <Container fluid="true" className="main-content">
          {arbitratorDisputeID && <Redirect to={`/cases/${arbitratorDisputeID}`} />}
          <Accordion defaultActiveKey="0">
            <Card>
              <Accordion.Toggle as={Card.Header} eventKey="0">
                <GavelSVG style={{ marginRight: "1rem" }} />
                Interact with a Dispute
              </Accordion.Toggle>
              <hr className="mt-0" />
              <Accordion.Collapse eventKey="0">
                <>
                  <Card.Body
                    style={{
                      borderRadius: 0,
                    }}
                  >
                    <Form>
                      <Form.Row>
                        <Col>
                          <InputGroup className="mb-5" size="md">
                            <InputGroup.Prepend>
                              <InputGroup.Text className="purple-inverted" style={{ transform: "none", paddingLeft: "0" }}>
                                Search Disputes on Court
                              </InputGroup.Text>
                            </InputGroup.Prepend>
                            <FormControl
                              className="purple-inverted"
                              style={{ border: "1px solid #D09CFF", borderRadius: "3px" }}
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
                      </Form.Row>
                      {arbitratorDispute && metaevidence.metaEvidenceJSON && (
                        <>
                          <Form.Row>
                            <Col>
                              <h1 className="display-title">{metaevidence.metaEvidenceJSON.title}</h1>
                            </Col>
                          </Form.Row>

                          <Form.Row>
                            <Card className="w-100" style={{ margin: 0 }}>
                              <Card.Body
                                style={{
                                  paddingBottom: "0",
                                  borderBottomLeftRadius: metaevidence.metaEvidenceJSON.fileURI && 0,
                                  borderBottomRightRadius: metaevidence.metaEvidenceJSON.fileURI && 0,
                                }}
                              >
                                <Form.Group id="markdown" className="markdown" style={{ paddingLeft: 0, color: "black" }}>
                                  {metaevidence.metaEvidenceJSON.description && metaevidence.metaEvidenceJSONValid && <ReactMarkdown source={metaevidence.metaEvidenceJSON.description} />}
                                  {!metaevidence.metaEvidenceJSON.description && <p>Not provided</p>}
                                </Form.Group>
                                {metaevidence.metaEvidenceJSON.evidenceDisplayInterfaceURI && metaevidence.interfaceValid && (
                                  <div className="iframe-container">
                                    <iframe
                                      ref={this.iframe}
                                      id="iframe"
                                      className="iframe"
                                      src={
                                        (metaevidence.metaEvidenceJSON.evidenceDisplayInterfaceURI.includes("://") ? metaevidence.metaEvidenceJSON.evidenceDisplayInterfaceURI : `https://ipfs.kleros.io${metaevidence.metaEvidenceJSON.evidenceDisplayInterfaceURI}`) +
                                        encodeURI(`?{"arbitrableContractAddress":"${arbitrated}","arbitratorContractAddress":"${arbitratorAddress}","disputeID":"${arbitratorDisputeID}"}`)
                                      }
                                      title="evidence-display"
                                    />
                                  </div>
                                )}
                                {metaevidence.metaEvidenceJSON.arbitrableInterfaceURI && !metaevidence.metaEvidenceJSON.arbitrableInterfaceURI.includes("resolve.kleros.io") && (
                                  <div className="my-3">
                                    <a href={metaevidence.metaEvidenceJSON.arbitrableInterfaceURI} className="purple-inverted">
                                      Go to arbitrable application from here
                                    </a>
                                  </div>
                                )}
                              </Card.Body>

                              {metaevidence.metaEvidenceJSON.fileURI && metaevidence.fileValid && (
                                <Card
                                  className="text-center w-100 m-0"
                                  style={{
                                    backgroundColor: "#F5F1FD",
                                    borderTopLeftRadius: 0,
                                    borderTopRightRadius: 0,
                                    padding: "0.8rem",
                                  }}
                                >
                                  <a
                                    href={`
                            https://ipfs.kleros.io${metaevidence.metaEvidenceJSON.fileURI}`}
                                  >
                                    <AttachmentSVG style={{ width: "2rem" }} />
                                  </a>
                                </Card>
                              )}
                            </Card>
                          </Form.Row>
                          <Form.Row>
                            <Col style={{ padding: 0 }}>
                              <QuestionDisplay
                                question={metaevidence.metaEvidenceJSON.question}
                                firstRulingOption={metaevidence.metaEvidenceJSON.rulingOptions.titles[0]}
                                secondRulingOption={metaevidence.metaEvidenceJSON.rulingOptions.titles[1]}
                                firstRulingDescription={metaevidence.metaEvidenceJSON.rulingOptions.descriptions[0]}
                                secondRulingDescription={metaevidence.metaEvidenceJSON.rulingOptions.descriptions[1]}
                              />
                            </Col>
                          </Form.Row>
                          <Form.Row>
                            <Card
                              className="w-100"
                              style={{
                                marginLeft: 0,
                                marginRight: 0,
                              }}
                            >
                              <Card.Body style={{ padding: 0 }}>
                                <EvidenceTimeline
                                  evidenceSubmissionEnabled={Boolean(activeAddress) && Boolean(arbitrableDispute)}
                                  numberOfVotesCast={Number(getDisputeResult.votesInEachRound.slice(-1)[0])}
                                  numberOfVotes={Number(getDisputeResult.votesLengths.slice(-1)[0])}
                                  metaevidence={metaevidence}
                                  evidences={evidences}
                                  ruling={ruling}
                                  currentRuling={Number(currentRuling)}
                                  dispute={disputeEvent}
                                  disputePeriod={parseInt(arbitratorDispute.period)}
                                  publishCallback={publishCallback}
                                  submitEvidenceCallback={this.submitEvidence}
                                  appealDecisions={this.state.appealDecisions}
                                />
                              </Card.Body>
                            </Card>
                          </Form.Row>
                        </>
                      )}
                    </Form>
                  </Card.Body>

                  <Card.Footer
                    className="p-0"
                    id="dispute-detail-footer"
                    style={{
                      borderTopLeftRadius: 0,
                      borderTopRightRadius: 0,
                      borderBottomLeftRadius: 12,
                      borderBottomRightRadius: 12,
                    }}
                  >
                    <div
                      className="text-center p-5"
                      style={{
                        borderTopLeftRadius: "inherit",
                        borderTopRightRadius: "inherit",
                        borderRadius: "inherit",
                      }}
                    >
                      <h3 style={{ color: "white" }}>
                        {(arbitratorDispute && this.getHumanReadablePeriod(arbitratorDispute.period)) || this.MESSAGES(this.state.interactionState)}

                        {arbitratorDispute && arbitratorDispute.lastPeriodChange && subcourts && subcourts[arbitratorDispute.subcourtID].timesPerPeriod[Number(arbitratorDispute.period)] && (
                          <>
                            {" Over in "}
                            <Countdown
                              date={BigNumber("1000")
                                .times(BigNumber(arbitratorDispute.lastPeriodChange).plus(BigNumber(subcourts[arbitratorDispute.subcourtID].timesPerPeriod[Number(arbitratorDispute.period)])))
                                .toNumber()}
                              onComplete={() => this.reload()}
                            />
                          </>
                        )}
                      </h3>

                      {activeAddress &&
                        arbitratorDispute &&
                        arbitratorDispute.lastPeriodChange &&
                        subcourts &&
                        subcourts[arbitratorDispute.subcourtID].timesPerPeriod[Number(arbitratorDispute.period)] &&
                        BigNumber(Date.now()).gt(
                          BigNumber("1000").times(
                            BigNumber(arbitratorDispute.lastPeriodChange)
                              .plus(BigNumber(subcourts[arbitratorDispute.subcourtID].timesPerPeriod[Number(arbitratorDispute.period)]))
                              .plus(BigNumber(FALLBACK_ACTIVATION_DELAY_SECONDS.network))
                          )
                        ) &&
                        canPassPeriod && (
                          <Button
                            className="ok"
                            style={{ margin: "0 1rem" }}
                            onClick={async (e) => {
                              await passPeriodCallback(arbitratorDisputeID);
                              new Promise(() => setTimeout(5000)).then(this.reload());
                            }}
                          >
                            Pass Dispute Period
                          </Button>
                        )}

                      {activeAddress &&
                        arbitratorDispute &&
                        arbitratorDispute.lastPeriodChange &&
                        subcourts &&
                        subcourts[arbitratorDispute.subcourtID].timesPerPeriod[Number(arbitratorDispute.period)] &&
                        BigNumber(Date.now()).gt(
                          BigNumber("1000").times(
                            BigNumber(arbitratorDispute.lastPeriodChange)
                              .plus(BigNumber(subcourts[arbitratorDispute.subcourtID].timesPerPeriod[Number(arbitratorDispute.period)]))
                              .plus(BigNumber(FALLBACK_ACTIVATION_DELAY_SECONDS.network))
                          )
                        ) &&
                        arbitratorDispute.period == 0 &&
                        !canPassPeriod &&
                        canDrawJurors && (
                          <Button
                            className="ok"
                            style={{ margin: "0 1rem" }}
                            onClick={async (e) => {
                              await drawJurorsCallback(arbitratorDisputeID);
                              new Promise(() => setTimeout(5000)).then(this.reload());
                            }}
                          >
                            Draw Jurors
                          </Button>
                        )}
                      {activeAddress &&
                        arbitratorDispute &&
                        arbitratorDispute.lastPeriodChange &&
                        subcourts &&
                        subcourts[arbitratorDispute.subcourtID][1][Number(arbitratorDispute.period)] &&
                        BigNumber(Date.now()).gt(
                          BigNumber("1000").times(
                            BigNumber(arbitratorDispute.lastPeriodChange)
                              .plus(BigNumber(subcourts[arbitratorDispute.subcourtID].timesPerPeriod[Number(arbitratorDispute.period)]))
                              .plus(BigNumber(FALLBACK_ACTIVATION_DELAY_SECONDS.network))
                          )
                        ) &&
                        arbitratorDispute.period == 0 &&
                        !canPassPeriod &&
                        !canDrawJurors &&
                        canPassPhase && (
                          <Button
                            className="ok"
                            style={{ margin: "0 1rem" }}
                            onClick={async (e) => {
                              await passPhaseCallback();
                              new Promise(() => setTimeout(5000)).then(this.reload());
                            }}
                          >
                            Pass Court Phase
                          </Button>
                        )}
                      {arbitrableDisputeID && activeAddress && arbitratorDispute && arbitratorDispute.period == 4 && (
                        <Button className="ok" style={{ margin: "0 1rem" }} disabled={withdrewAlready} onClick={(e) => withdrawFeesAndRewardsCallback(arbitrated, arbitrableDisputeID)}>
                          {withdrewAlready ? "Withdrew Already" : "Withdraw Funds"}
                        </Button>
                      )}
                    </div>
                  </Card.Footer>
                </>
              </Accordion.Collapse>
            </Card>
          </Accordion>

          {arbitrableDisputeID && arbitratorDispute && arbitratorDispute.period == 3 && arbitrableDispute && (
            <Appeal
              crowdfundingStatus={crowdfundingStatus}
              appealCost={appealCost}
              multipliers={multipliers}
              appealCallback={this.appeal}
              appealPeriod={appealPeriod}
              currentRuling={currentRuling}
              metaevidence={metaevidence}
              activeAddress={activeAddress}
              reloadCallback={this.reload}
            />
          )}

          <IPFS publishCallback={publishCallback} />
        </Container>
      </>
    );
  }
}

export default Interact;
