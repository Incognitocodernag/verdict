import { calculateVerdict } from '../services/mathEngine';
import { LlmOutputSchema, LlmOutput } from '../schemas/schemas';

/**
 * Runs a suite of unit and integration tests to verify V3 logic:
 * - 0 Reviews (INSUFFICIENT DATA, Tier 5, Gray badge)
 * - 1-9 Reviews (LOW VOLUME Warning flag active)
 * - 100+ Reviews scale weighted calculations
 */
async function runTests() {
  console.log('=================================================');
  console.log(' STARTING VERDICT BACKEND V3 INTEGRATION TESTS');
  console.log('=================================================\n');

  const nowISO = new Date().toISOString();

  // Test Case 1: 0 Reviews -> INSUFFICIENT DATA
  console.log('--- TEST 1: Empty Reviews state ---');
  const reviewsEmpty: any[] = [];
  const mockLlmOutput: LlmOutput = {
    R_total: 0, N_spam: 0, N_fatal: 0, N_nuance: 0, S_mismatch: 0, S_hijacked: 0,
    aspects: {}, pros: ['p1', 'p2', 'p3'], cons: ['c1', 'c2', 'c3'],
    verdict_reason: 'No reviews found', fatal_flaw_summary: '',
    reviews_analysis: []
  };

  const resultEmpty = calculateVerdict(reviewsEmpty, mockLlmOutput);
  const passEmpty = resultEmpty.tier === 5 && resultEmpty.verdictDirective === 'INSUFFICIENT DATA' && resultEmpty.badgeColor === 'gray';
  console.log(`${passEmpty ? '✅' : '❌'} 0 reviews mapping: Got Tier ${resultEmpty.tier} (${resultEmpty.verdictDirective}), badge color: ${resultEmpty.badgeColor}`);
  if (!passEmpty) process.exit(1);

  // Test Case 2: Low Volume reviews flag
  console.log('\n--- TEST 2: Low review volume flag (1-9 reviews) ---');
  const reviewsLowVolume = [
    { isVerified: true, helpfulVotes: 2, rating: 5, date: nowISO }
  ];
  const llmOutputLow: LlmOutput = {
    R_total: 1, N_spam: 0, N_fatal: 0, N_nuance: 0, S_mismatch: 0, S_hijacked: 0,
    aspects: { quality: 0.8 }, pros: ['p1', 'p2', 'p3'], cons: ['c1', 'c2', 'c3'],
    verdict_reason: 'Fine', fatal_flaw_summary: '',
    reviews_analysis: [{ classification: 'none', persona: 'casual' }]
  };

  const resultLow = calculateVerdict(reviewsLowVolume, llmOutputLow);
  const passLow = resultLow.lowVolume === true && resultLow.tier === 1;
  console.log(`${passLow ? '✅' : '❌'} Low volume warning flag check: Got lowVolume=${resultLow.lowVolume}, Tier ${resultLow.tier}`);
  if (!passLow) process.exit(1);

  // Test Case 3: 100 Reviews Scale calculation
  console.log('\n--- TEST 3: 100-Review Scale calculations ---');
  const reviews100: any[] = [];
  const analysis100: any[] = [];

  // Generate 100 reviews (80 positive, 15 spam, 5 fatal defects)
  for (let i = 0; i < 100; i++) {
    if (i < 15) {
      reviews100.push({ isVerified: false, helpfulVotes: 0, rating: 5, date: nowISO });
      analysis100.push({ classification: 'spam', persona: 'casual' });
    } else if (i < 20) {
      reviews100.push({ isVerified: true, helpfulVotes: 5, rating: 1, date: nowISO });
      analysis100.push({ classification: 'safety', persona: 'critic' });
    } else {
      reviews100.push({ isVerified: true, helpfulVotes: 2, rating: 5, date: nowISO });
      analysis100.push({ classification: 'none', persona: 'casual' });
    }
  }

  const llmOutput100: LlmOutput = {
    R_total: 100, N_spam: 15, N_fatal: 5, N_nuance: 0, S_mismatch: 0, S_hijacked: 0,
    aspects: { quality: 0.9 }, pros: ['p1', 'p2', 'p3'], cons: ['c1', 'c2', 'c3'],
    verdict_reason: 'Calculated at scale', fatal_flaw_summary: 'Occasional burn alerts',
    reviews_analysis: analysis100
  };

  const result100 = calculateVerdict(reviews100, llmOutput100);
  // With 5 safety defects out of 85 organic reviews, weighted defect frequency should trigger Tier 3 (AVOID)
  const pass100 = result100.tier === 3 && result100.badgeColor === 'red';
  console.log(`${pass100 ? '✅' : '❌'} 100-Review Math calculations: Got Tier ${result100.tier} (${result100.verdictDirective}), Authenticity: ${Math.round(result100.A * 100)}%`);
  if (!pass100) process.exit(1);

  // Test Case 4: Zod V3 Schema validation
  console.log('\n--- TEST 4: V3 Zod Schema Validation ---');
  const validPayload = {
    R_total: 100,
    N_spam: 15,
    N_fatal: 5,
    N_nuance: 0,
    S_mismatch: 0,
    S_hijacked: 0,
    aspects: { fabric_quality: 0.8 },
    pros: ['p1', 'p2', 'p3'],
    cons: ['c1', 'c2', 'c3'],
    verdict_reason: 'Consolidated reviews output.',
    fatal_flaw_summary: 'Burns',
    reviews_analysis: analysis100
  };

  const parsedValid = LlmOutputSchema.safeParse(validPayload);
  console.log(`${parsedValid.success ? '✅' : '❌'} V3 Zod schema parsing: ${parsedValid.success ? 'Success' : 'Failed'}`);
  if (!parsedValid.success) process.exit(1);

  console.log('\n=================================================');
  console.log(' ALL V3 INTEGRATION TESTS PASSED SUCCESSFULLY!');
  console.log('=================================================');
}

runTests().catch(err => {
  console.error('V3 test execution failed:', err);
  process.exit(1);
});
