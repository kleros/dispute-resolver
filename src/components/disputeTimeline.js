import { Row, Col } from "react-bootstrap";
import React from "react";
import PropTypes from "prop-types";
import Countdown, { zeroPad, calcTimeDelta } from "react-countdown";

import styles from "components/styles/disputeTimeline.module.css";

// Constants to avoid magic numbers
const MILLISECONDS_PER_SECOND = 1000;
const DISPUTE_PERIOD_EVIDENCE = 0;
const DISPUTE_PERIOD_VOTING = 2;
const DISPUTE_PERIOD_APPEAL = 3;
//The largest timestamp a Date can hold (milliseconds).
const MAX_DATE_MILLISECONDS = 8640000000000000;

const toSeconds = value => {
  if (value == null) return null;
  const seconds = Number.parseInt(value, 10);
  return Number.isSafeInteger(seconds) && seconds >= 0 ? seconds : null;
};

class DisputeTimeline extends React.Component {
  convertToHumanReadiableTime = timeInMillis => {
    const time = calcTimeDelta(parseInt(timeInMillis, 10) * MILLISECONDS_PER_SECOND, { now: () => 0 });

    return `${zeroPad(time.days, 2)}d ${zeroPad(time.hours, 2)}h ${zeroPad(time.minutes, 2)}m`;
  };

  renderCountdown = props => <span>{`${zeroPad(props.days, 2)}d ${zeroPad(props.hours, 2)}h ${zeroPad(props.minutes, 2)}m`}</span>;

  getPeriodStatus = (periodType, currentPeriod) => {
    if (currentPeriod === periodType) return "current";
    if (currentPeriod > periodType) return "past";
    return "upcoming";
  };

  getDecorationStatus = (periodType, currentPeriod) => {
    if (currentPeriod < periodType) return "upcoming";
    return "past";
  };

  //Unknown court durations or an unreadable period change are shown as unavailable instead of an expired countdown.
  getPeriodTime = (periodType, currentPeriod, lastPeriodChange, timesPerPeriod) => {
    const duration = toSeconds(timesPerPeriod?.[periodType]);

    if (currentPeriod === periodType) {
      const changedAt = toSeconds(lastPeriodChange);
      const deadline = changedAt != null && duration != null ? (changedAt + duration) * MILLISECONDS_PER_SECOND : null;
      if (deadline == null || deadline > MAX_DATE_MILLISECONDS) return <span>Unavailable</span>;
      return <Countdown date={deadline} now={this.props.now} renderer={this.renderCountdown} />;
    }
    if (currentPeriod > periodType) {
      return <span>Concluded</span>;
    }
    // Evidence period shows nothing when period < DISPUTE_PERIOD_EVIDENCE
    if (periodType === DISPUTE_PERIOD_EVIDENCE) {
      return null;
    }
    if (duration == null) return <span>Unavailable</span>;
    return <span>{this.convertToHumanReadiableTime(duration)}</span>;
  };

  render() {
    const { period, lastPeriodChange, timesPerPeriod } = this.props;

    return (
      <div className={styles.disputeTimeline}>
        <Row className={` ${styles.period}`}>
          <Col className={`mb-2 mb-md-0 ${this.getPeriodStatus(DISPUTE_PERIOD_EVIDENCE, period)} ${styles.evidence}`} xs={24} md="auto">
            <div>
              <div className={styles.name}>Evidence</div>
              <small className={styles.time}>
                {this.getPeriodTime(DISPUTE_PERIOD_EVIDENCE, period, lastPeriodChange, timesPerPeriod)}
              </small>
            </div>
          </Col>

          <Col className={`${this.getDecorationStatus(DISPUTE_PERIOD_VOTING, period)} d-none d-md-block ${styles.decoration}`} />

          <Col className={`mb-2 mb-md-0 ${this.getPeriodStatus(DISPUTE_PERIOD_VOTING, period)} justify-content-md-center ${styles.voting}`} xs={24} md="auto">
            <div>
              <div className={styles.name}>Voting</div>
              <small className={styles.time}>
                {this.getPeriodTime(DISPUTE_PERIOD_VOTING, period, lastPeriodChange, timesPerPeriod)}
              </small>
            </div>
          </Col>

          <Col className={`${this.getDecorationStatus(DISPUTE_PERIOD_APPEAL, period)} d-none d-md-block ${styles.decoration}`} />

          <Col className={`${this.getPeriodStatus(DISPUTE_PERIOD_APPEAL, period)} justify-content-md-end ${styles.appeal}`} xs={24} md="auto">
            <div>
              <div className={styles.name}>Appeal</div>
              <small className={styles.time}>
                {this.getPeriodTime(DISPUTE_PERIOD_APPEAL, period, lastPeriodChange, timesPerPeriod)}
              </small>
            </div>
          </Col>
        </Row>
      </div>
    );
  }
}

DisputeTimeline.propTypes = {
  period: PropTypes.number.isRequired,
  lastPeriodChange: PropTypes.string,
  timesPerPeriod: PropTypes.array,
  //Returns the current time in milliseconds, like Date.now; lets fixture mode freeze the countdowns.
  now: PropTypes.func,
};

export default DisputeTimeline;
