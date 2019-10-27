import {
  Button,
  Card,
  Col,
  Container,
  Form,
  ProgressBar,
  Modal,
  InputGroup,
  Row,
  FormControl
} from "react-bootstrap";
import React from "react";
import BigNumber from "bignumber.js";

class Appeal extends React.Component {
  constructor(properties) {
    super(properties);
    console.log(typeof this.props.appealCost);
    let appealCostInEth = BigNumber(this.props.appealCost)
      .minus(BigNumber(this.props.crowdfundingStatus[0][1]))
      .div(BigNumber(10).pow(BigNumber(18)))
      .toString();
    this.state = {
      modalShow: false,
      contribution: appealCostInEth.toString(),
      party: "1"
    };
  }

  handleControlChange = async e => {
    const { id, value } = e.target;

    await this.setState({ [id]: value });

    if (id == "party")
      await this.setState({
        contribution: BigNumber(this.props.appealCost)
          .minus(BigNumber(this.props.crowdfundingStatus[0][this.state.party]))
          .div(BigNumber(10).pow(BigNumber(18)))
          .toString()
      });
  };

  handleContributeButtonClick = async e => {
    console.log("contribute clicked");
    await this.props.appealCallback(
      this.state.party,
      BigNumber(this.state.contribution)
        .times(BigNumber(10).pow(BigNumber(18)))
        .toString()
    );
  };

  render() {
    const { modalShow, contribution, party } = this.state;
    console.log(this.state);
    console.log(
      BigNumber(this.props.appealCost)
        .minus(BigNumber(this.props.crowdfundingStatus[0][party]))
        .toString()
    );
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
                          <img alt="" src="clock_purple.svg" /> Requester
                        </div>
                        <div>
                          <ProgressBar
                            now={BigNumber(100)
                              .times(
                                BigNumber(this.props.crowdfundingStatus[0][1])
                              )
                              .div(BigNumber(this.props.appealCost))
                              .toString()}
                          />
                        </div>
                        <div>
                          <img alt="" src="clock_purple.svg" /> Deadline
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
                          <img alt="" src="clock_purple.svg" /> Respondent
                        </div>
                        <div>
                          <ProgressBar
                            now={BigNumber(100)
                              .times(
                                BigNumber(this.props.crowdfundingStatus[0][2])
                              )
                              .div(BigNumber(this.props.appealCost))
                              .toString()}
                          />
                        </div>
                        <div>
                          <img alt="" src="clock_purple.svg" /> Deadline
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
                          <img alt="" src="warning.svg" />
                        </p>
                        <p>
                          If the loser complete it's appeal funding the winner
                          of the previous round should also fully fund the
                          appeal, in order not to lose the case.
                        </p>
                      </Card.Body>
                    </Card>
                  </Form.Group>
                </Col>
              </Form.Row>
              <Form.Row>
                <Col>
                  <Button
                    className="float-right"
                    onClick={e => this.setState({ modalShow: true })}
                  >
                    Fund
                  </Button>
                </Col>
              </Form.Row>
            </Form>
          </Card.Body>
        </Card>
        <Modal
          show={modalShow}
          onHide={e => this.setState({ modalShow: false })}
        >
          <Modal.Header>
            <Modal.Title>
              <Row>
                <Col>Fund Appeal</Col>
              </Row>
            </Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Form>
              <Form.Row>
                <Col>
                  <h4>Which side do you want to fund?</h4>
                </Col>
              </Form.Row>
              <hr />
              <Form.Row>
                <Col>
                  <InputGroup>
                    <InputGroup.Prepend>
                      <Form.Row>
                        <Col>Requester</Col>
                        <Col>Deadline</Col>
                      </Form.Row>
                    </InputGroup.Prepend>
                    <InputGroup.Radio
                      name="party"
                      id="party"
                      value="1"
                      checked={this.state.party == "1"}
                      onChange={this.handleControlChange}
                    />
                  </InputGroup>
                </Col>
              </Form.Row>
              <hr />
              <Form.Row>
                <Col>
                  <InputGroup>
                    <InputGroup.Prepend>
                      <Form.Row>
                        <Col>Respondent</Col>
                        <Col>Deadline</Col>
                      </Form.Row>
                    </InputGroup.Prepend>
                    <InputGroup.Radio
                      name="party"
                      id="party"
                      value="2"
                      checked={this.state.party == "2"}
                      onChange={this.handleControlChange}
                    />
                  </InputGroup>
                </Col>
              </Form.Row>
              <Form.Row>
                <Col>
                  <h4>Contribution Amount</h4>
                </Col>
              </Form.Row>
              <Form.Row>
                <Col>
                  <Form.Control
                    id="contribution"
                    type="number"
                    max={BigNumber(this.props.appealCost)
                      .minus(BigNumber(this.props.crowdfundingStatus[0][party]))
                      .div(BigNumber(10).pow(BigNumber(18)))
                      .toString()}
                    min="0"
                    step="0.001"
                    value={contribution}
                    onChange={this.handleControlChange}
                    placeholder="Please select a court and specify number of jurors."
                  />
                </Col>
              </Form.Row>
              <Form.Row>
                <Button onClick={e => this.setState({ modalShow: false })}>
                  Return
                </Button>
                <Button onClick={this.handleContributeButtonClick}>
                  Contribute
                </Button>
              </Form.Row>
            </Form>
          </Modal.Body>
        </Modal>
      </Container>
    );
  }
}

export default Appeal;
