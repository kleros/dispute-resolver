import { Card, Col, Form, Badge } from "react-bootstrap";
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

  getPeriodName = (periodNumber) => {
    const strings = ["Evidence Period", "Commit Period", "Vote Period", "Appeal Period", "Execution Period"];

    return strings[periodNumber];
  };

  getStatusClass = (periodNumber) => {
    const strings = ["evidence", "commit", "vote", "appeal", "execution"];

    return strings[periodNumber];
  };
  render() {
    const { dispute, bundle, subcourtDetails, subcourts } = this.props;

    return (
      <div className={styles.ongoingCard} onClick={(e) => this.setState({ selectedDispute: dispute })}>
        <div className={styles.header}>
          {false && bundle[`arbitrator${dispute}`] && subcourtDetails && <div styles={styles.badge}>{subcourtDetails[bundle[`arbitrator${dispute}`].subcourtID] && subcourtDetails[bundle[`arbitrator${dispute}`].subcourtID].name}</div>}
          <span className={`${styles.status} ${this.getStatusClass(bundle[`arbitrator${dispute}`].period)}`}> </span>
          <span className={styles.disputeID}>{dispute}</span>
        </div>
        <div className={styles.body}>
          <div className={styles.title}>{bundle[dispute].title}</div>
          <hr className={styles.separator} />
        </div>

        <div className={styles.footer}>
          {bundle[`arbitrator${dispute}`].period == 3 && (
            <div>
              {bundle[`arbitrator${dispute}`] && subcourtDetails && (
                <div className={styles.badge}>
                  <ScalesSVG />
                  <span>{subcourtDetails[bundle[`arbitrator${dispute}`].subcourtID] && subcourtDetails[bundle[`arbitrator${dispute}`].subcourtID].name}</span>
                </div>
              )}
            </div>
          )}
          {bundle[`arbitrator${dispute}`] && subcourts && (
            <div className={styles.countdown}>
              <Hourglass />
              <Countdown
                date={BigNumber("1000")
                  .times(BigNumber(bundle[`arbitrator${dispute}`].lastPeriodChange).plus(BigNumber(subcourts[bundle[`arbitrator${dispute}`].subcourtID].timesPerPeriod[bundle[`arbitrator${dispute}`].period])))
                  .toNumber()}
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
