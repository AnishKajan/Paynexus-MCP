import crypto, { randomBytes, createHmac } from 'crypto';
import { PaynexusClient } from './client.js';
import { logger } from './logger.js';

export class WebhookManager {
    private client: PaynexusClient;

    constructor(client: PaynexusClient) {
        this.client = client;
    }

    /**
     * Generates a cryptographically secure webhook secret.
     * This should be saved locally and used to verify incoming webhook payloads.
     */
    public generateSecret(): string {
        return randomBytes(32).toString('hex');
    }

    /**
     * Registers a new webhook listener URL with the Paynexus backend.
     */
    public async registerWebhook(url: string, events: string[]): Promise<{ webhookId: string; secret: string }> {
        logger.info('Registering new webhook', { url, events });

        const secret = this.generateSecret();

        try {
            const { webhookId } = await this.client.request<{ webhookId: string }>('/v1/webhooks/register', {
                method: 'POST',
                body: JSON.stringify({
                    url,
                    events,
                    secret,
                }),
            });

            logger.info('Webhook registered successfully', { webhookId });
            return { webhookId, secret };
        } catch (error) {
            logger.error('WEBHOOK_REGISTRATION_FAILED', { error: error instanceof Error ? error.message : String(error) });
            throw error;
        }
    }

    /**
     * Validates an incoming webhook payload using the HMAC signature.
     */
    public verifySignature(payload: string, signature: string, secret: string): boolean {
        try {
            const expectedSignature = createHmac('sha256', secret)
                .update(payload)
                .digest('hex');

            const expectedBuffer = Buffer.from(expectedSignature, 'hex');
            const signatureBuffer = Buffer.from(signature, 'hex');

            if (expectedBuffer.length !== signatureBuffer.length) {
                return false;
            }

            return crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
        } catch {
            return false;
        }
    }
}
