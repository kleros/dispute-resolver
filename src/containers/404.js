import { ReactComponent as Acropolis } from "../assets/images/acropolis.svg";
import PropTypes from "prop-types";
import React from "react";
import { Spinner } from "react-bootstrap";
import styled from "styled-components/macro";

const StyledDiv = styled.div`
  min-height: 100%;
`;
const StyledAcropolis = styled(Acropolis)`
  width: 100%;
  height: auto;
`;
const StyledInfoDiv = styled.div`
  text-align: center;

  @media (max-width: 500px) {
    margin: 80px 20px;
  }
`;
const Styled404Div = styled.div`
  font-size: 40px;
  font-weight: bold;
  margin-top: 40px;

  @media (max-width: 500px) {
    font-size: 30px;
    line-height: 40px;
  }
`;
const StyledMessageLine1 = styled.div`
  font-size: 28px;
  font-weight: bold;
`;
const StyledMessageLine2 = styled.div`
  font-size: 24px;
  margin-top: 30px;
`;
const StyledMessageLine3 = styled.div`
  font-size: 16px;
  margin-top: 25px;
`;
const _404 = ({ Web3 }) => (
  <StyledDiv Web3={Web3}>
    <StyledAcropolis />
    <StyledInfoDiv>
      <Styled404Div className="primary-color theme-color">{Web3 ? "Connecting Ethereum..." : "404"}</Styled404Div>
      <StyledMessageLine2 className="ternary-color theme-color">{Web3 ? "The gods are trying to locate your Web3 provider." : "Something went wrong in Athens!"}</StyledMessageLine2>
      {Web3 && <Spinner as="span" animation="grow" size="sm" role="status" aria-hidden="true" style={{ width: "5rem", height: "5rem" }} className="purple-inverted" />}
    </StyledInfoDiv>
  </StyledDiv>
);

_404.propTypes = {
  Web3: PropTypes.bool,
};

_404.defaultProps = {
  Web3: false,
};

export default _404;
