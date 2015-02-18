var sandboxHelper = require('../helpers/sandbox/sandbox.js');

var modules, library, self;

function Sandboxes(cb, scope) {
	library = scope;
	self = this;

	setImmediate(cb, null, self);
}

Sandboxes.prototype.execTransaction = function (transaction, cb) {
	var sandbox = new sandboxHelper({
		plugins : {
			process : {
				limitCpu : 25,
				limitTime : 100,
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
	sandbox.api.register({
		accounts : {
			getAccount : modules.accounts.getAccount,
			getAccountByPublicKey : modules.accounts.getAccountByPublicKey,
			getAddressByPublicKey : modules.accounts.getAddressByPublicKey
		}
	});


	// run script
	sandbox.transaction.exec(transaction, cb);
}

Sandboxes.prototype.onBind = function (scope) {
	modules = scope;
}

module.exports = Sandboxes;