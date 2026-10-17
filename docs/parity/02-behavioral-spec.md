# Behavioral specification of the current Dispute Resolver (master @ 7cb11e8)

- **Scope.** This document describes what the current Dispute Resolver (`src/` at master 7cb11e8) does today, screen by screen, and describes no other application.
- **Tags.** `[Q<n>]` flags one of the 13 numbered quirks, `[quirk]` flags any other oddity, and `[W<n>]` flags a verified security weakness (W1 global script-message handler, W2 dot segments after the CID, W3 no wallet-chain check before signing, W4 unvalidated chain IDs embedded in script HTML, W5 same-origin for allowlisted scripts; in `03-security-checklist.md` they are rows W1→B1, W2→B2, W3→B3, W4→B5, W5→B4); a tag marks the behavior and never changes it.
- **Q numbering.** Q1 broken relative redirect, Q2 10,000-block contribution window, Q3 missing "Appealed" markers, Q4 extra appeal cards for variable types, Q5 concurrent dynamic scripts cross-resolving, Q6 connect prompt at load, Q7 silent transaction failures, Q8 Create form resets and limits, Q9 `/cases` without an ID, Q10 hard-coded "ETH" labels, Q11 dead props and unrendered reads, Q12 case-sensitive Escrow V1 matching, Q13 meta-evidence cache without TTL.
- **References.** Every "(today: …)" reference points to the current source, with paths relative to the repository root and line numbers at master 7cb11e8.
- **Changes.** Intended differences live in `05-deviations-ledger.md` and design decisions live in `docs/adr/`; neither is described here.

---

## 1. Routes and navigation

### 1.1 Top-level render branches

`App.render` chooses one of three branches (today: `src/app.js:1348-1374`; react-router-dom 5.3.4, history 4.10.1).

| Condition | Rendered |
|---|---|
| `state.network === ""` (before provider initialization finishes, or forever if it throws, see 8.2 [Q6]) | The plain text `Please enable a web3 provider.` (today: `src/app.js:1373`) |
| `state.network` is not a key of the network map | Every path renders Header, `UnsupportedNetwork` and Footer inside a path-less `<Route>` (today: `src/app.js:1349-1356, 1241-1247`) |
| `state.network` is a supported chain | The route table in 1.2 |

### 1.2 Route table

| Path | Behavior | Renders |
|---|---|---|
| `/`, `/:chainId`, `/:chainId/disputes` (exact) | ``<Redirect to={`${network}/ongoing`}>``; the target has no leading slash, so it resolves relative to the current path [Q1] (today: `src/app.js:1249, 1364`) | — |
| `/:chainId/ongoing` (exact) | | Header, `OpenDisputes`, Footer (today: `src/app.js:1251-1267`) |
| `/:chainId/create` (exact) | | Header, `Create`, Footer (today: `src/app.js:1269-1288`) |
| `/:chainId/interact/:id` (prefix match) | `<Redirect>` to `/:chainId/cases/:id`; this legacy alias works (today: `src/app.js:1367`) | — |
| `/:chainId/cases/:id?` (exact, ID optional) | | Header, `Interact`, Footer (today: `src/app.js:1290-1338`) |
| anything else | | Header, `NotFound` (404), Footer (today: `src/app.js:1340-1346`) |

The relative redirect resolves as follows with history 4.10.1 `createLocation`:
- `/` goes to `/{network}/ongoing`.
- `/1` goes to `/1/ongoing`.
- `/1/` and `/1/disputes` go to `/1/1/ongoing`, which renders the 404 page, so the `/:chainId/disputes` legacy alias does not work [Q1].

Exact routes also match the same path with a trailing slash, so the header links `/{chainId}/ongoing/` and `/{chainId}/create/` reach their pages.

### 1.3 Chain ID in the URL

- The app reads the URL chain once, at mount, as `window.location.pathname.split('/')[1]` (today: `src/app.js:87-94`).
- When that segment is non-empty and differs from the chain chosen by provider initialization (the wallet chain, or `"1"` without a wallet), the app rebuilds the read provider for the URL chain with `initiateWeb3Provider(urlChainId)` (today: `src/app.js:92`).
- In the same case the app requests `wallet_switchEthereumChain` to the URL chain and only logs a failure (today: `src/app.js:93, 188-199`).
- The app treats any first path segment as a chain ID, so chain-less legacy paths such as `/ongoing`, `/create` or `/cases/5` set `network` to `"ongoing"`, `"create"` or `"cases"` and render "Unsupported Network ongoing" (or the matching segment) [Q1].
- The only chain-less path that works is `/`.
- After mount, data fetching uses `state.network`, never the `:chainId` route parameter.
- The Header builds its links from `route.match.params.chainId` (today: `src/components/header.js:12`).
- On the Unsupported Network and 404 screens that parameter is `undefined`, so the header links point to `/undefined`, `/undefined/ongoing/`, `/undefined/create/` and `/undefined/cases/` [quirk].
- On a wallet chain change, `syncUrlWithChain` replaces the first path segment with the new chain when that segment is all digits, and otherwise inserts the chain as a new first segment (today: `src/app.js:147-160`).
- `syncUrlWithChain` writes the URL with `window.history.replaceState`, which bypasses the router, so route parameters keep their old values.

### 1.4 How navigation happens

- The header brand is a plain anchor to `/{chainId}`, so it performs a full page load (today: `src/components/header.js:18`).
- The header links "Ongoing Disputes", "Create" and "Interact" are `LinkContainer`s, so they navigate inside the router (today: `src/components/header.js:24-34`).
- Each Ongoing card is a plain `<a href="/{network}/cases/{id}">`, so opening a case performs a full page load (today: `src/containers/open-disputes.js:170`).
- The "View Ongoing Disputes" button on the not-found screen sets `window.location.href`, a full page load (today: `src/containers/interact.js:405`).
- A successful dispute creation sets `window.location.href` to the new case after 2 seconds (today: `src/containers/create.js:34-43`).
- The case search box rewrites the URL through a rendered `<Redirect>` (a history replace) on every change (today: `src/containers/interact.js:551`).

### 1.5 Hosting and static leftovers

- `netlify.toml` has the single-page fallback `/* -> /index.html` with status 200.
- `public/index.html` sets the title "Dispute Resolver", uses `dapp_logo_with_padding.png` as the favicon and links `manifest.json`.
- `public/create/` and `public/interact/` each hold one file, `ipfs-logo-vector-inkscape-template.svg`, byte-identical to `public/ipfs-logo-vector-inkscape-template.svg`.
- Nothing in `src/` or `public/index.html` references those two copies; they are dead static assets left from 2019 routes, not route fallbacks.

---

## 2. Application shell

### 2.1 Structure

- `src/index.js` mounts `App` with `ReactDOM.render`, on React 17, without `StrictMode` (today: `src/index.js`).
- No component defines an error boundary (`componentDidCatch` appears nowhere), so any exception thrown during render unmounts the whole app and leaves a blank page.
- `App` (`src/app.js`) is a class component that owns the shared state: `activeAddress`, `network`, `provider` (read RPC), `walletProvider`, `signer`, `archon`, `subcourts`, `subcourtDetails`, `subcourtsLoading`, `isSigningIn` and `lastDisputeID` (today: `src/app.js:68-78`).
- Every data and transaction function lives on `App` and reaches the containers (`OpenDisputes`, `Create`, `Interact`, all class components) as `*Callback` props.
- Reads go through an ethers v6 `JsonRpcProvider` on the chain's configured RPC; the wallet is used only for signing (today: `src/app.js:162-186`).
- Event history comes from two places: `@kleros/archon` 2.4.0 (web3 1.x `getPastEvents`) and direct ethers `queryFilter` calls.
- `App.state.lastDisputeID` is never set to a non-empty value, so the branch of `Interact.componentDidUpdate` that reacts to it never runs (today: `src/containers/interact.js:51-54`).

### 2.2 Boot sequence

1. `componentDidMount` awaits `initiateWeb3Provider()` (8.2).
2. It applies the URL chain rule of 1.3.
3. With `window.ethereum` present, it sets `activeAddress` from `window.ethereum.selectedAddress` and subscribes to `accountsChanged` and `chainChanged` (8.3).
4. Without `window.ethereum`, it logs "MetaMask not detected :(" and continues.
5. When the chain has `KLEROS_LIQUID`, it starts `loadSubcourtData` without awaiting it (today: `src/app.js:115-117`).

`loadSubcourtData` behaves as follows (today: `src/app.js:211-273`):
- It uses the cached `{chain}Subcourts` and `{chain}SubcourtDetails` when both are non-empty and `{chain}LastModified` is less than 3 hours old (6.5).
- Otherwise it counts subcourts by calling `KlerosLiquid.getSubcourt.estimateGas(i)` for i = 0, 1, 2… until a call throws.
- For each subcourt it reads `PolicyRegistry.policies(i)` and `KlerosLiquid.getSubcourt(i)`.
- A policy URI containing `http` is fetched as is, and a fetch or JSON error yields an `undefined` entry after logging.
- Any other non-empty policy URI is fetched as `IPFS_GATEWAY + uri`, and a fetch or JSON error rejects the whole load.
- An empty policy URI yields `null`.
- On success it sets `subcourtDetails` (policy JSON objects), `subcourts` (`getSubcourt` results) and `subcourtsLoading = false`, then writes the cache.
- When the load rejects, no state is set and `subcourtsLoading` stays `true` for the rest of the session (11.3).

### 2.3 Header

The header renders the smart-contract-wallet warning, the navbar and the view-only banner (today: `src/components/header.js`).

**Smart-contract wallet warning** (today: `src/components/smartContractWalletWarning.js`):
- It calls `getCode(activeAddress)` on the read provider (`state.provider`) at mount and whenever the address or provider changes (today: lines 40-71).
- It shows an antd warning banner titled "Warning" with the text "You are using a smart contract wallet. This is not recommended." and a "Learn more." link to `https://docs.kleros.io/welcome/faq#can-i-use-a-smart-contract-account-to-stake-in-the-court` (new tab).
- It shows the banner only when the code is not `0x` and does not start with the EIP-7702 delegation prefix `0xef0100`.
- It treats a `getCode` error, a missing address or a missing provider as "not a smart wallet".
- The banner is closable, and closing it stores `false` under `@kleros/dispute-resolver/alert/smart-contract-wallet-warning:{activeAddress}` so it stays hidden for that address (today: lines 18, 30-38, 73-76).

**Navbar** (today: `src/components/header.js:17-37`):
- The brand logo links to `/{chainId}`.
- "Ongoing Disputes" links to `/{chainId}/ongoing/`.
- "Create" links to `/{chainId}/create/` and is shown only when `activeAddress` is truthy.
- "Interact" links to `/{chainId}/cases/`.

**View-only banner:** when `activeAddress` is falsy, the header shows "View mode only: Actions that require an Ethereum account are disabled. To use them, a web3 browser like Metamask is required." with "Metamask" linking to `https://metamask.io` in a new tab (today: `src/components/header.js:38-46`).

### 2.4 Footer

(today: `src/components/footer.js`)
- A "Secured by Kleros" logo links to `https://kleros.io`.
- From the `lg` breakpoint, the footer shows `networkMap[network].NAME`, or "Unsupported Network" when the chain is not in the map.
- "I need help" links to `https://t.me/kleros`.
- An Etherscan icon links to `https://{prefix}etherscan.io/address/{ARBITRABLE_PROXY}#code` when the network is 1, 3 or 42 (prefixes `""`, `ropsten.`, `kovan.`); only chain 1 can reach it because 3 and 42 are not in the network map (today: lines 78, 99-107).
- Social icons link to GitHub (`kleros/dispute-resolver`), Slack, Reddit, Twitter, the Kleros forum, Telegram and LinkedIn.
- No other block-explorer link exists anywhere in the app.

### 2.5 Unsupported network screen

(today: `src/components/unsupportedNetwork.jsx`)
- It shows the heading "Unsupported Network {id}" and the text "Please switch over one of the following networks."
- It lists every network-map entry as `NAME (id)`, in ascending numeric chain order.
- Clicking an entry calls `wallet_switchEthereumChain` with the chain ID in hex.
- There is no `wallet_addEthereumChain` fallback, and any error (including a missing `window.ethereum`) is only logged.

### 2.6 404 page

The 404 page shows the Acropolis illustration, "404" and "Something went wrong in Athens!" (today: `src/containers/404.js:43-52`). Its `Web3` prop, which would show "Connecting Ethereum..." and a spinner, is never passed.

### 2.7 Toast

`Toast` is a Bootstrap toast with a Success, Failure or Pending icon, a header and a body, auto-hiding after its `delay` (today: `src/components/toast.js`). Only the Create page uses it.

### 2.8 Alert messages

- `AlertMessage` takes `type`, `title`, `content` and `extraClass` (today: `src/components/alertMessage.js`).
- The types `success`, `error`, `info` and `warning` select an icon and a style.
- The title shows `title`, or the capitalized `type` when `title` is empty.
- Any other `type` has no icon, so rendering it throws and blanks the app (2.1); the crowdfunding card renders `type="danger"` (5.12) [quirk].

### 2.9 Sign-in control

(today: `src/components/signIn.js`)
- `SignIn` shows a message, by default "Sign in with Ethereum to upload files.", and an outline "Sign in" button.
- The button is disabled and shows a spinner while `isSigningIn` is true.
- A click calls `App.signInWithEthereum`, which sets `isSigningIn`, runs `authenticateUser({signer: state.signer, address: state.activeAddress})` (8.6) and clears `isSigningIn` afterwards (today: `src/app.js:542-549`).
- A failure shows the inline error "Sign-in failed. Please try again."
- `App.render` computes `isAuthenticated` on every render: a stored token exists, its JWT `exp` has not passed (a token without `exp` counts as valid), and the stored account equals `activeAddress` case-insensitively (today: `src/app.js:1358-1359`, `src/utils/atlas-api.js:81-100`).

---

## 3. Ongoing disputes page

(today: `src/containers/open-disputes.js`, `src/components/ongoing-card.js`)

**Preconditions.** The page needs no wallet and works read-only. On a chain without `KLEROS_LIQUID` it shows only the heading "There is no arbitrator on this network, thus no disputes." (today: `src/containers/open-disputes.js:123-129`).

**Fetch** (today: `src/containers/open-disputes.js:50-101`):
1. The page fetches at mount when the chain has `KLEROS_LIQUID`.
2. It gets the open dispute IDs from `getOpenDisputesOnCourt` (6.3).
3. It sorts the IDs in descending numeric order.
4. For every ID in parallel, it reads `KlerosLiquid.disputes(id)` and stores the struct.
5. It then calls `getMetaEvidenceParallelizeable(arbitrated, id)`, which serves the localStorage cache `{chain}{id}` when present (6.5 [Q13]) and otherwise runs the meta-evidence pipeline of 9.1.
6. A per-dispute error is caught and logged, and that dispute's card is not rendered.
7. The spinner stays until every dispute has settled.
8. Because each pipeline run can take two minutes or more (9.1), the spinner can stay for minutes.
9. Because all disputes run in parallel, concurrent dynamic scripts can receive each other's results (9.5) [Q5].

**Reset and re-fetch.**
- When the `subcourts`, `subcourtDetails` or `network` prop changes identity, the page clears its list, shows the spinner and fetches again through a debounced call (0 ms when created in the constructor, 750 ms when created later) (today: `src/containers/open-disputes.js:16-37`).
- Subcourts finish loading after the page mounts, so a cold load fetches the list twice.
- A fetch already in flight is not cancelled and keeps writing to the page state.
- An ethers error with `code === "NETWORK_ERROR"` and `event === "changed"` calls `window.location.reload()` (today: lines 92-95).

**Filter.**
- A dropdown offers Evidence (period 0), Commit (1), Voting (2), Appeal (3) and "Ongoing" (index 4, meaning all), with "Ongoing" as the default (today: lines 103-117, 133-146).
- The dropdown title shows the selected filter name and takes the period's color class.
- A card is visible when its period equals the filter or the filter is "Ongoing".
- A hidden card's column gets `display: none` and its card body is not rendered (today: lines 158-179).

**Cards** (today: `src/components/ongoing-card.js`):
- Each card is wrapped in a plain `<a href="/{network}/cases/{id}">` (1.4).
- A card shows a status dot colored by period (`evidence`, `commit`, `vote`, `appeal`, `execution` classes).
- A card shows the dispute ID.
- A card shows the meta-evidence `title`, or "Meta Evidence Missing" when the meta-evidence is null or has no title (today: `src/containers/open-disputes.js:175`).
- A card shows a court badge with `subcourtDetails[subcourtID].name`.
- A card shows a countdown formatted `DDd HHh MMm` to `lastPeriodChange + timesPerPeriod[period]` (from `subcourts[subcourtID][1]`), only when subcourts are loaded and the target is in the future (today: `src/components/ongoing-card.js:15-25, 56-64`).
- When `subcourts` is non-empty but has no entry for the dispute's court, the card throws during render (11.3).

**After loading.**
- On a fetch failure the page shows "Failed to load disputes." and "There may be a problem with the RPC endpoint. Please refresh the page to try again." (today: lines 184-189).
- With no open dispute it shows "There are no open disputes." (today: lines 190-194).

---

## 4. Create dispute page

(today: `src/containers/create.js`, `src/components/createForm.js`, `src/components/createSummary.js`, `src/components/FileUploadDropzone.js`)

### 4.1 Container

- The page has two steps: page 1 is `CreateForm` and page 2 is `CreateSummary` (today: `src/containers/create.js`).
- Both steps are keyed by `network`, so a chain change remounts them.
- A `network` change returns to page 1 and clears the saved form data (today: `src/containers/create.js:15-21`).
- The page is reachable by URL even when the header hides the "Create" link.

### 4.2 Page 1 precondition

On a chain whose `ARBITRABLE_PROXY` is not set, page 1 shows only the heading "There is no arbitrable contract deployed in this network. So unfortunately you can't create a dispute. Feel free to head over GitHub issues to request this feature.", with "GitHub issues" linking to `https://github.com/kleros/dispute-resolver/issues` in a new tab (today: `src/components/createForm.js:266-274, 611-613`). `ARBITRABLE_PROXY` is set on chains 1, 5, 100, 10200 and 11155111.

### 4.3 Form fields

The form is headed "Fill up the form to" / "Create a custom dispute" (today: `src/components/createForm.js:615-637`).

| Field | Control and rules |
|---|---|
| Court | Dropdown of `subcourtDetails[i].name`. While `subcourtsLoading` the toggle is disabled and reads "Loading..."; otherwise it shows the selected court's name or "Please select a court". Selecting a court recomputes the cost. (today: lines 276-311) |
| Number of Votes | Number input, required, `min=1`, default `"3"`. (today: lines 313-328) |
| Category (Optional) | Free text. (today: lines 340-351) |
| Arbitration Cost | Read-only: `formatEther(IArbitrator(KLEROS_LIQUID).arbitrationCost(extraData))` followed by `CURRENCY_SHORT`; empty while unknown. (today: lines 352-362, `src/app.js:433-451`) |
| Title | Required text; invalid feedback "Please enter title for the dispute, something explains it in a nutshell." (today: lines 372-389) |
| Description (Optional) | Textarea, 5 rows. (today: lines 390-404) |
| Question Type | Dropdown with "Multiple choice: single select", "Multiple choice: multiple select", "Non-negative number" (`uint`) and "Date" (`datetime`); `int` and `string` are commented out. Choosing a select type sets Number of Options to 2; any other type sets it to 0. (today: lines 9-17, 128-137, 414-431) |
| Number of Options | Shown for select types only; number input, required, 2 to 32, step 1. Its invalid feedback reads "Please enter first ruling option, for example: "Yes"". (today: lines 432-453) |
| Question | Required text; invalid feedback "Please enter a question." (today: lines 455-472) |
| Ruling Option N / Ruling Option N Description (Optional) | One row per option for select types; the title is required, the description is optional; same invalid feedback as above. (today: lines 477-520) |
| Alias 1 (Optional) / Address 1 (Optional) | Exactly one party row; each field becomes required when the other is filled. `onAddParty` and `onRemoveParty` exist but no button calls them [Q8]. Addresses are not checked for address format. (today: lines 194-226, 522-559) |
| Primary Document (Optional) | Shows `SignIn` when not authenticated; the dropzone is disabled (dimmed, `not-allowed` cursor) until authenticated. (today: lines 561-586) |

**Cost recomputation.**
- Any change to Number of Votes, Category, Title, Description or Question recomputes the cost when the selected court and the vote count are truthy (today: lines 150-163).
- Selecting a court recomputes the cost with the current vote count (today: lines 122-126).
- The cost read returns `null` on error, which leaves the cost field empty (today: `src/app.js:442-450`).

**Primary document upload** (today: `src/components/createForm.js:165-188`):
- A dropped file larger than 20 MB shows "File is too large. Maximum size is 20MB." and is not uploaded.
- Otherwise the form uploads it with `uploadToIpfs(name, file)` under role `evidence` (6.4).
- An upload failure shows "An error occurred while uploading the file. Please try again."
- A successful upload stores the returned path as `primaryDocument` and shows "Selected file: {name}" below the dropzone.
- The dropzone text stays "Drop files here or click to select files (Max size: 20MB)" throughout, because the form does not pass the dropzone its uploading flag or file [quirk].
- The dropzone accepts any file type.

**Continue.**
- "Continue" is a submit button that runs the browser's `checkValidity()` and shows Bootstrap validation styles when the form is invalid (today: lines 76-120).
- A valid form passes `{subcourtDetails, selectedSubcourt, title, category, description, initialNumberOfJurors, question, rulingTitles, rulingDescriptions, names, addresses, primaryDocument, questionType, arbitrationCost}` to page 2.
- For non-select question types `rulingTitles` is passed as `[]`.

**Mount, reset and restore.**
- At mount the form selects court `"0"` and computes the cost for court 0 with the current vote count (today: lines 244-245).
- When returning from page 2, the form restores the saved values (today: lines 246-263).
- `componentDidUpdate` resets the whole form to its initial state, then recomputes the cost for court 0 with 3 votes, whenever `subcourtDetails` becomes a different non-empty array or the network changes; input typed before the subcourts finish loading is wiped [Q8] (today: lines 56-74).
- Changing Number of Options does not trim `rulingTitles` or `rulingDescriptions`, so titles typed for options that are no longer shown are still submitted [Q8].
- On return from page 2, the displayed cost is recomputed for court 0 with 3 votes rather than for the restored court and vote count [quirk].
- On return from page 2, a restored court 0 is stored as the number `0`, so the court toggle reads "Please select a court" and later control changes do not recompute the cost [quirk].

### 4.4 Page 2: summary

(today: `src/components/createSummary.js`)
- The page shows "Summary" and the title as a heading.
- It shows the description as plain text when present.
- It shows Court (`formData.subcourtDetails[selectedSubcourt].name`), Number of Votes, Category (Optional) and Arbitration Cost with `CURRENCY_SHORT` (today: lines 84-119).
- For each non-empty alias at position i of the filtered alias list, it shows "Party {i+1}" with `names[i]` and "Party {i+1} Address (Optional)" with `addresses[i]` (today: lines 120-143).
- It labels the question with the question type's human-readable name and shows the question text.
- It shows each ruling option title, plus its description when non-empty.
- It shows the primary document as a link to `urlNormalize(primaryDocument)` with the last path segment as text, in a new tab.
- When not authenticated it shows `SignIn` with the message "Sign in with Ethereum to publish your dispute data to IPFS." (today: lines 189-195).
- "Return" goes back to page 1 with the data restored (4.3).
- "Create" is disabled while a creation is in progress or when not authenticated (today: lines 196-213).
- When `formData.subcourtDetails` has no entry for the selected court (for example when subcourts never loaded), rendering throws (11.3).

### 4.5 Create action

(today: `src/components/createSummary.js:22-62` → `src/app.js:1102-1161`)
1. The action returns immediately when not authenticated.
2. `numberOfRulingOptions` is `2^titles.length` for multiple-select and `titles.length` otherwise, which is 0 for uint and datetime and means the contract maximum.
3. `aliases` maps `addresses[i]` to the i-th non-empty alias, where i is the position in the filtered list of non-empty aliases.
4. The meta-evidence is `{title, category, description, aliases, question, rulingOptions: {type, titles, descriptions}, fileURI: getFormattedPath(primaryDocument), dynamicScriptURI: "/ipfs/QmZZHwVaXWtvChdFPG4UeXStKaC9aHamwQkNTEAfRmT2Fj"}`; `fileURI` is `""` without a document.
5. The meta-evidence is uploaded as `metaEvidence.json` with role `policy`, and the returned path is normalized with `getFormattedPath`.
6. The action reads `arbitrationCost(extraData)` from `KLEROS_LIQUID`.
7. It calls `ArbitrableProxy(ARBITRABLE_PROXY).createDispute(extraData, metaevidenceURI, numberOfRulingOptions, {value: cost})` through the wallet signer.
8. It waits for the receipt and takes the first log whose `topics[0]` equals `id("DisputeCreation(uint256,address)")`; the dispute ID is `topics[1]` as a decimal string.

`extraData` is `0x` followed by the subcourt ID as 64 hex digits and the vote count as 64 hex digits (today: `src/app.js:553`).

### 4.6 Outcomes

- **Success:** a toast "Transaction Confirmed" / "You have successfully created dispute {id}!" appears with a 5-second auto-hide, and after 2 seconds the browser navigates to `/{network}/cases/{id}` (today: `src/containers/create.js:34-43, 84-94`).
- **No DisputeCreation log in the receipt:** the toast reads "You have successfully created dispute null!" and no navigation happens.
- **Upload failure:** the upload error propagates to `CreateSummary`, which logs it; no message is shown [Q7].
- **Cost-read failure:** the `arbitrationCost` rejection propagates to `CreateSummary`, which logs it; no message is shown [Q7].
- **Transaction failure:** `createDispute` catches the error and returns `null`, then reading `result.disputeID` throws a TypeError that `CreateSummary` logs; no message is shown [Q7].
- **No wallet:** `getSignableContract` throws "Provider is required for signable contract", which `CreateSummary` logs; no message is shown [Q7].
- In every failure case the "Create" button re-enables.

`DatetimePicker` (antd `DatePicker` with `showTime`) is not used by the Create form; only the crowdfunding card uses it (5.12).

---

## 5. Case page

(today: `src/containers/interact.js` and its children)

### 5.1 Entry

- The dispute ID is `route.match.params.id`, or the number `0` when the route has no ID (today: `src/containers/interact.js:18`).
- `/{chain}/cases` with no ID therefore loads dispute 0 [Q9].
- At mount the page starts the fetch pipeline of 5.3 through a 750 ms trailing debounce (today: lines 33-39).
- While `arbitrated` is unknown and loading is in progress, the page renders nothing below the header, not even the search box (today: lines 496-512).
- Once `arbitrated` is set, the page renders a `<Redirect to="/{network}/cases/{id}">`, the search box, `DisputeSummary` and `DisputeDetails` (today: lines 549-597).
- The redirect is rendered as `{arbitratorDisputeID && <Redirect/>}`, so with the numeric ID `0` it renders a stray "0" text node instead [Q9].

### 5.2 Search box

(today: `src/containers/interact.js:446-480`)
- The label reads "Search Disputes on Court", with "Court" linking to `https://court.kleros.io/cases/{encodeURIComponent(id)}?requiredChainId={network}` in a new tab.
- The input is a number field with `min=0` and the placeholder "Dispute ID".
- Every change sets the new ID, clears `metaevidence`, `arbitrableDisputeID` and `arbitratorDispute`, sets `loading` and clears `incompatible` (today: lines 98-110).
- Every change cancels any pending fetch and schedules the debounced fetch for the new ID.
- Every change rewrites the URL through the rendered `<Redirect>` (1.4).
- `arbitrated` is not cleared on change, so typing a nonexistent ID while a valid dispute is shown keeps the old `arbitrated` and shows "Failed to load metaevidence…" instead of the not-found screen [quirk].

### 5.3 Fetch pipeline

`retrieveDisputeDetailsUsingArbitratorID` runs these steps (today: `src/containers/interact.js:130-143, 275-353`):
1. It reads `KlerosLiquid.disputes(id)` and takes `arbitrated`. On a chain without `KLEROS_LIQUID` the read returns `null` and destructuring it throws. Any error is logged, `loading` becomes false and the pipeline stops.
2. It resolves the arbitrable's local dispute ID with `getArbitrableDisputeID(arbitrated, id)` (today: `src/app.js:302-369`):
   - For an address in the chain's `ESCROW_V1_CONTRACTS` (case-sensitive match [Q12]) it calls `MultipleArbitrableTokenTransaction.disputeIDtoTransactionID.staticCall(id)` and resolves `null` on error, with no further fallback.
   - Otherwise it calls `IDisputeResolver.externalIDtoLocalID.staticCall(id)`.
   - When that call fails, it looks up the `DisputeCreation(id)` log on the arbitrator (6.3); when the log names a different arbitrable, it repeats the resolution with that address.
   - Otherwise it resolves `null`; it never rejects.
3. It runs nine reads in parallel, each with its own fallback (today: lines 145-230):

   | Read | Fallback on rejection |
   |---|---|
   | `KlerosLiquid.disputes(id)` | `{period: "0", lastPeriodChange: "0", subcourtID: "0", numberOfChoices: "2"}` |
   | `getMetaEvidence(arbitrated, id)` (9.1, never cached) | `null` |
   | `KlerosLiquid.getDispute(id)` | `{0: "0", 1: "0", 2: ["0","0","0","0"]}` |
   | Archon `getRuling` (stored as `ruling`) | `null` |
   | `KlerosLiquid.currentRuling(id)` | `null` |
   | Archon `getDispute` (Dispute event) | `{blockNumber: 0, args: {...}}`, with no `createdAt` |
   | `KlerosLiquid.getDispute(id)` again (stored as `getDisputeResult`) | a fake dispute object |
   | Archon `getEvidence` via `getEvidences` | `[]` (but `getEvidences` itself resolves `null` on failure) |
   | `resolveAppealMultipliers(arbitrated)` | `null` |

   `ruling` and `getDisputeResult` are fetched but never rendered [Q11].
4. It sets `arbitrableDisputeID`, the dispute ID, all nine results, and `incompatible = arbitrableDisputeID == null && !isGovernorWithEvidenceSupport(network, arbitrated)` (today: line 291).
5. It reads the `AppealDecision(id)` events from the Dispute event's block, or block 0 (6.3), falling back to `[]`.
6. In parallel it reads the contributions and the `RulingFunded` rulings for round = number of appeal decisions, searching from the last appeal decision's block (or the default range when there is none), each falling back to `{}` [Q2] (today: lines 304-326).
7. When the period is 3 or more, it reads `appealCost(id, ZeroHash)` and `appealPeriod(id)` (today: lines 232-240).
8. When the period is 4, it reads the contributions of every past round 0…n−1 (n = number of appeal decisions), each searching from the Dispute event's block [Q2], and merges their keys with the current round's (today: lines 242-273).
9. In that case it then calls `getTotalWithdrawableAmount(localID, contributedRulings, arbitrated)` (6.1) and stores `totalWithdrawable` and `selectedContribution`.
10. Steps 7 and 8 each have their own try/catch; any other error in steps 2 to 9 is caught, and `incompatible` becomes true when no meta-evidence is loaded.
11. `loading` becomes false after the pipeline ends.

`reload()` runs after an appeal funding or an evidence submission (today: `src/containers/interact.js:355-387`):
- It re-reads `disputes(id)`, the evidence, `AppealDecision(id)` from block 0 and `getDispute(id)`.
- It then re-reads the current round's contributions without a start block, which uses the default range of 6.3, unlike the initial load [Q2].
- It does not refresh the meta-evidence, `currentRuling`, `rulingFunded`, `appealCost`, `appealPeriod` or `totalWithdrawable`.
- Its errors are only logged.

### 5.4 Page states

- When loading has finished and `arbitrated` is unset, the page shows "Dispute with ID {id} does not exist on this network." and a "View Ongoing Disputes" button that navigates to `/{network}/ongoing` with a full load (today: `src/containers/interact.js:389-411`).
- That screen also appears for every ID on chains without `KLEROS_LIQUID`.
- `DisputeSummary` shows the summary when meta-evidence is present, "Fetching...." while loading, and otherwise "Failed to load metaevidence, thus the dispute summary. This might be an issue with the IPFS access." (today: `src/components/disputeSummary.js:163-164`).
- `DisputeDetails` renders an empty `<div>` unless meta-evidence, the dispute struct, a non-empty `subcourts`, a non-empty `subcourtDetails` and the `getDispute` result are all present (today: `src/components/disputeDetails.js:451-454, 720-722`).

### 5.5 Compatibility banner

(today: `src/containers/interact.js:413-444, 504-509`)
- The banner shows when `incompatible` is true or the meta-evidence `category` is exactly "Non-Standard Contract".
- For "Non-Standard Contract" it is a yellow box starting with a warning emoji: "Non-Standard Contract: This arbitrable contract doesn't follow standard Kleros patterns. The dispute information shown is generic. Limited functionality is available - you may not be able to submit evidence or fund appeals through this interface.", followed by "Contract: {arbitrated}".
- Otherwise it reads "View mode only: the arbitrable contract of this dispute is not compatible with the interface of Dispute Resolver. You can't submit evidence or fund appeal on this interface. You can do these on the arbitrable application, if implemented."

### 5.6 Dispute summary

(today: `src/components/disputeSummary.js`)
- The summary shows "Interact with the dispute" and the meta-evidence `title` as a heading.
- It renders `description` with react-markdown 4.3.1 defaults: raw HTML is escaped, link URIs other than http, https, mailto and tel become `javascript:void(0)`, links open in the same tab, and images load from any URL (today: lines 108-112).
- It renders the evidence-display iframe when `evidenceDisplayInterfaceURI` is set (9.4).
- It shows "Go to arbitrable application from here" (new tab, `rel="noopener noreferrer"`) when `arbitrableInterfaceURI` is set, does not contain the substring `resolve.kleros.io`, and parses as an `https:` URL (today: lines 141-147).
- For each `aliases` entry it shows "Party N" with the alias and "Party N Address" with the address key (today: lines 62-89).
- When `fileURI` is set, it shows an attachment link to `urlNormalize(fileURI)` in a new tab, labelled with the URI's last path segment (today: lines 151-160).
- It computes the evidence-display parameters (9.4) whenever meta-evidence is present, even without an evidence display, and that computation throws for a chain ID missing from the network map (11.3).

### 5.7 Timeline

(today: `src/components/disputeTimeline.js`)
- The timeline has three columns, Evidence, Voting and Appeal, with no Commit or Execution column.
- The current period's column shows a countdown `DDd HHh MMm` to `lastPeriodChange + timesPerPeriod[period]`.
- A past period's column shows "Concluded".
- An upcoming Voting or Appeal column shows that period's duration as `DDd HHh MMm`.
- In the commit period (1), Evidence shows "Concluded" and Voting and Appeal show their durations.
- In the execution period (4), all three columns show "Concluded".
- `timesPerPeriod` comes from `subcourts[subcourtID][1]` and defaults to four zeros (today: `src/components/disputeDetails.js:729-733`).

### 5.8 Info row

The info row shows "Dispute" with `# {id}`, "Number of Votes" with `getDispute().votesLengths[0]` (the first round's vote count), and "Court" with `subcourtDetails[subcourtID].name` (today: `src/components/disputeDetails.js:293-322`).

### 5.9 Decision alert

(today: `src/components/disputeDetails.js:165-290`)
- In period 3 an info alert reads "Jury decision: {ruling}" with "This decision can be appealed within appeal period.", plus "Go to arbitrable application to appeal this ruling." when `incompatible`.
- In period 4 an info alert reads "Winner: {ruling}" with "Won by default" when exactly one `RulingFunded` event exists for the current round, and "Won by jury decision" otherwise.
- In period 4 the displayed winner is the single funded ruling when exactly one exists, and the current ruling otherwise.
- No decision alert shows in periods 0 to 2.
- The current ruling is `"0"` when `currentRuling` is falsy, the raw string for hash questions, and `String(parseInt(currentRuling))` otherwise (today: `src/containers/interact.js:482-494`).

The ruling text is formatted as follows:
- Ruling 0 reads "invalid / refused to arbitrate / tied".
- For `rulingOptions.type === "hash"` it reads `0x` followed by the ruling as 64 hex digits.
- Otherwise it is reality-eth-lib `getAnswerString({decimals: precision, outcomes: titles, type}, padToBytes32((ruling − 1) in hex))`.
- Without `rulingOptions` it uses the first non-empty array among `dispute.template.outcomes`, `template.outcomes`, `outcomes` and `question.outcomes`, indexed by ruling − 1, or the raw value (today: lines 209-230).
- Any formatting error falls back to the raw ruling value.

### 5.10 Reality question notice

(today: `src/components/realityQuestionNotice.js`, rendered at `src/components/disputeDetails.js:740`)

The notice reads `metaEvidenceJSON.realityQuestion` (9.1) and shows at most one alert, chosen in this priority order:

| Condition | Alert type | Title |
|---|---|---|
| `status === "unresolvable"` | error | "The answer options of this question could not be determined" |
| `status === "unverified"` | warning | "The answer options of this question could not be verified" |
| `divergent === true` | warning | "Other interfaces may show different answer options for this question" |
| `status === "malformed"` | info | "The question parameters are malformed" |

- Each alert has a fixed explanatory body, and the priority order is fixed (today: lines 5-28, 30-36).
- When `realityQuestion.title` is set, the alert appends "Question recorded on-chain: {title}" with line breaks preserved.
- No notice shows for a verified, non-divergent question or without `realityQuestion`.

### 5.11 Accordion and appeal panel

(today: `src/components/disputeDetails.js:325-485, 742-765`)
- Below the notice, an accordion holds the Appeal, Question and Evidence panels, all collapsed initially.
- The accordion is uncontrolled; the open/closed header class follows a local `activeKey`, which resets when the dispute ID changes.
- The Appeal panel (event key 1) exists only when the dispute struct and `arbitrated` are present and the period is 3 or more.
- The Appeal panel body shows a spinner while `loading`.
- The Appeal panel is not gated by `incompatible`.

**Escrow V1 body** (when `arbitrated` is in the chain's `ESCROW_V1_CONTRACTS`, case-sensitive [Q12]) (today: lines 363-376):
- In period 3 it shows "Appeal the decision", "In order to appeal the decision, you need to pay the appeal cost." and a button "Appeal - {formatEther(appealCost)} ETH" [Q10].
- The button calls `MultipleArbitrableTokenTransaction.appeal(transactionID)` with `value = appealCost` (6.2).
- In period 4 it shows only "Appeal period ended".

**Standard body, period 3** (today: lines 325-361):
- It shows the heading "Appeal the decision".
- It shows the paragraph "In order to appeal the decision, you need to fully fund the crowdfunding deposit. The dispute will be sent to the jurors when the full deposit is reached. Note that if the previous round loser funds its side, the previous round winner should also fully fund its side in order not to lose the case."
- The same paragraph continues with "You don't have any amount to withdraw. Reason might be that you did not contribute, the ruling option you have contributed did not win, you already withdrew or the ruling is not executed yet by the arbitrator." [quirk]
- When `multipliers`, `appealCost` and `appealPeriod` are all non-null, it shows the crowdfunding cards of 5.12.
- Otherwise it shows the warning "Appeal fees could not be calculated" with "This arbitrable contract uses an unsupported appeal interface, so the appeal funding amounts and deadlines can't be shown. Please use the arbitrable application to appeal."

**Standard body, period 4** (today: lines 327-344):
- It shows the heading "Withdraw crowdfunding rewards and refunds".
- When `parseInt(totalWithdrawable)` is not 0 (including when it is unset), it shows "If you have contributed to a ruling option and in the end that ruling option was the winner you are eligible for some reward. Also, if you have contributed but appeal did not happen your contribution is refunded."
- Otherwise it shows the "You don't have any amount to withdraw…" text quoted above.
- When `totalWithdrawable > 0`, it shows a button "Withdraw {formatEther(totalWithdrawable)} ETH", labelled "ETH" on every chain [Q10].

### 5.12 Crowdfunding cards

**Card set** (today: `src/components/disputeDetails.js:488-685`):
1. An "Invalid / Refused to Arbitrate / Tied" card for ruling 0, except for the Unslashed contracts (10.1).
2. One card per `rulingOptions.reserved` entry, titled with its value and coded with its hex key converted to decimal.
3. For single-select with `titles`: one card per title, coded 1…n.
4. For multiple-select with `titles`: one card per combination 0…2^n−1, coded combination + 1 and titled "None" for combination 0 or the space-joined titles of its set bits otherwise.
5. For every other case, including uint, int, string, datetime, hash and single-select without titles: one card per reality outcome found by the fallback lookup of 5.9, or the hard-coded "Yes" (code 1) and "No" (code 2) [Q4].
6. For uint, int, string, datetime and hash only, these extra cards follow:
   - one card per contributed ruling key other than the current ruling, titled with the key decoded as UTF-8 (string), as 64-digit hex (hash), or through the 5.9 formatter;
   - a current-ruling card when the current ruling is not 0, marked as winner, whose funding percentage and deadline use the winner rules but whose suggested contribution uses the loser total [Q4];
   - a free-input card with a deadline at the loser deadline and the loser total as suggested contribution.

**Amounts and deadlines** (today: `src/components/disputeDetails.js:63-132`):
- An option is a winner when its code equals the current ruling, or when the arbitrable is an Unslashed contract and the current ruling is 0.
- A winner's total is `appealCost + appealCost × winnerStakeMultiplier / denominator`, with the deadline `appealPeriod.end`.
- A loser's total is `appealCost + appealCost × loserStakeMultiplier / denominator`, with the deadline `start + (end − start) × loserAppealPeriodMultiplier / denominator`.
- The remaining amount is the total minus `contributions[option]`.
- The funding percentage is `contributions[option] × 10000 / total / 100`, shown with two decimals, and 0 when the total is 0.
- For an Escrow V1 arbitrable the total is `appealCost`.

**Card contents** (today: `src/components/crowdfundingCard.js`):
- A fixed card shows its title; a free-input card shows a text input (string, hash), a number input (uint, int) or the antd date-time picker (datetime), with the placeholder "Enter a new ruling option".
- A winner card shows "Latest jury decision".
- Every card shows "{pct}% Funded", a progress bar and a countdown `DDd HHh MMm` to its deadline.
- The contribution input is prefilled with the suggested (remaining) amount, shows 0 and is disabled when that amount is 0.
- The contribution input is initialized once and does not follow later changes of the suggested amount, for example after `reload()` [quirk].
- "Fund" is disabled when the suggested amount is 0, when a free-input card has no value, or when the card holds an error.
- Every card shows the info alert "Rewards" / "Rewards only apply if both sides are funded and this option wins. If no appeal takes place, your contribution is refunded."
- The date-time picker stores the chosen date at 00:00:00 UTC as a Unix timestamp, so the chosen time of day is discarded.

**Ruling code sent** (today: `src/components/crowdfundingCard.js:34-53`):

| Card | Code sent |
|---|---|
| fixed option | the option code |
| uint | `answerToBytes32(value, {decimals: precision \|\| 18}) + 1`, so a precision of 0 encodes with 18 decimals [quirk] |
| int | `value + 1` when `value ≥ 0`, otherwise `value` unchanged |
| string | UTF-8 bytes as hex, with no +1 |
| datetime | the UTC-midnight Unix timestamp + 1 |
| hash | `BigInt(value) + 1` |

**Fund action** (today: `src/containers/interact.js:79` → `src/app.js:1163-1206`):
- "Fund" calls `IDisputeResolver.fundAppeal(localID, code, {value: parseEther(contribution)})` through the wallet signer and waits for the receipt.
- When `App.appeal` resolves, with the receipt or with `null` after a caught transaction failure, the page runs `reload()` (5.3).
- A failure while sending or mining the transaction is caught in `App.appeal`, which returns `null`; no message is shown [Q7].
- An error thrown before the transaction is sent (no wallet provider, rejected signer request, ruling-code encoding such as a non-numeric hash) sets the card's error state; the card then renders `AlertMessage type="danger"`, which has no icon, so rendering throws and the whole app blanks (2.8) [quirk].

### 5.13 Question panel

(today: `src/components/disputeDetails.js:379-429`, event key 2)
- The panel shows the question type label: "Multiple choice: single select", "Multiple choice: multiple select", "Non-negative number" (uint), "Number" (int), "Text" (string), "Date" (datetime) or "Hash" (today: lines 28-36).
- It shows `question` as plain text.
- For single-select and multiple-select, it shows a "View Voting Options" dropdown of disabled items.
- The first item is "Option 0 - Refuse to Arbitrate / Invalid".
- Each title gives "Option {i} - {title}: {description}", where the colon and description appear only when `descriptions[i−1]` is defined.
- Each reserved entry gives "Option {code} - {title}", with codes longer than 12 characters shortened to the first 6 characters, "...", and the last 6 characters; its description is looked up by code.
- Below the dropdown it shows "Note that you can only view the voting options. Selected jurors can vote using Court.", with "Court" linking to `https://court.kleros.io/cases/{id}?requiredChainId={network}` in a new tab.

### 5.14 Evidence panel

(today: `src/components/evidenceTimeline.js`, event key 3)

**Submit control** (shown only in periods 0 to 3) (today: lines 141-164):
- When submission is enabled (`!incompatible`) and the user is not authenticated, the panel shows `SignIn`.
- Otherwise it shows a button "Submit New Evidence", or, when incompatible, the disabled button "Go to Arbitrable Application to Submit Evidence".

**Modal** (today: lines 251-296):
- The modal is titled "Submit Evidence" and has "Evidence Title", "Evidence Description" (5 rows), a file dropzone, "Return" and "Submit".
- No field is validated.
- The dropzone rejects files over 20 MB with "File is too large. Maximum size is 20MB." and uploads others with role `evidence`, showing "Uploading to IPFS..." during the upload and the file name afterwards.
- An upload failure shows "An error occurred while uploading the file. Please try again."
- "Submit" reads "Awaiting Confirmation" and is disabled while a submission or an upload is in progress.
- Clicking the overlay or "Return" closes the modal.
- The supporting side is always 0, because nothing in the UI changes it.

**Submit** (today: lines 43-74 → `src/containers/interact.js:66-75` → `src/app.js:1051-1100`):
1. The app uploads `evidence.json` = `{name, description, fileURI: getFormattedPath(document) or "", evidenceSide: 0}` with role `policy`.
2. When the arbitrable is a listed governor (10.3), it calls `submitEvidence(string evidenceURI)` with no value.
3. Otherwise, when the local dispute ID is `null`, it throws "Arbitrable {address} does not support evidence submission through this interface."
4. Otherwise it calls the ArbitrableProxy ABI `submitEvidence(localID, evidenceURI)` with `value: 0` on the arbitrable.
5. It waits for the receipt.
- On success the modal closes, title, description and file label reset, and `reload()` runs immediately; the intended 2-second delay never happens [Q7].
- The uploaded document reference is not reset after success, so a second submission without a new file reuses the previous `fileURI` [quirk].
- On failure the modal closes and the error is only logged; no message is shown [Q7].

**Evidence list** (today: lines 166-249):
- The list shows only entries with `evidenceJSONValid` (9.3), newest first.
- Each entry shows `title || name` as its heading, then `description` as plain text.
- Each entry shows a Blockies avatar, "Submitted by: {first 6 chars}...{last 4 chars}" and the submission time as a UTC string.
- When the evidence has a `fileURI`, the entry shows an attachment icon (image, video, text, or generic link, chosen from the URI's extension) linking to `urlNormalize(fileURI)` in a new tab.
- Below the entries, the panel shows "Dispute Raised" with the Dispute event's time when the evidence array is non-empty, even if every entry is invalid.
- When the Dispute event read failed, its fallback has no `createdAt`, so the time reads "Invalid Date".
- With an empty evidence array the panel shows "No evidence submitted yet."
- With a `null` evidence array the panel shows neither the list nor a footer.
- "Appealed" markers never render, because `DisputeDetails` passes `this.state.appealDecisions`, which is always undefined, so the default empty array applies [Q3] (today: `src/components/disputeDetails.js:442`).

### 5.15 Withdraw action

(today: `src/containers/interact.js:81-96` → `src/app.js:1208-1239`)
- "Withdraw" returns without action when `selectedContribution` is `null` or `undefined`.
- Otherwise it calls `withdrawFeesAndRewardsForAllRounds(localID, activeAddress, selectedContribution)` with `value: 0` through the wallet signer.
- It uses the IDisputeResolver v1 ABI (ruling array) for the Unslashed contracts and the v2 ABI (single ruling) for every other arbitrable (10.8).
- The page does not await the call and does not reload afterwards.
- Errors are only logged; no message is shown [Q7].

### 5.16 Network change on the case page

- When the `network` prop changes, `DisputeDetails.componentDidUpdate` calls `window.location.reload()` (today: `src/components/disputeDetails.js:46-48`).
- That reload is triggered by the render that follows `setState({network})` in `handleNetworkChange`, before the providers are rebuilt and before `syncUrlWithChain` runs (today: `src/app.js:137-144`).
- `Interact.componentDidUpdate` also re-reads the dispute struct on a network change and reloads the page when it is falsy (today: `src/containers/interact.js:41-49`).

---

## 6. Data sources

### 6.1 On-chain reads

All reads use the read provider (`state.provider`) unless noted.

| Contract (ABI source) | Method | Used for | Today |
|---|---|---|---|
| KlerosLiquid (`@kleros/kleros`) | `getSubcourt.estimateGas(i)`, looping until it throws | Counting subcourts | `src/app.js:238-246, 453-470` |
| KlerosLiquid | `getSubcourt(i)` → children, `timesPerPeriod[4]` | Timelines and countdowns | `src/app.js:472-487` |
| PolicyRegistry (`@kleros/kleros`) | `policies(i)` → URI | Court names (policy JSON `.name`) | `src/app.js:489-504` |
| KlerosLiquid | `disputes(id)` → `subcourtID`, `arbitrated`, `numberOfChoices`, `period`, `lastPeriodChange`, … | List and case page | `src/app.js:506-521` |
| KlerosLiquid | `getDispute(id)` → `votesLengths`, … (two identical functions call it) | Number of votes | `src/app.js:523-538, 1029-1044` |
| KlerosLiquid | `appealPeriod(id)`, `currentRuling(id)` | Appeal deadlines, decision alert | `src/app.js:589-621` |
| IArbitrator (`@kleros/arbitrable-proxy-contracts`) | `arbitrationCost(extraData)` | Create cost and create value | `src/app.js:418-451` |
| IArbitrator | `appealCost(id, ZeroHash)` | Appeal totals | `src/app.js:555-570` |
| IDisputeResolver v2 (`IDRv2` = `@kleros/dispute-resolver-interface-contract@8.0.0`) | `externalIDtoLocalID.staticCall(id)` | Local dispute ID | `src/app.js:322` |
| IDisputeResolver v2 | `getMultipliers()` | Appeal multipliers | `src/utils/multipliers.js:30-43` |
| IDisputeResolver v2 | `getTotalWithdrawableAmount(localID, account, ruling)`, once per contributed ruling until one is non-zero | Withdraw amount | `src/app.js:973-987` |
| IDisputeResolver v1 (`IDRv1` = `…@1.0.2`) | `getTotalWithdrawableAmount(localID, account, uint[])` | Withdraw amount when any v2 call throws | `src/app.js:990-1027` |
| MultipleArbitrableTokenTransaction (`@kleros/kleros-interaction`, transitive) | `disputeIDtoTransactionID.staticCall(id)` | Escrow V1 local ID | `src/app.js:352-369` |
| Ad-hoc single-getter ABIs | `winnerStakeMultiplier`/`winnerMultiplier`, `loserStakeMultiplier`/`loserMultiplier`, `denominator`/`MULTIPLIER_DIVISOR`/`MULTIPLIER_DENOMINATOR`, `loserAppealPeriodMultiplier` | Multiplier fallback (10.9) | `src/utils/multipliers.js:7-68` |
| Reality.eth and Reality proxies (raw web3 JSON-RPC) | `templates(id)` `eth_call`; proxy `arbitrationCreatedBlock(id)`; `eth_blockNumber`; `eth_getBlockByNumber` | Reality question lookup (9.1) | `src/ethereum/reality-question.js:128-134, 219-312` |
| any address | `getCode(activeAddress)` | Smart-contract-wallet warning | `src/components/smartContractWalletWarning.js:61` |

- The total withdrawable read passes `activeAddress ?? ZeroAddress` as the account (today: `src/app.js:978, 999`).
- The v2 withdrawable read returns `{amount: 0, ruling: null}` when every ruling yields 0, and a v1 failure returns `{amount: 0, ruling: contributedRulings}` (today: `src/app.js:1006-1027`).
- `getAppealCostOnArbitrable` is passed to `Interact` but never called, and it targets `ARBITRABLE_PROXY` with an `appealCost` method that IDisputeResolver v2 does not have [Q11] (today: `src/app.js:572-587`).
- `renderInteract` also passes props bound to methods that do not exist on `App` (`getContractInstance`, `getArbitrableDispute`, `getCrowdfundingStatus`, `passPeriod`, `drawJurors`, `passPhase`, `getRoundInfo`), so they are `undefined` [Q11] (today: `src/app.js:1304-1324`).

### 6.2 Writes

Every write builds its contract with `getSignableContract(name, address, walletProvider)`, which calls `walletProvider.getSigner()` at call time and throws "Provider is required for signable contract" without a wallet provider (today: `src/ethereum/interface.js:43-50`). No write checks that the wallet's chain equals `state.network` before signing [W3].

| Action | Contract.method(args) | Value | Today |
|---|---|---|---|
| Create dispute | `ArbitrableProxy(ARBITRABLE_PROXY).createDispute(bytes extraData, string metaevidenceURI, uint numberOfRulingOptions)` | `arbitrationCost(extraData)` | `src/app.js:1128-1140` |
| Submit evidence (IDisputeResolver arbitrables) | ArbitrableProxy ABI `submitEvidence(uint localID, string evidenceURI)` on the arbitrable | 0 | `src/app.js:1085-1093` |
| Submit evidence (listed governors) | `submitEvidence(string evidenceURI)` (inline KlerosGovernor ABI) | none | `src/app.js:1069-1078`, `src/ethereum/interface.js:14-16` |
| Fund appeal | `IDisputeResolver.fundAppeal(uint localID, uint ruling)` | the user's contribution | `src/app.js:1171-1186` |
| Escrow V1 appeal | `MultipleArbitrableTokenTransaction.appeal(uint transactionID)` | `appealCost` | `src/app.js:1189-1206` |
| Withdraw | `withdrawFeesAndRewardsForAllRounds(localID, activeAddress, ruling)` (v2) or `(…, uint[] rulings)` (v1, Unslashed only) | 0 | `src/app.js:1208-1239` |
| SIWE | `signer.signMessage(EIP-4361 text)` (`personal_sign`) | — | `src/utils/atlas-api.js:186-187` |
| Chain switch | `wallet_switchEthereumChain` | — | `src/app.js:188-199`, `src/components/unsupportedNetwork.jsx:21-30` |

### 6.3 Event and log queries

`lookback` is the chain's `MAX_LOOKBACK`: 1,000,000 blocks by default and 50,000 blocks on chains 5, 1301, 300, 421614, 80001, 10200, 11155111, 11155420 and 84532 (today: `src/app.js:27, 82`). `head` is the current block number of the read provider.

| Query | Filter | Block range | Today |
|---|---|---|---|
| Open dispute list | `KlerosLiquid.NewPeriod()` (all) and `KlerosLiquid.DisputeCreation()` (all), one request each | `[max(0, head − lookback), latest]` | `src/app.js:275-300` |
| (same) | Open IDs = distinct created IDs minus IDs with any `NewPeriod` whose `_period` is 4 | | |
| Arbitrable fallback | `IArbitrator.DisputeCreation(id)`; the first log's `_arbitrable` | `[max(QUERY_FROM_BLOCK or 0, head − lookback), head]` | `src/app.js:371-416` |
| Dispute event | Archon `Dispute(_arbitrator, _disputeID)` on the arbitrable; throws on 0 or more than 1 log | from 0 on non-testnets, from `max(0, head − lookback)` on testnets, to `latest` | `src/app.js:623-627` |
| Evidence | Archon `Dispute`, then `Evidence(_arbitrator, _evidenceGroupID)` | same as the Dispute event | `src/app.js:795-810` |
| Ruling | Archon `Ruling(_arbitrator, _disputeID)`; throws on 0 or more than 1 log | same as the Dispute event | `src/app.js:1046-1049` |
| Appeals | `KlerosLiquid.AppealDecision(id)`, then `getBlock` per log for `appealedAt` and `appealedAtBlockNumber` | `[Dispute event block or 0, latest]`; `reload()` passes no start, which means block 0 | `src/app.js:812-844` |
| Contributions | `IDisputeResolver.Contribution(localID, round, any contributor)`, summing `_amount` per `ruling` | see below [Q2] | `src/app.js:846-901` |
| RulingFunded | `IDisputeResolver.RulingFunded(localID, round, any ruling)`, returning the `_ruling` values | see below [Q2] | `src/app.js:903-970` |
| Reality question | `DisputeIDToQuestionID` or `ArbitrationCreated` on the proxy, then `LogNewQuestion` and `LogNewTemplate` on Reality.eth | single blocks for known disputes, windowed scan otherwise (9.1) | `src/ethereum/reality-question.js` |

**Contribution and RulingFunded block range** (today: `src/app.js:870-877, 934-941`):
- With a start block `searchFrom`, the range is `[searchFrom, searchFrom + 10,000]` (`SEARCH_WINDOW_SIZE`).
- Without one, the range is `[max(QUERY_FROM_BLOCK, head − lookback), latest]`, or `[head − lookback, latest]` when `QUERY_FROM_BLOCK` is unset.
- The current round passes the last `AppealDecision` block as `searchFrom`, and every past round in the execution period passes the Dispute event block [Q2].
- Contributions made more than 10,000 blocks after those points (about 33 hours on mainnet) are not counted [Q2].
- `reload()` passes no `searchFrom`, so contribution figures can change after an action [Q2].
- A query error returns `{}` (contributions) or `[]` (RulingFunded).

**Unslashed round shift** (today: `src/app.js:31, 846-853, 903-907`):
- For the Unslashed addresses (10.1) the contribution query uses round + 1 when the period is below 4.
- For the same addresses the `RulingFunded` query always uses round + 1.

**`eth_getLogs` limits.**
- The app's own ethers queries rely on the 50,000-block testnet lookback and the 10,000-block contribution windows; they do not paginate.
- Archon queries are single `getPastEvents` calls from block 0 on non-testnets.
- The Reality lookup alone handles range limits; its rules are in 9.1.

### 6.4 HTTP calls

| Call | Request | Today |
|---|---|---|
| Meta-evidence locator | `GET ${REACT_APP_METAEVIDENCE_URL}?chainId={network}&disputeId={id}` → JSON `{metaEvidenceUri}` | `src/app.js:689-693` |
| Meta-evidence JSON | `GET urlNormalize(uri)` on the IPFS gateway; only content-addressed URIs are fetched (9.1) | `src/app.js:704` |
| Dynamic script | `GET urlNormalize(dynamicScriptURI)` as text | `src/app.js:630-642` |
| Court policies | `GET uri` when it contains "http", otherwise `GET IPFS_GATEWAY + uri` | `src/app.js:254-266` |
| Evidence JSON | Archon axios `GET` through the gateway for IPFS URIs; http(s) URIs are fetched and checked against their multihash | `node_modules/@kleros/archon/src/standards/Arbitrable.js:54-131` |
| Atlas GraphQL | `POST ${REACT_APP_ATLAS_URI}/graphql` with the `nonce(address)` and `login(message, signature)` mutations | `src/utils/atlas-api.js:107-151, 189-195` |
| Atlas upload | `POST ${REACT_APP_ATLAS_URI}/ipfs/file`, multipart `file`, `name`, `product="CourtV1"`, `role` (`evidence` or `policy`), header `authorization: Bearer {token}`; returns the stored path as text | `src/utils/atlas-api.js:212-243` |
| Evidence display | the iframe `src`: the display URI plus a query string (9.4) | `src/components/disputeSummary.js:114-140` |
| Static assets | Bootstrap 4.3.1 CSS from maxcdn with SRI (`public/index.html:12-17`); Google Fonts Open Sans (`src/_base.scss:1`) | |

- `IPFS_GATEWAY` is `REACT_APP_IPFS_GATEWAY`, or `https://cdn.kleros.link` when unset (today: `src/utils/urlNormalizer.js:1`).
- Before an upload, a missing or expired token clears the stored auth data and throws "Not authenticated" (today: `src/utils/atlas-api.js:213-217`).
- An upload answered with HTTP 401 clears the stored auth data and throws "Unauthorized"; any other error status throws the response text.
- The GraphQL helper clears the stored auth data on an error message mentioning "auth", "unauthorized" or "token", or on HTTP 401, only for authenticated requests, and the app sends none: `nonce` and `login` are both unauthenticated (today: `src/utils/atlas-api.js:102-151, 189-195`).
- axios is not a declared dependency; it resolves to 0.21.4 through Archon.

### 6.5 localStorage

The app uses localStorage only; it sets no cookies and uses no sessionStorage.

| Key | Content | Lifetime | Today |
|---|---|---|---|
| `{chain}Subcourts`, `{chain}SubcourtDetails`, `{chain}LastModified` | `getSubcourt` results and policy JSON (big numbers as strings), and the write time | Reused for 3 hours | `src/app.js:211-273` |
| `{chain}{disputeID}` (concatenated, no separator) | The meta-evidence JSON as returned by the pipeline, used only by the Ongoing list; read back without validation; invalid or null results are not written | No expiry and no versioning [Q13] | `src/app.js:766-783` |
| `@@kleros/court/reality-question/v1/{chain}/{proxy}/{disputeId}` | Reality question data, shape-checked and bound to the registry entry on read, removed when invalid | Permanent | `src/ethereum/reality-question.js:361-400` |
| `#dispute_resolver_atlas_auth_token`, `#dispute_resolver_atlas_auth_account` | The SIWE access token and the lowercased signing account | Until an upload finds the token missing or expired, an upload gets HTTP 401, or `accountsChanged` reports a different account; an expired token stays stored but no longer counts as authenticated | `src/utils/atlas-api.js:15-85` |
| `@kleros/dispute-resolver/alert/smart-contract-wallet-warning:{address}` | `false` once the warning is dismissed | Permanent | `src/components/smartContractWalletWarning.js:18, 30-38, 73-76` |

---

## 7. Supported networks

(today: `src/ethereum/network-contract-mapping.js`)

| Chain | NAME | KLEROS_LIQUID | ARBITRABLE_PROXY | POLICY_REGISTRY | Other lists | RPC source | Lookback |
|---|---|---|---|---|---|---|---|
| 1 | Ethereum Mainnet | `0x988b3a538b618c7a603e1c11ab82cd16dbe28069` | `0x99489D7bb33539F3D1A401741E56e8f02B9AE0Cf` (npm artifact) | `0xCf1f07713d5193FaE5c1653C9f61953D048BECe4` | 4 Escrow V1, 2 governors | `REACT_APP_WEB3_PROVIDER_URL` | 1M |
| 5 | Ethereum Testnet Görli | `0x1128eD55ab2d796fa92D2F8E1f336d745354a77A` | `0x78ac5F189FC6DAB261437a7B95D11cAcf0234FFe` | `0x28c8A3A2E3c8Cd3F795DB83764316a1129a069bA` | — | `REACT_APP_WEB3_GOERLI_PROVIDER_URL` | 50k |
| 100 | Gnosis Network | `0x9C1dA9A04925bDfDedf0f6421bC7EEa8305F9002` | `0xC7aDD3C961f7935CB4914E37DA991D2f1Cd7986c` (npm artifact) | `0x9d494768936b6bDaabc46733b8D53A937A6c6D7e` | 1 governor | `REACT_APP_WEB3_XDAI_PROVIDER_URL` | 1M |
| 10200 | Gnosis Testnet Chiado | `0xD8798DfaE8194D6B4CD6e2Da6187ae4209d06f27` | `0x4BEf0321BD7fa943f85ae55e07f790c6beCbd177` | `0x53FC70FE1EC3a60f8939A62aBCc61bf1A57938D7` | — | `REACT_APP_WEB3_CHIADO_PROVIDER_URL` | 50k |
| 11155111 | Ethereum Testnet Sepolia | `0x90992fb4E15ce0C59aEFfb376460Fda4Ee19C879` | `0x009cA5A0B816156F91B29A93d7688c52480BaB24` | `0x88Fb25D399310c07d35cB9091b8346d8b1893aa5` | 4 Escrow V1 | `REACT_APP_WEB3_SEPOLIA_PROVIDER_URL` | 50k |
| 130 | Unichain Mainnet | — | null | chain 1's | | `REACT_APP_UNICHAIN` | 1M |
| 1301 | Unichain Testnet | — | null | Sepolia's | | `REACT_APP_UNICHAIN_SEPOLIA` | 50k |
| 137 | Polygon Mainnet | — | — | — | | `REACT_APP_WEB3_POLYGON_PROVIDER_URL` | 1M |
| 300 | zkSync Era Testnet Sepolia | — | null | Sepolia's | | hard-coded `https://sepolia.era.zksync.dev/` | 50k |
| 324 | zkSync Era Mainnet | — | null | chain 1's | | hard-coded `https://mainnet.era.zksync.io` | 1M |
| 690 | Redstone | — | null | chain 1's | | `REACT_APP_REDSTONE` | 1M |
| 42161 | Arbitrum One | — | null | chain 1's | | `REACT_APP_ARBITRUM_ONE` | 1M |
| 421614 | Arbitrum Testnet Sepolia | — | null | Sepolia's | | `REACT_APP_ARBITRUM_SEPOLIA` | 50k |
| 80001 | Polygon Testnet Mumbai | — | — | — | | `REACT_APP_WEB3_MUMBAI_PROVIDER_URL` | 50k |
| 11155420 | Optimism Testnet Sepolia | — | null | Sepolia's | | `REACT_APP_OPTIMISM_SEPOLIA` | 50k |
| 8453 | Base Mainnet | — | null | chain 1's | | `REACT_APP_BASE` | 1M |
| 84532 | Base Sepolia | — | null | Sepolia's | | `REACT_APP_BASE_SEPOLIA` | 50k |

**Other per-chain configuration.**
- `CURRENCY_SHORT` is "ETH", except "xDai" on 100 and 10200, "sETH" on 11155111 and 300, and "MATIC" on 137 and 80001.
- `CURRENCY_SHORT` appears only on the Create form and summary; the case page writes "ETH" on every chain [Q10].
- `QUERY_FROM_BLOCK` is 7303699 on chain 1, 5893941 on 5, 16895601 on 100, 1165867 on 10200 and 3635742 on 11155111; the entries without an arbitrator copy chain 1's, Görli's or Sepolia's value.
- Chain 84532 reads `arbitratorDeployedAtBlock["111155111"]`, a key that does not exist, so its `QUERY_FROM_BLOCK` is `undefined` [quirk] (today: line 227).
- The testnet set used for Archon start blocks is {5, 1301, 300, 421614, 80001, 10200, 11155111, 11155420, 84532} (today: lines 239-242).
- `ESCROW_V1_CONTRACTS` on chain 1 holds four addresses, one of which (`0x0d67440946949fe293b45c52efd8a9b3d51e2522`) is written in lowercase; the case-sensitive match against the checksummed `arbitrated` from ethers never matches that entry [Q12] (today: line 27).
- `GOVERNOR_CONTRACTS` holds poh.eth `0x327a29fcE0a6490E4236240Be176dAA282EcCfdF` and ubi-voting.eth `0x7510c77163683448b8Dc8fe9e019d9482Be1ed2b` on chain 1, and fork-dao.eth `0xf7dE5537eCD69a94695fcF4BCdBDeE6329b63322` on chain 100; kleros.eth is deliberately absent (today: lines 30-37).
- `FOREIGN_KLEROS_LIQUID` and `FOREIGN_ARBITRATOR_NETWORK_CODE` are set on the twelve entries without an arbitrator and are never read.

**What each kind of chain can do.**
- Chains with `KLEROS_LIQUID` (1, 5, 100, 10200, 11155111) support the Ongoing list, Create (all five have `ARBITRABLE_PROXY`) and the case page; chain 5 is a shut-down testnet with no RPC configured in the local environment.
- On the twelve chains without `KLEROS_LIQUID`, the Ongoing page shows "There is no arbitrator on this network, thus no disputes.", Create shows "There is no arbitrable contract deployed in this network…", and every case shows "Dispute with ID {id} does not exist on this network."
- Those twelve entries keep the app off the Unsupported Network screen when the wallet or URL is on those chains.
- Their RPC URLs feed the evidence-display parameters (9.4), the dynamic-script parameters (9.5) and the cross-chain Reality lookups (chains 130, 137 and 8453 are Reality.eth home chains).
- `getReadOnlyRpcUrl` reads `map[parseInt(chainId)].WEB3_PROVIDER` and throws a TypeError for any chain absent from the map (today: lines 234-237).

**Referenced but unsupported.**
- Chains 3, 4, 42 and 77 appear in the `arbitrators` table and the ArbitrableProxy artifact, and 3 and 42 in the footer's Etherscan prefixes, but have no map entry, so they show the Unsupported Network screen.
- Chain 10 (Optimism) has no map entry; `REACT_APP_OPTIMISM` exists in the local `.env` and is unused.
- `REACT_APP_ZKSYNC_ERA_TESTNET` exists in the local `.env` and is unused.
- Chains 5 and 80001 are shut-down testnets; chain 80001's foreign arbitrator is Görli's.

**Allowlists keyed by chain.**
- `arbitrableWhitelist` (`src/ethereum/arbitrableWhitelist.js`) covers chains 1, 100, 11155111, 300, 130, 137, 1301, 10200, 11155420, 8453 and 84532, stores lowercase addresses, and decides the evidence-display and dynamic-script sandbox flags (9.4, 9.5).
- `dynamicScriptWhitelist` (`src/ethereum/dynamicScriptWhitelist.js:76`) covers chains 1, 100, 11155111 and 10200; every other chain rejects every script.
- `REALITY_PROXIES` (`src/ethereum/reality-proxies.js`) has 29 entries keyed by arbitrator chain: 25 on chain 1 and 4 on chain 100, 16 single-chain and 13 cross-chain, with Reality.eth home chains 1, 100, 130, 137 and 8453; there is none for Sepolia or Chiado.

---

## 8. Wallet integration

### 8.1 Injected wallet only

- The app talks only to the injected `window.ethereum` provider (MetaMask or compatible) (today: `src/app.js:96-113, 168`).
- There is no WalletConnect, no EIP-6963 discovery and no connect button.

### 8.2 Provider initialization

`initiateWeb3Provider(networkOverride?)` runs at boot, again for a differing URL chain, and after a chain change (today: `src/app.js:163-186`):
1. With a wallet, it creates `walletProvider = new ethers.BrowserProvider(window.ethereum)` and awaits `signer = walletProvider.getSigner()`.
2. In ethers 6.15, `getSigner()` first calls `eth_accounts` and issues `eth_requestAccounts` only when the wallet exposes no account, so the wallet's connect prompt appears on page load when the site is not yet connected [Q6].
3. Without an override, the network is the wallet's chain ID as a decimal string.
4. Without a wallet and without an override, the network is `"1"`.
5. The read provider is `new ethers.JsonRpcProvider(networkMap[network].WEB3_PROVIDER)`; without a configured RPC it falls back to `walletProvider`, then to `ethers.getDefaultProvider()`.
6. It creates `archon = new Archon(rpcUrl ?? window.ethereum ?? provider, IPFS_GATEWAY)`.
7. It sets `network`, `provider`, `walletProvider`, `signer` and `archon` in one state update.

- When the user rejects the connect prompt, `getSigner` throws, `componentDidMount` stops, `network` stays `""`, and the app shows "Please enable a web3 provider." until the page is reloaded [Q6].
- `activeAddress` comes from the legacy MetaMask property `window.ethereum.selectedAddress`, not from the signer (today: `src/app.js:97`).
- The `signer` used for sign-in is the one created by the last provider initialization; an account change does not rebuild it.
- `src/utils/atlas-api.js:5-7` throws at module load when `REACT_APP_ATLAS_URI` is unset, so the app does not boot at all.

### 8.3 Account and chain changes

- On `accountsChanged`, the app sets `activeAddress` to the first account and clears the stored sign-in data when it does not belong to that account (today: `src/app.js:99-105`).
- On `chainChanged`, `handleNetworkChange` runs (today: `src/app.js:107-110, 127-145`):
  1. It first clears `subcourts` and `subcourtDetails`, sets `subcourtsLoading = true` and clears `lastDisputeID`.
  2. It then returns early when the new chain equals `state.network`, without rebuilding providers or reloading subcourts.
  3. Otherwise it sets `network`, rebuilds the providers, starts `loadSubcourtData` when the chain has `KLEROS_LIQUID`, and calls `syncUrlWithChain` (1.3).
- On the case page a chain change reloads the whole page (5.16).
- On the Ongoing page a chain change resets and re-fetches the list (3).
- On the Create page a chain change returns to page 1 and resets the form (4.1, 4.3).
- `componentWillUnmount` removes both listeners.

### 8.4 URL chain versus wallet chain

- At load, a differing URL chain wins for reads and triggers a `wallet_switchEthereumChain` request whose failure is only logged (1.3).
- When the user declines the switch, reads follow the URL chain while the wallet signs on its own chain, and nothing prevents a write from being sent to the same address on the wallet's chain [W3].

### 8.5 Read-only mode (no `window.ethereum`)

- The URL chain selects the read RPC, so any supported chain is viewable through `/:chainId/...`.
- `activeAddress` is empty, so the view-only banner shows and the "Create" header link is hidden.
- The Create page stays reachable by URL, sign-in fails with "Sign-in failed. Please try again." (no signer), and "Create" stays disabled.
- Every write fails in `getSignableContract` with "Provider is required for signable contract".
- The evidence submit control stays behind `SignIn` for compatible disputes.
- Without `REACT_APP_WEB3_PROVIDER_URL`, chain 1 reads fall back to `ethers.getDefaultProvider()` and Archon receives that provider object (the README documents this variable as the read-only RPC).

### 8.6 Sign-In with Ethereum

(today: `src/utils/atlas-api.js:144-209`)
1. The app requests a nonce with the GraphQL mutation `nonce(address)` and throws "Failed to get nonce" when none is returned.
2. It builds an EIP-4361 message: `{location.host} wants you to sign in with your Ethereum account:`, the address, the statement "Sign In to Kleros with Ethereum.", `URI: {location.origin}`, `Version: 1`, `Chain ID: {signer.provider.getNetwork().chainId}`, the nonce, `Issued At` (now) and `Expiration Time` (now + 10 minutes).
3. It signs the message with `signer.signMessage` (`personal_sign`).
4. It sends the GraphQL mutation `login(message, signature)`, takes `accessToken` from the result (parsing it as JSON when it is a string), and stores the token and the lowercased address (6.5).

Sign-in happens only when the user clicks "Sign in"; nothing prompts a signature at load.

---

## 9. Meta-evidence and evidence rendering

### 9.1 Meta-evidence fetch pipeline

`getMetaEvidence(arbitrated, disputeId)` serves both the case page (uncached) and the Ongoing list (through the cache of 6.5) (today: `src/app.js:673-764`).

**Retry budget.**
- The pipeline loops while less than 120 seconds have passed since it started.
- Any thrown error waits 5 seconds and starts a new attempt.
- No new attempt starts after 120 seconds, and the pipeline then returns `null`.
- The elapsed time is checked only before each attempt, so an attempt waiting on a dynamic script can run up to the script's 180-second timeout and the whole call can last more than three minutes.

**Steps of one attempt, in order:**
1. It fetches the locator `GET ${REACT_APP_METAEVIDENCE_URL}?chainId={network}&disputeId={id}`; when the response has no `metaEvidenceUri`, the pipeline returns `null` without retrying.
2. It rejects a URI that is not content-addressed by returning `{metaEvidenceJSON: INVALID, invalid: true}` (today: lines 699-702).
   - `isContentAddressed` strips a leading `ipfs:` or `fs:` with its slashes, then an optional `/` and `ipfs/`, and requires what remains to start with a CIDv0 (`Qm` + 44 base58 characters) or a base32 CIDv1 (`b` + at least 50 of `[a-z2-7]`) followed by `/`, `?`, `#` or the end (today: `src/utils/urlNormalizer.js:20-32`).
   - The check is on shape only and accepts any path after the CID, including `..` dot segments (plain, percent-encoded or with backslashes), which the gateway URL then resolves outside the CID, for example to an `/ipns/` path [W2].
3. It fetches the JSON from `urlNormalize(uri)` (the gateway).
4. It renames the legacy keys `evidenceDisplayInterfaceURL` to `evidenceDisplayInterfaceURI` and `evidenceDisplayInterfaceURLHash` to `evidenceDisplayInterfaceHash`; the latter is never read.
5. When `rulingOptions` exists without a `type`, it sets `type = "single-select"`.
6. When the arbitrable is a registered Reality proxy (`getRealityProxy(chain, arbitrated)`, lowercase lookup in `REALITY_PROXIES`), it skips the dynamic script entirely (10.4).
7. Otherwise, when `dynamicScriptURI` is set, it applies these gates in order:
   1. A `dynamicScriptURI` that is not content-addressed returns INVALID.
   2. A `dynamicScriptURI` whose `toIpfsPath` form is not an exact entry of `dynamicScriptWhitelist[network]` returns INVALID.
   3. Otherwise it fetches the script (for chain 1 dispute 1621, a different script; 10.5) and runs it in the runner of 9.5.
   4. A script fetch that is not ok yields no merge and no Reality status.
   5. It shallow-merges the script's result over the meta-evidence, so the script can replace any key (today: line 735).
   6. When the script text contains `populatedJSONForTemplate` (an unregistered Reality script), it sets `realityQuestion = {status: "unresolvable"}` and `rulingOptions = {type: "single-select", titles: []}` if the script's message reported duplicate JSON keys, and `realityQuestion = {status: "unverified"}` otherwise (today: lines 739-742).
8. For a registered Reality proxy whose meta-evidence is valid (an object with `title` or `rulingOptions`), it calls `fetchRealityQuestion` and `deriveRealityRulingOptions`, which set `rulingOptions`, `realityQuestion = {status, reason, divergent, questionId, templateId, title}` and, for entries with `questionOverride`, `question` (today: lines 745-751; `src/ethereum/reality-ruling-options.js:72-102`). An error here triggers the retry loop.
9. For valid meta-evidence, it applies `sanitizeRulingOptions` (today: line 754; `src/ethereum/reality-ruling-options.js:14-32`):
   - a non-object becomes `{type: "single-select", titles: []}`;
   - a non-string `type` becomes `"single-select"`;
   - `titles`, when present, becomes an array of strings (or `[]` when not an array);
   - `reserved`, when present, becomes an object of string values, or is removed when not an object;
   - a `precision` that is not a finite number is removed.
10. It returns `{metaEvidenceJSON}`.

**INVALID meta-evidence** has the title "Invalid or tampered case data, refuse to arbitrate.", the description "In case you have an AdBlock enabled, please disable it and refresh the page. It may be preventing the correct working of the page. If that's not the case, the data for this case is not formatted correctly or has been tampered since the time of its submission. Please refresh the page and refuse to arbitrate if the problem persists." and `rulingOptions: {type: "single-select", titles: []}` (today: lines 680-685). It is never cached.

**Reality question lookup** (`fetchRealityQuestion`, today: `src/ethereum/reality-question.js`):
- The dispute ID must be all digits.
- A cached entry that passes validation is returned without any request (lines 361-400).
- Concurrent lookups of the same dispute share one in-flight promise (lines 402-433).
- For disputes in `KNOWN_DISPUTE_QUESTIONS` (snapshot up to block 26162181 on chain 1 and 48685374 on chain 100), the lookup reads the `LogNewQuestion` log at the known block, the template block from `templates(id)` and the `LogNewTemplate` log at that block, and rejects a template ID different from the known one.
- For other disputes it finds the question ID from `DisputeIDToQuestionID` (single-chain proxies) or `ArbitrationCreated` (cross-chain proxies, trying `arbitrationCreatedBlock(id)` first where the entry allows it), searching only after the snapshot block and the proxy deployment block, then searches `LogNewQuestion` up to an upper bound and reads the template.
- Every log lookup requires exactly one matching log and otherwise throws "Expected exactly one … log, found N."
- A lookup tries the whole block range first; on a range-limit error (codes −32005, −32602, −32600, −32614, 413, or a matching message, excluding rate-limit wording) it scans backwards in windows of 10,000 blocks, 8 at a time, shrinking the window by 5 down to 100 blocks (lines 40-49, 161-202).
- Each lookup has a budget of 1,500 requests, a deadline of 90 seconds, a 20-second timeout per request, and retries other errors after 500 ms and 2 s.
- Reality requests go to the read RPC of the arbitrator chain and of the Reality.eth home chain, through `getReadOnlyRpcUrl`.
- A successful result is written to the cache of 6.5; failures are not cached, so each visit retries.

**Derived Reality options** (today: `src/ethereum/reality-ruling-options.js`, `src/ethereum/reality-safe-question.js`):
- The template is populated with a safe populator that encodes each parameter for its JSON context and rejects duplicate keys, key-set changes and type changes; `title_html` and `title_text` are always dropped.
- `bool` questions become single-select `["No", "Yes"]`, `uint` keeps its `decimals` as `precision`, single-select and multiple-select keep their outcomes, and `datetime` stays `datetime`; any other type has no options.
- Entries with `answeredTooSoon` (the default) add the reserved answer `0xFF…FF` titled "Answered Too Soon".
- Entries with `localizedLang: "es"` use "Sí" and "Respondió demasiado pronto" for Spanish questions.
- A safely populated question with options is `verified`; a best-effort rendering or a template-only result (bool, datetime, uint with literal decimals) is `malformed`; no options at all is `unresolvable` with empty single-select options.
- `divergent` is true when reality-eth-lib's unsafe rendering would give a different type, titles or precision, except for `unresolvable` questions.
- `questionOverride` replaces `question` with the rendered title, or with "{title}. {description}" for `title-description`.

### 9.2 Fields consumed

| Field | Effect | Today |
|---|---|---|
| `title` | Case heading; Ongoing card title (fallback "Meta Evidence Missing"); part of the validity check | `src/components/disputeSummary.js:105`, `src/containers/open-disputes.js:175`, `src/app.js:670-671` |
| `description` | Markdown with raw HTML escaped (5.6) | `src/components/disputeSummary.js:112` |
| `question` | Question panel text, possibly replaced by a Reality override | `src/components/disputeDetails.js:386` |
| `rulingOptions.type` | Question label, which card set renders, ruling formatting (hash → hex), current-ruling parsing | `src/components/disputeDetails.js:385-387, 531-603`, `src/containers/interact.js:489` |
| `rulingOptions.titles` | Voting-options list, card titles, `getAnswerString` outcomes | `src/components/disputeDetails.js:396, 533-559, 176` |
| `rulingOptions.descriptions` | "title: description" in the voting-options list, indexed by position, and by code for reserved options | `src/components/disputeDetails.js:397-411` |
| `rulingOptions.reserved` | `{hexCode: title}`; extra voting options and crowdfunding cards | `src/components/disputeDetails.js:403-413, 510-528` |
| `rulingOptions.precision` | Decimals for uint display, and for encoding with a default of 18 | `src/components/disputeDetails.js:175, 200`, `src/components/crowdfundingCard.js:29` |
| `fileURI` | Attachment link through the gateway | `src/components/disputeSummary.js:151-160` |
| `evidenceDisplayInterfaceURI` | Evidence-display iframe (9.4) | `src/components/disputeSummary.js:114-140` |
| `arbitrableInterfaceURI` | External link when https and not containing `resolve.kleros.io` | `src/components/disputeSummary.js:141-147` |
| `aliases` | `{address: name}` → "Party N" rows | `src/components/disputeSummary.js:62-89` |
| `category` | Only the exact value "Non-Standard Contract" has an effect (the banner); otherwise not displayed on the case page | `src/containers/interact.js:415, 504` |
| `dynamicScriptURI` | 9.1 step 7 | `src/app.js:725-743` |
| `arbitratorChainID`, `arbitrableChainID` | Evidence-display and script parameters; both default to the current chain | `src/containers/interact.js:558-559`, `src/app.js:645-646` |
| `_v` | `"0"` or absent → JSON query encoding; any other value → `URLSearchParams` | `src/components/disputeSummary.js:52-59` |
| `outcomes`, `template.outcomes`, `dispute.template.outcomes`, `question.outcomes` | Reality fallbacks for ruling text (when `rulingOptions` is absent) and for appeal cards | `src/components/disputeDetails.js:209-230, 575-595` |
| `realityQuestion` (derived) | Reality notice (5.10) | `src/components/realityQuestionNotice.js` |
| `fileTypeExtension`, `evidenceDisplayInterfaceHash`, `fileHash`, `selfHash` | Not read by the app itself; Archon may use `fileHash` and `selfHash` when validating http(s) evidence | |

### 9.3 Evidence JSON

(today: Archon `getEvidence`, `src/app.js:785-810`, `src/components/evidenceTimeline.js`)
- The heading is `title`, or `name` when `title` is empty.
- `description` is shown as plain text.
- `fileURI`, or the legacy `evidence` key copied into `fileURI` when `fileURI` is missing, is the attachment, with its icon chosen by file extension.
- An entry is shown only when Archon reports `evidenceJSONValid`; IPFS URIs through the gateway are treated as valid, and http(s) URIs must match their multihash.
- Entries whose Archon processing rejected carry no `evidenceJSONValid` and are hidden the same way.
- Archon's `fileValid` flag is ignored.
- The app writes `evidenceSide` (always 0) and never reads it.

### 9.4 Evidence-display iframe

(today: `src/components/disputeSummary.js:14-59, 114-140`)

**Source.**
- For the T2CR arbitrable `0xEbcf3bcA271B26ae4B162Ba560e243055Af0E679` (case-sensitive comparison), the source is forced to `/ipfs/QmYs17mAJTaQwYeXNTb6n4idoQXmRcAjREeUdjJShNSeKh/index.html` (10.6).
- A URI containing `://` is used as is; any other URI goes through `urlNormalize` (gateway).
- The resolved URI must parse as an `https:` URL, otherwise no iframe renders; any host is allowed and the URI is not checked for content addressing.

**Parameters.**

| Key | Value |
|---|---|
| `disputeID` | the arbitrator dispute ID |
| `chainID` | the current network, as an integer |
| `arbitratorContractAddress` | `KLEROS_LIQUID` of the current network |
| `arbitratorJsonRpcUrl` | the read RPC URL of `arbitratorChainID`, or the provider object when that chain has none |
| `arbitratorChainID` | meta-evidence `arbitratorChainID` or the current network, as an integer |
| `arbitrableContractAddress` | `arbitrated` |
| `arbitrableChainID` | meta-evidence `arbitrableChainID` or the current network, as an integer |
| `arbitrableJsonRpcUrl` | as for the arbitrator, for `arbitrableChainID` |
| `jsonRpcUrl` | the current chain's read RPC URL |

- With `_v` equal to `"0"` or absent, the `src` is `URI + "?" + encodeURIComponent(JSON.stringify(params))`.
- With any other `_v`, the `src` is `URI + "?" + new URLSearchParams(params)`.
- The page sends no `postMessage` to the iframe and passes no block-range parameters.

**Sandbox.**
- When `arbitrableWhitelist[arbitrableChainID]` contains the lowercased `arbitrated`, the iframe gets `allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox`.
- Otherwise it gets `allow-scripts` only.
- The iframe has no `referrerpolicy` or `allow` attribute.

**Size.** The iframe is 100% wide and a fixed 360 px high; `iframe-resizer-react` is installed and unused.

### 9.5 Dynamic-script runner

(today: `src/utils/utils.js:50-120`, called from `src/app.js:629-667`)

**Iframe.**
- The runner builds a hidden iframe with the `iframe` npm package 1.0.0, which turns the HTML into a `blob:` URL (inheriting the app's origin) and inserts the element at the end of `document.body` (today: `node_modules/iframe/index.js`).
- The iframe is hidden with `display: none` and is never removed; its blob URL is never revoked.
- The iframe body runs, in order: the duplicate-key JSON guard (only for scripts containing `populatedJSONForTemplate`), the RPC redirect patch, `const scriptParameters = {…}`, a `resolveScript`/`rejectScript` promise, the script text, and a call to `getMetaEvidence()`.
- The duplicate-key guard wraps `JSON.parse` so that a document with duplicate keys sets `window.__klerosJsonDuplicateKeys = true` and throws a `SyntaxError` (today: `src/ethereum/json-duplicate-key-guard.js`).
- The RPC redirect patch rewrites XHR and `fetch` requests aimed at one hard-coded legacy Infura mainnet URL to chain 1's read RPC URL, when that URL is configured (today: `src/utils/utils.js:6-48`).

**Sandbox flags.**
- The iframe always gets `allow-scripts`.
- It also gets `allow-same-origin` when `arbitrableWhitelist[arbitrableChainID]` contains the lowercased `arbitrableContractAddress`, so an allowlisted arbitrable's script runs with the app's own origin and can read the app's localStorage (including the Atlas token), DOM and `window.ethereum` [W5].

**Injected parameters** (today: `src/app.js:644-655`):
- `arbitratorChainID` is the meta-evidence `arbitratorChainID` or the current network.
- `arbitrableChainID` is the meta-evidence `arbitrableChainID` or the current network.
- `disputeID` is the arbitrator dispute ID.
- `arbitrableContractAddress` is `arbitrated`.
- `arbitratorJsonRpcUrl` and `arbitrableJsonRpcUrl` are `getReadOnlyRpcUrl` of the respective chain IDs.
- The parameters are embedded into the iframe's `<script>` as `JSON.stringify(scriptParameters)` without escaping `</script>`, the two chain IDs are taken from the meta-evidence without validation, and `getReadOnlyRpcUrl` accepts any value whose `parseInt` is a mapped chain [W4].
- A chain ID absent from the network map makes `getReadOnlyRpcUrl` throw, which fails the attempt and feeds the retry loop of 9.1.

**Result channel.**
- The script resolves its promise, and the iframe posts `{target: "script", result, jsonDuplicateKeys}` to `window.parent` with target origin `*`.
- The host receives it through the global `window.onmessage` handler, which accepts any message whose `data.target` is `"script"`, from any window or origin, without checking `event.source` or `event.origin` [W1].
- The runner reassigns `window.onmessage` on every run, so when several scripts run at once (the Ongoing list), the most recent run's promise resolves with whichever message arrives first, and earlier runs time out [Q5].
- Results crossed this way are cached permanently by the Ongoing list (6.5) [Q5].
- A run that receives no message rejects after 180 seconds ("The dynamic script for dispute {id} timed out.").
- The resolved value is `{result, jsonDuplicateKeys: data.jsonDuplicateKeys === true}`.

---

## 10. Special-case behavior by arbitrable

### 10.1 Unslashed

`EXCEPTIONAL_CONTRACT_ADDRESSES` holds `0xe0e1bc8C6cd1B81993e2Fcfb80832d814886eA38` and `0xb9f9B5eee2ad29098b9b3Ea0B401571F5dA4AD81`, applies on every chain and is matched case-sensitively (today: `src/app.js:31`). For these addresses:
- The appeal panel shows no "Invalid / Refused to Arbitrate / Tied" card (today: `src/components/disputeDetails.js:492`).
- When the current ruling is 0, every option uses the winner total and the full appeal period (today: `src/components/disputeDetails.js:77, 103`).
- Contribution queries use round + 1 while the period is below 4, and `RulingFunded` queries always use round + 1 (6.3).
- Withdrawal uses the IDisputeResolver v1 ABI with a ruling array (today: `src/app.js:1215-1218`).

### 10.2 Escrow V1

`ESCROW_V1_CONTRACTS` holds four mainnet and four Sepolia MultipleArbitrable(Token)Transaction addresses and is matched with a case-sensitive `includes` against the checksummed `arbitrated` (today: `src/ethereum/network-contract-mapping.js:27-28`). For a matching address:
- The local ID is `disputeIDtoTransactionID(id)`, with `null` on error (5.3).
- The appeal panel shows the single "Appeal - {cost} ETH" button instead of crowdfunding cards, and "Appeal period ended" in period 4 (5.11).
- The appeal sends `appeal(transactionID)` with `value = appealCost` (6.2).
- The funding total is `appealCost` (5.12).
- The lowercase mainnet entry `0x0d67440946949fe293b45c52efd8a9b3d51e2522` never matches, so that escrow follows the IDisputeResolver path instead [Q12].

### 10.3 Governors with evidence support

- `isGovernorWithEvidenceSupport(network, arbitrated)` matches the network's `GOVERNOR_CONTRACTS` case-insensitively (today: `src/ethereum/network-contract-mapping.js:244-251`).
- A matching dispute is never marked incompatible, even though its local dispute ID resolves to `null` (5.3 step 4).
- Evidence goes through `submitEvidence(string evidenceURI)` (6.2).
- Mainnet kleros.eth (`0xe5bcEa6F87aAEe4a81f64dfDB4d30d400e0e5cf4`) is not listed because it has no `submitEvidence` function, so its disputes are view-only.
- Governors have no other special rendering.

### 10.4 Reality.eth arbitrables

**Registered proxies** (`REALITY_PROXIES`, keyed `"{arbitratorChain}:{lowercase proxy}"`):
- Their dynamic script is never run (9.1 step 6).
- Their ruling options, Reality status, divergence flag and, for entries with `questionOverride`, their question text come from the on-chain question (9.1 step 8).
- Each entry fixes `answeredTooSoon`, `localizedLang` and `questionOverride` to reproduce the arbitrable's own script (today: `src/ethereum/reality-proxies.js:1-9`).
- Lookup failures go through the meta-evidence retry loop and end in "Failed to load metaevidence…" after the budget.

**Unregistered Reality scripts:**
- A whitelisted script whose text contains `populatedJSONForTemplate` runs with the duplicate-key guard injected (9.5).
- Its result marks the case `unverified`, or `unresolvable` with empty options when the script reported duplicate keys (9.1 step 7.6).
- A Reality script that does not contain that literal runs like any other script, with no guard and no Reality status.
- Sepolia and Chiado have no registered proxies, so their Reality disputes always run their scripts.

### 10.5 Dispute 1621 script override

- For network `"1"` and dispute ID `"1621"` (string comparison), the runner fetches `/ipfs/Qmf1k727vP7qZv21MDB8vwL6tfVEKPCUQAiw8CTfHStkjf` instead of the meta-evidence's `dynamicScriptURI` (today: `src/app.js:630-633`).
- The content-address and allowlist gates run on the meta-evidence's original `dynamicScriptURI` before the override applies, so the override CID's own allowlist entry has no effect (today: `src/app.js:726-734`, `src/ethereum/dynamicScriptWhitelist.js:21`).

### 10.6 T2CR evidence-display override

For the arbitrable `0xEbcf3bcA271B26ae4B162Ba560e243055Af0E679` (case-sensitive comparison), the evidence display is always `/ipfs/QmYs17mAJTaQwYeXNTb6n4idoQXmRcAjREeUdjJShNSeKh/index.html` through the gateway, whatever the meta-evidence says (today: `src/components/disputeSummary.js:115-118`).

### 10.7 `resolve.kleros.io` link suppression

- The "Go to arbitrable application from here" link is hidden when `arbitrableInterfaceURI` contains the substring `resolve.kleros.io` anywhere (today: `src/components/disputeSummary.js:141`).
- Disputes created by this app run the default script `/ipfs/QmZZHwVaXWtvChdFPG4UeXStKaC9aHamwQkNTEAfRmT2Fj`, which only sets the arbitrable interface link (today: `src/app.js:1115`, `src/ethereum/dynamicScriptWhitelist.js:17`).

### 10.8 IDisputeResolver v1 and v2

- The app loads both ABIs: v2 is `@kleros/dispute-resolver-interface-contract@8.0.0` (alias `IDRv2`) and v1 is `@1.0.2` (alias `IDRv1`) (today: `src/ethereum/interface.js:7-8, 20-21`).
- Every IDisputeResolver read and write uses v2, except two cases.
- `getTotalWithdrawableAmount` falls back to v1 (ruling array) when any v2 call throws (6.1).
- Withdrawal uses v1 for the Unslashed contracts (10.1).
- The `IArbitrable` and `IEvidence` ABIs are loaded and never used.

### 10.9 Appeal multipliers

(today: `src/utils/multipliers.js`)
1. The app first calls `getMultipliers()` and maps its four values to winner stake, loser stake, loser appeal period and denominator.
2. When that fails, it reads each field through the first getter that answers: `winnerStakeMultiplier` or `winnerMultiplier`; `loserStakeMultiplier` or `loserMultiplier`; `denominator`, `MULTIPLIER_DIVISOR` or `MULTIPLIER_DENOMINATOR`.
3. When either stake multiplier is missing, it returns `null`, which shows the "Appeal fees could not be calculated" warning (5.11).
4. A missing denominator defaults to 10000.
5. A missing `loserAppealPeriodMultiplier` defaults to half the denominator.

### 10.10 "Non-Standard Contract" category

- The yellow "Non-Standard Contract" banner (5.5) shows only when a dispute's own meta-evidence has `category` exactly "Non-Standard Contract".
- Nothing in the current code generates that category.

---

## 11. Degradation and failure behavior

### 11.1 Degrades gracefully

| Situation | Behavior |
|---|---|
| Arbitrable without IDisputeResolver | `externalIDtoLocalID` throws, the DisputeCreation fallback runs, the local ID is `null`, and the case is incompatible unless it is a listed governor: banner, disabled evidence button, decision-alert hint. Viewing works. |
| Multipliers unreadable | The warning "Appeal fees could not be calculated" replaces the cards (today: `src/components/disputeDetails.js:346-358`). |
| Locator returns no URI, or the retry budget runs out | The pipeline returns `null`: "Failed to load metaevidence…", `DisputeDetails` renders nothing, and the Ongoing card reads "Meta Evidence Missing". |
| Non-content-addressed meta-evidence or script URI, or a script not on the allowlist | INVALID meta-evidence: the "refuse to arbitrate" title and only the option-0 voting item; never cached. |
| Malformed `rulingOptions` | Sanitized (9.1 step 9), so the ruling-option code paths do not crash. |
| Reality question malformed, divergent, unresolvable or unverified | The matching notice (5.10); lookup errors retry and then end in `null`. |
| A single failed read on the case page | Per-read fallback values (5.3 step 3); the appeal-period and execution-period steps each have their own try/catch. |
| Evidence fetch failure | `getEvidences` returns `null`, and the panel shows no list and no footer; individual bad entries are hidden. |
| No ruling event yet | Archon throws, `getRuling` returns `null`, and the value is unused anyway. |
| Nonexistent dispute, or chain without an arbitrator | "Dispute with ID {id} does not exist on this network." |
| Ongoing list | A failing dispute is skipped; a total failure shows "Failed to load disputes."; `NETWORK_ERROR` with `event === "changed"` reloads the page. |
| Uploads | Size check and error text in the dropzone; an expired or invalid token clears auth and fails with "Not authenticated". |
| Smart-wallet check error | The warning stays hidden. |

### 11.2 Silent failures

These failures produce no user-facing message [Q7]:
- create-dispute upload, cost-read and transaction errors (4.6);
- evidence submission errors (5.14);
- `fundAppeal` and Escrow V1 `appeal` transaction errors (today: `src/app.js:1183-1186, 1202-1205`);
- withdraw errors (5.15).

Many `App` read functions wrap `return contract.x()` in a `try` without `await`, so their `catch` never runs and rejections propagate to the caller (today: `src/app.js:426, 465, 482, 499, 516, 533, 565, 582, 599, 616, 1039`).

### 11.3 Crashes and stuck states

With no error boundary, any render exception blanks the whole app.
- **Stuck:** `subcourtsLoading` stays `true` for the session when any IPFS policy fetch fails (2.2); the Create court dropdown reads "Loading..." and case pages render no details, because `DisputeDetails` needs subcourts.
- **Stuck:** "Please enable a web3 provider." stays when the wallet connect prompt is rejected [Q6].
- **Boot failure:** a missing `REACT_APP_ATLAS_URI` stops the app at module load (8.2).
- **Crash:** `getReadOnlyRpcUrl` throws for a chain ID missing from the network map; during `DisputeSummary` render this blanks the app (for example meta-evidence `arbitrableChainID: 10`), and inside the script runner it fails attempts until the retry budget returns `null` (today: `src/ethereum/network-contract-mapping.js:234-237`).
- **Crash:** `OngoingCard` throws when `subcourts` is non-empty and has no entry for the dispute's court (today: `src/components/ongoing-card.js:21`).
- **Crash:** `DisputeDetails` throws when the `getDispute` fallback object (no `votesLengths`) is used (today: `src/components/disputeDetails.js:308`).
- **Crash:** `CreateSummary` throws when `subcourtDetails` has no entry for the selected court (today: `src/components/createSummary.js:89`).
- **Crash:** the crowdfunding card's `AlertMessage type="danger"` throws as soon as a card error is shown (5.12) [quirk].
- **Crash:** a meta-evidence `title` or `question` that is a plain object throws when React renders it.
- **Unbounded:** a multiple-select question renders 2^n crowdfunding cards with no cap on n.

---

## 12. Build, tests and deploy today

### 12.1 Scripts and tooling

- `yarn start` and `yarn build` run `NODE_OPTIONS=--openssl-legacy-provider react-scripts start|build` (react-scripts 4.0.0, webpack 4), because webpack 4 hashing breaks on Node 17 and later.
- `yarn test` runs `react-scripts test`.
- `yarn reality:known-questions` runs `scripts/generate-reality-known-questions.js`, which regenerates `src/ethereum/reality-known-questions.js` up to the latest finalized block per arbitrator chain, re-verifying existing entries with single-block queries.
- `yarn reality:known-questions:check` recomputes the map with a full scan and exits 1 on any difference.
- `REALITY_OPS.md` asks for the regeneration periodically (for instance monthly), before a release, and always after changing `REALITY_PROXIES`.
- `scripts/check-quality.sh` and `scripts/pre-change-check.sh` print advisory greps and always exit 0.
- `package.json` sets `packageManager` to `yarn@4.9.2`, `engines.node` to `>=20.0.0`, Volta to Node 20.18.1 and Yarn 4.9.2, and the resolutions `@babel/core ^7.28.0` and `html-to-text ^7.0.0`.
- `.yarnrc.yml` sets `nodeLinker: node-modules`.
- `jsconfig.json` sets `baseUrl: src`, which the `components/…`, `containers/…`, `ethereum/…` and `assets/…` imports rely on.
- `src/app.scss` imports Bootstrap 5 SCSS and `antd/dist/antd.css`, while `public/index.html` also loads Bootstrap 4.3.1 CSS from maxcdn and react-bootstrap is 1.6.8 (Bootstrap 4 markup); the rendered look depends on this mix.

### 12.2 Deploy

- Netlify builds with `yarn build` and publishes `build` (today: `netlify.toml`).
- The build environment pins `NODE_VERSION = "20.18.1"`, `YARN_VERSION = "4.9.2"` and `CI = "false"`, so ESLint warnings do not fail the build.
- The only redirect rule is the single-page fallback `/* → /index.html` (200).
- No response headers are configured: there is no CSP, `frame-ancestors`, `X-Frame-Options`, `Referrer-Policy`, `nosniff` or `Permissions-Policy`, and there is no `_headers` file.
- Production environment values live in Netlify and are not visible in the repository; the local `.env` points `REACT_APP_ATLAS_URI` at the Atlas staging host and leaves `REACT_APP_IPFS_GATEWAY` and `REACT_APP_WEB3_GOERLI_PROVIDER_URL` unset.

### 12.3 Tests

| File | Covers | Tests |
|---|---|---|
| `src/app.test.js` | "renders without crashing" smoke test of `App` | 0 run: the suite fails to load because it imports `./App` while the file is `src/app.js` |
| `src/ethereum/dynamicScriptWhitelist.test.js` | URI-form normalization (`/ipfs/`, `ipfs://`, `fs://`), per-chain acceptance, rejection of other paths, https URLs and `undefined` | 3 |
| `src/ethereum/json-duplicate-key-guard.test.js` | Duplicate-key detection by the iframe guard | 4 |
| `src/ethereum/reality-safe-question.test.js` | Safe template population (including the real injection questions `0x7eea…` and `0xdd28…`), outcome and value encoding, `rulingOptionsFromRealityQuestion` and `rulingOptionsFromTemplate` | 23 |
| `src/ethereum/reality-ruling-options.test.js` | `deriveRealityRulingOptions` (divergence, overrides, v2 without reserved answer, `es` labels, malformed and unresolvable) and `sanitizeRulingOptions` | 9 |
| `src/ethereum/reality-question.test.js` | `fetchRealityQuestion` (known and unknown disputes, single- and cross-chain, windowing, shrinking, retries, rate limits, budget, deadline, `arbitrationCreatedBlock`, de-duplication, cache, concurrency), `isRangeLimitError`, `findLogs` | 39 (with `it.each` cases expanded) |

- The four Reality suites hold 75 tests (39 + 23 + 9 + 4), and with the 3 allowlist tests 78 tests pass.
- `CI=true yarn test --watchAll=false` reports 5 suites passed, 1 suite failed (`Cannot find module './App' from 'src/app.test.js'`), 78 of 78 tests passed, and Jest exits with status 1.
- The `./App` import would resolve on a case-insensitive filesystem.
- `src/setupTests.js` replaces `global.Uint8Array` with Node's so web3 hashing works under jsdom.
- There are no component or UI tests beyond the broken smoke test, and no tests for the `App` data functions, Atlas, multipliers, `urlNormalizer`, `urlValidation`, the script runner, sandbox selection or the gating in `getMetaEvidence`.

### 12.4 Continuous integration

- `.github/workflows/codeql-analysis.yml` runs JavaScript CodeQL on pushes to `master` and `legacy`, on pull requests to `master`, and weekly (cron `28 6 * * 4`), using `actions/checkout@v2` and `github/codeql-action/*@v1`.
- `.github/workflows/claude.yml` runs `anthropics/claude-code-action` (pinned by commit SHA) on issue, issue-comment, pull-request-review and review-comment events, with no `permissions:` block.
- No workflow runs the tests, the build or `reality:known-questions:check`.

---

## Appendix: not carried over

These parts of the source inventory are deliberately absent:
- The note about secrets in the local `.env`: it is not app behavior, and no secret or RPC URL is reproduced here.
- The inventory's reviewer remarks ("I checked…", "I did not run `yarn build` because it writes `build/`", "the `| tail` pipeline in your command reports 0"): they describe the investigation, not the app.
- Every keep/drop/decide assessment and the "preserve or fix" framing of the 13 quirks: rulings belong in `05-deviations-ledger.md`; here the quirks only appear as `[Q1]`–`[Q13]` tags.
