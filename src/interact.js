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
    this.state = { disputeID: '', period: '0' }
  }

  PERIODS = ['evidence', 'commit', 'vote', 'appeal', 'execution']

  onControlChange = e => this.setState({ [e.target.id]: e.target.value })

  onDisputeIDChange = async e => {
    this.setState({ disputeID: e.target.value })
    const dispute = await this.props.getDisputeCallback(this.state.disputeID)

    this.setState({ period: dispute.period })
  }

  getHumanReadablePeriod = period => this.PERIODS[period]

  render() {
    const { disputeID, period } = this.state

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
                    <Form.Group>
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
      </Container>
    )
  }
}

export default Interact
