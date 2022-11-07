import React from "react";
import { DatePicker } from "antd";
import moment from "moment";

import styles from "./styles/datetimePicker.module.css";

class DatetimePicker extends React.Component {
  constructor(props) {
    super(props);
  }
  render() {
    const { onChange, onOk, id } = this.props;
    
    return <DatePicker  className={styles.datetimePicker} showTime={{ defaultValue: moment("00:00:00", "HH:mm:ss") }} onChange={onChange} onOk={onOk} id={id} />;
  }
}

export default DatetimePicker;
