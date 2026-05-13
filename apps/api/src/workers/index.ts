// Re-export worker initialization functions
export { startComplianceCheckWorker, stopComplianceCheckWorker } from './compliance-check.worker.js';
export { startStudioGenerationWorker, stopStudioGenerationWorker } from './studio-generation.worker.js';

console.log('✅ Workers module loaded');
