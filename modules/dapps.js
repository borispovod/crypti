var async = require('async'),
	dappTypes = require('../helpers/dappTypes.js'),
	ByteBuffer = require("bytebuffer");

var modules, library, self, private = {};

private.unconfirmedNames = {};
private.unconfirmedLinks = {};
private.appPath = process.cwd();
private.sandboxes = {};
private.routes = {};

private.installDependencies = function (dApp, cb) {
	setImmediate(cb);
}

private.uninstallDApp = function (dApp, cb) {
	setImmediate(cb);
}

private.installDApp = function (dApp, cb) {
	setImmediate(cb);
}

private.removeDApp = function (dApp, cb) {
	setImmediate(cb);
}

private.downloadDApp = function (dApp, cb) {
	setImmediate(cb);
}

private.launchDApp = function (dApp, cb) {
	setImmediate(cb);
}

function DApp() {
	this.create = function (data, trs) {
		trs.asset.dapp = {
			name: data.name,
			description: data.description,
			tags: data.tags,
			type: data.type,
			asciiCode: data.asciiCode,
			git: data.git
		}

		return trs;
	}

	this.calculateFee = function (trs) {
		return 100 * constants.fixedPoint;
	}

	this.verify = function (trs, sender, cb) {
		var isSia = false;

		if (trs.recipientId != null) {
			return setImmediate(cb, errorCode("TRANSACTIONS.INVALID_RECIPIENT", trs));
		}

		if (trs.amount != 0) {
			return setImmediate(cb, errorCode("TRANSACTIONS.INVALID_AMOUNT", trs));
		}

		if (trs.asset.dapp.asciiCode) {
			isSia = true;
			if (!trs.asset.dapp.asciiCode || trs.asset.dapp.asciiCode.trim().length == 0) {
				return setImmediate(cb, errorCode("DAPPS.EMTRY_ASCII"));
			}
		}

		if (trs.asset.dapp.git) {
			if (isSia) {
				return setImmediate(cb, errorCode("DAPPS.GIT_AND_SIA"));
			}

			if (!(/^git\@git.com\:.+.git$/.test(trs.asset.dapp.git))) {
				return setImmediate(cb, erroCode("DAPPS.INVALID_GIT"));
			}
		}

		if (!trs.asset.dapp.name || trs.asset.dapp.name.trim().length == 0) {
			return setImmediate(cb, errorCode("DAPPS.EMPTY_NAME"));
		}

		if (trs.asset.dapp.name.length > 32) {
			return setImmediate(cb, errorCode("DAPPS.TOO_LONG_NAME"));
		}

		if (trs.asset.dapp.description && trs.asset.dapp.description.length > 160) {
			return setImmediate(cb, errorCode("DAPPS.TOO_LONG_DESCRIPTION"));
		}

		if (trs.asset.dapp.tags && trs.asset.dapp.tags.length > 160) {
			return setImmediate(cb, errorCode("DAPPS.TOO_LONG_TAGS"));
		}

		library.dbLite.query("SELECT count(transactionId) FROM dapps WHERE name = $name", ['count'], {
			name: trs.asset.dapp.name
		}, function (err, rows) {
			if (err || rows.length == 0) {
				return setImmediate(cb, "Sql error");
			}

			if (rows[0].count > 0) {
				return setImmediate(cb, errorCode("DAPPS.EXISTS_DAPP"));
			}

			return setImmediate(cb);
		})
	}


	this.process = function (trs, sender, cb) {
		setImmediate(cb, null, trs);
	}


	this.getBytes = function (trs) {
		try {
			var buf = new Buffer();
			var nameBuf = new Buffer(trs.asset.dapp.name, 'utf8');
			buf = buf.concat(nameBuf);

			if (trs.asset.dapp.description) {
				var descriptionBuf = new Buffer(trs.asset.dapp.description, 'utf8');
				buf = buf.concat(descriptionBuf);
			}

			if (trs.asset.dapp.tags) {
				var tagsBuf = new Buffer(trs.asset.dapp.tags, 'utf8');
				buf = buf.concat(tagsBuf);
			}

			if (trs.asset.dapp.asciiCode) {
				buf = buf.concat(new Buffer(trs.asset.dapp.asciiCode, 'utf8'));
			}

			if (trs.asset.dapp.git) {
				buf = buf.concat(new Buffer(trs.asset.dapp.git, 'utf8'));
			}

			var bb = new ByteBuffer(4, true);
			bb.writeInt(trs.asset.dapp.type);
			bb.flip();

			buf = buf.concat(bb.toBuffer());
		} catch (e) {
			throw Error(e.toString());
		}

		return buf;
	}

	this.apply = function (trs, sender, cb) {
		setImmediate(cb);
	}

	this.undo = function (trs, sender, cb) {
		setImmediate(cb);
	}

	this.applyUnconfirmed = function (trs, sender, cb) {
		setImmediate(cb);
	}

	this.undoUnconfirmed = function (trs, sender, cb) {
		setImmediate(cb);
	}

	this.objectNormalize = function (trs) {
		var report = library.scheme.validate(trs.asset.delegate, {
			object: true,
			properties: {
				name: {
					type: "string",
					minLength: 1,
					maxLength: 32
				},
				description: {
					type: "string",
					minLength: 0,
					maxLength: 160
				},
				tags: {
					type: "string",
					minLength: 0,
					maxLength: 160
				},
				type: {
					type: "integer",
					minimum: 0,
					maximum: 1
				},
				asciiCode: {
					type: "string",
					minLength: 1
				},
				git: {
					type: "string",
					maxLength: 2000,
					minLength: 1
				}
			},
			required: ["type", "name"]
		});

		if (!report) {
			throw Error("Can't verify dapp transaction, incorrect parameters: " + library.scheme.getLastError());
		}

		return trs;
	}

	this.dbRead = function (raw) {
		if (!raw.dapp_type) {
			return null;
		} else {
			var dapp = {
				name: raw.dapp_name,
				description: raw.dapp_description,
				tags: raw.dapp_tags,
				type: raw.dapp_type,
				asciiCode: raw.dapp_asciiCode,
				git: raw.dapp_git
			}

			return {dapp: dapp};
		}
	}

	this.dbSave = function (trs, cb) {
		library.dbLite.query("INSERT INTO dapps(type, name, description, tags, asciiCode, git, transactionId) VALUES($type, $name, $description, $tags, $asciiCode, $git, $transactionId)", {
			type: trs.asset.dapp.type,
			name: trs.asset.dapp.name,
			description: trs.asset.dapp.description,
			tags: trs.asset.dapp.tags,
			asciiCode: trs.asset.dapp.asciiCode,
			git: trs.asset.dapp.git,
			transactionId: trs.id
		}, cb);
	}

	this.ready = function (trs, sender) {
		if (sender.multisignatures.length) {
			if (!trs.signatures) {
				return false;
			}
			return trs.signatures.length >= sender.multimin;
		} else {
			return true;
		}
	}
}

function attachApi() {
	var router = new Router();

	router.use(function (req, res, next) {
		if (modules) return next();
		res.status(500).send({success: false, error: errorCode('COMMON.LOADING')});
	});

	library.network.app.use('/api/dapps', router);
	library.network.app.use(function (err, req, res, next) {
		if (!err) return next();
		library.logger.error(req.url, err.toString());
		res.status(500).send({success: false, error: err.toString()});
	});
}

function DApps(cb, scope) {
	library = scope;
	self = this;
	self.__private = private;
	attachApi();

	private.createBasePathes();

	library.logic.transaction.attachAssetType(TransactionTypes.DAPP, new DApp());

	setImmediate(cb, null, self);
}

DApps.prototype.onBind = function (scope) {
	modules = scope;
}

module.exports = DApps;