// web_hook/src/webhookHandler.js - FIXED IMPORT
import admin from 'firebase-admin';
// ✅ FIX: Import default
import firestore from './firestore.js';
import authValidator from './authValidator.js';
import securityChecker from './securityChecker.js';
import workflowTrigger from './workflowTrigger.js';

class WebhookHandler {
  async process({ webhookId, endpointPath, method, headers, body, ip, rawBody }) {
    const startTime = Date.now();

    try {
      // 1. Get webhook config từ Firestore bằng webhookId
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

      // 2. Validate endpoint path matches
      if (webhookConfig.endpointPath !== endpointPath) {
        await this.logRequest(webhookId, {
          status: "error",
          ipAddress: ip,
          error: "Endpoint path mismatch",
          responseTime: Date.now() - startTime
        });
        return { status: 404, data: { error: "Webhook not found" } };
      }

      // 3. Check if webhook is active
      if (!webhookConfig.isActive) {
        await this.logRequest(webhookId, {
          status: "error",
          ipAddress: ip,
          error: "Webhook is inactive",
          responseTime: Date.now() - startTime
        });
        return { status: 410, data: { error: "Webhook is inactive" } };
      }

      // 4. Security checks
      const securityResult = await securityChecker.validate(webhookConfig, ip);
      if (!securityResult.valid) {
        await this.logRequest(webhookId, {
          status: "error",
          ipAddress: ip,
          error: securityResult.error,
          responseTime: Date.now() - startTime
        });
        await firestore.incrementErrorCount(webhookId);
        return { status: securityResult.status, data: { error: securityResult.error } };
      }

      // 5. Authentication
      const authResult = await authValidator.validate(webhookConfig, {
        headers,
        rawBody,
        body
      });
      
      if (!authResult.valid) {
        await this.logRequest(webhookId, {
          status: "error",
          ipAddress: ip,
          error: authResult.error,
          responseTime: Date.now() - startTime
        });
        await firestore.incrementErrorCount(webhookId);
        return { status: 401, data: { error: "Authentication failed" } };
      }

      // 6. Update request count
      await firestore.incrementRequestCount(webhookId);

      // 7. Trigger workflow (async)
      this.triggerWorkflowAsync(webhookConfig, body, ip);

      // 8. Log successful request
      await this.logRequest(webhookId, {
        status: "success",
        ipAddress: ip,
        userAgent: headers['user-agent'],
        payload: body,
        responseTime: Date.now() - startTime
      });

      // 9. Return immediate success response
      return {
        status: 200,
        data: {
          success: true,
          message: "Webhook received and processing started",
          webhookId: webhookId,
          timestamp: new Date().toISOString()
        }
      };

    } catch (error) {
      // Log error và increment error count
      await this.logRequest(webhookId, {
        status: "error",
        ipAddress: ip,
        error: error.message,
        responseTime: Date.now() - startTime
      });
      
      if (webhookId) {
        await firestore.incrementErrorCount(webhookId);
      }
      
      throw error;
    }
  }

  async logRequest(webhookId, logData) {
    try {
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

  async triggerWorkflowAsync(webhookConfig, payload, ip) {
    try {
      await workflowTrigger.trigger(webhookConfig, payload, ip);
    } catch (error) {
      console.error("Workflow trigger error:", error);
    }
  }
}

export default new WebhookHandler();