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
    this.state = { variableRulingOption: "", contribution: this.props.suggestedContribution };
  }

  onControlChange = (e) => this.setState({ [e.target.id]: e.target.value });

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

    try {
      switch (variable) {
        case undefined: // Not variable
          actualRulingCode = rulingOptionCode;
          break;
        case "uint":
          actualRulingCode = ethers.getBigInt(this.addDecimalsToUintRuling(variableRulingOption, metaevidenceJSON)) + 1n;
          break;
        case "int":
          actualRulingCode = parseInt(variableRulingOption) >= 0 ? parseInt(variableRulingOption) + 1 : variableRulingOption;
          break;
        case "string":
          actualRulingCode = ethers.hexlify(ethers.toUtf8Bytes(variableRulingOption));
          break;
        case "datetime":
          actualRulingCode = variableRulingOption + 1;
          break;
        case "hash":
          // Handle hash values - support both hex strings (0x...) and numeric strings
          const hashValue = variableRulingOption.toString().trim();
          const isHexString = /^0x/i.test(hashValue);

          if (isHexString) {
            // Process hex string: validate and convert to BigInt, then add 1
            const hexWithoutPrefix = hashValue.slice(2);
            if (hexWithoutPrefix === '' || !/^[0-9a-fA-F]+$/.test(hexWithoutPrefix)) {
              throw new Error(`Invalid hex value: ${hashValue}`);
            }
            actualRulingCode = BigInt('0x' + hexWithoutPrefix) + 1n;
          } else {
            // Process numeric string: convert to BigInt and add 1
            if (hashValue.includes('e') || hashValue.includes('E')) {
              throw new Error(`Hash value precision lost during processing. Please report this issue.`);
            }
            try {
              actualRulingCode = BigInt(hashValue) + 1n;
            } catch (error) {
              throw new Error(`Invalid hash value: not a valid number or hex string: ${hashValue}`);
            }
          }
          break;
      }

      await appealCallback(actualRulingCode, contribution.toString());
    } catch (error) {
      console.error('Error processing appeal:', error);
      alert(`Error: ${error.message}`);
    }
  };

  render() {
    const { title, winner, fundingPercentage, appealPeriodEnd, variable, roi, suggestedContribution } = this.props;
    const { variableRulingOption, contribution } = this.state;

    return (
      <div className={`shadow rounded p-3 d-flex flex-column ${styles.crowdfundingCard}`}>
        <div>
          {!variable && <strong>{title}</strong>}
          {variable && variable != "datetime" && <FormControl id="variableRulingOption" type={variable == "string" || variable == "hash" ? "text" : "number"} value={variableRulingOption} step="1" placeholder="Enter a new ruling option" onChange={this.onControlChange}></FormControl>}
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
