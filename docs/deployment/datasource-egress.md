# Data-source outbound network policy

Data-source tools call tenant-configured URLs. Application validation rejects
non-public DNS answers immediately before every request and redirect, but the
production network must provide the second enforcement layer described here.

## Required policy

Apply the policy to the API workload identity, pod, task, or security group—not
to the whole database network. Permit DNS to the approved resolver and TCP 80/443
to public destinations. Deny all other outbound traffic from that workload,
including these IPv4/IPv6 categories:

- RFC1918: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`
- loopback: `127.0.0.0/8`, `::1/128`
- link-local: `169.254.0.0/16`, `fe80::/10`
- shared/reserved/non-global ranges, including `100.64.0.0/10`, multicast,
  documentation, benchmark, and unspecified networks
- cloud metadata endpoints, especially `169.254.169.254/32` and
  `fd00:ec2::254/128`

Use an allow-list proxy when the platform cannot express “public Internet
except all non-global ranges.” The proxy must resolve DNS itself, reject mixed
public/private answers, re-check redirects, and refuse CONNECT to literal or
resolved non-public addresses.

## Platform mapping

- Kubernetes: use a CNI with egress FQDN/IP policies (Cilium or Calico). A plain
  Kubernetes `NetworkPolicy` cannot reliably express safe Internet access after
  DNS resolution. Allow PostgreSQL/Redis separately by service identity and port.
- AWS ECS/EKS: route the API workload through an egress firewall or explicit
  proxy; deny metadata access at task/pod level and enforce IMDSv2 on hosts.
- GCP/Azure: use the platform firewall plus an egress proxy or secure web
  gateway; explicitly deny each platform metadata address.
- Docker Compose is development-only. Do not treat its bridge network as the
  production egress control.

## Release verification

Before enabling tenant data sources in an environment, confirm all four checks:

1. A known public HTTPS endpoint succeeds.
2. `127.0.0.1`, RFC1918 hosts, and the metadata address fail at the network layer.
3. A public hostname that redirects to a private address fails.
4. Firewall/proxy deny events are logged without request credentials.

The application-side policy is implemented in
`app/services/datasource/security.py`; both layers are mandatory.
