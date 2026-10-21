# Hosted challenges

Deploy and operate personal challenge instances on DUCA CTF. Hosting is optional; regular challenges continue to work without the runner.

Each player has **one instance per hosted challenge**. Instances can contain several services, such as an application and a database. The platform remains **individual play only**.

For event authoring, see the [admin guide](./admin.md). For the main production stack, complete the [deployment guide](../README.md#deployment-guide) first.

## Instance lifetime and controls

An instance gets a **two-hour lifetime when a fresh start or recreation is accepted**, including time spent pulling images and starting services.

| Action | Files and databases | Deadline | Capacity |
|--------|---------------------|----------|----------|
| **Start** | Creates a fresh instance if none remains | New two-hour deadline | Reserves an instance slot, memory and CPU |
| **Stop** | Retains container files and named volumes | Original deadline continues | Keeps its instance slot; releases memory/CPU after shutdown is confirmed |
| **Resume** | Starts the same stopped instance with its saved files | Original deadline continues | Reserves memory and CPU again |
| **Recreate** | Destroys the previous generation and creates fresh resources | New two-hour deadline | Checks capacity before accepting the replacement |
| **Delete** in admin | Destroys the instance and its files | Ends the instance | Releases its slot and resources after cleanup |
| **Expiry** | Removes containers, volumes, networks and saved configuration files | Does not extend | Releases the slot and resources after cleanup |

Stopping an instance does **not** pause its clock. Recreating requires a confirmation because existing work is permanently lost. An instance does not become available until its services are ready.

**Hosting enabled** controls new starts, resumes and recreations separately from whether a challenge is marked **Hosted**. Turning starts off leaves existing instances running until their original deadline. Players can still stop their instances. New starts also require the challenge to be available to that player, including its competition window and prerequisites.

## Capacity defaults

Configure these values in **Admin → Hosting → Capacity & network**:

| Setting | Default | Supported range |
|---------|---------|-----------------|
| Maximum active instances | 500 | 1–10,000 |
| Memory pool | 4,096 MiB | 64–1,048,576 MiB |
| CPU pool | 2,000 millicores | 25–1,000,000 millicores |
| Published ports | 20,000–29,999 | A subset of that range |
| Public host | Empty until configured | Hostname or IP address, without a scheme, path or port |

One CPU core is **1,000 millicores**. Each service reserves its declared resources **plus a trusted network guard using 16 MiB and 25 millicores**. A default service uses 256 MiB and 250 millicores, so its complete reservation is **272 MiB and 275 millicores**. The default CPU pool admits about **seven** such one-service instances at once. The 500-instance limit also counts stopped instances whose files have not expired; it is not a promise that the default resource pool runs 500 services concurrently.

Increase capacity to match the host's available resources. Include the main application, PostgreSQL, Redis, Docker and other workloads when sizing the host. Reservations are applied transactionally across players and challenges; lowering a limit does not terminate existing instances.

## Production prerequisites

- An **existing rootless Docker daemon** accessible through a UNIX socket. This feature does not install or start a second Docker daemon.
- **cgroup v2 with working memory and CPU quota enforcement**. The runner refuses to start against a rootful daemon or an engine that cannot enforce these limits.
- The deployed web image, PostgreSQL and Redis from the normal production stack.
- Caddy connected to `intranet_1`, with access to both the web and runner services.
- A public hostname or IP for challenge connections and an allowed host-firewall range of **20,000–29,999, TCP and UDP**.

Published challenge ports bind to **all IPv4 host interfaces**. Players connect directly to those ports; a VPN is not required. Their HTTP/HTTPS traffic does not pass through the site's Caddy proxy. An HTTPS endpoint requires the challenge service itself to speak TLS.

Instance lifecycle APIs are scoped to the signed-in player. Published challenge services are reachable by anyone who knows their address; the platform does not add an authentication gateway to those ports. Implement any additional access control inside the challenge application.

## Configure the runner

Add these values to the production `.env`. Keep the rest of the settings from [`.env.prod.example`](../.env.prod.example).

```env
# Generate with: openssl rand -hex 32
HOSTED_RUNNER_SECRET=<random-secret-at-least-32-characters>

# Socket of the existing rootless Docker user; replace the UID as needed.
HOSTED_DOCKER_SOCKET=/run/user/1000/docker.sock

# Absolute HOST path corresponding to this checkout's ./data/hosted directory.
HOSTED_HOST_DATA_DIR=/opt/duca-ctf/data/hosted

# Exact browser-facing site origin, including https and any nonstandard port.
APP_ORIGIN=https://ctf.duca.au

HOSTED_MIN_FREE_DISK_MB=5120
HOSTED_NETWORK_CIDR=10.210.0.0/16
```

| Variable | Purpose |
|----------|---------|
| `HOSTED_RUNNER_SECRET` | Shared private authentication for web-to-runner requests; at least 32 characters |
| `HOSTED_DOCKER_SOCKET` | Host socket mounted into the runner and watchdog at `/var/run/docker.sock` |
| `HOSTED_HOST_DATA_DIR` | Absolute path the Docker daemon can use for read-only configuration-file mounts; must match the host's `./data/hosted` directory |
| `APP_ORIGIN` | Allowed browser origin for admin WebSocket terminals; must match the public site exactly |
| `HOSTED_MIN_FREE_DISK_MB` | Startup free-space watermark, default 5,120 MiB |
| `HOSTED_NETWORK_CIDR` | Private instance subnet pool, default `10.210.0.0/16`; use an unused private `10.x.0.0/16` pool |

The Compose file supplies `DATABASE_URL`, `DOCKER_SOCKET_PATH`, `HOSTED_DATA_DIR`, `HOSTED_GUARD_IMAGE` and the web app's private `HOSTED_RUNNER_URL` automatically. The runner uses the same `SESSION_SECRET` as the web app to decrypt saved registry passwords. If you rotate `SESSION_SECRET`, re-save registry credentials encrypted under the previous secret.

The disk watermark checks the filesystem containing the runner's `HOSTED_DATA_DIR` before provisioning work. It is **not a disk quota** and does not limit how much a running challenge writes. Docker's image and volume storage may live on a different filesystem. Monitor both locations and the Docker daemon's data root separately.

## Start the optional hosting profile

Use the Docker user or context that operates your production Compose stack. The examples below assume that context is already selected. If your normal production command requires `sudo`, use that same invocation for Compose; the challenge daemon is still selected by `HOSTED_DOCKER_SOCKET`.

1. Create the host directory and set its absolute path in `.env`:

   ```bash
   mkdir -p data/hosted
   realpath data/hosted
   ```

2. Check the existing challenge daemon. Replace the example socket if necessary:

   ```bash
   docker --host unix:///run/user/1000/docker.sock info
   ```

   Confirm rootless mode, cgroup v2 and working memory/CPU limits. The runner performs its own checks and fails closed if they are missing. The Docker user must be able to read the configured host directory and uploaded configuration files.

3. Build the trusted guard image **on the challenge daemon**:

   ```bash
   docker --host unix:///run/user/1000/docker.sock build \
     --tag duca-ctf-instance-guard:latest ./runner/guard
   ```

   This builds the platform's networking helper. Challenge images themselves must already be built. The profile also has a guard-image build service; if your production Compose context and challenge daemon differ, that build alone does not put the image on the challenge daemon.

4. Start the profile:

   ```bash
   docker compose -f docker-compose.prod.yml --profile hosting up -d --build
   docker compose -f docker-compose.prod.yml --profile hosting ps
   ```

The optional services are:

| Service | Role |
|---------|------|
| `hirusha-duca-ctf-guard-image` | One-time trusted helper image build/start check |
| `hirusha-duca-ctf-runner` | Reconciles requested instance state, starts services and handles admin logs/terminals |
| `hirusha-duca-ctf-instance-watchdog` | Independently removes expired resources using their management labels; does not need the database |

If the core stack and challenge daemon are the same rootless engine, all images and resources share that engine. If they differ, the runner's socket selects the challenge engine while its Compose networks still connect it to PostgreSQL, the web app and Caddy. Docker bind-mount source paths must always be valid on the challenge daemon's host.

## Configure Caddy

Proxy **only `/instance-terminal`** to the runner, before the web fallback. Keep the runner's health and log endpoints private; do not publish port 3110 on the host or reverse-proxy the whole runner.

```caddyfile
ctf.duca.au {
    handle /instance-terminal {
        reverse_proxy hirusha-duca-ctf-runner:3110
    }

    handle {
        reverse_proxy hirusha-duca-ctf-web:3000 {
            header_up X-Forwarded-For {remote_ip}
            header_up X-Real-IP {remote_ip}
            header_up X-Forwarded-Proto {scheme}
            header_up Host {host}
        }
    }
}
```

Caddy forwards WebSocket upgrades on the terminal route. The browser obtains a short-lived, single-use admin connection ticket from the web app and sends it as a WebSocket subprotocol. Do not add tokens to shared links or access logs. Established terminals remain tied to the administrator's access, instance generation and instance deadline.

Reload Caddy using your existing deployment procedure, then set **Public hostname or IP address** in **Admin → Hosting → Capacity & network**. That address is used in players' published service endpoints and may differ from the site's hostname.

## Author a hosted challenge

1. Create a normal challenge with its description, category, points and accepted flags.
2. Open **Admin → Hosting → Challenge configuration** and choose it.
3. Save Compose YAML or upload a ZIP bundle.
4. Mark it **Hosted challenge**. Keep starts disabled until you have checked the template and capacity settings.
5. Select whether the instance needs outbound internet access.
6. Enable **Allow new starts, resumes and recreations** and test using a player account while the challenge is available.

Registry images can be public or private. Save private registry credentials under **Admin → Hosting → Private registries** using the registry host, username and password/access token. Passwords are encrypted in the database and are not returned by the management API. Use explicit image references; the runner records the immutable image ID and digest used by each instance generation.

Applications run with **all Linux capabilities dropped**, no privilege escalation and declared memory/CPU/process limits. Images whose entrypoints expect privileged operations, such as changing ownership or capabilities, may need an adapted image or entrypoint. Use an unprivileged application port such as 8080 rather than relying on capability-dependent startup behaviour.

### Restricted Compose example

This small example serves a bundled `index.html` using a prebuilt Python image. Replace it with your own prebuilt challenge image when publishing a real task.

```yaml
services:
  web:
    image: python:3.13-alpine
    command:
      - python
      - -m
      - http.server
      - "8080"
      - --bind
      - 0.0.0.0
      - --directory
      - /challenge
    ports:
      - target: 8080
        protocol: tcp
        app_protocol: http
        name: Website
    mem_limit: 256m
    cpus: 0.25
    pids_limit: 64
    read_only: true
    volumes:
      - ./index.html:/challenge/index.html:ro
```

Package it as a ZIP with exactly one Compose file at the archive root:

```text
challenge.zip
├── compose.yaml
└── index.html
```

```bash
zip challenge.zip compose.yaml index.html
```

This template reserves **272 MiB and 275 millicores**, including its guard. A port's `protocol` is `tcp` or `udp`; `app_protocol` is `http`, `https`, `tcp` or `udp`. Declare the **container port only**. The platform assigns a host port in the configured range. For example, a TCP service on 1337 can use `target: 1337`, `protocol: tcp`, `app_protocol: tcp`.

For a writable application/database volume, declare a top-level named volume and mount it into the relevant service. Named volumes and the container's writable layer survive Stop/Resume; Recreate and expiry remove them. Make sure the image's user can write to its volume without requiring a privileged ownership-changing entrypoint.

### Supported options and bundle limits

| Area | Supported behaviour |
|------|---------------------|
| Services | 1–8 named services using prebuilt `image` references |
| Resources | `mem_limit`, `cpus`, `pids_limit`; defaults 256 MiB, 250 millicores and 64 processes per service |
| Process | `command`, `entrypoint`, explicit `environment`, bundled `env_file`, `user`, `working_dir`, `read_only` |
| Connectivity | Container `ports`, service-name dependencies and healthchecks; at most 20 published ports per instance |
| Storage | Declared local named volumes; bundled files mounted read-only; Compose `configs` backed by bundled files |
| ZIP | At most 10 MiB compressed, 20 MiB expanded and 100 archive entries |
| Compose file | Exactly one root `compose.yaml`, `compose.yml`, `docker-compose.yaml` or `docker-compose.yml` |

Arbitrary host bind mounts, privileged containers, custom host networking, YAML aliases/tags, host environment interpolation and builds are rejected. Bundled configuration paths must remain within the archive; absolute paths, traversal, symlinks and duplicate paths are rejected. Dockerfiles are not executed. Use a new ZIP to replace or add bundled files; editing the saved Compose YAML retains existing bundled files.

### Internet access and service names

Each instance uses a separate bridge with per-service guard firewalls. Published ports reach the challenge applications through those guards.

**Internet access is off by default.** Services in the same instance resolve one another through generated read-only `/etc/hosts` entries, so ordinary hostname resolution can use Compose service names. Direct DNS queries, including libraries that bypass `/etc/hosts`, are unavailable while internet access is off. Design the challenge accordingly.

When internet access is enabled, services can use normal DNS and permitted public outbound connections. Traffic to the host and protected/private destinations remains filtered. Incoming published challenge ports remain available with either setting. Changes to the internet setting apply to fresh instance generations; Stop/Resume retains the saved generation's setting.

## Admin operations and troubleshooting

**Admin → Hosting → Instances** lists players, challenges, states, service/container counts, resource reservations, published endpoints and expiry. Inspect an instance to stream a service's logs or open its interactive terminal. Admins can start/resume, stop, recreate or delete instances. Logs and terminals require admin access; players see only their own lifecycle controls and connection details.

**Lifecycle events** records state transitions and provisioning phases, including image pulls and service startup. Failure details shown there are bounded and sanitized. Start with those events and the affected container's logs when an instance enters `FAILED`.

| Symptom | Check |
|---------|-------|
| Hosting controls absent | Challenge is marked Hosted and the player can view it |
| Starts disabled | Challenge hosting switch, event availability and prerequisites |
| Capacity error | Instance count, memory/CPU pool, retained stopped slots and available published ports |
| Runner unhealthy | Rootless socket access, cgroup v2 enforcement, database connection and runner secret |
| Image pull fails | Image reference, registry credentials, daemon connectivity and disk space |
| Guard cannot start | Trusted guard image exists on the challenge daemon; inspect runner lifecycle events |
| Service startup fails | Capabilities dropped by the platform, command/entrypoint, file permissions, healthcheck and declared resources |
| Service cannot resolve a name | Outbound internet setting; with internet off, use service names through `/etc/hosts` rather than direct DNS |
| Public endpoint unreachable | Public host/DNS, host firewall, assigned TCP/UDP port, application bind address and HTTP/HTTPS scheme |
| Config mount missing | `HOSTED_HOST_DATA_DIR` is absolute and matches the host's `data/hosted`; file exists in the ZIP |
| Terminal fails to connect | Exact `APP_ORIGIN`, Caddy terminal route, admin access, running service and `/bin/sh` in the image |
| Deleting a challenge/event returns a conflict | Destroy its active instances and wait for cleanup first |

View runner/watchdog logs without exposing their private endpoints:

```bash
docker compose -f docker-compose.prod.yml --profile hosting logs --tail 100 \
  hirusha-duca-ctf-runner hirusha-duca-ctf-instance-watchdog
```

Test a complete lifecycle before an event: start, connect, create a file, stop, resume and confirm the file remains, then recreate and confirm the previous work is gone. Check that the resumed deadline stays unchanged and the recreated deadline moves forward. Validate endpoint reachability from a player network, including any UDP services, and confirm expired resources are removed.

## Storage, updates and shutdown

The runner stores uploaded configuration files under `./data/hosted`; Docker stores application writable layers, images and named volumes in the rootless daemon's data root. SQL backups contain hosting configuration and metadata, not live Docker files or volumes. Treat player instances as disposable; a database restore alone does not restore their running work.

Event clones, bank deployments and YAML imports preserve hosted templates but **disable hosting starts** on the new challenges. Review capacity, private registry access and internet settings before enabling them. YAML exports may contain secret flag answers and configuration values; keep them private. They do not include live player instances or registry credentials.

For updates, rebuild the trusted guard image on the challenge daemon and start the hosting profile with the normal production update command. Existing instances retain their saved generation and deadline. Destroy active instances and wait for cleanup before deliberately shutting down hosting.

Stopping the runner or running `docker compose down` does not automatically remove the dynamically created challenge containers. The independent watchdog removes expired labelled resources; the guards enforce network expiry even if the control plane is unavailable. Keep the watchdog running for cleanup. If it is stopped too, restore it to remove expired containers and volumes.

The runner and watchdog have access to the Docker socket and are **trusted infrastructure**. Challenge containers do not receive that socket. Rootless containers still share the host kernel; this design does not provide VM-level isolation. Keep the host and engine maintained and operate the runner with the existing trusted deployment account.

Cleanup targets only resources bearing DUCA's management labels and instance/generation scope. Pulled images can be shared with other workloads on this daemon. Do not use broad Docker prune commands as routine challenge cleanup or remove unrelated images, networks or volumes.

## Related documentation

- [Admin guide](./admin.md)
- [User guide](./users.md)
- [Developer guide](./developers.md)
- [Production deployment](../README.md#deployment-guide)
- [Documentation index](./README.md)
