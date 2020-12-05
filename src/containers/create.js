import React from "react";
import Summary from "../components/summary";
import CreateForm from "components/createForm";

import styles from "containers/styles/create.module.css";

import { Container, Col, Row, Button, Form, Card, Dropdown, InputGroup, Toast } from "react-bootstrap";

import { Redirect } from "react-router-dom";

import IPFS from "../components/ipfs";

import { Cascader } from "antd";

class Create extends React.Component {
  constructor(props) {
    super(props);
    this.state = { activePage: 1 };
  }

  componentDidMount = async (e) => {};

  onNextButtonClick = (formData) => {
    console.log(formData);
    this.setState({ activePage: 2, formData });
  };

  onReturnButtonClick = (event) => {
    this.setState({ activePage: 1 });
  };

  onControlChange = async (e) => {
    await this.setState({ [e.target.id]: e.target.value });
  };

  setShow = () => this.setState({ show: false });

  render() {
    console.debug(this.props);
    console.debug(this.state);

    const { lastDisputeID, activePage, formData } = this.state;

    const { activeAddress, subcourtDetails, subcourtsLoading, getArbitrationCostCallback, publishCallback, createDisputeCallback } = this.props;

    return (
      <main className={styles.create}>
        {lastDisputeID && <Redirect to={`/cases/${lastDisputeID}`} />}
        {activePage == 1 && <CreateForm getArbitrationCostCallback={getArbitrationCostCallback} publishCallback={publishCallback} subcourtDetails={subcourtDetails} subcourtsLoading={subcourtsLoading} onNextButtonClickCallback={this.onNextButtonClick} formData={formData} />}
        {activePage == 2 && (
          <Summary
            getArbitrationCostCallback={getArbitrationCostCallback}
            publishCallback={publishCallback}
            subcourtDetails={subcourtDetails}
            subcourtsLoading={subcourtsLoading}
            formData={formData}
            onReturnButtonClickCallback={this.onReturnButtonClick}
            createDisputeCallback={createDisputeCallback}
          />
        )}

        <Toast className={styles.toast} onClose={() => this.setShow()} show={true} delay={3000} autohide>
          <Toast.Header>
            <img src="holder.js/20x20?text=%20" className="rounded mr-2" alt="" />
            <strong className="mr-auto">Bootstrap</strong>
            <small>11 mins ago</small>
          </Toast.Header>
          <Toast.Body>Woohoo, you're reading this text in a Toast!</Toast.Body>
        </Toast>
      </main>
    );
  }
}

export default Create;
