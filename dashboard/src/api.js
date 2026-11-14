async function requestJson(url, options) {
  const unavailable = 'The local fixture service is unavailable. Start the demo API and try again.';
  let response;
  try {
    response = await fetch(url, options);
  } catch {
    throw new Error(unavailable);
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message || unavailable);
  if (!data || typeof data !== 'object') throw new Error('The local fixture service returned an unreadable response. Restart the demo API and try again.');
  return data;
}

export async function scanScenario(scenario) {
  return requestJson(`/api/scan?scenario=${encodeURIComponent(scenario)}`);
}

export async function getRemediations() {
  return requestJson('/api/remediations');
}

export async function createRemediation(scenario, findingId) {
  return requestJson('/api/remediations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scenario, findingId }),
  });
}
