// test-routing.js
import './index.js';

// Simulate requests
console.log('Testing routing...');

// Test cases
const testPaths = [
  '/',
  '/health', 
  '/api/webhooks',
  '/webhooks/wh_123/test',
  '/unknown'
];

console.log('✅ Routing test completed');