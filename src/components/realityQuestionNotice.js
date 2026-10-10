import React from "react";
import PropTypes from "prop-types";
import AlertMessage from "components/alertMessage";

const NOTICES = {
  divergent: {
    type: "warning",
    title: "Other interfaces may show different answer options for this question",
    content:
      "The question recorded on-chain is displayed with different answer options by interfaces that render it with the reality.eth library, including the evidence display below. The options shown here were derived by the resolver from the on-chain question and its template: vote according to them.",
  },
  malformed: {
    type: "info",
    title: "The question parameters are malformed",
    content: "The answer options shown here were derived from the question template only. Read the question carefully before voting.",
  },
  unresolvable: {
    type: "error",
    title: "The answer options of this question could not be determined",
    content: "The question recorded on-chain is malformed. If in doubt, refuse to arbitrate.",
  },
  unverified: {
    type: "warning",
    title: "The answer options of this question could not be verified",
    content:
      "The resolver interface could not independently verify the answer options of this Reality.eth question. Read the question and the arbitrable application's data carefully before voting.",
  },
};

const noticeKey = (realityQuestion) => {
  if (!realityQuestion) return null;
  if (realityQuestion.status === "unresolvable" || realityQuestion.status === "unverified") return realityQuestion.status;
  if (realityQuestion.divergent) return "divergent";
  if (realityQuestion.status === "malformed") return "malformed";
  return null;
};

export default function RealityQuestionNotice({ realityQuestion }) {
  const key = noticeKey(realityQuestion);
  if (!key) return null;
  const { type, title, content } = NOTICES[key];
  return (
    <AlertMessage
      type={type}
      title={title}
      extraClass="mt-4"
      content={
        <>
          {content}
          {realityQuestion.title && (
            <p className="mt-2 mb-0" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              <strong>Question recorded on-chain: </strong>
              {realityQuestion.title}
            </p>
          )}
        </>
      }
    />
  );
}

RealityQuestionNotice.propTypes = {
  realityQuestion: PropTypes.shape({ status: PropTypes.string, divergent: PropTypes.bool, title: PropTypes.string }),
};

RealityQuestionNotice.defaultProps = { realityQuestion: undefined };
