import WebhookHandler from './src/webhookHandler.js';

// test-webhook-forward.js
const testWebhookData = {
  webhookId: 'wh_test_123',
  endpointPath: 'test/webhook',
  payload: { action: 'test', data: 'sample' },
  headers: { 'user-agent': 'test-client', 'content-type': 'application/json' },
  sourceIp: '127.0.0.1',
  timestamp: new Date().toISOString(),
  metadata: {
    platform: 'custom',
    webhookName: 'Test Webhook',
    validation: { security: true, authentication: true }
  }
};

// Test sanitizeHeaders
const testHeaders = {
  'authorization': 'Bearer secret-token',
  'user-agent': 'test-client',
  'x-api-key': 'secret-key',
  'content-type': 'application/json'
};

console.log('Sanitized headers:', WebhookHandler.sanitizeHeaders(testHeaders));
// Output: { 'user-agent': 'test-client', 'content-type': 'application/json', authorization: '***REDACTED***', 'x-api-key': '***REDACTED***' }