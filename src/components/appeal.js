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
import Countdown from "react-countdown-now";

class Appeal extends React.Component {
  constructor(properties) {
    super(properties);
    console.log(typeof this.props.appealCost);

    this.state = {
      modalShow: false,
      contribution: "",
      party: "1"
    };
  }

  async componentDidUpdate(previousProperties) {
    if (
      this.props.crowdfundingStatus !== previousProperties.crowdfundingStatus
    ) {
      console.log("componentDidUpdate");
      this.props.crowdfundingStatus.then(response =>
        this.setState({ crowdfundingStatus: response })
      );
    }
  }

  handleControlChange = async e => {
    const { id, value } = e.target;

    await this.setState({ [id]: value });

    if (id == "party")
      await this.setState({
        contribution: BigNumber(this.props.appealCost)
          .minus(BigNumber(this.state.crowdfundingStatus[0][this.state.party]))
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

  handleFundButtonClick = async e => {
    let appealCostInEth = BigNumber(this.props.appealCost)
      .minus(BigNumber(this.state.crowdfundingStatus[0][this.state.party]))
      .div(BigNumber(10).pow(BigNumber(18)))
      .toString();
    this.setState({
      contribution: appealCostInEth.toString(),
      modalShow: true
    });
  };

  componentDidMount() {
    this.props.appealPeriod.then(response =>
      this.setState({ appealPeriod: response })
    );

    this.props.currentRuling.then(response =>
      this.setState({ currentRuling: response })
    );

    this.props.crowdfundingStatus.then(response =>
      this.setState({ crowdfundingStatus: response })
    );
  }

  render() {
    const {
      modalShow,
      contribution,
      party,
      appealPeriod,
      currentRuling,
      crowdfundingStatus
    } = this.state;

    const { appealCost } = this.props;

    console.log(this.state);
    console.log(this.props);

    console.log(new Date().getTime());
    console.log(
      appealPeriod &&
        BigNumber(appealPeriod.end)
          .div(BigNumber(2))
          .plus(BigNumber(appealPeriod.start).div(BigNumber(2)))
          .times(BigNumber(1000))
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
                          {(currentRuling == "0" && "Tied") ||
                            (currentRuling == "1" && "Winner") ||
                            (currentRuling == "2" && "Loser")}
                        </div>
                        <div>
                          <ProgressBar
                            now={
                              crowdfundingStatus &&
                              BigNumber(100)
                                .times(BigNumber(crowdfundingStatus[0][1]))
                                .div(BigNumber(this.props.appealCost))
                                .toString()
                            }
                            label={
                              crowdfundingStatus &&
                              "%" +
                                BigNumber(100)
                                  .times(BigNumber(crowdfundingStatus[0][1]))
                                  .div(BigNumber(this.props.appealCost))
                                  .toFixed(2)
                            }
                          />
                        </div>
                        <div>
                          {crowdfundingStatus &&
                            "%" +
                              BigNumber(100)
                                .times(
                                  BigNumber(
                                    crowdfundingStatus[0][1] / appealCost
                                  )
                                )
                                .toFixed(2) +
                              " contribution"}
                        </div>
                        <div>
                          <img alt="" src="clock_red.svg" />{" "}
                          {appealPeriod && (
                            <Countdown
                              date={
                                (currentRuling == "1" &&
                                  BigNumber(appealPeriod.end)
                                    .times(BigNumber(1000))
                                    .toNumber()) ||
                                BigNumber(appealPeriod.end)
                                  .div(BigNumber(2))
                                  .plus(
                                    BigNumber(appealPeriod.start).div(
                                      BigNumber(2)
                                    )
                                  )
                                  .times(BigNumber(1000))
                                  .toNumber()
                              }
                            />
                          )}
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
                          {(currentRuling == "0" && "Tied") ||
                            (currentRuling == "1" && "Loser") ||
                            (currentRuling == "2" && "Winner")}
                        </div>
                        <div>
                          <ProgressBar
                            now={
                              crowdfundingStatus &&
                              BigNumber(100)
                                .times(BigNumber(crowdfundingStatus[0][2]))
                                .div(BigNumber(this.props.appealCost))
                                .toFixed(2)
                            }
                            label={
                              crowdfundingStatus &&
                              "%" +
                                BigNumber(100)
                                  .times(BigNumber(crowdfundingStatus[0][2]))
                                  .div(BigNumber(this.props.appealCost))
                                  .toFixed(2)
                            }
                          />
                        </div>
                        <div>
                          {crowdfundingStatus &&
                            "%" +
                              BigNumber(100)
                                .times(
                                  BigNumber(
                                    crowdfundingStatus[0][2] / appealCost
                                  )
                                )
                                .toFixed(2) +
                              " contribution"}
                        </div>
                        <div>
                          <img alt="" src="clock_red.svg" />{" "}
                          {appealPeriod && (
                            <Countdown
                              date={
                                (currentRuling == "2" &&
                                  BigNumber(appealPeriod.end)
                                    .times(BigNumber(1000))
                                    .toNumber()) ||
                                BigNumber(appealPeriod.end)
                                  .div(BigNumber(2))
                                  .plus(
                                    BigNumber(appealPeriod.start).div(
                                      BigNumber(2)
                                    )
                                  )
                                  .times(BigNumber(1000))
                                  .toNumber()
                              }
                            />
                          )}
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
                    onClick={this.handleFundButtonClick}
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
            <Form id="fund-modal-form">
              <Form.Group>
                <Form.Row>
                  <Col>
                    <h4>Which side do you want to fund?</h4>
                  </Col>
                </Form.Row>
                <hr />
                <Form.Row>
                  <Col>
                    <InputGroup
                      style={{
                        justifyContent: "space-between",
                        borderStyle: "unset"
                      }}
                    >
                      <InputGroup.Prepend>
                        <Form.Row>
                          <Col>
                            <h5 className="purple-2-inverted">
                              Previous Round{" "}
                              {(currentRuling == "0" && "Tied") ||
                                (currentRuling == "1" && "Winner") ||
                                (currentRuling == "2" && "Loser")}
                            </h5>
                            <p className="purple-2-inverted">Requester</p>
                          </Col>
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
                    <InputGroup style={{ justifyContent: "space-between" }}>
                      <InputGroup.Prepend>
                        <Form.Row>
                          <Col>
                            <h5 className="purple-2-inverted">
                              Previous Round{" "}
                              {(currentRuling == "0" && "Tied") ||
                                (currentRuling == "1" && "Loser") ||
                                (currentRuling == "2" && "Winner")}
                            </h5>
                            <p className="purple-2-inverted">Respondent</p>
                          </Col>
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
                <hr />
                <Form.Row>
                  <Col>
                    <h4>Contribution Amount (ETH)</h4>
                  </Col>
                </Form.Row>
                <Form.Row className="mb-3">
                  <Col>
                    <Form.Control
                      id="contribution"
                      type="number"
                      max={
                        crowdfundingStatus &&
                        BigNumber(this.props.appealCost)
                          .minus(BigNumber(crowdfundingStatus[0][party]))
                          .div(BigNumber(10).pow(BigNumber(18)))
                          .toString()
                      }
                      min="0"
                      step="0.001"
                      value={contribution}
                      onChange={this.handleControlChange}
                      placeholder="Please enter an amount in ether."
                    />
                  </Col>
                </Form.Row>
                <Form.Row>
                  <Col>
                    <Button
                      variant="light"
                      className="float-left"
                      onClick={e => this.setState({ modalShow: false })}
                    >
                      Return
                    </Button>
                  </Col>
                  <Col>
                    <Button
                      variant="primary"
                      className="float-right"
                      onClick={this.handleContributeButtonClick}
                    >
                      Contribute
                    </Button>
                  </Col>
                </Form.Row>
              </Form.Group>
            </Form>
          </Modal.Body>
        </Modal>
      </Container>
    );
  }
}

export default Appeal;
