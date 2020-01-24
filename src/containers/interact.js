import React from "react";
import { Card, Col, Container, Form, Row } from "react-bootstrap";
import Evidence from "../components/evidence";
import Appeal from "../components/appeal";
import QuestionDisplay from "../components/question-display";
import debounce from "lodash.debounce";
import IPFS from "../components/ipfs";
import ReactMarkdown from "react-markdown";
import { ReactComponent as GavelSVG } from "../assets/images/gavel.svg";
import { ReactComponent as AttachmentSVG } from "../assets/images/attachment.svg";
import { EvidenceTimeline } from "@kleros/react-components";

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
      evidences: "",
      subcourtDetails: {},
      modalShow: false,
      evidenceTitle: "",
      evidenceDescription: "",
      contributeModalShow: false,
      submitting: false,
      arbitratorIDLoading: false,
      arbitrableIDLoading: false,
      fetchingString: ""
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

  submitEvidence = async evidence =>
    this.props.submitEvidenceCallback({
      disputeID: this.state.disputeID,
      evidenceDescription: evidence.evidenceDescription,
      evidenceDocument: evidence.evidenceDocument,
      evidenceTitle: evidence.evidenceTitle
    });

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

  commonFetchRoutine = async arbitrableDisputeID => {
    let arbitratorDispute;
    let arbitrableDispute;
    let subcourtURI;
    let subcourt;
    let crowdfundingStatus;
    let appealCost;
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
      console.log("CF");
      console.log(crowdfundingStatus);
      this.setState({ crowdfundingStatus, appealCost });
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
      metaevidence
    } = this.state;

    console.log(this.props);
    console.log(this.state);

    return (
      <Container fluid="true" className="main-content">
        <Card>
          <Card.Header>
            <GavelSVG />
            Interact with a Dispute
          </Card.Header>
          <hr className="mt-0" />
          <Card.Body
            style={{
              borderBottomLeftRadius: "0",
              borderBottomRightRadius: "0"
            }}
          >
            <Form>
              <Form.Row>
                <Col>
                  <Form.Group>
                    <Form.Label>Search Disputes on Court</Form.Label>
                    <Form.Control
                      disabled={arbitratorIDLoading}
                      as="input"
                      id="arbitratorDisputeID"
                      onChange={this.onDisputeIDChange}
                      placeholder="Please input a dispute identifier as in arbitrator contract."
                      type="number"
                      min="0"
                      value={arbitratorDisputeID}
                    />
                  </Form.Group>
                </Col>
                {arbitrableDispute && (
                  <Col className="text-center align-self-center">
                    <h4>
                      Check out this{" "}
                      <a
                        href={`https://court.kleros.io/cases/${arbitrableDispute.disputeIDOnArbitratorSide}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        dispute on Court
                      </a>
                    </h4>
                  </Col>
                )}{" "}
              </Form.Row>
              {arbitrableDispute && this.state.metaevidence.metaEvidenceJSON && (
                <Form.Row>
                  <Col>
                    <h1 className="display-title">
                      {this.state.metaevidence.metaEvidenceJSON.title}
                    </h1>
                  </Col>
                </Form.Row>
              )}
              {arbitrableDispute && this.state.metaevidence.metaEvidenceJSON && (
                <Form.Row>
                  <Card className="w-100 text-center" style={{ margin: 0 }}>
                    <Card.Body>
                      <Form.Group id="markdown" style={{ paddingLeft: 0 }}>
                        <ReactMarkdown
                          source={
                            this.state.metaevidence.metaEvidenceJSON.description
                          }
                        />
                      </Form.Group>
                      {this.state.metaevidence.metaEvidenceJSON.fileURI && (
                        <Card.Footer
                          style={{
                            backgroundColor: "#F5F1FD"
                          }}
                        >
                          <a
                            href={`
                              https://ipfs.kleros.io${this.state.metaevidence.metaEvidenceJSON.fileURI}`}
                          >
                            <AttachmentSVG />
                          </a>
                        </Card.Footer>
                      )}
                    </Card.Body>
                  </Card>
                </Form.Row>
              )}

              {arbitrableDispute && this.state.metaevidence.metaEvidenceJSON && (
                <>
                  <Form.Row>
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
                  </Form.Row>

                  <Form.Row>
                    <Card
                      className="w-100"
                      style={{
                        marginLeft: 0,
                        marginRight: 0
                      }}
                    >
                      <Card.Body>
                        <EvidenceTimeline
                          metaEvidence={metaevidence}
                          evidence={this.state.evidences}
                        />
                      </Card.Body>
                    </Card>
                  </Form.Row>
                </>
              )}
            </Form>
          </Card.Body>

          <Card.Footer className="p-0" id="dispute-detail-footer">
            <div className="text-center p-5">
              <h3 style={{ color: "white" }}>
                {this.getHumanReadablePeriod(dispute.period)}
              </h3>
            </div>
            <div />
          </Card.Footer>
        </Card>
        {dispute && ["0", "1", "2", "3"].find(x => x == dispute.period) && (
          <>
            <Evidence
              publishCallback={this.props.publishCallback}
              submitEvidenceCallback={this.submitEvidence}
            />
          </>
        )}
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
              appealCallback={this.appeal}
              appealPeriod={this.props.getAppealPeriodCallback(
                arbitrableDispute.disputeIDOnArbitratorSide
              )}
              currentRuling={this.props.getCurrentRulingCallback(
                arbitrableDispute.disputeIDOnArbitratorSide
              )}
              metaevidence={this.state.metaevidence}
            />
          )}
        <IPFS publishCallback={this.props.publishCallback} />
      </Container>
    );
  }
}

export default Interact;
