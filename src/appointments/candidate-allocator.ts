export interface CandidatePair {
  technicianId: string;
  serviceBayId: string;
}

export type ContestedResource = 'technician' | 'serviceBay';

export const DEFAULT_MAX_ALLOCATION_ATTEMPTS = 20;

/**
 * Walks technician and bay pairs in a deterministic order. When an insert
 * loses a race for a resource, every remaining pair that uses that resource is
 * skipped, so the number of attempts grows with the number of resources rather
 * than with the number of pairs.
 */
export class CandidateAllocator {
  private readonly technicianIds: string[];
  private readonly serviceBayIds: string[];
  private readonly takenTechnicians = new Set<string>();
  private readonly takenServiceBays = new Set<string>();
  private technicianIndex = 0;
  private serviceBayIndex = 0;
  private attempts = 0;

  constructor(
    technicianIds: readonly string[],
    serviceBayIds: readonly string[],
    private readonly maxAttempts = DEFAULT_MAX_ALLOCATION_ATTEMPTS,
  ) {
    this.technicianIds = [...technicianIds].sort();
    this.serviceBayIds = [...serviceBayIds].sort();
  }

  next(): CandidatePair | null {
    if (this.attempts >= this.maxAttempts) {
      return null;
    }

    while (this.technicianIndex < this.technicianIds.length) {
      const technicianId = this.technicianIds[this.technicianIndex];
      if (!this.takenTechnicians.has(technicianId)) {
        while (this.serviceBayIndex < this.serviceBayIds.length) {
          const serviceBayId = this.serviceBayIds[this.serviceBayIndex++];
          if (!this.takenServiceBays.has(serviceBayId)) {
            this.attempts++;
            return { technicianId, serviceBayId };
          }
        }
      }
      this.technicianIndex++;
      this.serviceBayIndex = 0;
    }
    return null;
  }

  markTaken(pair: CandidatePair, resource: ContestedResource): void {
    if (resource === 'technician') {
      this.takenTechnicians.add(pair.technicianId);
    } else {
      this.takenServiceBays.add(pair.serviceBayId);
    }
  }
}
