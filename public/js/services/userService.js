webApp.service('userService', function () {
	this.setData = function (address, publicKey, balance, unconfirmedBalance, effectiveBalance) {
		console.log('userService.params', address, publicKey, balance, unconfirmedBalance, effectiveBalance)
		this.address = address;
		this.publicKey = publicKey;
		this.balance = balance / 100000000;
		this.unconfirmedBalance = unconfirmedBalance / 100000000;
		this.effectiveBalance = effectiveBalance / 100000000;
		this._balance = balance;
		this._unconfirmedBalance = unconfirmedBalance;
		console.log('userService.create', this)

	}

	this.setForging = function (forging) {
		this.forging = forging;
	}

	this.setSecondPassphrase = function (secondPassPhrase) {
		this.secondPassphrase = secondPassPhrase;
	}
});