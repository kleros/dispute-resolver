import { ReactComponent as Acropolis } from "../assets/images/acropolis.svg";
import PropTypes from "prop-types";
import React from "react";
import { Spinner } from "react-bootstrap";
import styles from "./styles/404.module.css";

const _404 = ({ Web3 }) => (
  <div className={styles.styledDiv} Web3={Web3}>
    <Acropolis className={styles.styledAcropolis} />
    <div className={styles.styledInfoDiv}>
      <div className={`${styles.styled404Div} primary-color theme-color`}>
        {Web3 ? "Connecting Ethereum..." : "404"}
      </div>
      <div className={`${styles.styledMessageLine2} ternary-color theme-color`}>
        {Web3 ? "The gods are trying to locate your Web3 provider." : "Something went wrong in Athens!"}
      </div>
      {Web3 && (
        <Spinner
          as="span"
          animation="grow"
          size="sm"
          role="status"
          aria-hidden="true"
          style={{ width: "5rem", height: "5rem" }}
          className="purple-inverted"
        />
      )}
    </div>
  </div>
);

_404.propTypes = {
  Web3: PropTypes.bool,
};

_404.defaultProps = {
  Web3: false,
};

export default _404;