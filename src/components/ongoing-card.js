import React from "react";
import { ReactComponent as ScalesSVG } from "../assets/images/scales.svg";
import Countdown, { zeroPad } from "react-countdown";
import styles from "components/styles/ongoing-card.module.css";
import { ReactComponent as Hourglass } from "assets/images/hourglass.svg";

//Use the same safe title for rendering and searching untrusted meta-evidence.
export const getDisputeTitle = title => {
  if (typeof title === "string" && title.trim()) return title;
  return title == null ? "Meta Evidence Missing" : "Title unavailable";
};

export const getCourtName = (details, subcourtDetails) => {
  const name = subcourtDetails?.[details?.subcourtID?.toString()]?.name;
  return typeof name === "string" && name.trim() ? name : "Court unavailable";
};

const PERIOD_NAMES = ["Evidence Period", "Commit Period", "Voting", "Appeal", "Executed"];
const PERIOD_CLASSES = ["evidence", "commit", "vote", "appeal", "execution"];

class OngoingCard extends React.Component {
  getRemainingTime = () => {
    const { arbitratorDisputeDetails, subcourts } = this.props;
    const { lastPeriodChange, period, subcourtID } = arbitratorDisputeDetails || {};
    const periodDuration = subcourts?.[subcourtID?.toString()]?.[1]?.[period?.toString()];
    const changedAt = Number(lastPeriodChange?.toString());
    const duration = Number(periodDuration?.toString());
    const deadline = 1000 * (changedAt + duration);

    //Unknown courts or invalid timings must not prevent other disputes from rendering.
    return Number.isFinite(deadline) && changedAt >= 0 && duration >= 0 && deadline > 0 && deadline <= 8640000000000000 ? deadline : null;
  };

  render() {
    const { dispute, subcourtDetails, title, arbitratorDisputeDetails } = this.props;
    const remainingTime = this.getRemainingTime();
    const period = Number(arbitratorDisputeDetails?.period?.toString());
    const displayTitle = getDisputeTitle(title);
    const hasTitle = typeof title === "string" && title.trim();

    return (
      <article className={styles.ongoingCard}>
        <div className={styles.header}>
          <span className={`${styles.status} ${styles[PERIOD_CLASSES[period]] || ""}`}>{PERIOD_NAMES[period] || "Status unavailable"}</span>
          <span className={styles.identifier}><span aria-hidden="true">#</span><span className={styles.disputeID}>{dispute}</span></span>
        </div>
        <div className={styles.body}>
          <h2 className={styles.title}>{displayTitle}</h2>
          {!hasTitle && (
            <p className={styles.placeholder}>{title == null ? "No meta-evidence title is available for this dispute." : "The meta-evidence title could not be read."}</p>
          )}
          <div className={styles.court}>
            <span className={styles.label}>Court</span>
            <div className={styles.badge}>
              <ScalesSVG aria-hidden="true" />
              <span>{getCourtName(arbitratorDisputeDetails, subcourtDetails)}</span>
            </div>
          </div>
        </div>
        <div className={styles.footer}>
          <div>
            <span className={styles.label}>Time remaining</span>
            <div className={styles.countdown}>
              <Hourglass aria-hidden="true" />
              {remainingTime == null ? <span>Unavailable</span> : (
                <Countdown
                  date={remainingTime}
                  renderer={props => <span>{`${zeroPad(props.days, 2)}d ${zeroPad(props.hours, 2)}h ${zeroPad(props.minutes, 2)}m`}</span>}
                />
              )}
            </div>
          </div>
          <span className={styles.viewDispute}>View dispute <span aria-hidden="true">↗</span></span>
        </div>
      </article>
    );
  }
}

export default OngoingCard;
