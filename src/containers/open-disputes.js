import React from "react";
import { Dropdown, DropdownButton, Form, Spinner } from "react-bootstrap";
import OngoingCard, { getDisputeTitle, getCourtName } from "components/ongoing-card.js";
import { ReactComponent as SearchIcon } from "assets/images/magnifier.svg";
import { ReactComponent as ScalesSVG } from "assets/images/scales.svg";
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
    this.fetchVersion = 0;
    if (networkMap[this.props.network]?.KLEROS_LIQUID) this.debouncedFetch = debounce(this.fetch, 0, { leading: false, trailing: true });
  }

  //Only a network change needs a fresh list. The subcourts are enumerated by the app after this page mounts and can arrive
  //after the first load; they only feed the court names and countdowns, so the list already shown just re-renders with them.
  componentDidUpdate(prevProps) {
    const { network } = this.props;

    if (prevProps.network !== network) {
      this.fetchVersion++;
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
    this.fetch();
  }

  componentWillUnmount() {
    if (this.debouncedFetch) {
      this.debouncedFetch.cancel();
    }
    this.fetchVersion++;
  }

  fetch = async () => {
    const version = ++this.fetchVersion;
    const { network, getOpenDisputesOnCourtCallback, getArbitratorDisputeCallback, getMetaEvidenceCallback } = this.props;
    this.setState({ loading: true, fetchFailed: false });

    try {
      if (!networkMap[network]?.KLEROS_LIQUID) {
        this.setState({ loading: false });
        return;
      }

      const openDIDs = await getOpenDisputesOnCourtCallback();
      const sortedDisputes = [...openDIDs].sort((a, b) => parseInt(a, 10) - parseInt(b, 10)).reverse();
      const arbitratorDisputes = {};

      await Promise.all(sortedDisputes.map(async disputeId => {
        try {
          const details = await getArbitratorDisputeCallback(disputeId);
          arbitratorDisputes[`arbitrator${disputeId}`] = details;
          if (details) arbitratorDisputes[disputeId] = await getMetaEvidenceCallback(details.arbitrated, disputeId);
        } catch (error) {
          console.error(`Error fetching details for dispute ${disputeId}:`, error);
        }
      }));

      //Ignore an old request after changing networks, retrying or leaving the page.
      if (version === this.fetchVersion) this.setState({ openDisputeIDs: sortedDisputes, arbitratorDisputes, loading: false, fetchFailed: false });
    } catch (error) {
      if (version !== this.fetchVersion) return;
      if (error?.code === "NETWORK_ERROR" && error.event === "changed") {
        console.warn("Network Error: Unable to fetch open disputes. Reloading the page.");
        window.location.reload();
      }

      console.error("Error fetching open disputes:", error);
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

  onFilterSelect = filter => this.setState({ statusFilter: Number(filter) });

  onSearchChange = event => this.setState({ searchQuery: event.target.value });

  clearFilters = () => this.setState({ statusFilter: 4, searchQuery: "" });

  getDisputeTitle = dispute => getDisputeTitle(this.state.arbitratorDisputes[dispute]?.title);

  getCourtName = details => getCourtName(details, this.props.subcourtDetails);

  //The status filter and the search only narrow down the disputes already loaded; neither triggers a fetch.
  isDisputeVisible = dispute => {
    const { arbitratorDisputes, statusFilter, searchQuery } = this.state;
    const details = arbitratorDisputes[`arbitrator${dispute}`];
    const matchesStatus = Number(details?.period?.toString()) === statusFilter || statusFilter === 4;
    return matchesStatus && disputeMatchesSearch(searchQuery, dispute, this.getDisputeTitle(dispute), this.getCourtName(details));
  };

  getNoMatchHint = () => {
    const { statusFilter, searchQuery } = this.state;
    const scope = statusFilter === 4 ? "open disputes" : `disputes in the ${this.getFilterName(statusFilter)} period`;

    return `No dispute ID, title or court among the ${scope} contains "${searchQuery.trim()}".`;
  };

  renderMessage = (title, description, action, actionLabel) => (
    <div className={styles.feedback}>
      <ScalesSVG className={styles.feedbackIcon} aria-hidden="true" />
      <h2>{title}</h2>
      {description && <p>{description}</p>}
      {action && <button type="button" className={styles.action} onClick={action}>{actionLabel}</button>}
    </div>
  );

  render() {
    const { openDisputeIDs, arbitratorDisputes, statusFilter, loading, fetchFailed, searchQuery } = this.state;
    const { subcourts, subcourtDetails, network } = this.props;

    if (!networkMap[network]?.KLEROS_LIQUID) {
      return (
        <main className={styles.openDisputes}>
          {this.renderMessage("There is no arbitrator on this network, thus no disputes.")}
        </main>
      );
    }

    const visibleDisputes = openDisputeIDs.filter(this.isDisputeVisible);
    const noVisibleDisputes = !loading && !fetchFailed && openDisputeIDs.length > 0 && visibleDisputes.length === 0;
    const noSearchMatches = noVisibleDisputes && searchQuery.trim() !== "";
    const noStatusMatches = noVisibleDisputes && statusFilter !== 4 && searchQuery.trim() === "";
    const hasFilters = statusFilter !== 4 || searchQuery !== "";

    return (
      <main className={styles.openDisputes} id="ongoing-disputes">
        <div className={styles.content}>
          <div className={styles.pageHeading}>
            <p className={styles.eyebrow}>Arbitration overview</p>
            <h1>Ongoing Disputes</h1>
            <p>Explore active cases and follow each stage of arbitration.</p>
          </div>
          <div className={styles.toolbar}>
            <div className={styles.searchField}>
              <label htmlFor="ongoing-search">Search disputes</label>
              <div className={styles.searchControl}>
                <SearchIcon aria-hidden="true" />
                <Form.Control
                  id="ongoing-search"
                  className={styles.search}
                  type="search"
                  placeholder="Dispute ID, title or court"
                  aria-label="Search disputes by ID, title or court"
                  autoComplete="off"
                  value={searchQuery}
                  onChange={this.onSearchChange}
                />
              </div>
            </div>
            <div className={styles.statusField}>
              <span id="ongoing-status-label" className={styles.controlLabel}>Status</span>
              <DropdownButton
                id="dropdown-basic-button"
                title={this.getFilterName(statusFilter)}
                aria-labelledby="ongoing-status-label dropdown-basic-button"
                className={`${styles.filter} ${this.getStatusClass(statusFilter)}`}
                onSelect={this.onFilterSelect}
              >
                {this.FILTER_NAMES.map((name, index) => (
                  <Dropdown.Item key={name} eventKey={index} active={statusFilter === index} className={this.getStatusClass(index)}>
                    {name}
                  </Dropdown.Item>
                ))}
              </DropdownButton>
            </div>
          </div>
          {!loading && !fetchFailed && (
            <div className={styles.resultsBar}>
              <p aria-live="polite" aria-atomic="true">
                <strong>{visibleDisputes.length}</strong>{hasFilters ? ` of ${openDisputeIDs.length}` : ""} {openDisputeIDs.length === 1 ? "dispute" : "disputes"}
              </p>
              <div className={styles.resultsActions}>
                {hasFilters && <button type="button" className={styles.clearFilters} onClick={this.clearFilters}>Clear filters</button>}
              </div>
            </div>
          )}
          <div aria-busy={loading}>
            {loading && (
              <div className={styles.feedback} role="status">
                <Spinner as="span" animation="border" aria-hidden="true" className={styles.spinner} />
                <h2>Loading disputes…</h2>
                <p>Fetching cases and their details.</p>
              </div>
            )}
            {!loading && !fetchFailed && visibleDisputes.length > 0 && (
              <div className={styles.grid}>
                {visibleDisputes.map(dispute => (
                  <a className={styles.cardLink} key={dispute} href={`/${network}/cases/${dispute}`} aria-label={`View dispute #${dispute}: ${this.getDisputeTitle(dispute)}`}>
                    <OngoingCard
                      dispute={dispute}
                      arbitratorDisputeDetails={arbitratorDisputes[`arbitrator${dispute}`]}
                      title={arbitratorDisputes[dispute]?.title}
                      subcourtDetails={subcourtDetails}
                      subcourts={subcourts || []}
                    />
                  </a>
                ))}
              </div>
            )}
            {!loading && fetchFailed && (
              <div role="alert">
                {this.renderMessage("Failed to load disputes.", "There may be a problem with the RPC endpoint. Please refresh the page or try again.", this.fetch, "Try again")}
              </div>
            )}
            {!loading && !fetchFailed && openDisputeIDs.length === 0 && this.renderMessage("There are no open disputes.", "New cases will appear here when they are available.")}
            {noStatusMatches && this.renderMessage(`No disputes in the ${this.getFilterName(statusFilter)} period.`, "Choose another status to explore the available cases.", this.clearFilters, "Clear filters")}
            {noSearchMatches && this.renderMessage("No disputes match your search.", this.getNoMatchHint(), this.clearFilters, "Clear filters")}
          </div>
        </div>
      </main>
    );
  }
}

export default OpenDisputes;
