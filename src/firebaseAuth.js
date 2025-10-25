// src/firebaseAuth.js
import admin from 'firebase-admin';

class FirebaseAuth {
  async validate(req) {
    // Skip auth for public endpoints
    if (req.path === '/health' || req.path === '/') {
      return { valid: true, isPublic: true };
    }

    const token = req.headers['authorization']?.replace('Bearer ', '');
    
    if (!token) {
      return { 
        valid: false, 
        error: 'Firebase ID token required', 
        status: 401 
      };
    }

    try {
      const decodedToken = await admin.auth().verifyIdToken(token);
      const user = await admin.auth().getUser(decodedToken.uid);
      
      req.user = {
        uid: user.uid,
        email: user.email,
        name: user.displayName,
        role: user.customClaims?.role || 'user',
        isAdmin: user.customClaims?.admin || false
      };

      console.log(`✅ Authenticated user: ${user.email}, role: ${req.user.role}`);
      return { valid: true, user: req.user };

    } catch (error) {
      console.error('Firebase auth error:', error);
      return { 
        valid: false, 
        error: 'Invalid or expired Firebase token', 
        status: 403 
      };
    }
  }

  async requireAdmin(req, res) {
    if (!req.user || !req.user.isAdmin) {
      res.status(403).json({ 
        error: 'Admin access required',
        required: 'admin_role'
      });
      return false;
    }
    return true;
  }

  // Helper để set custom claims (chạy một lần)
  async setAdminRole(uid) {
    try {
      await admin.auth().setCustomUserClaims(uid, { 
        admin: true, 
        role: 'admin' 
      });
      console.log(`✅ Admin role set for user: ${uid}`);
      return true;
    } catch (error) {
      console.error('Error setting admin role:', error);
      return false;
    }
  }
}

export default new FirebaseAuth();