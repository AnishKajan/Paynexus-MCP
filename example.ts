import { PaynexusClient, WebhookManager, rotateApiKey, logger } from './src/index.js';

async function main() {
    logger.info('Initializing Paynexus MCP Example');

    // Initialize client with environment configuration
    const client = new PaynexusClient();

    try {
        // 1. Create a checkout session
        logger.info('Creating checkout session...');
        const session = await client.createCheckout(100.00, 'USD');
        logger.info('Checkout session created', { sessionId: session.sessionId, url: session.url });

        // 2. Confirm payment
        logger.info('Confirming payment...');
        const paymentConfirmation = await client.confirmPayment(session.sessionId);
        logger.info('Payment confirmed', { transactionId: paymentConfirmation.transactionId });

        // 3. Fetch transactions
        logger.info('Fetching transactions...');
        const transactions = await client.fetchTransactions();
        logger.info(`Retrieved ${transactions.length} transactions`);

        // 4. Trigger compliance scan
        logger.info('Triggering compliance scan...');
        const { scanId } = await client.triggerComplianceScan('entity_12345');
        logger.info('Compliance scan triggered', { scanId });

        // 5. Register Webhook
        logger.info('Registering webhook...');
        const webhookManager = new WebhookManager(client);
        const webhook = await webhookManager.registerWebhook('https://my-app.com/webhooks/paynexus', ['payment.success', 'payment.failed']);
        logger.info('Webhook registered', { webhookId: webhook.webhookId });
        // Keep webhook.secret secure and use it to verify incoming payloads

        // 6. Rotate API Key
        logger.info('Rotating API key...');
        const newApiKey = await rotateApiKey(client);
        logger.info('API key rotated. The new configuration is now active in the client instance.');

    } catch (error) {
        logger.error('Example flow failed', { error: error instanceof Error ? error.message : String(error) });
    }
}

main().catch(console.error);
