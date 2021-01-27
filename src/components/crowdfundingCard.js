import { Card, Col, Form, Badge, Spinner, ProgressBar, InputGroup, FormControl, Button } from "react-bootstrap";
import React from "react";
import { ReactComponent as ScalesSVG } from "../assets/images/scales.svg";
import BigNumber from "bignumber.js";
import Countdown, { zeroPad, calcTimeDelta, formatTimeDelta } from "react-countdown";
import styles from "components/styles/crowdfundingCard.module.css";
import { ReactComponent as Hourglass } from "assets/images/hourglass.svg";
import AlertMessage from "components/alertMessage";
const DECIMALS = BigNumber(10).pow(BigNumber(18));
import Web3 from ".././ethereum/web3";

class CrowdfundingCard extends React.Component {
  constructor(props) {
    super(props);
    this.state = { variableRulingOption: "", contribution: this.props.suggestedContribution };
  }

  getPeriodName = (periodNumber) => {
    const strings = ["Evidence Period", "Commit Period", "Vote Period", "Appeal Period", "Execution Period"];

    return strings[periodNumber];
  };

  getStatusClass = (periodNumber) => {
    const strings = ["evidence", "commit", "vote", "appeal", "execution"];

    return strings[periodNumber];
  };

  onControlChange = async (e) => await this.setState({ [e.target.id]: e.target.value });

  handleFundButtonClick = () => {
    const { variable, appealCallback, rulingOptionCode } = this.props;
    console.log(Web3);
    const { variableRulingOption, contribution } = this.state;
    let actualRulingCode;

    switch (variable) {
      case undefined: //Not variable
        actualRulingCode = rulingOptionCode;
        break;
      case "uint":
        actualRulingCode = parseInt(variableRulingOption) + 1;
        break;
      case "int":
        actualRulingCode = parseInt(variableRulingOption) >= 0 ? parseInt(variableRulingOption) + 1 : variableRulingOption;
        break;
      case "string":
        actualRulingCode = Web3.utils.utf8ToHex(variableRulingOption);
        break;
    }

    appealCallback(actualRulingCode, BigNumber(contribution).times(DECIMALS)).then(this.setState({ variableRulingOption: "", contribution: this.props.suggestedContribution }));
  };

  render() {
    const { dispute, subcourtDetails, subcourts, title, arbitratorDisputeDetails, grayedOut, winner, fundingPercentage, appealPeriodEnd, variable, roi, suggestedContribution, appealCallback, rulingOptionCode } = this.props;
    const { variableRulingOption, contribution } = this.state;
    console.log(this.props);
    console.log(this.state);

    return (
      <div className={`shadow rounded p-3 d-flex flex-column ${styles.crowdfundingCard}`}>
        <div>
          {!variable && <strong>{title}</strong>}
          {variable && <FormControl id="variableRulingOption" type={variable == "string" ? "text" : "number"} value={variableRulingOption} step="1" placeholder="Enter a new ruling option" onChange={this.onControlChange}></FormControl>}
        </div>

        {winner && (
          <div>
            <small>Previous round winner</small>
          </div>
        )}
        <div className="mt-auto">
          <div className="text-center mt-3 text-success">{fundingPercentage}% Funded</div>
          <ProgressBar className="mb-2" now={fundingPercentage} variant="success" />

          <div className={styles.countdown}>
            <Hourglass className="red mr-1" />
            <Countdown className={styles.countdown} date={1000 * parseInt(appealPeriodEnd)} renderer={(props) => <span>{`${zeroPad(props.days, 2)}d ${zeroPad(props.hours, 2)}h ${zeroPad(props.minutes, 2)}m`}</span>} />
          </div>
          <InputGroup className="my-3">
            <FormControl
              id="contribution"
              value={suggestedContribution > 0 ? contribution : 0}
              placeholder="Enter contribution amount"
              aria-label="Recipient's username"
              aria-describedby="basic-addon2"
              type="number"
              step="0.01"
              onChange={this.onControlChange}
              disabled={suggestedContribution == 0}
            />
            <InputGroup.Append>
              <Button variant="primary" disabled={suggestedContribution == 0 || (variable && !variableRulingOption)} onClick={this.handleFundButtonClick}>
                Fund
              </Button>
            </InputGroup.Append>
          </InputGroup>
          <AlertMessage extraClass="mt-auto" type="info" title={`Return of Investment`} content={`If this ruling option wins, you will receive back ${roi} times of your contribution. `} />
        </div>
      </div>
    );
  }
}

export default CrowdfundingCard;
