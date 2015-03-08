require('angular');

angular.module('webApp').service('userService', function () {
	this.setData = function (address, publicKey, balance, unconfirmedBalance, effectiveBalance) {
		this.address = address;
		this.publicKey = publicKey;
		this.balance = balance / 100000000;
		this.unconfirmedBalance = unconfirmedBalance / 100000000;
		this.effectiveBalance = effectiveBalance / 100000000;
		this._balance = balance;
		this._unconfirmedBalance = unconfirmedBalance;

	}

	this.setForging = function (forging) {
		this.forging = forging;
	}

	this.setDelegate = function (delegate) {
		this.delegate = delegate;
	}

	this.setDelegateProcess = function (delegate) {
		this.delegateInRegistration = delegate;
	}

	this.setSecondPassphrase = function (secondPassPhrase) {
		this.secondPassphrase = secondPassPhrase;
	}
});