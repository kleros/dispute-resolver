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
    this.state = { variableRulingOption: "", contribution: this.props.suggestedContribution, error: null, pending: false };
  }

  componentWillUnmount() {
    this.unmounted = true;
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

  //The button is disabled while the contribution is on its way, so it cannot be sent twice.
  handleFundButtonClick = async () => {
    const { variable, appealCallback, rulingOptionCode, metaevidenceJSON } = this.props;
    const { variableRulingOption, contribution } = this.state;

    this.setState({ pending: true });
    try {
      const actualRulingCode = this.processRulingCode(variable, variableRulingOption, metaevidenceJSON, rulingOptionCode);
      await appealCallback(actualRulingCode, contribution.toString());
    } catch (error) {
      if (error.message && error.message.includes('Unsupported variable type')) {
        this.setState({ error: "Invalid input format. Please enter a valid number or hex string." });
      } else {
        this.setState({ error: "Transaction failed. Please check your network connection and try again." });
      }
    } finally {
      if (!this.unmounted) this.setState({ pending: false });
    }
  };

  render() {
    const { title, winner, fundingPercentage, appealPeriodEnd, variable, roi, suggestedContribution } = this.props;
    const { variableRulingOption, contribution, error, pending } = this.state;
    const fullyFunded = Number(suggestedContribution) === 0;

    return (
      <div className={`${styles.crowdfundingCard} ${winner ? styles.winner : ""}`}>
        <div className={styles.head}>
          {!variable && <strong className={styles.title}>{title}</strong>}
          {variable && variable != "datetime" && (
            <FormControl
              id="variableRulingOption"
              className={styles.variableInput}
              type={(variable == "string" || variable == "hash") ? "text" : "number"}
              value={variableRulingOption}
              step="1"
              placeholder="Enter a new ruling option"
              aria-label="New ruling option"
              onChange={this.onControlChange}
            />
          )}
          {variable && variable == "datetime" && <DatetimePicker id="variableRulingOption" onChange={this.onDatePickerChange} />}
          {(winner || fullyFunded) && (
            <div className={styles.badges}>
              {winner && <span className={styles.badgeWinner}>Latest jury decision</span>}
              {fullyFunded && <span className={styles.badgeFunded}>Fully funded</span>}
            </div>
          )}
        </div>

        <div className={styles.funding}>
          <div className={styles.fundingLabel}>
            <span>{fundingPercentage}% Funded</span>
          </div>
          <ProgressBar now={fundingPercentage} variant="success" aria-label={`${fundingPercentage}% funded`} />
        </div>

        <div className={styles.countdown}>
          <Hourglass aria-hidden="true" />
          <span className={styles.countdownLabel}>Ends in</span>
          <Countdown date={1000 * parseInt(appealPeriodEnd, 10)} now={this.props.now} renderer={this.renderCountdown} />
        </div>

        {error && (
          <AlertMessage extraClass={styles.error} type="error" title="Invalid Input" content={error} />
        )}

        <InputGroup className={styles.controls}>
          <FormControl
            id="contribution"
            value={suggestedContribution > 0 ? contribution : 0}
            placeholder="Enter contribution amount"
            aria-label="Contribution amount"
            type="number"
            step="0.01"
            onChange={this.onControlChange}
            disabled={fullyFunded || pending}
          />
          <InputGroup.Append>
            <Button variant="primary" disabled={fullyFunded || (variable && !variableRulingOption) || error || pending} onClick={this.handleFundButtonClick}>
              {pending ? "Funding…" : "Fund"}
            </Button>
          </InputGroup.Append>
        </InputGroup>

        <p className={styles.roi}>If this ruling option wins, you will receive back {roi} times of your contribution.</p>
      </div>
    );
  }
}

export default CrowdfundingCard;
