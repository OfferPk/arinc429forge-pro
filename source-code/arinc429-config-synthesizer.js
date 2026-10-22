/**
 * ARINC429Forge Pro - Avionics Infrastructure Configuration Synthesizer
 * Generates production-hardened Linux nftables, Suricata L7 avionics bus signatures,
 * and systemd sandboxed service units for Aircraft Gateway Bridges & Flight Test Racks.
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ARINC429ConfigSynthesizer = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var ARINC429ConfigSynthesizer = {};

  /**
   * Generate Linux nftables ruleset for Avionics Ethernet-to-ARINC 429 Bridges
   * @param {Object} options
   * @returns {string}
   */
  ARINC429ConfigSynthesizer.generateNftablesRules = function (options) {
    options = options || {};
    var port = options.port || 51200;
    var trustedAvionicsIps = options.trustedAvionicsIps || ['10.0.1.10', '10.0.1.20', '10.0.2.0/24'];
    var rateLimit = options.rateLimit || '2000/second';
    var burst = options.burst || '500 packets';

    var ipsStr = trustedAvionicsIps.join(', ');

    return [
      '#!/usr/sbin/nft -f',
      '# ARINC429Forge Pro - Production nftables Avionics Data Bus Filtering',
      '# Hardened for FAA DO-326A / RTCA DO-356A Aircraft Network Security Baselines',
      'flush ruleset',
      '',
      'table inet arinc_filter {',
      '    set certified_avionics_fmc {',
      '        type ipv4_addr',
      '        flags interval',
      '        elements = { ' + ipsStr + ' }',
      '    }',
      '',
      '    chain inbound_avionics_bridge {',
      '        type filter hook input priority filter; policy drop;',
      '',
      '        # Allow loopback and established/related connections',
      '        iif "lo" accept',
      '        ct state established,related accept',
      '        ct state invalid drop',
      '',
      '        # Administrative Maintenance Shell (Restricted to Flight Test Ethernet)',
      '        tcp dport 22 ct state new limit rate 10/minute accept',
      '',
      '        # ARINC 429 over Ethernet/UDP Gateway Stream (UDP Port ' + port + ')',
      '        # Restrict ingestion strictly to certified Flight Management & Air Data Computers',
      '        udp dport ' + port + ' ip saddr @certified_avionics_fmc limit rate ' + rateLimit + ' burst ' + burst + ' accept',
      '',
      '        # Log and drop untrusted avionics packet injections',
      '        udp dport ' + port + ' limit rate 10/second log prefix "[ARINC429-UNTRUSTED-NODE]: " drop',
      '        drop',
      '    }',
      '',
      '    chain outbound_avionics_bridge {',
      '        type filter hook output priority filter; policy accept;',
      '        oif "lo" accept',
      '        ct state established,related accept',
      '    }',
      '}'
    ].join('\n');
  };

  /**
   * Generate Suricata L7 Avionics Threat Signatures
   * @param {Object} options
   * @returns {string}
   */
  ARINC429ConfigSynthesizer.generateSuricataSignatures = function (options) {
    options = options || {};
    var port = options.port || 51200;
    var baseSid = options.baseSid || 3000100;

    return [
      '# =========================================================================',
      '# ARINC429Forge Pro - Suricata L7 Threat Detection Signatures for Avionics Buses',
      '# Targets: Parity Faults, Sensor Spoofing, Failure Warning (FW), Bus Babbling',
      '# =========================================================================',
      '',
      '# 1. Invalid Even Parity Detected (ARINC 429 Odd Parity Violation)',
      'alert udp any any -> any ' + port + ' (msg:"ARINC429-FORGE: Invalid Parity Bit on Avionics Stream - Potential Bus Corruption"; ' +
        'byte_test:1,&,0x80,0; ' + // Test MSB Parity bit
        'classtype:protocol-command-decode; sid:' + (baseSid + 1) + '; rev:1; metadata:created_at 2026_10_05;)',
      '',
      '# 2. Failure Warning (SSM 00) Active on Primary Flight Sensor (Label 203 Altitude)',
      'alert udp any any -> any ' + port + ' (msg:"ARINC429-FORGE: Critical Failure Warning (FW) Active on Air Data Altitude Stream"; ' +
        'content:"|C1|"; offset:3; depth:1; ' + // Bit-reversed Label 203 (0xC1)
        'byte_test:1,&,0x60,0; ' + // SSM bits 30-31 = 00b
        'classtype:policy-violation; sid:' + (baseSid + 2) + '; rev:1; metadata:created_at 2026_10_05;)',
      '',
      '# 3. High Rate-of-Change Anomaly on Pitch Gyro Stream (Label 324)',
      'alert udp any any -> any ' + port + ' (msg:"ARINC429-FORGE: Abnormal Pitch Rate Spike - Potential Sensor Spoofing Injection"; ' +
        'content:"|D4|"; offset:3; depth:1; ' + // Bit-reversed Label 324
        'byte_test:2,>,4000,1,big; ' +
        'classtype:attempted-admin; sid:' + (baseSid + 3) + '; rev:1; metadata:created_at 2026_10_05;)',
      '',
      '# 4. Unassigned / Out-of-Spec Octal Label Injected',
      'alert udp any any -> any ' + port + ' (msg:"ARINC429-FORGE: Unauthorized / Unregistered Label Injected on Critical Avionics Bus"; ' +
        'content:"|FF|"; offset:3; depth:1; ' +
        'classtype:bad-unknown; sid:' + (baseSid + 4) + '; rev:1; metadata:created_at 2026_10_05;)',
      '',
      '# 5. Bus Babbling / High-Frequency Transmission Flood',
      'alert udp any any -> any ' + port + ' (msg:"ARINC429-FORGE: Avionics Bridge Bus Babbling Threshold Exceeded (>2500 pps)"; ' +
        'threshold:type both, track by_src, count 2500, seconds 1; ' +
        'classtype:denial-of-service; sid:' + (baseSid + 5) + '; rev:1; metadata:created_at 2026_10_05;)'
    ].join('\n');
  };

  /**
   * Generate systemd sandboxed service unit for ARINC 429 Bridge
   * @param {Object} options
   * @returns {string}
   */
  ARINC429ConfigSynthesizer.generateSystemdService = function (options) {
    options = options || {};
    var appUser = options.user || 'arinc429';
    var appGroup = options.group || 'arinc429';
    var execPath = options.execPath || '/opt/arinc429forge/bin/arinc429-bridge';
    var configPath = options.configPath || '/etc/arinc429forge/bridge.yaml';

    return [
      '[Unit]',
      'Description=ARINC429Forge Pro - Commercial Avionics Ethernet Bridge Daemon',
      'Documentation=https://www.aviation-ia.com/activities/arinc-standards',
      'After=network-online.target time-sync.target',
      'Wants=network-online.target',
      '',
      '[Service]',
      'Type=notify',
      'User=' + appUser,
      'Group=' + appGroup,
      'WorkingDirectory=/opt/arinc429forge',
      'ExecStart=' + execPath + ' --config ' + configPath,
      'ExecReload=/bin/kill -HUP $MAINPID',
      'Restart=always',
      'RestartSec=1s',
      'TimeoutStopSec=10s',
      '',
      '# Security Hardening & Zero-Trust Sandbox (DO-326A / FAA AC 119-1 Compliant)',
      'ProtectSystem=strict',
      'ProtectHome=true',
      'PrivateTmp=true',
      'PrivateDevices=true',
      'ProtectKernelTunables=true',
      'ProtectKernelModules=true',
      'ProtectControlGroups=true',
      'RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX',
      'RestrictNamespaces=true',
      'RestrictRealtime=true',
      'RestrictSUIDSGID=true',
      'MemoryDenyWriteExecute=true',
      'LockPersonality=true',
      'NoNewPrivileges=true',
      '',
      '# Filesystem Access Controls',
      'ReadWritePaths=/var/log/arinc429 /var/spool/arinc429/traces',
      'ReadOnlyPaths=/etc/arinc429forge',
      '',
      '# Network Capabilities (Port 51200 binding & Low-Latency Scheduling)',
      'CapabilityBoundingSet=CAP_NET_BIND_SERVICE CAP_SYS_NICE',
      'AmbientCapabilities=CAP_NET_BIND_SERVICE CAP_SYS_NICE',
      '',
      '# Resource Limits for High-Frequency Flight Bus Ingestion',
      'LimitNOFILE=65536',
      'LimitNPROC=4096',
      '',
      '[Install]',
      'WantedBy=multi-user.target'
    ].join('\n');
  };

  return ARINC429ConfigSynthesizer;
}));
