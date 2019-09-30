import React from 'react'
import {
  Container,
  Button,
  Form,
  Col,
  Row,
  Breadcrumb,
  Card,
  Modal,
  Dropdown,
  Accordion
} from 'react-bootstrap'

import debounce from 'lodash.debounce'

import ReactMarkdown from 'react-markdown'

class Interact extends React.Component {
  constructor(props, { match }) {
    super(props)
    this.state = {
      disputeID: (this.props.route && this.props.route.match.params.id) || '',
      dispute: {},
      fileInput: '',
      evidenceFileURI: '',
      metaevidence: '',
      evidences: [],
      subcourtDetails: {},
      modalShow: false,
      evidenceTitle: '',
      evidenceDescription: ''
    }

    this.debouncedRetrieve = debounce(this.retrieveDisputeDetails, 500, {
      leading: false,
      trailing: true
    })

    console.log(props)
  }

  async componentDidUpdate(prevProps) {
    console.log('component update')
    if (this.props.disputeID !== prevProps.disputeID) {
      await this.setState({ disputeID: this.props.disputeID })
    }
  }

  PERIODS = [
    'evidence',
    'commit',
    'vote',
    'appeal',
    'execution',
    'ERROR: Dispute id out of bounds.'
  ]

  onModalShow = e => this.setState({ modalShow: true })

  onControlChange = e => this.setState({ [e.target.id]: e.target.value })
  onInput = e => {
    this.setState({ evidenceFileURI: '' })
    this.setState({ fileInput: e.target.files[0] })
  }
  onSubmitButtonClick = async e => {
    console.log('EVIDENCE SUBMISSION')
    e.preventDefault()
    const { disputeID, fileInput } = this.state

    var reader = new FileReader()
    reader.readAsArrayBuffer(fileInput)
    reader.addEventListener('loadend', async () => {
      const buffer = Buffer.from(reader.result)

      const result = await this.props.publishCallback(fileInput.name, buffer)

      console.log(result)

      await this.setState({ evidenceFileURI: '/ipfs/' + result[0].hash })

      console.log(`fileURI ${this.state.evidenceFileURI}`)
      const { evidenceFileURI } = this.state
      const receipt = await this.props.submitEvidenceCallback({
        disputeID,
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
      if (subcourtURI.includes('http')) {
        subcourt = await fetch(subcourtURI)
      } else {
        subcourt = await fetch('https://ipfs.kleros.io' + subcourtURI)
      }

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
    } catch (e) {
      console.error(e.message)
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
            <img src="../gavel.svg" alt="gavel" />
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
                      id="disputeID"
                      as="input"
                      type="number"
                      value={disputeID}
                      onChange={this.onDisputeIDChange}
                      placeholder={'Dispute identifier'}
                    />
                  </Form.Group>
                </Col>
                {disputeID && (
                  <Col>
                    <Form.Group>
                      <Form.Control
                        readOnly
                        type="text"
                        placeholder={
                          'Currently in ' +
                          this.getHumanReadablePeriod(dispute.period) +
                          ' period'
                        }
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
          <>
            <Card>
              <Card.Body>
                <Card.Title>{metaevidencePayload.title}</Card.Title>
                <Form>
                  <Form.Row>
                    <Col>
                      <Form.Group>
                        <Breadcrumb>
                          <Breadcrumb.Item href="#">
                            {subcourtDetails && subcourtDetails.name}
                          </Breadcrumb.Item>
                        </Breadcrumb>
                      </Form.Group>
                    </Col>
                  </Form.Row>
                  <hr />

                  <Form.Row>
                    <Col>
                      <ReactMarkdown source={metaevidencePayload.description} />
                    </Col>
                  </Form.Row>
                  <Form.Row>
                    <Col>
                      <a
                        target="blank"
                        href={
                          metaevidencePayload.fileURI &&
                          'https://ipfs.kleros.io' + metaevidencePayload.fileURI
                        }
                      >
                        <img src="attachment.svg" alt="primary document" />{' '}
                        {this.props.filePath}
                      </a>
                    </Col>
                  </Form.Row>
                </Form>
              </Card.Body>
            </Card>
            <Card>
              <Form>
                <Form.Row>
                  <Col>
                    <Form.Group>
                      <Accordion defaultActiveKey="0">
                        <Card>
                          <Accordion.Toggle
                            as={Card.Header}
                            variant="link"
                            eventKey="0"
                          >
                            <img src="attachment.svg" alt="primary document" />{' '}
                            Evidences
                          </Accordion.Toggle>
                          <Accordion.Collapse eventKey="0">
                            <Card.Body>
                              <Button onClick={this.onModalShow}>
                                Submit Evidence
                              </Button>
                              {evidences.map((evidence, index) => (
                                <Card id={index}>
                                  <Card.Body>
                                    <Card.Title>
                                      {evidence.evidenceJSON.name}
                                    </Card.Title>
                                    {evidence.evidenceJSON.description}
                                  </Card.Body>
                                  <Card.Footer>
                                    <a
                                      target="blank"
                                      href={
                                        'https://ipfs.kleros.io' +
                                        evidence.evidenceJSON.fileURI
                                      }
                                    >
                                      <img
                                        src="attachment.svg"
                                        alt="primary document"
                                      />{' '}
                                    </a>
                                  </Card.Footer>
                                </Card>
                              ))}
                            </Card.Body>
                          </Accordion.Collapse>
                        </Card>
                      </Accordion>
                    </Form.Group>
                  </Col>
                </Form.Row>
              </Form>
            </Card>
            <Card>
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
          </>
        )}
        <Modal
          show={this.state.modalShow}
          onHide={e => this.setState({ modalShow: false })}
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
                      type="text"
                      value={evidenceTitle}
                      onChange={this.onControlChange}
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
                      type="text"
                      value={evidenceDescription}
                      onChange={this.onControlChange}
                    />
                  </Form.Group>
                </Col>
              </Form.Row>
            </Form>
          </Modal.Body>
          <Modal.Footer>
            <Button onClick={this.onSubmitButtonClick}>Submit</Button>
          </Modal.Footer>
        </Modal>
      </Container>
    )
  }
}

export default Interact
