import {  Col } from "react-bootstrap";
import React from "react";
import { ReactComponent as Etherscan } from "../assets/images/etherscan.svg";

import networkMap from "../ethereum/network-contract-mapping";


import styles from "./styles/footer.module.css";

class UnsupportedNetwork extends React.Component {
  constructor(props) {
    super(props);
  }
  render() {
    const {  network } = this.props;

    return (
      <section>
        UNSUPPORTED NETWORK
      </section>
    );
  }
}

export default UnsupportedNetwork;
