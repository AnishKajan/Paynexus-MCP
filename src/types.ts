export type Environment = 'sandbox' | 'production';

export interface PaynexusConfig {
    apiKey: string;
    baseUrl: string;
    env: Environment;
}

export interface Transaction {
    id: string;
    amount: number;
    currency: string;
    status: 'pending' | 'completed' | 'failed';
    createdAt: string;
}

export interface CheckoutSession {
    sessionId: string;
    url: string;
}

export interface ComplianceReport {
    reportId: string;
    status: 'clean' | 'flagged';
    timestamp: string;
}
