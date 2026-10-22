# ARINC429Forge Pro — Operations & User Guide

## 1\. Quick Start

### 1.1 Web Studio Interface

To launch the interactive Web Studio:

1. Open `product_154/source-code/index.html` in any modern web browser (Chrome, Edge, Firefox, Safari).  
2. The Studio operates 100% locally with zero external network or CDN calls.  
3. Explore the six operational tabs:  
   - **32-Bit Word Studio**: Synthesize and dissect ARINC 429 words, select octal labels, configure physical engineering values (altitude, airspeed, heading), select SDI and SSM status, and toggle parity bit error injection.  
   - **Avionics Bus Dissector**: Multi-channel flight bus stream monitor displaying live 32-bit datagrams.  
   - **Cockpit PFD Simulator**: Interactive Electronic Flight Instrument System (EFIS) Primary Flight Display with airspeed tape, altimeter tape, artificial horizon, and heading compass updating in real-time.  
   - **DO-326A Cyber Auditor**: Automated 10-vector compliance evaluation checking against FAA DO-326A, RTCA DO-356A, and FAA AC 119-1 airworthiness standards.  
   - **Avionics Bridge Hardening**: Production-ready Linux nftables firewall rules, Suricata L7 avionics threat signatures, and systemd sandboxed service units.  
   - **WireShark PCAP Exporter**: Download binary Libpcap 2.4 capture files encapsulating 32-bit avionics words over UDP (port 51200).

---

### 1.2 Command-Line Interface (CLI)

The CLI tool is located at `build/arinc429forge-cli.py`. It requires Python 3.8+ with no external pip dependencies.

#### Pack a 32-Bit ARINC 429 Word (Altitude FL350)

./build/arinc429forge-cli.py pack-word \\

  \--label 203 \\

  \--value 35000.0 \\

  \--sdi 1 \\

  \--ssm 3

Output:

\[SUCCESS\] 32-Bit ARINC Word: E24420C1 (0xE24420C1)

  Octal Label: 203

  Value:       35000.0

  SDI:         1

  SSM:         3

  Parity:      1 (Odd Valid)

#### Dissect an ARINC 429 Hex Word

./build/arinc429forge-cli.py dissect-word \--hex E24420C1

#### Pack Computed Airspeed (320 Knots)

./build/arinc429forge-cli.py pack-word \--label 206 \--value 320.0 \--sdi 1 \--ssm 3

#### Run 10-Vector Airworthiness Cybersecurity Audit

./build/arinc429forge-cli.py audit

#### Export WireShark Packet Capture (.pcap)

./build/arinc429forge-cli.py export-pcap \--out arinc429-avionics.pcap

---

## 2\. Integration with Commercial Avionics Hardware & Test Benches

### 2.1 Interface Hardware & Test Benches

ARINC429Forge Pro connects seamlessly with standard commercial aerospace interface hardware:

- **Holt Integrated Circuits**: HI-3582 / HI-3584 transceivers.  
- **AIM GmbH / Abaco Systems**: PCIe and USB ARINC 429 interface cards.  
- **Ballard Technology / Astronics**: USB 429 portable test adapters.  
- **DDC (Data Device Corporation)**: Multi-channel avionics interface modules.

### 2.2 Flight Test Instrumentation (FTI) Setup

1. Connect ARINC 429 test bus via high-speed differential receiver (100 kbps).  
2. Stream binary datagrams over Ethernet/UDP port 51200 into ARINC429Forge Pro.  
3. Validate parity and SSM status bits in real-time, verifying that no Failure Warning or unassigned labels enter flight computers.

---

## 3\. Avionics Gateway Deployment & Security Hardening

1. **Firewall Isolation**: Deploy the synthesized nftables ruleset (`/etc/nftables.conf`) to allow inbound UDP 51200 only from certified Flight Management Computer (FMC) IP addresses.  
2. **Suricata Intrusion Detection**: Install Suricata on avionics Ethernet bridges. Load generated signatures to alert on odd parity violations, sensor spoofing spikes, or bus babbling.  
3. **Sandboxed Daemon**: Install `arinc429-bridge.service` in `/etc/systemd/system/`. Run under dedicated unprivileged user `arinc429` with `ProtectSystem=strict` and `CapabilityBoundingSet=CAP_NET_BIND_SERVICE CAP_SYS_NICE`.