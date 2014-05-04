var transactionprocessor = function (blockchain, accountprocessor, peernetwork) {
    this.privatetransactions = {};
    this.publictransations = {};
    this.blockchain = blockchain;
    this.accountprocessor = accountprocessor;
    this.peernetwork = peernetwork;
}


module.exports = transactionprocessor;