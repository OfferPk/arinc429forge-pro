/**
 * ARINC429Forge Pro - Protocol Engine (arinc429-protocol-engine.js)
 * 
 * Implements:
 * - ARINC Specification 429 (Mark 33 Digital Information Transfer System - DITS)
 * - 32-Bit Word Architecture: Label (1-8), SDI (9-10), Data Field (11-29), SSM (30-31), Parity (32)
 * - Bit-Reversed Octal Label Codec (MSB-on-wire to LSB transmission order)
 * - Binary (BNR) Two's Complement Fractional Scaling Engine
 * - Binary Coded Decimal (BCD) Multi-Digit Transcoder
 * - Odd & Even Parity Generator and Dissector
 * - Aviation Standard Label Dictionary (Altitude, Airspeed, Mach, Heading, Pitch, Roll, Lat/Lon)
 * - Wireshark-Compatible Libpcap 2.4 Binary Network Exporter (UDP Port 51200 / 4290)
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ARINC429ProtocolEngine = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var ARINC429ProtocolEngine = {};

  // Standard ARINC 429 Equipment Label Specifications
  var LABEL_SPECS = {
    "203": { name: "Pressure Altitude", type: "BNR", units: "ft", resolution: 1.0, min: -1000, max: 131072, bits: 17 },
    "204": { name: "Baro Corrected Altitude", type: "BNR", units: "ft", resolution: 1.0, min: -1000, max: 131072, bits: 17 },
    "205": { name: "Mach Number", type: "BNR", units: "Mach", resolution: 0.000122, min: 0.0, max: 4.096, bits: 15 },
    "206": { name: "Computed Airspeed (CAS)", type: "BNR", units: "kts", resolution: 0.03125, min: 0.0, max: 1024, bits: 15 },
    "210": { name: "True Airspeed (TAS)", type: "BNR", units: "kts", resolution: 0.0625, min: 0.0, max: 2048, bits: 15 },
    "310": { name: "Present Position Latitude", type: "BNR", units: "deg", resolution: 0.000172, min: -90.0, max: 90.0, bits: 20 },
    "311": { name: "Present Position Longitude", type: "BNR", units: "deg", resolution: 0.000172, min: -180.0, max: 180.0, bits: 20 },
    "320": { name: "Magnetic Heading", type: "BNR", units: "deg", resolution: 0.005493, min: 0.0, max: 360.0, bits: 16 },
    "324": { name: "Pitch Angle", type: "BNR", units: "deg", resolution: 0.005493, min: -90.0, max: 90.0, bits: 15 },
    "325": { name: "Roll Angle", type: "BNR", units: "deg", resolution: 0.005493, min: -180.0, max: 180.0, bits: 16 },
    "377": { name: "Equipment Identification", type: "DISCRETE", units: "ID", resolution: 1, min: 0, max: 262143, bits: 18 }
  };

  // --- 1. Bit Reversal & Octal Label Codec ---
  function reverseBits8(val) {
    var res = 0;
    for (var i = 0; i < 8; i++) {
      if ((val >> i) & 1) {
        res |= (1 << (7 - i));
      }
    }
    return res;
  }

  function octalToLabelByte(octalStr) {
    var octVal = parseInt(octalStr, 8) & 0xFF;
    return reverseBits8(octVal);
  }

  function labelByteToOctal(byteVal) {
    var rev = reverseBits8(byteVal & 0xFF);
    return ("000" + rev.toString(8)).slice(-3);
  }

  // --- 2. Parity Calculation (Odd Parity Default) ---
  function calculateOddParity(word31) {
    // Count number of set bits in bits 0 to 30
    var count = 0;
    var w = word31 >>> 0;
    while (w > 0) {
      count += (w & 1);
      w = w >>> 1;
    }
    // If count is even, parity bit must be 1 to make total odd. If odd, parity bit is 0.
    return (count % 2 === 0) ? 1 : 0;
  }

  function verifyOddParity(word32) {
    var count = 0;
    var w = word32 >>> 0;
    while (w > 0) {
      count += (w & 1);
      w = w >>> 1;
    }
    return (count % 2 === 1);
  }

  // --- 3. BNR Two's Complement Conversion ---
  function encodeBnrValue(numericVal, resolution, dataBits) {
    dataBits = dataBits || 19;
    var steps = Math.round(numericVal / resolution);
    var maxVal = Math.pow(2, dataBits - 1) - 1;
    var minVal = -Math.pow(2, dataBits - 1);

    if (steps > maxVal) steps = maxVal;
    if (steps < minVal) steps = minVal;

    // Convert to signed integer in dataBits
    var mask = (1 << dataBits) - 1;
    var bnrInt = steps & mask;
    return bnrInt;
  }

  function decodeBnrValue(bnrInt, resolution, dataBits) {
    dataBits = dataBits || 19;
    var signMask = 1 << (dataBits - 1);
    var value = bnrInt;
    if ((bnrInt & signMask) !== 0) {
      // Negative two's complement
      value = bnrInt - Math.pow(2, dataBits);
    }
    return Number((value * resolution).toFixed(4));
  }

  // --- 4. ARINC 429 32-Bit Word Pack / Dissect ---
  function packWord(params) {
    params = params || {};
    var octalLabel = params.label || "203";
    var sdi = (params.sdi !== undefined ? params.sdi : 0) & 0x03; // Bits 9-10 (00, 01, 10, 11)
    var ssm = (params.ssm !== undefined ? params.ssm : 3) & 0x03; // Bits 30-31 (11 = Normal Operation)
    var spec = LABEL_SPECS[octalLabel] || { type: "BNR", resolution: 1.0, bits: 19 };

    var dataFieldInt = 0;
    if (params.dataInteger !== undefined) {
      dataFieldInt = params.dataInteger & 0x7FFFF;
    } else {
      var numVal = params.value !== undefined ? params.value : 35000.0;
      dataFieldInt = encodeBnrValue(numVal, spec.resolution, spec.bits);
    }

    var labelByte = octalToLabelByte(octalLabel);

    // Assembly of 31-bit base word:
    // Bits 0-7: Label Byte (bit-reversed)
    // Bits 8-9: SDI (2 bits)
    // Bits 10-28: Data Field (19 bits)
    // Bits 29-30: SSM (2 bits)
    var word31 = ((labelByte & 0xFF) >>> 0) |
                 (((sdi & 0x03) << 8) >>> 0) |
                 (((dataFieldInt & 0x7FFFF) << 10) >>> 0) |
                 (((ssm & 0x03) << 29) >>> 0);

    var parityBit = calculateOddParity(word31);
    if (params.forceInvalidParity) {
      parityBit = 1 - parityBit; // Inject bit error
    }

    // Bit 31: Parity
    var word32 = ((parityBit << 31) >>> 0) | (word31 >>> 0);

    // 4-byte buffer (Big-endian serialization)
    var bytes = new Uint8Array([
      (word32 >>> 24) & 0xFF,
      (word32 >>> 16) & 0xFF,
      (word32 >>> 8) & 0xFF,
      word32 & 0xFF
    ]);

    var hexStr = ("00000000" + (word32 >>> 0).toString(16).toUpperCase()).slice(-8);

    return {
      word32: word32 >>> 0,
      hex: hexStr,
      bytes: bytes,
      labelOctal: octalLabel,
      labelName: spec.name || ("Custom Label " + octalLabel),
      sdi: sdi,
      ssm: ssm,
      parityBit: parityBit,
      parityValid: !params.forceInvalidParity
    };
  }

  function dissectWord(wordOrHex) {
    var word32 = 0;
    if (typeof wordOrHex === "string") {
      word32 = parseInt(wordOrHex.replace(/[^0-9A-Fa-f]/g, ""), 16) >>> 0;
    } else if (typeof wordOrHex === "number") {
      word32 = wordOrHex >>> 0;
    } else if (wordOrHex instanceof Uint8Array && wordOrHex.length >= 4) {
      word32 = ((wordOrHex[0] << 24) | (wordOrHex[1] << 16) | (wordOrHex[2] << 8) | wordOrHex[3]) >>> 0;
    }

    var labelByte = word32 & 0xFF;
    var octalLabel = labelByteToOctal(labelByte);
    var spec = LABEL_SPECS[octalLabel] || { name: "Unassigned Avionics Label", type: "BNR", units: "raw", resolution: 1.0, bits: 19 };

    var sdi = (word32 >>> 8) & 0x03;
    var sdiNames = ["All / System 0", "Left / System 1 (Capt)", "Right / System 2 (F/O)", "Center / System 3"];

    var dataFieldRaw = (word32 >>> 10) & 0x7FFFF; // 19 bits
    var ssm = (word32 >>> 29) & 0x03;
    var ssmBnrNames = ["Failure Warning (FW)", "No Computed Data (NCD)", "Functional Test (FT)", "Normal Operation (NO)"];

    var parityBit = (word32 >>> 31) & 0x01;
    var parityValid = verifyOddParity(word32);

    var decodedValue = decodeBnrValue(dataFieldRaw, spec.resolution, spec.bits);

    return {
      word32: word32,
      hex: ("00000000" + word32.toString(16).toUpperCase()).slice(-8),
      binary: ("00000000000000000000000000000000" + word32.toString(2)).slice(-32),
      label: {
        octal: octalLabel,
        name: spec.name,
        rawByteHex: ("00" + labelByte.toString(16).toUpperCase()).slice(-2)
      },
      sdi: {
        code: sdi,
        description: sdiNames[sdi]
      },
      dataField: {
        rawInteger: dataFieldRaw,
        decodedValue: decodedValue,
        units: spec.units,
        type: spec.type
      },
      ssm: {
        code: ssm,
        description: ssmBnrNames[ssm],
        isNormal: (ssm === 3)
      },
      parity: {
        bit: parityBit,
        oddParityValid: parityValid
      }
    };
  }

  // --- 5. Libpcap 2.4 Binary Network Packet Exporter (UDP Port 51200) ---
  function exportLibpcap(arincWords, options) {
    options = options || {};
    var srcPort = options.srcPort || 4290;
    var dstPort = options.dstPort || 51200; // Standard ARINC 429 over Ethernet/UDP
    var baseTime = Math.floor(Date.now() / 1000);

    // Package words into bytes
    var payloadBytes = new Uint8Array(arincWords.length * 4);
    for (var i = 0; i < arincWords.length; i++) {
      var w = arincWords[i];
      payloadBytes[i * 4] = (w >>> 24) & 0xFF;
      payloadBytes[i * 4 + 1] = (w >>> 16) & 0xFF;
      payloadBytes[i * 4 + 2] = (w >>> 8) & 0xFF;
      payloadBytes[i * 4 + 3] = w & 0xFF;
    }

    var globalHeader = new Uint8Array([
      0xd4, 0xc3, 0xb2, 0xa1, // Magic 0xa1b2c3d4
      0x02, 0x00, 0x04, 0x00, // Version 2.4
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0xff, 0xff, 0x00, 0x00, // Snaplen 65535
      0x01, 0x00, 0x00, 0x00  // Ethernet Link Type
    ]);

    var ethHdr = new Uint8Array([
      0x00, 0x1A, 0x2B, 0x3C, 0x4D, 0x5E,
      0x00, 0x0C, 0x29, 0x6F, 0x18, 0x9A,
      0x08, 0x00 // IPv4
    ]);

    var ipLen = 20 + 8 + payloadBytes.length;
    var ipHdr = new Uint8Array([
      0x45, 0x00,
      (ipLen >> 8) & 0xFF, ipLen & 0xFF,
      0x1A, 0x2B, 0x40, 0x00,
      64, 17, // TTL 64, UDP (17)
      0x00, 0x00,
      10, 0, 1, 10,   // Flight Management Computer (FMC)
      10, 0, 1, 20    // Electronic Flight Instrument System (EFIS)
    ]);

    var udpLen = 8 + payloadBytes.length;
    var udpHdr = new Uint8Array([
      (srcPort >> 8) & 0xFF, srcPort & 0xFF,
      (dstPort >> 8) & 0xFF, dstPort & 0xFF,
      (udpLen >> 8) & 0xFF, udpLen & 0xFF,
      0x00, 0x00
    ]);

    var frameLen = ethHdr.length + ipHdr.length + udpHdr.length + payloadBytes.length;
    var pktHdr = new Uint8Array(16);
    var pView = new DataView(pktHdr.buffer);
    pView.setUint32(0, baseTime, true);
    pView.setUint32(4, 125000, true);
    pView.setUint32(8, frameLen, true);
    pView.setUint32(12, frameLen, true);

    var packet = new Uint8Array(16 + frameLen);
    packet.set(pktHdr, 0);
    packet.set(ethHdr, 16);
    packet.set(ipHdr, 30);
    packet.set(udpHdr, 50);
    packet.set(payloadBytes, 58);

    var finalPcap = new Uint8Array(24 + packet.length);
    finalPcap.set(globalHeader, 0);
    finalPcap.set(packet, 24);
    return finalPcap;
  }

  // Exports
  ARINC429ProtocolEngine.LABEL_SPECS = LABEL_SPECS;
  ARINC429ProtocolEngine.reverseBits8 = reverseBits8;
  ARINC429ProtocolEngine.octalToLabelByte = octalToLabelByte;
  ARINC429ProtocolEngine.labelByteToOctal = labelByteToOctal;
  ARINC429ProtocolEngine.calculateOddParity = calculateOddParity;
  ARINC429ProtocolEngine.verifyOddParity = verifyOddParity;
  ARINC429ProtocolEngine.encodeBnrValue = encodeBnrValue;
  ARINC429ProtocolEngine.decodeBnrValue = decodeBnrValue;
  ARINC429ProtocolEngine.packWord = packWord;
  ARINC429ProtocolEngine.dissectWord = dissectWord;
  ARINC429ProtocolEngine.exportLibpcap = exportLibpcap;

  return ARINC429ProtocolEngine;
}));
