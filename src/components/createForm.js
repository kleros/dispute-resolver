import React from "react";
import {Container, Col, Row, Button, Form, Dropdown, InputGroup} from "react-bootstrap";
import {ReactComponent as AttachmentSVG} from "../assets/images/attachment.svg";
import {ReactComponent as GavelSVG} from "../assets/images/gavel.svg";
import {ReactComponent as ScalesSVG} from "../assets/images/scales.svg";
import {ReactComponent as EthereumSVG} from "../assets/images/ethereum.svg";
import {ReactComponent as UploadSVG} from "../assets/images/upload.svg";
import {ReactComponent as InfoSVG} from "../assets/images/info.svg";
import {ReactComponent as AvatarSVG} from "../assets/images/avatar.svg";
import networkMap from "../ethereum/network-contract-mapping";

import Dropzone from "react-dropzone";

const QuestionTypes = Object.freeze({
  SINGLE_SELECT: {code: "single-select", humanReadable: "Multiple choice: single select"},
  MULTIPLE_SELECT: {code: "multiple-select", humanReadable: "Multiple choice: multiple select"},
  UINT: {
    code: "uint", humanReadable: "Non-negative number"
  }, //  INT: { code: "int", humanReadable: "Number" }, Not-implemented in Court, so disabling.
  // STRING: { code: "string", humanReadable: "Text" },  Not-implemented in Court, so disabling.
  DATETIME: {code: "datetime", humanReadable: "Date"},
});

import styles from "components/styles/createForm.module.css";

class CreateForm extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      initialNumberOfJurors: "3",
      title: "",
      category: "",
      description: "",
      question: "",
      rulingTitles: [""],
      rulingDescriptions: [],
      names: [],
      addresses: [],
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
      numberOfParties: 1,
      summary: false,
      uploading: false,
    };
  }

  onNextButtonClick = async (event) => {
    const {form} = event.target;
    const {subcourtDetails} = this.props;
    const {
      arbitrationCost,
      selectedSubcourt,
      title,
      category,
      description,
      initialNumberOfJurors,
      question,
      rulingTitles,
      rulingDescriptions,
      names,
      addresses,
      primaryDocument,
      questionType,
    } = this.state;

    const valid = form.checkValidity();
    event.preventDefault();
    event.stopPropagation();

    this.setState({validated: !valid});

    if (valid) {
      this.props.onNextButtonClickCallback({
        subcourtDetails,
        selectedSubcourt,
        title,
        category,
        description,
        initialNumberOfJurors,
        question,
        rulingTitles: questionType.code == "single-select" || questionType.code == "multiple-select" ? rulingTitles : [],
        rulingDescriptions,
        names,
        addresses,
        primaryDocument,
        questionType,
        arbitrationCost,
      });
    }
  };

  onSubcourtSelect = async (subcourtID) => {
    if (!networkMap[this.props.network].ARBITRABLE_PROXY) return
    this.setState({selectedSubcourt: subcourtID});
    this.calculateArbitrationCost(this.state.selectedSubcourt, this.state.initialNumberOfJurors);
  };

  onQuestionTypeChange = async (questionType) => {
    console.debug(JSON.parse(questionType));
    this.setState({questionType: JSON.parse(questionType)});

    if (!(JSON.parse(questionType).code == QuestionTypes.SINGLE_SELECT.code || JSON.parse(questionType).code == QuestionTypes.MULTIPLE_SELECT.code)) {
      this.setState({numberOfRulingOptions: 0}); // Default value, means the max at the smart contract
    } else {
      this.setState({numberOfRulingOptions: 2}); // Default value, means the max at the smart contract
    }
  };

  onArrayStateVariableChange = async (event, variable, index) => {
    this.setState((prevState) => ({
      [variable]: [...prevState[variable].slice(0, index), event.target.value, ...prevState[variable].slice(index + 1)],
    }));
  };

  onNumberOfRulingOptionsChange = async (event) => {
    let number = parseInt(event.target.value);
    if (Number.isNaN(number)) ;
    {
      console.debug(Number.isNaN(number));
      this.setState({numberOfRulingOptions: number});
      return;
    }
    number = number > 32 ? 32 : 32;
    this.setState({numberOfRulingOptions: number});
    this.setState((prevState) => ({
      rulingTitles: prevState.rulingTitles.slice(0, number), rulingDescriptions: prevState.rulingTitles.slice(0, number)
    }));
  };

  onControlChange = async (e) => {
    this.setState({[e.target.id]: e.target.value});

    this.calculateArbitrationCost(this.state.selectedSubcourt, this.state.initialNumberOfJurors);
  };

  onDrop = async (acceptedFiles) => {
    this.setState({fileInput: acceptedFiles[0], uploading: true});

    var reader = new FileReader();
    reader.readAsArrayBuffer(acceptedFiles[0]);
    reader.addEventListener("loadend", async () => {
      const buffer = Buffer.from(reader.result);

      const result = await this.props.publishCallback(acceptedFiles[0].name, buffer);

      this.setState({
        primaryDocument: "/ipfs/" + result[1].hash + result[0].path, uploading: false,
      });
    });
  };

  calculateArbitrationCost = async (subcourtID, noOfJurors) => subcourtID && noOfJurors && this.setState({
    arbitrationCost: await this.props.getArbitrationCostCallback(subcourtID, noOfJurors),
  });

  componentDidMount = async (e) => {
    this.onSubcourtSelect("0");
    const {formData} = this.props;
    if (formData) this.setState({
      selectedSubcourt: parseInt(formData.selectedSubcourt) && formData.selectedSubcourt,
      initialNumberOfJurors: formData.initialNumberOfJurors && formData.initialNumberOfJurors,
      category: formData.category && formData.category,
      title: formData.title && formData.title,
      description: formData.description && formData.description,
      question: formData.question && formData.question,
      primaryDocument: formData.primaryDocument && formData.primaryDocument,
      questionType: formData.questionType.code.length > 0 && formData.questionType,
      numberOfRulingOptions: formData.rulingTitles.length > 0 && formData.rulingTitles.length,
      rulingTitles: formData.rulingTitles.length > 0 ? formData.rulingTitles : [],
      rulingDescriptions: formData.rulingDescriptions.length > 0 ? formData.rulingDescriptions : [],
      names: formData.names.length > 0 ? formData.names : [],
      addresses: formData.addresses.length > 0 ? formData.addresses : [],
    });
  };

  render() {
    const {awaitingConfirmation, show, activeAddress, subcourtsLoading, subcourtDetails, onNextButtonClickCallback, network} = this.props;

    const {
      title,
      description,
      category,
      question,
      validated,
      questionType,
      numberOfRulingOptions,
      rulingTitles,
      numberOfParties,
      rulingDescriptions,
      names,
      addresses,
      fileInput,
      initialNumberOfJurors,
      arbitrationCost,
      selectedSubcourt,
      summary,
      primaryDocument,
      uploading,
    } = this.state;

    if (!networkMap[network].ARBITRABLE_PROXY) return <h1>There is no arbitrable contract deployed in this network.
      So unfortunately you can't create a dispute.
      Feel free to head over <a href="https://github.com/kleros/dispute-resolver/issues" target="_blank" rel="noopener noreferrer">GitHub
        issues</a> to request this feature.</h1>

    return (<section className={`${styles.createForm}`}>
      <Form noValidate validated={validated} onSubmit={this.onModalShow}>
        <Row>
          <Col>
            <p className={styles.fillUpTheForm}>Fill up the form to</p>
            <h1 className={styles.h1}>Create a custom dispute</h1>
          </Col>
        </Row>
        <hr/>
        <Row>
          <Col xl={6} md={12} sm={24} xs={24}>
            <Form.Group>
              <Form.Label htmlFor="subcourt-dropdown">Court</Form.Label>
              <Dropdown required onSelect={this.onSubcourtSelect}>
                <Dropdown.Toggle  id="subcourt-dropdown" block disabled={subcourtsLoading || summary}
                                 className={styles.dropdownToggle}>
                  <ScalesSVG className={styles.scales}/>{" "}
                  <span className="font-weight-normal">
                      {(subcourtsLoading && "Loading...") || (selectedSubcourt && subcourtDetails && subcourtDetails[selectedSubcourt] && subcourtDetails[selectedSubcourt].name) || "Please select a court"}
                    </span>
                </Dropdown.Toggle>

                <Dropdown.Menu>
                  {subcourtDetails && subcourtDetails.map((subcourt, index) => (
                    <Dropdown.Item key={index} eventKey={index} className={`${index == selectedSubcourt && "selectedDropdownItem"}`}>
                      {subcourt && subcourt.name}
                    </Dropdown.Item>))}
                </Dropdown.Menu>
              </Dropdown>
            </Form.Group>
          </Col>
          <Col xl={6} md={12} sm={24} xs={24}>
            <Form.Group className="inner-addon left-addon">
              <Form.Label htmlFor="initialNumberOfJurors">Number of Votes</Form.Label>
              <AvatarSVG className="glyphicon glyphicon-user"/>
              <Form.Control
                required
                id="initialNumberOfJurors"
                as="input"
                type="number"
                min="1"
                value={initialNumberOfJurors}
                onChange={this.onControlChange}
                placeholder={"Number of votes"}
              />
            </Form.Group>
          </Col>
          <Col xl={6} md={12} sm={24} xs={24}>
            <Form.Group>
              <Form.Label htmlFor="category">Category (Optional)</Form.Label>
              <Form.Control id="category" as="input" value={category} onChange={this.onControlChange} placeholder={"Category"}/>
            </Form.Group>
          </Col>
          <Col xl={6} md={12} sm={24} xs={24}>
            <Form.Group className={styles.arbitrationFeeGroup}>
              <Form.Label htmlFor="arbitrationFee">Arbitration Cost</Form.Label>
              <Form.Control as="div" className={styles.arbitrationFeeGroupPrepend}>
                <EthereumSVG/>
                {<span
                  className={styles.arbitrationFee}>{arbitrationCost && arbitrationCost + " " + networkMap[network].CURRENCY_SHORT}</span>}
              </Form.Control>
            </Form.Group>
          </Col>
        </Row>
        <Row>
          <Col>
            <Form.Group>
              <Form.Label htmlFor="title">Title</Form.Label>
              <Form.Control required id="title" as="input" value={title} onChange={this.onControlChange} placeholder={"Title"}/>
              <Form.Control.Feedback type="invalid">Please enter title for the dispute, something explains it in a
                nutshell.</Form.Control.Feedback>
            </Form.Group>
          </Col>
        </Row>

        <Row>
          <Col>
            <Form.Group>
              <Form.Label htmlFor="description">Description (Optional)</Form.Label>
              <Form.Control id="description" as="textarea" rows="5" value={description} onChange={this.onControlChange}
                            placeholder={"Description of dispute"}/>
            </Form.Group>
          </Col>
        </Row>

        <hr/>

        <Row>
          <Col xl={16} md={true} xs={24}>
            <Form.Group>
              <Form.Label htmlFor="questionType">Question Type</Form.Label>

              <Dropdown required onSelect={this.onQuestionTypeChange}>
                <Dropdown.Toggle className={`form-control ${styles.dropdownToggle} font-weight-normal`} id="questionType" block>
                  {questionType.humanReadable || "Error"}
                </Dropdown.Toggle>

                <Dropdown.Menu>
                  {Object.values(QuestionTypes).map((questionType, index) => (
                    <Dropdown.Item key={index} eventKey={JSON.stringify(questionType)}>
                      {questionType.humanReadable}
                    </Dropdown.Item>))}
                </Dropdown.Menu>
              </Dropdown>
            </Form.Group>
          </Col>
          {(questionType.code == QuestionTypes.SINGLE_SELECT.code || questionType.code == QuestionTypes.MULTIPLE_SELECT.code) && (<Col>
            <Form.Group>
              <Form.Label htmlFor="numberOfRulingOptions">Number of Options</Form.Label>
              <Form.Control
                required
                id="numberOfRulingOptions"
                as="input"
                type="number"
                min="2"
                max="32"
                value={numberOfRulingOptions}
                onChange={this.onNumberOfRulingOptionsChange}
                placeholder={"Enter a number between 2 and 32"}
              />
              <Form.Control.Feedback type="invalid">Please enter first ruling option, for example: "Yes"</Form.Control.Feedback>
            </Form.Group>
          </Col>)}
        </Row>

        <Row>
          <Col>
            <Form.Group>
              <Form.Label htmlFor="question">Question</Form.Label>

              <Form.Control required id="question" as="input" value={question} onChange={this.onControlChange} placeholder={"Question"}/>
              <Form.Control.Feedback type="invalid">Please enter a question.</Form.Control.Feedback>
            </Form.Group>
          </Col>
        </Row>
        {!isNaN(numberOfRulingOptions) && (questionType.code == QuestionTypes.SINGLE_SELECT.code || questionType.code == QuestionTypes.MULTIPLE_SELECT.code) && [...Array(parseInt(numberOfRulingOptions))].map((value, index) => (
          <Row>
            <Col>
              <Form.Group>
                <Form.Label htmlFor={`rulingOption${index}Title`}>Ruling Option {index + 1}</Form.Label>
                <Form.Control
                  required
                  id={`rulingOption${index}Title`}
                  as="input"
                  value={rulingTitles[index]}
                  onChange={(e) => this.onArrayStateVariableChange(e, "rulingTitles", index)}
                  placeholder={`Ruling option ${index + 1}`}
                />
                <Form.Control.Feedback type="invalid">Please enter first ruling option, for example: "Yes"</Form.Control.Feedback>
              </Form.Group>
            </Col>
            <Col md={18}>
              <Form.Group>
                <Form.Label htmlFor={`rulingOption${index}Description`}>Ruling Option {index + 1} Description (Optional)</Form.Label>
                <Form.Control
                  id={`rulingOption${index}Description`}
                  as="input"
                  value={rulingDescriptions[index]}
                  onChange={(e) => this.onArrayStateVariableChange(e, "rulingDescriptions", index)}
                  placeholder={`Ruling option ${index + 1} description`}
                />
              </Form.Group>
            </Col>{" "}
          </Row>))}

        <hr/>
        <Row>
          {[...Array(parseInt(numberOfParties))].map((value, index) => (<React.Fragment key={index}>
            <Col xl={4} l={4} md={8}>
              <Form.Group>
                <Form.Label htmlFor="requester">Alias {index + 1} (Optional)</Form.Label>

                <Form.Control
                  required={addresses[index]}
                  id={`name${index}`}
                  as="input"
                  value={names[index]}
                  onChange={(e) => this.onArrayStateVariableChange(e, "names", index)}
                  placeholder={"Please enter alias"}
                />
              </Form.Group>
            </Col>
            <Col xl={8} l={8} md={16}>
              <Form.Group>
                <Form.Label htmlFor={`address${index}`}>Address of Alias {index + 1} (Optional)</Form.Label>

                <Form.Control
                  required={names[index]}
                  pattern="0x[abcdefABCDEF0123456789]{40}"
                  id="requesterAddress"
                  as="input"
                  value={addresses[index]}
                  onChange={(e) => this.onArrayStateVariableChange(e, "addresses", index)}
                  placeholder={"Please enter address"}
                />
              </Form.Group>
            </Col>
          </React.Fragment>))}
        </Row>
        <Row>
          <Col>
            <Form.Group>
              <Button className="cssCircle plusSign" onClick={(e) => this.setState({numberOfParties: numberOfParties + 1})}>
                <span>+</span>
              </Button>
              <Button className="cssCircle minusSign"
                      onClick={(e) => this.setState({numberOfParties: numberOfParties - 1 > 0 ? numberOfParties - 1 : 0})}>
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
                {({getRootProps, getInputProps}) => (<section id="dropzone">
                  <div {...getRootProps()} className={styles.dropzone}>
                    <input {...getInputProps()} />
                    <p style={{padding: "1rem"}}>{primaryDocument || (fileInput && `Uploading ${fileInput.path}...`) || <UploadSVG/>}</p>
                  </div>
                </section>)}
              </Dropzone>
              <p className={styles.dropzoneInfo}>
                <InfoSVG/>
                You can add multiple files using an archive file, such as zip or rar.
              </p>
            </Form.Group>
          </Col>
        </Row>
        <Row>
          <Col>
            <Button type="button" className={styles.submit} onClick={this.onNextButtonClick} disabled={uploading}>
              Next
            </Button>
          </Col>
        </Row>
      </Form>
    </section>);
  }
}

export default CreateForm;
