// web_hook/src/webhookManager.js - FIX CONTEXT BINDING
import firestore from './firestore.js';

class WebhookManager {
  constructor() {
    // ✅ FIX: Bind methods để giữ context
    this.createWebhook = this.createWebhook.bind(this);
    this.generateWebhookId = this.generateWebhookId.bind(this);
    this.listWebhooks = this.listWebhooks.bind(this);
    this.getWebhook = this.getWebhook.bind(this);
    this.updateWebhook = this.updateWebhook.bind(this);
    this.deleteWebhook = this.deleteWebhook.bind(this);
  }

  // ==================== GENERATE WEBHOOK ID ====================
  generateWebhookId() {
    // Tạo ID ngắn gọn và unique
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `wh_${timestamp}_${random}`;
  }

  // ==================== CREATE WEBHOOK ====================
  async createWebhook(webhookData) {
      console.log('📦 CREATE WEBHOOK REQUEST:', webhookData);
      
      try {
          const { name, description, platform, endpointPath, authentication = {}, security = {} } = webhookData;

          // Validate required fields
          if (!name || !endpointPath) {
              throw new Error('Name and endpoint path are required');
          }

          console.log('✅ Validation passed');

          // Sanitize endpointPath
          const sanitizedEndpointPath = endpointPath.startsWith('/') 
              ? endpointPath.substring(1) 
              : endpointPath;

          console.log('🔧 Sanitized endpoint path:', sanitizedEndpointPath);

          // Generate unique webhookId
          const webhookId = this.generateWebhookId();
          console.log('🆕 Generated webhookId:', webhookId);
          
          // Check if endpoint path already exists
          console.log('🔍 Checking endpoint path uniqueness...');
          const existingWebhook = await firestore.findWebhookByEndpointPath(sanitizedEndpointPath);
          
          if (existingWebhook) {
              console.log('❌ Endpoint path conflict detected');
              throw new Error(`Endpoint path "${sanitizedEndpointPath}" already exists`);
          }
          
          console.log('✅ Endpoint path is unique');

          // Create webhook configuration với user info
          const webhookConfig = {
              id: webhookId,
              name,
              description: description || '',
              platform: platform || 'custom',
              endpointPath: sanitizedEndpointPath,
              authentication: {
                  method: authentication.method || 'none',
                  secret: authentication.secret || '',
                  signatureHeader: authentication.signatureHeader || 'x-signature'
              },
              security: {
                  ipWhitelist: security.ipWhitelist || [],
                  rateLimit: security.rateLimit || { requests: 100, period: 'minute' },
                  sslRequired: security.sslRequired !== false
              },
              isActive: true,
              createdBy: webhookData.createdBy || 'unknown',
              creatorEmail: webhookData.creatorEmail || 'unknown',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              totalRequests: 0,
              errorCount: 0,
              fullUrl: this.generateWebhookUrl(webhookId, sanitizedEndpointPath)
          };

          console.log('💾 Saving to Firestore...');

          // Save to Firestore
          await firestore.createWebhook(webhookId, webhookConfig);

          console.log('✅ Webhook saved successfully');

          const response = {
              success: true,
              webhook: webhookConfig,
              message: 'Webhook created successfully'
          };

          console.log('📤 Sending response:', JSON.stringify(response, null, 2));
          return response;

      } catch (error) {
          console.error('❌ CREATE WEBHOOK ERROR:', error);
          throw error;
      }
  }

  // ==================== GENERATE WEBHOOK URL ====================
  generateWebhookUrl(webhookId, endpointPath) {
    // Use actual Gen2 URL format
    const baseUrl = 'https://webhook-service-gx46uyhppq-as.a.run.app';
    return `${baseUrl}/webhooks/${webhookId}/${endpointPath}`;
  }

  // ==================== LIST WEBHOOKS ====================
  async listWebhooks() {
    try {
      console.log('📋 Listing all webhooks...');
      const webhooks = await firestore.getAllWebhooks();
      
      return {
        success: true,
        webhooks,
        count: webhooks.length,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('List webhooks error:', error);
      throw error;
    }
  }

  // ==================== GET WEBHOOK ====================
  async getWebhook(webhookId) {
    try {
      console.log(`🔍 Getting webhook: ${webhookId}`);
      const webhook = await firestore.getWebhook(webhookId);
      
      if (!webhook) {
        throw new Error('Webhook not found');
      }

      return {
        success: true,
        webhook
      };
    } catch (error) {
      console.error('Get webhook error:', error);
      throw error;
    }
  }

  // ==================== UPDATE WEBHOOK ====================
  async updateWebhook(webhookId, updates) {
    try {
      console.log(`✏️ Updating webhook: ${webhookId}`, updates);
      
      // Check if webhook exists
      const existingWebhook = await firestore.getWebhook(webhookId);
      if (!existingWebhook) {
        throw new Error('Webhook not found');
      }

      // Validate endpoint path uniqueness if changed
      if (updates.endpointPath && updates.endpointPath !== existingWebhook.endpointPath) {
        const existingWithPath = await firestore.findWebhookByEndpointPath(updates.endpointPath);
        if (existingWithPath && existingWithPath.id !== webhookId) {
          throw new Error('Endpoint path already exists');
        }
      }

      // Prepare update data
      const updateData = {
        ...updates,
        updatedAt: new Date().toISOString()
      };

      // Recalculate fullUrl if endpointPath changed
      if (updates.endpointPath) {
        updateData.fullUrl = this.generateWebhookUrl(webhookId, updates.endpointPath);
      }

      // Update in Firestore
      await firestore.updateWebhook(webhookId, updateData);

      // Get updated webhook
      const updatedWebhook = await firestore.getWebhook(webhookId);

      return {
        success: true,
        webhook: updatedWebhook,
        message: 'Webhook updated successfully'
      };

    } catch (error) {
      console.error('Update webhook error:', error);
      throw error;
    }
  }

  // ==================== DELETE WEBHOOK ====================
  async deleteWebhook(webhookId) {
    try {
      console.log(`🗑️ Deleting webhook: ${webhookId}`);
      
      // Check if webhook exists
      const existingWebhook = await firestore.getWebhook(webhookId);
      if (!existingWebhook) {
        throw new Error('Webhook not found');
      }

      // Delete from Firestore
      await firestore.deleteWebhook(webhookId);

      return {
        success: true,
        message: 'Webhook deleted successfully',
        deletedId: webhookId
      };

    } catch (error) {
      console.error('Delete webhook error:', error);
      throw error;
    }
  }
}

// ✅ FIX: Export class instance với binding
const webhookManager = new WebhookManager();
export default webhookManager;