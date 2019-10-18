/*
  GET all the client_accounts
  Add all the DB values + count

  Get all the transactions from Eth

  Get all the transactions from Binance

  node processing/accounting.js processing/export.csv

  where export.csv is generated from etherscan here:
  https://etherscan.io/address/0x799a4202c12ca952cb311598a024c80ed371a41e

*/

if (!process.argv || process.argv.length < 3) {
  console.error('missing argument for export.csv');
  process.exit(1);
}
const exportFile = process.argv[2]

const HMY_UUID = "Harmony_One"
const HMY_ERC = "0x799a4202c12ca952cb311598a024c80ed371a41e"

const db = require('./helpers/db.js').db
const config = require('./config')
const bnb = require('./helpers/bnb.js')
const eth = require('./helpers/eth.js')
const async = require('async')

const csv = require('csv-parser');
const fs = require('fs');

const Web3 = require('web3');
const web3 = new Web3(new Web3.providers.HttpProvider(config.provider));

function readExport(callback) {
  const ret = {}
  return fs.createReadStream(exportFile)
    .pipe(csv())
    .on('data', (row) => {
      if (row.From !== '0x6750db41334e612a6e8eb60323cb6579f0a66542')
        return
      ret[row.Txhash] = row;
    })
    .on('end', () => {
      console.log(`${Object.keys(ret).length} txns read from ${exportFile}`);
      callback(ret, null);
      return
    })
    .on('error', (error) => {
      console.error('Error reading CSV file', error);
      callback(null, error);
    });
}

function readDb(callback) {
  const ret = {}
  return getB2ESwapsInDb((swaps, err) => {
    if (err) {
      console.error(`getSwapsInDb error`, error);
      callback(null, error);
      return;
    }

    for (let i in swaps) {
      ret[swaps[i].transfer_transaction_hash] = swaps[i]
    }
    console.log(`${Object.keys(ret).length} swap txns read from db`);
    callback(ret);
    return;
  });
}

findMissingERC20Txns()

function findMissingERC20Txns() {
  console.log('======== START ==========');
  return readDb((swapTxns, err) => {
    if (err) {
      console.error(`findMissingERC20Txns: readDb failed`, err);
      return;
    }

    // console.log(swapTxns);
    return readExport((exportTxns, err) => {
      if (err) {
        console.error(`findMissingERC20Txns: readExport failed`, err);
        return;
      }

      const missing = {};
      for (let exportTxnHash in exportTxns) {
        if (exportTxnHash in swapTxns) continue;
        missing[exportTxnHash] = exportTxns[exportTxnHash]
      }

      console.log(`missing ${Object.keys(missing).length} erc20 transactions`);

      let amount = 0
      const promises = []
      for (let txHash in missing) {
        promises.push(eth.getTransactionEvent(txHash))
      }

      return Promise.all(promises).then((txnDetails) => {
        let i = 0;
        txnDetails.forEach(function (txnDetail) {
          // { name: 'Transfer', events: [
          //   { name: '_from', type: 'address', value: ... },
          //   { name: '_to', type: 'address', value: ... },
          //   { name: '_value', type: 'uint256', value: ... }
          // ]}
          const txValue = parseFloat(web3.utils.fromWei(txnDetail.events[2].value, 'ether'))
          console.log(`- txn ${Object.keys(missing)[i]}: ${txValue}`);
          amount += txValue
          i++;
        });

        console.log(`Total missing amount: ${amount} ONE`);
        console.log('======== END ==========');

        return amount;
      });
    });
  });
}

// run()
function run() {
  getClientAddresses((clients) => {
    const clientAddresses = clients.map((client) => {
      return client.eth_address
    })

    // console.log(clients)

    // //ADDING THE OLD ACCOUNT FOR TRANSFERS DONE BEFORE
    // clientAddresses.push("0x91E8E1e174D93a8E50c10C3F49B9c5b3C0022966")

    getBalancesForAddresses(clientAddresses, (err, erc20Balances) => {
      if(err) {
        return error(err)
      }

      const sum = erc20Balances.reduce((accumulator, currentValue) => {
        return parseFloat(currentValue) + accumulator
      }, 0)

      console.log("SUM FROM BALANCES OF ADDRESSES")
      console.log(sum)
    })

    getTransactionsForAddresses(clientAddresses, (err, ERC20transaction) => {
      if(err) {
        return error(err)
      }

      const erc20Totals = ERC20transaction.reduce((accumulator, currentValue) => {
        return parseFloat(currentValue.amount) + accumulator
      }, 0)


      console.log("SUM FROM TRANSACTIONS OF ADDRESSES")
      console.log(erc20Totals)
      console.log(ERC20transaction.length)

      getSwapsInDb((dbSwaps) => {

        console.log("SUM FROM DB")
        console.log(dbSwaps)

        const clientBNBAddresses = clients.map((client) => {
          return client.bnb_address
        })

        // too many calls. API throttles me.
        // getBalancesBNB(clientBNBAddresses, (err, bnbAddressesBalances) => {
        //   if(err) {
        //     return error(err)
        //   }
        //   // console.log(bnbAddressesBalances)
        //
        //   const hmyBalances = bnbAddressesBalances.map((bnbAddressBalance) => {
        //
        //     let hmyBalance = bnbAddressBalance.filter((balance) => {
        //       return balance.symbol === 'hmy-585'
        //     }).map((balance) => {
        //       return balance.free
        //     })
        //
        //     return hmyBalance[0]
        //   })
        //
        //   const bnbTotals = hmyBalances.reduce((accumulator, currentValue) => {
        //     return parseFloat(currentValue) + accumulator
        //   }, 0)
        //
        //   console.log(bnbTotals)
        //   console.log(hmyBalances.length)
        // })
      })
    })
  })
}

function getClientAddresses(callback) {
  db.manyOrNone('select ca.uuid, ca.bnb_address, cea.address as eth_address from client_accounts ca left join client_eth_accounts cea on ca.client_eth_account_uuid = cea.uuid')
    .then(callback)
    .catch(error)
}

function getSwapsInDb(callback) {
  db.oneOrNone('select sum(amount::numeric), count(*) from swaps where token_uuid = $1 and deposit_transaction_hash is not null and client_account_uuid is not null;', [HMY_UUID])
    .then(callback)
    .catch(error)
}

function getB2ESwapsInDb(callback) {
  db.manyOrNone('select * from swaps where token_uuid = $1 and direction = \'BinanceToEthereum\';', [HMY_UUID])
    .then(swaps => {
      callback(swaps);
      return;
    })
    .catch(error => {
      callback(null, error);
      return;
    })
}

function getTransactionsForAddresses(clientAddresses, callback) {
  eth.getTransactionsForAddress(HMY_ERC, clientAddresses, callback)
}

function getBalancesForAddresses(addresses, callback) {
  async.map(addresses, (address, callbackInner) => {
    eth.getERC20Balance(address, HMY_ERC, callbackInner)
  }, (err, balances) => {
    if(err) {
      console.log(err)
    }

    callback(err, balances)
  })
}

function getBalancesBNB(addresses, callback) {
  async.map(addresses, (address, callbackInner) => {
    bnb.getBalance(address, callbackInner)
  }, (err, balances) => {
    if(err) {
      console.log(err)
    }
    callback(err, balances)
  })
}

function error(err) {
  console.log(err)
  return
}