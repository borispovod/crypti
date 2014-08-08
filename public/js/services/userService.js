webApp.service('userService', function () {
    this.setData = function (address, publicKey, balance, unconfirmedBalance, effectiveBalance) {
        this.address = address;
        this.publicKey = publicKey;
        this.balance = balance / 100000000;
        this.unconfirmedBalance = unconfirmedBalance / 100000000;
        this.effectiveBalance = effectiveBalance / 100000000;
    }

    this.setForging = function (forging) {
        this.forging = forging;
    }

    this.setSecondPassphrase = function (secondPassPhrase) {
        this.secondPassphrase = secondPassPhrase;
    }
});