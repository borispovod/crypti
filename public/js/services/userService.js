webApp.service('userService', function () {
    this.setData = function (address, publicKey, balance, unconfirmedBalance, effectiveBalance) {
        this.address = address;
        this.publicKey = publicKey;
        this.balance = balance;
        this.unconfirmedBalance = unconfirmedBalance;
        this.effectiveBalance = effectiveBalance;
    }

    this.setForging = function (forging) {
        this.forging = forging;
    }
});