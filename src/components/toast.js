import React from "react";
import { Row, Col, Toast as ToastBootstrap } from "react-bootstrap";

import { ReactComponent as Success } from "../assets/images/iconCheckCircle.svg";
import { ReactComponent as Failure } from "../assets/images/iconXCircle.svg";
import { ReactComponent as Pending } from "../assets/images/iconPendingCircle.svg";

import styles from "components/styles/toast.module.css";

const icons = {
  Success,
  Failure,
  Pending,
};

class Toast extends React.Component {
  constructor(props) {
    super(props);
  }

  render() {
    const { body, header, show, onClose, delay, iconName } = this.props;
    return (
      <ToastBootstrap className={styles.toast} onClose={onClose} show={show} delay={delay} autohide>
        <div className={styles.row}>
          <div xs="auto" className={styles.toastLeftColumn}>
            {React.createElement(icons[iconName], {})}
          </div>
          <div className={styles.toastRightColumn}>
            <ToastBootstrap.Header>
              <strong className="mr-auto">{header}</strong>
            </ToastBootstrap.Header>
            <ToastBootstrap.Body>{body}</ToastBootstrap.Body>
          </div>
        </div>
      </ToastBootstrap>
    );
  }
}

export default Toast;
