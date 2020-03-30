import React from "react";
import {
  Card,
  Col,
  Container,
  Form,
  Row,
  Button,
  InputGroup,
  FormControl
} from "react-bootstrap";
import Appeal from "../components/appeal";
import QuestionDisplay from "../components/question-display";
import debounce from "lodash.debounce";
import IPFS from "../components/ipfs";
import ReactMarkdown from "react-markdown";
import { ReactComponent as GavelSVG } from "../assets/images/gavel.svg";
import { ReactComponent as KlerosSymbol } from "../assets/images/kleros-symbol.svg";
import { ReactComponent as AttachmentSVG } from "../assets/images/attachment.svg";
import { EvidenceTimeline } from "@kleros/react-components";
import { Redirect } from "react-router-dom";

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
      currentRuling: 2,
      winnerMultiplier: "",
      loserMultiplier: "",
      sharedMultiplier: "",
      multiplierDivisor: ""
    };

    this.debouncedRetrieveUsingArbitratorID = debounce(
      this.retrieveDisputeDetailsUsingArbitratorID,
      500,
      { leading: false, trailing: true }
    );
  }

  async componentDidMount() {
    if (this.state.arbitratorDisputeID)
      await this.debouncedRetrieveUsingArbitratorID(
        this.state.arbitratorDisputeID
      );
  }

  async componentDidUpdate(previousProperties) {
    if (this.props.disputeID !== previousProperties.disputeID)
      await this.setState({ disputeID: this.props.disputeID });
  }

  PERIODS = periodNumber => {
    const strings = [
      "Evidence Period",
      "Commit Period",
      "Vote Period",
      "Appeal Period",
      "Execution Period",
      "Greek gods having trouble finding this dispute...",
      `Fetching ${this.state.fetchingString}...`,
      `Dispute #${this.state.arbitratorDisputeID} doesn't belong to this arbitrable contract.`,
      `There is no such dispute...`
    ];

    return strings[periodNumber];
  };

  submitEvidence = async evidence => {
    console.log(evidence);
    await this.props.submitEvidenceCallback({
      disputeID: this.state.disputeID,
      evidenceDescription: evidence.evidenceDescription,
      evidenceDocument: evidence.evidenceDocument,
      evidenceTitle: evidence.evidenceTitle,
      supportingSide: evidence.supportingSide
    });
  };

  onDrop = async acceptedFiles => {
    console.log(acceptedFiles);
    this.setState({ fileInput: acceptedFiles[0] });

    var reader = new FileReader();
    reader.readAsArrayBuffer(acceptedFiles[0]);
    reader.addEventListener("loadend", async () => {
      const buffer = Buffer.from(reader.result);

      const result = await this.props.publishCallback(
        acceptedFiles[0].name,
        buffer
      );

      console.log(result);

      await this.setState({
        primaryDocument: `/ipfs/${result[1].hash}${result[0].path}`
      });
    });
  };

  onModalShow = e => this.setState({ modalShow: true });
  onContributeModalShow = e => this.setState({ contributeModalShow: true });

  onControlChange = e => this.setState({ [e.target.id]: e.target.value });
  onInput = e => {
    this.setState({ evidenceFileURI: "" });
    this.setState({ fileInput: e.target.files[0] });
  };

  onContributeButtonClick = e => this.setState({ contributeModalShow: true });

  onSubmitButtonClick = async e => {
    e.preventDefault();
    const {
      disputeID,
      fileInput,
      evidenceTitle,
      evidenceDescription
    } = this.state;

    var reader = new FileReader();
    reader.readAsArrayBuffer(fileInput);
    reader.addEventListener("loadend", async () => {
      const buffer = Buffer.from(reader.result);

      const result = await this.props.publishCallback(fileInput.name, buffer);

      console.log(result);

      await this.setState({ evidenceFileURI: `/ipfs/${result[0].hash}` });

      console.log(`fileURI ${this.state.evidenceFileURI}`);
      const { evidenceFileURI } = this.state;
      const receipt = await this.props.submitEvidenceCallback({
        disputeID,
        evidenceTitle,
        evidenceDescription,
        evidenceFileURI
      });
      console.log(receipt);
    });
  };

  appeal = async (party, contribution) =>
    this.props.appealCallback(this.state.disputeID, party, contribution);

  getWinnerMultiplier = async arbitrableAddress => {
    const winnerMultiplier = await this.props.getWinnerMultiplierCallback(
      arbitrableAddress
    );

    return winnerMultiplier;
  };

  onDisputeIDChange = async e => {
    const arbitratorDisputeID = e.target.value;
    if (arbitratorDisputeID === "") {
      this.setState({ arbitratorDisputeID });
    }
    this.setState({ arbitrableIDLoading: true });
    console.log(arbitratorDisputeID);
    this.setState({ arbitratorDisputeID: arbitratorDisputeID });

    this.setState({
      arbitrableDispute: ""
    });
    console.log("hey");
    await this.debouncedRetrieveUsingArbitratorID(arbitratorDisputeID);
  };

  retrieveDisputeDetailsUsingArbitratorID = async arbitratorDisputeID => {
    this.setState({
      dispute: { period: 6 },
      fetchingString: `dispute #${arbitratorDisputeID} from Court`
    });
    let arbitrated;
    try {
      arbitrated = (await this.props.getArbitratorDisputeCallback(
        arbitratorDisputeID
      )).arbitrated;
    } catch (e) {
      this.setState({ dispute: { period: 8 } });
      return;
    }
    console.log("arbitrated:");
    console.log(arbitrated);
    if (arbitrated == this.props.arbitrableAddress) {
      const arbitrableDisputeID = await this.props.getArbitrableDisputeIDCallback(
        arbitratorDisputeID
      );
      console.log(arbitrableDisputeID);
      await this.commonFetchRoutine(arbitrableDisputeID);
    } else {
      this.setState({
        dispute: { period: 7 }
      });
    }
  };

  getCurrentRuling = async disputeIDOnArbitratorSide => {
    let currentRuling;
    try {
      currentRuling = await this.props.getCurrentRulingCallback(
        disputeIDOnArbitratorSide
      );
    } catch (err) {
      console.log(err);
    } finally {
      console.log(currentRuling);
      return currentRuling;
    }
  };

  getRuling = async (arbitrableAddress, disputeIDOnArbitratorSide) => {
    let ruling;
    try {
      ruling = await this.props.getRulingCallback(
        arbitrableAddress,
        disputeIDOnArbitratorSide
      );
    } catch (err) {
    } finally {
      return ruling;
    }
  };

  commonFetchRoutine = async arbitrableDisputeID => {
    let arbitratorDispute;
    let arbitrableDispute;
    let subcourtURI;
    let subcourt;
    let crowdfundingStatus;
    let appealCost;
    let winnerMultiplier;
    let loserMultiplier;
    let sharedMultiplier;
    let multiplierDivisor;
    try {
      arbitrableDispute = await this.props.getArbitrableDisputeCallback(
        arbitrableDisputeID
      );
      arbitratorDispute = await this.props.getArbitratorDisputeCallback(
        arbitrableDispute.disputeIDOnArbitratorSide
      );

      subcourtURI = await this.props.getSubCourtDetailsCallback(
        arbitratorDispute.subcourtID
      );
      console.log(subcourtURI);
      if (subcourtURI.includes("http")) subcourt = await fetch(subcourtURI);
      else subcourt = await fetch(`https://ipfs.kleros.io${subcourtURI}`);

      console.log(arbitratorDispute);

      await this.setState({
        dispute: arbitratorDispute,
        subcourtDetails: await subcourt.json(),
        metaevidence: await this.props.getMetaEvidenceCallback(
          arbitratorDispute.arbitrated,
          arbitrableDisputeID
        ),
        arbitrableDispute,
        arbitratorDisputeID: arbitrableDispute.disputeIDOnArbitratorSide,

        disputeID: arbitrableDisputeID,
        evidences: await this.props.getEvidencesCallback(
          this.props.arbitrableAddress,
          arbitrableDisputeID
        ),
        ruling: await this.getRuling(
          this.props.arbitrableAddress,
          arbitrableDispute.disputeIDOnArbitratorSide
        ),
        currentRuling: await this.getCurrentRuling(
          arbitrableDispute.disputeIDOnArbitratorSide
        ),
        disputeEvent: await this.props.getDisputeEventCallback(
          this.props.arbitrableAddress,
          arbitrableDispute.disputeIDOnArbitratorSide
        ),
        getDisputeResult: await this.props.getDisputeCallback(
          arbitrableDispute.disputeIDOnArbitratorSide
        )
      });
    } catch (err) {
      console.error(err.message);
      this.setState({ dispute: { period: 5 }, arbitratorDisputeID: "" });
    } finally {
      this.setState({ arbitrableIDLoading: false, arbitratorIDLoading: false });
    }

    try {
      crowdfundingStatus = await this.props.getCrowdfundingStatusCallback(
        arbitratorDispute.arbitrated,
        arbitrableDisputeID
      );
      appealCost = await this.props.getAppealCostCallback(
        arbitrableDispute.disputeIDOnArbitratorSide
      );
      winnerMultiplier = await this.props.getWinnerMultiplierCallback(
        arbitratorDispute.arbitrated
      );
      loserMultiplier = await this.props.getLoserMultiplierCallback(
        arbitratorDispute.arbitrated
      );
      sharedMultiplier = await this.props.getSharedMultiplierCallback(
        arbitratorDispute.arbitrated
      );
      multiplierDivisor = await this.props.getMultiplierDivisorCallback(
        arbitratorDispute.arbitrated
      );

      console.log("CF");
      console.log(crowdfundingStatus);
      this.setState({
        crowdfundingStatus,
        appealCost,
        winnerMultiplier,
        loserMultiplier,
        sharedMultiplier,
        multiplierDivisor
      });
    } catch (err) {
      console.error(err.message);
    }
  };

  getHumanReadablePeriod = period => this.PERIODS(period);

  render() {
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
      winnerMultiplier,
      loserMultiplier,
      sharedMultiplier,
      multiplierDivisor
    } = this.state;

    console.log(this.props);
    console.log(this.state);

    return (
      <Container fluid="true" className="main-content">
        {arbitratorDisputeID && (
          <Redirect to={`/interact/${arbitratorDisputeID}`} />
        )}

        <Card>
          <Card.Header>
            <GavelSVG />
            Interact with a Dispute
          </Card.Header>
          <Card.Body
            style={{
              borderRadius: 0
            }}
          >
            <Form>
              <Form.Row>
                <Col>
                  <InputGroup className="mb-5" size="md">
                    <InputGroup.Prepend>
                      <InputGroup.Text
                        style={{ transform: "none", paddingLeft: "0" }}
                      >
                        Search Disputes on Court
                      </InputGroup.Text>
                    </InputGroup.Prepend>
                    <FormControl
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
                      <h1 className="display-title">
                        {metaevidence.metaEvidenceJSON.title}
                      </h1>
                    </Col>
                  </Form.Row>

                  <Form.Row>
                    <Card className="w-100" style={{ margin: 0 }}>
                      <Card.Body
                        style={{
                          paddingBottom: "0",
                          borderBottomLeftRadius:
                            metaevidence.metaEvidenceJSON.fileURI && 0,
                          borderBottomRightRadius:
                            metaevidence.metaEvidenceJSON.fileURI && 0
                        }}
                      >
                        <Form.Group id="markdown" style={{ paddingLeft: 0 }}>
                          {metaevidence.metaEvidenceJSON.description && (
                            <ReactMarkdown
                              source={metaevidence.metaEvidenceJSON.description}
                            />
                          )}
                          {!metaevidence.metaEvidenceJSON.description && (
                            <p>Not provided</p>
                          )}
                        </Form.Group>
                      </Card.Body>
                      {metaevidence.metaEvidenceJSON.fileURI && (
                        <Card
                          className="text-center w-100 m-0"
                          style={{
                            backgroundColor: "#F5F1FD",
                            borderTopLeftRadius: 0,
                            borderTopRightRadius: 0,
                            padding: "0.5rem"
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
                        firstRulingOption={
                          metaevidence.metaEvidenceJSON.rulingOptions.titles[0]
                        }
                        secondRulingOption={
                          metaevidence.metaEvidenceJSON.rulingOptions.titles[1]
                        }
                        firstRulingDescription={
                          metaevidence.metaEvidenceJSON.rulingOptions
                            .descriptions[0]
                        }
                        secondRulingDescription={
                          metaevidence.metaEvidenceJSON.rulingOptions
                            .descriptions[1]
                        }
                      />
                    </Col>
                  </Form.Row>
                  <Form.Row>
                    <Card
                      className="w-100"
                      style={{
                        marginLeft: 0,
                        marginRight: 0
                      }}
                    >
                      <Card.Body style={{ padding: 0 }}>
                        <EvidenceTimeline
                          numberOfVotesCast={
                            this.state.getDisputeResult.votesInEachRound.slice(
                              -1
                            )[0]
                          }
                          metaevidence={metaevidence}
                          evidences={this.state.evidences}
                          ruling={this.state.ruling}
                          currentRuling={Number(this.state.currentRuling)}
                          dispute={this.state.disputeEvent}
                          disputePeriod={parseInt(dispute.period)}
                          publishCallback={this.props.publishCallback}
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
              borderTopRightRadius: 0
            }}
          >
            <div
              className="text-center p-5"
              style={{
                borderTopLeftRadius: "inherit",
                borderTopRightRadius: "inherit"
              }}
            >
              <h3 style={{ color: "white" }}>
                {this.getHumanReadablePeriod(dispute.period)}
              </h3>
              {dispute && dispute.period == 4 && (
                <Button
                  onClick={e =>
                    this.props.withdrawFeesAndRewardsCallback(disputeID, 0)
                  }
                >
                  Withdraw Funds
                </Button>
              )}
            </div>
            <div />
          </Card.Footer>
        </Card>

        {dispute &&
          dispute.period == 3 &&
          crowdfundingStatus &&
          arbitrableDispute && (
            <Appeal
              crowdfundingStatus={this.props.getCrowdfundingStatusCallback(
                dispute.arbitrated,
                disputeID
              )}
              appealCost={appealCost}
              winnerMultiplier={winnerMultiplier}
              loserMultiplier={loserMultiplier}
              sharedMultiplier={sharedMultiplier}
              multiplierDivisor={multiplierDivisor}
              appealCallback={this.appeal}
              appealPeriod={this.props.getAppealPeriodCallback(
                arbitrableDispute.disputeIDOnArbitratorSide
              )}
              currentRuling={this.props.getCurrentRulingCallback(
                arbitrableDispute.disputeIDOnArbitratorSide
              )}
              metaevidence={metaevidence}
            />
          )}

        <IPFS publishCallback={this.props.publishCallback} />
      </Container>
    );
  }
}

export default Interact;
