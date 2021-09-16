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
const { toBN, toHex, hexToUtf8 } = Web3.utils;
import * as realitioLibQuestionFormatter from "@reality.eth/reality-eth-lib/formatters/question";
import DatetimePicker from "components/datetimePicker.js";

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

  onDatePickerChange = async (value, dateString) => {
    console.log("Selected Time: ", value);
    console.log("Formatted Selected Time: ", dateString);
    await this.setState({ variableRulingOption: value.utcOffset(0).set({ hour: 0, minute: 0, second: 0, millisecond: 0 }).unix() });
  };

  addDecimalsToUintRuling = (currentRuling, metaEvidenceJSON) => {
    return realitioLibQuestionFormatter.answerToBytes32(currentRuling, {
      decimals: metaEvidenceJSON.rulingOptions.precision || 18,
      type: metaEvidenceJSON.rulingOptions.type,
    });
  };

  handleFundButtonClick = () => {
    const { variable, appealCallback, rulingOptionCode, metaevidenceJSON } = this.props;
    const { variableRulingOption, contribution } = this.state;
    let actualRulingCode;
    console.log("hande fund button");
    console.log(variableRulingOption);
    switch (variable) {
      case undefined: // Not variable
        actualRulingCode = rulingOptionCode;
        break;
      case "uint":
        actualRulingCode = toBN(this.addDecimalsToUintRuling(variableRulingOption, metaevidenceJSON)).add(toBN("1")); // 10**18
        console.log(`actual ruling code for uint ${actualRulingCode}`);
        console.log(typeof actualRulingCode);
        break;
      case "int":
        actualRulingCode = parseInt(variableRulingOption) >= 0 ? parseInt(variableRulingOption) + 1 : variableRulingOption;
        break;
      case "string":
        actualRulingCode = Web3.utils.utf8ToHex(variableRulingOption);
        break;
      case "datetime":
        actualRulingCode = variableRulingOption + 1;
    }

    appealCallback(actualRulingCode, BigNumber(contribution).times(DECIMALS)); //.then(this.setState({ variableRulingOption: "", contribution: this.props.suggestedContribution }));
  };

  render() {
    const { dispute, subcourtDetails, subcourts, title, arbitratorDisputeDetails, grayedOut, winner, fundingPercentage, appealPeriodEnd, variable, roi, suggestedContribution, appealCallback, rulingOptionCode, metaevidenceJSON } = this.props;
    const { variableRulingOption, contribution } = this.state;
    console.debug(this.props);
    console.debug(this.state);

    return (
      <div className={`shadow rounded p-3 d-flex flex-column ${styles.crowdfundingCard}`}>
        <div>
          {!variable && <strong>{title}</strong>}
          {variable && variable != "datetime" && <FormControl id="variableRulingOption" type={variable == "string" ? "text" : "number"} value={variableRulingOption} step="1" placeholder="Enter a new ruling option" onChange={this.onControlChange}></FormControl>}
          {variable && variable == "datetime" && <DatetimePicker id="variableRulingOption" onChange={this.onDatePickerChange} />}
        </div>

        {winner && (
          <div>
            <small>Latest jury decision</small>
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
