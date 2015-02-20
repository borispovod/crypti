require('angular');
var nacl_factory = require('js-nacl');
var bignum = require('browserify-bignum');
var crypto = require('crypto');
var Buffer = require('buffer').Buffer;

angular.module('webApp').service('cryptoService', function () {
	this.makeAddress = function (publicKey) {
		var publicKeyHash = crypto.createHash('sha256').update(publicKey).digest();
		var temp = new Buffer(8);
		for (var i = 0; i < 8; i++) {
			temp[i] = publicKeyHash[7 - i];
		}

		var address = bignum.fromBuffer(temp).toString() + "C";
		return address;
	}

	this.makePublicKey = function (secret) {
		var nacl = nacl_factory.instantiate();
		var buffer = crypto.createHash('sha256').update(new Buffer(secret, 'utf8')).digest().toJSON().data;
		var keys = nacl.crypto_sign_keypair_from_seed(buffer);
		var publicKey = new Buffer(keys.signPk);
		return publicKey;
	}
});