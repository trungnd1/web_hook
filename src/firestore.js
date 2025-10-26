// web_hook/src/firestore.js - FIXED LAZY INIT
import admin from 'firebase-admin';

class FirestoreService {
  constructor() {
    // ✅ FIX: Không khởi tạo trong constructor
    this.db = null;
    this.collection = 'webhook_configs';
    this._initialized = false;
  }

  // ✅ FIX: Lazy initialization
  async ensureInitialized() {
    if (!this._initialized) {
      try {
        if (!admin.apps.length) {
          // ✅ FIX: Khởi tạo với database URL
          admin.initializeApp({
            // Database URL sẽ được auto-detected từ environment
            // Hoặc set explicitly nếu cần:
            databaseURL: 'https://ai-workflow-5d230-default-rtdb.asia-southeast1.firebasedatabase.app/'
          });
          console.log('Firebase Admin initialized with Realtime Database support');
        }
        
        this.db = admin.firestore();
        this._initialized = true;
        console.log('FirestoreService initialized successfully');
        
      } catch (error) {
        console.error('FirestoreService initialization failed:', error);
        throw error;
      }
    }
    return this._initialized;
  }

  // ==================== CREATE ====================
  async createWebhook(webhookId, webhookConfig) {
    await this.ensureInitialized();
    
    try {
      await this.db.collection(this.collection)
        .doc(webhookId)
        .set(webhookConfig);
      
      console.log(`Webhook created: ${webhookId}`);
      return webhookConfig;
    } catch (error) {
      console.error('Firestore create error:', error);
      throw error;
    }
  }

  // ==================== READ ====================
  async getWebhook(webhookId) {
    await this.ensureInitialized();
    
    try {
      const doc = await this.db.collection(this.collection)
        .doc(webhookId)
        .get();
      
      return doc.exists ? doc.data() : null;
    } catch (error) {
      console.error('Firestore get error:', error);
      throw error;
    }
  }

  async getAllWebhooks() {
    await this.ensureInitialized();
    
    try {
      const snapshot = await this.db.collection(this.collection)
        .orderBy('createdAt', 'desc')
        .get();
      
      return snapshot.docs.map(doc => doc.data());
    } catch (error) {
      console.error('Firestore get all error:', error);
      throw error;
    }
  }

  async findWebhookByEndpointPath(endpointPath) {
    await this.ensureInitialized();
    
    try {
      const snapshot = await this.db.collection(this.collection)
        .where('endpointPath', '==', endpointPath)
        .limit(1)
        .get();
      
      return snapshot.empty ? null : snapshot.docs[0].data();
    } catch (error) {
      console.error('Firestore find by path error:', error);
      throw error;
    }
  }

  // ==================== UPDATE ====================
  async updateWebhook(webhookId, updates) {
    await this.ensureInitialized();
    
    try {
      await this.db.collection(this.collection)
        .doc(webhookId)
        .update(updates);
      
      console.log(`Webhook updated: ${webhookId}`);
      return true;
    } catch (error) {
      console.error('Firestore update error:', error);
      throw error;
    }
  }

  // ==================== DELETE ====================
  async deleteWebhook(webhookId) {
    await this.ensureInitialized();
    
    try {
      await this.db.collection(this.collection)
        .doc(webhookId)
        .delete();
      
      console.log(`Webhook deleted: ${webhookId}`);
      return true;
    } catch (error) {
      console.error('Firestore delete error:', error);
      throw error;
    }
  }

  // ==================== INCREMENT COUNTERS ====================
  async incrementRequestCount(webhookId) {
    await this.ensureInitialized();
    
    try {
      await this.db.collection(this.collection)
        .doc(webhookId)
        .update({
          totalRequests: admin.firestore.FieldValue.increment(1),
          lastTriggered: new Date().toISOString()
        });
    } catch (error) {
      console.error('Firestore increment error:', error);
    }
  }

  async incrementErrorCount(webhookId) {
    await this.ensureInitialized();
    
    try {
      await this.db.collection(this.collection)
        .doc(webhookId)
        .update({
          errorCount: admin.firestore.FieldValue.increment(1)
        });
    } catch (error) {
      console.error('Firestore increment error:', error);
    }
  }
}

export default new FirestoreService();