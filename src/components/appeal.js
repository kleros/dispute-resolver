import { Accordion, Card, Col, Container, Form } from 'react-bootstrap'
import React from 'react'

class Appeal extends React.Component {
  constructor(properties) {
    super(properties)
    this.state = {}
  }

  render() {
    return (
      <Container fluid="true">
        <Card disabled>
          <Card.Header>
            <img alt="appeal" src="appeal.svg" />
            Appeal
          </Card.Header>
          <Card.Body />
        </Card>
      </Container>
    )
  }
}

export default Appeal
