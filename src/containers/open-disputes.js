import React from "react";
import {  Col, Row, Dropdown, DropdownButton, Spinner } from "react-bootstrap";
import OngoingCard from "components/ongoing-card.js";
import debounce from "lodash.debounce";
import networkMap from "../ethereum/network-contract-mapping";

import styles from "containers/styles/open-disputes.module.css";

class OpenDisputes extends React.Component {
  constructor(props) {
    super(props);
    this.state = { openDisputeIDs: [], arbitratorDisputes: {}, loading: true, statusFilter: 4 };
    if(networkMap[this.props.network].KLEROS_LIQUID)
      this.debouncedFetch = debounce(this.fetch, 0, { leading: false, trailing: true });
  }

  componentDidUpdate(prevProps) {
    const { subcourts, subcourtDetails, network } = this.props;
    
    if (
      prevProps.subcourts !== subcourts || 
      prevProps.subcourtDetails !== subcourtDetails || 
      prevProps.network !== network
    ) {
      this.setState({ 
        loading: true, 
        openDisputeIDs: [], 
        arbitratorDisputes: {} 
      });
      
      if (networkMap[this.props.network]?.KLEROS_LIQUID) {
        if (this.debouncedFetch) {
          this.debouncedFetch.cancel();
        } else {
          // Initialize debounced fetch if it wasn't created in constructor
          this.debouncedFetch = debounce(this.fetch, 750, { leading: false, trailing: true });
        }
        this.debouncedFetch();
      }
    }
  }

  componentDidMount() {
    if(networkMap[this.props.network].KLEROS_LIQUID) this.fetch();
  }

  componentWillUnmount() {
    if (this.debouncedFetch) {
      this.debouncedFetch.cancel();
    }
    this.setState({ openDisputeIDs: [], arbitratorDisputes: {}, loading: true });
  }

  fetch = async() => {
    try {
      if (!networkMap[this.props.network]?.KLEROS_LIQUID) {
        this.setState({ loading: false });
        return;
      }

      const openDIDs = await this.props.getOpenDisputesOnCourtCallback();
      
      const sortedDisputes = [...openDIDs].sort((a, b) => parseInt(a) - parseInt(b)).reverse();
      this.setState({ openDisputeIDs: sortedDisputes });

      const detailPromises = sortedDisputes.map(async (disputeId) => {
        try {
          const arbitratorDisputeDetails = await this.props.getArbitratorDisputeCallback(disputeId);
          
          if (arbitratorDisputeDetails) {
            this.setState(prevState => ({
              arbitratorDisputes: {
                ...prevState.arbitratorDisputes,
                ["arbitrator" + disputeId]: arbitratorDisputeDetails
              }
            }));
            
            const metaEvidence = await this.props.getMetaEvidenceCallback(
              arbitratorDisputeDetails.arbitrated,
              disputeId
            );
            
            this.setState(prevState => ({
              arbitratorDisputes: {
                ...prevState.arbitratorDisputes,
                [disputeId]: metaEvidence
              }
            }));
          }
        } catch (error) {
          console.error(`Error fetching details for dispute ${disputeId}:`, error);
        }
      });
      
      await Promise.all(detailPromises);
      
      this.setState({ loading: false });
    } catch (error) {
      if (error.code === "NETWORK_ERROR" && error.event === "changed") {
        console.warn("Network Error: Unable to fetch open disputes. Reloading the page.");
        window.location.reload();
      }

      console.error("Error fetching open disputes:", error);
      this.setState({ loading: false });
    }
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

  onFilterSelect = async (filter) => this.setState({ statusFilter: filter });

  render() {
    const { openDisputeIDs, statusFilter, loading } = this.state;
    const { subcourts, subcourtDetails, network } = this.props;

    if(!networkMap[network].KLEROS_LIQUID) {
      return <main className={styles.openDisputes}><h1>There is no arbitrator on this network, thus no disputes.</h1></main>
    }

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
                key={dispute}
                xl={8}
                lg={12}
                md={12}
                sm={24}
                xs={24}
                style={{ display: (this.state[dispute] && this.state.arbitratorDisputes[`arbitrator${dispute}`].period == statusFilter) || statusFilter == 4 ? "block" : "none" }}
              >
                <a style={{ display: "contents", textDecoration: "none", color: "unset" }} href={`/${network}/cases/${dispute}`}>
                  {this.state.arbitratorDisputes[`arbitrator${dispute}`] && (this.state.arbitratorDisputes[`arbitrator${dispute}`].period == statusFilter || statusFilter == 4) && (
                    <OngoingCard
                      dispute={dispute}
                      arbitratorDisputeDetails={this.state.arbitratorDisputes[`arbitrator${dispute}`]}
                      title={this.state.arbitratorDisputes[dispute]?.title ?? "Meta Evidence Missing"}
                      subcourtDetails={subcourtDetails}
                      subcourts={subcourts || []}
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

export default OpenDisputes;
