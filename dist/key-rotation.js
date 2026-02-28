import { logger } from './logger.js';
export async function rotateApiKey(client) {
    logger.info('Starting API key rotation for environment', { env: client.config.env });
    try {
        // 1. Request new key via the current valid client
        const { newKey } = await client.request('/v1/auth/rotate', {
            method: 'POST'
        });
        // 2. Revoke old key (Backend must support 'revoke' or do it automatically)
        // In this flow, the backend generates the new one and invalidates the old one after a grace period
        // 3. Update the client config with the new key so subsequent requests use it
        client.config.apiKey = newKey;
        logger.info('API key rotated successfully');
        return newKey;
    }
    catch (error) {
        logger.error('ROTATION_FAILED', { error: error instanceof Error ? error.message : String(error) });
        throw error;
    }
}
