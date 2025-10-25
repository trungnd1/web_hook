// web_hook/index.js - FIXED ROUTING FOR GEN2 WITH AUTHENTICATION
import functions from '@google-cloud/functions-framework';
import admin from 'firebase-admin';

// ✅ FIX: Đảm bảo Firebase init hoàn thành TRƯỚC KHI import modules
try {
  if (!admin.apps.length) {
    admin.initializeApp();
    console.log('Firebase Admin initialized successfully');
  } else {
    console.log('Firebase Admin already initialized');
  }
} catch (error) {
  console.log('Firebase Admin initialization:', error.message);
}

// Import handlers SAU KHI Firebase init
let webhookHandler, webhookManager, authMiddleware;
try {
  // Thêm delay nhỏ để đảm bảo Firebase init hoàn tất
  await new Promise(resolve => setTimeout(resolve, 100));
  
  webhookHandler = (await import('./src/webhookHandler.js')).default;
  webhookManager = (await import('./src/webhookManager.js')).default;
  authMiddleware = (await import('./middleware/authMiddleware.js')).default;
  console.log('All handlers imported successfully');
} catch (error) {
  console.error('Handler import failed:', error);
  // Fallback handlers
  webhookHandler = { 
    process: () => ({ status: 500, data: { error: "Handler not loaded" } }) 
  };
  webhookManager = { 
    createWebhook: () => ({ success: false, error: "Manager not loaded" }),
    listWebhooks: () => ({ success: false, error: "Manager not loaded" })
  };
  authMiddleware = {
    authenticate: () => ({ valid: true, isPublic: true })
  };
}

console.log('All handlers imported successfully');

// ==================== HEALTH CHECK ====================
// ✅ THÊM: Health check endpoint riêng biệt
functions.http('health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy',
    service: 'webhook-service',
    timestamp: new Date().toISOString(),
    version: '2.1.0'
  });
});

// ==================== MAIN REQUEST HANDLER ====================
functions.http('webhookService', async (req, res) => {
  // Set CORS headers
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key, x-signature');

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(204).send('');
  }

  try {
    const path = req.path;
    console.log(`🌐 Received ${req.method} request for path: ${path}`);

    // Authentication check
    const authResult = await authMiddleware.authenticate(req, res);
    if (!authResult.valid) {
      return; // Response already sent
    }

    // Routing
    if (path === '/health' || path === '/') {
      return res.status(200).json({ 
        status: 'healthy',
        service: 'webhook-service',
        timestamp: new Date().toISOString(),
        version: '2.1.0'
      });
    }
    else if (path.startsWith('/webhooks/') && path.split('/').length >= 4) {
      // Format: /webhooks/{webhookId}/{endpointPath}
      await handleWebhookReceiver(req, res);
    }
    else if (path.startsWith('/api/webhooks')) {
      await handleManagementAPI(req, res);
    }
    else {
      res.status(404).json({ 
        error: 'Endpoint not found',
        path: path,
        availableEndpoints: [
          'GET /health',
          'POST /webhooks/{webhookId}/{endpointPath}',
          'GET /api/webhooks',
          'POST /api/webhooks',
          'GET /api/webhooks/{id}',
          'PUT /api/webhooks/{id}',
          'DELETE /api/webhooks/{id}'
        ]
      });
    }

  } catch (error) {
    console.error('Request handling error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
});

// ==================== WEBHOOK RECEIVER HANDLER ====================
async function handleWebhookReceiver(req, res) {
  try {
    const pathParts = req.path.split('/').filter(part => part);
    
    // ✅ FIX: Đảm bảo đúng format /webhooks/{id}/{path}
    if (pathParts.length < 4) {
      return res.status(404).json({ 
        error: "Invalid webhook URL format",
        expected: "/webhooks/{webhookId}/{endpointPath}",
        received: req.path
      });
    }

    const webhookId = pathParts[1];
    const endpointPath = pathParts[2];

    console.log(`Processing webhook: ${webhookId}, path: ${endpointPath}`);

    const result = await webhookHandler.process({
      webhookId,
      endpointPath,
      method: req.method,
      headers: req.headers,
      body: req.body,
      ip: getClientIP(req),
      rawBody: req.rawBody ? req.rawBody.toString() : JSON.stringify(req.body)
    });

    res.status(result.status).json(result.data);
  } catch (error) {
    console.error('Webhook receiver error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
}

// ==================== MANAGEMENT API HANDLER ====================
async function handleManagementAPI(req, res) {
  try {
    const path = req.path;
    const method = req.method;

    console.log('🔍 MANAGEMENT API REQUEST:');
    console.log('User:', req.user?.email);
    console.log('Method:', method);
    console.log('Path:', path);

    // Kiểm tra webhookManager
    if (!webhookManager) {
      throw new Error('Webhook manager not initialized');
    }

    let result;

    // Webhook Management Routes
    if (method === 'GET' && path === '/api/webhooks') {
      console.log('📋 Listing webhooks...');
      result = await webhookManager.listWebhooks();
    
    } else if (method === 'POST' && path === '/api/webhooks') {
      console.log('🆕 Creating webhook...');
      
      if (!req.body || typeof req.body !== 'object') {
        throw new Error('Invalid request body');
      }
      
      const webhookData = {
        ...req.body,
        createdBy: req.user?.uid || 'unknown',
        creatorEmail: req.user?.email || 'unknown'
      };
      
      result = await webhookManager.createWebhook(webhookData);
      console.log('✅ Webhook created successfully');
    
    } 
    // API Key Management Routes
    else if (method === 'POST' && path === '/api/keys') {
      console.log('🔑 Creating API key...');
      result = await apiKeyService.createApiKey(req.user.uid, req.body);
    
    } else if (method === 'GET' && path === '/api/keys') {
      console.log('📋 Listing API keys...');
      result = await apiKeyService.listUserApiKeys(req.user.uid);
    
    } else if (method === 'DELETE' && path.startsWith('/api/keys/')) {
      const keyId = path.split('/')[3];
      console.log(`🗑️ Revoking API key: ${keyId}`);
      result = await apiKeyService.revokeApiKey(keyId, req.user.uid);
    
    } else {
      return res.status(404).json({ 
        error: 'Management endpoint not found',
        availableEndpoints: [
          'GET /api/webhooks',
          'POST /api/webhooks', 
          'GET /api/keys',
          'POST /api/keys',
          'DELETE /api/keys/{id}'
        ]
      });
    }

    console.log('📤 Management API response:', JSON.stringify(result, null, 2));
    
    if (method === 'POST') {
      res.status(201).json(result);
    } else {
      res.status(200).json(result);
    }

  } catch (error) {
    console.error('💥 MANAGEMENT API ERROR:', error);
    
    const errorResponse = {
      error: 'Management API error',
      message: error.message
    };
    
    res.status(500).json(errorResponse);
  }
}

// Helper function
function getClientIP(req) {
  return req.headers['x-forwarded-for'] || 
         req.connection.remoteAddress || 
         req.socket.remoteAddress ||
         (req.connection.socket ? req.connection.socket.remoteAddress : 'unknown');
}

console.log('Cloud Function initialized successfully with Authentication');
export { functions };