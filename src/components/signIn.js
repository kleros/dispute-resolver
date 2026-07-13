import React, { useState } from "react";
import PropTypes from "prop-types";
import { Button, Spinner } from "react-bootstrap";

const SignIn = ({ onSignIn, isSigningIn, message = "Sign in with Ethereum to upload files." }) => {
  const [error, setError] = useState("");

  const handleClick = async () => {
    setError("");
    try {
      await onSignIn();
    } catch (e) {
      console.error("Sign-in error:", e);
      setError("Sign-in failed. Please try again.");
    }
  };

  return (
    <div className="mb-3">
      <div className="mb-2 text-muted small">{message}</div>
      <Button variant="outline-primary" disabled={isSigningIn} onClick={handleClick}>
        {isSigningIn
          ? <Spinner as="span" animation="grow" size="xs" role="status" aria-hidden="true" className="purple-inverted" />
          : "Sign in"
        }
      </Button>
      {error && <div><small className="text-danger">{error}</small></div>}
    </div>
  );
};

SignIn.propTypes = {
  onSignIn: PropTypes.func.isRequired,
  isSigningIn: PropTypes.bool.isRequired,
  message: PropTypes.string,
};

export default SignIn;
