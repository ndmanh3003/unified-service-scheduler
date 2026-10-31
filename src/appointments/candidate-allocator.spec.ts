import { CandidateAllocator } from './candidate-allocator.js';

const drain = (allocator: CandidateAllocator) => {
  const pairs: string[] = [];
  for (let pair = allocator.next(); pair; pair = allocator.next()) {
    pairs.push(`${pair.technicianId}/${pair.serviceBayId}`);
  }
  return pairs;
};

describe('CandidateAllocator', () => {
  it('yields every technician and bay pair in a deterministic order', () => {
    const allocator = new CandidateAllocator(['t2', 't1'], ['b2', 'b1']);

    expect(drain(allocator)).toEqual(['t1/b1', 't1/b2', 't2/b1', 't2/b2']);
  });

  it('yields nothing when either list is empty', () => {
    expect(drain(new CandidateAllocator([], ['b1']))).toEqual([]);
    expect(drain(new CandidateAllocator(['t1'], []))).toEqual([]);
  });

  it('skips every pair that uses a technician reported as taken', () => {
    const allocator = new CandidateAllocator(['t1', 't2'], ['b1', 'b2']);

    expect(allocator.next()).toEqual({
      technicianId: 't1',
      serviceBayId: 'b1',
    });
    allocator.markTaken(
      { technicianId: 't1', serviceBayId: 'b1' },
      'technician',
    );

    expect(drain(allocator)).toEqual(['t2/b1', 't2/b2']);
  });

  it('skips every pair that uses a bay reported as taken', () => {
    const allocator = new CandidateAllocator(['t1', 't2'], ['b1', 'b2']);

    allocator.next();
    allocator.markTaken(
      { technicianId: 't1', serviceBayId: 'b1' },
      'serviceBay',
    );

    expect(drain(allocator)).toEqual(['t1/b2', 't2/b2']);
  });

  it('stops after the maximum number of attempts', () => {
    const allocator = new CandidateAllocator(
      ['t1', 't2', 't3'],
      ['b1', 'b2', 'b3'],
      2,
    );

    expect(drain(allocator)).toEqual(['t1/b1', 't1/b2']);
  });
});
