import { ProgressBar, InputGroup, FormControl, Button } from "react-bootstrap";
import React from "react";
import Countdown, { zeroPad } from "react-countdown";
import styles from "components/styles/crowdfundingCard.module.css";
import { ReactComponent as Hourglass } from "assets/images/hourglass.svg";
import AlertMessage from "components/alertMessage";
import { answerToBytes32 } from "@reality.eth/reality-eth-lib/formatters/question";
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

  renderCountdown = props => (
    <span>{`${zeroPad(props.days, 2)}d ${zeroPad(props.hours, 2)}h ${zeroPad(props.minutes, 2)}m`}</span>
  );

  addDecimalsToUintRuling = (currentRuling, metaEvidenceJSON) => {
    return answerToBytes32(currentRuling, {
      decimals: metaEvidenceJSON.rulingOptions.precision || 18,
      type: metaEvidenceJSON.rulingOptions.type,
    });
  };

  processRulingCode = (variable, variableRulingOption, metaevidenceJSON, rulingOptionCode) => {
    switch (variable) {
      case undefined: // Not variable
        return rulingOptionCode;
      case "uint":
        return ethers.getBigInt(this.addDecimalsToUintRuling(variableRulingOption, metaevidenceJSON)) + 1n;
      case "int": {
        const parsedValue = parseInt(variableRulingOption, 10);
        return parsedValue >= 0 ? parsedValue + 1 : parsedValue;
      }
      case "string":
        return ethers.hexlify(ethers.toUtf8Bytes(variableRulingOption));
      case "datetime":
        return variableRulingOption + 1;
      case "hash":
        return BigInt(variableRulingOption) + 1n;
      default:
        throw new Error(`Unsupported variable type: ${variable}`);
    }
  };

  handleFundButtonClick = async () => {
    const { variable, appealCallback, rulingOptionCode, metaevidenceJSON } = this.props;
    const { variableRulingOption, contribution } = this.state;
    
    try {
      const actualRulingCode = this.processRulingCode(variable, variableRulingOption, metaevidenceJSON, rulingOptionCode);
      await appealCallback(actualRulingCode, contribution.toString());
    } catch (error) {
      if (error.message && error.message.includes('Unsupported variable type')) {
        this.setState({ error: "Invalid input format. Please enter a valid number or hex string." });
      } else {
        this.setState({ error: "Transaction failed. Please check your network connection and try again." });
      }
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
            <Countdown className={styles.countdown} date={1000 * parseInt(appealPeriodEnd, 10)} renderer={this.renderCountdown} />
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
