// middleware/authMiddleware.js - UPDATED WITH API KEY SUPPORT
import firebaseAuth from '../src/firebaseAuth.js';
import apiKeyService from '../src/apiKeyService.js';

class AuthMiddleware {
  // Route configuration
  routeConfigs = {
    // Public endpoints
    '/health': { requireAuth: false },
    '/': { requireAuth: false },
    
    // Management API - require Firebase auth + admin
    '/api/webhooks': { 
      requireAuth: true, 
      requireAdmin: true,
      authMethod: 'firebase'
    },
    
    // API Key management - require Firebase auth
    '/api/keys': {
      requireAuth: true,
      requireAdmin: false, 
      authMethod: 'firebase'
    },
    
    // Webhook endpoints - require API key
    '/webhooks/': { 
      requireAuth: true, 
      authMethod: 'apiKey'
    }
  };

  async authenticate(req, res) {
    const path = req.path;
    console.log(`🔐 Auth check for path: ${path}`);

    // Find matching route config
    const routeConfig = this.getRouteConfig(path);
    
    if (!routeConfig.requireAuth) {
      console.log('✅ Public endpoint - skipping auth');
      return { valid: true, isPublic: true };
    }

    let authResult;

    // Route to appropriate auth method
    if (routeConfig.authMethod === 'apiKey') {
      authResult = await apiKeyService.validateApiKey(req);
    } else {
      // Default to Firebase auth
      authResult = await firebaseAuth.validate(req);
    }
    
    if (!authResult.valid) {
      console.log('❌ Authentication failed:', authResult.error);
      this.sendAuthError(res, authResult);
      return authResult;
    }

    // Check admin requirement for Firebase auth
    if (routeConfig.requireAdmin && routeConfig.authMethod === 'firebase') {
      const isAdmin = await firebaseAuth.requireAdmin(req, res);
      if (!isAdmin) {
        return { 
          valid: false, 
          error: 'Admin access required', 
          status: 403 
        };
      }
    }

    console.log('✅ Authentication successful');
    return { valid: true, user: authResult.user, keyData: authResult.keyData };
  }

  getRouteConfig(path) {
    for (const [route, config] of Object.entries(this.routeConfigs)) {
      if (path.startsWith(route)) {
        return config;
      }
    }
    // Default: require Firebase auth for unknown routes
    return { requireAuth: true, authMethod: 'firebase' };
  }

  sendAuthError(res, authResult) {
    res.status(authResult.status).json({ 
      error: authResult.error,
      code: this.getErrorCode(authResult.status)
    });
  }

  getErrorCode(status) {
    const codes = {
      401: 'UNAUTHENTICATED',
      403: 'FORBIDDEN', 
      429: 'RATE_LIMITED'
    };
    return codes[status] || 'AUTH_ERROR';
  }
}

export default new AuthMiddleware();