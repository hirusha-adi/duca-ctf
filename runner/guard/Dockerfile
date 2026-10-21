FROM alpine:3.23
RUN apk add --no-cache iptables
COPY entrypoint.sh /usr/local/bin/duca-network-guard
RUN chmod 755 /usr/local/bin/duca-network-guard
ENTRYPOINT ["/usr/local/bin/duca-network-guard"]
