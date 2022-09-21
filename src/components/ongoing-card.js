import { Card, Col, Form, Badge, Spinner } from "react-bootstrap";
import React from "react";
import { ReactComponent as ScalesSVG } from "../assets/images/scales.svg";
import BigNumber from "bignumber.js";
import Countdown, { zeroPad, calcTimeDelta, formatTimeDelta } from "react-countdown";
import styles from "components/styles/ongoing-card.module.css";
import { ReactComponent as Hourglass } from "assets/images/hourglass.svg";

class OngoingCard extends React.Component {
  constructor(props) {
    super(props);
  }

  componentDidMount() {
    console.log("OngoingCard.subcourts: %O", this.props.subcourts)
    console.log("OngoingCard.arbitratorDisputeDetails: %O", this.props.arbitratorDisputeDetails)
  }

  getPeriodName = (periodNumber) => {
    const strings = ["Evidence Period", "Commit Period", "Vote Period", "Appeal Period", "Execution Period"];

    return strings[periodNumber];
  };

  getStatusClass = (periodNumber) => {
    const strings = ["evidence", "commit", "vote", "appeal", "execution"];

    return strings[periodNumber];
  };
  render() {
    const { dispute, subcourtDetails, subcourts, title, arbitratorDisputeDetails, grayedOut } = this.props;

    return (
      <div className={styles.ongoingCard}>
        <div className={styles.header}>
          <span className={`${styles.status} ${this.getStatusClass(arbitratorDisputeDetails.period)}`}> </span>
          <span className={styles.disputeID}>{dispute}</span>
        </div>
        <div className={styles.body}>
          <div className={styles.title}>{title}</div>
          <hr className={styles.separator} />
        </div>

        <div className={styles.footer}>
          <div>
            {arbitratorDisputeDetails && subcourtDetails && (
              <div className={styles.badge}>
                <ScalesSVG />
                <span>{subcourtDetails[arbitratorDisputeDetails.subcourtID] && subcourtDetails[arbitratorDisputeDetails.subcourtID].name}</span>
              </div>
            )}
            {(!arbitratorDisputeDetails || !subcourtDetails) && (
              <div style={{ textAlign: "center" }}>
                <Spinner as="span" animation="grow" size="xs" role="status" aria-hidden="true" className="purple-inverted" />
              </div>
            )}
          </div>
          {arbitratorDisputeDetails && subcourts && (
            <div className={styles.countdown}>
              <Hourglass />
              <Countdown
                date={
                  1000 *
                  (parseInt(arbitratorDisputeDetails.lastPeriodChange) +
                    parseInt(subcourts[arbitratorDisputeDetails.subcourtID] && subcourts[arbitratorDisputeDetails.subcourtID].timesPerPeriod[arbitratorDisputeDetails.period]))
                }
                renderer={(props) => <span>{`${zeroPad(props.days, 2)}d ${zeroPad(props.hours, 2)}h ${zeroPad(props.minutes, 2)}m`}</span>}
              />
            </div>
          )}
        </div>
      </div>
    );
  }
}

export default OngoingCard;
