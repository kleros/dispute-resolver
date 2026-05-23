import React, { useState } from "react";
import { Button, Spinner } from "react-bootstrap";

const SignIn = ({ onSignIn, isSigningIn }) => {
  const [error, setError] = useState("");

  const handleClick = async () => {
    setError("");
    try {
      await onSignIn();
    } catch (e) {
      setError(e?.message || "Sign-in failed. Please try again.");
    }
  };

  return (
    <div className="mb-3">
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

export default SignIn;
