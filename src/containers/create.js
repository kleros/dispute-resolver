import React from "react";
import Summary from "../components/createSummary";
import CreateForm from "components/createForm";
import Toast from "components/toast";

import styles from "containers/styles/create.module.css";

class Create extends React.Component {
  constructor(props) {
    super(props);
    this.state = { activePage: 1, notificationShow: false };
  }

  componentDidUpdate(prevProps) {
    console.debug("CreateSummary componentDidUpdate", { prevProps, props: this.props });

    if (prevProps.network !== this.props.network) {
      this.setState({ activePage: 1, formData: undefined, lastDisputeID: undefined });
    }
  }

  onNextButtonClick = formData => {
    this.setState({ activePage: 2, formData });
  };

  onReturnButtonClick = event => {
    this.setState({ activePage: 1 });
  };


  setShow = () => this.setState({ notificationShow: false });

  notificationEventCallback = lastDisputeID => {
    this.setState({ notificationShow: true, lastDisputeID });

    //Redirect to the dispute page after a brief delay (so user sees toast)
    if (lastDisputeID) {
      setTimeout(() => {
        window.location.href = `/${this.props.network}/cases/${lastDisputeID}`;
      }, 2000);
    }
  };

  render() {
    const { lastDisputeID, activePage, formData, notificationShow } = this.state;

    const { subcourtDetails, subcourtsLoading, getArbitrationCostCallback, publishCallback, createDisputeCallback, network } = this.props;

    return (
      <main className={styles.create}>
        {activePage == 1 && (
          <CreateForm
            key={network}
            getArbitrationCostCallback={getArbitrationCostCallback}
            publishCallback={publishCallback}
            subcourtDetails={subcourtDetails}
            subcourtsLoading={subcourtsLoading}
            onNextButtonClickCallback={this.onNextButtonClick}
            formData={formData}
            network={network}
          />
        )}
        {activePage == 2 && (
          <Summary
            key={network}
            getArbitrationCostCallback={getArbitrationCostCallback}
            publishCallback={publishCallback}
            subcourtDetails={subcourtDetails}
            subcourtsLoading={subcourtsLoading}
            formData={formData}
            onReturnButtonClickCallback={this.onReturnButtonClick}
            createDisputeCallback={createDisputeCallback}
            notificationEventCallback={this.notificationEventCallback}
            network={network}
          />
        )}
        <Toast
          className={styles.toast}
          onClose={() => this.setShow()}
          show={notificationShow}
          delay={5000}
          autohide
          header="Transaction Confirmed"
          body={`You have successfully created dispute ${lastDisputeID}!`}
          iconName="Success"
          animation
        />
      </main>
    );
  }
}

export default Create;
