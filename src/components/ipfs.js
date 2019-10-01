import React from 'react'
import ReactMarkdown from 'react-markdown'
import TopBanner from '../components/top-banner'

import {
  Container,
  Row,
  Col,
  Button,
  Form,
  Spinner,
  Card,
  Modal,
  Toast,
  Dropdown,
  ButtonGroup,
  Accordion
} from 'react-bootstrap'

class IPFS extends React.Component {
  constructor(props) {
    super(props)
    this.state = {
      initialNumberOfJurors: '',
      category: '',
      title: '',
      description: '',
      question: '',
      uploadedDocumentURI: '',
      firstRulingOption: '',
      firstRulingDescription: '',
      secondRulingOption: '',
      secondRulingDescription: '',
      fileInput: '',
      modalShow: false,
      awaitingConfirmation: false,
      showToast: false,
      lastDisputeID: '',
      primaryDocument: '',
      selectedSubcourt: '',
      subcourts: [],
      subcourtsLoading: true
    }
  }

  onInput = e => {
    this.setState({ uploadedDocumentURI: '' })
    this.setState({ fileInput: e.target.files[0] })
  }

  onSubmitButtonClick = async e => {
    e.preventDefault()
    const { fileInput } = this.state

    console.log(this.props.publishCallback)

    var reader = new FileReader()
    reader.readAsArrayBuffer(fileInput)
    reader.addEventListener('loadend', async () => {
      const buffer = Buffer.from(reader.result)
      const result = await this.props.publishCallback(fileInput.name, buffer)
      this.setState({ uploadedDocumentURI: '/ipfs/' + result[0].hash })
    })
  }

  render() {
    const {
      uploadedDocumentURI,
      fileInput,
      awaitingConfirmation,
      lastDisputeID,
      primaryDocument
    } = this.state

    return (
      <Container fluid="true">
        <Accordion>
          <Card>
            <Accordion.Toggle as={Card.Header} eventKey="0">
              <img
                src="ipfs-logo-vector-inkscape-template.svg"
                alt="ipfs logo"
              />{' '}
              Upload to IPFS
            </Accordion.Toggle>
            <hr />
            <Accordion.Collapse eventKey="0">
              <Card.Body>
                <Form>
                  <Form.Row>
                    <Col>
                      <div className="input-group mb-3">
                        <div className="custom-file">
                          <input
                            type="file"
                            className="custom-file-input"
                            id="inputGroupFile04"
                            onInput={this.onInput}
                          />
                          <label
                            className={
                              `text-left custom-file-label  ` +
                              (uploadedDocumentURI
                                ? 'text-success'
                                : 'text-muted')
                            }
                            htmlFor="inputGroupFile04"
                          >
                            {(fileInput && fileInput.name) ||
                              'Select a document'}
                          </label>
                        </div>
                        <div className="input-group-append">
                          <button
                            className="btn btn-primary"
                            type="button"
                            onClick={this.onSubmitButtonClick}
                          >
                            Upload
                          </button>
                        </div>
                      </div>
                    </Col>
                  </Form.Row>
                </Form>
                {uploadedDocumentURI && (
                  <a href={'https://ipfs.kleros.io' + uploadedDocumentURI}>
                    {' '}
                    {'https://ipfs.kleros.io' + uploadedDocumentURI}
                  </a>
                )}
              </Card.Body>
            </Accordion.Collapse>
          </Card>
        </Accordion>
      </Container>
    )
  }
}

export default IPFS
