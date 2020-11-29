import React from "react";
import ReactMarkdown from "react-markdown";
import Confirmation from "../components/confirmation";
import "@github/markdown-toolbar-element";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBold, faHeading, faItalic, faCode, faLink, faImage, faQuoteLeft, faListOl, faListUl } from "@fortawesome/free-solid-svg-icons";
import Dropzone from "react-dropzone";
import styles from "containers/styles/create.module.css";

import { Container, Col, Row, Button, Form, Card, Dropdown, InputGroup } from "react-bootstrap";

import { Redirect } from "react-router-dom";

import IPFS from "../components/ipfs";
import { ReactComponent as GavelSVG } from "../assets/images/gavel.svg";
import { ReactComponent as ScalesSVG } from "../assets/images/scales.svg";
import { ReactComponent as EthereumSVG } from "../assets/images/ethereum.svg";
import { ReactComponent as UploadSVG } from "../assets/images/upload.svg";
import { ReactComponent as InfoSVG } from "../assets/images/info.svg";
import { ReactComponent as AvatarSVG } from "../assets/images/avatar.svg";

import { Cascader } from "antd";

const QuestionTypes = Object.freeze({
  SINGLE_SELECT: { code: "single-select", humanReadable: "Multiple choice: single select" },
  MULTIPLE_SELECT: { code: "multiple-select", humanReadable: "Multiple choice: multiple select" },
  UINT: { code: "uint", humanReadable: "Non-negative number" },
  INT: { code: "int", humanReadable: "Number" },
  STRING: { code: "string", humanReadable: "Text" },
});

class Create extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      initialNumberOfJurors: "3",
      title: "",
      category: "",
      description: "",
      question: "",
      titles: [],
      descriptions: [],
      modalShow: false,
      awaitingConfirmation: false,
      lastDisputeID: "",
      selectedSubcourt: "",
      arbitrationCost: "",
      primaryDocument: "",
      requesterAddress: "",
      respondentAddress: "",
      validated: false,
      questionType: QuestionTypes.SINGLE_SELECT,
      numberOfRulingOptions: 2,
      numberOfParties: 2,
    };
  }

  componentDidMount = async (e) => {
    this.onSubcourtSelect("0");
  };

  onSubcourtSelect = async (subcourtID) => {
    await this.setState({ selectedSubcourt: subcourtID });
    this.calculateArbitrationCost(this.state.selectedSubcourt, this.state.initialNumberOfJurors);
  };

  onModalClose = (e) => this.setState({ modalShow: false, awaitingConfirmation: false });

  onModalShow = (event) => {
    const form = event.currentTarget;
    if (form.checkValidity() == false) {
      event.preventDefault();
      event.stopPropagation();
    } else {
      event.preventDefault();
      event.stopPropagation();

      this.setState({ modalShow: true, validated: true });
    }

    this.setState({ validated: true });
  };

  onQuestionTypeChange = async (questionType) => {
    console.log(JSON.parse(questionType));
    await this.setState({ questionType: JSON.parse(questionType) });

    if (!(JSON.parse(questionType).code == QuestionTypes.SINGLE_SELECT.code || JSON.parse(questionType).code == QuestionTypes.MULTIPLE_SELECT.code)) {
      await this.setState({ numberOfRulingOptions: 0 }); // Default value, means the max at the smart contract
    } else {
      await this.setState({ numberOfRulingOptions: 2 }); // Default value, means the max at the smart contract
    }
  };

  onTitlesChange = async (event, index) => {
    this.setState((prevState) => ({
      titles: [...prevState.titles.slice(0, index), event.target.value, ...prevState.titles.slice(index + 1)],
    }));
  };

  onDescriptionsChange = async (event, index) => {
    this.setState((prevState) => ({
      descriptions: [...prevState.descriptions.slice(0, index), event.target.value, ...prevState.descriptions.slice(index + 1)],
    }));
  };

  onNumberOfRulingOptionsChange = async (event) => {
    let number = parseInt(event.target.value);
    if (Number.isNaN(number));
    {
      console.log(Number.isNaN(number));
      this.setState({ numberOfRulingOptions: number });
      return;
    }
    number = number > 32 ? 32 : 32;
    this.setState({ numberOfRulingOptions: number });
    this.setState((prevState) => ({ titles: prevState.titles.slice(0, number), descriptions: prevState.titles.slice(0, number) }));
  };

  onControlChange = async (e) => {
    await this.setState({ [e.target.id]: e.target.value });

    this.calculateArbitrationCost(this.state.selectedSubcourt, this.state.initialNumberOfJurors);
  };

  onDrop = async (acceptedFiles) => {
    this.setState({ fileInput: acceptedFiles[0] });

    var reader = new FileReader();
    reader.readAsArrayBuffer(acceptedFiles[0]);
    reader.addEventListener("loadend", async () => {
      const buffer = Buffer.from(reader.result);

      const result = await this.props.publishCallback(acceptedFiles[0].name, buffer);

      await this.setState({
        primaryDocument: "/ipfs/" + result[1].hash + result[0].path,
      });
    });
  };

  calculateArbitrationCost = async (subcourtID, noOfJurors) =>
    subcourtID &&
    noOfJurors &&
    this.setState({
      arbitrationCost: await this.props.getArbitrationCostCallback(subcourtID, noOfJurors),
    });

  onCreateButtonClick = async (e) => {
    console.log("hey");

    const { selectedSubcourt, initialNumberOfJurors, title, category, description, requester, requesterAddress, respondent, respondentAddress, question, titles, descriptions, primaryDocument, questionType, numberOfRulingOptions } = this.state;
    this.setState({ awaitingConfirmation: true });

    let noOfOptions = questionType.code == "multiple-select" ? Math.pow(2, numberOfRulingOptions) : numberOfRulingOptions;
    try {
      const receipt = await this.props.createDisputeCallback({
        selectedSubcourt,
        initialNumberOfJurors,
        title,
        category,
        description,
        aliases: {
          [requesterAddress]: requester,
          [respondentAddress]: respondent,
        },
        question,
        primaryDocument,
        numberOfRulingOptions: noOfOptions,
        rulingOptions: {
          type: questionType.code,
          titles: titles,
          descriptions: descriptions,
        },
      });
      this.setState({
        lastDisputeID: receipt.events.Dispute.returnValues._disputeID,
      });
    } catch (e) {
      console.error(e);
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
      modalShow,
      awaitingConfirmation,
      lastDisputeID,
      primaryDocument,
      selectedSubcourt,

      fileInput,
      arbitrationCost,
      requester,
      respondent,
      requesterAddress,
      respondentAddress,
      validated,
      questionType,
      numberOfRulingOptions,
      numberOfParties,
      rulingOptions,
      titles,
      descriptions,
    } = this.state;

    const { activeAddress, subcourtDetails, subcourtsLoading } = this.props;

    return (
      <main className={styles.create}>
        {lastDisputeID && <Redirect to={`/cases/${lastDisputeID}`} />}
        <div>
          <Form noValidate validated={validated} onSubmit={this.onModalShow}>
            <Row>
              <Col>
                <p className={styles.fillUpTheForm}>Fill up the form to</p>
                <h1 className={styles.h1}>Create a custom dispute</h1>
              </Col>
            </Row>
            <hr />
            <Row>
              <Col xl={3} md={6} sm={12} xs={12}>
                <Form.Group>
                  <Form.Label htmlFor="subcourt-dropdown">Court</Form.Label>
                  <Dropdown required onSelect={this.onSubcourtSelect}>
                    <Dropdown.Toggle id="subcourt-dropdown" block disabled={subcourtsLoading} className={styles.dropdownToggle}>
                      <ScalesSVG className={styles.scales} /> <span>{(subcourtsLoading && "Loading...") || (selectedSubcourt && subcourtDetails && subcourtDetails[selectedSubcourt].name) || "Please select a court"}</span>
                    </Dropdown.Toggle>

                    <Dropdown.Menu>
                      {subcourtDetails &&
                        subcourtDetails.map((subcourt, index) => (
                          <Dropdown.Item key={index} eventKey={index} className={`${index == selectedSubcourt && "selectedDropdownItem"}`}>
                            {subcourt && subcourt.name}
                          </Dropdown.Item>
                        ))}
                    </Dropdown.Menu>
                  </Dropdown>
                </Form.Group>
              </Col>
              <Col xl={3} md={6} sm={12} xs={12}>
                <Form.Group className="inner-addon left-addon">
                  <Form.Label htmlFor="initialNumberOfJurors">Number of Jurors</Form.Label>
                  <AvatarSVG className="glyphicon glyphicon-user" />
                  <Form.Control required id="initialNumberOfJurors" as="input" type="number" min="0" value={initialNumberOfJurors} onChange={this.onControlChange} placeholder={"Number of jurors"} />
                </Form.Group>
              </Col>
              <Col xl={3} md={6} sm={12} xs={12}>
                <Form.Group>
                  <Form.Label htmlFor="category">Category (Optional)</Form.Label>
                  <Form.Control id="category" as="input" value={category} onChange={this.onControlChange} placeholder={"Category"} />
                </Form.Group>
              </Col>
              <Col xl={3} md={6} sm={12} xs={12}>
                <Form.Group className={styles.arbitrationFeeGroup}>
                  <Form.Label htmlFor="arbitrationFee">Arbitration Cost</Form.Label>
                  <Form.Control as="div" className={styles.arbitrationFeeGroupPrepend}>
                    <EthereumSVG />
                    <span className={styles.arbitrationFee}>{arbitrationCost && arbitrationCost + " ETH"}</span>
                  </Form.Control>
                </Form.Group>
              </Col>
            </Row>
            <Row>
              <Col>
                <Form.Group>
                  <Form.Label htmlFor="title">Title</Form.Label>
                  <Form.Control required id="title" as="input" value={title} onChange={this.onControlChange} placeholder={"Title"} />
                  <Form.Control.Feedback type="invalid">Please enter title for the dispute, something explains it in a nutshell.</Form.Control.Feedback>
                </Form.Group>
              </Col>
            </Row>
            <Row>
              <Col>
                <Form.Label htmlFor="description">Description (Optional)</Form.Label>
              </Col>
            </Row>
            <Row>
              <Col>
                <Form.Group>
                  <Form.Control id="description" as="textarea" rows="5" value={description} onChange={this.onControlChange} placeholder={"Description of dispute in markdown"} />
                  <markdown-toolbar for="description">
                    <md-bold>
                      <FontAwesomeIcon icon={faBold} />
                    </md-bold>
                    <md-header>
                      <FontAwesomeIcon icon={faHeading} />
                    </md-header>
                    <md-italic>
                      <FontAwesomeIcon icon={faItalic} />
                    </md-italic>
                    <md-quote>
                      <FontAwesomeIcon icon={faQuoteLeft} />
                    </md-quote>
                    <md-code>
                      <FontAwesomeIcon icon={faCode} />
                    </md-code>
                    <md-link>
                      <FontAwesomeIcon icon={faLink} />
                    </md-link>
                    <md-image>
                      <FontAwesomeIcon icon={faImage} />
                    </md-image>
                    <md-unordered-list>
                      <FontAwesomeIcon icon={faListOl} />
                    </md-unordered-list>
                    <md-ordered-list>
                      <FontAwesomeIcon icon={faListUl} />
                    </md-ordered-list>
                  </markdown-toolbar>
                </Form.Group>
              </Col>
            </Row>
            <Row>
              <Col>
                <ReactMarkdown className={styles.markdown} source={description} />
              </Col>
            </Row>

            <hr />

            <Row>
              <Col xl={8} md={true} xs={12}>
                <Form.Group>
                  <Form.Label htmlFor="questionType">Question Type</Form.Label>

                  <Dropdown required onSelect={this.onQuestionTypeChange}>
                    <Dropdown.Toggle className={styles.dropdownToggle} id="questionType" block>
                      {questionType.humanReadable || "Error"}
                    </Dropdown.Toggle>

                    <Dropdown.Menu>
                      {Object.values(QuestionTypes).map((questionType, index) => (
                        <Dropdown.Item key={index} eventKey={JSON.stringify(questionType)}>
                          {questionType.humanReadable}
                        </Dropdown.Item>
                      ))}
                    </Dropdown.Menu>
                  </Dropdown>
                </Form.Group>
              </Col>
              {(questionType.code == QuestionTypes.SINGLE_SELECT.code || questionType.code == QuestionTypes.MULTIPLE_SELECT.code) && (
                <Col>
                  <Form.Group>
                    <Form.Label htmlFor="numberOfRulingOptions">Number of Options</Form.Label>
                    <Form.Control required id="numberOfRulingOptions" as="input" type="number" min="2" max="32" value={numberOfRulingOptions} onChange={this.onNumberOfRulingOptionsChange} placeholder={"Enter a number between 2 and 32"} />
                    <Form.Control.Feedback type="invalid">Please enter first ruling option, for example: "Yes"</Form.Control.Feedback>
                  </Form.Group>
                </Col>
              )}
            </Row>

            <Row>
              <Col>
                <Form.Group>
                  <Form.Label htmlFor="question">Question</Form.Label>

                  <Form.Control required id="question" as="input" value={question} onChange={this.onControlChange} placeholder={"Question"} />
                  <Form.Control.Feedback type="invalid">Please enter a question.</Form.Control.Feedback>
                </Form.Group>
              </Col>
            </Row>
            {!isNaN(numberOfRulingOptions) &&
              (questionType.code == QuestionTypes.SINGLE_SELECT.code || questionType.code == QuestionTypes.MULTIPLE_SELECT.code) &&
              [...Array(parseInt(numberOfRulingOptions))].map((value, index) => (
                <Row>
                  <Col>
                    <Form.Group>
                      <Form.Label htmlFor={`rulingOption${index}Title`}>Ruling Option {index + 1}</Form.Label>
                      <Form.Control required id={`rulingOption${index}Title`} as="input" value={titles[index]} onChange={(e) => this.onTitlesChange(e, index)} placeholder={`Ruling option ${index + 1}`} />
                      <Form.Control.Feedback type="invalid">Please enter first ruling option, for example: "Yes"</Form.Control.Feedback>
                    </Form.Group>
                  </Col>
                  <Col md={9}>
                    <Form.Group>
                      <Form.Label htmlFor={`rulingOption${index}Description`}>Ruling Option {index + 1} Description (Optional)</Form.Label>
                      <Form.Control id={`rulingOption${index}Description`} as="input" value={descriptions[index]} onChange={(e) => this.onDescriptionsChange(e, index)} placeholder={`Ruling option ${index + 1} description`} />
                    </Form.Group>
                  </Col>{" "}
                </Row>
              ))}

            <hr />
            <Row>
              {[...Array(parseInt(numberOfParties))].map((value, index) => (
                <>
                  <Col xl={2} l={2} md={4}>
                    <Form.Group>
                      <Form.Label htmlFor="requester">Party {index + 1}</Form.Label>

                      <Form.Control id="requester" as="input" value={requester} onChange={this.onControlChange} placeholder={"Please enter alias"} />
                    </Form.Group>
                  </Col>
                  <Col xl={4} l={4} md={8}>
                    <Form.Group>
                      <Form.Label htmlFor="requesterAddress">Party {index + 1} Address (Optional)</Form.Label>

                      <Form.Control pattern="0x[abcdefABCDEF0123456789]{40}" id="requesterAddress" as="input" value={requesterAddress} onChange={this.onControlChange} placeholder={"Please enter address"} />
                    </Form.Group>
                  </Col>
                </>
              ))}
            </Row>
            <Row>
              <Col>
                <Form.Group>
                  <Button className="cssCircle plusSign" onClick={(e) => this.setState({ numberOfParties: numberOfParties + 1 })}>
                    <span>+</span>
                  </Button>
                  <Button className="cssCircle minusSign" onClick={(e) => this.setState({ numberOfParties: numberOfParties - 1 > 0 ? numberOfParties - 1 : 0 })}>
                    <span>–</span>
                  </Button>
                </Form.Group>
              </Col>
            </Row>

            <Row className={styles.dropzoneRow}>
              <Col>
                <Form.Group>
                  <Form.Label htmlFor="dropzone">Upload the Primary Document (Optional)</Form.Label>
                  <Dropzone onDrop={this.onDrop}>
                    {({ getRootProps, getInputProps }) => (
                      <section id="dropzone">
                        <div {...getRootProps()} className={styles.dropzone}>
                          <input {...getInputProps()} />
                          <p style={{ padding: "1rem" }}>{(fileInput && fileInput.path) || <UploadSVG />}</p>
                        </div>
                      </section>
                    )}
                  </Dropzone>
                  <p className={styles.dropzoneInfo}>
                    <InfoSVG />
                    You can add multiple files using an archive file, such as zip or rar.
                  </p>
                </Form.Group>
              </Col>
            </Row>

            <Button type="submit" className={styles.submit} disabled={!activeAddress}>
              Next
            </Button>
          </Form>
        </div>

        <Confirmation
          selectedSubcourt={selectedSubcourt && subcourtDetails && subcourtDetails[selectedSubcourt].name}
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
          rulingOptions={rulingOptions}
          primaryDocument={primaryDocument}
          filePath={fileInput && fileInput.path}
          show={modalShow}
          onModalHide={this.onModalClose}
          onCreateDisputeButtonClick={this.onCreateButtonClick}
          awaitingConfirmation={awaitingConfirmation}
          activeAddress={activeAddress}
        />
      </main>
    );
  }
}

export default Create;
