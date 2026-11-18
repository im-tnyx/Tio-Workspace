// Task 06H-D: Pure loopback and host-listener preflight validation for Compose Auth testbed.
// No Docker container mutations.

const LOOPBACK = new Set(['127.0.0.1', '::1']);

export function nonLoopbackPublishedPorts(ports) {
  return Object.values(ports ?? {}).flat().filter(binding =>
    binding && !LOOPBACK.has(binding.HostIp));
}

export function preflightFailureKind(error) {
  const msg = String(error?.message ?? error ?? '');
  if (/non-loopback published port/i.test(msg) || /UNSAFE_WINDOWS_LISTENER/i.test(msg)) {
    return 'unsafe_published_port';
  }
  if (/MISSING_WINDOWS_LISTENER/i.test(msg)) return 'missing_listener';
  if (/No project containers to validate/i.test(msg)) return 'no_containers';
  if (/Unexpected local container/i.test(msg)) return 'unexpected_container';
  return 'mismatch_or_unavailable';
}

export function preflightFailureObservation(kind) {
  if (kind === 'unsafe_published_port') {
    return 'UNSAFE_PUBLISHED_PORT: stack rejected; non-loopback (0.0.0.0 or [::]) binding detected; ' +
      'harness fails closed to guarantee zero LAN exposure.';
  }
  if (kind === 'missing_listener') {
    return 'MISSING_LISTENER: expected local service listener absent on Windows host; test aborted.';
  }
  return 'Expected isolated loopback-only Compose stack unavailable or mismatched.';
}

function containerShortName(found) {
  const name = found?.Name;
  return typeof name === 'string' ? name.replace(/^\//, '') : '';
}

export function validateWindowsListeners(requiredPorts = ['55621', '55624'], connections = []) {
  if (!Array.isArray(connections)) {
    throw new Error('Connections array required for listener validation');
  }

  const portNumbers = new Set(requiredPorts.map(p => Number(p)));

  for (const conn of connections) {
    const localPort = Number(conn.LocalPort);
    if (!portNumbers.has(localPort)) continue;

    const localAddress = String(conn.LocalAddress ?? '').trim();
    if (!LOOPBACK.has(localAddress)) {
      throw new Error(`UNSAFE_WINDOWS_LISTENER: port ${localPort} is listening on non-loopback ${localAddress}`);
    }
  }

  for (const port of portNumbers) {
    const foundLoopback = connections.some(c =>
      Number(c.LocalPort) === port &&
      LOOPBACK.has(String(c.LocalAddress ?? '').trim()) &&
      (c.State === 'Listen' || c.State === 2)
    );
    if (!foundLoopback) {
      throw new Error(`MISSING_WINDOWS_LISTENER: port ${port} has no active loopback listener`);
    }
  }

  return true;
}

export function validateIsolatedLoopbackStack({
  containers,
  network,
  project,
  requiredParts = ['auth', 'db', 'kong', 'inbucket'],
  gotrueImage = 'public.ecr.aws/supabase/gotrue:v2.197.0',
  postgresImage = 'public.ecr.aws/supabase/postgres:17.11.0.004',
  apiHostPort = '55621',
  mailHostPort = '55624',
} = {}) {
  if (!Array.isArray(containers) || containers.length === 0) {
    throw new Error('No project containers to validate');
  }
  if (typeof network !== 'string' || !network || typeof project !== 'string' || !project) {
    throw new Error('Project network identity unavailable');
  }

  // Every container attached to the project network must be running and loopback-only.
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
    if (part === 'db' && found.Config?.Image !== postgresImage) {
      throw new Error('Unexpected Postgres image');
    }
    if (part === 'kong') {
      const bindings = Object.values(found.NetworkSettings?.Ports ?? {}).flat();
      const hasPort = bindings.some(b => b?.HostPort === apiHostPort && LOOPBACK.has(b?.HostIp));
      if (!hasPort) {
        throw new Error('Unexpected API port or non-loopback binding on Kong');
      }
    }
    if (part === 'inbucket') {
      const bindings = Object.values(found.NetworkSettings?.Ports ?? {}).flat();
      const hasPort = bindings.some(b => b?.HostPort === mailHostPort && LOOPBACK.has(b?.HostIp));
      if (!hasPort) {
        throw new Error('Unexpected Mailpit port or non-loopback binding');
      }
    }
  }

  return true;
}
