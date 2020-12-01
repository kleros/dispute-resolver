import React from "react";
import Summary from "../components/summary";
import CreateForm from "components/createForm";

import styles from "containers/styles/create.module.css";

import { Container, Col, Row, Button, Form, Card, Dropdown, InputGroup } from "react-bootstrap";

import { Redirect } from "react-router-dom";

import IPFS from "../components/ipfs";

import { Cascader } from "antd";

class Create extends React.Component {
  constructor(props) {
    super(props);
    this.state = { activePage: 1 };
  }

  componentDidMount = async (e) => {};

  onNextButtonClick = (event) => {
    this.setState({ activePage: 2 });
  };

  onReturnButtonClick = (event) => {
    this.setState({ activePage: 1 });
  };

  onControlChange = async (e) => {
    await this.setState({ [e.target.id]: e.target.value });
  };

  render() {
    console.debug(this.props);
    console.debug(this.state);

    const { lastDisputeID, activePage } = this.state;

    const { activeAddress, subcourtDetails, subcourtsLoading, getArbitrationCostCallback, publishCallback } = this.props;

    return (
      <main className={styles.create}>
        {lastDisputeID && <Redirect to={`/cases/${lastDisputeID}`} />}
        {activePage == 1 && <CreateForm getArbitrationCostCallback={getArbitrationCostCallback} publishCallback={publishCallback} subcourtDetails={subcourtDetails} subcourtsLoading={subcourtsLoading} onNextButtonClickCallback={this.onNextButtonClick} />}
        {activePage == 2 && <Summary getArbitrationCostCallback={getArbitrationCostCallback} publishCallback={publishCallback} subcourtDetails={subcourtDetails} subcourtsLoading={subcourtsLoading} onReturnButtonClickCallback={this.onReturnButtonClick} />}
      </main>
    );
  }
}

export default Create;
