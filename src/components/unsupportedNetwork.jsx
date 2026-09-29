import React from "react";
import PropTypes from "prop-types";
import { ReactComponent as ScalesSVG } from "../assets/images/scales.svg";
import networkMap from "../ethereum/network-contract-mapping";
import styles from "./styles/unsupportedNetwork.module.css";

export const UNSUPPORTED_NETWORK_TITLE = "Unsupported network";
const SWITCHER_POINTER = "Choose a supported network from the switcher in the header.";

/**
 * The one sentence every page shows for a chain it cannot serve: a chain outside the network map, or one in it without
 * a Kleros court. Named after the network map when the chain is known there.
 * @param {string | null | undefined} network Decimal chain id.
 * @returns {string}
 */
export const describeUnsupportedNetwork = network => {
  const name = network ? networkMap[network]?.NAME ?? `Chain ${network}` : "This chain";
  return `${name} is not supported. ${SWITCHER_POINTER}`;
};

//Shown instead of the pages when the chain is not in the network map. The way out is the chain switcher in the header,
//so this page makes no wallet call of its own.
const UnsupportedNetwork = ({ network }) => (
  <main className={styles.page}>
    <div className={styles.feedback} role="status">
      <ScalesSVG className={styles.icon} aria-hidden="true" />
      <h1>{UNSUPPORTED_NETWORK_TITLE}</h1>
      <p>{describeUnsupportedNetwork(network)}</p>
    </div>
  </main>
);

UnsupportedNetwork.propTypes = {
  network: PropTypes.string,
};

export default UnsupportedNetwork;
