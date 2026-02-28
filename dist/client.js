import { logger } from './logger.js';
import { config as defaultConfig } from './config.js';
export class PaynexusClient {
    config;
    constructor(customConfig) {
        this.config = {
            apiKey: customConfig?.apiKey || defaultConfig.PAYNEXUS_API_KEY,
            baseUrl: customConfig?.baseUrl || defaultConfig.PAYNEXUS_BASE_URL,
            env: customConfig?.env || defaultConfig.PAYNEXUS_ENV,
        };
    }
    async request(path, options = {}) {
        const url = `${this.config.baseUrl}${path}`;
        const headers = {
            'Authorization': `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json',
            'X-Paynexus-Env': this.config.env,
            ...options.headers,
        };
        const response = await fetch(url, { ...options, headers });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            logger.error('API_ERROR', { status: response.status, path, errorData });
            throw new Error(`Paynexus API Error: ${response.statusText}`);
        }
        return response.json();
    }
    async createCheckout(amount, currency) {
        return this.request('/v1/checkout', {
            method: 'POST',
            body: JSON.stringify({ amount, currency }),
        });
    }
    async confirmPayment(sessionId) {
        return this.request('/v1/payment/confirm', {
            method: 'POST',
            body: JSON.stringify({ sessionId }),
        });
    }
    async fetchTransactions() {
        return this.request('/v1/transactions');
    }
    async triggerComplianceScan(entityId) {
        return this.request('/v1/compliance/scan', {
            method: 'POST',
            body: JSON.stringify({ entityId }),
        });
    }
    async retrieveComplianceReport(reportId) {
        return this.request(`/v1/compliance/report/${reportId}`);
    }
}
