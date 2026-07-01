/**
 * Backfill survey aggregate buckets from existing survey rows (one-time / repair).
 */
import { internalMutation } from './_generated/server';
import { syncSurveyAggregates } from './lib/surveyAggregates';

export const backfillSurveyAggregates = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existingBuckets = await ctx.db.query('surveyAggregateBuckets').collect();
    await Promise.all(existingBuckets.map((b) => ctx.db.delete(b._id)));
    const existingDaily = await ctx.db.query('surveyDailyRollups').collect();
    await Promise.all(existingDaily.map((d) => ctx.db.delete(d._id)));

    const surveys = await ctx.db.query('surveys').collect();
    await Promise.all(surveys.map((survey) => syncSurveyAggregates(ctx, null, survey)));

    return { surveysProcessed: surveys.length };
  },
});
