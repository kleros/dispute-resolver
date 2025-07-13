import React from "react";
import { Row, Col, Button } from "react-bootstrap";

import PropTypes from "prop-types";
import styles from "components/styles/evidenceTimeline.module.css";
import isImage from "is-image";
import isTextPath from "is-text-path";
import isVideo from "is-video";
import Blockies from "react-blockies";

import { ReactComponent as LinkSVG } from "../assets/images/link.svg";
import FileUploadDropzone from "./FileUploadDropzone";

class EvidenceTimeline extends React.Component {
  constructor(props) {
    super(props);


    this.state = {
      modalExtraClass: "closed",
      evidenceDescription: "",
      evidenceTitle: "",
      fileInput: "",
      awaitingConfirmation: false,
      support: 0,
      uploadingToIPFS: false,
    };
  }
  truncateAddress = address => `${address.substring(0, 6)}...${address.substring(address.length - 4, address.length)}`;

  handleModalOpenClose = e => {
    const { id } = e.target;
    this.setState({ modalExtraClass: id === "evidence-button" ? "" : "closed" });
  };

  handleControlChange = async event => {
    const { name, value } = event.target;
    this.setState({ [name]: value });
  };

  handleSubmitEvidenceButtonClick = async () => {
    const { evidenceDescription, evidenceDocument, evidenceTitle, support } = this.state;
    this.setState({
      awaitingConfirmation: true,
    });

    try {
      await this.props.submitEvidenceCallback({
        evidenceDescription,
        evidenceDocument,
        evidenceTitle,
        supportingSide: support,
      });

      this.setState({
        awaitingConfirmation: false,
        modalExtraClass: "closed",
        evidenceTitle: "",
        evidenceDescription: "",
        fileInput: "",
        support: 0,
      });
    } catch (err) {
      console.error("Error submitting evidence:", err);
      this.setState({
        awaitingConfirmation: false,
        modalExtraClass: "closed",
        uploadingToIPFS: false,
        uploadError: ""
      });
    }
  };

  handleDrop = async acceptedFiles => {
    this.setState({ uploadError: "", fileInput: null });

    // The backend cannot handle files larger than 4MB currently
    // https://docs.netlify.com/functions/overview/#default-deployment-options
    const maxSizeInBytes = 4 * 1024 * 1024;
    if (acceptedFiles[0].size > maxSizeInBytes) {
      this.setState({ uploadError: "File is too large. Maximum size is 4MB." });
      return;
    }

    const reader = new FileReader();
    reader.readAsArrayBuffer(acceptedFiles[0]);
    reader.addEventListener("loadend", async () => {
      try {
        this.setState({ uploadingToIPFS: true });
        const buffer = Buffer.from(reader.result);
        const result = await this.props.publishCallback(acceptedFiles[0].name, buffer);
        this.setState({
          evidenceDocument: result,
          fileInput: acceptedFiles[0],
          uploadingToIPFS: false
        })
      } catch (error) {
        console.error("Upload error:", error);
        this.setState({
          uploadError: "An error occurred while uploading the file. Please try again.",
          uploadingToIPFS: false,
        });
      }
    });

    reader.onerror = () => {
      this.setState({
        uploadError: "Failed to read the file. Please try again.",
        uploading: false,
      });
    };
  };

  getAttachmentIcon = uri => {
    const DEFAULT_FILL_COLOR = "#000";
    const THEME_FILL_CLASS = styles["theme-fill"];
    if (isImage(uri)) {
      return (
        <svg width="32" height="32" viewBox="0 0 29 39" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            className={THEME_FILL_CLASS}
            d="M27.9359 7.45703L21.5996 1.06621C20.9199 0.380664 19.9985 -0.0078125 19.0393 -0.0078125H3.6251C1.62374 -0.000195312 0 1.6375 0 3.65605V35.3436C0 37.3621 1.62374 38.9998 3.6251 38.9998H25.3757C27.3771 38.9998 29.0008 37.3621 29.0008 35.3436V10.0469C29.0008 9.07949 28.6157 8.14258 27.9359 7.45703ZM25.0812 9.74981H19.3339V3.95313L25.0812 9.74981ZM3.6251 35.3436V3.65605H15.7088V11.5779C15.7088 12.591 16.5169 13.4061 17.5213 13.4061H25.3757V35.3436H3.6251ZM6.04184 31.6873H22.959V21.9373L21.1842 20.1473C20.8292 19.7893 20.2553 19.7893 19.9003 20.1473L13.292 26.8123L10.3089 23.8035C9.95393 23.4455 9.37995 23.4455 9.025 23.8035L6.04184 26.8123V31.6873ZM9.66694 13.4061C7.66558 13.4061 6.04184 15.0438 6.04184 17.0623C6.04184 19.0809 7.66558 20.7186 9.66694 20.7186C11.6683 20.7186 13.292 19.0809 13.292 17.0623C13.292 15.0438 11.6683 13.4061 9.66694 13.4061Z"
            fill={DEFAULT_FILL_COLOR}
          />
        </svg>
      );
    } else if (isVideo(uri)) {
      return (
        <svg fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            className={THEME_FILL_CLASS}
            d="M20.9007 0.998047H2.9716C1.33038 0.998047 0 2.33471 0 3.98368V21.9974C0 23.6464 1.33038 24.983 2.9716 24.983H20.9007C22.5419 24.983 23.8723 23.6464 23.8723 21.9974V3.98368C23.8723 2.33471 22.5419 0.998047 20.9007 0.998047ZM32.6751 3.35282L25.8616 8.07487V17.9062L32.6751 22.622C33.9931 23.534 35.8084 22.6033 35.8084 21.0105V4.96432C35.8084 3.37781 33.9993 2.44089 32.6751 3.35282Z"
            fill={DEFAULT_FILL_COLOR}
          />
        </svg>
      );
    } else if (isTextPath(uri)) {
      return (
        <svg width="30" height="39" viewBox="0 0 30 39" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            className={THEME_FILL_CLASS}
            d="M22.1856 18.8906V21.0234C22.1856 21.5262 21.7696 21.9375 21.2612 21.9375H8.31961C7.81119 21.9375 7.39521 21.5262 7.39521 21.0234V18.8906C7.39521 18.3879 7.81119 17.9766 8.31961 17.9766H21.2612C21.7696 17.9766 22.1856 18.3879 22.1856 18.8906ZM21.2612 24.375H8.31961C7.81119 24.375 7.39521 24.7863 7.39521 25.2891V27.4219C7.39521 27.9246 7.81119 28.3359 8.31961 28.3359H21.2612C21.7696 28.3359 22.1856 27.9246 22.1856 27.4219V25.2891C22.1856 24.7863 21.7696 24.375 21.2612 24.375ZM29.5808 10.0471V35.3438C29.5808 37.3623 27.9246 39 25.8832 39H3.69761C1.65622 39 0 37.3623 0 35.3438V3.65625C0 1.6377 1.65622 0 3.69761 0H19.4201C20.3985 0 21.3383 0.388477 22.0316 1.07402L28.4947 7.46484C29.188 8.14277 29.5808 9.07969 29.5808 10.0471ZM19.7206 3.95332V9.75H25.5828L19.7206 3.95332ZM25.8832 35.3438V13.4062H17.8718C16.8472 13.4062 16.023 12.5912 16.023 11.5781V3.65625H3.69761V35.3438H25.8832Z"
            fill={DEFAULT_FILL_COLOR}
          />
        </svg>
      );
    } else if (uri) return <LinkSVG />;
    else return null;
  };



  renderSubmitButton() {
    const { disputePeriod, evidenceSubmissionEnabled } = this.props;
    
    if (parseInt(disputePeriod, 10) >= 0 && parseInt(disputePeriod, 10) < 4) {
      return (
        <Button id="evidence-button" onClick={this.handleModalOpenClose} className="mb-4" disabled={!evidenceSubmissionEnabled}>
          {evidenceSubmissionEnabled ? "Submit New Evidence" : "Go to Arbitrable Application to Submit Evidence"}
        </Button>
      );
    }
    return null;
  }

  sortEvidenceByDate = (a, b) => {
    if (a.submittedAt > b.submittedAt || a.appealedAt > b.submittedAt || a.appealedAt > b.appealedAt || a.submittedAt > b.appealedAt) {
      return -1;
    } else if (a.submittedAt < b.submittedAt || a.appealedAt < b.submittedAt || a.appealedAt < b.appealedAt || a.submittedAt < b.appealedAt) {
      return 1;
    } else {
      return 0;
    }
  };

  renderAppealEvent = evidenceOrEvent => (
    <React.Fragment key={`appeal-${evidenceOrEvent.appealedAt}`}>
      <div className={styles["divider"]}></div>
      <div className={styles["event"]}>
        <p>Appealed</p>
        <small>{new Date(evidenceOrEvent.appealedAt * 1000).toUTCString()}</small>
      </div>
    </React.Fragment>
  );

  renderEvidenceItem = evidenceOrEvent => {
    const { ipfsGateway } = this.props;
    
    return (
      <React.Fragment key={`evidence-${evidenceOrEvent.transactionHash || evidenceOrEvent.blockNumber}`}>
        <div className={styles.evidence}>
          <div className={styles["header"]}>
            <p>{evidenceOrEvent.evidenceJSON.title || evidenceOrEvent.evidenceJSON.name}</p>
          </div>
          <p>{evidenceOrEvent.evidenceJSON.description}</p>
          <div className={styles.footer}>
            <Blockies seed={evidenceOrEvent.submittedBy} color="#7bcbff" spotColor="white" bgColor="#1e075f;" size={8} scale={3} className="rounded-circle" />
            <div className={styles["temp"]}>
              <div className={styles["sender"]}>Submitted by: {this.truncateAddress(evidenceOrEvent.submittedBy)}</div>
              <div className={styles["timestamp"]}>{new Date(evidenceOrEvent.submittedAt * 1000).toUTCString()}</div>
            </div>
            <a href={`${ipfsGateway}${evidenceOrEvent.evidenceJSON.fileURI}`} target="_blank" rel="noopener noreferrer">
              {this.getAttachmentIcon(evidenceOrEvent.evidenceJSON.fileURI)}
            </a>
          </div>
        </div>
        <div className={styles["divider"]}></div>
      </React.Fragment>
    );
  };

  renderEvidenceTimeline() {
    const { evidences, appealDecisions } = this.props;
    
    if (!evidences) return null;
    
    return evidences
      .filter(e => e.evidenceJSONValid)
      .concat(appealDecisions)
      .sort(this.sortEvidenceByDate)
      .map(evidenceOrEvent => {
        if (evidenceOrEvent.appealedAt) {
          return this.renderAppealEvent(evidenceOrEvent);
        } else if (evidenceOrEvent.evidenceJSON) {
          return this.renderEvidenceItem(evidenceOrEvent);
        } else {
          return null;
        }
      });
  }

  renderDisputeStatus() {
    const { evidences, dispute } = this.props;
    
    if (evidences && evidences.length > 0) {
      return (
        <div className={styles["event"]}>
          <p>Dispute Raised</p>
          {dispute && <small>{new Date(dispute.createdAt * 1000).toUTCString()}</small>}
        </div>
      );
    }
    
    if (evidences && evidences.length === 0) {
      return <div className={styles.noEvidence}>No evidence submitted yet.</div>;
    }
    
    return null;
  }

  renderModal() {
    const { evidenceDescription, evidenceTitle, awaitingConfirmation, uploadingToIPFS } = this.state;
    
    return (
      <>
        <button className={`${styles["modal-overlay"]} ${styles[this.state.modalExtraClass]}`} id="modal-overlay" onClick={this.handleModalOpenClose} onKeyDown={this.handleModalKeyDown} tabIndex="0" aria-label="Close modal"></button>
        <div className={styles.modalContainer}>
          <div className={`${styles.modal} ${styles[this.state.modalExtraClass]}`} id="modal">
            <div className={styles["modal-header"]}>
              <h1>Submit Evidence</h1>
            </div>
            <div className={styles["modal-guts"]}>
              <div className={styles.evidenceTitle}>
                <label htmlFor="evidence-title">Evidence Title</label>
                <input name="evidenceTitle" id="evidence-title" type="text" onChange={this.handleControlChange} value={evidenceTitle}></input>
              </div>
              <div className={styles.evidenceDescription}>
                <label htmlFor="evidence-description">Evidence Description</label>
                <textarea name="evidenceDescription" id="evidence-description" type="textarea" rows="5" onChange={this.handleControlChange} value={evidenceDescription}></textarea>
              </div>

              <FileUploadDropzone
                onDrop={this.handleDrop}
                uploadError={this.state.uploadError}
                uploadingToIPFS={this.state.uploadingToIPFS}
                fileInput={this.state.fileInput}
              />

              <Row className={`no-gutters mt-3 text-center text-md-right  ${styles.buttons}`}>
                <Col>
                  <Button type="button" variant="secondary" className={`mb-3 mb-sm-0 ${styles.return}`} onClick={this.handleModalOpenClose}>
                    Return
                  </Button>
                </Col>
                <Col md="auto" xs={24} sm={12}>
                  <Button type="button" variant="primary" onClick={this.handleSubmitEvidenceButtonClick} disabled={awaitingConfirmation || uploadingToIPFS}>
                    {(awaitingConfirmation && "Awaiting Confirmation") || "Submit"}
                  </Button>
                </Col>
              </Row>
            </div>
          </div>
        </div>
      </>
    );
  }

  handleModalKeyDown = e => {
    if (e.key === 'Enter' || e.key === ' ') {
      this.handleModalOpenClose(e);
    }
  };

  render() {
    return (
      <div id="evidence-timeline" className={styles.evidenceTimeline}>
        <div className={styles["content-inner"]}>
          {this.renderSubmitButton()}
          {this.renderEvidenceTimeline()}
          {this.renderDisputeStatus()}
        </div>
        {this.renderModal()}
      </div>
    );
  }
}

EvidenceTimeline.propTypes = {
  dispute: PropTypes.object, // Dispute Event
  disputePeriod: PropTypes.number.isRequired,
  ipfsGateway: PropTypes.string.isRequired,
  evidences: PropTypes.array,
  publishCallback: PropTypes.func,
  submitEvidenceCallback: PropTypes.func,
  evidenceSubmissionEnabled: PropTypes.bool,
  appealDecisions: PropTypes.array,
};

EvidenceTimeline.defaultProps = {
  publishCallback: async e => {
    console.error(e);
    await new Promise(r => setTimeout(r, 4000));
    return [{ hash: "" }, { path: "" }];
  },
  submitEvidenceCallback: async () => {
    await new Promise(r => setTimeout(r, 4000));
  },
  evidenceSubmissionEnabled: true,
  appealDecisions: [],
};

export default EvidenceTimeline;