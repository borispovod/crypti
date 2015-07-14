var async = require('async'),
	dappTypes = require('../helpers/dappTypes.js'),
	dappCategory = require('../helpers/dappCategory.js'),
	TransactionTypes = require('../helpers/transaction-types.js'),
	ByteBuffer = require("bytebuffer"),
	fs = require('fs'),
	gift = require('gift'),
	path = require('path'),
	npm = require('npm'),
	slots = require('../helpers/slots.js'),
	Router = require('../helpers/router.js'),
	unzip = require('unzip'),
	crypto = require('crypto'),
	constants = require('../helpers/constants.js'),
	errorCode = require('../helpers/errorCodes.js').error,
	Sandbox = require("crypti-sandbox"),
	ed = require('ed25519'),
	rmdir = require('rimraf'),
	extend = require('extend'),
	sandboxHelper = require('../helpers/sandbox.js');

var modules, library, self, private = {}, shared = {};

private.launched = {};
private.loading = {};
private.removing = {};
private.unconfirmedNames = {};
private.unconfirmedLinks = {};
private.unconfirmedNickNames = {};
private.appPath = process.cwd();
private.dappsPath = path.join(process.cwd(), 'dapps');
private.sandboxes = {};
private.routes = {};

function DApp() {
	this.create = function (data, trs) {
		trs.recipientId = null;
		trs.amount = 0;

		trs.asset.dapp = {
			category: dappCategory[data.category],
			name: data.name,
			description: data.description,
			tags: data.tags,
			type: data.dapp_type,
			nickname: data.nickname,
			git: data.git,
			icon: data.icon
		}

		return trs;
	}

	this.calculateFee = function (trs) {
		return 100 * constants.fixedPoint;
	}

	this.verify = function (trs, sender, cb) {
		var isSia = false;

		if (trs.recipientId) {
			return setImmediate(cb, errorCode("TRANSACTIONS.INVALID_RECIPIENT", trs));
		}

		if (trs.amount != 0) {
			return setImmediate(cb, errorCode("TRANSACTIONS.INVALID_AMOUNT", trs));
		}

		if (trs.asset.dapp.category != 0 && !trs.asset.dapp.category) {
			return setImmediate(cb, errorCode("DAPPS.UNKNOWN_CATEGORY"));
		}

		if (trs.asset.dapp.nickname) {
			isSia = true;
			if (!trs.asset.dapp.nickname || trs.asset.dapp.nickname.trim().length == 0) {
				return setImmediate(cb, errorCode("DAPPS.EMPTY_NICKNAME"));
			}
		}

		if (trs.asset.dapp.type > 1 || trs.asset.dapp.type < 0) {
			return setImmediate(cb, errorCode("DAPPS.UNKNOWN_TYPE"));
		}

		if (trs.asset.dapp.git) {
			if (isSia) {
				return setImmediate(cb, errorCode("DAPPS.GIT_AND_SIA"));
			}

			if (!(/^git\@github\.com\:.+\.git$/.test(trs.asset.dapp.git))) {
				return setImmediate(cb, errorCode("DAPPS.INVALID_GIT"));
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

		setImmediate(cb);
	}

	this.process = function (trs, sender, cb) {
		setImmediate(cb, null, trs);
	}

	this.getBytes = function (trs) {
		try {
			var buf = new Buffer([]);
			var nameBuf = new Buffer(trs.asset.dapp.name, 'utf8');
			buf = Buffer.concat([buf, nameBuf]);

			if (trs.asset.dapp.description) {
				var descriptionBuf = new Buffer(trs.asset.dapp.description, 'utf8');
				buf = Buffer.concat([buf, descriptionBuf]);
			}

			if (trs.asset.dapp.tags) {
				var tagsBuf = new Buffer(trs.asset.dapp.tags, 'utf8');
				buf = Buffer.concat([buf, tagsBuf]);
			}

			if (trs.asset.dapp.nickname) {
				buf = Buffer.concat([buf, new Buffer(trs.asset.dapp.nickname, 'utf8')]);
			}

			if (trs.asset.dapp.git) {
				buf = Buffer.concat([buf, new Buffer(trs.asset.dapp.git, 'utf8')]);
			}

			var bb = new ByteBuffer(4 + 4, true);
			bb.writeInt(trs.asset.dapp.type);
			bb.writeInt(trs.asset.dapp.category);
			bb.flip();

			buf = Buffer.concat([buf, bb.toBuffer()]);
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
		if (private.unconfirmedNames[trs.asset.dapp.name]) {
			setImmediate(cb, "dapp name is exists");
		}
		if (private.unconfirmedLinks[trs.asset.dapp.git]) {
			setImmediate(cb, "dapp link is exists");
		}
		if (private.unconfirmedNickNames[trs.asset.dapp.nickname]) {
			setImmediate(cb, "dapp nickname is exists");
		}
		private.unconfirmedNames[trs.asset.dapp.name] = true;
		private.unconfirmedLinks[trs.asset.dapp.git] = true;
		private.unconfirmedNickNames[trs.asset.dapp.nickname] = true;

		library.dbLite.query("SELECT count(transactionId) FROM dapps WHERE (name = $name or nickname = $nickname or git = $git) and transactionId != $transactionId", {
			name: trs.asset.dapp.name, nickname: trs.asset.dapp.nickname || null, git: trs.asset.dapp.git || null, transactionId : trs.id
		}, ['count'], function (err, rows) {
			if (err || rows.length == 0) {
				return setImmediate(cb, "Sql error");
			}

			if (rows[0].count > 0) {
				return setImmediate(cb, errorCode("DAPPS.EXISTS_DAPP_NAME"));
			}

			return setImmediate(cb, null, trs);
		});
	}

	this.undoUnconfirmed = function (trs, sender, cb) {
		delete private.unconfirmedNames[trs.asset.dapp.name];
		delete private.unconfirmedLinks[trs.asset.dapp.git];
		delete private.unconfirmedNickNames[trs.asset.dapp.nickname];

		setImmediate(cb);
	}

	this.objectNormalize = function (trs) {
		var report = library.scheme.validate(trs.asset.delegate, {
			object: true,
			properties: {
				category: {
					type: "string",
					minLength: 0
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
				},
				icon: {
					type: "string",
					minLength: 1,
					maxLength: 2000
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
		if (!raw.dapp_name) {
			return null;
		} else {
			var dapp = {
				name: raw.dapp_name,
				description: raw.dapp_description,
				tags: raw.dapp_tags,
				type: raw.dapp_type,
				nickname: raw.dapp_nickname,
				git: raw.dapp_git,
				category: raw.dapp_category,
				icon: raw.dapp_icon
			}

			return {dapp: dapp};
		}
	}

	this.dbSave = function (trs, cb) {
		library.dbLite.query("INSERT INTO dapps(type, name, description, tags, nickname, git, category, icon, transactionId) VALUES($type, $name, $description, $tags, $nickname, $git, $category, $icon, $transactionId)", {
			type: trs.asset.dapp.type,
			name: trs.asset.dapp.name,
			description: trs.asset.dapp.description || null,
			tags: trs.asset.dapp.tags || null,
			nickname: trs.asset.dapp.nickname || null,
			git: trs.asset.dapp.git || null,
			icon: trs.asset.dapp.icon || null,
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

//constructor
function DApps(cb, scope) {
	library = scope;
	self = this;
	self.__private = private;
	library.logic.transaction.attachAssetType(TransactionTypes.DAPP, new DApp());
	private.attachApi();

	process.on('exit', function () {
		var keys = Object.keys(private.launched);

		async.eachSeries(keys, function (id, cb) {
			if (!private.launched[id]) {
				return setImmediate(cb);
			}

			self.stop({
				transactionId: id
			}, function (err) {
				cb(err);
			})
		}, function (err) {
			library.logger.error(err);
		});
	});

	private.createBasePathes(function (err) {
		setImmediate(cb, err, self);
	});
}

private.attachApi = function() {
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
					type: "string",
					minLength: 0
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
			required: ["secret", "type", "name", "category"]
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
						dapp_type: body.type,
						nickname: body.nickname,
						git: body.git,
						icon: body.icon
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
		req.sanitize(req.query, {
			type: "object",
			properties: {
				q: {
					type: 'string',
					minLength: 1
				},
				category: {
					type: 'string',
					minLength: 1
				}
			},
			required: ["q"]
		}, function (err, report, query) {
			if (err) return next(err);
			if (!report.isValid) return res.json({success: false, error: report.issues});

			var category = null;

			if (query.category) {
				category = dappCategory[query.category];

				if (category != 0 && !category) {
					return res.json({success: false, error: "Incorrect category"});
				}
			}

			library.dbLite.query("CREATE VIRTUAL TABLE IF NOT EXISTS dapps_search USING fts4(content=dapps, name, description, tags)", function (err, rows) {
				if (err) {
					library.logger.error(err);
					return res.json({success: false, error: "Sql error, check logs"});
				} else {
					//INSERT INTO t3(docid, b, c) SELECT id, b, c FROM t2;

					library.dbLite.query("INSERT OR IGNORE INTO dapps_search(docid, name, description, tags) SELECT rowid, name, description, tags FROM dapps", function (err, rows) {
						if (err) {
							library.logger.error(err);
							return res.json({success: false, error: "Sql error, check logs"})
						} else {
							library.dbLite.query("SELECT rowid FROM dapps_search WHERE dapps_search MATCH $q", {q: query.q + "*"}, function (err, rows) {
								if (err) {
									library.logger.error(err);
									return res.json({success: false, error: "Sql error, check logs"});
								} else if (rows.length > 0) {
									var categorySql = "";

									if (category === 0 || category > 0) {
										categorySql = " AND category = $category"
									}

									library.dbLite.query("SELECT transactionId, name, description, tags, nickname, git, type, category FROM dapps WHERE rowid IN (" + rows.join(',') + ")" + categorySql, {category: category}, {
										'transactionId': String,
										'name': String,
										'description': String,
										'tags': String,
										'nickname': String,
										'git': String,
										'type': Number,
										'category': Number
									}, function (err, rows) {
										if (err) {
											library.logger.error(err);
											return res.json({success: false, error: "Sql error, check logs"});
										} else {
											return res.json({success: true, dapps: rows});
										}
									});
								} else {
									return res.json({success: true, dapps: []});
								}
							})
						}
					});
				}
			});
		});
	});

	router.post('/install', function (req, res, next) {
		req.sanitize(req.body, {
			type: "object",
			properties: {
				id: {
					type: 'string',
					minLength: 1
				}
			},
			required: ["id"]
		}, function (err, report, body) {
			if (err) return next(err);
			if (!report.isValid) return res.json({success: false, error: report.issues});

			private.get(body.id, function (err, dapp) {
				if (err) {
					return res.json({success: false, error: err});
				}

				// check that dapp already installed here in feature
				if (private.removing[body.id] || private.loading[body.id]) {
					return res.json({success: false, error: "This DApp already on downloading/removing"});
				}

				private.loading[body.id] = true;

				private.downloadDApp(dapp, function (err, dappPath) {
					if (err) {
						return res.json({success: false, error: err});
					} else {
						if (dapp.type == 0) {
							private.installDependencies(dapp, function (err) {
								if (err) {
									library.logger.error(err);
									private.removing[body.id] = true;
									private.removeDApp(dapp, function (err) {
										private.removing[body.id] = false;

										if (err) {
											library.logger.error(err);
										}

										private.loading[body.id] = false;
										return res.json({
											success: false,
											error: "Can't install DApp dependencies, check logs"
										});
									});
								} else {
									private.loading[body.id] = false;
									return res.json({success: true, path: dappPath});
								}
							})
						} else {
							private.loading[body.id] = false;
							return res.json({success: true, path: dappPath});
						}
					}
				});
			});
		});
	});

	router.get('/installed', function (req, res, next) {
		private.getInstalled(function (err, files) {
			if (err) {
				library.logger.error(err);
				return res.json({success: false, error: "Can't get installed dapps, see logs"});
			}

			return res.json({success: true, files: files});
		})
	});

	router.post('/uninstall', function (req, res, next) {
		req.sanitize(req.body, {
			type: "object",
			properties: {
				id: {
					type: 'string',
					minLength: 1
				}
			},
			required: ["id"]
		}, function (err, report, body) {
			if (err) return next(err);
			if (!report.isValid) return res.json({success: false, error: report.issues});

			private.get(body.id, function (err, dapp) {
				if (err) {
					return res.json({success: false, error: err});
				}

				if (private.removing[body.id] || private.loading[body.id]) {
					return res.json({success: true, error: "This DApp already on uninstall/loading"});
				}

				private.removing[body.id] = true;

				// later - first we run uninstall
				private.removeDApp(dapp, function (err) {
					private.removing[body.id] = false;

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
		req.sanitize(req.body, {
			type: "object",
			properties: {
				id: {
					type: 'string',
					minLength: 1
				}
			},
			required: ["id"]
		}, function (err, report, body) {
			if (err) return next(err);
			if (!report.isValid) return res.json({success: false, error: report.issues});

			if (private.launched[body.id]) {
				return res.json({success: false, error: "DApp already launched"});
			}

			private.launched[body.id] = true;

			private.get(body.id, function (err, dapp) {
				if (err) {
					private.launched[body.id] = false;
					library.logger.error(err);
					return res.json({success: false, error: "Can't find dapp"});
				} else {
					private.getInstalled(function (err, files) {
						if (err) {
							private.launched[body.id] = false;
							library.logger.error(err);
							return res.json({success: false, error: "Can't get installed dapps"});
						} else {
							if (files.indexOf(body.id) >= 0) {
								private.symlink(dapp, function (err) {
									if (err) {
										private.launched[body.id] = false;
										library.logger.error(err);
										return res.json({
											success: false,
											error: "Can't create public link for: " + body.id
										});
									} else {
										private.launch(dapp, function (err) {
											if (err) {
												private.launched[body.id] = false;
												library.logger.error(err);
												return res.json({
													success: false,
													error: "Can't launch dapp, see logs: " + body.id
												});
											} else {
												private.dappRoutes(dapp, function (err) {
													if (err) {
														private.launched[body.id] = false;
														library.logger.error(err);
														private.stop(dapp, function (err) {
															if (err) {
																library.logger.error(err);
																return res.json({
																	success: false,
																	error: "Can't stop dapp, check logs: " + body.id
																})
															}

															return res.json({success: false});
														});
													} else {
														return res.json({success: true});
													}
												});
											}
										});
									}
								});
							} else {
								private.launched[body.id] = false;
								return res.json({success: false, error: "DApp didn't installed"});
							}
						}
					});
				}
			});
		});
	});

	router.post('/stop', function (req, res, next) {
		req.sanitize(req.body, {
			type: "object",
			properties: {
				id: {
					type: 'string',
					minLength: 1
				}
			},
			required: ["id"]
		}, function (err, report, body) {
			if (err) return next(err);
			if (!report.isValid) return res.json({success: false, error: report.issues});

			if (!private.launched[body.id]) {
				return res.json({success: false, error: "DApp not launched"});
			}

			private.get(body.id, function (err, dapp) {
				if (err) {
					library.logger.error(err);
					return res.json({success: false, error: "Can't find dapp"});
				} else {
					private.stop(dapp, function (err) {
						if (err) {
							library.logger.error(err);
							return res.json({success: false, error: "Can't stop dapp, check logs"});
						} else {
							private.launched[body.id] = false;
							return res.json({success: true});
						}
					});
				}
			});
		});
	});

	library.network.app.use('/api/dapps', router);
	library.network.app.use(function (err, req, res, next) {
		if (!err) return next();
		library.logger.error(req.url, err.toString());
		res.status(500).send({success: false, error: err.toString()});
	});
}

//private methods
private.get = function (id, cb) {
	library.dbLite.query("SELECT name, description, tags, nickname, git, type, category, transactionId FROM dapps WHERE transactionId = $id", {id: id}, ['name', 'description', 'tags', 'nickname', 'git', 'type', 'category', 'transactionId'], function (err, rows) {
		if (err || rows.length == 0) {
			return setImmediate(cb, err ? "Sql error" : "DApp not found");
		}

		return setImmediate(cb, null, rows[0]);
	});
}

private.list = function (filter, cb) {
	var sortFields = ['type', 'name', 'category', 'git'];
	var params = {}, fields = [];

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
		"from dapps " +
		(fields.length ? "where " + fields.join(' or ') + " " : "") +
		(filter.orderBy ? 'order by ' + sortBy + ' ' + sortMethod : '') + " " +
		(filter.limit ? 'limit $limit' : '') + " " +
		(filter.offset ? 'offset $offset' : ''), params, ['name', 'description', 'tags', 'nickname', 'git', 'type', 'category', 'transactionId'], function (err, rows) {
		if (err) {
			return cb(err);
		}

		cb(null, rows);
	});
}

private.createBasePathes = function (cb) {
	async.series([
		function (cb) {
			fs.exists(private.dappsPath, function (exists) {
				if (exists) {
					return setImmediate(cb);
				} else {
					fs.mkdir(private.dappsPath, cb);
				}
			});
		},
		function (cb) {
			var dappsPublic = path.join(private.appPath, 'public', 'dapps')
			fs.exists(dappsPublic, function (exists) {
				if (exists) {
					return setImmediate(cb);
				} else {
					fs.mkdir(dappsPublic, cb);
				}
			});
		}
	], function (err) {
		return setImmediate(cb, err);
	});
}

private.installDependencies = function (dApp, cb) {
	var dappPath = path.join(private.dappsPath, dApp.transactionId);

	var packageJson = path.join(dappPath, "package.json");
	var config = null;

	try {
		config = JSON.parse(fs.readFileSync(packageJson));
	} catch (e) {
		return setImmediate(cb, "Incorrect package.json file for " + id + " DApp");
	}

	npm.load(config, function (err) {
		if (err) {
			return setImmediate(cb, err);
		}

		npm.root = path.join(dappPath, "node_modules");
		npm.prefix = dappPath;

		npm.commands.install(function (err, data) {
			if (err) {
				setImmediate(cb, err);
			} else {
				return setImmediate(cb, null);
			}
		});
	});
}

private.getInstalled = function (cb) {
	fs.readdir(private.dappsPath, function (err, files) {
		if (err) {
			return setImmediate(cb, err);
		}

		setImmediate(cb, null, files);
	});
}

private.removeDApp = function (dApp, cb) {
	var dappPath = path.join(private.dappsPath, dApp.transactionId);

	fs.exists(dappPath, function (exists) {
		if (!exists) {
			return setImmediate(cb, "This dapp not found");
		} else {
			rmdir(dappPath, function (err) {
				if (err) {
					return setImmediate(cb, "Problem when removing folder of dapp: ", dappPath);
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

							rmdir(dappPath, function (err) {
								if (err) {
									library.logger.error(err.toString());
								}

								return setImmediate(cb, "Git error of cloning repository " + dApp.git + " at " + dApp.transactionId);
							});
						} else {
							return setImmediate(cb, null, dappPath);
						}
					});
				} else if (dApp.nickname) {
					var dappZip = path.joind(dappPath, dApp.id + ".zip");

					// fetch from sia
					modules.sia.download(dApp.nickname, dappZip, function (err, dappZip) {
						if (err) {
							library.logger.error(err);

							rmdir(dappPath, function (err) {
								if (err) {
									library.logger.error(err);
								}

								return setImmediate(cb, "Failed to fetch ascii code from sia: \n" + dApp.nickname + " \n " + dappPath);
							});
						} else {
							fs.createReadStream(dappZip).pipe(unzip.Extract({path: dappPath})).on('end', function () {
								fs.unlink(dappZip, function (err) {
									if (err) {
										return setImmediate(cb, "Can't remove zip file of app: " + dappZip);
									} else {
										return setImmediate(cb, null, dappPath);
									}
								});
							}).on('error', function (err) {
								library.logger.error(err);

								fs.unlink(dappZip, function (err) {
									if (err) {
										library.logger.error(err);
									}

									rmdir(dappPath, function (err) {
										if (err) {
											library.logger.error(err);
										}

										return setImmediate(cb, "Can't unzip file of app: " + dappZip);
									});
								});
							})
						}
					});
				}
			});
		}
	});
}

private.symlink = function (dApp, cb) {
	var dappPath = path.join(private.dappsPath, dApp.transactionId);
	var dappPublicPath = path.join(dappPath, "public");
	var dappPublicLink = path.join(private.appPath, "public", "dapps", dApp.transactionId);

	fs.exists(dappPublicLink, function (exists) {
		if (exists) {
			return setImmediate(cb);
		} else {
			fs.symlink(dappPublicPath, dappPublicLink, cb);
		}
	});
}

private.apiHandler = function (message, callback) {
	// get all modules
	try {
		var strs = message.call.split('#');
		var module = strs[0], call = strs[1];

		if (!modules[module]) {
			return setImmediate(callback, "Incorrect module in call: " + message.call);
		}

		if (!modules[module].sandboxApi) {
			return setImmediate(callback, "This module doesn't have sandbox api");
		}

		modules[module].sandboxApi(call, message.args, callback);
	} catch (e) {
		console.log(e);
		return setImmediate(callback, "Incorrect call");
	}
}

private.dappRoutes = function (dapp, cb) {
	var dappPath = path.join(private.dappsPath, dapp.transactionId);
	var dappRoutesPath = path.join(dappPath, "routes.json");

	fs.exists(dappRoutesPath, function (exists) {
		if (exists) {
			try {
				var routes = require(dappRoutesPath);
			} catch (e) {
				return setImmediate(cb, "Can't connect to api of DApp " + dapp.transactionId + " , routes file not found");
			}

			private.routes[dapp.transactionId] = new Router();

			routes.forEach(function (router) {
				if (router.method == "get" || router.method == "post" || router.method == "put") {
					private.routes[dapp.transactionId][router.method](router.path, function (req, res) {
						private.sandboxes[dapp.transactionId].sendMessage({
							method: router.method,
							path: router.path,
							query: (router.method == "get") ? req.query : req.body
						}, function (err, body) {
							if (!err && body.error) {
								err = body.error;
							}

							body = ((err || typeof body != "object") ? {error: err} : body);
							var resultBody = extend(body, {success: !err});
							res.json(resultBody);
						});
					});
				}
			});

			library.network.app.use('/api/dapps/' + dapp.transactionId + '/api/', private.routes[dapp.transactionId]);
			library.network.app.use(function (err, req, res, next) {
				if (!err) return next();
				library.logger.error(req.url, err.toString());
				res.status(500).send({success: false, error: err.toString()});
			});

			return setImmediate(cb);
		} else {
			return setImmediate(cb);
		}
	});
}

private.launch = function (dApp, cb) {
	var dappPath = path.join(private.dappsPath, dApp.transactionId);
	var dappPublicPath = path.join(dappPath, "public");
	var dappPublicLink = path.join(private.appPath, "public", "dapps", dApp.transactionId);

	try {
		var dappConfig = require(path.join(dappPath, "config.json"));
	} catch (e) {
		return setImmediate(cb, "This DApp has no config file, can't launch it");
	}

	//dappConfig.db
	modules.sql.createTables(dApp.transactionId, dappConfig.db, function (err) {
		if (err) {
			return setImmediate(err);
		}

		var sandbox = new Sandbox(path.join(dappPath, "index.js"), dApp.transactionId, private.apiHandler, true);
		private.sandboxes[dApp.transactionId] = sandbox;

		sandbox.on("exit", function () {
			library.logger.info("DApp " + id + " closed");
			private.stop(dApp, function (err) {
				if (err) {
					library.logger.error("Error on stop dapp: " + err);
				}
			});
		});

		sandbox.on("error", function (err) {
			library.logger.info("Error in DApp " + id + " " + err.toString());
			private.stop(dApp, function (err) {
				if (err) {
					library.logger.error("Error on stop dapp: " + err);
				}
			});
		});

		sandbox.run();

		return setImmediate(cb);
	});
}

private.stop = function (dApp, cb) {
	var dappPath = path.join(private.appPath, dApp.transactionId);
	var dappPublicLink = path.join(private.appPath, "public", "dapps", dApp.transactionId);

	try {
		var dappConfig = require(path.join(dappPath, 'config.json'));
	} catch (e) {
		return setImmediate("Can't parse dapp config");
	}

	async.series([
		function (cb) {
			modules.sql.dropTables(dApp.transactionId, dappConfig.db, cb);
		},
		function (cb) {
			fs.exists(dappPublicLink, function (exists) {
				if (exists) {
					// rm
					return setImmediate(cb);
				} else {
					setImmediate(cb);
				}
			});
		},
		function (cb) {
			delete private.sandboxes[dApp.transactionId];
			setImmediate(cb)
		},
		function (cb) {
			delete private.routes[dApp.transactionId];
			setImmediate(cb);
		}
	], function (err) {
		return setImmediate(cb, err);
	});
}

//public methods
DApps.prototype.sandboxApi = function (call, args, cb) {
	sandboxHelper.callMethod(shared, call, args, cb);
}

//events
DApps.prototype.onBind = function (scope) {
	modules = scope;
}

//shared

module.exports = DApps;