import React from "react";
import PropTypes from "prop-types";
import CreateForm from "components/createForm";
import CreateSummary from "components/createSummary";
import networkMap from "../ethereum/network-contract-mapping";
import { ReactComponent as ScalesSVG } from "../assets/images/scales.svg";

import styles from "containers/styles/create.module.css";

const STEPS = ["Details", "Review"];
//The case of a new dispute opens after a short pause, so the confirmation is seen first.
const OPEN_CASE_DELAY_MS = 2000;

const stepState = (step, activePage) => {
  if (step === activePage) return "current";
  return step < activePage ? "done" : "upcoming";
};

class Create extends React.Component {
  constructor(props) {
    super(props);
    this.state = { activePage: 1, formData: undefined };
  }

  componentDidUpdate(prevProps) {
    if (prevProps.network !== this.props.network) this.setState({ activePage: 1, formData: undefined });
  }

  componentWillUnmount() {
    clearTimeout(this.openCaseTimer);
  }

  onNextButtonClick = formData => {
    this.setState({ activePage: 2, formData });
    window.scrollTo(0, 0);
  };

  onReturnButtonClick = () => {
    this.setState({ activePage: 1 });
    window.scrollTo(0, 0);
  };

  //Same destination as before: the case page of the new dispute, through the router when the page has one.
  onDisputeCreated = disputeID => {
    const { network, route } = this.props;
    const url = `/${network}/cases/${disputeID}`;

    clearTimeout(this.openCaseTimer);
    this.openCaseTimer = setTimeout(() => {
      if (route?.history) route.history.push(url);
      else window.location.href = url;
    }, OPEN_CASE_DELAY_MS);
  };

  renderSteps = () => {
    const { activePage } = this.state;

    return (
      <ol className={styles.steps} aria-label="Steps">
        {STEPS.map((label, index) => {
          const step = index + 1;
          return (
            <li key={label} className={`${styles.step} ${styles[stepState(step, activePage)]}`} aria-current={step === activePage ? "step" : undefined}>
              <span className={styles.stepNumber} aria-hidden="true">{step}</span>
              <span>{label}</span>
            </li>
          );
        })}
      </ol>
    );
  };

  renderNoArbitrable = () => (
    <div className={styles.feedback}>
      <ScalesSVG className={styles.feedbackIcon} aria-hidden="true" />
      <h2>There is no arbitrable contract deployed on this network, so a dispute cannot be created here.</h2>
      <p>
        Request it on the{" "}
        <a href="https://github.com/kleros/dispute-resolver/issues" target="_blank" rel="noopener noreferrer">
          GitHub issues
        </a>{" "}
        of Dispute Resolver.
      </p>
    </div>
  );

  render() {
    const { activePage, formData } = this.state;
    const { subcourtDetails, subcourtsLoading, getArbitrationCostCallback, publishCallback, createDisputeCallback, network, isAuthenticated, isSigningIn, onSignIn } = this.props;
    const canCreate = Boolean(networkMap[network]?.ARBITRABLE_PROXY);

    return (
      <main className={styles.createPage}>
        <div className={styles.content}>
          <div className={styles.pageHeading}>
            <h1>Create a custom dispute</h1>
            <p>
              {activePage === 1
                ? "Choose a court, describe the case and define the ruling options. Everything is reviewed before the dispute is created."
                : "Check what will be submitted. Creating the dispute publishes these details to IPFS and pays the arbitration cost to the court."}
            </p>
          </div>
          {!canCreate && this.renderNoArbitrable()}
          {canCreate && this.renderSteps()}
          {canCreate && activePage === 1 && (
            <CreateForm
              key={network}
              getArbitrationCostCallback={getArbitrationCostCallback}
              publishCallback={publishCallback}
              subcourtDetails={subcourtDetails}
              subcourtsLoading={subcourtsLoading}
              onNextButtonClickCallback={this.onNextButtonClick}
              formData={formData}
              network={network}
              isAuthenticated={isAuthenticated}
              isSigningIn={isSigningIn}
              onSignIn={onSignIn}
            />
          )}
          {canCreate && activePage === 2 && (
            <CreateSummary
              key={network}
              formData={formData}
              network={network}
              onReturnButtonClickCallback={this.onReturnButtonClick}
              createDisputeCallback={createDisputeCallback}
              onDisputeCreated={this.onDisputeCreated}
              isAuthenticated={isAuthenticated}
              isSigningIn={isSigningIn}
              onSignIn={onSignIn}
            />
          )}
        </div>
      </main>
    );
  }
}

Create.propTypes = {
  route: PropTypes.object,
  subcourtDetails: PropTypes.array,
  subcourtsLoading: PropTypes.bool,
  getArbitrationCostCallback: PropTypes.func,
  publishCallback: PropTypes.func,
  createDisputeCallback: PropTypes.func,
  network: PropTypes.string,
  isAuthenticated: PropTypes.bool.isRequired,
  isSigningIn: PropTypes.bool.isRequired,
  onSignIn: PropTypes.func.isRequired,
};

export default Create;
