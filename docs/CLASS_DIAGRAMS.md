# Class Diagrams

Two views: on-chain contract structs (Rust) and backend domain classes
(TypeScript). Both must stay consistent with
[SMART_CONTRACT_SPECIFICATION.md](./SMART_CONTRACT_SPECIFICATION.md) and
[BACKEND_ARCHITECTURE.md](./BACKEND_ARCHITECTURE.md) respectively.

## 1. Contract data structures

```mermaid
classDiagram
    class Role {
        <<enum>>
        Owner
        Admin
        Finance
        Hr
        Viewer
    }

    class OrgRecord {
        Address organization
        Address treasury
        Address owner
    }

    class EmployeeRecord {
        Address wallet
        i128 salary
        Address currency
        PayFrequency frequency
        bool active
    }

    class PayFrequency {
        <<enum>>
        Weekly
        BiWeekly
        Monthly
    }

    class MilestoneRecord {
        Address contractor
        i128 amount
        MilestoneStatus status
    }

    class MilestoneStatus {
        <<enum>>
        Draft
        Funded
        Approved
        Released
        Cancelled
    }

    class WorkforceError {
        <<enum>>
        E_NOT_AUTHORIZED
        E_INSUFFICIENT_BALANCE
        E_RUN_ALREADY_EXECUTED
        ...
    }

    OrgRecord --> Role : role-holders reference
    EmployeeRecord --> PayFrequency
    MilestoneRecord --> MilestoneStatus
```

## 2. Backend domain layer (per-module pattern, `payroll` module shown as representative)

```mermaid
classDiagram
    class PayrollController {
        +createRun(dto) PayrollRunResponse
        +getRun(id) PayrollRunResponse
        +buildExecuteIntent(id) IntentResponse
        +submitExecuteIntent(id, intentId, dto) SubmitResponse
    }

    class PayrollService {
        -repo: IPayrollRepository
        -chainAdapter: IPayrollChainAdapter
        +createRun(orgId, input) PayrollRun
        +buildExecuteIntent(runId) Intent
        +submitExecuteIntent(intentId, signedXdr) SubmissionResult
    }

    class IPayrollRepository {
        <<interface>>
        +create(run) PayrollRun
        +findById(id) PayrollRun
        +updateStatus(id, status) void
    }

    class PrismaPayrollRepository {
        +create(run) PayrollRun
        +findById(id) PayrollRun
        +updateStatus(id, status) void
    }

    class IPayrollChainAdapter {
        <<interface>>
        +buildRunIntent(orgId, runId, employeeIds) Intent
        +submit(intentId, signedXdr) SubmissionResult
    }

    class PayrollChainAdapter {
        -sdk: WorkforceSdk
        +buildRunIntent(orgId, runId, employeeIds) Intent
        +submit(intentId, signedXdr) SubmissionResult
    }

    class PayrollRun {
        <<domain entity>>
        id: string
        status: PayrollRunStatus
        totalAmount: Decimal
        items: PayrollItem[]
        +snapshotItemsFrom(employees) void
    }

    class InsufficientTreasuryBalanceError {
        <<domain error>>
        shortfall: Decimal
    }

    PayrollController --> PayrollService
    PayrollService --> IPayrollRepository
    PayrollService --> IPayrollChainAdapter
    PrismaPayrollRepository ..|> IPayrollRepository
    PayrollChainAdapter ..|> IPayrollChainAdapter
    PayrollService --> PayrollRun
    PayrollService ..> InsufficientTreasuryBalanceError : throws
```

This dependency-inversion shape (`Service -> Interface <- Implementation`)
is identical across every backend module (`treasury`, `employees`,
`milestones`, etc.) per
[BACKEND_ARCHITECTURE.md](./BACKEND_ARCHITECTURE.md) §1 — only the entity
names and specific methods change.

## 3. Frontend feature composition (representative, `payroll` feature)

```mermaid
classDiagram
    class PayrollRunListPage {
        <<Server Component>>
    }
    class PayrollRunDetailPage {
        <<Server Component>>
    }
    class PayrollRunWizard {
        <<Client Component>>
        -form: UseFormReturn
    }
    class useSignAndSubmit {
        <<hook>>
        +buildIntent(params) Promise~Intent~
        +signAndSubmit(intent) Promise~Result~
    }
    class usePayrollRunQuery {
        <<hook, TanStack Query>>
    }

    PayrollRunListPage --> usePayrollRunQuery
    PayrollRunDetailPage --> usePayrollRunQuery
    PayrollRunWizard --> useSignAndSubmit
```
