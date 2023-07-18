const garlicore = require('bitcore-lib-grlc');

let socket;
let passwordOrPrivKey = 'password';
let addressType = 'pubkeyhash';
let privKey;
let currentAddress;
let serializedTransaction;

function connectToElectrum(serverURL) {
  try {
    socket = new WebSocket(serverURL);
    socket.onopen = function (event) {
      document.getElementById("connection_status").innerHTML = "CONNECTED";
      document.getElementById("connection_status").style.color = "green";
      console.log("Connected to Electrum server: " + serverURL);
    }
  } catch (e) {
    document.getElementById("connection_status").innerHTML = "ERROR";
    document.getElementById("connection_status").style.color = "red";
    console.log("Error connecting to Electrum server: " + serverURL);
  }
}

function createTransaction(to_address, amount, fee) {
  if (socket?.readyState !== 1) {
    document.getElementById("send_output").innerHTML = "Not connected to Electrum server";
    return;
  }
  if (!privKey || !currentAddress) {
    document.getElementById("send_output").innerHTML = "No private key loaded, click on the 'Generate' button first";
    return;
  }
  document.getElementById("send_output").innerHTML = "Loading...";
  if (!validate_address(to_address)) {
    document.getElementById("send_output").innerHTML = "Invalid 'To Address'";
    return;
  }
  if (isNaN(amount) || amount <= 0) {
    document.getElementById("send_output").innerHTML = "Invalid 'Amount'";
    return;
  }
  if (isNaN(fee) || fee <= 0) {
    document.getElementById("send_output").innerHTML = "Invalid 'Fee'";
    return;
  }
  const from_address = currentAddress;
  let transaction;
  wssUTXO(from_address).then((response) => {
    if (response.error?.message) {
      document.getElementById("send_output").innerHTML = JSON.stringify(response.error.message);
    } else {
      const unparsedUTXOs = response.result;
      let utxos = [];
      const script = new garlicore.Script(from_address);
      let total = 0;
      for (let utxo of unparsedUTXOs) {
        total += utxo.value;
        utxos.push(new garlicore.Transaction.UnspentOutput({
          "txId": utxo.tx_hash,
          "outputIndex": utxo.tx_pos,
          "address": from_address,
          "script": script,
          "satoshis": utxo.value
        }));
      }
      if (utxos.length === 0) {
        document.getElementById("send_output").innerHTML = "No UTXOs found for this address";
        return;
      }
      garlicore.Transaction.FEE_PER_KB = Number(fee);
      let feesPayed;
      try {
        transaction = new garlicore.Transaction()
          .from(utxos)
          .to(to_address, Math.floor(amount * 1e8))
          .change(from_address)
          .sign(privKey);
        feesPayed = transaction.getFee();
        if (total < Math.floor((amount * 1e8) + feesPayed)) {
          document.getElementById("send_output").innerHTML = "Not enough funds<br>Balance: "
            + total / 1e8 + " GRLC<br>Sending: " + (Number(amount) + (feesPayed / 1e8)) + " GRLC<br>" +
            "You could try sending: " + ((total - feesPayed) / 1e8) + " GRLC";
          return;
        }
        serializedTransaction = transaction.serialize();
        console.log(serializedTransaction);
      } catch (e) {
        document.getElementById("send_output").innerHTML = "Error creating transaction<br>" + e.toString();
        return;
      }

      let newBalance = total - (amount * 1e8) - feesPayed;
      if (from_address.toString() === to_address) {
        newBalance += (amount * 1e8);
      }
      let askConfirmation = "Are you sure you want to send " + amount + " GRLC?\n\n" +
        "From: " + from_address + "\n" +
        "To: " + to_address + "\n" +
        "New Balance: " + newBalance / 1e8 + " GRLC\n" +
        "Fee: " + feesPayed / 1e8 + " GRLC";
      if (window.confirm(askConfirmation)) {
        wssSendRawTx(serializedTransaction).then((response) => {
          if (response.error?.message) {
            document.getElementById("send_output").innerHTML = JSON.stringify(response.error.message);
          } else {
            document.getElementById("send_output").innerHTML = "Transaction sent<br>TXID: " + response.result;
          }
        });
      } else {
        document.getElementById("send_output").innerHTML = "Transaction cancelled";
      }
    }
  });
}

async function getBalance(address) {
  if (socket?.readyState !== 1) {
    document.getElementById("balance").innerHTML = "Not connected to Electrum server";
    return;
  }
  document.getElementById("balance").innerHTML = "Loading...";
  if (!validate_address(address)) {
    document.getElementById("balance").innerHTML = "Invalid address";
    return;
  }
  const response = await wssBalance(address);
  if (response.error?.message) {
    document.getElementById("balance").innerHTML = JSON.stringify(response.error.message);
  } else {
    document.getElementById("balance").innerHTML =
      `Confirmed Balance: ${response.result.confirmed / 1e8} GRLC<br>Unconfirmed Balance: ${response.result.unconfirmed / 1e8} GRLC`;
  }
}

async function getUTXO(address) {
  if (socket?.readyState !== 1) {
    document.getElementById("utxos").innerHTML = "Not connected to Electrum server";
    return;
  }
  document.getElementById("utxos").innerHTML = "Loading...";
  if (!validate_address(address)) {
    document.getElementById("utxos").innerHTML = "Invalid address";
    return;
  }
  const response = await wssUTXO(address);
  if (response.error?.message) {
    document.getElementById("utxos").innerHTML = JSON.stringify(response.error.message);
  } else {
    document.getElementById("utxos").innerHTML = JSON.stringify(response.result);
  }
}

async function getTXID(txid) {
  if (socket?.readyState !== 1) {
    document.getElementById("txid").innerHTML = "Not connected to Electrum server";
    return;
  }
  document.getElementById("txid").innerHTML = "Loading...";
  const response = await wssTXID(txid);
  if (response.error?.message) {
    document.getElementById("txid").innerHTML = JSON.stringify(response.error.message);
  } else {
    document.getElementById("txid").innerHTML = JSON.stringify(response.result);
  }
}

async function sendRawTx(rawtx) {
  if (socket?.readyState !== 1) {
    document.getElementById("rawtx_output").innerHTML = "Not connected to Electrum server";
    return;
  }
  document.getElementById("rawtx_output").innerHTML = "Loading...";
  const response = await wssSendRawTx(rawtx);
  if (response.error?.message) {
    document.getElementById("rawtx_output").innerHTML = JSON.stringify(response.error.message)
      .replace(/\\n/g, "<br>");
  } else {
    document.getElementById("rawtx_output").innerHTML = "TXID: " + response.result;
  }
};

function wssBalance(address) {
  const scripthash = convertToScripthash(address);
  return new Promise((resolve, reject) => {
    socket.onerror = function (error) {
      reject(error);
    };
    socket.send(
      JSON.stringify({
        id: 0,
        method: "blockchain.scripthash.get_balance",
        params: [scripthash],
      })
    );
    socket.onmessage = function (event) {
      const response = JSON.parse(event.data);
      console.log(response);
      resolve(response);
    };
  });
}

function wssUTXO(address) {
  // Posible error: too many utxos https://github.com/paritytech/substrate/issues/11842
  const scripthash = convertToScripthash(address);
  return new Promise((resolve, reject) => {
    socket.onerror = function (error) {
      reject(error);
    };
    socket.send(
      JSON.stringify({
        id: 0,
        method: "blockchain.scripthash.listunspent",
        params: [scripthash],
      })
    );
    socket.onmessage = function (event) {
      const response = JSON.parse(event.data);
      console.log(response);
      resolve(response);
    };
  });
}

function wssTXID(txid, parsed = true) {
  return new Promise((resolve, reject) => {
    socket.onerror = function (error) {
      reject(error);
    };
    socket.send(
      JSON.stringify({
        id: 0,
        method: "blockchain.transaction.get",
        params: [txid, parsed],
      })
    );
    socket.onmessage = function (event) {
      const response = JSON.parse(event.data);
      console.log(response);
      resolve(response);
    };
  });
}

function wssSendRawTx(rawtx) {
  return new Promise((resolve, reject) => {
    socket.onerror = function (error) {
      reject(error);
    };
    socket.send(
      JSON.stringify({
        id: 0,
        method: "blockchain.transaction.broadcast",
        params: [rawtx],
      })
    );
    socket.onmessage = function (event) {
      const response = JSON.parse(event.data);
      console.log(response);
      resolve(response);
    };
  });
}

function base64ToWIF(base58) {
  try {
    let wif = garlicore.PrivateKey(base58).toWIF();
    document.getElementById("base64towif").innerHTML = wif;
  } catch (e) {
    document.getElementById("base64towif").innerHTML = "Invalid Private Key<br>" + e.toString();
  }
}

function convertToScripthash(address) {
  let script = garlicore.Script(garlicore.Address(address)).toBuffer();
  let hash = garlicore.crypto.Hash.sha256(script);
  return Buffer.from(hash).reverse().toString("hex");
}

function validate_address(address) {
  try {
    garlicore.Address(address);
    return true;
  } catch (e) {
    return false;
  }
}

function changePasswordType(type) {
  passwordOrPrivKey = type; // 'password' or 'privatekey'
}

function changeAddressType(type) {
  addressType = type; // 'pubkeyhash', 'scripthash' or 'witnesspubkeyhash'
}

function togglePasswordVisibility() {
  let passwordInput = document.getElementById("password");
  if (passwordInput.type === "password") {
    passwordInput.type = "text";
  } else {
    passwordInput.type = "password";
  }
}

function generateAddress(password) {
  if (passwordOrPrivKey === 'password') {
    let bn = garlicore.crypto.BN.fromBuffer(garlicore.crypto.Hash.sha256(Buffer.from(password)));
    privKey = new garlicore.PrivateKey(bn);
  } else {
    try {
      privKey = new garlicore.PrivateKey(wif);
    } catch (e) {
      document.getElementById("addressInfo").innerHTML = "Invalid Private Key";
      privKey = null;
      return;
    }
  }
  currentAddress = garlicore.Address.fromPublicKey(privKey.toPublicKey(), 'mainnet', addressType);
  const info = `Address: ${currentAddress.toString()}<br>`;
  if (socket?.readyState !== 1) {
    document.getElementById("addressInfo").innerHTML = info + "Balance: Not connected to Electrum server";
    return;
  } else {
    document.getElementById("addressInfo").innerHTML = info + "Loading...";
  }
  wssBalance(currentAddress.toString()).then((response) => {
    if (response.error?.message) {
      document.getElementById("addressInfo").innerHTML = info + JSON.stringify(response.error.message);
    } else {
      document.getElementById("addressInfo").innerHTML = info +
        `Confirmed Balance: ${response.result.confirmed / 1e8} GRLC<br>Unconfirmed Balance: ${response.result.unconfirmed / 1e8} GRLC`;
    }
  });
}

/* P2SHDATA */

async function getP2SHDATA(txid) {
  if (socket?.readyState !== 1) {
    document.getElementById("downloadp2shdata").innerHTML = "Not connected to Electrum server";
    return;
  }
  document.getElementById("downloadp2shdata").innerHTML = "Loading...";
  const response = await wssTXID(txid, false);
  if (response.error?.message) {
    document.getElementById("downloadp2shdata").innerHTML = JSON.stringify(response.error.message);
  } else {
    let rawTx = response.result;
    let tx = garlicore.Transaction(rawTx).toObject();
    let op_return = tx.outputs.filter((vout) => { return vout.script.startsWith('6a') })[0] || { script: '' };
    if (hexToAscii(op_return.script.slice(30, 50)).replace(/\x00/g, '') != '/p2shdata') {
      document.getElementById("downloadp2shdata").innerHTML = "Not a P2SHDATA transactio";
      return;
    }
    let title = tx.outputs.filter((vout) => { return vout.satoshis == 0 })[0].script;
    let data_array = tx.inputs.map((vin) => { return vin.script });
    let data = '';
    for (let chunk of data_array) {
      data += cutScript(cutScript(chunk));
    }
    let decodedTitle = decodeTitle(title);
    const filename = `${decodedTitle.filename}.${decodedTitle.filetype}`;
    document.getElementById("downloadp2shdata").innerHTML = JSON.stringify(decodedTitle, null, 2);
    downloadBufferAsFile(Buffer.from(data, "hex"), filename)
  }
}

function decodeTitle(vout_string) {
  let hex = vout_string.slice(6); // remove the first 3 bytes (OP_CODES)
  let site = hexToAscii(hex.slice(0, 24)).replace(/\x00/g, '');
  let protocol = hexToAscii(hex.slice(24, 44)).replace(/\x00/g, '');
  let version = hexToDecimal(hex.slice(44, 48));
  let filename = hexToAscii(hex.slice(48, 80)).replace(/\x00/g, '');
  let filetype = hexToAscii(hex.slice(80, 88)).replace(/\x00/g, '');
  let filesize = hexToDecimal(hex.slice(88, 96));
  let assembly_script = hex.slice(96, 120);
  let datahash160 = hex.slice(120, 160);
  let info = { site, protocol, version, filename, filetype, filesize, assembly_script, datahash160 };
  info.assembly_script = decodeAssemblyScript(assembly_script);
  return info;
}

function decodeAssemblyScript(entire_assembly_script) {
  let assembly_script_length = hexToDecimal(entire_assembly_script.slice(0, 2));
  let script = entire_assembly_script.slice(2, assembly_script_length * 2 + 2);
  let data_location = script.slice(0, 6);
  let first_vin = hexToDecimal(script.slice(2, 4));
  let last_vin = hexToDecimal(script.slice(4, 6));
  let encoding_type = 'ASCII';
  let encoding;
  if (script.includes('ec')) {
    encoding = script.slice(6, 10);
    encoding_type = encoding.slice(2, 4);
    if (encoding_type == '64') {
      encoding_type = 'base64';
    } else if (encoding_type == '16') {
      encoding_type = 'hex';
    } else if (encoding_type == '10') {
      encoding_type = 'base10';
    } else if (encoding_type == 'f8') {
      encoding_type = 'UTF-8';
    } else {
      encoding_type = 'ASCII';
    }
  }
  let info = { entire_assembly_script, assembly_script_length, script, data_location, first_vin, last_vin, encoding_type };
  if (encoding) info.encoding = encoding;
  return info;
}

function hexToAscii(hex) { return Buffer.from(hex, 'hex').toString(); }

function hexToDecimal(hex) { return parseInt(hex, 16); }

function littleEndianToDecimal(hex) { return parseInt(hex.match(/.{2}/g).reverse().join(''), 16); }

function cutScript(chunk) {
  let data = '';
  if (chunk.startsWith('4d')) { // OP_PUSHDATA2 + 2 bytes little endian length
    let length = littleEndianToDecimal(chunk.slice(2, 6)) * 2;
    data += chunk.slice(6, length + 6);
  } else if (chunk.startsWith('4c')) { // OP_PUSHDATA1 + 1 byte length
    let length = hexToDecimal(chunk.slice(2, 4)) * 2;
    data += chunk.slice(4, length + 4);
  } else { // Pushdata Bytelengh 1-75
    let length = hexToDecimal(chunk.slice(0, 2)) * 2;
    data += chunk.slice(2, length + 2);
  }
  return data;
}

function downloadBufferAsFile(buffer, filename) {
  const blob = new Blob([buffer]);
  const anchorElement = document.createElement('a');
  anchorElement.href = window.URL.createObjectURL(blob);
  anchorElement.download = filename;
  anchorElement.click();
  window.URL.revokeObjectURL(anchorElement.href);
}

/* END P2SHDATA */

module.exports = {
  connectToElectrum,
  createTransaction,
  getP2SHDATA,
  getBalance,
  getUTXO,
  getTXID,
  sendRawTx,
  base64ToWIF,
  convertToScripthash,
  changePasswordType,
  changeAddressType,
  togglePasswordVisibility,
  generateAddress
};