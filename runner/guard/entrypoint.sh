#!/bin/sh
set -eu

# This trusted helper owns the service's network namespace. The challenge shares
# that namespace without NET_ADMIN and cannot change these rules.
iptables -P INPUT DROP
iptables -P OUTPUT DROP
iptables -P FORWARD DROP
iptables -F INPUT
iptables -F OUTPUT
iptables -F FORWARD

# IPv6 egress is deliberately disabled until equivalent routed policy is configured.
if [ -e /proc/net/if_inet6 ]; then
  ip6tables -P INPUT DROP
  ip6tables -P OUTPUT DROP
  ip6tables -P FORWARD DROP
fi

now="$(date +%s)"
if [ "$now" -ge "${DUCA_EXPIRES_AT:?}" ]; then
  echo "Instance expired; network access is disabled."
  exec sleep infinity
fi

# Docker forwards embedded DNS outside the namespace. Deny it entirely when
# internet is off; Docker's NAT rules rewrite port 53 before the filter chain.
if [ "${DUCA_INTERNET:-0}" != "1" ]; then
  iptables -A OUTPUT -d 127.0.0.11 -j REJECT
fi
iptables -A INPUT -i lo -j ACCEPT
iptables -A OUTPUT -o lo -j ACCEPT
iptables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
iptables -A OUTPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
# Bridge gateways are host addresses, even when they belong to our own subnet.
for address in ${DUCA_BLOCKED_IPS:-}; do
  case "$address" in *:*) ;; *) iptables -A OUTPUT -d "$address" -j REJECT ;; esac
done
iptables -A INPUT -s "${DUCA_SUBNET:?}" -j ACCEPT
iptables -A OUTPUT -d "$DUCA_SUBNET" -j ACCEPT

# Offline services resolve each other's static addresses through a generated
# read-only hosts file. Online instances may use Docker's embedded resolver.
if [ "${DUCA_INTERNET:-0}" = "1" ]; then
  iptables -A OUTPUT -d 127.0.0.11 -p udp --dport 53 -j ACCEPT
  iptables -A OUTPUT -d 127.0.0.11 -p tcp --dport 53 -j ACCEPT
fi

for port in ${DUCA_TCP_PORTS:-}; do iptables -A INPUT -p tcp --dport "$port" -j ACCEPT; done
for port in ${DUCA_UDP_PORTS:-}; do iptables -A INPUT -p udp --dport "$port" -j ACCEPT; done

if [ "${DUCA_INTERNET:-0}" = "1" ]; then
  for range in 0.0.0.0/8 10.0.0.0/8 100.64.0.0/10 127.0.0.0/8 169.254.0.0/16 172.16.0.0/12 192.0.0.0/24 192.0.2.0/24 192.168.0.0/16 198.18.0.0/15 198.51.100.0/24 203.0.113.0/24 224.0.0.0/4 240.0.0.0/4; do
    iptables -A OUTPUT -d "$range" -j REJECT
  done
  iptables -A OUTPUT -p tcp -j ACCEPT
  iptables -A OUTPUT -p udp -j ACCEPT
fi

touch /run/duca-ready
echo "Instance network policy installed."
while [ "$(date +%s)" -lt "$DUCA_EXPIRES_AT" ]; do sleep 1; done
rm /run/duca-ready
iptables -F INPUT
iptables -F OUTPUT
iptables -P INPUT DROP
iptables -P OUTPUT DROP
echo "Instance expired; network access is disabled until cleanup."
exec sleep infinity
