import { Injectable } from "@nestjs/common";
import type { Contractor, ContractorStatus } from "@prisma/client";
import type { CreateContractorInput, UpdateContractorInput } from "@workforceos/shared";

import { DomainException } from "../../common/exceptions/domain.exception";
import { ContractorsRepository } from "./infra/contractors.repository";

/**
 * Postgres-only CRUD, no on-chain registry (docs/CONTRACTOR_MODEL.md §1-2:
 * a contractor's wallet is passed fresh into `milestone_engine.create_milestone`
 * each time rather than pre-registered, unlike employees). Originally
 * planned for Step 14 (module skeleton comments), moved up to Step 12
 * since Milestone.contractorId is a required FK — confirmed with you.
 */
@Injectable()
export class ContractorsService {
  constructor(private readonly repository: ContractorsRepository) {}

  private async requireContractor(organizationId: string, contractorId: string): Promise<Contractor> {
    const contractor = await this.repository.findById(organizationId, contractorId);
    if (!contractor) {
      throw new DomainException("CONTRACTOR_NOT_FOUND", "No such contractor.");
    }
    return contractor;
  }

  async list(organizationId: string, filters: { status?: ContractorStatus }): Promise<Contractor[]> {
    return this.repository.findMany(organizationId, filters);
  }

  async getById(organizationId: string, contractorId: string): Promise<Contractor> {
    return this.requireContractor(organizationId, contractorId);
  }

  async create(organizationId: string, input: CreateContractorInput): Promise<Contractor> {
    return this.repository.create({ organizationId, ...input });
  }

  async update(organizationId: string, contractorId: string, input: UpdateContractorInput): Promise<Contractor> {
    await this.requireContractor(organizationId, contractorId);
    return this.repository.update(contractorId, input);
  }

  async deactivate(organizationId: string, contractorId: string): Promise<Contractor> {
    await this.requireContractor(organizationId, contractorId);
    return this.repository.deactivate(contractorId);
  }
}
