import React from "react";
import {
  Accordion,
  Breadcrumb,
  Button,
  Card,
  Col,
  Container,
  Dropdown,
  Form,
  FormControl,
  InputGroup,
  Modal,
  ProgressBar,
  Row
} from "react-bootstrap";
import Evidence from "../components/evidence";
import Appeal from "../components/appeal";
import Dropzone from "react-dropzone";
import debounce from "lodash.debounce";
import ReactMarkdown from "react-markdown";

class Interact extends React.Component {
  constructor(properties, { match }) {
    super(properties);
    this.state = {
      disputeID: this.props.route && this.props.route.match.params.id,
      dispute: {},
      fileInput: "",
      evidenceFileURI: "",
      metaevidence: "",
      evidences: [],
      subcourtDetails: {},
      modalShow: false,
      evidenceTitle: "",
      evidenceDescription: "",
      contributeModalShow: false
    };

    this.debouncedRetrieve = debounce(this.retrieveDisputeDetails, 500, {
      leading: false,
      trailing: true
    });

    console.log(properties);
  }

  async componentDidMount() {}

  async componentDidUpdate(previousProperties) {
    console.log("component update");
    if (this.props.disputeID !== previousProperties.disputeID)
      await this.setState({ disputeID: this.props.disputeID });
  }

  PERIODS = [
    "Evidence Period",
    "Commit Period",
    "Vote Period",
    "Appeal Period",
    "Execution Period",
    "ERROR: Dispute id out of bounds.",
    "Fetching..."
  ];

  submitEvidence = async evidence => {
    await this.props.submitEvidenceCallback({
      disputeID: this.state.disputeID,
      evidenceDescription: evidence.evidenceDescription,
      evidenceFileURI: evidence.evidenceDocument,
      evidenceTitle: evidence.evidenceTitle
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
    console.log("EVIDENCE SUBMISSION");
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

  onAppealButtonClick = async e => {
    await this.props.appealCallback(this.state.disputeID);
  };

  onDisputeIDChange = async e => {
    const disputeID = e.target.value;
    await this.setState({ disputeID });

    await this.debouncedRetrieve(disputeID);
  };

  retrieveDisputeDetails = async disputeID => {
    console.log(`Calculating ${disputeID}`);
    this.setState({ dispute: { period: 6 } });
    let dispute;
    let subcourtURI;
    let subcourt;
    let crowdfundingStatus;
    let appealCost;
    try {
      dispute = await this.props.getDisputeCallback(disputeID);

      subcourtURI = await this.props.getSubCourtDetailsCallback(
        dispute.subcourtID
      );
      console.log(subcourtURI);
      if (subcourtURI.includes("http")) subcourt = await fetch(subcourtURI);
      else subcourt = await fetch(`https://ipfs.kleros.io${subcourtURI}`);

      console.log(
        await this.props.getEvidencesCallback(dispute.arbitrated, disputeID)
      );

      appealCost = await this.props.getAppealCostCallback(disputeID);
      console.log(appealCost);

      await this.setState({
        dispute,
        subcourtDetails: await subcourt.json(),
        metaevidence: await this.props.getMetaEvidenceCallback(
          dispute.arbitrated,
          disputeID
        ),
        evidences: await this.props.getEvidencesCallback(
          dispute.arbitrated,
          disputeID
        )
      });
    } catch (err) {
      console.error(err.message);
      this.setState({ dispute: { period: 5 } });
    }

    try {
      crowdfundingStatus = await this.props.getCrowdfundingStatusCallback(
        dispute.arbitrated,
        disputeID
      );
      console.log(crowdfundingStatus);
    } catch (err) {
      console.error(err.message);
      this.setState({ crowdfundingStatus });
    }
  };

  getHumanReadablePeriod = period => this.PERIODS[period];

  render() {
    const {
      disputeID,
      dispute,
      fileInput,
      evidenceFileURI,
      metaevidence,
      evidences,
      subcourtDetails,
      evidenceTitle,
      evidenceDescription
    } = this.state;
    const metaevidencePayload = metaevidence.metaEvidenceJSON;

    console.log(this.props);
    console.log(this.state);

    return (
      <Container fluid="true">
        <Card>
          <Card.Header>
            <img alt="gavel" src="../gavel.svg" />
            Interact with a Dispute
          </Card.Header>
          <Card.Body>
            <Form>
              <Form.Row>
                <Col>
                  <Form.Group>
                    <Form.Label>Dispute Identifier</Form.Label>
                    <Form.Control
                      as="input"
                      id="disputeID"
                      onChange={this.onDisputeIDChange}
                      placeholder="Dispute identifier"
                      type="number"
                      value={disputeID}
                    />
                  </Form.Group>
                </Col>
                {disputeID && (
                  <Col className="align-self-center">
                    <h4>
                      Check out this{" "}
                      <a href={`https://court.kleros.io/cases/${disputeID}`}>
                        dispute on Kleros
                      </a>
                    </h4>
                  </Col>
                )}{" "}
              </Form.Row>
            </Form>
          </Card.Body>
          {metaevidence && (
            <Card.Footer className="p-0" id="dispute-detail-footer">
              <div className="text-center p-5">
                <h3>
                  {`${this.getHumanReadablePeriod(dispute.period)
                    .charAt(0)
                    .toUpperCase() +
                    this.getHumanReadablePeriod(dispute.period).slice(1)}`}
                </h3>
              </div>
              <div />
            </Card.Footer>
          )}
        </Card>
        <Evidence
          publishCallback={this.props.publishCallback}
          submitEvidenceCallback={this.submitEvidence}
        />
        {this.state.crowdfundingStatus && (
          <Appeal crowdfundingStatus={this.state.crowdfundingStatus} />
        )}

        <Modal
          onHide={e => this.setState({ modalShow: false })}
          show={this.state.modalShow}
        >
          <Modal.Header>
            <Modal.Title>Submit Evidence</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Form>
              <Form.Row>
                <Col>
                  <Form.Group controlId="evidenceTitle">
                    <Form.Label>Evidence Title</Form.Label>
                    <Form.Control
                      onChange={this.onControlChange}
                      type="text"
                      value={evidenceTitle}
                    />
                  </Form.Group>
                </Col>
              </Form.Row>
              <Form.Row>
                <Col>
                  <Form.Group controlId="evidenceDescription">
                    <Form.Label>Evidence Description</Form.Label>
                    <Form.Control
                      as="textarea"
                      onChange={this.onControlChange}
                      type="text"
                      value={evidenceDescription}
                    />
                  </Form.Group>
                </Col>
              </Form.Row>
              <Form.Row>
                <Col>
                  <Form.Group>
                    <Form.Label htmlFor="dropzone">
                      Evidence Document
                    </Form.Label>
                    <Dropzone onDrop={this.onDrop}>
                      {({ getRootProperties, getInputProperties }) => (
                        <section id="dropzone">
                          <div
                            {...getRootProperties()}
                            className="vertical-center"
                          >
                            <input {...getInputProperties()} />
                            <h5>
                              {(fileInput && fileInput.path) ||
                                "Drag 'n' drop some files here, or click to select files."}
                            </h5>
                          </div>
                        </section>
                      )}
                    </Dropzone>
                  </Form.Group>
                </Col>
              </Form.Row>
            </Form>
          </Modal.Body>
          <Modal.Footer>
            <Button onClick={this.onSubmitButtonClick}>Submit</Button>
          </Modal.Footer>
        </Modal>
        <Modal
          onHide={e => this.setState({ contributeModalShow: false })}
          show={this.state.contributeModalShow}
        >
          <Modal.Header>
            <Modal.Title>Contribute to Fees</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Modal.Title>Which side do you want to contribute</Modal.Title>
            <Form>
              <InputGroup className="mb-3">
                <InputGroup.Prepend>
                  <InputGroup.Radio
                    aria-label="Checkbox for following text input"
                    name="as"
                  />
                </InputGroup.Prepend>
                <FormControl aria-label="Text input with checkbox" />
              </InputGroup>
              <InputGroup>
                <InputGroup.Prepend>
                  <InputGroup.Radio
                    aria-label="Radio button for following text input"
                    name="as"
                  />
                </InputGroup.Prepend>
                <FormControl aria-label="Text input with radio button" />
              </InputGroup>
            </Form>
          </Modal.Body>
          <Modal.Footer>
            <h4>Contribution Amount</h4>
            <Button onClick={this.onSubmitButtonClick}>Submit</Button>
          </Modal.Footer>
        </Modal>
      </Container>
    );
  }
}

export default Interact;
