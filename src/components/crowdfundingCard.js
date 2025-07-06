import { ProgressBar, InputGroup, FormControl, Button } from "react-bootstrap";
import React from "react";
import Countdown, { zeroPad } from "react-countdown";
import styles from "components/styles/crowdfundingCard.module.css";
import { ReactComponent as Hourglass } from "assets/images/hourglass.svg";
import AlertMessage from "components/alertMessage";
import * as realitioLibQuestionFormatter from "@reality.eth/reality-eth-lib/formatters/question";
import DatetimePicker from "components/datetimePicker.js";
import { ethers } from "ethers";

class CrowdfundingCard extends React.Component {
  constructor(props) {
    super(props);
    this.state = { variableRulingOption: "", contribution: this.props.suggestedContribution, error: null };
  }

  onControlChange = e => this.setState({ [e.target.id]: e.target.value, error: null });

  onDatePickerChange = (value, _dateString) => {
    this.setState({ variableRulingOption: value.utcOffset(0).set({ hour: 0, minute: 0, second: 0, millisecond: 0 }).unix() });
  };

  addDecimalsToUintRuling = (currentRuling, metaEvidenceJSON) => {
    return realitioLibQuestionFormatter.answerToBytes32(currentRuling, {
      decimals: metaEvidenceJSON.rulingOptions.precision || 18,
      type: metaEvidenceJSON.rulingOptions.type,
    });
  };

  handleFundButtonClick = async () => {
    const { variable, appealCallback, rulingOptionCode, metaevidenceJSON } = this.props;
    const { variableRulingOption, contribution } = this.state;
    let actualRulingCode;

    // First, validate and process the input
    try {
      switch (variable) {
        case undefined: // Not variable
          actualRulingCode = rulingOptionCode;
          break;
        case "uint":
          actualRulingCode = ethers.getBigInt(this.addDecimalsToUintRuling(variableRulingOption, metaevidenceJSON)) + 1n;
          break;
        case "int": {
          const parsedValue = parseInt(variableRulingOption, 10);
          actualRulingCode = parsedValue >= 0 ? parsedValue + 1 : variableRulingOption;
          break;
        }
        case "string":
          actualRulingCode = ethers.hexlify(ethers.toUtf8Bytes(variableRulingOption));
          break;
        case "datetime":
          actualRulingCode = variableRulingOption + 1;
          break;
        case "hash":
          actualRulingCode = BigInt(variableRulingOption) + 1n;
          break;
      }
    } catch {
      // Set error state for input validation errors
      this.setState({ error: "Invalid input format. Please enter a valid number or hex string." });
      return;
    }

    // Then, execute the callback
    try {
      await appealCallback(actualRulingCode, contribution.toString());
    } catch {
      // Set error state for callback execution errors
      this.setState({ error: "Transaction failed. Please check your network connection and try again." });
    }
  };



  render() {
    const { title, winner, fundingPercentage, appealPeriodEnd, variable, roi, suggestedContribution } = this.props;
    const { variableRulingOption, contribution, error } = this.state;

    return (
      <div className={`shadow rounded p-3 d-flex flex-column ${styles.crowdfundingCard}`}>
        <div>
          {!variable && <strong>{title}</strong>}
          {variable && variable != "datetime" && <FormControl id="variableRulingOption" type={(variable == "string" || variable == "hash") ? "text" : "number"} value={variableRulingOption} step="1" placeholder="Enter a new ruling option" onChange={this.onControlChange}></FormControl>}
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
          {error && (
            <AlertMessage extraClass="mb-3" type="danger" title="Invalid Input" content={error} />
          )}
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
              <Button variant="primary" disabled={suggestedContribution == 0 || (variable && !variableRulingOption) || error} onClick={this.handleFundButtonClick}>
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
