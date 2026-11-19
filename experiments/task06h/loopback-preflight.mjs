// Task 06H-D: Pure loopback and host-listener preflight validation for Compose Auth testbed.
// No Docker container mutations.

const LOOPBACK = new Set(['127.0.0.1', '::1']);

export function nonLoopbackPublishedPorts(ports) {
  return Object.values(ports ?? {}).flat().filter(binding =>
    binding && !LOOPBACK.has(binding.HostIp));
}

export function extractPublishedBindings(portsObj) {
  if (!portsObj || typeof portsObj !== 'object') return [];
  const result = [];
  for (const [containerPort, bindings] of Object.entries(portsObj)) {
    if (Array.isArray(bindings)) {
      for (const b of bindings) {
        if (b && (b.HostPort || b.HostIp)) {
          result.push({
            containerPort,
            hostIp: String(b.HostIp ?? '').trim(),
            hostPort: String(b.HostPort ?? '').trim(),
          });
        }
      }
    }
  }
  return result;
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
      'harness fails closed to prevent executing Auth experiments on an exposed stack. ' +
      'NOTE: Preflight executes post-startup and prevents testing on unsafe ports; it does not prevent initial startup exposure. Immediate stack shutdown required.';
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

export function assertExactPortBinding({
  containerName,
  part,
  expectedContainerPort,
  expectedHostPort,
  expectedHostIp = '127.0.0.1',
  hostConfigPorts,
  networkSettingsPorts,
}) {
  const hostBinds = extractPublishedBindings(hostConfigPorts);
  const netBinds = extractPublishedBindings(networkSettingsPorts);

  if (hostBinds.length === 0) {
    throw new Error(`Missing HostConfig port bindings on ${containerName}`);
  }
  if (netBinds.length === 0) {
    throw new Error(`Missing NetworkSettings port bindings on ${containerName}`);
  }
  if (hostBinds.length !== 1) {
    throw new Error(`Unauthorized or duplicate HostConfig port bindings on ${containerName}: expected 1, found ${hostBinds.length}`);
  }
  if (netBinds.length !== 1) {
    throw new Error(`Unauthorized or duplicate NetworkSettings port bindings on ${containerName}: expected 1, found ${netBinds.length}`);
  }

  const hb = hostBinds[0];
  const nb = netBinds[0];

  // Enforce exact expected values on HostConfig (strictly 127.0.0.1, no wildcard, no IPv6)
  if (hb.containerPort !== expectedContainerPort || hb.hostPort !== expectedHostPort || hb.hostIp !== expectedHostIp) {
    throw new Error(`Unexpected HostConfig port mapping on ${containerName}: expected ${expectedContainerPort} -> ${expectedHostIp}:${expectedHostPort}, got ${hb.containerPort} -> ${hb.hostIp}:${hb.hostPort}`);
  }

  // Enforce exact expected values on NetworkSettings (strictly 127.0.0.1, no wildcard, no IPv6)
  if (nb.containerPort !== expectedContainerPort || nb.hostPort !== expectedHostPort || nb.hostIp !== expectedHostIp) {
    throw new Error(`Unexpected NetworkSettings port mapping on ${containerName}: expected ${expectedContainerPort} -> ${expectedHostIp}:${expectedHostPort}, got ${nb.containerPort} -> ${nb.hostIp}:${nb.hostPort}`);
  }

  // Enforce exact equivalence between HostConfig and NetworkSettings
  if (hb.containerPort !== nb.containerPort || hb.hostIp !== nb.hostIp || hb.hostPort !== nb.hostPort) {
    throw new Error(`Inconsistent port bindings on ${containerName}: HostConfig (${hb.containerPort} -> ${hb.hostIp}:${hb.hostPort}) does not match NetworkSettings (${nb.containerPort} -> ${nb.hostIp}:${nb.hostPort})`);
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

  // Exact membership assertion: reject missing or extra containers attached to the stack
  const expectedNames = new Set(requiredParts.map(part => `supabase_${part}_${project}`));
  if (containers.length !== requiredParts.length) {
    throw new Error(`Container count mismatch: expected ${requiredParts.length}, found ${containers.length}`);
  }

  for (const found of containers) {
    const sName = containerShortName(found);
    if (!expectedNames.has(sName)) {
      throw new Error(`Unexpected extra container attached to project network: ${sName || 'unknown'}`);
    }
    if (!found?.State?.Running) {
      throw new Error(`Unexpected local container state: ${sName || 'unknown'}`);
    }
    const nets = found.NetworkSettings?.Networks ?? {};
    if (Object.keys(nets).length !== 1 || !nets[network]) {
      throw new Error(`Unexpected local container/network: ${sName || 'unknown'}`);
    }

    // Mandatory Compose project label assertion: reject containers missing the label or having mismatch
    const composeProj = found.Config?.Labels?.['com.docker.compose.project'];
    if (!composeProj || composeProj !== project) {
      throw new Error(`Invalid or missing Compose project label on ${sName}: expected '${project}', got '${composeProj || 'none'}'`);
    }

    // Forbid attachment of historical Task 06G volumes
    const mounts = found.Mounts ?? [];
    for (const m of mounts) {
      if (m.Name && /task06g/i.test(m.Name)) {
        throw new Error(`Historical Task 06G volume attached to container ${sName}: ${m.Name}`);
      }
    }

    // Inspect BOTH HostConfig.PortBindings and NetworkSettings.Ports for non-loopback exposure
    if (nonLoopbackPublishedPorts(found.HostConfig?.PortBindings).length) {
      throw new Error(`Local container ${sName} has non-loopback HostConfig published ports`);
    }
    if (nonLoopbackPublishedPorts(found.NetworkSettings?.Ports).length) {
      throw new Error(`Local container ${sName} has non-loopback NetworkSettings published ports`);
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

    // Auth and DB must NOT have any host port bindings in either HostConfig or NetworkSettings
    if (['auth', 'db'].includes(part)) {
      const hostBinds = extractPublishedBindings(found.HostConfig?.PortBindings);
      const netBinds = extractPublishedBindings(found.NetworkSettings?.Ports);
      if (hostBinds.length > 0 || netBinds.length > 0) {
        throw new Error(`Security violation: ${part} container must not have any published host ports`);
      }
    }

    if (part === 'kong') {
      assertExactPortBinding({
        containerName: name,
        part: 'kong',
        expectedContainerPort: '8000/tcp',
        expectedHostPort: apiHostPort,
        expectedHostIp: '127.0.0.1',
        hostConfigPorts: found.HostConfig?.PortBindings,
        networkSettingsPorts: found.NetworkSettings?.Ports,
      });
    }

    if (part === 'inbucket') {
      assertExactPortBinding({
        containerName: name,
        part: 'inbucket',
        expectedContainerPort: '8025/tcp',
        expectedHostPort: mailHostPort,
        expectedHostIp: '127.0.0.1',
        hostConfigPorts: found.HostConfig?.PortBindings,
        networkSettingsPorts: found.NetworkSettings?.Ports,
      });
    }
  }

  return true;
}
