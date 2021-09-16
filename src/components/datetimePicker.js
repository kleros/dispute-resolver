import { Navbar, Nav } from "react-bootstrap";
import React from "react";
import { ReactComponent as Brand } from "../assets/images/logo-dispute-resolver-white.svg";
import { NavLink, Link } from "react-router-dom";
import { LinkContainer } from "react-router-bootstrap";
import { DatePicker, Space } from "antd";
const { RangePicker } = DatePicker;
import moment from "moment";

import styles from "./styles/datetimePicker.module.css";

class DatetimePicker extends React.Component {
  constructor(props) {
    super(props);
  }
  render() {
    const { onChange, onOk, id } = this.props;
    console.log(this.props);
    return <DatePicker style={{ width: "100%" }} showTime={{ defaultValue: moment("00:00:00", "HH:mm:ss") }} onChange={onChange} onOk={onOk} id={id} />;
  }
}

export default DatetimePicker;
