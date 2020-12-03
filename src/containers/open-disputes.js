import React from "react";
import { Accordion, Container, Col, Row, Button, Form, Card, Dropdown, DropdownButton, Badge, Spinner } from "react-bootstrap";
import { Redirect, Link } from "react-router-dom";
import OngoingCard from "components/ongoing-card.js";
import styles from "containers/styles/open-disputes.module.css";

class openDisputeIDs extends React.Component {
  constructor(props) {
    super(props);
    this.state = { openDisputeIDs: [], arbitratorDisputes: {}, loading: true, statusFilter: 4 };
  }
  componentDidMount() {
    this.props.getOpenDisputesOnCourtCallback().then((openDisputeIDs) => {
      this.setState({ openDisputeIDs: openDisputeIDs });

      openDisputeIDs.map((arbitratorDispute) => {
        this.props.getArbitratorDisputeCallback(arbitratorDispute).then((arbitratorDisputeDetails) => {
          this.setState({ ["arbitrator" + arbitratorDispute]: arbitratorDisputeDetails });
          this.props.getMetaEvidenceCallback(arbitratorDisputeDetails.arbitrated, arbitratorDispute).then((metaevidence) => {
            this.setState({ [arbitratorDispute]: metaevidence });
          });
        });

        this.props.getCurrentRulingCallback(arbitratorDispute).then((ruling) => this.setState({ ["arbitratorRuling" + arbitratorDispute]: ruling }));
      });
      this.setState({ loading: false });
    });
  }

  FILTER_NAMES = ["Evidence", "Commit", "Voting", "Crowdfunding", "Ongoing"];

  getFilterName = (periodNumber) => {
    const strings = this.FILTER_NAMES;

    return strings[periodNumber];
  };

  getStatusClass = (periodNumber) => {
    const strings = ["evidence", "commit", "vote", "appeal", "execution"];

    return strings[periodNumber];
  };

  onFilterSelect = async (filter) => {
    console.log(filter);
    await this.setState({ statusFilter: filter });
  };

  render() {
    console.debug(this.state);
    console.debug(this.props);

    const { openDisputeIDs, selectedDispute, statusFilter } = this.state;
    const { subcourts, subcourtDetails } = this.props;

    return (
      <main className={styles.openDisputes} id="ongoing-disputes">
        <Row>
          <DropdownButton id="dropdown-basic-button" title={this.getFilterName(statusFilter)} className={`${styles.filter} ${this.getStatusClass(statusFilter)}`} onSelect={this.onFilterSelect}>
            {this.FILTER_NAMES.map((name, index) => (
              <Dropdown.Item eventKey={index} className={this.getStatusClass(index)}>
                {name}
              </Dropdown.Item>
            ))}
          </DropdownButton>
        </Row>
        <Row style={{ margin: 0, padding: 0 }}>
          {openDisputeIDs.map((dispute) => (
            <Col
              className={styles.card}
              style={{ display: "flex", flexDirection: "column" }}
              key={dispute}
              xl={8}
              lg={12}
              md={12}
              sm={24}
              xs={24}
              style={{ display: (this.state[dispute] && this.state[`arbitrator${dispute}`].period == statusFilter) || statusFilter == 4 ? "block" : "none" }}
            >
              <a style={{ display: "contents", textDecoration: "none", color: "unset" }} href={`/cases/${dispute}`}>
                {this.state[dispute] && (this.state[`arbitrator${dispute}`].period == statusFilter || statusFilter == 4) && (
                  <OngoingCard dispute={dispute} arbitratorDisputeDetails={this.state[`arbitrator${dispute}`]} title={this.state[dispute].title} subcourtDetails={subcourtDetails} subcourts={subcourts} />
                )}
              </a>
            </Col>
          ))}
          {!this.state.loading && openDisputeIDs.length == 0 && (
            <Col style={{ textAlign: "center", marginTop: "5rem" }}>
              <h1>There are no open disputes.</h1>
            </Col>
          )}
          {this.state.loading && (
            <div style={{ margin: "auto", marginTop: "5vh" }}>
              <Spinner as="span" animation="grow" size="sm" role="status" aria-hidden="true" style={{ width: "5rem", height: "5rem" }} className="purple-inverted" />
            </div>
          )}
        </Row>
      </main>
    );
  }
}

export default openDisputeIDs;
