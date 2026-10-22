/**
 * ARINC429Forge Pro - UI Application Controller (app.js)
 * Connects protocol engine, compliance auditor, and configuration synthesizer to Web Studio.
 */

document.addEventListener('DOMContentLoaded', function () {
  'use strict';

  // Tab Navigation Handling
  var tabs = document.querySelectorAll('.tab-btn');
  var tabPanes = document.querySelectorAll('.tab-pane');

  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      var targetId = tab.getAttribute('data-tab');
      tabs.forEach(function (t) { t.classList.remove('active'); });
      tabPanes.forEach(function (p) { p.classList.remove('active'); });

      tab.classList.add('active');
      var targetPane = document.getElementById(targetId);
      if (targetPane) {
        targetPane.classList.add('active');
      }
    });
  });

  // --- 32-Bit Word Studio Controller ---
  var btnPackWord = document.getElementById('btn-pack-word');
  var btnDissectInput = document.getElementById('btn-dissect-input');
  var rawWordHex = document.getElementById('raw-word-hex');
  var outputWordTree = document.getElementById('output-word-tree');
  var metricWordSummary = document.getElementById('metric-word-summary');
  var currentWord32 = 0xE24420C1;

  function executePackWord() {
    var label = document.getElementById('cfg-word-label').value;
    var value = parseFloat(document.getElementById('cfg-word-value').value);
    var sdi = parseInt(document.getElementById('cfg-word-sdi').value, 10);
    var ssm = parseInt(document.getElementById('cfg-word-ssm').value, 10);
    var parityErr = document.getElementById('cfg-word-parity-err').checked;

    var res = ARINC429ProtocolEngine.packWord({
      label: label,
      value: value,
      sdi: sdi,
      ssm: ssm,
      forceInvalidParity: parityErr
    });

    currentWord32 = res.word32;
    rawWordHex.value = res.hex;

    var dissected = ARINC429ProtocolEngine.dissectWord(res.word32);
    outputWordTree.textContent = JSON.stringify(dissected, null, 2);

    metricWordSummary.textContent = 'Label ' + res.labelOctal + ' (' + res.labelName + ') = ' + value + ' ' + (dissected.dataField.units || '') + ' | SDI ' + res.sdi + ' | SSM ' + res.ssm + ' | ' + (res.parityValid ? 'Odd Parity Valid' : 'PARITY ERROR');
    metricWordSummary.style.color = res.parityValid ? '#38bdf8' : '#ef4444';
  }

  if (btnPackWord) {
    btnPackWord.addEventListener('click', executePackWord);
  }

  if (btnDissectInput) {
    btnDissectInput.addEventListener('click', function () {
      var hex = rawWordHex.value.trim();
      if (!hex) {
        alert('Please enter an 8-character hex word first.');
        return;
      }
      var res = ARINC429ProtocolEngine.dissectWord(hex);
      currentWord32 = res.word32;
      outputWordTree.textContent = JSON.stringify(res, null, 2);
      metricWordSummary.textContent = 'Label ' + res.label.octal + ' (' + res.label.name + ') = ' + res.dataField.decodedValue + ' ' + res.dataField.units + ' | SDI: ' + res.sdi.description + ' | ' + res.ssm.description;
    });
  }

  var btnCopyHex = document.getElementById('btn-copy-hex');
  if (btnCopyHex) {
    btnCopyHex.addEventListener('click', function () {
      if (rawWordHex.value) {
        navigator.clipboard.writeText(rawWordHex.value);
        btnCopyHex.textContent = 'Copied!';
        setTimeout(function () { btnCopyHex.textContent = 'Copy Hex'; }, 1500);
      }
    });
  }

  var btnLoadAltPreset = document.getElementById('btn-load-alt-preset');
  if (btnLoadAltPreset) {
    btnLoadAltPreset.addEventListener('click', function () {
      document.getElementById('cfg-word-label').value = '203';
      document.getElementById('cfg-word-value').value = '35000.0';
      document.getElementById('cfg-word-sdi').value = '1';
      document.getElementById('cfg-word-ssm').value = '3';
      document.getElementById('cfg-word-parity-err').checked = false;
      executePackWord();
    });
  }

  // --- PFD Simulator Controller ---
  var btnApplyPhase = document.getElementById('btn-apply-phase');
  var btnInjectFault = document.getElementById('btn-inject-fault');

  function updatePfd(spd, alt, mach, hdg, pitch, roll, statusText, isError) {
    document.getElementById('pfd-disp-spd').textContent = Math.round(spd);
    document.getElementById('pfd-disp-alt').textContent = Math.round(alt).toLocaleString();
    document.getElementById('pfd-disp-mach').textContent = mach.toFixed(2);
    document.getElementById('pfd-disp-hdg').textContent = Math.round(hdg) + '°';
    document.getElementById('pfd-disp-pitch').textContent = (pitch >= 0 ? '+' : '') + pitch.toFixed(1) + '°';
    document.getElementById('pfd-disp-roll').textContent = roll.toFixed(1) + '°';

    var sky = document.getElementById('pfd-horizon-sky');
    if (sky) {
      sky.innerHTML = '<span style="font-size:0.75rem; color:#ffffff; font-weight:bold;">SKY (PITCH: ' + (pitch >= 0 ? '+' : '') + pitch.toFixed(1) + '°)</span>';
    }

    var statusElem = document.getElementById('pfd-status-msg');
    if (statusElem) {
      statusElem.textContent = statusText;
      statusElem.style.color = isError ? '#ef4444' : '#10b981';
    }
  }

  if (btnApplyPhase) {
    btnApplyPhase.addEventListener('click', function () {
      var phase = document.getElementById('cfg-flight-phase').value;
      if (phase === 'CRUISE') {
        updatePfd(320, 35000, 0.82, 270, 2.5, 0.0, 'Nominal: FL350 Cruise. Air Data & Inertial Reference Buses Synchronized.', false);
      } else if (phase === 'CLIMB') {
        updatePfd(250, 15000, 0.58, 090, 12.0, 5.0, 'Nominal: Initial Climb Phase. Thrust at CLB rating.', false);
      } else if (phase === 'APPROACH') {
        updatePfd(140, 3000, 0.24, 300, 3.0, 0.0, 'Nominal: ILS Glide Slope Capture. Flaps 30 / Gear Down.', false);
      } else if (phase === 'STALL_RECOVERY') {
        updatePfd(180, 28000, 0.45, 180, -8.0, 35.0, 'ALERT: High Roll Angle & Low Energy State. Stick Shaker Active.', true);
      }
    });
  }

  if (btnInjectFault) {
    btnInjectFault.addEventListener('click', function () {
      updatePfd(0, 0, 0.0, 270, 0.0, 0.0, 'FAILURE WARNING (FW): Air Data Computer 1 Sensor Fault Injected (SSM 00). PFD Altitude Flagged Red.', true);
      document.getElementById('pfd-disp-alt').textContent = 'FAIL';
      document.getElementById('pfd-disp-alt').style.color = '#ef4444';
    });
  }

  // --- Cybersecurity Auditor Controller ---
  function renderAudit(profile) {
    var auditRes = ARINC429SecurityAuditor.runAudit(profile);
    document.getElementById('auditor-score-num').textContent = auditRes.score;
    document.getElementById('auditor-summary-badge').textContent = auditRes.passedVectors + ' / ' + auditRes.totalVectors + ' Passed';

    var tableBody = document.getElementById('audit-table-body');
    tableBody.innerHTML = '';

    auditRes.results.forEach(function (item, index) {
      var tr = document.createElement('tr');
      tr.innerHTML = '<td>' + (index + 1) + '</td>' +
                     '<td><strong>' + item.name + '</strong></td>' +
                     '<td><span style="font-size:0.75rem; color:' + (item.severity === 'CRITICAL' ? '#ef4444' : '#f59e0b') + ';">' + item.severity + '</span></td>' +
                     '<td><span class="' + (item.passed ? 'badge-pass' : 'badge-fail') + '">' + (item.passed ? 'PASS' : 'FAIL') + '</span></td>' +
                     '<td style="font-size:0.8rem; color:#cbd5e1;">' + item.detail + '</td>';
      tableBody.appendChild(tr);
    });
  }

  var btnRunAudit = document.getElementById('btn-run-audit');
  if (btnRunAudit) {
    btnRunAudit.addEventListener('click', function () {
      renderAudit();
    });
  }

  // --- Ground Hardening Renderer ---
  function renderHardeningConfigs() {
    var nftOutput = document.getElementById('output-nft');
    var suriOutput = document.getElementById('output-suri');
    var sysdOutput = document.getElementById('output-sysd');

    if (nftOutput && ARINC429ConfigSynthesizer) {
      nftOutput.textContent = ARINC429ConfigSynthesizer.generateNftablesRules({ port: 51200 });
      suriOutput.textContent = ARINC429ConfigSynthesizer.generateSuricataSignatures({ port: 51200 });
      sysdOutput.textContent = ARINC429ConfigSynthesizer.generateSystemdService();
    }
  }

  // --- PCAP Exporter Controller ---
  var btnDownloadPcap = document.getElementById('btn-download-pcap');
  if (btnDownloadPcap) {
    btnDownloadPcap.addEventListener('click', function () {
      // 4 flight words: Altitude 35,000 ft, Airspeed 320 kts, Mach 0.82, Heading 270 deg
      var words = [
        currentWord32 || 0xE24420C1,
        0xD0640089,
        0xC03500A5,
        0x610000A1
      ];

      var pcapBytes = ARINC429ProtocolEngine.exportLibpcap(words);

      var hexDump = [];
      for (var i = 0; i < Math.min(192, pcapBytes.length); i += 16) {
        var chunk = pcapBytes.slice(i, i + 16);
        var hexStr = Array.from(chunk).map(function (b) { return ('0' + b.toString(16)).slice(-2); }).join(' ');
        var asciiStr = Array.from(chunk).map(function (b) { return (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.'; }).join('');
        hexDump.push(('0000000' + i.toString(16)).slice(-8) + '  ' + hexStr.padEnd(48, ' ') + '  |' + asciiStr + '|');
      }
      document.getElementById('pcap-inspector').textContent = hexDump.join('\n') + '\n... [' + pcapBytes.length + ' bytes total in Libpcap 2.4 format]';

      var blob = new Blob([pcapBytes], { type: 'application/vnd.tcpdump.pcap' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'arinc429-avionics-flight-stream.pcap';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }

  // Initial runs
  executePackWord();
  renderAudit();
  renderHardeningConfigs();
});
