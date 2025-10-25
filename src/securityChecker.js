// web_hook/src/securityChecker.js
import admin from 'firebase-admin';

class SecurityChecker {
  async validate(webhookConfig, clientIp) {
    // Check IP whitelist
    if (webhookConfig.security?.ipWhitelist?.length > 0) {
      const isAllowed = this.checkIPWhitelist(clientIp, webhookConfig.security.ipWhitelist);
      if (!isAllowed) {
        return { valid: false, error: "IP not allowed", status: 403 };
      }
    }

    // Check rate limiting
    const rateLimitResult = await this.checkRateLimit(webhookConfig.id, clientIp);
    if (!rateLimitResult.allowed) {
      return { 
        valid: false, 
        error: "Rate limit exceeded", 
        status: 429 
      };
    }

    return { valid: true };
  }

  checkIPWhitelist(clientIp, whitelist) {
    return whitelist.some(ip => {
      if (ip.includes('/')) {
        return this.checkCIDR(clientIp, ip);
      }
      return clientIp === ip;
    });
  }

  checkCIDR(clientIp, cidr) {
    const [network, prefix] = cidr.split('/');
    return clientIp.startsWith(network);
  }

  async checkRateLimit(webhookId, clientIp) {
    // Simple rate limiting - implement your own logic
    // For production, use Redis or similar
    return { allowed: true, remaining: 100 };
  }
}

export default new SecurityChecker();