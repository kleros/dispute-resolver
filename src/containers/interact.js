import React from "react";
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

const FALLBACK_ACTIVATION_DELAY_SECONDS = 600;

class Interact extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      arbitratorDisputeID: this.props.route && this.props.route.match.params.id,
      arbitratorDispute: "",
      arbitrableDispute: "",
      fileInput: "",
      evidenceFileURI: "",
      metaevidence: "",
      evidences: [],
      modalShow: false,
      evidenceTitle: "",
      evidenceDescription: "",
      contributeModalShow: false,
      submitting: false,
      arbitratorIDLoading: false,
      arbitrableIDLoading: false,
      fetchingString: "",
      currentRuling: "",
      multipliers: "",
    };

    this.debouncedRetrieveUsingArbitratorID = debounce(this.retrieveDisputeDetailsUsingArbitratorID, 500, { leading: false, trailing: true });
  }

  async componentDidMount() {
    if (this.state.arbitratorDisputeID) await this.debouncedRetrieveUsingArbitratorID(this.state.arbitratorDisputeID);
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
      `Fetching ${this.state.fetchingString}...`,
      `Dispute #${this.state.arbitratorDisputeID} doesn't belong to this arbitrable contract.`,
      `There is no such dispute. Are you in the correct network?`,
    ];

    return strings[periodNumber];
  };

  submitEvidence = async (evidence) => {
    await this.props.submitEvidenceCallback({
      disputeID: this.state.arbitrableDisputeID,
      evidenceDescription: evidence.evidenceDescription,
      evidenceDocument: evidence.evidenceDocument,
      evidenceTitle: evidence.evidenceTitle,
      supportingSide: evidence.supportingSide,
    });
    this.setState({ evidences: await this.props.getEvidencesCallback(this.props.arbitrableAddress, this.state.arbitrableDisputeID) });
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

  appeal = async (party, contribution) => this.props.appealCallback(this.state.arbitrableDisputeID, party, contribution);

  getWinnerMultiplier = async (arbitrableAddress) => {
    const winnerMultiplier = await this.props.getWinnerMultiplierCallback(arbitrableAddress);

    return winnerMultiplier;
  };

  onDisputeIDChange = async (e) => {
    const arbitratorDisputeID = e.target.value;
    if (arbitratorDisputeID === "") {
      this.setState({ arbitratorDisputeID });
    }
    this.setState({ arbitrableIDLoading: true });
    this.setState({ arbitratorDisputeID: arbitratorDisputeID });

    this.setState({
      arbitrableDispute: "",
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
    this.setState({
      arbitratorDispute: { period: 6 },
      fetchingString: `dispute #${arbitratorDisputeID} from Court`,
    });
    let arbitrated;
    try {
      arbitrated = (await this.props.getArbitratorDisputeCallback(arbitratorDisputeID)).arbitrated;
    } catch (e) {
      console.error(e);
      this.setState({ arbitratorDispute: { period: 8 }, arbitrated });
      return;
    }

    await this.commonFetchRoutine(arbitrated, arbitratorDisputeID);
  };

  commonFetchRoutine = async (arbitrated, arbitratorDisputeID) => {
    let arbitratorDispute;
    let subcourtURI;
    let subcourt;
    let crowdfundingStatus;
    let appealCost;

    try {
      arbitratorDispute = await this.props.getArbitratorDisputeCallback(arbitratorDisputeID);
      await this.setState({
        arbitratorDispute,
        arbitratorDisputeID,
        metaevidence: await this.props.getMetaEvidenceCallback(arbitrated, arbitratorDisputeID),
        evidences: await this.props.getEvidencesCallback(arbitrated, arbitratorDisputeID),
        ruling: await this.getRuling(arbitrated, arbitratorDisputeID),
        currentRuling: await this.getCurrentRuling(arbitratorDisputeID),
        disputeEvent: await this.props.getDisputeEventCallback(arbitrated, arbitratorDisputeID),
        getDisputeResult: await this.props.getDisputeCallback(arbitratorDisputeID),
        appealCost: await this.props.getAppealCostCallback(arbitratorDisputeID),
      });
    } catch (err) {
      console.error(err.message);
      this.setState({ arbitratorDispute: { period: 5 }, arbitratorDisputeID: "" });
    } finally {
    }

    let arbitrableDisputeID;
    let arbitrableDispute;
    let multipliers;
    let withdrewAlready;
    try {
      arbitrableDisputeID = await this.props.getArbitrableDisputeID(arbitratorDisputeID);
      multipliers = await this.props.getMultipliersCallback();
      withdrewAlready = await this.props.withdrewAlreadyCallback(arbitrableDisputeID);
      crowdfundingStatus = await this.props.getCrowdfundingStatusCallback(arbitrableDisputeID);

      this.setState({
        crowdfundingStatus,
        multipliers,
        withdrewAlready,
      });
    } catch (err) {
      console.error(err.message);
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
  };

  getHumanReadablePeriod = (period) => this.PERIODS(period);

  render() {
    console.debug(this.props);
    console.debug(this.state);

    const { arbitrableDisputeID, arbitratorDispute, arbitrableDispute, crowdfundingStatus, appealCost, arbitratorDisputeID, metaevidence, multipliers, evidences, currentRuling, ruling, withdrewAlready, getDisputeResult, disputeEvent, canPassPeriod, canDrawJurors } = this.state;

    const { activeAddress, publishCallback, withdrawFeesAndRewardsCallback, getCrowdfundingStatusCallback, getAppealPeriodCallback, getCurrentRulingCallback, passPhaseCallback, passPeriodCallback, drawJurorsCallback, subcourts } = this.props;

    return (
      <Container fluid="true" className="main-content">
        {arbitratorDisputeID && <Redirect to={`/interact/${arbitratorDisputeID}`} />}
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
                            disabled={!arbitratorDispute}
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
                                {metaevidence.metaEvidenceJSON.description && <ReactMarkdown source={metaevidence.metaEvidenceJSON.description} />}
                                {!metaevidence.metaEvidenceJSON.description && <p>Not provided</p>}
                              </Form.Group>
                            </Card.Body>
                            {metaevidence.metaEvidenceJSON.fileURI && (
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
                                evidenceSubmissionEnabled={Boolean(activeAddress) && arbitrableDispute}
                                numberOfVotesCast={Number(getDisputeResult.votesInEachRound.slice(-1)[0])}
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
                      {arbitratorDispute && this.getHumanReadablePeriod(arbitratorDispute.period)}

                      {arbitratorDispute && arbitratorDispute.lastPeriodChange && subcourts && subcourts[arbitratorDispute.subcourtID].timesPerPeriod[Number(arbitratorDispute.period)] && (
                        <>
                          {" Over in "}
                          <Countdown
                            date={BigNumber("1000")
                              .times(BigNumber(arbitratorDispute.lastPeriodChange).plus(BigNumber(subcourts[arbitratorDispute.subcourtID].timesPerPeriod[Number(arbitratorDispute.period)])))
                              .toNumber()}
                            onComplete={() => {
                              console.log("COMPLETE");
                              const self = this;
                              setInterval(function () {
                                self.forceUpdate();
                              }, 2000);
                            }}
                          />
                        </>
                      )}
                    </h3>

                    {activeAddress &&
                      arbitratorDispute.lastPeriodChange &&
                      subcourts &&
                      subcourts[arbitratorDispute.subcourtID].timesPerPeriod[Number(arbitratorDispute.period)] &&
                      BigNumber(Date.now()).gt(
                        BigNumber("1000").times(
                          BigNumber(arbitratorDispute.lastPeriodChange)
                            .plus(BigNumber(subcourts[arbitratorDispute.subcourtID].timesPerPeriod[Number(arbitratorDispute.period)]))
                            .plus(BigNumber(FALLBACK_ACTIVATION_DELAY_SECONDS))
                        )
                      ) &&
                      canPassPeriod && (
                        <Button
                          className="ok"
                          style={{ margin: "0 1rem" }}
                          onClick={async (e) => {
                            await passPeriodCallback(arbitratorDisputeID);
                            this.commonFetchRoutine(arbitrableDisputeID);
                          }}
                        >
                          Pass Dispute Period
                        </Button>
                      )}

                    {activeAddress &&
                      arbitratorDispute.lastPeriodChange &&
                      subcourts &&
                      subcourts[arbitratorDispute.subcourtID].timesPerPeriod[Number(arbitratorDispute.period)] &&
                      BigNumber(Date.now()).gt(
                        BigNumber("1000").times(
                          BigNumber(arbitratorDispute.lastPeriodChange)
                            .plus(BigNumber(subcourts[arbitratorDispute.subcourtID].timesPerPeriod[Number(arbitratorDispute.period)]))
                            .plus(BigNumber(FALLBACK_ACTIVATION_DELAY_SECONDS))
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
                            this.commonFetchRoutine(arbitrableDisputeID);
                          }}
                        >
                          Draw Jurors
                        </Button>
                      )}
                    {activeAddress &&
                      arbitratorDispute.lastPeriodChange &&
                      subcourts &&
                      subcourts[arbitratorDispute.subcourtID][1][Number(arbitratorDispute.period)] &&
                      BigNumber(Date.now()).gt(
                        BigNumber("1000").times(
                          BigNumber(arbitratorDispute.lastPeriodChange)
                            .plus(BigNumber(subcourts[arbitratorDispute.subcourtID].timesPerPeriod[Number(arbitratorDispute.period)]))
                            .plus(BigNumber(FALLBACK_ACTIVATION_DELAY_SECONDS))
                        )
                      ) &&
                      arbitratorDispute.period == 0 &&
                      !canPassPeriod &&
                      !canDrawJurors && (
                        <Button
                          style={{ margin: "0 1rem" }}
                          onClick={async (e) => {
                            await passPhaseCallback();
                            this.commonFetchRoutine(arbitrableDisputeID);
                          }}
                        >
                          Pass Court Phase
                        </Button>
                      )}
                    {activeAddress && arbitratorDispute && arbitratorDispute.period == 4 && (
                      <Button className="ok" style={{ margin: "0 1rem" }} disabled={withdrewAlready} onClick={(e) => withdrawFeesAndRewardsCallback(arbitrableDisputeID)}>
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
            crowdfundingStatus={getCrowdfundingStatusCallback(arbitrableDisputeID)}
            appealCost={appealCost}
            multipliers={multipliers}
            appealCallback={this.appeal}
            appealPeriod={getAppealPeriodCallback(arbitratorDisputeID)}
            currentRuling={getCurrentRulingCallback(arbitratorDisputeID)}
            metaevidence={metaevidence}
            activeAddress={activeAddress}
          />
        )}

        <IPFS publishCallback={publishCallback} />
      </Container>
    );
  }
}

export default Interact;
