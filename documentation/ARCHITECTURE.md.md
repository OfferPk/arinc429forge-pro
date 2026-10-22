# ARINC429Forge Pro — Architecture & Technical Specification

## 1\. System Overview

**ARINC429Forge Pro (v1.0.0)** is an enterprise-grade protocol engineering studio, 32-bit word dissector, signal synthesizer, and airworthiness cybersecurity auditing toolkit built for the **ARINC Specification 429 (Mark 33 Digital Information Transfer System \- DITS)**.

Originally developed by the Aeronautical Radio, Incorporated (ARINC) Airlines Electronic Engineering Committee (AEEC), ARINC 429 is the de facto commercial aviation data bus architecture globally:

- Deployed across thousands of civil air transports: Boeing (737, 747, 757, 767, 777), Airbus (A300, A310, A320, A330, A340), Gulfstream, Bombardier, Embraer, and ATR aircraft.  
- Interconnects Line Replaceable Units (LRUs) including Air Data Computers (ADC), Inertial Reference Systems (IRS), Flight Management Computers (FMC), Global Navigation Satellite Systems (GNSS), Electronic Flight Instrument Systems (EFIS), Radio Altimeters, and Full Authority Digital Engine Controls (FADEC).  
- Operates as a point-to-point or point-to-multipoint simplex broadcast bus using a twisted shielded pair with Bipolar Return-to-Zero (BPRZ) signaling at High Speed (100 kbps) or Low Speed (12.5 kbps).

---

## 2\. 32-Bit Word Architecture & Encodings

 32    31    30   29                      11   10     9   8                    1

\+----+-----+-----+--------------------------+-----+-----+----------------------+

| P  |     SSM   |        DATA FIELD        |    SDI    |         LABEL        |

|    | (2 bits)  |         (19 bits)        | (2 bits)  |       (8 bits)       |

\+----+-----+-----+--------------------------+-----+-----+----------------------+

### 2.1 The Bit-Reversed Octal Label Codec (Bits 1–8)

On the physical wire, bits are transmitted sequentially starting with Bit 1\. In ARINC 429 convention, the 8-bit Label occupies bits 1 to 8:

- The Label is universally expressed in **octal notation** (e.g. Label 203 for Altitude, Label 206 for Airspeed, Label 320 for Magnetic Heading).  
- However, the bits are transmitted in **reverse order**: Bit 1 on the wire represents the Most Significant Bit (MSB) of the label, and Bit 8 represents the Least Significant Bit (LSB).  
- In a standard 32-bit memory word (where Bit 1 is at bit position 0): \$\$\\text{Wire Label Byte} \= \\text{reverse\_bits\_8}(\\text{Octal Value})\$\$

Example: Label 203 (Pressure Altitude)

Octal 203 \= 131 decimal \= Binary 10000011b (bits \[7:0\] \= 1 0 0 0 0 0 1 1\)

Bit-Reversed on Wire    \= Binary 11000001b \= 0xC1 hex

---

### 2.2 Source / Destination Identifier (SDI, Bits 9–10)

Used in multi-system installations to direct words to or identify transmission from specific redundant systems:

- `00` \= All / Universal / Not used  
- `01` \= Left / System 1 (e.g., Captain's Air Data Computer)  
- `10` \= Right / System 2 (e.g., First Officer's Air Data Computer)  
- `11` \= Center / System 3 (e.g., Standby / Auxiliary Unit)

---

### 2.3 Data Field (Bits 11–29, 19 Bits)

ARINC 429 supports two primary numerical data formats:

#### A. Binary (BNR) Two's Complement

Used for continuous flight parameters (Altitude, Airspeed, Heading, Pitch, Roll):

- Bit 29 is the Sign bit (`0` \= Positive/North/East/Right, `1` \= Negative/South/West/Left).  
- Bits 28 to 11 represent the magnitude in two's complement binary fractional format.  
- The physical parameter value is computed as: \$\$\\text{Physical Value} \= \\text{SignedInteger}(\\text{Bits}) \\times \\text{Resolution}\$\$

| Octal Label | Parameter Name | Range | Resolution | Units |
| :---: | :---- | :---: | :---: | :---: |
| **203** | Pressure Altitude | \$-1,000\$ to \$+131,072\$ | \$1.0\$ | ft |
| **204** | Baro Corrected Altitude | \$-1,000\$ to \$+131,072\$ | \$1.0\$ | ft |
| **205** | Mach Number | \$0.0\$ to \$4.096\$ | \$0.000122\$ | Mach |
| **206** | Computed Airspeed (CAS) | \$0.0\$ to \$1024\$ | \$0.03125\$ | kts |
| **210** | True Airspeed (TAS) | \$0.0\$ to \$2048\$ | \$0.0625\$ | kts |
| **310** | Present Position Latitude | \$\\pm 90.0\$ | \$0.000172\$ | deg |
| **311** | Present Position Longitude | \$\\pm 180.0\$ | \$0.000172\$ | deg |
| **320** | Magnetic Heading | \$0.0\$ to \$360.0\$ | \$0.005493\$ | deg |
| **324** | Pitch Angle | \$\\pm 90.0\$ | \$0.005493\$ | deg |
| **325** | Roll Angle | \$\\pm 180.0\$ | \$0.005493\$ | deg |

#### B. Binary Coded Decimal (BCD)

Used for discrete numerical displays (e.g. VHF radio frequencies `118.75 MHz` or transponder squawk codes):

- 4 or 5 decimal digits encoded as 4-bit nibbles (\$0000\_2\$ to \$1001\_2\$).

---

### 2.4 Sign / Status Matrix (SSM, Bits 30–31)

Indicates operational hardware status and validity:

- **BNR Mode**:  
  - `00` \= Failure Warning (FW): Sensor fault; data must NOT be displayed or used for control.  
  - `01` \= No Computed Data (NCD): Sensor warming up or calculating; data invalid.  
  - `10` \= Functional Test (FT): On-ground BITE self-test active.  
  - `11` \= Normal Operation (NO): Valid flight data.

---

### 2.5 Odd Parity Bit (Bit 32\)

ARINC 429 enforces **Odd Parity**:

- The total count of logical `1` bits across all 32 bits (bits 1 through 32\) must be an **ODD** number.  
- Any word with an even number of `1` bits indicates transmission line corruption, electromagnetic interference (EMI), or bus collision, and is dropped immediately by receiving LRUs.

---

## 3\. FAA DO-326A / EUROCAE ED-202A Cybersecurity Threat Model

| Threat Vector | Aviation Flight Safety Risk | ARINC429Forge Defense Mechanism |
| :---- | :---- | :---- |
| **Sensor Spoofing** | Forged altitude or airspeed words injected to induce stall recovery maneuvers. | Kinematic rate-of-change plausibility boundaries (\$\\Delta\\text{Pitch} \< 15^\\circ/\\text{s}\$, \$\\Delta\\text{Alt} \< 6000\\text{ fpm}\$). |
| **Parity Fault Corruption** | Electrical cross-talk or EMI corrupting word payload undetected. | Strict odd parity validation with zero bit-error tolerance. |
| **Cross-Channel Asymmetry** | Divergent readings between Captain (SDI 1\) and First Officer (SDI 2\) flight instruments. | Automated cross-channel dual-sensor consistency monitoring with miscompare alerting. |
| **Stale Sensor Lockup** | Offline or crashed sensor failing to update flight displays while holding last value. | Dead-man refresh timeout invalidating words older than \$2.5\\times\$ nominal transmission period. |
| **Bus Babbling & Flood** | Rogue or malfunctioning transceiver transmitting continuously and starving critical flight controls. | Minimum 4-bit inter-word dead time gap enforcement and transmitter bandwidth throttling. |
| **Bridging Boundary Crossing** | Malicious traffic bridging from cabin In-Flight Entertainment (IFE) into flight control avionics. | Hardware optical data diodes, galvanic isolation, and Linux nftables packet filtering on avionics bridges. |

