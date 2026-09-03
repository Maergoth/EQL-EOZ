import { ROUTE_CORPUS, runRouteCorpus } from '../app/route-corpus.js';

const report = runRouteCorpus(ROUTE_CORPUS);
if (report.passRate < .95 || report.segmentPolicyViolations > 0) {
    console.error(JSON.stringify(report.failures, null, 2));
    throw new Error(`Route corpus failed: ${report.passed}/${report.total}, ${report.segmentPolicyViolations} segment-policy violations.`);
}

const categories = new Set(report.results.map(result => result.category));
for (const category of ['outdoor', 'indoor', 'stacked-floor', 'ramp', 'door', 'drop', 'elevation']) {
    if (!categories.has(category)) throw new Error(`Route corpus is missing the ${category} category.`);
}

console.log(`Route corpus passed: ${report.passed}/${report.total} expectations (${Math.round(report.passRate * 100)}%), ${report.segmentPolicyViolations} segment-policy violations.`);

