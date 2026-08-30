/**
 * The integration credentials that can be edited from Settings → Integrations.
 *
 * One definition drives all of it: the database row the seed writes, the form
 * the frontend renders, whether the value is encrypted, and which environment
 * variable it falls back to. Adding a credential means adding an entry here.
 *
 * envFallback names the variable this setting replaces. A deployment that has
 * not saved anything yet keeps working from its .env, and the Integrations page
 * shows which of the two each value is coming from.
 */
export interface SettingDefinition {
  key:          string;
  group:        'smtp' | 'xcel';
  label:        string;
  description:  string;
  inputType:    'text' | 'password' | 'number' | 'toggle' | 'email' | 'url';
  /** Held as ciphertext in the database and never returned to the browser. */
  isEncrypted:  boolean;
  isRequired:   boolean;
  placeholder?: string;
  envFallback:  string;
}

export const SETTINGS_CONFIG: SettingDefinition[] = [
  // ── Email ───────────────────────────────────────────────────────────────────
  {
    key: 'smtp.host', group: 'smtp', label: 'SMTP host',
    description: 'Mail server hostname.',
    inputType: 'text', isEncrypted: false, isRequired: true,
    placeholder: 'smtp.titan.email', envFallback: 'SMTP_HOST',
  },
  {
    key: 'smtp.port', group: 'smtp', label: 'SMTP port',
    description: '465 for implicit TLS, 587 for STARTTLS.',
    inputType: 'number', isEncrypted: false, isRequired: true,
    placeholder: '465', envFallback: 'SMTP_PORT',
  },
  {
    key: 'smtp.secure', group: 'smtp', label: 'Implicit TLS',
    description: 'On for port 465, off for 587. Mismatching this does not error — the send hangs until it times out.',
    inputType: 'toggle', isEncrypted: false, isRequired: false,
    envFallback: 'SMTP_SECURE',
  },
  {
    key: 'smtp.user', group: 'smtp', label: 'SMTP username',
    description: 'The mailbox that authenticates to the server.',
    inputType: 'email', isEncrypted: false, isRequired: true,
    placeholder: 'noreply@stapsecurity.co.ug', envFallback: 'SMTP_USER',
  },
  {
    key: 'smtp.password', group: 'smtp', label: 'SMTP password',
    description: 'Mailbox password. Stored encrypted and never shown again.',
    inputType: 'password', isEncrypted: true, isRequired: true,
    envFallback: 'SMTP_PASS',
  },
  {
    key: 'smtp.from', group: 'smtp', label: 'From address',
    description: 'Must be the SMTP username or an alias of it — providers reject a From on a domain the session has not authenticated for.',
    inputType: 'email', isEncrypted: false, isRequired: false,
    placeholder: 'noreply@stapsecurity.co.ug', envFallback: 'SMTP_FROM',
  },

  // ── XCEL payment gateway ────────────────────────────────────────────────────
  {
    key: 'xcel.baseUrl', group: 'xcel', label: 'API base URL',
    description: 'Gateway endpoint. Sandbox and production differ — check before saving.',
    inputType: 'url', isEncrypted: false, isRequired: true,
    placeholder: 'https://sandbox-api.xcelapp.com', envFallback: 'XCEL_BASE_URL',
  },
  {
    key: 'xcel.apiKey', group: 'xcel', label: 'API key',
    description: 'Sent as the x-api-key header. Stored encrypted.',
    inputType: 'password', isEncrypted: true, isRequired: true,
    envFallback: 'XCEL_API_KEY',
  },
  {
    key: 'xcel.merchantId', group: 'xcel', label: 'Merchant ID',
    description: 'Sent as the x-merchant-id header.',
    inputType: 'text', isEncrypted: false, isRequired: true,
    envFallback: 'XCEL_MERCHANT_ID',
  },
  {
    key: 'xcel.webhookUrl', group: 'xcel', label: 'Webhook URL',
    description: 'Where the gateway posts payment results. Must be reachable from the internet.',
    inputType: 'url', isEncrypted: false, isRequired: false,
    placeholder: 'https://stap.stapsecurity.com/api/v1/finance/webhooks/yo-payments',
    envFallback: 'XCEL_WEBHOOK_URL',
  },
  {
    key: 'xcel.partnerId', group: 'xcel', label: 'Partner ID',
    description: 'Only for disbursements through a partner account.',
    inputType: 'text', isEncrypted: false, isRequired: false,
    envFallback: 'XCEL_PARTNER_ID',
  },
  {
    key: 'xcel.partnerApiKey', group: 'xcel', label: 'Partner API key',
    description: 'Only for disbursements through a partner account. Stored encrypted.',
    inputType: 'password', isEncrypted: true, isRequired: false,
    envFallback: 'XCEL_PARTNER_API_KEY',
  },
  {
    key: 'xcel.partnerBaseUrl', group: 'xcel', label: 'Partner base URL',
    description: 'Partner endpoint, when it differs from the main API.',
    inputType: 'url', isEncrypted: false, isRequired: false,
    envFallback: 'XCEL_PARTNER_BASE_URL',
  },
  {
    key: 'xcel.dlCodeBaseUrl', group: 'xcel', label: 'Dynamic-link base URL',
    description: 'Where the OTP/dynamic-link code is generated. A disbursement needs a dl_code before it can be sent.',
    inputType: 'url', isEncrypted: false, isRequired: false,
    placeholder: 'https://sandbox-api.xcelapp.com/esa-api/api',
    envFallback: 'XCEL_DL_CODE_BASE_URL',
  },
  {
    key: 'xcel.configPreset', group: 'xcel', label: 'Config preset',
    description: 'config_preset sent when generating the dynamic link. Supplied by XCEL with the partner account.',
    inputType: 'text', isEncrypted: false, isRequired: false,
    envFallback: 'XCEL_CONFIG_PRESET',
  },
  {
    key: 'xcel.merchantAccount', group: 'xcel', label: 'Merchant account',
    description: 'The account debited for disbursements — sent as payerId on the dynamic link. Falls back to the Partner ID when unset.',
    inputType: 'text', isEncrypted: false, isRequired: false,
    envFallback: 'XCEL_MERCHANT_ACCOUNT',
  },
  {
    key: 'xcel.disbursementPath', group: 'xcel', label: 'Disbursement path',
    description: 'Path appended to the partner base URL when sending a salary payment. Configurable because XCEL exposes more than one surface for this and which one an account may use varies.',
    inputType: 'text', isEncrypted: false, isRequired: false,
    placeholder: '/external/payment/momo',
    envFallback: 'XCEL_DISBURSEMENT_PATH',
  },
];

export const SETTINGS_GROUPS = {
  smtp: {
    label:       'Email (SMTP)',
    description: 'Outgoing mail for welcome messages, password resets, invoices and notifications.',
    icon:        '📧',
  },
  xcel: {
    label:       'XCEL payment gateway',
    description: 'Mobile-money collection against invoices and salary disbursement.',
    icon:        '💳',
  },
} as const;

export type SettingsGroup = keyof typeof SETTINGS_GROUPS;

export const definitionFor = (key: string): SettingDefinition | undefined =>
  SETTINGS_CONFIG.find((d) => d.key === key);
