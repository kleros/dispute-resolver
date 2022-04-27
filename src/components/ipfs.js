import { Accordion, Card, Col, Container, Form } from "react-bootstrap";
import IPFSLogo from "assets/images/ipfs.svg";
import React from "react";

class IPFS extends React.Component {
  constructor(properties) {
    super(properties);
    this.state = {
      initialNumberOfJurors: "",
      category: "",
      title: "",
      description: "",
      question: "",
      uploadedDocumentURI: "",
      firstRulingOption: "",
      firstRulingDescription: "",
      secondRulingOption: "",
      secondRulingDescription: "",
      fileInput: "",
      modalShow: false,
      showToast: false,
      selectedSubcourt: "",
      subcourts: [],
      subcourtsLoading: true,
    };
  }

  onInput = (e) => {
    this.setState({ uploadedDocumentURI: "" });
    this.setState({ fileInput: e.target.files[0] });
  };

  onSubmitButtonClick = async (e) => {
    e.preventDefault();
    const { fileInput } = this.state;

    

    var reader = new FileReader();
    reader.readAsArrayBuffer(fileInput);
    reader.addEventListener("loadend", async () => {
      const buffer = Buffer.from(reader.result);
      const result = await this.props.publishCallback(fileInput.name, buffer);
      this.setState({ uploadedDocumentURI: `/ipfs/${result[0].hash}` });
    });
  };

  render() {
    const { uploadedDocumentURI, fileInput } = this.state;

    return (
      <Container fluid="true">
        <Accordion>
          <Card style={{ borderRadius: "12px" }}>
            <Accordion.Toggle as={Card.Header} eventKey="0">
              <img alt="ipfs logo" src={IPFSLogo} />
              Upload to IPFS
            </Accordion.Toggle>
            <hr className="mt-0" />
            <Accordion.Collapse eventKey="0">
              <Card.Body>
                <Form>
                  <Form.Row>
                    <Col>
                      <div className="input-group mb-3">
                        <div className="custom-file">
                          <input className="custom-file-input" id="inputGroupFile04" onInput={this.onInput} type="file" />
                          <label className={`text-left custom-file-label  ${uploadedDocumentURI ? "text-success" : "text-muted"}`} htmlFor="inputGroupFile04">
                            {(fileInput && fileInput.name) || "Select a document"}
                          </label>
                        </div>
                        <div className="input-group-append">
                          <button className="btn btn-primary" onClick={this.onSubmitButtonClick} type="button">
                            Upload
                          </button>
                        </div>
                      </div>
                    </Col>
                  </Form.Row>
                </Form>
                {uploadedDocumentURI && (
                  <a href={`https://ipfs.kleros.io${uploadedDocumentURI}`} target="_blank" rel="noopener noreferrer">
                    {" "}
                    {`https://ipfs.kleros.io${uploadedDocumentURI}`}
                  </a>
                )}
              </Card.Body>
            </Accordion.Collapse>
          </Card>
        </Accordion>
      </Container>
    );
  }
}

export default IPFS;
