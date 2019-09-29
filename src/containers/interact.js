import React from 'react'
import Container from 'react-bootstrap/Container'
import Button from 'react-bootstrap/Button'
import Form from 'react-bootstrap/Form'
import Col from 'react-bootstrap/Col'
import Row from 'react-bootstrap/Row'

import Card from 'react-bootstrap/Card'
import Modal from 'react-bootstrap/Modal'
import ReactMarkdown from 'react-markdown'

class Interact extends React.Component {
  constructor(props, { match }) {
    super(props)
    this.state = {
      disputeID: (this.props.route && this.props.route.match.params.id) || '',
      period: '0',
      fileInput: '',
      evidenceFileURI: '',
      metaevidence: ''
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
    await this.setState({ disputeID: e.target.value })
    let arbitrableContract
    let dispute
    try {
      dispute = await this.props.getDisputeCallback(this.state.disputeID)
      arbitrableContract = this.props.getContractInstanceCallback(
        'IEvidence',
        dispute.arbitrated
      )
      console.log(arbitrableContract)
      this.setState({ period: dispute.period })
    } catch (e) {
      this.setState({ period: 5 })
    }

    await this.setState({
      metaevidence: await this.props.getMetaEvidenceCallback(
        dispute.arbitrated,
        this.state.disputeID
      )
    })
  }

  getHumanReadablePeriod = period => this.PERIODS[period]

  render() {
    const { disputeID, period, fileInput, evidenceFileURI } = this.state
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
                          this.getHumanReadablePeriod(period) +
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
        <Card>
          <Card.Body>asd alt</Card.Body>
        </Card>
      </Container>
    )
  }
}

export default Interact
