import { Button, Card, Col, Container, Form, ProgressBar, Modal, InputGroup, Row, Spinner, Accordion } from "react-bootstrap";

import React from "react";
import BigNumber from "bignumber.js";
import Countdown from "react-countdown";
import { ReactComponent as AppealSVG } from "assets/images/appeal.svg";
import { ReactComponent as ClockRed } from "assets/images/clock_red.svg";
import { ReactComponent as ClockPurple } from "assets/images/clock_purple.svg";

class Appeal extends React.Component {
  constructor(properties) {
    super(properties);
    console.log(this.props);

    this.state = {
      modalShow: false,
      contribution: "",
      party: "0",
      awaitingConfirmation: false,
    };
  }

  async componentDidUpdate(previousProperties) {
    if (this.props.crowdfundingStatus !== previousProperties.crowdfundingStatus) {
      console.log("componentDidUpdate");

      try {
        this.setState({ crowdfundingStatus: await this.props.crowdfundingStatus });
      } catch (e) {
        console.error(e);
      }
    }
  }

  handleControlChange = async (e) => {
    const { name, value } = e.target;

    await this.setState({ [name]: value });

    let winnerMultiplier = BigNumber(this.props.multipliers.winner);
    let loserMultiplier = BigNumber(this.props.multipliers.loser);
    let sharedMultiplier = BigNumber(this.props.multipliers.shared);
    let multiplierDivisor = BigNumber(this.props.multipliers.divisor);

    if (name == "party")
      await this.setState({
        contribution: this.calculateAmountRemainsToBeRaised(winnerMultiplier, loserMultiplier, sharedMultiplier, multiplierDivisor, this.props.crowdfundingStatus, this.state.party)
          .div(BigNumber(10).pow(BigNumber(18)))
          .toString(),
      });
  };

  handleContributeButtonClick = async (e) => {
    await this.setState({ awaitingConfirmation: true });
    try {
      await this.props.appealCallback(
        this.state.party,
        BigNumber(this.state.contribution)
          .times(BigNumber(10).pow(BigNumber(18)))
          .toString()
      );
      await this.props.reloadCallback();
      await this.setState({ modalShow: false });
    } catch (e) {
    } finally {
      await this.setState({ awaitingConfirmation: false });
      try {
        this.props.crowdfundingStatus.then((response) => this.setState({ crowdfundingStatus: response }));
      } catch (e) {
        console.error(e);
      }
    }
  };

  handleFundButtonClick = async (e) => {
    let winnerMultiplier = BigNumber(this.props.multipliers.winner);
    let loserMultiplier = BigNumber(this.props.multipliers.loser);
    let sharedMultiplier = BigNumber(this.props.multipliers.shared);
    let multiplierDivisor = BigNumber(this.props.multipliers.divisor);

    this.setState({
      contribution: this.calculateAmountRemainsToBeRaised(winnerMultiplier, loserMultiplier, sharedMultiplier, multiplierDivisor, this.props.crowdfundingStatus, this.state.party)
        .div(BigNumber(10).pow(BigNumber(18)))
        .toString(),
      modalShow: true,
    });
  };

  calculateReturnOfInvestmentRatio = (winnerMultiplier, loserMultiplier, sharedMultiplier, multiplierDivisor, party) => {
    const winner = BigNumber(winnerMultiplier);
    const loser = BigNumber(loserMultiplier);
    const shared = BigNumber(sharedMultiplier);
    const divisor = BigNumber(multiplierDivisor);
    if (this.props.currentRuling == party) {
      return winner.plus(loser).plus(divisor).div(winner.plus(divisor));
    } else if (this.props.currentRuling == 0) {
      return shared.plus(shared).plus(divisor).div(shared.plus(divisor));
    } else {
      return winner.plus(loser).plus(divisor).div(loser.plus(divisor));
    }
  };

  calculateAmountRemainsToBeRaised = (winnerMultiplier, loserMultiplier, sharedMultiplier, multiplierDivisor, crowdfundingStatus, party) => {
    const appealCost = BigNumber(this.props.appealCost);
    let stake;
    if (this.props.currentRuling == party) {
      stake = appealCost.times(BigNumber(winnerMultiplier)).div(BigNumber(multiplierDivisor));
    } else if (this.props.currentRuling == 0) {
      stake = appealCost.times(BigNumber(sharedMultiplier)).div(BigNumber(multiplierDivisor));
    } else {
      stake = appealCost.times(BigNumber(loserMultiplier)).div(BigNumber(multiplierDivisor));
    }

    const raisedSoFar = BigNumber(crowdfundingStatus[0][party]);

    return appealCost.plus(stake).minus(raisedSoFar);
  };

  calculateTotalAmountToBeRaised = (winnerMultiplier, loserMultiplier, sharedMultiplier, multiplierDivisor, party) => {
    const appealCost = BigNumber(this.props.appealCost);
    let stake;
    if (this.props.currentRuling == party) {
      stake = appealCost.times(BigNumber(winnerMultiplier)).div(BigNumber(multiplierDivisor));
    } else if (this.props.currentRuling == 0) {
      stake = appealCost.times(BigNumber(sharedMultiplier)).div(BigNumber(multiplierDivisor));
    } else {
      stake = appealCost.times(BigNumber(loserMultiplier)).div(BigNumber(multiplierDivisor));
    }

    return appealCost.plus(stake);
  };

  render() {
    const { modalShow, contribution, party } = this.state;

    const { multipliers, activeAddress, crowdfundingStatus, currentRuling, appealPeriod } = this.props;

    console.debug(this.state);
    console.debug(this.props);

    const loserFailedToRaise =
      crowdfundingStatus &&
      appealPeriod &&
      currentRuling != 0 &&
      !crowdfundingStatus.hasPaid[3 - currentRuling] &&
      BigNumber(Date.now()).gt(
        BigNumber(appealPeriod.end)
          .div(BigNumber(2))
          .plus(BigNumber(appealPeriod.start).div(BigNumber(2)))
          .times(BigNumber(1000))
          .toNumber()
      );

    return (
      <Container fluid="true">
        <Accordion defaultActiveKey="0">
          <Card disabled style={{ borderRadius: "12px" }}>
            <Accordion.Toggle as={Card.Header} eventKey="0">
              <AppealSVG style={{ marginRight: "1rem" }} />
              Appeal
            </Accordion.Toggle>
            <hr className="mt-0" />
            <Accordion.Collapse eventKey="0">
              <Card.Body>
                <Form>
                  <Form.Row>
                    <Col>
                      <Form.Group>
                        <h3 className="float-left">Crowdfunding Appeal</h3>
                        <br />
                        <br />
                        <p>The appeal fees are in crowdfunding. The case will be sent to the jurors when the crowdfunding is completed.</p>
                        <p>Anyone can contribute to appeal crowdfunding and win rewards. Note that help funding the dispute can make you win rewards, if the side you contributed won.</p>
                      </Form.Group>
                    </Col>
                  </Form.Row>
                  {crowdfundingStatus && (
                    <>
                      <Form.Row className="mb-3">
                        <Col style={{ display: "flex", flexDirection: "column" }}>
                          <Card className="mx-0 crowfunding-card h-100">
                            <Card.Body style={{ display: "flex", flexDirection: "column" }}>
                              <Form.Row>
                                <Col s={1} md={1} l={1} xl={1}>
                                  <div>
                                    <ClockPurple />
                                  </div>
                                </Col>
                                <Col>
                                  <Form.Row>
                                    <Col className="purple-inverted">
                                      {(this.props.metaevidence.metaEvidenceJSON.aliases && this.props.metaevidence.metaEvidenceJSON.aliases[0] && (
                                        <a
                                          href={`https://etherscan.io/address/${Object.keys(this.props.metaevidence.metaEvidenceJSON.aliases)[0]}
                                  `}
                                          target="_blank"
                                          rel="noreferrer noopener"
                                        >
                                          {Object.values(this.props.metaevidence.metaEvidenceJSON.aliases)[0]}
                                        </a>
                                      )) || <div>{Object.values(this.props.metaevidence.metaEvidenceJSON.rulingOptions.titles)[0]}</div>}
                                      <div className="font-weight-500">{(currentRuling == "0" && "Tied") || (currentRuling == "1" && "Winner") || (currentRuling == "2" && "Loser")}</div>
                                    </Col>
                                  </Form.Row>
                                </Col>
                              </Form.Row>
                              <Row>
                                <Col className="purple-inverted m-3" style={{ textAlign: "center" }}>
                                  Total Deposit Required:{" "}
                                  {this.calculateTotalAmountToBeRaised(multipliers.winner, multipliers.loser, multipliers.shared, multipliers.divisor, 1)
                                    .div(BigNumber(10).pow(BigNumber(18)))
                                    .toString()}{" "}
                                  ETH
                                </Col>
                              </Row>

                              <div className="mb-3">
                                <ProgressBar
                                  variant={crowdfundingStatus && crowdfundingStatus.hasPaid[1] ? "success" : ""}
                                  now={crowdfundingStatus && BigNumber(100).times(BigNumber(crowdfundingStatus.paidFees[1])).div(this.calculateTotalAmountToBeRaised(multipliers.winner, multipliers.loser, multipliers.shared, multipliers.divisor, 1)).toString()}
                                  label={crowdfundingStatus && "%" + BigNumber(100).times(BigNumber(crowdfundingStatus.paidFees[1])).div(this.calculateTotalAmountToBeRaised(multipliers.winner, multipliers.loser, multipliers.shared, multipliers.divisor, 1)).toFixed(2)}
                                />
                              </div>

                              <Card className="my-3 mx-0 p-3 purple-inverted text-center h-100" style={{ backgroundColor: "#F5F1FD" }}>
                                You will get <span style={{ fontWeight: "bold", display: "contents" }}>{this.calculateReturnOfInvestmentRatio(multipliers.winner, multipliers.loser, multipliers.shared, multipliers.divisor, 1).toFixed(2)}</span> times of your contribution back if
                                this side wins.
                                <h4 className="mt-2 purple-inverted text-center">
                                  {crowdfundingStatus &&
                                    crowdfundingStatus.contributions[1] != 0 &&
                                    "You contributed: " +
                                      BigNumber(crowdfundingStatus.contributions[1])
                                        .div(BigNumber(10).pow(BigNumber(18)))
                                        .toString() +
                                      " ETH"}
                                </h4>
                              </Card>

                              <Form.Row>
                                <Col s={1} md={1} l={1} xl={1}>
                                  <ClockRed />
                                </Col>
                                <Col>
                                  {appealPeriod && (
                                    <Countdown
                                      date={
                                        ((currentRuling == "1" || currentRuling == "0") && BigNumber(appealPeriod.end).times(BigNumber(1000)).toNumber()) ||
                                        BigNumber(appealPeriod.end)
                                          .div(BigNumber(2))
                                          .plus(BigNumber(appealPeriod.start).div(BigNumber(2)))
                                          .times(BigNumber(1000))
                                          .toNumber()
                                      }
                                    />
                                  )}
                                </Col>
                              </Form.Row>
                            </Card.Body>
                          </Card>
                        </Col>
                        <Col style={{ display: "flex", flexDirection: "column" }}>
                          <Card className="mx-0 crowfunding-card h-100">
                            <Card.Body style={{ display: "flex", flexDirection: "column" }}>
                              <Form.Row>
                                <Col s={1} md={1} l={1} xl={1}>
                                  <div>
                                    <ClockPurple />
                                  </div>
                                </Col>
                                <Col>
                                  <Form.Row>
                                    <Col className="purple-inverted">
                                      {(this.props.metaevidence.metaEvidenceJSON.aliases && this.props.metaevidence.metaEvidenceJSON.aliases[1] && (
                                        <a
                                          href={`https://etherscan.io/address/${Object.keys(this.props.metaevidence.metaEvidenceJSON.aliases)[1]}
                                `}
                                          target="_blank"
                                          rel="noreferrer noopener"
                                        >
                                          {Object.values(this.props.metaevidence.metaEvidenceJSON.aliases)[1]}
                                        </a>
                                      )) || <div>{Object.values(this.props.metaevidence.metaEvidenceJSON.rulingOptions.titles)[1]}</div>}
                                      <div className="font-weight-500">{(currentRuling == "0" && "Tied") || (currentRuling == "1" && "Loser") || (currentRuling == "2" && "Winner")}</div>
                                    </Col>
                                  </Form.Row>
                                </Col>
                              </Form.Row>
                              <Row>
                                <Col className="purple-inverted m-3" style={{ textAlign: "center" }}>
                                  Total Deposit Required:{" "}
                                  {this.calculateTotalAmountToBeRaised(multipliers.winner, multipliers.loser, multipliers.shared, multipliers.divisor, 2)
                                    .div(BigNumber(10).pow(BigNumber(18)))
                                    .toString()}{" "}
                                  ETH
                                </Col>
                              </Row>
                              <div className="mb-3">
                                <ProgressBar
                                  variant={crowdfundingStatus && crowdfundingStatus.hasPaid[2] ? "success" : ""}
                                  now={crowdfundingStatus && BigNumber(100).times(BigNumber(crowdfundingStatus[0][2])).div(this.calculateTotalAmountToBeRaised(multipliers.winner, multipliers.loser, multipliers.shared, multipliers.divisor, 2)).toString()}
                                  label={crowdfundingStatus && "%" + BigNumber(100).times(BigNumber(crowdfundingStatus[0][2])).div(this.calculateTotalAmountToBeRaised(multipliers.winner, multipliers.loser, multipliers.shared, multipliers.divisor, 2)).toFixed(2)}
                                />
                              </div>

                              <Card className="my-3 mx-0 p-3 purple-inverted text-center h-100" style={{ backgroundColor: "#F5F1FD" }}>
                                You will get <span style={{ fontWeight: "bold", display: "contents" }}>{this.calculateReturnOfInvestmentRatio(multipliers.winner, multipliers.loser, multipliers.shared, multipliers.divisor, 2).toFixed(2)}</span> times of your contribution back if
                                this side wins.
                                <h4 className="mt-2 purple-inverted text-center">
                                  {crowdfundingStatus &&
                                    crowdfundingStatus.contributions[2] != 0 &&
                                    "You contributed: " +
                                      BigNumber(crowdfundingStatus.contributions[2])
                                        .div(BigNumber(10).pow(BigNumber(18)))
                                        .toString() +
                                      " ETH"}
                                </h4>
                              </Card>

                              <Form.Row>
                                <Col s={1} md={1} l={1} xl={1}>
                                  <ClockRed />
                                </Col>
                                <Col>
                                  {appealPeriod && (
                                    <Countdown
                                      date={
                                        ((currentRuling == "2" || currentRuling == "0") && BigNumber(appealPeriod.end).times(BigNumber(1000)).toNumber()) ||
                                        BigNumber(appealPeriod.end)
                                          .div(BigNumber(2))
                                          .plus(BigNumber(appealPeriod.start).div(BigNumber(2)))
                                          .times(BigNumber(1000))
                                          .toNumber()
                                      }
                                    />
                                  )}
                                </Col>
                              </Form.Row>
                            </Card.Body>
                          </Card>
                        </Col>
                      </Form.Row>

                      <Form.Row>
                        <Col>
                          <Form.Group>
                            <Card className="m-0 crowfunding-card">
                              <Card.Body>
                                <Form.Row>
                                  <Col className="text-center my-3"></Col>
                                </Form.Row>

                                {!loserFailedToRaise && (
                                  <Form.Row>
                                    <Col>
                                      <p className="warning">If one side is fully funded, the other side should also be fully funded in order to not to lose the dispute.</p>
                                      <p className="warning"> Loser can fund only in the first half of the appeal period.</p>
                                    </Col>
                                  </Form.Row>
                                )}
                                {loserFailedToRaise && (
                                  <Form.Row>
                                    <Col>
                                      <p className="warning">Loser failed to raise appeal funds before deadline, winner remains the same. </p>
                                      <p className="warning">
                                        Awaiting winners deadline to be passed to execute the ruling. Please withdraw your funds back if you participated in crowdfunding. You will be able to do so once the execution period starts, by clicking "Withdraw Funds" button.
                                      </p>
                                    </Col>
                                  </Form.Row>
                                )}
                              </Card.Body>
                            </Card>
                          </Form.Group>
                        </Col>
                      </Form.Row>

                      {activeAddress && (
                        <Form.Row>
                          <Col>
                            <Button disabled={!activeAddress || loserFailedToRaise} className="float-right ok" onClick={this.handleFundButtonClick}>
                              Fund
                            </Button>
                          </Col>
                        </Form.Row>
                      )}
                    </>
                  )}
                </Form>
              </Card.Body>
            </Accordion.Collapse>
          </Card>
        </Accordion>
        {crowdfundingStatus && (
          <Modal size="xl" show={modalShow} onHide={(e) => this.setState({ modalShow: false, party: "0" })}>
            <Modal.Header>
              <Modal.Title>
                <Row>
                  <Col>Fund Appeal</Col>
                </Row>
              </Modal.Title>
            </Modal.Header>
            <Modal.Body style={{ padding: "0" }}>
              <Form id="fund-modal-form" style={{ backgroundColor: "white", padding: 0, margin: "2rem 0" }}>
                <Form.Group>
                  <Form.Row style={{ margin: "0 1rem" }}>
                    <Col>
                      <h4 className="purple-inverted" style={{ textAlign: "center", paddingBottom: "1rem" }}>
                        Which side do you want to fund?
                      </h4>
                    </Col>
                  </Form.Row>
                  <hr style={{ margin: 0 }} />
                  <Form.Row
                    className="fund-modal-ruling-option"
                    style={{ margin: "0", padding: "1.5rem", backgroundColor: this.state.party == "1" ? "#f5f1fd" : "white" }}
                    onClick={!crowdfundingStatus.hasPaid[1] && this.handleControlChange.bind(this, { target: { name: "party", value: "1" } })}
                  >
                    <Col>
                      <InputGroup
                        style={{
                          justifyContent: "space-between",
                          borderStyle: "unset",
                        }}
                      >
                        <InputGroup.Prepend>
                          <Form.Row>
                            <Col>
                              <h5 className="purple-2-inverted">{(currentRuling == "1" && "Winner") || (currentRuling == "2" && "Loser")}</h5>
                              <p className="purple-2-inverted"> {Object.values(this.props.metaevidence.metaEvidenceJSON.rulingOptions.titles)[0]}</p>
                            </Col>
                          </Form.Row>
                        </InputGroup.Prepend>
                        <InputGroup.Radio name="party" id="party-1" value="1" checked={this.state.party == "1"} onChange={this.handleControlChange} disabled={crowdfundingStatus.hasPaid[1]} />
                      </InputGroup>
                    </Col>
                  </Form.Row>
                  <hr style={{ margin: 0 }} />
                  <Form.Row
                    className="fund-modal-ruling-option"
                    style={{ margin: "0", padding: "1.5rem", backgroundColor: this.state.party == "2" ? "#f5f1fd" : "white" }}
                    onClick={!crowdfundingStatus.hasPaid[2] && this.handleControlChange.bind(this, { target: { name: "party", value: "2" } })}
                  >
                    <Col>
                      <InputGroup style={{ justifyContent: "space-between" }}>
                        <InputGroup.Prepend>
                          <Form.Row>
                            <Col>
                              <h5 className="purple-2-inverted">{(currentRuling == "1" && "Loser") || (currentRuling == "2" && "Winner")}</h5>
                              <p className="purple-2-inverted"> {Object.values(this.props.metaevidence.metaEvidenceJSON.rulingOptions.titles)[1]}</p>
                            </Col>
                          </Form.Row>
                        </InputGroup.Prepend>
                        <InputGroup.Radio name="party" id="party-2" value="2" checked={this.state.party == "2"} onChange={this.handleControlChange} disabled={crowdfundingStatus.hasPaid[2]} />
                      </InputGroup>
                    </Col>
                  </Form.Row>
                  <hr style={{ margin: 0 }} />
                  <Form.Row style={{ margin: "0", padding: "1.5rem" }}>
                    <Col>
                      <h5 className="purple-inverted text-center">How much do you want to contribute? (ETH)</h5>
                    </Col>
                  </Form.Row>
                  <Form.Row className="mb-3" style={{ margin: "0 1.5rem" }}>
                    <Col style={{ padding: 0 }}>
                      <Form.Control
                        name="contribution"
                        id="contribution"
                        type="number"
                        max={
                          crowdfundingStatus &&
                          multipliers &&
                          this.calculateAmountRemainsToBeRaised(multipliers.winner, multipliers.loser, multipliers.shared, multipliers.divisor, crowdfundingStatus, party)
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

                  <Form.Row style={{ margin: "0 1.5rem" }}>
                    <Col style={{ padding: 0 }}>
                      <Button className="float-left return" onClick={(e) => this.setState({ modalShow: false })}>
                        Return
                      </Button>
                    </Col>
                    <Col>
                      <Button className="float-right ok" onClick={this.handleContributeButtonClick} disabled={!activeAddress}>
                        {this.state.awaitingConfirmation && <Spinner as="span" animation="grow" size="sm" role="status" aria-hidden="true" />} {(this.state.awaitingConfirmation && "Awaiting Confirmation") || "Contribute"}
                      </Button>
                    </Col>
                  </Form.Row>
                </Form.Group>
              </Form>
            </Modal.Body>
          </Modal>
        )}
      </Container>
    );
  }
}

export default Appeal;
