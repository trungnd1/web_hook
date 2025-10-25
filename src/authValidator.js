// web_hook/src/authValidator.js
import crypto from 'crypto';

class AuthValidator {
  async validate(webhookConfig, request) {
    const authConfig = webhookConfig.authentication;
    
    if (!authConfig || authConfig.method === "none") {
      return { valid: true };
    }

    switch (authConfig.method) {
      case "bearer_token":
        return this.validateBearerToken(authConfig, request.headers);
      
      case "api_key":
        return this.validateApiKey(authConfig, request.headers);
      
      case "hmac":
        return this.validateHMAC(authConfig, request.headers, request.rawBody);
      
      default:
        return { valid: false, error: "Unsupported authentication method" };
    }
  }

  validateBearerToken(authConfig, headers) {
    const authHeader = headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return { valid: false, error: "Missing or invalid Authorization header" };
    }

    const token = authHeader.substring(7);
    // For production, use proper secret management
    const isValid = token === authConfig.token;

    return { valid: isValid, error: isValid ? null : "Invalid token" };
  }

  validateApiKey(authConfig, headers) {
    const apiKey = headers[authConfig.headerName?.toLowerCase()];
    if (!apiKey) {
      return { valid: false, error: `Missing ${authConfig.headerName} header` };
    }

    const isValid = apiKey === authConfig.apiKey;

    return { valid: isValid, error: isValid ? null : "Invalid API key" };
  }

  validateHMAC(authConfig, headers, rawBody) {
    const signature = headers[authConfig.signatureHeader?.toLowerCase()];
    if (!signature) {
      return { valid: false, error: `Missing ${authConfig.signatureHeader} header` };
    }

    const expectedSignature = crypto
      .createHmac("sha256", authConfig.secret)
      .update(rawBody)
      .digest("hex");

    const receivedSignature = signature.includes('=') 
      ? signature.split('=')[1] 
      : signature;

    const isValid = crypto.timingSafeEqual(
      Buffer.from(receivedSignature),
      Buffer.from(expectedSignature)
    );

    return { valid: isValid, error: isValid ? null : "Invalid signature" };
  }
}

export default new AuthValidator();