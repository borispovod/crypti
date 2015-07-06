var async = require('async'),
	dappTypes = require('../helpers/dappTypes.js'),
	dappCategory = require('../helpers/dappCategory.js'),
	TransactionTypes = require('../helpers/transaction-types.js'),
	ByteBuffer = require("bytebuffer"),
	fs = require('fs'),
	gift = require('gift'),
	path = require('path');

var modules, library, self, private = {};

private.loading = {};
private.removing = {};
private.unconfirmedNames = {};
private.unconfirmedLinks = {};
private.dappsPath = path.join(process.cwd(), 'dapps');
private.sandboxes = {};
private.routes = {};

private.get = function (id, cb) {
	library.dbLite.query("SELECT name, description, tags, nickname, git, type, category, transactionId FROM dapps WHERE transactionId = $id", ['name', 'description', 'tags', 'nickname', 'git', 'type', 'category', 'transactionId'], {id : id}, function (err, rows) {
		if (err || rows.length == 0) {
			return setImmediate(cb, err? "Sql error" : "DApp not found");
		}

		return setImmediate(cb, null, rows[0]);
	});
}

private.list = function (filter, cb) {
	var sortFields = ['type', 'name', 'category', 'git'];
	var params = {}, fields = [], owner = "";

	if (filter.type >= 0) {
		fields.push('type = $type');
		params.type = filter.type;
	}

	if (filter.name) {
		fields.push('name = $name');
		params.name = filter.name;
	}
	if (filter.category >= 0) {
		fields.push('category = $category');
		params.category = filter.category;
	}
	if (filter.git) {
		fields.push('git = $git');
		params.git = filter.git;
	}

	if (filter.limit >= 0) {
		params.limit = filter.limit;
	}
	if (filter.offset >= 0) {
		params.offset = filter.offset;
	}

	if (filter.orderBy) {
		var sort = filter.orderBy.split(':');
		var sortBy = sort[0].replace(/[^\w_]/gi, '');
		if (sort.length == 2) {
			var sortMethod = sort[1] == 'desc' ? 'desc' : 'asc'
		} else {
			sortMethod = "desc";
		}
	}

	if (sortBy) {
		if (sortFields.indexOf(sortBy) < 0) {
			return cb("Invalid field to sort");
		}
	}


	// need to fix 'or' or 'and' in query
	library.dbLite.query("select name, description, tags, nickname, git, type, category, transactionId " +
		"from trs t " +
		"inner join blocks b on t.blockId = b.id " +
		(fields.length || owner ? "where " : "") + " " +
		(fields.length ? "(" + fields.join(' or ') + ") " : "") + (fields.length && owner ? " and " + owner : owner) + " " +
		(filter.orderBy ? ' order by ' + sortBy + ' ' + sortMethod : '') + " " +
		(filter.limit ? 'limit $limit' : '') + " " +
		(filter.offset ? 'offset $offset' : ''), params, ['name', 'description', 'tags', 'nickname', 'git', 'type', 'category', 'transactionId'], function (err, rows) {
		if (err) {
			return cb(err);
		}

		cb(null, rows);
	});
}

private.createBasePathes = function (cb) {
	fs.exists(private.dappsPath, function (exists) {
		if (exists) {
			return setImmediate(cb);
		} else {
			fs.mkdir(private.dappsPath, cb);
		}
	});
}

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
	var dappPath = path.join(private.dappsPath, dApp.transactionId);

	fs.exists(dappPath, function (exists) {
		if (!exists) {
			return setImmediate(cb, "This dapp not found");
		} else {
			fs.unlink(dappPath, function (err) {
				if (err) {
					return setImmediate(cb, "Problem when removing folder of dapp: " dappPath);
				} else {
					return setImmediate(cb);
				}
			});
		}
	});
}

private.downloadDApp = function (dApp, cb) {
	var dappPath = path.join(private.dappsPath, dApp.transactionId);

	fs.exists(dappPath, function (exists) {
		if (exists) {
			return setImmediate(cb, "This dapp already installed");
		} else {
			fs.mkdir(dappPath, function (err) {
				if (err) {
					return setImmediate(cb, "Can't create folder for dapp: " + dApp.transactionId);
				}

				if (dApp.git) {
					// fetch repo
					gift.clone(dApp.git, dappPath, function (err, repo) {
						if (err) {
							library.logger.error(err.toString());
							return setImmediate(cb, "Git error of cloning repository " + dApp.git + " at " + dApp.transactionId);
						}

						return setImmediate(cb, null, dappPath);
					});
				} else if (dApp.nickname) {
					// fetch from sia
					modules.sia.download(dApp.nickname, dappPath, function (err, dappPath) {
						if (err) {
							return setImmediate(cb, "Failed to fetch ascii code from sia: \n" + dApp.nickname + " \n " + dappPath);
						}

						return setImmediate(cb, null, dappPath);
					});
				}
			});
		}
	});
}

private.launchDApp = function (dApp, cb) {
	setImmediate(cb);
}

function DApp() {
	this.create = function (data, trs) {
		trs.asset.dapp = {
			category: dappCategory[data.category],
			name: data.name,
			description: data.description,
			tags: data.tags,
			type: data.type,
			nickname: data.nickname,
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

		if (!trs.asset.dapp.category) {
			return setImmediate(cb, errorCode("DAPPS.UNKNOWN_CATEGORY"));
		}

		if (trs.asset.dapp.nickname) {
			isSia = true;
			if (!trs.asset.dapp.nickname || trs.asset.dapp.nickname.trim().length == 0) {
				return setImmediate(cb, errorCode("DAPPS.EMTRY_NICKNAME"));
			}
		}

		if (trs.asset.dapp.type > 1) {
			return setImmediate(cb, errorCode("DAPPS.UNKNOWN_TYPE"));
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
			name: trs.asset.dapp.name,
		}, function (err, rows) {
			if (err || rows.length == 0) {
				return setImmediate(cb, "Sql error");
			}

			if (rows[0].count > 0) {
				return setImmediate(cb, errorCode("DAPPS.EXISTS_DAPP_NAME"));
			}

			if (trs.asset.dapp.git) {
				library.dbLite.query("SELECT count(transactionId) FROM dapps WHERE nickname = $nickname", ['count'], {
					nickname: trs.asset.dapp.nickname
				}, function (err, rows) {
					if (err || rows.length == 0) {
						return setImmediate(cb, "Sql error");
					}

					if (rows[0].count > 0) {
						return setImmediate(cb, errorCode("DAPPS.EXISTS_DAPP_ASCII_CODE"));
					}

					return setImmediate(cb);
				});
			} else if (trs.asset.dapp.nickname) {
				library.dbLite.query("SELECT count(transactionId) FROM dapps WHERE git = $git", ['count'], {
					git: trs.asset.dapp.git
				}, function (err, rows) {
					if (err || rows.length == 0) {
						return setImmediate(cb, "Sql error");
					}

					if (rows[0].count > 0) {
						return setImmediate(cb, errorCode("DAPPS.EXISTS_DAPP_GIT"));
					}

					return setImmediate(cb);
				});
			} else {
				return setImmediate(cb, errorCode("DAPPS.INCORRECT_LINK"))
			}
		});
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

			if (trs.asset.dapp.nickname) {
				buf = buf.concat(new Buffer(trs.asset.dapp.nickname, 'utf8'));
			}

			if (trs.asset.dapp.git) {
				buf = buf.concat(new Buffer(trs.asset.dapp.git, 'utf8'));
			}

			var bb = new ByteBuffer(4+4,true);
			bb.writeInt(trs.asset.dapp.type);
			bb.writeInt(trs.asset.dapp.category);
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
				category: {
					type: "integer",
					minimum: 0
				},
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
					minimum: 0
				},
				nickname: {
					type: "string",
					minLength: 1
				},
				git: {
					type: "string",
					maxLength: 2000,
					minLength: 1
				}
			},
			required: ["type", "name", "category"]
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
				nickname: raw.dapp_nickname,
				git: raw.dapp_git,
				category: raw.dapp_category
			}

			return {dapp: dapp};
		}
	}

	this.dbSave = function (trs, cb) {
		library.dbLite.query("INSERT INTO dapps(type, name, description, tags, nickname, git, category, transactionId) VALUES($type, $name, $description, $tags, $nickname, $git, $category, $transactionId)", {
			type: trs.asset.dapp.type,
			name: trs.asset.dapp.name,
			description: trs.asset.dapp.description,
			tags: trs.asset.dapp.tags,
			nickname: trs.asset.dapp.nickname,
			git: trs.asset.dapp.git,
			category: trs.asset.dapp.category,
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

	router.put('/', function (req, res, next) {
		req.sanitize(req.body, {
			type: "object",
			properties: {
				secret: {
					type: "string",
					minLength: 1
				},
				secondSecret: {
					type: "string",
					minLength: 1
				},
				publicKey: {
					type: "string",
					format: "publicKey"
				},
				category: {
					type: "integer",
					minimum: 0
				},
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
					minimum: 0
				},
				nickname: {
					type: "string",
					minLength: 1
				},
				git: {
					type: "string",
					maxLength: 2000,
					minLength: 1
				}
			},
			required: ["secret", "secondSecret", "type", "name", "category"]
		}, function (err, report, body) {
			if (err) return next(err);
			if (!report.isValid) return res.json({success: false, error: report.issues});

			var hash = crypto.createHash('sha256').update(body.secret, 'utf8').digest();
			var keypair = ed.MakeKeypair(hash);

			if (body.publicKey) {
				if (keypair.publicKey.toString('hex') != body.publicKey) {
					return res.json({success: false, error: errorCode("COMMON.INVALID_SECRET_KEY")});
				}
			}

			library.sequence.add(function (cb) {
				modules.accounts.getAccount({publicKey: keypair.publicKey.toString('hex')}, function (err, account) {
					if (err) {
						return cb("Sql error");
					}

					if (!account || !account.publicKey) {
						return cb(errorCode("COMMON.OPEN_ACCOUNT"));
					}

					if (account.secondSignature && !body.secondSecret) {
						return cb(errorCode("COMMON.SECOND_SECRET_KEY"));
					}

					var secondKeypair = null;

					if (account.secondSignature) {
						var secondHash = crypto.createHash('sha256').update(body.secondSecret, 'utf8').digest();
						secondKeypair = ed.MakeKeypair(secondHash);
					}

					var transaction = library.logic.transaction.create({
						type: TransactionTypes.DAPP,
						sender: account,
						keypair: keypair,
						secondKeypair: secondKeypair,
						category: body.category,
						name: body.name,
						description: body.description,
						tags: body.tags,
						type: body.type,
						nickname: body.nickname,
						git: body.git
					});

					modules.transactions.receiveTransactions([transaction], cb);
				});
			}, function (err, transaction) {
				if (err) {
					return res.json({success: false, error: err.toString()});
				}
				res.json({success: true, transaction: transaction[0]});
			});


		});
	});

	router.get('/', function (req, res, next) {
		req.sanitize(req.query, {
			type: "object",
			properties: {
				category: {
					type: "integer",
					minimum: 0
				},
				name: {
					type: "string",
					minLength: 1,
					maxLength: 32
				},
				type: {
					type: "integer",
					minimum: 0
				},
				git: {
					type: "string",
					maxLength: 2000,
					minLength: 1
				},
				limit: {
					type: "integer",
					minimum: 0,
					maximum: 100
				},
				offset: {
					type: "integer",
					minimum: 0
				},
				orderBy: {
					type: "string",
					minLength: 1
				}
			}
		}, function (err, report, query) {
			if (err) return next(err);
			if (!report.isValid) return res.json({success: false, error: report.issues});

			private.list(query, function (err, dapps) {
				if (err) {
					return res.json({success: false, error: errorCode("DAPPS.DAPPS_NOT_FOUND")});
				}

				res.json({success: true, dapps: dapps});
			});
		});
	});

	router.get('/get', function (req, res, next) {
		req.sanitize(req.query, {
			type: "object",
			properties: {
				id: {
					type: 'string',
					minLength: 1
				}
			},
			required: ["id"]
		}, function (err, report, query) {
			if (err) return next(err);
			if (!report.isValid) return res.json({success: false, error: report.issues});

			private.get(query.id, function (err, dapp) {
				if (err) {
					return res.json({success: false, error: err});
				}

				return res.json({success: true, dapp: dapp});
			});
		});
	});

	router.get('/search', function (req, res, next) {
		// search by q and category
	});

	router.post('/install', function (req, res, next) {
		req.sanitize(req.query, {
			type: "object",
			properties: {
				id: {
					type: 'string',
					minLength: 1
				}
			},
			required: ["id"]
		}, function (err, report, query) {
			if (err) return next(err);
			if (!report.isValid) return res.json({success: false, error: report.issues});

			private.get(query.id, function (err, dapp) {
				if (err) {
					return res.json({success: false, error: err});
				}


				if (private.loading[query.id]) {
					return res.json({success: false, error: "This DApp already on downloading"});
				}

				private.loading[query.id] = true;

				private.downloadDApp(dapp, function (err, dappPath) {
					private.loading[query.id] = false;

					if (err) {
						return res.json({success: false, error: err});
					} else {
						return res.json({success: true, path: dappPath});
					}
				});
			});
		});
	});

	router.post('/uninstall', function (req, res, next) {
		req.sanitize(req.query, {
			type: "object",
			properties: {
				id: {
					type: 'string',
					minLength: 1
				}
			},
			required: ["id"]
		}, function (err, report, query) {
			if (err) return next(err);
			if (!report.isValid) return res.json({success: false, error: report.issues});

			private.get(query.id, function (err, dapp) {
				if (err) {
					return res.json({success: false, error: err});
				}

				if (private.removing[query.id]) {
					return res.json({success: true, error: "This DApp already on uninstall"});
				}

				private.removing[query.id] = true;

				// later - first we run uninstall
				private.removeDApp(dapp, function (err) {
					private.removing[query.id] = false;

					if (err) {
						return res.json({success: false, error: err});
					} else {
						return res.json({success: true});
					}
				})
			});


		});
	});

	router.post('/launch', function (req, res, next) {
		// launch dapp
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
	library.logic.transaction.attachAssetType(TransactionTypes.DAPP, new DApp());


	private.createBasePathes(function (err) {
		setImmediate(cb, err, self);
	});
}

DApps.prototype.onBind = function (scope) {
	modules = scope;
}

module.exports = DApps;