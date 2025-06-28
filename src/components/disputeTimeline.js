import { Row, Col } from "react-bootstrap";
import React from "react";
import Countdown, { zeroPad, calcTimeDelta } from "react-countdown";

import styles from "components/styles/disputeTimeline.module.css";

// Constants to avoid magic numbers
const MILLISECONDS_PER_SECOND = 1000;
const DISPUTE_PERIOD_EVIDENCE = 0;
const DISPUTE_PERIOD_VOTING = 2;
const DISPUTE_PERIOD_APPEAL = 3;

class DisputeTimeline extends React.Component {
  convertToHumanReadiableTime = (timeInMillis) => {
    const time = calcTimeDelta(parseInt(timeInMillis) * MILLISECONDS_PER_SECOND, { now: () => 0 });

    return `${zeroPad(time.days, 2)}d ${zeroPad(time.hours, 2)}h ${zeroPad(time.minutes, 2)}m`;
  };

  render() {
    const { period, lastPeriodChange, timesPerPeriod } = this.props;

    return (
      <div className={styles.disputeTimeline}>
        <Row className={` ${styles.period}`}>
          <Col className={`mb-2 mb-md-0 ${period == DISPUTE_PERIOD_EVIDENCE ? "current" : "past"} ${styles.evidence}`} xs={24} md="auto">
            <div>
              <div className={styles.name}>Evidence</div>
              <small className={styles.time}>
                {period == DISPUTE_PERIOD_EVIDENCE && <Countdown date={(parseInt(lastPeriodChange) + parseInt(timesPerPeriod[period])) * MILLISECONDS_PER_SECOND} renderer={(props) => <span>{`${zeroPad(props.days, 2)}d ${zeroPad(props.hours, 2)}h ${zeroPad(props.minutes, 2)}m`}</span>} />}
                {period > DISPUTE_PERIOD_EVIDENCE && "Concluded"}
              </small>
            </div>
          </Col>

          <Col className={`${period < DISPUTE_PERIOD_VOTING ? "upcoming" : "past"}  d-none d-md-block  ${styles.decoration}`} />

          <Col className={`mb-2 mb-md-0 ${period < DISPUTE_PERIOD_VOTING && "upcoming"} ${period == DISPUTE_PERIOD_VOTING ? "current" : "past"} justify-content-md-center ${styles.voting}`} xs={24} md="auto">
            <div>
              <div className={styles.name}>Voting</div>
              <small className={styles.time}>
                {period == DISPUTE_PERIOD_VOTING && <Countdown date={(parseInt(lastPeriodChange) + parseInt(timesPerPeriod[period])) * MILLISECONDS_PER_SECOND} renderer={(props) => <span>{`${zeroPad(props.days, 2)}d ${zeroPad(props.hours, 2)}h ${zeroPad(props.minutes, 2)}m`}</span>} />}
                {period > DISPUTE_PERIOD_VOTING && "Concluded"}
                {period < DISPUTE_PERIOD_VOTING && this.convertToHumanReadiableTime(timesPerPeriod[DISPUTE_PERIOD_VOTING])}
              </small>
            </div>
          </Col>

          <Col className={`${period < DISPUTE_PERIOD_APPEAL ? "upcoming" : "past"}  d-none d-md-block ${styles.decoration}`} />

          <Col className={`${period < DISPUTE_PERIOD_APPEAL && "upcoming"} ${period == DISPUTE_PERIOD_APPEAL ? "current" : "past"}  justify-content-md-end ${styles.appeal}`} xs={24} md="auto">
            <div>
              <div className={styles.name}>Appeal</div>
              <small className={styles.time}>
                {period > DISPUTE_PERIOD_APPEAL && "Concluded"}
                {period == DISPUTE_PERIOD_APPEAL && <Countdown date={(parseInt(lastPeriodChange) + parseInt(timesPerPeriod[period])) * MILLISECONDS_PER_SECOND} renderer={(props) => <span>{`${zeroPad(props.days, 2)}d ${zeroPad(props.hours, 2)}h ${zeroPad(props.minutes, 2)}m`}</span>} />}
                {period < DISPUTE_PERIOD_APPEAL && this.convertToHumanReadiableTime(timesPerPeriod[DISPUTE_PERIOD_APPEAL])}
              </small>
            </div>
          </Col>
        </Row>
      </div>
    );
  }
}

export default DisputeTimeline;
