var sandboxHelper = require('../helpers/sandbox/sandbox.js');

var modules, library, self;

function Sandboxes(cb, scope) {
	library = scope;
	self = this;

	setImmediate(cb, null, self);
}

Sandboxes.prototype.runTransaction = function (transaction, cb) {
	var sandbox = new Sandbox({
		plugins : {
			process : {
				stdio : 'inherit'
			},
			tcp : true,
			api : {
				transport : 'tcp'
			},
			transaction : true
		}
	});

	// accounts api
	sandbox.api.module({
		accounts : {
			getAccount : modules.accounts.getAccount,
			getAccountByPublicKey : modules.accounts.getAccountByPublicKey,
			getAddressByPublicKey : modules.accounts.getAddressByPublicKey
		}
	});

	sandbox.cpuLimit = 25; // is it in percents?
	sandbox.process.options.limitTime = 100; // is it milliseconds?

	// run script
	sandbox.transaction.exec(transaction, cb);
}

Sandboxes.prototype.onBind = function (scope) {
	modules = scope;
}

module.exports = Sandboxes;