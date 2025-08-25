import React from "react";
import styled from "styled-components";
import { Alert } from "antd";

const StyledAlert = styled(Alert)`
  text-align: center;

  .ant-alert-message {
    font-weight: bold;
  }
`;

const StyledP = styled.p`
  margin: 0;
`;

const storageKey = "@kleros/dispute-resolver/alert/smart-contract-wallet-warning";

export default class SmartContractWalletWarning extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      isSmartContractWallet: false,
      showWarning: this.getStoredWarningState()
    };
  }

  getStoredWarningState = () => {
    try {
      const storedValue = localStorage.getItem(storageKey);
      if (storedValue === null) return true;
      return JSON.parse(storedValue);
    } catch {
      return true;
    }
  };

  componentDidMount() {
    this.checkIfSmartWallet();
  }

  componentDidUpdate(prevProps) {
    if (prevProps.activeAddress !== this.props.activeAddress ||
      prevProps.web3Provider !== this.props.web3Provider) {
      this.checkIfSmartWallet();
    }
  }

  checkIfSmartWallet = async () => {
    const { activeAddress, web3Provider } = this.props;

    if (!activeAddress || !web3Provider) {
      this.setState({ isSmartContractWallet: false });
      return;
    }

    try {
      const code = await web3Provider.getCode(activeAddress);
      this.setState({ isSmartContractWallet: code !== "0x" });
    } catch (error) {
      this.setState({ isSmartContractWallet: false });
    }
  };

  handleClose = () => {
    this.setState({ showWarning: false });
    localStorage.setItem(storageKey, false);
  };

  render() {
    const { isSmartContractWallet, showWarning } = this.state;
    
    if (!showWarning || !isSmartContractWallet) {
      return null;
    }

    return (
      <StyledAlert
        message="Warning"
        description={
          <StyledP>
            You are using a smart contract wallet. This is not recommended.{" "}
            <a
              href="https://docs.kleros.io/kleros-faq#can-i-use-a-smart-contract-account-to-stake-in-the-court"
              target="_blank"
              rel="noopener noreferrer"
            >
              Learn more.
            </a>
          </StyledP>
        }
        type="warning"
        banner
        closable
        onClose={this.handleClose}
      />
    );
  }
}
