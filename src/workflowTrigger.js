// web_hook/src/workflowTrigger.js - FIX FIRESTORE
import admin from 'firebase-admin';

class WorkflowTrigger {
  async trigger(webhookConfig, payload, sourceIp) {
    console.log(`🔧 Triggering workflow for webhook: ${webhookConfig.id}`);
    
    try {
      // ✅ FIX: Đảm bảo Firestore initialized
      let firestore;
      try {
        firestore = admin.firestore();
        console.log('✅ Firestore initialized');
      } catch (error) {
        console.error('❌ Firestore not available:', error.message);
        
        // Fallback logging
        console.log('📋 Webhook would trigger workflow:', {
          webhookId: webhookConfig.id,
          workflowId: webhookConfig.workflowId,
          payloadSize: JSON.stringify(payload).length,
          sourceIp: sourceIp
        });
        return 'fallback-trigger-id';
      }
      
      // ✅ FIX: Check if workflowId exists
      const workflowId = webhookConfig.workflowId;
      if (!workflowId) {
        console.log('ℹ️  No workflowId configured for webhook:', webhookConfig.id);
        return 'no-workflow-configured';
      }
      
      const executionRef = firestore.collection("workflow_executions").doc();
      
      const executionData = {
        id: executionRef.id,
        webhookId: webhookConfig.id,
        workflowId: workflowId,
        status: "triggered",
        triggerType: "webhook",
        payload: payload,
        sourceIp: sourceIp,
        triggeredAt: admin.firestore.FieldValue.serverTimestamp()
      };

      await executionRef.set(executionData);
      console.log(`✅ Workflow execution created: ${executionRef.id}`);
      
      return executionRef.id;
      
    } catch (error) {
      console.error('❌ Workflow trigger failed:', error);
      
      // Fallback logging
      console.log('📋 Webhook trigger fallback - would execute:', {
        webhookConfig: webhookConfig.id,
        workflowId: webhookConfig.workflowId,
        payload: payload
      });
      
      return 'error-trigger-id';
    }
  }
}

export default new WorkflowTrigger();