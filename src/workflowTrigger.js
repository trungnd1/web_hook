// web_hook/src/workflowTrigger.js
import admin from 'firebase-admin';

class WorkflowTrigger {
  async trigger(webhookConfig, payload, sourceIp) {
    console.log(`Triggering workflow: ${webhookConfig.workflowId}`);
    
    // If using Firestore
    try {
      const db = admin.firestore();
      const executionRef = db.collection("workflow_executions").doc();
      
      const executionData = {
        id: executionRef.id,
        webhookId: webhookConfig.id,
        workflowId: webhookConfig.workflowId,
        status: "triggered",
        triggerType: "webhook",
        payload: payload,
        sourceIp: sourceIp,
        triggeredAt: admin.firestore.FieldValue.serverTimestamp()
      };

      await executionRef.set(executionData);
      console.log(`Workflow execution created: ${executionRef.id}`);
      
      return executionRef.id;
    } catch (error) {
      console.log('Firestore not available, logging to console:', {
        webhookConfig: webhookConfig.id,
        workflowId: webhookConfig.workflowId,
        payload
      });
    }
  }
}

export default new WorkflowTrigger();