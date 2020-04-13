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
      dispute: "",
      arbitrableDispute: "",
      fileInput: "",
      evidenceFileURI: "",
      metaevidence: "",
      evidences: [],
      subcourtDetails: {},
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
    if (this.props.disputeID !== previousProperties.disputeID) await this.setState({ disputeID: this.props.disputeID });
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
      disputeID: this.state.disputeID,
      evidenceDescription: evidence.evidenceDescription,
      evidenceDocument: evidence.evidenceDocument,
      evidenceTitle: evidence.evidenceTitle,
      supportingSide: evidence.supportingSide,
    });
    this.setState({ evidences: await this.props.getEvidencesCallback(this.props.arbitrableAddress, this.state.disputeID) });
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
    const { disputeID, fileInput, evidenceTitle, evidenceDescription } = this.state;

    var reader = new FileReader();
    reader.readAsArrayBuffer(fileInput);
    reader.addEventListener("loadend", async () => {
      const buffer = Buffer.from(reader.result);

      const result = await this.props.publishCallback(fileInput.name, buffer);

      await this.setState({ evidenceFileURI: `/ipfs/${result[0].hash}` });

      const { evidenceFileURI } = this.state;
      const receipt = await this.props.submitEvidenceCallback({
        disputeID,
        evidenceTitle,
        evidenceDescription,
        evidenceFileURI,
      });
    });
  };

  appeal = async (party, contribution) => this.props.appealCallback(this.state.disputeID, party, contribution);

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

  retrieveDisputeDetailsUsingArbitratorID = async (arbitratorDisputeID) => {
    this.setState({
      dispute: { period: 6 },
      fetchingString: `dispute #${arbitratorDisputeID} from Court`,
    });
    let arbitrated;
    try {
      arbitrated = (await this.props.getArbitratorDisputeCallback(arbitratorDisputeID)).arbitrated;
    } catch (e) {
      console.error(e);
      this.setState({ dispute: { period: 8 } });
      return;
    }
    if (arbitrated == this.props.arbitrableAddress) {
      const arbitrableDisputeID = await this.props.getArbitrableDisputeIDCallback(arbitratorDisputeID);
      await this.commonFetchRoutine(arbitrableDisputeID);
    } else {
      this.setState({
        dispute: { period: 7 },
      });
    }
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

  commonFetchRoutine = async (arbitrableDisputeID) => {
    let arbitratorDispute;
    let arbitrableDispute;
    let subcourtURI;
    let subcourt;
    let crowdfundingStatus;
    let appealCost;
    let multipliers;
    let withdrewAlready;
    try {
      arbitrableDispute = await this.props.getArbitrableDisputeCallback(arbitrableDisputeID);
      arbitratorDispute = await this.props.getArbitratorDisputeCallback(arbitrableDispute.disputeIDOnArbitratorSide);

      subcourtURI = await this.props.getSubCourtDetailsCallback(arbitratorDispute.subcourtID);
      if (subcourtURI.includes("http")) subcourt = await fetch(subcourtURI);
      else subcourt = await fetch(`https://ipfs.kleros.io${subcourtURI}`);

      await this.setState({
        dispute: arbitratorDispute,
        subcourtDetails: await subcourt.json(),
        metaevidence: await this.props.getMetaEvidenceCallback(arbitratorDispute.arbitrated, arbitrableDisputeID),
        arbitrableDispute,
        arbitratorDisputeID: arbitrableDispute.disputeIDOnArbitratorSide,
        disputeID: arbitrableDisputeID,
        evidences: await this.props.getEvidencesCallback(this.props.arbitrableAddress, arbitrableDisputeID),
        ruling: await this.getRuling(this.props.arbitrableAddress, arbitrableDispute.disputeIDOnArbitratorSide),
        currentRuling: await this.getCurrentRuling(arbitrableDispute.disputeIDOnArbitratorSide),
        disputeEvent: await this.props.getDisputeEventCallback(this.props.arbitrableAddress, arbitrableDispute.disputeIDOnArbitratorSide),

        getDisputeResult: await this.props.getDisputeCallback(arbitrableDispute.disputeIDOnArbitratorSide),
        getSubcourtResult: await this.props.getSubcourtCallback(arbitratorDispute.subcourtID),
      });
    } catch (err) {
      console.error(err.message);
      this.setState({ dispute: { period: 5 }, arbitratorDisputeID: "" });
    } finally {
      this.setState({ arbitrableIDLoading: false, arbitratorIDLoading: false });
    }

    try {
      appealCost = await this.props.getAppealCostCallback(arbitrableDispute.disputeIDOnArbitratorSide);
      multipliers = await this.props.getMultipliersCallback();
      withdrewAlready = await this.props.withdrewAlreadyCallback(arbitrableDisputeID);
      crowdfundingStatus = await this.props.getCrowdfundingStatusCallback(arbitrableDisputeID);

      this.setState({
        crowdfundingStatus,
        appealCost,
        multipliers,
        withdrewAlready,
      });
    } catch (err) {
      console.error(err.message);
    }

    try {
      this.setState({ canPassPeriod: await this.props.estimateGasOfPassPeriodCallback(arbitrableDispute.disputeIDOnArbitratorSide) });
    } catch {
      this.setState({ canPassPeriod: false });
    }

    try {
      this.setState({ canDrawJurors: await this.props.estimateGasOfDrawJurorsCallback(arbitrableDispute.disputeIDOnArbitratorSide) });
      console.log("2nd");
    } catch {
      this.setState({ canDrawJurors: false });
    }
  };

  getHumanReadablePeriod = (period) => this.PERIODS(period);

  render() {
    console.debug(this.props);
    console.debug(this.state);

    const {
      disputeID,
      dispute,
      arbitrableDispute,
      crowdfundingStatus,
      appealCost,
      arbitratorDisputeID,
      arbitratorIDLoading,
      arbitrableIDLoading,
      metaevidence,
      multipliers,
      evidences,
      currentRuling,
      ruling,
      withdrewAlready,
      getSubcourtResult,
      getDisputeResult,
      disputeEvent,
      canPassPeriod,
      canDrawJurors,
    } = this.state;

    const { activeAddress, publishCallback, withdrawFeesAndRewardsCallback, getCrowdfundingStatusCallback, getAppealPeriodCallback, getCurrentRulingCallback, passPhaseCallback, passPeriodCallback, drawJurorsCallback } = this.props;

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
                            disabled={arbitratorIDLoading}
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
                    {arbitrableDispute && metaevidence.metaEvidenceJSON && (
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
                              <Form.Group id="markdown" style={{ paddingLeft: 0, color: "black" }}>
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
                                evidenceSubmissionEnabled={Boolean(activeAddress)}
                                numberOfVotesCast={Number(getDisputeResult.votesInEachRound.slice(-1)[0])}
                                metaevidence={metaevidence}
                                evidences={evidences}
                                ruling={ruling}
                                currentRuling={Number(currentRuling)}
                                dispute={disputeEvent}
                                disputePeriod={parseInt(dispute.period)}
                                publishCallback={publishCallback}
                                submitEvidenceCallback={this.submitEvidence}
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
                      {this.getHumanReadablePeriod(dispute.period)}

                      {dispute.lastPeriodChange && getSubcourtResult && getSubcourtResult[1][Number(dispute.period)] && (
                        <>
                          {" Over in "}
                          <Countdown
                            date={BigNumber("1000")
                              .times(BigNumber(dispute.lastPeriodChange).plus(BigNumber(getSubcourtResult[1][Number(dispute.period)])))
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
                      dispute.lastPeriodChange &&
                      getSubcourtResult &&
                      getSubcourtResult[1][Number(dispute.period)] &&
                      BigNumber(Date.now()).gt(
                        BigNumber("1000").times(
                          BigNumber(dispute.lastPeriodChange)
                            .plus(BigNumber(getSubcourtResult[1][Number(dispute.period)]))
                            .plus(BigNumber(FALLBACK_ACTIVATION_DELAY_SECONDS))
                        )
                      ) &&
                      canPassPeriod && (
                        <Button
                          style={{ margin: "0 1rem" }}
                          onClick={async (e) => {
                            await passPeriodCallback(arbitratorDisputeID);
                            this.commonFetchRoutine(disputeID);
                          }}
                        >
                          Pass Dispute Period
                        </Button>
                      )}

                    {activeAddress &&
                      dispute.lastPeriodChange &&
                      getSubcourtResult &&
                      getSubcourtResult[1][Number(dispute.period)] &&
                      BigNumber(Date.now()).gt(
                        BigNumber("1000").times(
                          BigNumber(dispute.lastPeriodChange)
                            .plus(BigNumber(getSubcourtResult[1][Number(dispute.period)]))
                            .plus(BigNumber(FALLBACK_ACTIVATION_DELAY_SECONDS))
                        )
                      ) &&
                      dispute.period == 0 &&
                      !canPassPeriod &&
                      canDrawJurors && (
                        <Button
                          style={{ margin: "0 1rem" }}
                          onClick={async (e) => {
                            await drawJurorsCallback(arbitratorDisputeID);
                            this.commonFetchRoutine(disputeID);
                          }}
                        >
                          Draw Jurors
                        </Button>
                      )}
                    {activeAddress &&
                      dispute.lastPeriodChange &&
                      getSubcourtResult &&
                      getSubcourtResult[1][Number(dispute.period)] &&
                      BigNumber(Date.now()).gt(
                        BigNumber("1000").times(
                          BigNumber(dispute.lastPeriodChange)
                            .plus(BigNumber(getSubcourtResult[1][Number(dispute.period)]))
                            .plus(BigNumber(FALLBACK_ACTIVATION_DELAY_SECONDS))
                        )
                      ) &&
                      dispute.period == 0 &&
                      !canPassPeriod &&
                      !canDrawJurors && (
                        <Button
                          style={{ margin: "0 1rem" }}
                          onClick={async (e) => {
                            await passPhaseCallback();
                            this.commonFetchRoutine(disputeID);
                          }}
                        >
                          Pass Court Phase
                        </Button>
                      )}
                    {activeAddress && dispute && dispute.period == 4 && (
                      <Button style={{ margin: "0 1rem" }} disabled={withdrewAlready} onClick={(e) => withdrawFeesAndRewardsCallback(disputeID)}>
                        {withdrewAlready ? "Withdrew Already" : "Withdraw Funds"}
                      </Button>
                    )}
                  </div>
                </Card.Footer>
              </>
            </Accordion.Collapse>
          </Card>
        </Accordion>

        {dispute && dispute.period == 3 && arbitrableDispute && (
          <Appeal
            crowdfundingStatus={getCrowdfundingStatusCallback(disputeID)}
            appealCost={appealCost}
            multipliers={multipliers}
            appealCallback={this.appeal}
            appealPeriod={getAppealPeriodCallback(arbitrableDispute.disputeIDOnArbitratorSide)}
            currentRuling={getCurrentRulingCallback(arbitrableDispute.disputeIDOnArbitratorSide)}
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
