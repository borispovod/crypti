var account = function (address, publickey, balance, unconfirmedbalance) {
    this.address = address;
    this.publickey = publickey;
    this.balance = balance;
    this.unconfirmedbalance = unconfirmedbalance;
}

module.exports = account;