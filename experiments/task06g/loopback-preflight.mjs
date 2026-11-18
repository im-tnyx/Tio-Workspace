// Pure loopback-isolation checks for Task 06G local Auth evidence. No Docker I/O.
const LOOPBACK = new Set(['127.0.0.1', '::1']);

export function nonLoopbackPublishedPorts(ports) {
  return Object.values(ports ?? {}).flat().filter(binding =>
    binding && !LOOPBACK.has(binding.HostIp));
}

function containerShortName(found) {
  const name = found?.Name;
  return typeof name === 'string' ? name.replace(/^\//, '') : '';
}

export function validateIsolatedLoopbackStack({
  containers,
  network,
  project,
  requiredParts = ['auth', 'db', 'kong', 'inbucket'],
  gotrueImage,
  apiHostPort = '55621',
  mailHostPort = '55624',
} = {}) {
  if (!Array.isArray(containers) || containers.length === 0) {
    throw new Error('No project containers to validate');
  }
  if (typeof network !== 'string' || !network || typeof project !== 'string' || !project) {
    throw new Error('Project network identity unavailable');
  }

  // Every container attached to the evidence network must be loopback-only.
  for (const found of containers) {
    if (!found?.State?.Running) {
      throw new Error(`Unexpected local container state: ${containerShortName(found) || 'unknown'}`);
    }
    const nets = found.NetworkSettings?.Networks ?? {};
    if (Object.keys(nets).length !== 1 || !nets[network]) {
      throw new Error(`Unexpected local container/network: ${containerShortName(found) || 'unknown'}`);
    }
    if (nonLoopbackPublishedPorts(found.NetworkSettings?.Ports).length) {
      throw new Error('Local stack has a non-loopback published port');
    }
  }

  const byName = new Map(containers.map(found => [containerShortName(found), found]));
  for (const part of requiredParts) {
    const name = `supabase_${part}_${project}`;
    const found = byName.get(name);
    if (!found || found.Name !== `/${name}`) {
      throw new Error(`Unexpected local ${part} container/network`);
    }
    if (part === 'auth' && found.Config?.Image !== gotrueImage) {
      throw new Error('Unexpected GoTrue image');
    }
    if (part === 'kong' && !Object.values(found.NetworkSettings?.Ports ?? {}).flat()
      .some(binding => binding?.HostPort === apiHostPort)) {
      throw new Error('Unexpected API port');
    }
    if (part === 'inbucket' && !Object.values(found.NetworkSettings?.Ports ?? {}).flat()
      .some(binding => binding?.HostPort === mailHostPort)) {
      throw new Error('Unexpected Mailpit port');
    }
  }
  return true;
}
