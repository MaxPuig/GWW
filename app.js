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

function wssTXID(txid) {
  return new Promise((resolve, reject) => {
    socket.onerror = function (error) {
      reject(error);
    };
    socket.send(
      JSON.stringify({
        id: 0,
        method: "blockchain.transaction.get",
        params: [txid, true],
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

module.exports = {
  connectToElectrum,
  createTransaction,
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