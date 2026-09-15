const boolEnv = (value, fallback) => {
  if (value == null || value === '') return fallback;
  return String(value).toLowerCase() === 'true';
};

const splitCsv = value => String(value || '')
  .split(',')
  .map(v => v.trim())
  .filter(Boolean);

/**
 * Runtime-safe chat deployment policy.
 *
 * No secret belongs in VITE_* variables: Vite exposes them to the browser.
 * A centrally funded production deployment should point baseUrl at an
 * authenticated AI gateway that keeps provider credentials server-side.
 * Without a gateway the POC falls back to BYO-key, held in memory only.
 */
export function chatDeployment() {
  const provider = import.meta.env.VITE_AI_PROVIDER || 'anthropic';
  const baseUrl = import.meta.env.VITE_AI_GATEWAY_BASE_URL || '';
  const allowUserKey = boolEnv(import.meta.env.VITE_AI_ALLOW_USER_KEY, !baseUrl);
  const allowModels = splitCsv(import.meta.env.VITE_AI_ALLOWED_MODELS);

  const deployment = {
    storage: 'memory',
    allowUserKey,
    allowAttachments: false,
    showPricing: false,
    showToolCount: false,
    lock: {
      webSearch: false,
      fileGeneration: false,
    },
  };

  if (allowModels.length) deployment.allowModels = allowModels;
  if (baseUrl) {
    deployment.endpoints = { [provider]: { baseUrl } };
    deployment.lock.provider = provider;
  }
  return deployment;
}

export const AI_PROVIDER = import.meta.env.VITE_AI_PROVIDER || 'anthropic';
