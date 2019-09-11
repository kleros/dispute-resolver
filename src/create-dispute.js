import React from 'react'
import Container from 'react-bootstrap/Container'
import Jumbotron from 'react-bootstrap/Jumbotron'
import Button from 'react-bootstrap/Button'
import Form from 'react-bootstrap/Form'
import Row from 'react-bootstrap/Row'
import Col from 'react-bootstrap/Col'
import Card from 'react-bootstrap/Card'
import InputGroup from 'react-bootstrap/InputGroup'

import networkMap from './ethereum/network-contract-mapping'
import generateMetaEvidence from './ethereum/generate-meta-evidence'
import ipfsPublish from './ipfs-publish'

class CreateDispute extends React.Component {
  constructor(props) {
    super(props)
    this.state = {
      arbitrator: networkMap[this.props.network].KLEROS_LIQUID,
      subcourtID: '',
      initialNumberOfJurors: '',
      metaevidenceURI: '',
      category: '',
      title: '',
      description: '',
      question: '',
      primaryFileURI: '',
      firstRulingOption: '',
      firstRulingDescription: '',
      secondRulingOption: '',
      secondRulingDescription: '',
      fileInput: ''
    }

    this.encoder = new TextEncoder()
  }

  componentDidUpdate(prevProps) {
    if (this.props.network !== prevProps.network) {
      this.setState({
        arbitrator: networkMap[this.props.network].KLEROS_LIQUID
      })
    }
  }

  generateArbitratorExtraData = (subcourtID, initialNumberOfJurors) =>
    '0x' +
    subcourtID.padStart(16, '0') +
    initialNumberOfJurors.padStart(16, '0')

  onControlChange = e => this.setState({ [e.target.id]: e.target.value })

  onInput = e => {
    console.log(e.target.files)
    this.setState({ primaryFileURI: '' })
    this.setState({ fileInput: e.target.files[0] })
    console.log('file input')
  }

  onSubmitButtonClick = async e => {
    e.preventDefault()
    const { fileInput } = this.state
    console.log('submit clicked')
    console.log(fileInput)

    var reader = new FileReader()
    reader.readAsArrayBuffer(fileInput)
    reader.addEventListener('loadend', async () => {
      const buffer = Buffer.from(reader.result)
      const result = await this.props.publishPrimaryDocumentCallback(
        fileInput.name,
        buffer
      )
      this.setState({ primaryFileURI: '/ipfs/' + result[0].hash })
    })
  }

  onCreateDisputeButtonClick = async e => {
    e.preventDefault()
    const {
      arbitrator,
      subcourtID,
      initialNumberOfJurors,
      category,
      title,
      description,
      question,
      primaryFileURI,
      firstRulingOption,
      secondRulingOption,
      firstRulingDescription,
      secondRulingDescription
    } = this.state

    const arbitratorExtraData = this.generateArbitratorExtraData(
      subcourtID,
      initialNumberOfJurors
    )

    const metaevidence = generateMetaEvidence({
      category,
      title,
      description,
      question,
      firstRulingOption,
      secondRulingOption,
      firstRulingDescription,
      secondRulingDescription,
      fileURI: primaryFileURI
    })

    const ipfsHashMetaEvidenceObj = await ipfsPublish(
      'metaEvidence.json',
      this.encoder.encode(JSON.stringify(metaevidence))
    )

    const metaevidenceURI =
      '/ipfs/' +
      ipfsHashMetaEvidenceObj[1]['hash'] +
      ipfsHashMetaEvidenceObj[0]['path']

    console.log(metaevidence)

    let arbitrationCost = await this.props.arbitrationCostCallback(
      arbitrator,
      arbitratorExtraData
    )

    await this.props.createDisputeCallback(
      arbitrationCost,
      arbitrator,
      arbitratorExtraData,
      metaevidenceURI
    )
  }

  render() {
    console.debug(this.props)
    console.debug(this.state)

    const {
      subcourtID,
      initialNumberOfJurors,
      metaevidenceURI,
      category,
      title,
      description,
      question,
      rulingOptions,
      primaryFileURI,
      firstRulingOption,
      secondRulingOption,
      firstRulingDescription,
      secondRulingDescription,
      fileInput
    } = this.state

    return (
      <Container>
        <Card>
          <Card.Body>
            <Card.Title>Create Dispute</Card.Title>
            <Form>
              <Form.Row>
                <Col>
                  <Form.Group>
                    <Form.Control
                      id="subcourtID"
                      as="input"
                      value={subcourtID}
                      onChange={this.onControlChange}
                      placeholder={'Subcourt identifier'}
                    />
                  </Form.Group>
                </Col>
                <Col>
                  <Form.Group>
                    <Form.Control
                      id="initialNumberOfJurors"
                      as="input"
                      value={initialNumberOfJurors}
                      onChange={this.onControlChange}
                      placeholder={'Initial number of jurors'}
                    />
                  </Form.Group>
                </Col>{' '}
              </Form.Row>
              <Form.Row>
                <Col>
                  <Form.Group controlId="category">
                    <Form.Control
                      as="input"
                      value={category}
                      onChange={this.onControlChange}
                      placeholder={'Dispute category'}
                    />
                  </Form.Group>
                </Col>
                <Col>
                  <Form.Group controlId="title">
                    <Form.Control
                      as="input"
                      value={title}
                      onChange={this.onControlChange}
                      placeholder={'title'}
                    />
                  </Form.Group>
                </Col>
              </Form.Row>
              <Form.Row>
                <Col>
                  <Form.Group controlId="description">
                    <Form.Control
                      as="textarea"
                      rows="3"
                      value={description}
                      onChange={this.onControlChange}
                      placeholder={'description'}
                    />
                  </Form.Group>
                </Col>
              </Form.Row>
              <Form.Row>
                <Col>
                  <Form.Group controlId="question">
                    <Form.Control
                      as="input"
                      rows="1"
                      value={question}
                      onChange={this.onControlChange}
                      placeholder={'question'}
                    />
                  </Form.Group>
                </Col>
              </Form.Row>
              <Form.Row>
                <Col>
                  <Form.Group>
                    <Form.Control
                      id="firstRulingOption"
                      as="input"
                      value={firstRulingOption}
                      onChange={this.onControlChange}
                      placeholder={'firstRulingOption'}
                    />
                  </Form.Group>
                </Col>
                <Col>
                  <Form.Group>
                    <Form.Control
                      id="firstRulingDescription"
                      as="input"
                      value={firstRulingDescription}
                      onChange={this.onControlChange}
                      placeholder={'firstRulingDescription'}
                    />
                  </Form.Group>
                </Col>{' '}
              </Form.Row>
              <Form.Row>
                <Col>
                  <Form.Group>
                    <Form.Control
                      id="secondRulingOption"
                      as="input"
                      value={secondRulingOption}
                      onChange={this.onControlChange}
                      placeholder={'secondRulingOption'}
                    />
                  </Form.Group>
                </Col>
                <Col>
                  <Form.Group>
                    <Form.Control
                      id="secondRulingDescription"
                      as="input"
                      value={secondRulingDescription}
                      onChange={this.onControlChange}
                      placeholder={'secondRulingDescription'}
                    />
                  </Form.Group>
                </Col>{' '}
              </Form.Row>
              <Form.Row>
                <Col>
                  <div className="input-group mb-3">
                    {primaryFileURI && (
                      <div className="input-group-prepend">
                        <label
                          className={
                            'pr-2 pt-2 mb-0' +
                            (primaryFileURI ? ' text-success' : '')
                          }
                        >
                          <a
                            className={primaryFileURI ? ' text-success' : ''}
                            href={
                              primaryFileURI &&
                              'https://ipfs.kleros.io' + primaryFileURI
                            }
                          >
                            {fileInput && fileInput.name}
                          </a>
                        </label>
                      </div>
                    )}
                    <div className="custom-file">
                      <input
                        type="file"
                        className="custom-file-input"
                        id="inputGroupFile04"
                        onInput={this.onInput}
                      />
                      <label
                        className="text-left custom-file-label"
                        htmlFor="inputGroupFile04"
                      >
                        {(fileInput && fileInput.name) ||
                          'Choose Primary Document'}
                      </label>
                    </div>
                    <div className="input-group-append">
                      <button
                        className="btn btn-primary"
                        type="button"
                        onClick={this.onSubmitButtonClick}
                      >
                        Submit
                      </button>
                    </div>
                  </div>
                </Col>
              </Form.Row>

              <Button
                variant="primary"
                type="button"
                onClick={this.onCreateDisputeButtonClick}
                block
              >
                Create Dispute
              </Button>
            </Form>
          </Card.Body>
        </Card>
      </Container>
    )
  }
}

export default CreateDispute
