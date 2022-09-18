import React from "react";
import { Container, Col, Row, Button, Form, Dropdown, InputGroup } from "react-bootstrap";
import { ReactComponent as AttachmentSVG } from "../assets/images/attachment.svg";
import { ReactComponent as GavelSVG } from "../assets/images/gavel.svg";
import { ReactComponent as ScalesSVG } from "../assets/images/scales.svg";
import { ReactComponent as EthereumSVG } from "../assets/images/ethereum.svg";
import { ReactComponent as UploadSVG } from "../assets/images/upload.svg";
import { ReactComponent as InfoSVG } from "../assets/images/info.svg";
import { ReactComponent as AvatarSVG } from "../assets/images/avatar.svg";
import networkMap from "../ethereum/network-contract-mapping";

import Dropzone from "react-dropzone";

import styles from "components/styles/createSummary.module.css";

class CreateSummary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      modalShow: false,
      awaitingConfirmation: false,
      lastDisputeID: "",
    };
  }

  onCreateButtonClick = async (e) => {
    const { formData, notificationEventCallback } = this.props;
    this.setState({ awaitingConfirmation: true });

    const noOfOptions = formData.questionType.code == "multiple-select" ? Math.pow(2, formData.rulingTitles.length) : formData.rulingTitles.length;

    let aliases = {};
    formData.names.map((name, index) => {
      aliases[formData.addresses[index]] = name;
    });

    try {
      const receipt = await this.props.createDisputeCallback({
        selectedSubcourt: formData.selectedSubcourt,
        initialNumberOfJurors: formData.initialNumberOfJurors,
        title: formData.title,
        category: formData.category,
        description: formData.description,
        aliases,
        question: formData.question,
        primaryDocument: formData.primaryDocument,
        numberOfRulingOptions: noOfOptions,
        rulingOptions: {
          type: formData.questionType.code,
          titles: formData.rulingTitles,
          descriptions: formData.rulingDescriptions,
        },
      });
      notificationEventCallback(receipt.events.Dispute.returnValues._disputeID);
      this.setState({
        lastDisputeID: receipt.events.Dispute.returnValues._disputeID,
      });
    } catch (e) {
      console.error(e);
      this.setState({ awaitingConfirmation: false });
    }
  };

  componentDidMount = () => {};

  render() {
    const { awaitingConfirmation, show, activeAddress, subcourtsLoading, onReturnButtonClickCallback, validated, arbitrationCost, summary, formData, network } = this.props;

    return (
      <section className={styles.summary}>
        <Form noValidate validated={validated} onSubmit={this.onModalShow}>
          <Row>
            <Col>
              <p className={styles.fillUpTheForm}>Summary</p>
              <h1 className={styles.h1}>{formData.title}</h1>
            </Col>
          </Row>
          <hr />
          {formData.description && (
            <Row className={styles.description}>
              <Col>{formData.description}</Col>
            </Row>
          )}
          <Row>
            <Col xl={6} md={12} sm={24} xs={24}>
              <Form.Group>
                <Form.Label htmlFor="court">Court</Form.Label>
                <Form.Control required id="court" as="span">
                  {formData.subcourtDetails[formData.selectedSubcourt].name}
                </Form.Control>
              </Form.Group>
            </Col>
            <Col xl={6} md={12} sm={24} xs={24}>
              <Form.Group className="">
                <Form.Label htmlFor="initialNumberOfJurors">Number of Votes</Form.Label>
                <Form.Control className={styles.spanWithSvgInside} id="initialNumberOfJurors" as="span">
                  <AvatarSVG />
                  <span>{formData.initialNumberOfJurors}</span>
                </Form.Control>
              </Form.Group>
            </Col>
            <Col xl={6} md={12} sm={24} xs={24}>
              <Form.Group>
                <Form.Label htmlFor="category">Category (Optional)</Form.Label>
                <Form.Control id="category" as="span" title={formData.category}>
                  {formData.category}
                </Form.Control>
              </Form.Group>
            </Col>
            <Col xl={6} md={12} sm={24} xs={24}>
              <Form.Group className={styles.arbitrationFeeGroup}>
                <Form.Label htmlFor="arbitrationFee">Arbitration Cost</Form.Label>
                <Form.Control className={styles.spanWithSvgInside} as="span">
                  <EthereumSVG />
                  <span className={styles.arbitrationFee}>{formData.arbitrationCost + " " + networkMap[network].CURRENCY_SHORT}</span>
                </Form.Control>
              </Form.Group>
            </Col>
          </Row>
          <Row>
            {formData.names.map((value, index) => (
              <>
                <Col xl={4} lg={4} md={8}>
                  <Form.Group>
                    <Form.Label htmlFor="requester">Party {index + 1}</Form.Label>

                    <Form.Control id={`name${index}`} as="span" title={formData.names[index]}>
                      {formData.names[index]}
                    </Form.Control>
                  </Form.Group>
                </Col>
                <Col xl={8} lg={8} md={16}>
                  <Form.Group>
                    <Form.Label htmlFor={`address${index}`}>Party {index + 1} Address (Optional)</Form.Label>

                    <Form.Control pattern="0x[abcdefABCDEF0123456789]{40}" id="requesterAddress" as="span" title={formData.addresses[index]}>
                      {formData.addresses[index]}
                    </Form.Control>
                  </Form.Group>
                </Col>
              </>
            ))}
          </Row>
          <hr />
          <Row>
            <Col>
              <Form.Group>
                <Form.Label htmlFor="question">{formData.questionType.humanReadable}</Form.Label>
                <Form.Control required id="question" as="span">
                  {formData.question}
                </Form.Control>
              </Form.Group>
            </Col>
          </Row>
          {formData.rulingTitles.map((value, index) => (
            <Row>
              <Col xs={24} lg={8}>
                <Form.Group>
                  <Form.Label htmlFor={`rulingOption${index}Title`}>Ruling Option {index + 1}</Form.Label>
                  <Form.Control required id={`rulingOption${index}Title`} as="span" title={formData.rulingTitles[index]}>
                    {formData.rulingTitles[index]}
                  </Form.Control>
                </Form.Group>
              </Col>
              {formData.rulingDescriptions[index] && (
                <Col xs={24} lg={16}>
                  <Form.Group>
                    <Form.Label htmlFor={`rulingOption${index}Description`}>Ruling Option {index + 1} Description (Optional)</Form.Label>
                    <Form.Control id={`rulingOption${index}Description`} as="span" title={formData.rulingDescriptions[index]}>
                      {formData.rulingDescriptions[index]}
                    </Form.Control>
                  </Form.Group>
                </Col>
              )}
            </Row>
          ))}
          <hr />

          <Row className={` text-center text-md-left ${styles.footer} `}>
            {formData.primaryDocument && (
              <Col md={12} xs={24} className={styles.attachment}>
                <a href={`https://ipfs.kleros.io${formData.primaryDocument}`} target="_blank" rel="noopener noreferrer" className={styles.primaryDocument}>
                  <AttachmentSVG />
                  {formData.primaryDocument.split("/").slice(-1)}
                </a>
              </Col>
            )}
            <Col>
              <Row className={`text-center text-md-right mt-3 mt-md-0 ${styles.buttons}`}>
                <Col>
                  <Button type="button" variant="secondary" className={`mb-3 mb-sm-0 ${styles.return}`} onClick={onReturnButtonClickCallback}>
                    Return
                  </Button>
                </Col>
                <Col md="auto" xs={24} sm={12}>
                  <Button type="button" variant="primary" className={`${styles.create}`} onClick={this.onCreateButtonClick} xs={{ block: true }}>
                    Create
                  </Button>
                </Col>
              </Row>
            </Col>
          </Row>
        </Form>
      </section>
    );
  }
}

export default CreateSummary;
