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
  constructor(props) {
    super(props)
    this.state = {
      disputeID: this.props.disputeID,
      period: '0',
      fileInput: '',
      primaryFileURI: ''
    }
  }

  async componentDidUpdate(prevProps) {
    console.log('component update')
    if (this.props.disputeID !== prevProps.disputeID) {
      await this.setState({ disputeID: this.props.disputeID })
    }
  }

  PERIODS = ['evidence', 'commit', 'vote', 'appeal', 'execution']

  onControlChange = e => this.setState({ [e.target.id]: e.target.value })
  onInput = e => {
    this.setState({ primaryFileURI: '' })
    this.setState({ fileInput: e.target.files[0] })
  }
  onSubmitButtonClick = async e => {
    e.preventDefault()
    const { fileInput } = this.state

    var reader = new FileReader()
    reader.readAsArrayBuffer(fileInput)
    reader.addEventListener('loadend', async () => {
      const buffer = Buffer.from(reader.result)
      const result = await this.props.publishPrimaryDocumentCallback(
        fileInput.name,
        buffer
      )
      this.setState({ primaryFileURI: '/ipfs/' + result[0].hash })
    })
  }

  onAppealButtonClick = async e => {
    await this.props.appealCallback(this.state.disputeID)
  }

  onDisputeIDChange = async e => {
    this.setState({ disputeID: e.target.value })
    const dispute = await this.props.getDisputeCallback(this.state.disputeID)

    this.setState({ period: dispute.period })
  }

  getHumanReadablePeriod = period => this.PERIODS[period]

  render() {
    const { disputeID, period, fileInput, primaryFileURI } = this.state

    return (
      <Container>
        {' '}
        <Card>
          <Card.Body>
            <Card.Title>Interact with a Dispute</Card.Title>{' '}
            <Form>
              <Form.Row>
                <Col>
                  <Form.Group>
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
              <Form.Row>
                <Col>
                  <Button
                    disabled={parseInt(period) !== 3}
                    variant="primary"
                    type="button"
                    onClick={this.onAppealButtonClick}
                    block
                  >
                    Appeal
                  </Button>
                </Col>
              </Form.Row>
              <Form.Row>
                <Col>
                  <div className="input-group mt-3">
                    <div className="custom-file">
                      <input
                        type="file"
                        className="custom-file-input"
                        id="inputGroupFile04"
                        onInput={this.onInput}
                      />
                      <label
                        className={
                          `text-left custom-file-label  ` +
                          (primaryFileURI ? 'text-success' : 'text-muted')
                        }
                        htmlFor="inputGroupFile04"
                      >
                        {(fileInput && fileInput.name) || 'Evidence document'}
                      </label>
                    </div>
                    <div className="input-group-append">
                      <button
                        className="btn btn-primary"
                        type="button"
                        onClick={this.onSubmitButtonClick}
                      >
                        Submit
                      </button>
                    </div>
                  </div>
                </Col>
              </Form.Row>
            </Form>
          </Card.Body>
        </Card>
      </Container>
    )
  }
}

export default Interact
