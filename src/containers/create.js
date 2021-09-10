import React from "react";
import Summary from "../components/createSummary";
import CreateForm from "components/createForm";
import Toast from "components/toast";

import styles from "containers/styles/create.module.css";

import { Container, Col, Row, Button, Form, Card, Dropdown, InputGroup } from "react-bootstrap";

import { Redirect } from "react-router-dom";

import IPFS from "../components/ipfs";

class Create extends React.Component {
  constructor(props) {
    super(props);
    this.state = { activePage: 1, notificationShow: false };
  }

  componentDidMount = async (e) => {};

  onNextButtonClick = (formData) => {
    console.debug(formData);
    this.setState({ activePage: 2, formData });
  };

  onReturnButtonClick = (event) => {
    this.setState({ activePage: 1 });
  };

  onControlChange = async (e) => {
    await this.setState({ [e.target.id]: e.target.value });
  };

  setShow = () => this.setState({ notificationShow: false });

  notificationEventCallback = (lastDisputeID) => {
    this.setState({ notificationShow: true, lastDisputeID });
  };

  render() {
    console.debug(this.props);
    console.debug(this.state);

    const { lastDisputeID, activePage, formData, notificationShow } = this.state;

    const { activeAddress, subcourtDetails, subcourtsLoading, getArbitrationCostCallback, publishCallback, createDisputeCallback, network } = this.props;

    return (
      <main className={styles.create}>
        {activePage == 1 && (
          <CreateForm getArbitrationCostCallback={getArbitrationCostCallback} publishCallback={publishCallback} subcourtDetails={subcourtDetails} subcourtsLoading={subcourtsLoading} onNextButtonClickCallback={this.onNextButtonClick} formData={formData} network={network} />
        )}
        {activePage == 2 && (
          <Summary
            getArbitrationCostCallback={getArbitrationCostCallback}
            publishCallback={publishCallback}
            subcourtDetails={subcourtDetails}
            subcourtsLoading={subcourtsLoading}
            formData={formData}
            onReturnButtonClickCallback={this.onReturnButtonClick}
            createDisputeCallback={createDisputeCallback}
            notificationEventCallback={this.notificationEventCallback}
          />
        )}
        <Toast className={styles.toast} onClose={() => this.setShow()} show={notificationShow} delay={5000} autohide header="Transaction Confirmed" body={`You have successfully created dispute ${lastDisputeID}!`} iconName="Success" animation />
      </main>
    );
  }
}

export default Create;
