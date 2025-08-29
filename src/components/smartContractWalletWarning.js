import React from "react";
import styled from "styled-components";
import { Alert } from "antd";
import PropTypes from "prop-types";

const StyledAlert = styled(Alert)`
  text-align: center;

  .ant-alert-message {
    font-weight: bold;
  }
`;

const StyledP = styled.p`
  margin: 0;
`;

const STORAGE_KEY = "@kleros/dispute-resolver/alert/smart-contract-wallet-warning";
const EIP7702_PREFIX = "0xef0100";

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
      const storedValue = localStorage.getItem(`${STORAGE_KEY}:${this.props.activeAddress}`);
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
      this.setState({ showWarning: this.getStoredWarningState() });
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
      const formattedCode = code.toLowerCase();
      const isEip7702Eoa = formattedCode.startsWith(EIP7702_PREFIX);

      //Do not show warning for EIP-7702 EOAs 
      this.setState({ isSmartContractWallet: code !== "0x" && !isEip7702Eoa });
    } catch (error) {
      console.error("Error getting code at wallet address", error);
      this.setState({ isSmartContractWallet: false });
    }
  };

  handleClose = () => {
    this.setState({ showWarning: false });
    localStorage.setItem(`${STORAGE_KEY}:${this.props.activeAddress}`, false);
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

SmartContractWalletWarning.propTypes = {
  activeAddress: PropTypes.string.isRequired,
  web3Provider: PropTypes.object.isRequired,
};
