import { Card, Row, Col, Form, Container } from "react-bootstrap";
import React from "react";
import { ReactComponent as AttachmentSVG } from "../assets/images/attachment.svg";
import DisputeTimeline from "components/disputeTimeline";

import styles from "components/styles/disputeDetails.module.css";

class DisputeDetails extends React.Component {
  componentDidMount() {}

  render() {
    const { metaevidenceJSON, ipfsGateway, interfaceValid, arbitrated, arbitratorDisputeID, arbitratorAddress, arbitratorDispute, subcourts } = this.props;
    console.log(metaevidenceJSON);

    if (arbitratorDispute && subcourts)
      return (
        <section className={styles.disputeDetails}>
          <DisputeTimeline period={arbitratorDispute.period} lastPeriodChange={arbitratorDispute.lastPeriodChange} subcourtID={arbitratorDispute.subcourtID} subcourt={subcourts[arbitratorDispute.subcourtID]} />
        </section>
      );
    else return <div></div>;
  }
}

export default DisputeDetails;
