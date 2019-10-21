import React from 'react'
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
} from 'react-bootstrap'
import Dropzone from 'react-dropzone'
import debounce from 'lodash.debounce'
import ReactMarkdown from 'react-markdown'

class Interact extends React.Component {
  constructor(properties, { match }) {
    super(properties)
    this.state = {
      disputeID:
        (this.props.route && this.props.route.match.params.id) || '471',
      dispute: {},
      fileInput: '',
      evidenceFileURI: '',
      metaevidence: '',
      evidences: [],
      subcourtDetails: {},
      modalShow: false,
      evidenceTitle: '',
      evidenceDescription: '',
      contributeModalShow: false
    }

    this.debouncedRetrieve = debounce(this.retrieveDisputeDetails, 500, {
      leading: false,
      trailing: true
    })

    console.log(properties)
  }

  async componentDidMount() {
    await this.debouncedRetrieve(471)
  }

  async componentDidUpdate(previousProperties) {
    console.log('component update')
    if (this.props.disputeID !== previousProperties.disputeID)
      await this.setState({ disputeID: this.props.disputeID })
  }

  PERIODS = [
    'evidence',
    'commit',
    'vote',
    'appeal',
    'execution',
    'ERROR: Dispute id out of bounds.'
  ]

  onDrop = async acceptedFiles => {
    console.log(acceptedFiles)
    this.setState({ fileInput: acceptedFiles[0] })

    var reader = new FileReader()
    reader.readAsArrayBuffer(acceptedFiles[0])
    reader.addEventListener('loadend', async () => {
      const buffer = Buffer.from(reader.result)

      const result = await this.props.publishCallback(
        acceptedFiles[0].name,
        buffer
      )

      console.log(result)

      await this.setState({
        primaryDocument: `/ipfs/${result[1].hash}${result[0].path}`
      })
    })
  }

  onModalShow = e => this.setState({ modalShow: true })
  onContributeModalShow = e => this.setState({ contributeModalShow: true })

  onControlChange = e => this.setState({ [e.target.id]: e.target.value })
  onInput = e => {
    this.setState({ evidenceFileURI: '' })
    this.setState({ fileInput: e.target.files[0] })
  }

  onContributeButtonClick = e => this.setState({ contributeModalShow: true })

  onSubmitButtonClick = async e => {
    console.log('EVIDENCE SUBMISSION')
    e.preventDefault()
    const {
      disputeID,
      fileInput,
      evidenceTitle,
      evidenceDescription
    } = this.state

    var reader = new FileReader()
    reader.readAsArrayBuffer(fileInput)
    reader.addEventListener('loadend', async () => {
      const buffer = Buffer.from(reader.result)

      const result = await this.props.publishCallback(fileInput.name, buffer)

      console.log(result)

      await this.setState({ evidenceFileURI: `/ipfs/${result[0].hash}` })

      console.log(`fileURI ${this.state.evidenceFileURI}`)
      const { evidenceFileURI } = this.state
      const receipt = await this.props.submitEvidenceCallback({
        disputeID,
        evidenceTitle,
        evidenceDescription,
        evidenceFileURI
      })
      console.log(receipt)
    })
  }

  onAppealButtonClick = async e => {
    await this.props.appealCallback(this.state.disputeID)
  }

  onDisputeIDChange = async e => {
    const disputeID = e.target.value
    await this.setState({ disputeID })
    await this.debouncedRetrieve(disputeID)
  }

  retrieveDisputeDetails = async disputeID => {
    console.log(`Calculating ${disputeID}`)
    let dispute
    let subcourtURI
    let subcourt
    try {
      dispute = await this.props.getDisputeCallback(disputeID)

      subcourtURI = await this.props.getSubCourtDetailsCallback(
        dispute.subcourtID
      )
      console.log(subcourtURI)
      if (subcourtURI.includes('http')) subcourt = await fetch(subcourtURI)
      else subcourt = await fetch(`https://ipfs.kleros.io${subcourtURI}`)

      console.log(
        await this.props.getEvidencesCallback(dispute.arbitrated, disputeID)
      )

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
      })
    } catch (error) {
      console.error(error.message)
      this.setState({ dispute: { period: 5 } })
    }
  }

  getHumanReadablePeriod = period => this.PERIODS[period]

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
    } = this.state
    const metaevidencePayload = metaevidence.metaEvidenceJSON

    console.log(this.props)
    console.log(this.state)

    return (
      <Container fluid="true">
        <Card>
          <Card.Header>
            <img alt="gavel" src="../gavel.svg" />
            Interact with a Dispute
          </Card.Header>
          <Card.Body>
            <Card.Title>Interact with a Dispute</Card.Title>{' '}
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
                  <Col>
                    <Form.Group>
                      <Form.Control
                        placeholder={`Currently in ${this.getHumanReadablePeriod(
                          dispute.period
                        )} period`}
                        readOnly
                        type="text"
                      />
                    </Form.Group>
                  </Col>
                )}
                {disputeID && (
                  <Col>
                    <Form.Group className="mt-1">
                      Check out this{' '}
                      <a href={`https://court.kleros.io/cases/${disputeID}`}>
                        dispute on Kleros
                      </a>
                    </Form.Group>
                  </Col>
                )}{' '}
              </Form.Row>
            </Form>
          </Card.Body>
        </Card>
        {metaevidence && (
          <Card>
            <h2 className="text-left mt-5" style={{ marginLeft: '80px' }}>
              {metaevidencePayload.title}
            </h2>
            <Breadcrumb>
              <Breadcrumb.Item href="#">
                {subcourtDetails && subcourtDetails.name}
              </Breadcrumb.Item>
            </Breadcrumb>
            <Card>
              <Card.Body>
                <Card.Title>{metaevidencePayload.title}</Card.Title>
                <Form>
                  <hr />

                  <Form.Row>
                    <Col>
                      <ReactMarkdown source={metaevidencePayload.description} />
                    </Col>
                  </Form.Row>
                  <Form.Row>
                    <Col>
                      <a
                        href={
                          metaevidencePayload.fileURI &&
                          `https://ipfs.kleros.io${metaevidencePayload.fileURI}`
                        }
                        target="blank"
                      >
                        <img alt="primary document" src="attachment.svg" />{' '}
                        {this.props.filePath}
                      </a>
                    </Col>
                  </Form.Row>
                </Form>
              </Card.Body>
            </Card>
            <Form>
              <Form.Row>
                <Col>
                  <Accordion defaultActiveKey="0">
                    <Card>
                      <Accordion.Toggle
                        as={Card.Header}
                        eventKey="0"
                        variant="link"
                      >
                        <img alt="primary document" src="attachment.svg" />{' '}
                        Evidences
                      </Accordion.Toggle>
                      <Accordion.Collapse eventKey="0">
                        <Card.Body>
                          <Button onClick={this.onModalShow}>
                            Submit Evidence
                          </Button>
                          {evidences.map((evidence, index) => (
                            <Card key={index}>
                              <Card.Body>
                                <Card.Title>
                                  {evidence.evidenceJSON.name}
                                </Card.Title>
                                {evidence.evidenceJSON.description}
                              </Card.Body>
                              <Card.Footer>
                                <a
                                  href={`https://ipfs.kleros.io${evidence.evidenceJSON.fileURI}`}
                                  target="blank"
                                >
                                  <img
                                    alt="primary document"
                                    src="attachment.svg"
                                  />{' '}
                                </a>
                              </Card.Footer>
                            </Card>
                          ))}
                        </Card.Body>
                      </Accordion.Collapse>
                    </Card>
                  </Accordion>
                </Col>
              </Form.Row>
            </Form>
            <Card className="mb-5">
              <Card.Body>
                <Form>
                  <Form.Row>
                    <Col>
                      <Form.Group controlId="question">
                        <Form.Label>Question</Form.Label>
                        <Form.Control
                          readOnly
                          type="text"
                          value={metaevidencePayload.question}
                        />
                      </Form.Group>
                    </Col>
                  </Form.Row>
                  <Form.Row>
                    <Col>
                      <Form.Group>
                        <Form.Label>First Ruling Option</Form.Label>
                        <Form.Control
                          readOnly
                          type="text"
                          value={metaevidencePayload.rulingOptions.titles[0]}
                        />
                      </Form.Group>
                    </Col>
                    <Col>
                      <Form.Group>
                        <Form.Label>First Ruling Description</Form.Label>
                        <Form.Control
                          readOnly
                          type="text"
                          value={
                            metaevidencePayload.rulingOptions.descriptions[0]
                          }
                        />
                      </Form.Group>
                    </Col>{' '}
                  </Form.Row>
                  <Form.Row>
                    <Col>
                      <Form.Group>
                        <Form.Label>Second Ruling Option</Form.Label>
                        <Form.Control
                          readOnly
                          type="text"
                          value={metaevidencePayload.rulingOptions.titles[1]}
                        />
                      </Form.Group>
                    </Col>
                    <Col>
                      <Form.Group>
                        <Form.Label>Second Ruling Description</Form.Label>

                        <Form.Control
                          readOnly
                          type="text"
                          value={
                            metaevidencePayload.rulingOptions.descriptions[1]
                          }
                        />
                      </Form.Group>
                    </Col>{' '}
                  </Form.Row>
                </Form>
              </Card.Body>
            </Card>
            <Card className="mb-5 mt-0">
              <Card.Body>
                <h2>Crowdfunding appeal fees</h2>
                <p>
                  The appeal fees are in crowdfunding. The case will be sent to
                  the jurors when the crowdfunding gets completed successfully.{' '}
                </p>
                <Row>
                  <Card as={Col}>
                    <Card.Body>
                      <ProgressBar label={`${60}%`} now={60} />
                    </Card.Body>
                  </Card>
                  <Card as={Col}>
                    <Card.Body>
                      <ProgressBar label={`${60}%`} now={60} />
                    </Card.Body>
                  </Card>
                  <Card as={Col}>
                    <Card.Body></Card.Body>
                  </Card>
                </Row>
                <Row>
                  <Button as={Col} onClick={this.onContributeButtonClick}>
                    Contribute
                  </Button>
                </Row>
              </Card.Body>
            </Card>
            <Card.Footer className="p-0" id="dispute-detail-footer">
              <div className="text-center p-5">
                <h3>
                  {`${this.getHumanReadablePeriod(dispute.period)
                    .charAt(0)
                    .toUpperCase() +
                    this.getHumanReadablePeriod(dispute.period).slice(
                      1
                    )} Period`}
                </h3>
              </div>
              <div>2123123</div>
            </Card.Footer>
          </Card>
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
    )
  }
}

export default Interact
