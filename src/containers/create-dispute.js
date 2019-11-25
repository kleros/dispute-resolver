import React from "react";
import ReactMarkdown from "react-markdown";
import Confirmation from "../components/confirmation";
import "@github/markdown-toolbar-element";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBold,
  faHeading,
  faItalic,
  faCode,
  faLink,
  faImage,
  faQuoteLeft,
  faListOl,
  faListUl
} from "@fortawesome/free-solid-svg-icons";
import Dropzone from "react-dropzone";

import { Container, Col, Button, Form, Card, Dropdown } from "react-bootstrap";

import { Redirect } from "react-router-dom";

import IPFS from "../components/ipfs";

class CreateDispute extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      initialNumberOfJurors: "3",
      title: "",
      category: "",
      description: "",
      question: "",
      firstRulingOption: "",
      firstRulingDescription: "",
      secondRulingOption: "",
      secondRulingDescription: "",
      modalShow: false,
      awaitingConfirmation: false,
      lastDisputeID: "",
      selectedSubcourt: "",
      subcourts: [],
      subcourtsLoading: true,
      arbitrationCost: "",
      primaryDocument: "",
      requester: "Requester",
      respondent: "Respondent",
      requesterAddress: props.web3.utils.toChecksumAddress(props.activeAddress),
      respondentAddress: props.web3.utils.toChecksumAddress(
        props.activeAddress
      ),
      validated: false
    };
  }

  componentDidMount = async e => {
    // TODO Simplify
    let subcourtURI,
      subcourt,
      subcourts = [],
      counter = 0,
      subcourtURIs = [];
    while (counter < 15) {
      subcourtURI = await this.props.getSubCourtDetailsCallback(counter++);
      subcourtURIs.push(subcourtURI);
    }

    console.log(subcourtURIs);

    for (var i = 0; i < subcourtURIs.length; i++) {
      console.log(subcourtURIs[i]);
      try {
        if (subcourtURIs[i].includes("http")) {
          subcourt = await fetch(subcourtURIs[i]);
        } else {
          subcourt = await fetch("https://ipfs.kleros.io" + subcourtURIs[i]);
        }
        subcourts[i] = await subcourt.json();
      } catch (e) {
        console.log(i);
      }
      console.log(subcourts);
    }
    await this.setState({
      subcourts,
      subcourtsLoading: false,
      selectedSubcourt: "0"
    });
  };

  onSubcourtSelect = async subcourtID => {
    await this.setState({ selectedSubcourt: subcourtID });
    this.calculateArbitrationCost(
      this.state.selectedSubcourt,
      this.state.initialNumberOfJurors
    );
  };

  onModalClose = e =>
    this.setState({ modalShow: false, awaitingConfirmation: false });

  onModalShow = event => {
    const form = event.currentTarget;
    if (form.checkValidity() == false) {
      console.log("invalid");
      console.log(form);
      event.preventDefault();
      event.stopPropagation();
    } else {
      event.preventDefault();
      event.stopPropagation();
      console.log(form);

      console.log("valid");
      this.setState({ modalShow: true });
    }
    this.setState({ validated: true });
  };

  onControlChange = async e => {
    await this.setState({ [e.target.id]: e.target.value });

    this.calculateArbitrationCost(
      this.state.selectedSubcourt,
      this.state.initialNumberOfJurors
    );
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
        primaryDocument: "/ipfs/" + result[1].hash + result[0].path
      });
    });
  };

  calculateArbitrationCost = async (subcourtID, noOfJurors) =>
    subcourtID &&
    noOfJurors &&
    this.setState({
      arbitrationCost: await this.props.getArbitrationCostCallback(
        subcourtID,
        noOfJurors
      )
    });

  onCreateDisputeButtonClick = async e => {
    e.preventDefault();
    e.stopPropagation();
    console.log("create dispute clicked");
    const {
      selectedSubcourt,
      initialNumberOfJurors,
      title,
      category,
      description,
      requester,
      requesterAddress,
      respondent,
      respondentAddress,
      question,
      firstRulingOption,
      secondRulingOption,
      firstRulingDescription,
      secondRulingDescription,
      primaryDocument
    } = this.state;

    this.setState({ awaitingConfirmation: true });
    try {
      const receipt = await this.props.createDisputeCallback({
        selectedSubcourt,
        initialNumberOfJurors,
        title,
        category,
        description,
        aliases: {
          [requesterAddress]: requester,
          [respondentAddress]: respondent
        },
        question,
        firstRulingOption,
        secondRulingOption,
        firstRulingDescription,
        secondRulingDescription,
        primaryDocument
      });
      this.setState({
        lastDisputeID: receipt.events.MetaEvidence.returnValues._metaEvidenceID
      });
    } catch (e) {
      this.setState({ awaitingConfirmation: false });
    }

    this.onModalClose();
  };

  render() {
    console.debug(this.props);
    console.debug(this.state);

    const {
      initialNumberOfJurors,
      title,
      category,
      description,
      question,
      firstRulingOption,
      secondRulingOption,
      firstRulingDescription,
      secondRulingDescription,
      modalShow,
      awaitingConfirmation,
      lastDisputeID,
      primaryDocument,
      selectedSubcourt,
      subcourts,
      subcourtsLoading,
      fileInput,
      arbitrationCost,
      requester,
      respondent,
      requesterAddress,
      respondentAddress,
      validated
    } = this.state;

    const { activeAddress } = this.props;

    return (
      <Container fluid="true">
        {lastDisputeID && <Redirect to={`/interact/${lastDisputeID}`} />}

        <Card>
          <Card.Header>
            <img src="gavel.svg" alt="gavel" />
            Create a Dispute
          </Card.Header>
          <hr className="mt-0" />
          <Card.Body>
            <Form noValidate validated={validated} onSubmit={this.onModalShow}>
              <Form.Row>
                <Col>
                  <Form.Group>
                    <Form.Label htmlFor="subcourt-dropdown">Court</Form.Label>
                    <Dropdown required onSelect={this.onSubcourtSelect}>
                      <Dropdown.Toggle
                        id="subcourt-dropdown"
                        block
                        disabled={subcourtsLoading}
                      >
                        {(subcourtsLoading && "Loading...") ||
                          (selectedSubcourt &&
                            subcourts[selectedSubcourt].name) ||
                          "Please select a court"}
                      </Dropdown.Toggle>

                      <Dropdown.Menu>
                        {subcourts.map((subcourt, index) => (
                          <Dropdown.Item key={index} eventKey={index}>
                            {subcourt.name}
                          </Dropdown.Item>
                        ))}
                      </Dropdown.Menu>
                    </Dropdown>
                  </Form.Group>
                </Col>
                <Col>
                  <Form.Group>
                    <Form.Label htmlFor="initialNumberOfJurors">
                      Number of Jurors
                    </Form.Label>
                    <Form.Control
                      required
                      id="initialNumberOfJurors"
                      as="input"
                      type="number"
                      min="0"
                      value={initialNumberOfJurors}
                      onChange={this.onControlChange}
                      placeholder={"Number of jurors"}
                    />
                  </Form.Group>
                </Col>{" "}
                <Col>
                  <Form.Group>
                    <Form.Label htmlFor="arbitrationFee">
                      Arbitration Cost
                    </Form.Label>
                    <Form.Control
                      id="arbitrationFee"
                      readOnly
                      type="text"
                      value={arbitrationCost && arbitrationCost + " Ether"}
                      placeholder="Please select a court and specify number of jurors."
                    />
                  </Form.Group>
                </Col>
              </Form.Row>
              <hr />
              <Form.Row>
                <Col>
                  <Form.Group>
                    <Form.Label htmlFor="title">Title</Form.Label>
                    <Form.Control
                      required
                      id="title"
                      as="input"
                      value={title}
                      onChange={this.onControlChange}
                      placeholder={"Title"}
                    />
                    <Form.Control.Feedback type="invalid">
                      Please provide title for the dispute, something explains
                      it in a nutshell.
                    </Form.Control.Feedback>
                  </Form.Group>
                </Col>
                <Col>
                  <Form.Group>
                    <Form.Label htmlFor="category">
                      Category (optional)
                    </Form.Label>
                    <Form.Control
                      id="category"
                      as="input"
                      value={category}
                      onChange={this.onControlChange}
                      placeholder={"Category"}
                    />
                  </Form.Group>
                </Col>
              </Form.Row>
              <Form.Row>
                <Col>
                  <Form.Label htmlFor="description">
                    Description (optional)
                  </Form.Label>
                </Col>
              </Form.Row>
              <Form.Row className="mb-3">
                <Col>
                  <Form.Group>
                    <markdown-toolbar for="description">
                      <md-bold>
                        <FontAwesomeIcon className="mr-3" icon={faBold} />
                      </md-bold>
                      <md-header>
                        <FontAwesomeIcon className="mr-3" icon={faHeading} />
                      </md-header>
                      <md-italic>
                        <FontAwesomeIcon className="mr-3" icon={faItalic} />
                      </md-italic>
                      <md-quote>
                        <FontAwesomeIcon className="mr-3" icon={faQuoteLeft} />
                      </md-quote>
                      <md-code>
                        <FontAwesomeIcon className="mr-3" icon={faCode} />
                      </md-code>
                      <md-link>
                        <FontAwesomeIcon className="mr-3" icon={faLink} />
                      </md-link>
                      <md-image>
                        <FontAwesomeIcon className="mr-3" icon={faImage} />
                      </md-image>
                      <md-unordered-list>
                        <FontAwesomeIcon className="mr-3" icon={faListOl} />
                      </md-unordered-list>
                      <md-ordered-list>
                        <FontAwesomeIcon className="mr-3" icon={faListUl} />
                      </md-ordered-list>
                    </markdown-toolbar>
                    <Form.Control
                      id="description"
                      as="textarea"
                      rows="3"
                      value={description}
                      onChange={this.onControlChange}
                      placeholder={"Description of dispute in markdown"}
                    />
                  </Form.Group>
                </Col>
                <Col>
                  <Form.Group id="markdown">
                    <ReactMarkdown source={description} />
                  </Form.Group>
                </Col>
              </Form.Row>

              <hr />
              <Form.Row>
                <Col md={2} l={2} xl={2}>
                  <Form.Group>
                    <Form.Label htmlFor="requester">Party A</Form.Label>

                    <Form.Control
                      id="requester"
                      as="input"
                      value={requester}
                      onChange={this.onControlChange}
                      placeholder={"Please enter alias"}
                    />
                  </Form.Group>
                </Col>
                <Col md={4} l={4} xl={4}>
                  <Form.Group>
                    <Form.Label htmlFor="requesterAddress">
                      Party A Address (optional)
                    </Form.Label>

                    <Form.Control
                      className={
                        !this.props.web3.utils.checkAddressChecksum(
                          requesterAddress
                        ) && "text-danger"
                      }
                      id="requesterAddress"
                      as="input"
                      value={requesterAddress}
                      onChange={this.onControlChange}
                      placeholder={"Please enter address"}
                    />
                  </Form.Group>
                </Col>
                <Col md={2} l={2} xl={2}>
                  <Form.Group>
                    <Form.Label htmlFor="respondent">Party B</Form.Label>

                    <Form.Control
                      id="respondent"
                      as="input"
                      value={respondent}
                      onChange={this.onControlChange}
                      placeholder={"Please enter alias"}
                    />
                  </Form.Group>
                </Col>
                <Col md={4} l={4} xl={4}>
                  <Form.Group>
                    <Form.Label htmlFor="respondentAddress">
                      Party B Address (optional)
                    </Form.Label>

                    <Form.Control
                      className={
                        !this.props.web3.utils.checkAddressChecksum(
                          respondentAddress
                        ) && "text-danger"
                      }
                      id="respondentAddress"
                      as="input"
                      value={respondentAddress}
                      onChange={this.onControlChange}
                      placeholder={"Please enter address"}
                    />
                  </Form.Group>
                </Col>
              </Form.Row>

              <hr />
              <Form.Row>
                <Col>
                  <Form.Group>
                    <Form.Label htmlFor="question">Question</Form.Label>

                    <Form.Control
                      required
                      id="question"
                      as="input"
                      value={question}
                      onChange={this.onControlChange}
                      placeholder={"Question"}
                    />
                    <Form.Control.Feedback type="invalid">
                      Please provide a question.
                    </Form.Control.Feedback>
                  </Form.Group>
                </Col>
              </Form.Row>
              <Form.Row>
                <Col>
                  <Form.Group>
                    <Form.Label htmlFor="firstRulingOption">
                      First Ruling Option
                    </Form.Label>
                    <Form.Control
                      required
                      id="firstRulingOption"
                      as="input"
                      value={firstRulingOption}
                      onChange={this.onControlChange}
                      placeholder={"First ruling option"}
                    />
                    <Form.Control.Feedback type="invalid">
                      Please provide first ruling option, for example: "Yes"
                    </Form.Control.Feedback>
                  </Form.Group>
                </Col>
                <Col>
                  <Form.Group>
                    <Form.Label htmlFor="firstRulingDescription">
                      First Ruling Description (optional)
                    </Form.Label>
                    <Form.Control
                      id="firstRulingDescription"
                      as="input"
                      value={firstRulingDescription}
                      onChange={this.onControlChange}
                      placeholder={"Description of first ruling option"}
                    />
                  </Form.Group>
                </Col>{" "}
              </Form.Row>
              <Form.Row>
                <Col>
                  <Form.Group>
                    <Form.Label htmlFor="secondRulingOption">
                      Second Ruling Option
                    </Form.Label>
                    <Form.Control
                      required
                      id="secondRulingOption"
                      as="input"
                      value={secondRulingOption}
                      onChange={this.onControlChange}
                      placeholder={"Second ruling option"}
                    />
                    <Form.Control.Feedback type="invalid">
                      Please provide first ruling option, for example: "No"
                    </Form.Control.Feedback>
                  </Form.Group>
                </Col>
                <Col>
                  <Form.Group>
                    <Form.Label htmlFor="secondRulingDescription">
                      Second Ruling Description (optional)
                    </Form.Label>
                    <Form.Control
                      id="secondRulingDescription"
                      as="input"
                      value={secondRulingDescription}
                      onChange={this.onControlChange}
                      placeholder={"Description of second ruling option"}
                    />
                  </Form.Group>
                </Col>{" "}
              </Form.Row>
              <Form.Row>
                <Col>
                  <Form.Group>
                    <Form.Label htmlFor="dropzone">
                      Primary Document (optional)
                    </Form.Label>
                    <Dropzone onDrop={this.onDrop}>
                      {({ getRootProps, getInputProps }) => (
                        <section id="dropzone">
                          <div {...getRootProps()} className="vertical-center">
                            <input {...getInputProps()} />
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

              <Button type="submit" className="ok" block>
                Create Dispute{" "}
                {arbitrationCost && "for " + arbitrationCost + " Ether"}
              </Button>
            </Form>
          </Card.Body>
        </Card>

        <Confirmation
          selectedSubcourt={
            selectedSubcourt && subcourts[selectedSubcourt].name
          }
          initialNumberOfJurors={initialNumberOfJurors}
          arbitrationCost={arbitrationCost}
          title={title}
          category={category}
          description={description}
          requester={requester}
          requesterAddress={requesterAddress}
          respondent={respondent}
          respondentAddress={respondentAddress}
          question={question}
          firstRulingOption={firstRulingOption}
          firstRulingDescription={firstRulingDescription}
          secondRulingOption={secondRulingOption}
          secondRulingDescription={secondRulingDescription}
          primaryDocument={primaryDocument}
          filePath={fileInput && fileInput.path}
          show={modalShow}
          onModalHide={this.onModalClose}
          onCreateDisputeButtonClick={this.onCreateDisputeButtonClick}
          awaitingConfirmation={awaitingConfirmation}
        />
        <IPFS publishCallback={this.props.publishCallback} />
      </Container>
    );
  }
}

export default CreateDispute;
