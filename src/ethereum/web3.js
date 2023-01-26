import {createAlchemyWeb3} from "@alch/alchemy-web3"
import Web3 from "web3";

let web3;

const loadWeb3 = async () => {
  if (window.ethereum) {
    window.web3 = new Web3(window.ethereum);
    try {
      // Request account access if needed
      await window.ethereum.request({ method: "eth_requestAccounts" });
      web3 = new Web3(window.ethereum);
      // Acccounts now exposed
    } catch (_) {
      // User denied account access...
    }
  }
}

if (document.readyState === "complete") { 
  // DOM loading is already complete
  loadWeb3();
} else {
  window.addEventListener("load", async () => {
    // Modern dapp browsers...
    await loadWeb3();
  });
}

if (typeof window !== "undefined" && typeof window.web3 !== "undefined") {
  web3 = new Web3(window.ethereum);
} else if (process.env.REACT_APP_WEB3_PROVIDER_URL) {
  // Fallback provider.
  console.info("Using fallback provider");
  web3 = new createAlchemyWeb3(process.env.REACT_APP_WEB3_PROVIDER_URL, {retryJitter: 2000, retryInterval: 2000});
}

export default web3;