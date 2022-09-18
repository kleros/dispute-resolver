import React from "react";
import { Accordion, Container, Col, Row, Button, Form, Card, Dropdown, DropdownButton, Badge, Spinner } from "react-bootstrap";
import { Redirect, Link } from "react-router-dom";
import OngoingCard from "components/ongoing-card.js";
import debounce from "lodash.debounce";
import networkMap from "../ethereum/network-contract-mapping";

import styles from "containers/styles/open-disputes.module.css";

class openDisputeIDs extends React.Component {
  constructor(props) {
    super(props);
    this.state = { openDisputeIDs: [], arbitratorDisputes: {}, loading: true, statusFilter: 4 };
    if(networkMap[this.props.network].KLEROS_LIQUID)
      this.debouncedFetch = debounce(this.fetch, 0, { leading: false, trailing: true });
  }

  componentWillReceiveProps(props) {
    const { subcourts, subcourtDetails } = this.props;
    if (props.subcourts !== subcourts || props.subcourtDetails !== subcourtDetails) {
      this.setState({ loading: true, openDisputeIDs: [], arbitratorDisputes: {} });
      if(networkMap[this.props.network].KLEROS_LIQUID){
        this.debouncedFetch.cancel();
        this.debouncedFetch();
      }
    }
  }
  componentDidMount() {
    if(networkMap[this.props.network].KLEROS_LIQUID) this.fetch();
  }

  fetch = () => {
    this.props.getOpenDisputesOnCourtCallback().then((openDisputeIDs) => {
      this.setState({ openDisputeIDs: openDisputeIDs });

      openDisputeIDs
        .sort(function compareFn(a, b) {
          return parseInt(a) - parseInt(b);
        })
        .reverse()
        .map((arbitratorDispute) => {
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
  };

  FILTER_NAMES = ["Evidence", "Commit", "Voting", "Appeal", "Ongoing"];

  getFilterName = (periodNumber) => {
    const strings = this.FILTER_NAMES;

    return strings[periodNumber];
  };

  getStatusClass = (periodNumber) => {
    const strings = ["evidence", "commit", "vote", "appeal", "execution"];

    return strings[periodNumber];
  };

  onFilterSelect = async (filter) => {
    
    await this.setState({ statusFilter: filter });
  };

  render() {
    // 
    // 

    const { openDisputeIDs, selectedDispute, statusFilter, loading } = this.state;
    const { subcourts, subcourtDetails, network } = this.props;



  if(!networkMap[network].KLEROS_LIQUID) return <main className={styles.openDisputes}><h1>There is no arbitrator on this network, thus no disputes.</h1></main>

    return (
      <main className={styles.openDisputes} id="ongoing-disputes">
        <Row className={styles.dropdownContainer}>
          <DropdownButton
            id="dropdown-basic-button"
            title={this.getFilterName(statusFilter)}
            className={`${styles.filter} ${this.getStatusClass(statusFilter)}`}
            onSelect={this.onFilterSelect}
          >
            {this.FILTER_NAMES.map((name, index) => (
              <Dropdown.Item key={index} eventKey={index} className={this.getStatusClass(index)}>
                {name}
              </Dropdown.Item>
            ))}
          </DropdownButton>
        </Row>
        <Row style={{ margin: 0, padding: 0 }}>
          {this.state.loading && (
            <div style={{ margin: "auto", marginTop: "5vh" }}>
              <Spinner as="span" animation="grow" size="sm" role="status" aria-hidden="true" style={{ width: "5rem", height: "5rem" }} className="purple-inverted" />
            </div>
          )}
          {!loading &&
            openDisputeIDs.map((dispute) => (
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
                  {this.state[`arbitrator${dispute}`] && (this.state[`arbitrator${dispute}`].period == statusFilter || statusFilter == 4) && (
                    <OngoingCard
                      dispute={dispute}
                      arbitratorDisputeDetails={this.state[`arbitrator${dispute}`]}
                      title={(this.state[dispute] && this.state[dispute].title) || "Meta Evidence Missing"}
                      subcourtDetails={subcourtDetails}
                      subcourts={subcourts}
                    />
                  )}
                </a>
              </Col>
            ))}
          {!this.state.loading && openDisputeIDs.length == 0 && (
            <Col style={{ textAlign: "center", marginTop: "5rem" }}>
              <h1>There are no open disputes.</h1>
            </Col>
          )}
        </Row>
      </main>
    );
  }
}

export default openDisputeIDs;
