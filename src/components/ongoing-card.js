import { Spinner } from "react-bootstrap";
import React from "react";
import { ReactComponent as ScalesSVG } from "../assets/images/scales.svg";
import Countdown, { zeroPad } from "react-countdown";
import styles from "components/styles/ongoing-card.module.css";
import { ReactComponent as Hourglass } from "assets/images/hourglass.svg";

class OngoingCard extends React.Component {
  getStatusClass = periodNumber => {
    const strings = ["evidence", "commit", "vote", "appeal", "execution"];

    return strings[periodNumber];
  };

  getRemainingTime = () => {
    if (!this.props.arbitratorDisputeDetails || !this.props.subcourts.length) return null;

    const { arbitratorDisputeDetails, subcourts } = this.props;
    const { lastPeriodChange, period, subcourtID } = arbitratorDisputeDetails

    const timesPerPeriod = subcourts[subcourtID.toString()][1]
    const periodDuration = timesPerPeriod[period.toString()];

    return 1000 * (parseInt(lastPeriodChange.toString()) + parseInt(periodDuration));
  }

  render() {
    const { dispute, subcourtDetails, title, arbitratorDisputeDetails } = this.props;
    const remainingTime = this.getRemainingTime()

    return (
      <div className={styles.ongoingCard}>
        <div className={styles.header}>
          <span className={`${styles.status} ${this.getStatusClass(arbitratorDisputeDetails.period.toString())}`}> </span>
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
                <span>{subcourtDetails[arbitratorDisputeDetails.subcourtID.toString()] && subcourtDetails[arbitratorDisputeDetails.subcourtID.toString()].name}</span>
              </div>
            )}
            {(!arbitratorDisputeDetails || !subcourtDetails) && (
              <div style={{ textAlign: "center" }}>
                <Spinner as="span" animation="grow" size="xs" role="status" aria-hidden="true" className="purple-inverted" />
              </div>
            )}
          </div>
          {remainingTime != null && remainingTime > 0 && (
            <div className={styles.countdown}>
              <Hourglass />
              <Countdown
                date={remainingTime}
                renderer={props => <span>{`${zeroPad(props.days, 2)}d ${zeroPad(props.hours, 2)}h ${zeroPad(props.minutes, 2)}m`}</span>}
              />
            </div>
          )}
        </div>
      </div>
    );
  }
}

export default OngoingCard;
