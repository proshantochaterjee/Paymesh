# Entity-Relationship Diagram

Mermaid ER diagram matching [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md)
exactly. Keep both in sync on any schema change.

```mermaid
erDiagram
    USER ||--o{ ORGANIZATION_MEMBER : "has"
    USER ||--o{ SESSION : "has"
    USER ||--o{ WALLET : "owns"
    USER ||--o{ AUDIT_LOG : "performs"

    ORGANIZATION ||--o{ ORGANIZATION_MEMBER : "has"
    ORGANIZATION ||--o{ DEPARTMENT : "has"
    ORGANIZATION ||--o{ EMPLOYEE : "employs"
    ORGANIZATION ||--o{ CONTRACTOR : "engages"
    ORGANIZATION ||--o{ PAYROLL_RUN : "runs"
    ORGANIZATION ||--o{ MILESTONE : "funds"
    ORGANIZATION ||--o{ TRANSACTION : "records"
    ORGANIZATION ||--o{ WALLET : "registers"
    ORGANIZATION ||--o{ AUDIT_LOG : "logs"

    DEPARTMENT ||--o{ EMPLOYEE : "groups"

    EMPLOYEE ||--o{ PAYROLL_ITEM : "receives"
    PAYROLL_RUN ||--o{ PAYROLL_ITEM : "contains"

    CONTRACTOR ||--o{ MILESTONE : "is paid via"

    USER {
        string id PK
        string email UK
        string primaryWallet UK
    }

    ORGANIZATION {
        string id PK
        string slug UK
        bigint onChainOrgId UK
        string organizationContractAddr UK
        string treasuryContractAddr UK
    }

    ORGANIZATION_MEMBER {
        string id PK
        string organizationId FK
        string userId FK
        enum role
    }

    DEPARTMENT {
        string id PK
        string organizationId FK
        string name
    }

    EMPLOYEE {
        string id PK
        string organizationId FK
        string departmentId FK
        bigint onChainEmployeeId
        string walletAddress
        decimal salaryAmount
        enum payFrequency
        enum status
    }

    CONTRACTOR {
        string id PK
        string organizationId FK
        string walletAddress
        enum status
    }

    PAYROLL_RUN {
        string id PK
        string organizationId FK
        enum status
        decimal totalAmount
    }

    PAYROLL_ITEM {
        string id PK
        string payrollRunId FK
        string employeeId FK
        decimal amount
        enum status
        string stellarTxHash
    }

    MILESTONE {
        string id PK
        string organizationId FK
        string contractorId FK
        bigint onChainMilestoneId
        decimal amount
        enum status
    }

    TRANSACTION {
        string id PK
        string organizationId FK
        enum type
        enum status
        decimal amount
        string stellarTxHash UK
        bigint ledgerSequence
    }

    WALLET {
        string id PK
        string organizationId FK
        string userId FK
        string address UK
        boolean isTreasury
    }

    AUDIT_LOG {
        string id PK
        string organizationId FK
        string actorUserId FK
        string action
        string entityType
    }

    SESSION {
        string id PK
        string userId FK
        string token UK
    }
```

## Notes

- `IndexerCursor` is intentionally omitted from this diagram — it has no
  relationship to organizational data; it's infrastructure bookkeeping for
  the Event Indexer, documented in
  [EVENT_INDEXING.md](./EVENT_INDEXING.md).
- Every entity except `User`, `Session`, and `IndexerCursor` carries an
  `organizationId` — this is the tenant-isolation boundary enforced at the
  Prisma query layer (every repository method requires an `organizationId`
  argument; there is no "get all employees" query without an org scope).
