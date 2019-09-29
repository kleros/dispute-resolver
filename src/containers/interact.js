import React from 'react'
import {
  Container,
  Button,
  Form,
  Col,
  Row,
  Breadcrumb,
  Card,
  Modal
} from 'react-bootstrap'

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
      subcourtDetails: {}
    }

    console.log(match)
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

      await this.setState({
        dispute,
        subcourtDetails: await subcourt.json(),
        metaevidence: await this.props.getMetaEvidenceCallback(
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
      subcourtDetails
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
                            {subcourtDetails.name}
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
      </Container>
    )
  }
}

export default Interact
