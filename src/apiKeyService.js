// src/apiKeyService.js
import firestore from './firestore.js';
import crypto from 'crypto';

class ApiKeyService {
  constructor() {
    this.collection = 'api_keys';
  }

  // Generate new API key
  generateApiKey(prefix = 'wh') {
    const randomBytes = crypto.randomBytes(32).toString('hex');
    return `${prefix}_${randomBytes}`;
  }

  // Hash API key for secure storage
  hashApiKey(apiKey) {
    return crypto.createHash('sha256').update(apiKey).digest('hex');
  }

  // Create new API key
  async createApiKey(userId, keyData = {}) {
    try {
      const apiKey = this.generateApiKey();
      const hashedKey = this.hashApiKey(apiKey);
      const keyId = `key_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;

      const apiKeyConfig = {
        id: keyId,
        key: hashedKey, // Store only the hash
        name: keyData.name || 'Unnamed Key',
        description: keyData.description || '',
        userId: userId,
        permissions: keyData.permissions || ['webhook:read'],
        isActive: true,
        createdAt: new Date().toISOString(),
        lastUsed: null,
        rateLimit: keyData.rateLimit || 1000, // requests per hour
        webhookIds: keyData.webhookIds || [] // Specific webhooks this key can access
      };

      // Store in Firestore
      await firestore.db.collection(this.collection).doc(keyId).set(apiKeyConfig);

      // Return the plain key (only shown once)
      return {
        success: true,
        apiKey: apiKey, // Only time the plain key is returned
        keyInfo: {
          id: keyId,
          name: apiKeyConfig.name,
          prefix: apiKey.substring(0, 16),
          createdAt: apiKeyConfig.createdAt,
          permissions: apiKeyConfig.permissions
        }
      };

    } catch (error) {
      console.error('Create API key error:', error);
      throw error;
    }
  }

  // Validate API key from request
  async validateApiKey(req) {
    const apiKey = req.headers['x-api-key'] || 
                   req.headers['authorization']?.replace('Bearer ', '');

    if (!apiKey) {
      return { 
        valid: false, 
        error: 'API key required', 
        status: 401 
      };
    }

    try {
      const hashedKey = this.hashApiKey(apiKey);
      
      // Find active API key
      const snapshot = await firestore.db.collection(this.collection)
        .where('key', '==', hashedKey)
        .where('isActive', '==', true)
        .limit(1)
        .get();

      if (snapshot.empty) {
        return { 
          valid: false, 
          error: 'Invalid or inactive API key', 
          status: 403 
        };
      }

      const keyData = snapshot.docs[0].data();
      
      // Check rate limiting
      const rateLimitResult = await this.checkRateLimit(keyData);
      if (!rateLimitResult.allowed) {
        return {
          valid: false,
          error: 'Rate limit exceeded',
          status: 429
        };
      }

      // Update last used
      await this.updateLastUsed(keyData.id);

      // Extract webhook ID from path for scope validation
      const webhookId = this.extractWebhookId(req.path);
      
      // Check if key has access to this specific webhook
      if (webhookId && keyData.webhookIds?.length > 0) {
        const hasAccess = keyData.webhookIds.includes(webhookId);
        if (!hasAccess) {
          return {
            valid: false,
            error: 'API key does not have access to this webhook',
            status: 403
          };
        }
      }

      req.apiKey = {
        id: keyData.id,
        name: keyData.name,
        userId: keyData.userId,
        permissions: keyData.permissions
      };

      return { valid: true, keyData };

    } catch (error) {
      console.error('API key validation error:', error);
      return { 
        valid: false, 
        error: 'API key validation failed', 
        status: 500 
      };
    }
  }

  // Extract webhook ID from path
  extractWebhookId(path) {
    const parts = path.split('/').filter(part => part);
    if (parts.length >= 3 && parts[0] === 'webhooks') {
      return parts[1];
    }
    return null;
  }

  // Check rate limiting
  async checkRateLimit(keyData) {
    // Simple implementation - in production, use Redis
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);
    
    // You would query request logs here
    // For now, we'll use a simple approach
    return { allowed: true, remaining: keyData.rateLimit };
  }

  // Update last used timestamp
  async updateLastUsed(keyId) {
    try {
      await firestore.db.collection(this.collection).doc(keyId).update({
        lastUsed: new Date().toISOString()
      });
    } catch (error) {
      console.error('Update last used error:', error);
    }
  }

  // List API keys for a user
  async listUserApiKeys(userId) {
    try {
      const snapshot = await firestore.db.collection(this.collection)
        .where('userId', '==', userId)
        .orderBy('createdAt', 'desc')
        .get();

      const keys = snapshot.docs.map(doc => {
        const data = doc.data();
        // Don't return the actual key hash
        return {
          id: data.id,
          name: data.name,
          description: data.description,
          permissions: data.permissions,
          isActive: data.isActive,
          createdAt: data.createdAt,
          lastUsed: data.lastUsed,
          rateLimit: data.rateLimit,
          webhookIds: data.webhookIds
        };
      });

      return { success: true, keys };

    } catch (error) {
      console.error('List API keys error:', error);
      throw error;
    }
  }

  // Revoke API key
  async revokeApiKey(keyId, userId) {
    try {
      const keyDoc = await firestore.db.collection(this.collection).doc(keyId).get();
      
      if (!keyDoc.exists) {
        throw new Error('API key not found');
      }

      const keyData = keyDoc.data();
      
      // Check ownership (unless admin)
      if (keyData.userId !== userId) {
        throw new Error('Not authorized to revoke this API key');
      }

      await firestore.db.collection(this.collection).doc(keyId).update({
        isActive: false,
        revokedAt: new Date().toISOString()
      });

      return { success: true, message: 'API key revoked' };

    } catch (error) {
      console.error('Revoke API key error:', error);
      throw error;
    }
  }
}

export default new ApiKeyService();