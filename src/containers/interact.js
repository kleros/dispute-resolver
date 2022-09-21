import React from "react";
import {  Col, Form, Row, InputGroup, FormControl } from "react-bootstrap";
import DisputeSummary from "components/disputeSummary";
import DisputeDetails from "components/disputeDetails";
import debounce from "lodash.debounce";
import { ReactComponent as Magnifier } from "../assets/images/magnifier.svg";

import { Redirect } from "react-router-dom";

import styles from "containers/styles/interact.module.css";

class Interact extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      arbitratorDisputeID: (this.props.route && this.props.route.match.params.id) || 700,
      fileInput: "",
      evidenceFileURI: "",
      metaevidence: "",
      evidences: [],
      modalShow: false,
      evidenceTitle: "",
      evidenceDescription: "",
      contributeModalShow: false,
      submitting: false,
      fetchingString: "",
      currentRuling: "",
      loading: true,
    };

    this.debouncedRetrieveUsingArbitratorID = debounce(this.retrieveDisputeDetailsUsingArbitratorID, 750, { leading: false, trailing: true });
  }

  componentDidMount() {
    if (this.state.arbitratorDisputeID) if (this.state.arbitratorDisputeID) this.debouncedRetrieveUsingArbitratorID.cancel();
    this.debouncedRetrieveUsingArbitratorID(this.state.arbitratorDisputeID);
  }

  componentDidUpdate(previousProperties) {
    if (this.props.disputeID !== previousProperties.disputeID) {
      this.setState({ arbitrableDisputeID: this.props.disputeID });
      this.reload();
    }
  }

  sumObjectsByKey(...objs) {
    return objs.reduce((a, b) => {
      for (let k in b) {
        if (b.hasOwnProperty(k)) a[k] = (a[k] || 0) + b[k];
      }
      return a;
    }, {});
  }

  submitEvidence = async (evidence) => {
    await this.props.submitEvidenceCallback(this.state.arbitrated, {
      disputeID: this.state.arbitrableDisputeID,
      evidenceDescription: evidence.evidenceDescription,
      evidenceDocument: evidence.evidenceDocument,
      evidenceTitle: evidence.evidenceTitle,
      supportingSide: evidence.supportingSide,
    });
    new Promise(() => setTimeout(2000)).then(this.reload());
  };

  onDrop = async (acceptedFiles) => {
    this.setState({ fileInput: acceptedFiles[0] });

    var reader = new FileReader();
    reader.readAsArrayBuffer(acceptedFiles[0]);
    reader.addEventListener("loadend", async () => {
      const buffer = Buffer.from(reader.result);

      const result = await this.props.publishCallback(acceptedFiles[0].name, buffer);

      await this.setState({
        primaryDocument: `/ipfs/${result[1].hash}${result[0].path}`,
      });
    });
  };

  appeal = async (party, contribution) =>  this.props.appealCallback(this.state.arbitrated, this.state.arbitrableDisputeID, party, contribution).then(this.reload);

  withdraw = async () => {
    console.debug([Object.keys(this.state.contributions).map((key) => parseInt(key))]);
    try {
      // function signature withdrawFeesAndRewardsForAllRounds(uint256 _localDisputeID, address payable _contributor, uint256 _ruling);
      this.props.withdrawCallback(this.state.arbitrated, this.state.arbitrableDisputeID, this.state.selectedContribution);
    } catch {
      // function signature withdrawFeesAndRewardsForAllRounds(uint256 _localDisputeID, address payable _contributor, uint256[] memory _contributedTo);
      this.props.withdrawCallback(this.state.arbitrated, this.state.arbitrableDisputeID, [this.state.selectedContribution]);
    }
  };
  
  onDisputeIDChange = async (e) => {
    const arbitratorDisputeID = e.target.value;
    await this.setState({ metaevidence: undefined });

    await this.setState({ arbitratorDisputeID: arbitratorDisputeID, loading: true });

    await this.setState({
      arbitrableDisputeID: null,
      arbitratorDispute: null,
    });
    await this.debouncedRetrieveUsingArbitratorID.cancel();
    await this.debouncedRetrieveUsingArbitratorID(arbitratorDisputeID);
  };

  getCurrentRuling = async (disputeIDOnArbitratorSide) => {
    try {
      return await this.props.getCurrentRulingCallback(disputeIDOnArbitratorSide);
    } catch (err) {
      console.error(err);
    }
  };

  getRuling = async (arbitrableAddress, disputeIDOnArbitratorSide) => {
    try {
      return await this.props.getRulingCallback(arbitrableAddress, disputeIDOnArbitratorSide);
    } catch (err) {
    }
  };

  retrieveDisputeDetailsUsingArbitratorID = async (arbitratorDisputeID) => {
    let arbitrated;

    try {
      arbitrated = (await this.props.getArbitratorDisputeCallback(arbitratorDisputeID)).arbitrated;
      this.setState({ arbitrated });
    } catch (e) {
      console.error(e);
      return;
    }

    await this.setState({ arbitrated });

    await this.commonFetchRoutine(arbitrated, arbitratorDisputeID);
    this.setState({ loading: false });
  };

  commonFetchRoutine = async (arbitrated, arbitratorDisputeID) => {
    // Optimize this function: too many awaits, you can parallelize some calls.

    let arbitratorDispute;
    let arbitratorDisputeDetails;
    let metaevidence;
    let arbitrableDisputeID;

    try {
      arbitrableDisputeID = await this.props.getArbitrableDisputeIDCallback(arbitrated, arbitratorDisputeID);
      this.setState({ arbitrableDisputeID });
    } catch {
      console.error("Failed to get arbitrable dispute id. Incompatible with IDisputeResolver.");
      this.setState({ incompatible: true });
    }
    
    try {
      arbitratorDispute = await this.props.getArbitratorDisputeCallback(arbitratorDisputeID);
      console.log("arbitratorDispute: %O", arbitratorDispute);
      
      arbitratorDisputeDetails = await this.props.getArbitratorDisputeDetailsCallback(arbitratorDisputeID); 
      arbitratorDisputeDetails.timesPerPeriod = await this.props.getTimesPerPeriodCallback(arbitratorDispute.subcourtID);
      console.log("arbitratorDisputeDetails: %O", arbitratorDisputeDetails);
      
      metaevidence = await this.props.getMetaEvidenceCallback(arbitrated, arbitratorDisputeID);
      console.log("metaevidence: %O, metaevidence.metaEvidenceJSON: %O", metaevidence, metaevidence.metaEvidenceJSON);
      
      this.setState({
        arbitratorDispute,
        arbitratorDisputeDetails,
        arbitratorDisputeID,
        metaevidence,
        ruling: await this.getRuling(arbitrated, arbitratorDisputeID),
        currentRuling: await this.getCurrentRuling(arbitratorDisputeID),
        disputeEvent: await this.props.getDisputeEventCallback(arbitrated, arbitratorDisputeID),
        getDisputeResult: await this.props.getDisputeCallback(arbitratorDisputeID),
      });
    } catch (err) {
      console.error(err.message);
    }

    try {
      this.setState({
        evidences: await this.props.getEvidencesCallback(arbitrated, arbitratorDisputeID),
      });
    } catch (err) {
      console.error(err.message);
    }

    let multipliers;

    try {
      multipliers = await this.props.getMultipliersCallback(arbitrated);

      await this.setState({
        multipliers,
      });
    } catch (err) {
      console.error(err.message);
    }

    let appealDecisions, contributions, totalWithdrawable, rulingFunded;
    try {
      appealDecisions = await this.props.getAppealDecisionCallback(arbitratorDisputeID);
      console.log("appealDecisions: %s", appealDecisions);

      contributions = await this.props.getContributionsCallback(arbitrableDisputeID, appealDecisions.length, arbitrated, arbitratorDispute.period);
      console.log("contributions: %s", contributions);

      rulingFunded = await this.props.getRulingFundedCallback(arbitrableDisputeID, appealDecisions.length, arbitrated);
      console.log("rulingFunded: %s", rulingFunded);

      await this.setState({ contributions, appealDecisions, rulingFunded });
    } catch (err) {
      console.error("incompatible contract");
      console.error(err);
      this.setState({ incompatible: true });
    }

    if (arbitratorDispute.period >= 3) {
      await this.setState({ appealCost: await this.props.getAppealCostCallback(arbitratorDisputeID) });
      await this.setState({ appealPeriod: await this.props.getAppealPeriodCallback(arbitratorDisputeID) });
    }

    if (arbitratorDispute.period == 4) {
      let contributionsOfPastRounds = [];
      for (let i = 0; i < appealDecisions.length; i++)
        contributionsOfPastRounds[i] = await this.props.getContributionsCallback(arbitrableDisputeID, i, arbitrated, arbitratorDispute.period);

      const aggregatedContributions = this.sumObjectsByKey(...contributionsOfPastRounds, contributions);

      try {
        totalWithdrawable = await this.props.getTotalWithdrawableAmountCallback(
          arbitrableDisputeID,
          Object.keys(aggregatedContributions).map((key) => key),
          arbitrated
        );
        await this.setState({ totalWithdrawable: totalWithdrawable.amount, aggregatedContributions, selectedContribution: totalWithdrawable.ruling });
      } catch (err) {
      }
    }
  };

  reload = async () => {
    const { arbitrated, arbitratorDisputeID, arbitrableDisputeID } = this.state;
    this.setState({
      arbitratorDispute: await this.props.getArbitratorDisputeCallback(arbitratorDisputeID),
      evidences: await this.props.getEvidencesCallback(arbitrated, arbitratorDisputeID),
      appealDecisions: await this.props.getAppealDecisionCallback(arbitratorDisputeID),
      arbitratorDisputeDetails: await this.props.getArbitratorDisputeDetailsCallback(arbitratorDisputeID),
    });

    const appealDecisions = await this.props.getAppealDecisionCallback(arbitratorDisputeID);

    await this.setState({
      appealDecisions,
      contributions: await this.props.getContributionsCallback(arbitrableDisputeID, appealDecisions.length, arbitrated, arbitratorDispute.period),
    });
  };

  render() {
    const {
      arbitrated,
      arbitratorDispute,
      arbitratorDisputeDetails,
      appealCost,
      appealPeriod,
      arbitratorDisputeID,
      metaevidence,
      multipliers,
      evidences,
      currentRuling,
      disputeEvent,
      appealDecisions,
      contributions,
      rulingFunded,
      incompatible,
      totalWithdrawable,
      loading,
    } = this.state;

    const {
      arbitratorAddress,
      activeAddress,
      publishCallback,
      getAppealPeriodCallback,
      subcourts,
      subcourtDetails,
      network,
      web3Provider,
    } = this.props;

    return (
      <>
        {Boolean(activeAddress) && incompatible && (
          <div style={{ padding: "1rem 2rem", fontSize: "14px", background: "#fafafa" }}>
            <b>View mode only:</b> To submit evidence or fund appeal, use the <a href="https://kleros-v2.netlify.app/">court v2 interface</a>.
          </div>
        )}
        {arbitrated && (
          <main className={styles.interact}>
            {arbitratorDisputeID && <Redirect to={`/cases/${arbitratorDisputeID}`} />}
            <div>
              <Row>
                <Col>
                  <Form.Label>
                    Search Disputes on <a href={`https://kleros-v2.netlify.app/cases/${arbitratorDisputeID}/overview`}>Court</a>
                  </Form.Label>
                  <InputGroup className={styles.search} size="md">
                    <InputGroup.Prepend>
                      <InputGroup.Text>
                        <Magnifier />
                      </InputGroup.Text>
                    </InputGroup.Prepend>
                    <FormControl
                      className="purple-inverted"
                      placeholder="Dispute ID"
                      aria-label="Input dispute number from Court"
                      aria-describedby="search"
                      onChange={this.onDisputeIDChange}
                      type="number"
                      min="0"
                      value={arbitratorDisputeID}
                      id="arbitratorDisputeID"
                    />
                  </InputGroup>
                </Col>
              </Row>
            </div>
            <DisputeSummary
              metaevidenceJSON={metaevidence}
              ipfsGateway="https://ipfs.kleros.io"
              arbitrated={arbitrated}
              arbitratorAddress={arbitratorAddress}
              arbitratorDisputeID={arbitratorDisputeID}
              arbitrableChainID={metaevidence?.arbitrableChainID ?? network}
              arbitratorChainID={metaevidence?.arbitratorChainID ?? network}
              chainID={network}
              web3Provider={web3Provider}
              loading={loading}
            />
            <DisputeDetails
              activeAddress={activeAddress}
              metaevidenceJSON={metaevidence}
              evidences={evidences}
              ipfsGateway="https://ipfs.kleros.io"
              arbitrated={arbitrated}
              arbitratorAddress={arbitratorAddress}
              arbitratorDisputeID={arbitratorDisputeID}
              arbitratorDispute={arbitratorDispute}
              arbitratorDisputeDetails={arbitratorDisputeDetails}
              subcourts={subcourts}
              subcourtDetails={subcourtDetails}
              incompatible={incompatible}
              currentRuling={currentRuling}
              disputeEvent={disputeEvent}
              publishCallback={publishCallback}
              submitEvidenceCallback={this.submitEvidence}
              getAppealPeriodCallback={getAppealPeriodCallback}
              appealCost={appealCost}
              appealPeriod={appealPeriod}
              appealDecisions={appealDecisions}
              appealCallback={this.appeal}
              contributions={contributions}
              rulingFunded={rulingFunded}
              multipliers={multipliers}
              withdrawCallback={this.withdraw}
              totalWithdrawable={totalWithdrawable}
            />
          </main>
        )}
      </>
    );
  }
}

export default Interact;
