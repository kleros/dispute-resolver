import React from "react";
import { Card, Col, Container, Form } from "react-bootstrap";
import Evidence from "../components/evidence";
import Appeal from "../components/appeal";
import debounce from "lodash.debounce";
import IPFS from "../components/ipfs";

class Interact extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      disputeID: this.props.route && this.props.route.match.params.id,
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
      submitting: false
    };

    this.debouncedRetrieve = debounce(this.retrieveDisputeDetails, 500, {
      leading: false,
      trailing: true
    });
  }

  async componentDidMount() {
    this.debouncedRetrieve(this.state.disputeID);
  }

  async componentDidUpdate(previousProperties) {
    if (this.props.disputeID !== previousProperties.disputeID)
      await this.setState({ disputeID: this.props.disputeID });
  }

  PERIODS = [
    "Evidence Period",
    "Commit Period",
    "Vote Period",
    "Appeal Period",
    "Execution Period",
    "Greek gods having trouble finding this dispute...",
    "Fetching..."
  ];

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
    const disputeID = e.target.value;
    await this.setState({ disputeID, arbitrableDispute: "" });

    await this.debouncedRetrieve(disputeID);
  };

  retrieveDisputeDetails = async arbitrableDisputeID => {
    console.log(`Calculating ${arbitrableDisputeID}`);
    this.setState({ dispute: { period: 6 } });
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
        arbitrableDispute,
        subcourtDetails: await subcourt.json(),
        metaevidence: await this.props.getMetaEvidenceCallback(
          arbitratorDispute.arbitrated,
          arbitrableDisputeID
        )
      });
    } catch (err) {
      console.error(err.message);
      this.setState({ dispute: { period: 5 } });
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

  getHumanReadablePeriod = period => this.PERIODS[period];

  render() {
    const {
      disputeID,
      dispute,
      arbitrableDispute,
      crowdfundingStatus,
      appealCost
    } = this.state;

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
                      placeholder="Please input a dispute identifier to query."
                      type="number"
                      min="0"
                      value={disputeID}
                    />
                  </Form.Group>
                </Col>
                {arbitrableDispute && (
                  <Col className="align-self-center">
                    <h4>
                      Check out this{" "}
                      <a
                        href={`https://court.kleros.io/cases/${
                          arbitrableDispute.disputeIDOnArbitratorSide
                        }`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        dispute on Kleros
                      </a>
                    </h4>
                  </Col>
                )}{" "}
              </Form.Row>
            </Form>
          </Card.Body>

          <Card.Footer className="p-0" id="dispute-detail-footer">
            <div className="text-center p-5">
              <h3>{this.getHumanReadablePeriod(dispute.period)}</h3>
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
