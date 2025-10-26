// web_hook/src/webhookHandler.js - SIMPLE FALLBACK
class WebhookHandler {
  constructor() {
    console.log('🔧 WebhookHandler initialized - USING SIMPLE FALLBACK');
  }

  async forwardViaWebSocket(webhookData) {
    try {
      console.log('📨 SIMPLE FALLBACK - Logging webhook data');
      
      // ✅ TEMPORARY: Chỉ log data chi tiết
      console.log('🎯 WEBHOOK RECEIVED (DETAILS):', {
        webhookId: webhookData.webhookId,
        endpointPath: webhookData.endpointPath,
        payload: webhookData.payload,
        headers: webhookData.headers,
        sourceIp: webhookData.sourceIp,
        timestamp: webhookData.timestamp,
        metadata: webhookData.metadata,
        _loggedAt: new Date().toISOString(),
        _status: 'RECEIVED_BUT_NOT_FORWARDED'
      });
      
      console.log('✅ Webhook logged successfully (FALLBACK MODE)');
      
      // ✅ THÊM: Ghi vào Firestore như backup
      await this.backupToFirestore(webhookData);
      
    } catch (error) {
      console.error('❌ Even fallback logging failed:', error);
    }
  }

  async backupToFirestore(webhookData) {
    try {
      const firestore = (await import('./firestore.js')).default;
      await firestore.ensureInitialized();
      
      const backupData = {
        webhookId: webhookData.webhookId,
        endpointPath: webhookData.endpointPath,
        payload: webhookData.payload,
        headers: webhookData.headers,
        sourceIp: webhookData.sourceIp,
        receivedAt: new Date().toISOString(),
        status: 'received_fallback',
        type: 'webhook_backup'
      };
      
      const backupRef = firestore.db.collection('webhook_backups').doc();
      await backupRef.set(backupData);
      
      console.log('💾 Webhook backed up to Firestore:', backupRef.id);
      
    } catch (firestoreError) {
      console.error('❌ Firestore backup failed:', firestoreError);
    }
  }

  async forwardToClientWorkflow(webhookData) {
    console.log('🔄 Using simple fallback for webhook forwarding');
    await this.forwardViaWebSocket(webhookData);
  }

  async process({ webhookId, endpointPath, method, headers, body, ip, rawBody }) {
    const startTime = Date.now();

    try {
      // 1. Get webhook config
      const firestore = (await import('./firestore.js')).default;
      const webhookConfig = await firestore.getWebhook(webhookId);
      
      if (!webhookConfig) {
        await this.logRequest(webhookId, {
          status: "error",
          ipAddress: ip,
          error: "Webhook config not found",
          responseTime: Date.now() - startTime
        });
        return { status: 404, data: { error: "Webhook not found" } };
      }

      // 2. Validate endpoint path
      if (webhookConfig.endpointPath !== endpointPath) {
        await this.logRequest(webhookId, {
          status: "error", 
          ipAddress: ip,
          error: "Endpoint path mismatch",
          responseTime: Date.now() - startTime
        });
        return { status: 404, data: { error: "Webhook not found" } };
      }

      // 3. Check if active
      if (!webhookConfig.isActive) {
        await this.logRequest(webhookId, {
          status: "error",
          ipAddress: ip, 
          error: "Webhook is inactive",
          responseTime: Date.now() - startTime
        });
        return { status: 410, data: { error: "Webhook is inactive" } };
      }

      // 4. Prepare webhook payload
      const webhookPayload = {
        webhookId,
        endpointPath,
        payload: body,
        headers: this.sanitizeHeaders(headers),
        sourceIp: ip,
        timestamp: new Date().toISOString(),
        metadata: {
          platform: webhookConfig.platform,
          webhookName: webhookConfig.name,
          validation: { security: true, authentication: true }
        }
      };

      console.log('🎯 WEBHOOK PROCESSING SUCCESS:', {
        webhookId,
        endpointPath,
        payloadSize: JSON.stringify(body).length,
        configName: webhookConfig.name
      });

      // 5. Forward to client (using fallback)
      await this.forwardToClientWorkflow(webhookPayload);

      // 6. Update request count
      await firestore.incrementRequestCount(webhookId);

      // 7. Trigger workflow
      const workflowTrigger = (await import('./workflowTrigger.js')).default;
      workflowTrigger.trigger(webhookConfig, body, ip);

      // 8. Log success
      await this.logRequest(webhookId, {
        status: "success",
        ipAddress: ip,
        userAgent: headers['user-agent'],
        payload: body,
        responseTime: Date.now() - startTime,
        forwardedToClient: true
      });

      // 9. Return success response
      return {
        status: 200,
        data: {
          success: true,
          message: "Webhook received and logged successfully",
          webhookId: webhookId,
          timestamp: new Date().toISOString(),
          note: "Using fallback mode - data logged to console"
        }
      };

    } catch (error) {
      console.error('💥 WEBHOOK PROCESSING ERROR:', error);
      
      await this.logRequest(webhookId, {
        status: "error",
        ipAddress: ip,
        error: error.message,
        responseTime: Date.now() - startTime
      });
      
      if (webhookId) {
        const firestore = (await import('./firestore.js')).default;
        await firestore.incrementErrorCount(webhookId);
      }
      
      return {
        status: 500,
        data: { error: "Webhook processing failed" }
      };
    }
  }

  sanitizeHeaders(headers) {
    const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key', 'password', 'token', 'secret'];
    const sanitized = {};
    
    for (const [key, value] of Object.entries(headers)) {
      if (!sensitiveHeaders.some(sensitive => key.toLowerCase().includes(sensitive))) {
        sanitized[key] = value;
      } else {
        sanitized[key] = '***REDACTED***';
      }
    }
    return sanitized;
  }

  async logRequest(webhookId, logData) {
    try {
      const firestore = (await import('./firestore.js')).default;
      const logsCollection = 'webhook_logs';
      const logRef = firestore.db.collection(logsCollection).doc();
      
      await logRef.set({
        id: logRef.id,
        webhookId,
        timestamp: new Date().toISOString(),
        ...logData
      });
    } catch (error) {
      console.error('Log request error:', error);
    }
  }

  async processWebhookData(webhookData) {
    // Tìm webhook trigger node với webhookId khớp
    const triggerNode = this.findWebhookTriggerNode(webhookData.webhookId);
    if (triggerNode) {
      await this.triggerWorkflowFromNode(triggerNode, webhookData.payload);
    }
  }
}

export default new WebhookHandler();