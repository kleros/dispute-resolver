import {
  Accordion,
  Card,
  Col,
  Container,
  Form,
  ProgressBar
} from "react-bootstrap";
import React from "react";

class Appeal extends React.Component {
  constructor(properties) {
    super(properties);
    this.state = {};
  }

  render() {
    return (
      <Container fluid="true">
        <Card disabled>
          <Card.Header>
            <img alt="appeal" src="appeal.svg" />
            Appeal
          </Card.Header>
          <Card.Body>
            <Form>
              <Form.Row>
                <Col>
                  <Form.Group>
                    <h3 className="float-left">Crowdfunding Appeal</h3>
                    <br />
                    <br />
                    <p>
                      The appeal fees are in crowdfunding. The case will be sent
                      to the jurors when the crowdfunding is completed.
                    </p>
                    <p>
                      Anyone can contribute to appeal crowdfunding and win
                      rewards. Note that help funding the dispute can make you
                      win rewards, if the side you contributed won.
                    </p>
                  </Form.Group>
                </Col>
              </Form.Row>
              <Form.Row>
                <Col>
                  <Form.Group>
                    <Card>
                      <Card.Body>
                        <div>
                          <img src="clock_purple.svg" /> Requester
                        </div>
                        <div>
                          <ProgressBar
                            now={this.props.crowdfundingStatus[0][1]}
                          />
                        </div>
                        <div>
                          <img src="clock_purple.svg" /> Deadline
                        </div>
                      </Card.Body>
                    </Card>
                  </Form.Group>
                </Col>
                <Col>
                  <Form.Group>
                    <Card>
                      <Card.Body>
                        <div>
                          <img src="clock_purple.svg" /> Respondent
                        </div>
                        <div>
                          <ProgressBar now={50} />
                        </div>
                        <div>
                          <img src="clock_purple.svg" /> Deadline
                        </div>
                      </Card.Body>
                    </Card>
                  </Form.Group>
                </Col>

                <Col>
                  <Form.Group>
                    <Card>
                      <Card.Body className="text-center">
                        <p>
                          <img src="warning.svg" />
                        </p>
                        <p>
                          If the loser compltere it's appeal funding the winner
                          of the previous round should also fully fund the
                          appeal, in order not to lose the case.
                        </p>
                      </Card.Body>
                    </Card>
                  </Form.Group>
                </Col>
              </Form.Row>
            </Form>
          </Card.Body>
        </Card>
      </Container>
    );
  }
}

export default Appeal;
