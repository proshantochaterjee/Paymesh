# Sequence Diagrams

Mermaid sequence diagrams for the system's core flows. These are the
authoritative interaction contracts — implementation must match these
message orders, not the other way around.

## 1. Organization creation

```mermaid
sequenceDiagram
    actor Owner
    participant FE as Frontend
    participant BE as Backend
    participant SDK as packages/sdk
    participant Factory as payroll_factory
    participant Org as organization (new)
    participant Treasury as treasury (new)

    Owner->>FE: Submit "Create Organization" (name)
    FE->>BE: POST /organizations {name}
    BE->>SDK: buildCreateOrgIntent(owner, salt)
    SDK->>Factory: simulate create_organization
    Factory-->>SDK: unsigned XDR
    SDK-->>BE: intent
    BE-->>FE: 201 {intentId, unsignedXdr}
    FE->>Owner: Request wallet signature
    Owner-->>FE: signedXdr
    FE->>BE: POST /organizations/intents/:id/submit {signedXdr}
    BE->>SDK: submit(signedXdr)
    SDK->>Factory: create_organization(owner, salt)
    Factory->>Org: deploy + initialize
    Factory->>Treasury: deploy + initialize
    Factory-->>SDK: org_id, addresses (via tx result)
    SDK-->>BE: {orgId, orgAddress, treasuryAddress, txHash}
    BE->>BE: INSERT Organization row
    BE-->>FE: 202 {status: submitted, txHash}
    Note over BE: Event Indexer independently observes<br/>org_created and confirms consistency
```

## 2. Employee creation (two-phase)

```mermaid
sequenceDiagram
    actor HR
    participant FE as Frontend
    participant BE as Backend
    participant DB as Postgres
    participant SDK as packages/sdk
    participant Registry as employee_registry

    HR->>FE: Submit employee form
    FE->>BE: POST /organizations/:id/employees
    BE->>DB: INSERT Employee (onChainEmployeeId = NULL)
    BE-->>FE: 201 Employee (pending on-chain registration)
    FE->>BE: POST .../employees/:id/register-intent
    BE->>SDK: buildRegisterIntent(...)
    SDK->>Registry: simulate register_employee
    Registry-->>SDK: unsigned XDR
    SDK-->>BE: intent
    BE-->>FE: intent
    FE->>HR: Request wallet signature
    HR-->>FE: signedXdr
    FE->>BE: submit signedXdr
    BE->>SDK: submit
    SDK->>Registry: register_employee(...)
    Registry-->>SDK: employee_id, txHash
    BE->>DB: UPDATE Employee SET onChainEmployeeId, txHash
    BE-->>FE: 200 Employee (fully registered)
```

## 3. Payroll execution (single chunk, illustrative)

```mermaid
sequenceDiagram
    actor Finance
    participant FE as Frontend
    participant BE as Backend
    participant SDK as packages/sdk
    participant Engine as payroll_engine
    participant Treasury as treasury
    participant Registry as employee_registry
    participant Indexer as Event Indexer
    participant DB as Postgres

    Finance->>FE: Click "Execute" on SCHEDULED run
    FE->>BE: POST .../payroll-runs/:id/execute-intent
    BE->>SDK: simulate run_payroll(orgId, runId, employeeIds)
    SDK->>Engine: simulate
    Engine-->>SDK: simulated result + resource estimate
    BE->>BE: assert treasury.get_balance() >= total
    BE-->>FE: intent {unsignedXdr}
    FE->>Finance: Request wallet signature
    Finance-->>FE: signedXdr
    FE->>BE: submit signedXdr
    BE->>SDK: submit
    SDK->>Engine: run_payroll(authorizer, orgId, runId, employeeIds)
    Engine->>Registry: get_employee(orgId, id) [per item]
    Engine->>Treasury: transfer_out(authorizer, employeeWallet, amount) [per item]
    Treasury-->>Engine: ok / error
    Engine-->>SDK: PayrollResult {succeeded, failed}
    SDK-->>BE: txHash, result
    BE-->>FE: 202 {status: submitted, txHash}
    Indexer->>Indexer: poll getEvents for payroll_engine
    Indexer->>DB: UPSERT Transaction(s), UPDATE PayrollItem/PayrollRun status
    FE->>BE: poll GET .../payroll-runs/:id
    BE-->>FE: status: COMPLETED | PARTIAL
```

## 4. Milestone full lifecycle

```mermaid
sequenceDiagram
    actor Finance
    participant Engine as milestone_engine
    participant Treasury as treasury

    Finance->>Engine: create_milestone(orgId, contractor, amount)
    Engine-->>Finance: milestone_id (status: DRAFT)
    Finance->>Engine: fund_milestone(orgId, milestone_id)
    Engine->>Treasury: transfer_out(authorizer, to: engineAddress, amount)
    Treasury-->>Engine: ok
    Engine-->>Finance: status: FUNDED
    Finance->>Engine: approve_milestone(orgId, milestone_id)
    Engine-->>Finance: status: APPROVED
    Finance->>Engine: release_milestone(orgId, milestone_id)
    Engine->>Engine: transfer escrow -> contractor wallet
    Engine-->>Finance: status: RELEASED
```

## 5. Wallet login (challenge/response)

```mermaid
sequenceDiagram
    actor User
    participant FE as Frontend
    participant BE as Backend
    participant Wallet as Freighter
    participant Horizon

    User->>FE: Click "Sign in with wallet"
    FE->>Wallet: getAddress()
    Wallet-->>FE: address
    FE->>BE: POST /auth/wallet/challenge {address}
    BE-->>FE: {nonce, expiresAt}
    FE->>Wallet: signMessage("WorkforceOS auth challenge: " + nonce)
    Wallet-->>FE: signedNonce
    FE->>BE: POST /auth/wallet/verify {address, signedNonce}
    BE->>Horizon: getAccount(address) [fetch signers]
    Horizon-->>BE: account signers/thresholds
    BE->>BE: verify signature meets threshold
    BE-->>FE: 200 {user, session}
```
