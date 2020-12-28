import { Card, Row, Col, Form, Container } from "react-bootstrap";
import React from "react";
import { ReactComponent as AttachmentSVG } from "../assets/images/attachment.svg";
import { ReactComponent as success } from "../assets/images/success.svg";
import { ReactComponent as error } from "../assets/images/error.svg";
import { ReactComponent as info } from "../assets/images/info.svg";
import { ReactComponent as warning } from "../assets/images/warning.svg";

import styles from "components/styles/alertMessage.module.css";

const icons = {
  success,
  error,
  info,
  warning,
};

class AlertMessage extends React.Component {
  render() {
    const { type, content, title, extraClass } = this.props;
    return (
      <div className={`${styles.alertMessage} ${styles[type]} ${extraClass}`}>
        <div className={styles.leftColumn}>{React.createElement(icons[type], {})}</div>
        <div className={styles.rightColumn}>
          <div className={`${!title && "text-capitalize"} ${styles.title}`}>{title || type}</div>
          <span>{content}</span>
        </div>
      </div>
    );
  }
}

export default AlertMessage;
