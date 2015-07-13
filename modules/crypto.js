var util = require('util'),
	request = require('request'),
	fs = require('fs'),
	crypto = require('crypto'),
	ed = require('ed25519'),
	encryptHelper = require('../helpers/encrypt.js'),
	sandboxHelper = require('../helpers/sandbox.js');

var modules, library, self, private = {}, shared = {};

private.loaded = false;

shared.keypair = function (data, cb) {
	try {
		var hash = crypto.createHash('sha256').update(data.secret, 'utf8').digest();
		var keypair = ed.MakeKeypair(hash);
	} catch (e) {
		return cb(e);
	}

	return cb(null, keypair);
}

shared.sha256 = function (data, cb) {
	try {
		var buf = new Buffer(data.data, 'utf8');
		var hash = crypto.createHash('sha256').update(buf).toString('utf8');
	} catch (e) {
		return cb(e);
	}

	return cb(null, hash);
}

shared.encryptbox = function (data, cb) {
	library.scheme.validate(data, {
		type: "object",
		properties: {
			secret: {
				type: "string",
				minLength: 1,
				maxLength: 100
			},
			message: {
				type: "string",
				minLength: 1
			}
		},
		required: ["secret", "message"]
	}, function (err) {
		if (err) {
			return cb(err[0].message);
		}

		var hash = crypto.createHash('sha256').update(data.secret, 'utf8').digest();
		var keypair = ed.MakeKeypair(hash);

		var nonce = encryptHelper.getNonce();
		var encrypted = encryptHelper.cryptobox(data.message, nonce, keypair.privateKey);

		return cb(null, {
			nonce: new Buffer(nonce).toString('hex'),
			message: new Buffer(encrypted).toString('hex')
		});
	});
}

shared.decryptbox = function (data, cb) {
	library.scheme.validate(data, {
		type: "object",
		properties: {
			secret: {
				type: "string",
				minLength: 1,
				maxLength: 100
			},
			message: {
				type: "string",
				minLength: 1,
				format: "hex"
			},
			nonce: {
				type: "string",
				minLength: 1,
				format: "hex"
			}
		},
		required: ["secret", "message", "nonce"]
	}, function (err) {
		if (err) {
			return cb(err[0].message);
		}

		var hash = crypto.createHash('sha256').update(data.secret, 'utf8').digest();
		var keypair = ed.MakeKeypair(hash);

		var decrypted = encryptHelper.decrypt_cryptobox(new Buffer(data.message, 'hex'), new Buffer(data.nonce, 'hex'), keypair.privateKey);

		return cb(null, {
			decrypted: new Buffer(decrypted).toString('utf8')
		});
	});
}

//constructor
function Crypto(cb, scope) {
	library = scope;
	self = this;
	self.__private = private;

	setImmediate(cb, null, self);
}

//public methods
Crypto.prototype.sandboxApi = function (call, args, cb) {
	sandboxHelper.callMethod(shared, call, args, cb);
}

//events
Crypto.prototype.onBind = function (scope) {
	modules = scope;
}

Crypto.prototype.onBlockchainReady = function () {
	private.loaded = true;
}

//shared

module.exports = Crypto;