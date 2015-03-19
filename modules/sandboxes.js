var sandboxHelper = require('../helpers/sandbox/sandbox.js');
var fs = require('fs');
var path = require('path');
var mkdirp = require('mkdirp');
var modules, library, self;

function Sandboxes(cb, scope) {
	library = scope;
	self = this;

	setImmediate(cb, null, self);
}

/**
 * Create new sandbox instance.
 * @param {object=} options Sandbox options
 * @returns {Sandbox} Sandbox instance
 */
Sandboxes.prototype.createSandbox = function(options) {
	return new sandboxHelper(options || {
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
};

Sandboxes.prototype.execTransaction = function (transaction, cb) {
	var sandbox = this.createSandbox();

	// accounts api
	sandbox.api.register({
		accounts : {
			getAccount : modules.accounts.getAccount,
			getAccountByPublicKey : modules.accounts.getAccountByPublicKey,
			getAddressByPublicKey : modules.accounts.getAddressByPublicKey
		}
	});

	sandbox.transaction.exec(transaction, cb);
}

Sandboxes.prototype.execDapp = function(dapp, source, cb) {
	var sandbox = this.createSandbox();

	var baseDir = path.resolve(library.config.dappsDir, String(dapp.id), 'files');

	mkdirp(baseDir, function(err){
		if (err) return cb(err);

		function rewriteBasePath(pathname){
			return path.join(baseDir, path.resolve('/', pathname));
		}

		sandbox.api.register({
			fs : {
				readFile : function(done, filename) {
					fs.readFile(rewriteBasePath(filename), done);
				},
				writeFile : function(done, filename, content) {
					fs.writeFile(rewriteBasePath(filename), content, done);
				}
			}
		});

		sandbox.eval(source, cb);
	});
};

Sandboxes.prototype.onBind = function (scope) {
	modules = scope;
};

module.exports = Sandboxes;