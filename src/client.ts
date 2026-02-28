import { PaynexusConfig, Transaction, CheckoutSession, ComplianceReport, Environment } from './types.js';
import { logger } from './logger.js';
import { config as defaultConfig } from './config.js';

export class PaynexusClient {
    public config: PaynexusConfig;

    constructor(customConfig?: Partial<PaynexusConfig>) {
        this.config = {
            apiKey: customConfig?.apiKey || defaultConfig.PAYNEXUS_API_KEY,
            baseUrl: customConfig?.baseUrl || defaultConfig.PAYNEXUS_BASE_URL,
            env: customConfig?.env || defaultConfig.PAYNEXUS_ENV as Environment,
        };
    }

    public async request<T>(path: string, options: RequestInit = {}): Promise<T> {
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

        return response.json() as Promise<T>;
    }

    async createCheckout(amount: number, currency: string): Promise<CheckoutSession> {
        return this.request<CheckoutSession>('/v1/checkout', {
            method: 'POST',
            body: JSON.stringify({ amount, currency }),
        });
    }

    async confirmPayment(sessionId: string): Promise<{ success: boolean; transactionId: string }> {
        return this.request('/v1/payment/confirm', {
            method: 'POST',
            body: JSON.stringify({ sessionId }),
        });
    }

    async fetchTransactions(): Promise<Transaction[]> {
        return this.request<Transaction[]>('/v1/transactions');
    }

    async triggerComplianceScan(entityId: string): Promise<{ scanId: string }> {
        return this.request('/v1/compliance/scan', {
            method: 'POST',
            body: JSON.stringify({ entityId }),
        });
    }

    async retrieveComplianceReport(reportId: string): Promise<ComplianceReport> {
        return this.request<ComplianceReport>(`/v1/compliance/report/${reportId}`);
    }
}
