# OpenAPI Specification

The authoritative machine-readable spec is generated at build time from
NestJS controller decorators (`@nestjs/swagger`) and served at
`/api/docs` (Swagger UI) and `/api/docs-json` (raw spec) by the running
backend. This document is the checked-in **reference skeleton** that
generated output must remain a superset of — used in CI to diff-check
that no documented endpoint from [API_SPECIFICATION.md](./API_SPECIFICATION.md)
silently disappears from the generated spec.

```yaml
openapi: 3.0.3
info:
  title: WorkforceOS API
  version: 1.0.0
  description: >
    Off-chain organizational data and on-chain transaction orchestration
    for WorkforceOS. See /docs/API_SPECIFICATION.md for full narrative
    documentation.
servers:
  - url: /api/v1
security:
  - bearerAuth: []
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
  schemas:
    Error:
      type: object
      required: [error, message]
      properties:
        error: { type: string, example: VALIDATION_ERROR }
        message: { type: string }
        details: { type: object, nullable: true }
    Organization:
      type: object
      required: [id, name, slug, onChainOrgId, organizationContractAddr, treasuryContractAddr]
      properties:
        id: { type: string }
        name: { type: string }
        slug: { type: string }
        onChainOrgId: { type: string }
        organizationContractAddr: { type: string }
        treasuryContractAddr: { type: string }
    Employee:
      type: object
      required: [id, fullName, email, walletAddress, salaryAmount, salaryCurrency, payFrequency, status]
      properties:
        id: { type: string }
        fullName: { type: string }
        email: { type: string, format: email }
        walletAddress: { type: string }
        salaryAmount: { type: string, description: "Decimal as string, 7dp" }
        salaryCurrency: { type: string, example: USDC }
        payFrequency: { type: string, enum: [WEEKLY, BI_WEEKLY, MONTHLY] }
        status: { type: string, enum: [ACTIVE, INACTIVE] }
    PayrollRun:
      type: object
      properties:
        id: { type: string }
        status: { type: string, enum: [DRAFT, SCHEDULED, EXECUTING, COMPLETED, PARTIAL, FAILED] }
        totalAmount: { type: string }
        items:
          type: array
          items: { $ref: '#/components/schemas/PayrollItem' }
    PayrollItem:
      type: object
      properties:
        id: { type: string }
        employeeId: { type: string }
        amount: { type: string }
        status: { type: string, enum: [PENDING, PAID, FAILED] }
        stellarTxHash: { type: string, nullable: true }
        failureReason: { type: string, nullable: true }
    Milestone:
      type: object
      properties:
        id: { type: string }
        contractorId: { type: string }
        title: { type: string }
        amount: { type: string }
        status: { type: string, enum: [DRAFT, FUNDED, APPROVED, RELEASED, CANCELLED] }
    Transaction:
      type: object
      properties:
        id: { type: string }
        type: { type: string, enum: [DEPOSIT, WITHDRAWAL, PAYROLL_DISBURSEMENT, MILESTONE_FUND, MILESTONE_RELEASE, MILESTONE_REFUND] }
        status: { type: string, enum: [SUBMITTED, CONFIRMED, FAILED] }
        amount: { type: string }
        stellarTxHash: { type: string }
    Intent:
      type: object
      properties:
        intentId: { type: string }
        unsignedXdr: { type: string }
        expiresAt: { type: string, format: date-time }
paths:
  /organizations:
    get:
      summary: List organizations the caller belongs to
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                type: object
                properties:
                  data:
                    type: array
                    items: { $ref: '#/components/schemas/Organization' }
    post:
      summary: Create a new organization (deploys organization + treasury contracts)
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [name]
              properties:
                name: { type: string }
      responses:
        '201':
          description: Created
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Organization' }
        '409': { description: Slug already taken, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
        '502': { description: Chain submission failed, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }

  /organizations/{id}/employees:
    get:
      summary: List employees
      parameters:
        - { name: id, in: path, required: true, schema: { type: string } }
        - { name: status, in: query, schema: { type: string, enum: [ACTIVE, INACTIVE] } }
        - { name: page, in: query, schema: { type: integer, default: 1 } }
        - { name: pageSize, in: query, schema: { type: integer, default: 20 } }
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                type: object
                properties:
                  data:
                    type: array
                    items: { $ref: '#/components/schemas/Employee' }
                  meta:
                    type: object
                    properties:
                      page: { type: integer }
                      pageSize: { type: integer }
                      total: { type: integer }
    post:
      summary: Create employee (writes DB row, then registers on-chain)
      parameters:
        - { name: id, in: path, required: true, schema: { type: string } }
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/Employee' }
      responses:
        '201':
          description: Created
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Employee' }

  /organizations/{id}/payroll-runs/{runId}/execute-intent:
    post:
      summary: Simulate and build unsigned XDR for one payroll chunk
      parameters:
        - { name: id, in: path, required: true, schema: { type: string } }
        - { name: runId, in: path, required: true, schema: { type: string } }
      responses:
        '201':
          description: Intent created
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Intent' }
        '422': { description: Insufficient treasury balance, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }

  /organizations/{id}/payroll-runs/{runId}/execute-intent/{intentId}/submit:
    post:
      summary: Submit a signed payroll execution intent
      parameters:
        - { name: id, in: path, required: true, schema: { type: string } }
        - { name: runId, in: path, required: true, schema: { type: string } }
        - { name: intentId, in: path, required: true, schema: { type: string } }
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [signedXdr]
              properties:
                signedXdr: { type: string }
      responses:
        '202':
          description: Submitted
          content:
            application/json:
              schema:
                type: object
                properties:
                  status: { type: string, example: submitted }
                  stellarTxHash: { type: string }
        '410': { description: Intent expired }
        '409': { description: Intent already submitted }

  /organizations/{id}/milestones/{milestoneId}/release-intent:
    post:
      summary: Build unsigned XDR to release an approved milestone
      parameters:
        - { name: id, in: path, required: true, schema: { type: string } }
        - { name: milestoneId, in: path, required: true, schema: { type: string } }
      responses:
        '201':
          description: Intent created
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Intent' }

  /organizations/{id}/transactions:
    get:
      summary: Paginated on-chain transaction history for the org
      parameters:
        - { name: id, in: path, required: true, schema: { type: string } }
        - { name: type, in: query, schema: { type: string } }
        - { name: status, in: query, schema: { type: string } }
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                type: object
                properties:
                  data:
                    type: array
                    items: { $ref: '#/components/schemas/Transaction' }
```

Full endpoint list (including auth, contractors, analytics) is enumerated
narratively in [API_SPECIFICATION.md](./API_SPECIFICATION.md); this file
shows the representative schema/path patterns rather than duplicating
every path in YAML by hand — the generated spec from `@nestjs/swagger`
is the exhaustive version once the backend exists.
