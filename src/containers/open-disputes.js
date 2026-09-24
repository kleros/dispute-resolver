import React from "react";
import { Col, Row, Dropdown, DropdownButton, Form, Spinner } from "react-bootstrap";
import OngoingCard from "components/ongoing-card.js";
import debounce from "lodash.debounce";
import networkMap from "../ethereum/network-contract-mapping";

import styles from "containers/styles/open-disputes.module.css";

//Case-insensitive substring match of the search query against the dispute ID, the title shown on the card and the court name.
//Non-standard disputes may carry non-string fields, so only strings are searched and anything else simply never matches.
export const disputeMatchesSearch = (query, dispute, title, courtName) => {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;

  return [String(dispute), title, courtName].some(value => typeof value === "string" && value.toLowerCase().includes(needle));
};

class OpenDisputes extends React.Component {
  constructor(props) {
    super(props);
    this.state = { openDisputeIDs: [], arbitratorDisputes: {}, loading: true, fetchFailed: false, statusFilter: 4, searchQuery: "" };
    if (networkMap[this.props.network].KLEROS_LIQUID) this.debouncedFetch = debounce(this.fetch, 0, { leading: false, trailing: true });
  }

  componentDidUpdate(prevProps) {
    const { subcourts, subcourtDetails, network } = this.props;

    if (prevProps.subcourts !== subcourts || prevProps.subcourtDetails !== subcourtDetails || prevProps.network !== network) {
      this.setState({
        loading: true,
        fetchFailed: false,
        openDisputeIDs: [],
        arbitratorDisputes: {},
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
    if (networkMap[this.props.network].KLEROS_LIQUID) this.fetch();
  }

  componentWillUnmount() {
    if (this.debouncedFetch) {
      this.debouncedFetch.cancel();
    }
    this.setState({ openDisputeIDs: [], arbitratorDisputes: {}, loading: true });
  }

  fetch = async () => {
    try {
      if (!networkMap[this.props.network]?.KLEROS_LIQUID) {
        this.setState({ loading: false });
        return;
      }

      const openDIDs = await this.props.getOpenDisputesOnCourtCallback();

      const sortedDisputes = [...openDIDs].sort((a, b) => parseInt(a, 10) - parseInt(b, 10)).reverse();
      this.setState({ openDisputeIDs: sortedDisputes });

      const detailPromises = sortedDisputes.map(async disputeId => {
        try {
          const arbitratorDisputeDetails = await this.props.getArbitratorDisputeCallback(disputeId);

          if (arbitratorDisputeDetails) {
            this.setState(prevState => ({
              arbitratorDisputes: {
                ...prevState.arbitratorDisputes,
                ["arbitrator" + disputeId]: arbitratorDisputeDetails,
              },
            }));

            const metaEvidence = await this.props.getMetaEvidenceCallback(arbitratorDisputeDetails.arbitrated, disputeId);

            this.setState(prevState => ({
              arbitratorDisputes: {
                ...prevState.arbitratorDisputes,
                [disputeId]: metaEvidence,
              },
            }));
          }
        } catch (error) {
          console.error(`Error fetching details for dispute ${disputeId}:`, error);
        }
      });

      await Promise.all(detailPromises);

      this.setState({ loading: false, fetchFailed: false });
    } catch (error) {
      if (error.code === "NETWORK_ERROR" && error.event === "changed") {
        console.warn("Network Error: Unable to fetch open disputes. Reloading the page.");
        window.location.reload();
      }

      console.error("Error fetching open disputes:", error);
      //Distinguish a failed fetch from an empty result so the UI doesn't claim there are no disputes.
      this.setState({ loading: false, fetchFailed: true });
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

  onFilterSelect = async filter => this.setState({ statusFilter: Number(filter) });

  onSearchChange = event => this.setState({ searchQuery: event.target.value });

  getDisputeTitle = dispute => this.state.arbitratorDisputes[dispute]?.title ?? "Meta Evidence Missing";

  getCourtName = details => this.props.subcourtDetails?.[details.subcourtID?.toString()]?.name;

  //The status filter and the search only narrow down the disputes already loaded; neither triggers a fetch.
  isDisputeVisible = dispute => {
    const { arbitratorDisputes, statusFilter, searchQuery } = this.state;
    const details = arbitratorDisputes[`arbitrator${dispute}`];
    if (!details) return false;

    const matchesStatus = Number(details.period) === statusFilter || statusFilter === 4;
    return matchesStatus && disputeMatchesSearch(searchQuery, dispute, this.getDisputeTitle(dispute), this.getCourtName(details));
  };

  getNoMatchHint = () => {
    const { statusFilter, searchQuery } = this.state;
    const scope = statusFilter === 4 ? "open disputes" : `disputes in the ${this.getFilterName(statusFilter)} period`;

    return `No dispute ID, title or court among the ${scope} contains "${searchQuery.trim()}".`;
  };

  render() {
    const { openDisputeIDs, statusFilter, loading, fetchFailed, searchQuery } = this.state;
    const { subcourts, subcourtDetails, network } = this.props;

    if (!networkMap[network].KLEROS_LIQUID) {
      return (
        <main className={styles.openDisputes}>
          <h1>There is no arbitrator on this network, thus no disputes.</h1>
        </main>
      );
    }

    const noSearchMatches = !loading && !fetchFailed && openDisputeIDs.length > 0 && searchQuery.trim() !== "" && !openDisputeIDs.some(this.isDisputeVisible);

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
          <Form.Control
            id="ongoing-search"
            className={styles.search}
            type="search"
            placeholder="Search by dispute ID, title or court"
            aria-label="Search disputes by ID, title or court"
            autoComplete="off"
            value={searchQuery}
            onChange={this.onSearchChange}
          />
        </Row>
        <Row style={{ margin: 0, padding: 0 }}>
          {this.state.loading && (
            <div style={{ margin: "auto", marginTop: "5vh" }}>
              <Spinner as="span" animation="grow" size="sm" role="status" aria-hidden="true" style={{ width: "5rem", height: "5rem" }} className="purple-inverted" />
            </div>
          )}
          {!loading &&
            openDisputeIDs.map((dispute) => {
              const details = this.state.arbitratorDisputes[`arbitrator${dispute}`];
              //Skip disputes for which we couldn't fetch the details
              if (!details) return null;
              const visible = this.isDisputeVisible(dispute);
              return (
                <Col
                  className={styles.card}
                  key={dispute}
                  xl={8}
                  lg={12}
                  md={12}
                  sm={24}
                  xs={24}
                  style={{ display: visible ? "block" : "none" }}
                >
                  <a style={{ display: "contents", textDecoration: "none", color: "unset" }} href={`/${network}/cases/${dispute}`}>
                    {visible && (
                      <OngoingCard
                        dispute={dispute}
                        arbitratorDisputeDetails={details}
                        title={this.getDisputeTitle(dispute)}
                        subcourtDetails={subcourtDetails}
                        subcourts={subcourts || []}
                      />
                    )}
                  </a>
                </Col>
              );
            })}
          {!loading && fetchFailed && (
            <Col style={{ textAlign: "center", marginTop: "5rem" }}>
              <h1>Failed to load disputes.</h1>
              <p>There may be a problem with the RPC endpoint. Please refresh the page to try again.</p>
            </Col>
          )}
          {!loading && !fetchFailed && openDisputeIDs.length === 0 && (
            <Col style={{ textAlign: "center", marginTop: "5rem" }}>
              <h1>There are no open disputes.</h1>
            </Col>
          )}
          {noSearchMatches && (
            <Col style={{ textAlign: "center", marginTop: "5rem" }}>
              <h1>No disputes match your search.</h1>
              <p>{this.getNoMatchHint()}</p>
            </Col>
          )}
        </Row>
      </main>
    );
  }
}

export default OpenDisputes;
